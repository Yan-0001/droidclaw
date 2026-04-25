'use strict';
const config   = require('../config');
const registry = require('./registry');
const mind     = require('../core/mind');

const EMBED_MODELS = {
  'integrate.api.nvidia.com': 'nvidia/llama-3.2-nv-embedqa-1b-v2',
  'api.openai.com':           'text-embedding-3-small',
  'localhost':                'nomic-embed-text',
  '127.0.0.1':               'nomic-embed-text',
};

function getEmbedModel(baseUrl) {
  for (const [host, model] of Object.entries(EMBED_MODELS)) {
    if (baseUrl && baseUrl.includes(host)) return model;
  }
  return null;
}

async function embed(text) {
  const cfg   = config.load();
  const model = getEmbedModel(cfg.baseUrl);
  if (!model) return null;
  try {
    const res = await fetch(cfg.baseUrl + '/embeddings', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
      body:    JSON.stringify({ model, input: [text], encoding_format: 'float' }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.[0]?.embedding || null;
  } catch { return null; }
}

function _timeAgo(ts) {
  const hours = Math.round((Date.now() / 1000 - ts) / 3600);
  if (hours < 1)  return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

registry.register('memory_store', async function(args) {
  const { text, tags } = args;
  if (!text) return 'error: text required';
  mind.storeMemory(text, { importance: 0.7, tags: tags || [], theme: 'explicit' });
  return `remembered: "${text.slice(0, 80)}"`;
}, 'store a memory into Kira\'s unified memory system');

registry.register('memory_search', async function(args) {
  const { query, limit } = args;
  if (!query) return 'error: query required';
  const n       = parseInt(limit) || 5;
  const emotion = {
    tension:    parseFloat(mind.getState('emotion_tension')    || 0),
    connection: parseFloat(mind.getState('emotion_connection') || 0.5),
  };
  const results = mind.retrieveMemories(query, n, emotion);
  if (!results.length) return 'no relevant memories found.';
  return results.map((m, i) => `${i + 1}. [${_timeAgo(m.last_touched)}] ${m.text}`).join('\n');
}, 'search Kira\'s memory by meaning');

registry.register('memory_list_all', async function(args) {
  const n   = parseInt(args.limit) || 20;
  const all = mind.retrieveMemories('', n);
  if (!all.length) return 'no memories stored.';
  return all.map((m, i) => `${i + 1}. [${_timeAgo(m.last_touched)}] ${m.text}`).join('\n');
}, 'list recent memories');

registry.register('memory_delete_semantic', async function(args) {
  return 'use memory_search to find the memory first, then it will decay naturally over time.';
}, 'memories decay naturally — no manual deletion needed');

module.exports = { embed };
