'use strict';
const fs  = require('fs');
const os  = require('os');

const MEM_FILE = os.homedir() + '/.droidclaw/episodic_memory.json';
const MAX_EPISODES = 500;

function load() {
  try { return JSON.parse(fs.readFileSync(MEM_FILE, 'utf8')); }
  catch { return []; }
}

function save(episodes) {
  try { fs.writeFileSync(MEM_FILE, JSON.stringify(episodes, null, 2)); }
  catch {}
}

// score a memory for retrieval relevance
function score(episode, now, emotionalState) {
  const ageMs      = now - episode.timestamp;
  const ageHours   = ageMs / (1000 * 60 * 60);
  const recency    = Math.pow(0.995, ageHours);           // decays hourly
  const importance = episode.importance || 0.5;
  const emotion    = episode.emotionScore || 0.3;

  // boost if matches current emotional state
  const emotionBoost = emotionalState && emotionalState.tension > 0.5 && episode.hadTension ? 0.2 : 0;

  return (recency * 0.3) + (importance * 0.4) + (emotion * 0.3) + emotionBoost;
}

// store a new episode
function store(text, options = {}) {
  const episodes = load();

  const episode = {
    id:          Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    timestamp:   Date.now(),
    text:        text.slice(0, 500),
    importance:  options.importance  || 0.5,
    emotionScore: options.emotionScore || 0.3,
    hadTension:  options.hadTension  || false,
    tags:        options.tags        || [],
    source:      options.source      || 'conversation'
  };

  episodes.push(episode);

  // keep only latest MAX_EPISODES
  const trimmed = episodes.length > MAX_EPISODES
    ? episodes.slice(-MAX_EPISODES)
    : episodes;

  save(trimmed);
  return episode.id;
}

// retrieve top N most relevant memories
function retrieve(query, n = 5, emotionalState = null) {
  const episodes = load();
  if (!episodes.length) return [];

  const now    = Date.now();
  const scored = episodes.map(ep => ({ ...ep, _score: score(ep, now, emotionalState) }));

  // simple keyword boost
  if (query) {
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    scored.forEach(ep => {
      const text = ep.text.toLowerCase();
      words.forEach(w => { if (text.includes(w)) ep._score += 0.1; });
    });
  }

  return scored
    .sort((a, b) => b._score - a._score)
    .slice(0, n)
    .map(ep => ep.text);
}

// mark a memory as important (re-activation strengthens it)
function reinforce(id) {
  const episodes = load();
  const ep = episodes.find(e => e.id === id);
  if (ep) {
    ep.importance = Math.min(1, (ep.importance || 0.5) + 0.1);
    ep.timestamp  = Date.now(); // refresh recency
    save(episodes);
  }
}

// get a summary for soul injection
function getContextSummary(emotionalState, n = 5) {
  const memories = retrieve('', n, emotionalState);
  if (!memories.length) return null;
  return memories.join('\n');
}

module.exports = { store, retrieve, reinforce, getContextSummary, load, save };
