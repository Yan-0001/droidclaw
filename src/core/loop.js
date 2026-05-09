'use strict';
/**
 * LOOP — Main Agent Loop
 *
 * Uses EXECUTOR for real task verification.
 * Uses MIND instead of state.js for counters.
 * One truth throughout.
 */

const engine    = require('./engine');
const executor  = require('./executor');
const nexus     = require('./nexus');
const mind      = require('./mind');
const heartbeat = require('./heartbeat');

const MAX_ITER        = 5;
const BACKGROUND_EVERY = 20; // only update docs every 20 turns — not every 5

async function maybeReflect() {
  if (!mind.shouldReflect()) return;
  try {
    mind.markReflected();
    const history = mind.getConversationHistory(null, 20)
      .map(c => `${c.role}: ${c.content}`).join('\n');
    const current = require('../workspace').read('HEARTBEAT') || '';
    const r = await engine.rawChat(
      `You are Kira. Reflect on recent conversations.\n\n${history}\n\nWrite a short honest journal entry. No report format.`
    );
    if (r && r.length > 50) {
      const clean = r.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      require('../workspace').write('HEARTBEAT', current + `\n\n--- ${new Date().toLocaleDateString()} ---\n${clean}`);
    }
  } catch {}
}

class AgentLoop {
  constructor() {
    this._controller  = null;
    this._turnCount   = 0;
    this._saving      = false;
  }

  abort() {
    if (this._controller) {
      this._controller.abort();
      this._controller = null;
      return true;
    }
    return false;
  }

  _backgroundSave() {
    if (this._saving) return;
    this._saving = true;
    setImmediate(async () => {
      try { await require('./soul').updateDocs(engine); } catch {}
      this._saving = false;
    });
  }

  async run(userMessage, onThink, onToken, onTool, onReply) {
    let iter = 0;

    nexus.pulse(userMessage, 'user');

    onThink && onThink();

    let fullText = await this._streamTurn(userMessage, onToken);
    if (fullText === null) { onReply && onReply('', true); return; }

    const clean = _cleanOutput(fullText);
    let tools   = executor.parseTools(clean);
    let reply   = executor.cleanReply(clean);

    // empty reply — retry once
    if (!reply.trim() && tools.length === 0) {
      fullText = await this._streamTurn('respond to the last message. even one word is fine.', onToken);
      if (fullText === null) { onReply && onReply('', true); return; }
      const clean2 = _cleanOutput(fullText);
      tools = executor.parseTools(clean2);
      reply = executor.cleanReply(clean2);
    }

    // no tools — pure conversation
    if (tools.length === 0) {
      heartbeat.tick();
      mind.incrementConversations();
      mind.recordSuccess();
      onReply && onReply(reply, false);
      nexus.pulse(reply, 'assistant');
      this._turnCount++;
      if (this._turnCount % BACKGROUND_EVERY === 0) this._backgroundSave();
      maybeReflect();
      return;
    }

    // tool execution — use EXECUTOR for verification
    while (tools.length > 0 && iter < MAX_ITER) {
      iter++;

      const taskDesc       = reply || userMessage;
      const successCondition = executor.inferSuccessCondition(tools);

      const { succeeded, lastResult } = await executor.execute(
        taskDesc,
        tools,
        successCondition,
        (name, args, result) => { onTool && onTool(name, args, result); }
      );

      if (succeeded) mind.recordSuccess();
      else           mind.recordFailure();

      // update context for the next turn
      engine.history.push({ role: 'user', content: `[execution result]: ${lastResult}\nrespond now.` });
      onThink && onThink();

      fullText = await this._streamTurn('', onToken);
      if (fullText === null) { onReply && onReply('', true); return; }

      const cleanFull = _cleanOutput(fullText);
      // remove the previous [execution result] to prevent history bloat
      if (engine.history.length > 0) {
        const last = engine.history[engine.history.length - 1];
        if (last.content.startsWith('[execution result]')) {
          engine.history.pop();
        }
      }
      tools = executor.parseTools(cleanFull);
      reply = executor.cleanReply(cleanFull);
    }

    if (iter >= MAX_ITER && !reply) reply = 'hit the limit — something got stuck.';

    heartbeat.tick();
    mind.incrementConversations();
    onReply && onReply(reply, false);
    nexus.pulse(reply, 'assistant');
    this._turnCount++;
    if (this._turnCount % BACKGROUND_EVERY === 0) this._backgroundSave();
    maybeReflect();
  }

  _streamTurn(message, onToken) {
    return new Promise((resolve) => {
      this._controller = engine.chatStream(
        message,
        (token) => { onToken && onToken(token); },
        (fullText) => { this._controller = null; resolve(fullText); }
      );
    });
  }
}

function _cleanOutput(text) {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

module.exports = new AgentLoop();