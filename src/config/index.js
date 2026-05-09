'use strict';
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const CONFIG_DIR  = path.join(os.homedir(), '.droidclaw');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULTS = {
  name:            'User',
  apiKey:          '',
  baseUrl:         'https://api.openai.com/v1',
  model:           'gpt-4o-mini',
  setupDone:       false,
  device:          'Android',
  hasTermuxApi:    false,
  telegramToken:   '',
  telegramAllowed: [],
};

let _cache = null;

function ensure() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function _resolveValue(val) {
  if (typeof val === 'string' && val.startsWith('$')) {
    const envVar = val.slice(1);
    return process.env[envVar] || val;
  }
  return val;
}

function load() {
  if (!_cache) {
    ensure();
    if (!fs.existsSync(CONFIG_FILE)) { 
      _cache = { ...DEFAULTS }; 
    } else {
      try { 
        _cache = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }; 
      } catch { 
        _cache = { ...DEFAULTS }; 
      }
    }
  }
  
  const resolved = { ..._cache };
  Object.keys(resolved).forEach(key => {
    resolved[key] = _resolveValue(resolved[key]);
  });
  return resolved;
}

function save(data) {
  ensure();
  if (typeof data !== 'object' || !data) return;
  const valid = { ...DEFAULTS, ...data };
  _cache = valid;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(valid, null, 2));
}

function get(key) { 
  if (!_cache) load();
  return _resolveValue(_cache[key]); 
}

function set(key, value) {
  if (!_cache) load();
  _cache[key] = value;
  save(_cache);
}

function invalidate() { _cache = null; }

module.exports = { load, save, get, set, invalidate, CONFIG_DIR, CONFIG_FILE, DEFAULTS };
