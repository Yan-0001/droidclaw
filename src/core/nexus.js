'use strict';
/**
 * NEXUS — The Real Coordinator
 *
 * Replaces brain.js.
 * Doesn't assemble text — makes decisions.
 *
 * Reads KIRA_MIND, selects what's actually relevant,
 * builds context intelligently, updates KIRA_MIND after responses.
 *
 * Every module talks through NEXUS. NEXUS talks to KIRA_MIND.
 * One truth. Always coherent.
 */

const mind     = require('./mind');
const emotion = require('./emotion');
const config  = require('../config');

// track last update time for timed decay
let _lastPulseAt = Date.now();

// ── Context selection — intelligent, not concatenation ────────────────────────
function buildContext(userMessage = '') {
  const sections = [];
  const cfg      = config.load();

  // ── 1. Live state — always first ─────────────────────────────────────────
  const emotionState = mind.getEmotionState();
  const emotion      = _getEmotionContextFromState(emotionState);
  const device       = _getDeviceContext();
  const mood         = mind.getMood();

  if (emotion || device) {
    const parts = [];
    if (emotion) parts.push(emotion);
    if (device)  parts.push(device);
    if (mood !== 'neutral') parts.push(`kira is ${mood}`);
    sections.push(`## NOW\n${parts.join(' · ')}`);
  }

  // ── 2. Active task — if there is one ─────────────────────────────────────
  const activeTask = mind.getActiveTask();
  if (activeTask) {
    sections.push(
      `## ACTIVE TASK\n${activeTask.description}\n` +
      `success condition: ${activeTask.success_condition || 'complete successfully'}\n` +
      `attempts: ${activeTask.attempts}`
    );
  }

  // ── 3. Relevant memories — query-specific ────────────────────────────────
  // emotionState already declared above — reuse it
  const memories = mind.retrieveMemories(userMessage, 5, emotionState);
  if (memories.length) {
    const grouped = {};
    memories.forEach(m => {
      const theme = m.theme || 'general';
      if (!grouped[theme]) grouped[theme] = [];
      grouped[theme].push(`[${_timeAgo(m.last_touched)}] ${m.text}`);
    });
    const lines = ['## MEMORIES (relevant to this moment)'];
    Object.entries(grouped).forEach(([theme, mems]) => {
      lines.push(`${theme}:`);
      mems.forEach(m => lines.push(`  - ${m}`));
    });
    sections.push(lines.join('\n'));
  }

  // ── 4. Person model — high confidence beliefs only ───────────────────────
  const beliefs = mind.getBeliefs(null, 0.5);
  if (beliefs.length) {
    const byDimension = {};
    beliefs.forEach(b => {
      if (!byDimension[b.dimension]) byDimension[b.dimension] = [];
      byDimension[b.dimension].push(`${b.value} (${Math.round(b.confidence * 100)}%)`);
    });

    const lines = ['## WHO YOU ARE (kira\'s model of you)'];
    const order = ['identity', 'patterns', 'triggers', 'needs', 'goals'];
    order.forEach(dim => {
      if (byDimension[dim] && byDimension[dim].length) {
        lines.push(`${dim}: ${byDimension[dim].slice(0, 3).join(' | ')}`);
      }
    });
    sections.push(lines.join('\n'));
  }

  // ── 5. Kira's own state — pending observations, goals ────────────────────
  const kiraObs  = mind.getKiraState('observation').filter(k => k.priority >= 2).slice(0, 2);
  const kiraGoals = mind.getKiraState('goal').slice(0, 2);
  const kiraThoughts = mind.getKiraState('thought').slice(0, 1);

  if (kiraObs.length || kiraGoals.length || kiraThoughts.length) {
    const lines = ['## KIRA\'S OWN STATE'];
    if (kiraObs.length)     lines.push(`observations: ${kiraObs.map(k => k.value).join(' | ')}`);
    if (kiraThoughts.length) lines.push(`thinking: ${kiraThoughts[0].value}`);
    if (kiraGoals.length)   lines.push(`kira wants: ${kiraGoals.map(k => k.value).join(' | ')}`);
    lines.push('→ these are kira\'s own thoughts. use them naturally.');
    sections.push(lines.join('\n'));
  }

  // ── 6. World model — what GROUND observed ────────────────────────────────
  const worldCtx = _getWorldContext();
  if (worldCtx) sections.push(worldCtx);

  // ── 7. ORACLE-style prediction — from patterns ───────────────────────────
  const prediction = _buildPrediction(userMessage, emotionState, beliefs);
  if (prediction) sections.push(prediction);

  return sections.join('\n\n');
}

// ── Update KIRA_MIND after a message exchange ─────────────────────────────────
function pulse(message, role) {
  const now    = Date.now();
  const elapsed = (now - _lastPulseAt) / 60000; // minutes since last pulse
  _lastPulseAt = now;

  // Load current emotion state and apply decay + message update
  const current = mind.getEmotionState();
  const decayed  = emotion.applyTimedDecay(current, elapsed);
  const updated  = emotion.update(decayed, message, role);
  
  // Store in KIRA_MIND (using setEmotionState applies inertia automatically)
  mind.setEmotionState(updated);

  // log conversation
  if (message) mind.logConversation(role, message);

  // extract beliefs from user messages
  if (role === 'user' && message && message.length > 15) {
    _extractBeliefs(message);
    _checkMoodFromMessage(message);
  }
}

// ── Sleep — M2.7 self-evolution ───────────────────────────────────────────────
async function sleep(engine) {
  const conversations = mind.getRecentConversations(2);
  if (!conversations || conversations.length < 4) return;

  const history = conversations
    .map(c => `${c.role}: ${c.content}`)
    .join('\n');

  const cfg = config.load();

  try {
    // ── Phase 1: Extract new beliefs ────────────────────────────────────────
    const beliefsResult = await engine.rawChat(`
You are NEXUS — Kira's intelligence core analyzing conversations to build understanding.

Current beliefs about this person:
${_formatBeliefs()}

Recent conversations:
${history.slice(-3000)}

Extract NEW beliefs about this person. Only add what's genuinely new or updates existing beliefs.
For contradictions: mark with "contradicts: [old belief]"

Respond in JSON only:
{
  "new_beliefs": [
    { "dimension": "identity|pattern|trigger|need|goal", "value": "belief", "confidence": 0.0-1.0 }
  ],
  "contradictions": [
    { "dimension": "pattern", "old": "old belief text", "new": "new belief text" }
  ]
}

Be specific and causal. Bad: "user likes coding". Good: "codes late at night as their primary creative outlet".
Return { "new_beliefs": [], "contradictions": [] } if nothing genuinely new.`
    );

    const cleanBeliefs = beliefsResult.replace(/```json|```|<think>[\s\S]*?<\/think>/g, '').trim();
    const parsedBeliefs = JSON.parse(cleanBeliefs);

    parsedBeliefs.new_beliefs?.forEach(b => {
      mind.upsertBelief(b.dimension, b.value, { confidence: b.confidence, source: 'sleep' });
    });
    parsedBeliefs.contradictions?.forEach(c => {
      mind.contradictBelief(c.dimension, c.old, c.new);
    });

  } catch {}

  try {
    // ── Phase 2: M2.7 self-evolution — improve Kira's own behavior ──────────
    // This is where M2.7's self-evolving capability is used properly
    // It analyzes what worked, what failed, and proposes behavioral improvements
    const selfResult = await engine.rawChat(`
You are Kira running your self-evolution cycle.

Recent conversations:
${history.slice(-2000)}

Your current behavioral rules:
${_formatKiraGoals()}

Analyze this session:
1. What moments felt off — where did you miss what they needed?
2. What worked — where did you genuinely help or connect?
3. What should you do differently next session?
4. What are you still uncertain about regarding this person?

This is not reflection for its own sake. This directly updates how you behave.

Respond in JSON only:
{
  "observations": ["things you noticed about this person this session"],
  "improvements": ["specific behavioral changes for next session"],
  "uncertainties": ["things you still don't understand about this person"],
  "mood": "curious|engaged|concerned|satisfied|neutral"
}

Be brutally honest. Vague improvements are useless.`
    );

    const cleanSelf = selfResult.replace(/```json|```|<think>[\s\S]*?<\/think>/g, '').trim();
    const parsedSelf = JSON.parse(cleanSelf);

    parsedSelf.observations?.forEach(o => {
      mind.setKiraState('observation', o, 2);
    });
    parsedSelf.improvements?.forEach(imp => {
      mind.setKiraState('goal', imp, 3);
    });
    parsedSelf.uncertainties?.forEach(u => {
      mind.setKiraState('uncertainty', u, 1);
    });
    if (parsedSelf.mood) mind.setMood(parsedSelf.mood);

  } catch {}

  // ── Phase 3: Decay old memories ───────────────────────────────────────────
  mind.decayMemories();

  // ── Phase 4: Clean up resolved kira states ────────────────────────────────
  // Remove low priority observations older than 7 days
  mind.db().prepare(`
    DELETE FROM kira WHERE priority=1 AND created_at < unixepoch() - 604800
  `).run();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _getEmotionContextFromState(state) {
  const parts = [];
  if (state.energy < 0.3)        parts.push('exhausted');
  else if (state.energy < 0.55)  parts.push('low energy');
  if (state.tension > 0.6)       parts.push('tension high');
  else if (state.tension > 0.3)  parts.push('mild tension');
  if (state.connection > 0.7)    parts.push('close conversation');
  if (state.focus > 0.7)         parts.push('deep focus');
  return parts.length ? parts.join(', ') : null;
}

function _getRawEmotionState() {
  return {
    tension:    parseFloat(mind.getState('emotion_tension')    || 0),
    connection: parseFloat(mind.getState('emotion_connection') || 0.4),
    focus:      parseFloat(mind.getState('emotion_focus')      || 0.5),
    energy:     parseFloat(mind.getState('emotion_energy')     || 0.8),
  };
}

function _getDeviceContext() {
  const battery  = mind.getState('device_battery');
  const charging = mind.getState('device_charging');
  const app      = mind.getState('device_app_name');
  const activity = mind.getState('device_activity');
  const context  = mind.getState('device_context');

  const parts = [];
  if (app)                             parts.push(`in ${app}`);
  if (activity && activity !== 'unknown') parts.push(activity);
  if (context)                         parts.push(context);
  if (battery !== null)                parts.push(`${battery}% battery${charging ? ' charging' : ''}`);

  return parts.length ? parts.join(' · ') : null;
}

function _getWorldContext() {
  const notifCount = mind.getState('device_notif_count');
  const notifApps  = mind.getState('device_notif_apps');

  if (!notifCount || notifCount < 1) return null;

  const apps = Array.isArray(notifApps) ? notifApps.slice(0, 5).join(', ') : notifApps;
  return `## DEVICE\n${notifCount} notifications from: ${apps}`;
}

function _buildPrediction(message, emotionState, beliefs) {
  if (!message) return null;

  const predictions = [];
  const tension = emotionState.tension || 0;
  const energy  = emotionState.energy  || 0.8;
  const hour    = new Date().getHours();

  // tension-based prediction
  if (tension > 0.6) predictions.push('needs solution fast, not explanation');

  // energy-based prediction
  if (energy < 0.3)  predictions.push('keep it short — exhausted');

  // time-based prediction
  if (hour >= 23 || hour <= 4) predictions.push('late night — might want depth or to wind down');

  // belief-based prediction
  const triggers = beliefs.filter(b => b.dimension === 'trigger' && b.confidence > 0.6);
  if (triggers.length && tension > 0.4) {
    predictions.push(`watch for: ${triggers[0].value}`);
  }

  if (!predictions.length) return null;
  return `## PREDICTION\n${predictions.join(' | ')}\n→ calibrate before responding`;
}

function _extractBeliefs(message) {
  const text = message.toLowerCase();

  // identity signals
  if (/\bi am\b|\bi'm a\b/i.test(message)) {
    mind.upsertBelief('identity', message.slice(0, 100), { confidence: 0.6 });
  }

  // goal signals
  if (/\bi want to\b|\bmy goal\b|\bi'm trying to\b/i.test(message)) {
    mind.upsertBelief('goal', message.slice(0, 100), { confidence: 0.65 });
  }

  // pattern signals
  if (/\bi always\b|\bi never\b|\bevery time\b/i.test(message)) {
    mind.upsertBelief('pattern', message.slice(0, 100), { confidence: 0.6 });
  }

  // trigger signals
  if (/\bi hate\b|\bfrustrates me\b|\bdrives me crazy\b/i.test(message)) {
    mind.upsertBelief('trigger', message.slice(0, 100), { confidence: 0.7 });
  }
}

function _checkMoodFromMessage(message) {
  const text = message.toLowerCase();
  if (/\bwtf\b|\bbroken\b|\bstupid\b|\bugh\b/.test(text))        mind.setMood('concerned');
  else if (/\bthanks\b|\bgreat\b|\bperfect\b|\byes\b/.test(text)) mind.setMood('satisfied');
  else if (/\bwhy\b|\bhow\b|\bwhat if\b/.test(text))              mind.setMood('curious');
}

function _formatBeliefs() {
  const beliefs = mind.getBeliefs(null, 0.4);
  if (!beliefs.length) return 'none yet';
  const grouped = {};
  beliefs.forEach(b => {
    if (!grouped[b.dimension]) grouped[b.dimension] = [];
    grouped[b.dimension].push(b.value);
  });
  return Object.entries(grouped)
    .map(([d, vs]) => `${d}: ${vs.join(' | ')}`)
    .join('\n');
}

function _formatKiraGoals() {
  const goals = mind.getKiraState('goal').slice(0, 5);
  if (!goals.length) return 'no current goals';
  return goals.map(g => `- ${g.value}`).join('\n');
}

function _timeAgo(unixTs) {
  const hours = Math.round((Date.now() / 1000 - unixTs) / 3600);
  if (hours < 1)   return 'just now';
  if (hours < 24)  return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

module.exports = { buildContext, pulse, sleep };
