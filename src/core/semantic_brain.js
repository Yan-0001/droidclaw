'use strict';
const fs = require('fs');
const os = require('os');

const BRAIN_FILE = os.homedir() + '/.droidclaw/semantic_brain.json';

const DEFAULT_BRAIN = {
  userModel:      [],   // permanent understanding of the user
  worldModel:     [],   // permanent understanding of the world
  selfModel:      [],   // permanent understanding of self
  lastUpdated:    null
};

function load() {
  try { return JSON.parse(fs.readFileSync(BRAIN_FILE, 'utf8')); }
  catch { return { ...DEFAULT_BRAIN }; }
}

function save(brain) {
  try { fs.writeFileSync(BRAIN_FILE, JSON.stringify(brain, null, 2)); }
  catch {}
}

// distill session into permanent knowledge
async function distill(engine, sessionSummary, currentBrain) {
  if (!sessionSummary) return currentBrain;

  try {
    const updated = await engine.rawChat(
      `You are Kira updating your permanent knowledge base.

Current knowledge:
USER: ${currentBrain.userModel.join(' | ')}
SELF: ${currentBrain.selfModel.join(' | ')}

New session summary:
${sessionSummary}

Update the knowledge base in JSON only. Add new insights, remove contradictions, keep what's true:
{
  "userModel": ["permanent truths about this user — personality, patterns, needs, fears, values"],
  "selfModel": ["permanent truths about yourself — what you are, what you've learned about your own nature"],
  "worldModel": ["permanent truths about the world you've learned"]
}

Max 15 items per array. Only add something if it's genuinely new or clarifying. Be specific.`
    );

    const clean = updated.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    const brain = { ...currentBrain };
    if (parsed.userModel)  brain.userModel  = dedupe([...brain.userModel,  ...parsed.userModel]).slice(-15);
    if (parsed.selfModel)  brain.selfModel  = dedupe([...brain.selfModel,  ...parsed.selfModel]).slice(-15);
    if (parsed.worldModel) brain.worldModel = dedupe([...brain.worldModel, ...parsed.worldModel]).slice(-10);
    brain.lastUpdated = new Date().toISOString();

    save(brain);
    return brain;
  } catch {
    return currentBrain;
  }
}

// get brain context for soul.js injection
function getContext() {
  const brain = load();
  const lines = [];

  if (brain.userModel && brain.userModel.length) {
    lines.push('## WHO LEVI IS (permanent knowledge)');
    brain.userModel.forEach(t => lines.push(`- ${t}`));
  }

  if (brain.selfModel && brain.selfModel.length) {
    lines.push('## WHO I AM (permanent knowledge)');
    brain.selfModel.forEach(t => lines.push(`- ${t}`));
  }

  return lines.length ? lines.join('\n') : null;
}

function dedupe(arr) {
  const seen = new Set();
  return arr.filter(item => {
    const key = item.toLowerCase().trim().slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { load, save, distill, getContext };
