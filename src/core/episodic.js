'use strict';
/**
 * SOMA v2 — Episodic Memory (Hippocampus)
 * MemCells: atomic memory units with emotional, temporal, and semantic traces
 */
const fs = require('fs');
const os = require('os');

const MEM_FILE    = os.homedir() + '/.droidclaw/soma_episodic.json';
const MAX_CELLS   = 1000;

// ─── MemCell structure ────────────────────────────────────────────────────────
// {
//   id, timestamp, text,
//   emotion: { score, valence, tension, connection },
//   importance, foresight, tags, theme, activations
// }

function load() {
  try { return JSON.parse(fs.readFileSync(MEM_FILE, 'utf8')); }
  catch { return []; }
}

function save(cells) {
  try {
    const trimmed = cells.length > MAX_CELLS ? cells.slice(-MAX_CELLS) : cells;
    fs.writeFileSync(MEM_FILE, JSON.stringify(trimmed, null, 2));
  } catch {}
}

// score a MemCell for retrieval
function score(cell, now, emotionState) {
  const ageHours  = (now - cell.timestamp) / 3600000;
  const recency   = Math.pow(0.995, ageHours);
  const importance = cell.importance || 0.5;
  const emotion   = cell.emotion?.score || 0.3;

  // boost on emotional resonance with current state
  let emotionBoost = 0;
  if (emotionState) {
    if (emotionState.tension > 0.5 && cell.emotion?.tension > 0.5) emotionBoost += 0.15;
    if (emotionState.connection > 0.6 && cell.emotion?.connection > 0.6) emotionBoost += 0.1;
  }

  // activation boost — frequently recalled = more important
  const activationBoost = Math.min(0.2, (cell.activations || 0) * 0.02);

  return (recency * 0.25) + (importance * 0.35) + (emotion * 0.25) + emotionBoost + activationBoost;
}

// store a new MemCell
function store(text, options = {}) {
  const cells = load();

  const cell = {
    id:          `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp:   Date.now(),
    text:        text.slice(0, 600),
    emotion: {
      score:      options.emotionScore  || 0.3,
      valence:    options.valence       || 'neutral', // positive/negative/neutral
      tension:    options.tension       || 0,
      connection: options.connection    || 0
    },
    importance:   options.importance    || 0.5,
    foresight:    options.foresight     || null,  // predicted future relevance
    tags:         options.tags          || [],
    theme:        options.theme         || null,  // assigned by MemScenes
    activations:  0,
    source:       options.source        || 'conversation'
  };

  cells.push(cell);
  save(cells);
  return cell.id;
}

// retrieve top N MemCells relevant to query + emotional state
function retrieve(query, n = 7, emotionState = null) {
  const cells = load();
  if (!cells.length) return [];

  const now    = Date.now();
  const scored = cells.map(cell => ({ ...cell, _score: score(cell, now, emotionState) }));

  // keyword boost
  if (query) {
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    scored.forEach(cell => {
      const text = (cell.text + ' ' + (cell.tags || []).join(' ')).toLowerCase();
      words.forEach(w => { if (text.includes(w)) cell._score += 0.12; });
    });
  }

  // theme boost — if current context has a theme, boost matching cells
  const topCells = scored
    .sort((a, b) => b._score - a._score)
    .slice(0, n);

  // record activation
  const allCells = load();
  topCells.forEach(tc => {
    const cell = allCells.find(c => c.id === tc.id);
    if (cell) cell.activations = (cell.activations || 0) + 1;
  });
  save(allCells);

  return topCells.map(c => ({
    text:  c.text,
    theme: c.theme,
    score: c._score,
    age:   Math.round((Date.now() - c.timestamp) / 3600000) + 'h ago'
  }));
}

// extract foresight — what might this memory predict about future needs?
function extractForesight(text) {
  const signals = [];
  const t = text.toLowerCase();

  if (t.includes('want') || t.includes('need') || t.includes('plan'))
    signals.push('user_intent');
  if (t.includes('frustrated') || t.includes('broken') || t.includes('fail'))
    signals.push('failure_pattern');
  if (t.includes('always') || t.includes('never') || t.includes('every time'))
    signals.push('behavioral_pattern');
  if (t.includes('tomorrow') || t.includes('next') || t.includes('later'))
    signals.push('future_oriented');

  return signals.length ? signals : null;
}

// get formatted context for soul injection
function getContextSummary(emotionState, n = 7) {
  const cells = retrieve('', n, emotionState);
  if (!cells.length) return null;

  const byTheme = {};
  cells.forEach(c => {
    const theme = c.theme || 'general';
    if (!byTheme[theme]) byTheme[theme] = [];
    byTheme[theme].push(`[${c.age}] ${c.text}`);
  });

  const lines = ['## EPISODIC MEMORY (MemCells)'];
  Object.entries(byTheme).forEach(([theme, memories]) => {
    lines.push(`### ${theme}`);
    memories.forEach(m => lines.push(`- ${m}`));
  });

  return lines.join('\n');
}

// assign theme to a cell (called by MemScenes)
function assignTheme(id, theme) {
  const cells = load();
  const cell = cells.find(c => c.id === id);
  if (cell) {
    cell.theme = theme;
    save(cells);
  }
}

module.exports = { store, retrieve, getContextSummary, assignTheme, extractForesight, load, save };
