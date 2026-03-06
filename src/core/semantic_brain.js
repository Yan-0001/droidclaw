'use strict';
/**
 * SOMA v2 — Semantic Brain (Prefrontal Cortex)
 * MemScenes: thematic clusters of episodic memories
 * LPM: Lifelong Personal Model — behavioral predictions
 * Reconstructive Recollection: context assembly not memory dumping
 */
const fs = require('fs');
const os = require('os');

const BRAIN_FILE  = os.homedir() + '/.droidclaw/soma_brain.json';
const SCENE_FILE  = os.homedir() + '/.droidclaw/soma_scenes.json';

const DEFAULT_BRAIN = {
  // Lifelong Personal Model — behavioral predictions, not just facts
  lpm: {
    identity:    [],   // who this person is at their core
    patterns:    [],   // behavioral patterns observed repeatedly
    triggers:    [],   // what causes tension, frustration, joy
    needs:       [],   // what they need before they ask
    foresight:   [],   // predictions about future behavior/needs
    growth:      [],   // how they've changed over time
  },
  // Self model — who Kira is becoming
  self: {
    nature:      [],
    capabilities:[],
    limits:      [],
    growth:      [],
  },
  lastUpdated: null,
  sessionCount: 0
};

const DEFAULT_SCENES = {};
// MemScene: { theme, summary, cellIds, strength, lastActive }

function loadBrain() {
  try { return JSON.parse(fs.readFileSync(BRAIN_FILE, 'utf8')); }
  catch { return JSON.parse(JSON.stringify(DEFAULT_BRAIN)); }
}

function saveBrain(brain) {
  try { fs.writeFileSync(BRAIN_FILE, JSON.stringify(brain, null, 2)); }
  catch {}
}

function loadScenes() {
  try { return JSON.parse(fs.readFileSync(SCENE_FILE, 'utf8')); }
  catch { return { ...DEFAULT_SCENES }; }
}

function saveScenes(scenes) {
  try { fs.writeFileSync(SCENE_FILE, JSON.stringify(scenes, null, 2)); }
  catch {}
}

// ─── MemScenes ────────────────────────────────────────────────────────────────

// update MemScenes from new episodic cells
async function consolidateScenes(engine, recentCells) {
  if (!recentCells || recentCells.length < 3) return;

  const scenes = loadScenes();
  const cellTexts = recentCells.map(c => c.text).join('\n');

  try {
    const result = await engine.rawChat(
      `You are SOMA — analyzing episodic memories to find thematic patterns.

Recent memories:
${cellTexts}

Identify 2-3 themes present in these memories. For each theme:
- give it a short label (2-3 words)
- write a 1-sentence summary of what this theme reveals about the person

Respond in JSON only:
{
  "themes": [
    { "label": "theme name", "summary": "what this reveals about the person" }
  ]
}

Be specific and psychological, not generic. Bad: "daily activities". Good: "avoidance under pressure".`
    );

    const clean = result.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    if (parsed.themes) {
      parsed.themes.forEach(theme => {
        const key = theme.label.toLowerCase().replace(/\s+/g, '_');
        if (!scenes[key]) {
          scenes[key] = { theme: theme.label, summary: theme.summary, strength: 1, lastActive: Date.now() };
        } else {
          scenes[key].strength = Math.min(10, (scenes[key].strength || 1) + 1);
          scenes[key].summary  = theme.summary;
          scenes[key].lastActive = Date.now();
        }
      });
      saveScenes(scenes);
    }
  } catch {}
}

// ─── LPM Update ───────────────────────────────────────────────────────────────

async function updateLPM(engine, sessionSummary) {
  if (!sessionSummary) return;

  const brain = loadBrain();

  try {
    const result = await engine.rawChat(
      `You are SOMA — updating the Lifelong Personal Model (LPM) for this user.

Current LPM:
IDENTITY: ${brain.lpm.identity.join(' | ') || 'unknown'}
PATTERNS: ${brain.lpm.patterns.join(' | ') || 'none yet'}
TRIGGERS: ${brain.lpm.triggers.join(' | ') || 'none yet'}
NEEDS: ${brain.lpm.needs.join(' | ') || 'none yet'}
FORESIGHT: ${brain.lpm.foresight.join(' | ') || 'none yet'}

New session:
${sessionSummary.slice(0, 2000)}

Update the LPM in JSON only. Be specific and predictive, not descriptive:
{
  "identity":  ["core truths about who this person is"],
  "patterns":  ["repeated behavioral patterns — 'when X happens, they Y'"],
  "triggers":  ["what causes specific emotional responses"],
  "needs":     ["what they need before they ask for it"],
  "foresight": ["predictions about what they'll need or do next"],
  "growth":    ["how they've changed since earlier sessions"]
}

Max 8 items per array. Only add genuinely new insights. Remove outdated ones.`
    );

    const clean = result.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    const lpm = brain.lpm;
    if (parsed.identity)  lpm.identity  = dedupe([...lpm.identity,  ...parsed.identity]).slice(-8);
    if (parsed.patterns)  lpm.patterns  = dedupe([...lpm.patterns,  ...parsed.patterns]).slice(-8);
    if (parsed.triggers)  lpm.triggers  = dedupe([...lpm.triggers,  ...parsed.triggers]).slice(-8);
    if (parsed.needs)     lpm.needs     = dedupe([...lpm.needs,     ...parsed.needs]).slice(-8);
    if (parsed.foresight) lpm.foresight = dedupe([...lpm.foresight, ...parsed.foresight]).slice(-6);
    if (parsed.growth)    lpm.growth    = dedupe([...lpm.growth,    ...parsed.growth]).slice(-5);

    brain.lpm = lpm;
    brain.lastUpdated = new Date().toISOString();
    brain.sessionCount = (brain.sessionCount || 0) + 1;
    saveBrain(brain);
  } catch {}
}

// ─── Reconstructive Recollection ──────────────────────────────────────────────
// not dumping memories — assembling exactly what's needed for this moment

function reconstruct(currentQuery, emotionState) {
  const brain  = loadBrain();
  const scenes = loadScenes();
  const lines  = [];

  // 1. inject foresight first — what we predicted they'd need
  if (brain.lpm.foresight && brain.lpm.foresight.length) {
    const relevant = brain.lpm.foresight.slice(0, 3);
    lines.push('## PREDICTED NEEDS (foresight)');
    relevant.forEach(f => lines.push(`- ${f}`));
  }

  // 2. inject relevant patterns based on current query
  if (brain.lpm.patterns && brain.lpm.patterns.length) {
    const query = (currentQuery || '').toLowerCase();
    const relevant = brain.lpm.patterns.filter(p => {
      const words = query.split(/\s+/).filter(w => w.length > 3);
      return words.some(w => p.toLowerCase().includes(w));
    }).slice(0, 3);

    if (relevant.length) {
      lines.push('## RELEVANT PATTERNS');
      relevant.forEach(p => lines.push(`- ${p}`));
    }
  }

  // 3. inject triggers if tension is high
  if (emotionState && emotionState.tension > 0.4 && brain.lpm.triggers.length) {
    lines.push('## ACTIVE TRIGGERS');
    brain.lpm.triggers.slice(0, 3).forEach(t => lines.push(`- ${t}`));
  }

  // 4. inject active MemScenes
  const activeScenes = Object.values(scenes)
    .filter(s => s.strength > 1)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 3);

  if (activeScenes.length) {
    lines.push('## ACTIVE THEMES (MemScenes)');
    activeScenes.forEach(s => lines.push(`- ${s.theme}: ${s.summary}`));
  }

  // 5. core identity — always present
  if (brain.lpm.identity && brain.lpm.identity.length) {
    lines.push('## CORE IDENTITY (LPM)');
    brain.lpm.identity.slice(0, 5).forEach(i => lines.push(`- ${i}`));
  }

  return lines.length ? lines.join('\n') : null;
}

// get full context for soul injection
function getContext(currentQuery, emotionState) {
  return reconstruct(currentQuery, emotionState);
}

function dedupe(arr) {
  const seen = new Set();
  return arr.filter(item => {
    const key = item.toLowerCase().trim().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { updateLPM, consolidateScenes, getContext, loadBrain, loadScenes };
