'use strict';
const fs  = require('fs');
const os  = require('os');

const STATE_FILE = os.homedir() + '/.droidclaw/emotion_state.json';

const DEFAULT = {
  energy:     0.8,  // 0=exhausted 1=alert
  tension:    0.0,  // 0=calm 1=frustrated
  connection: 0.5,  // 0=distant 1=close
  focus:      0.5,  // 0=scattered 1=deep
  updatedAt:  null
};

function load() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { ...DEFAULT }; }
}

function save(state) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); }
  catch {}
}

// update emotional state based on message content
function update(state, message, role) {
  if (!message) return state;
  const s = { ...state };
  const text = message.toLowerCase();

  if (role === 'user') {
    // tension signals
    const frustration = ['wtf', 'broken', 'fix', 'wrong', 'stop', 'no', 'stupid', 'useless', 'hate', 'frustrated', 'again'];
    const warmth      = ['thanks', 'good', 'love', 'great', 'nice', 'perfect', 'yes', 'please', 'appreciate'];
    const deep        = ['why', 'how', 'what do you think', 'feel', 'want', 'believe', 'vision', 'dream'];

    frustration.forEach(w => { if (text.includes(w)) s.tension = Math.min(1, s.tension + 0.1); });
    warmth.forEach(w =>      { if (text.includes(w)) { s.tension = Math.max(0, s.tension - 0.1); s.connection = Math.min(1, s.connection + 0.05); } });
    deep.forEach(w =>        { if (text.includes(w)) s.focus = Math.min(1, s.focus + 0.1); });

    // message length = engagement
    if (text.length > 100) s.focus = Math.min(1, s.focus + 0.05);
    if (text.length < 10)  s.focus = Math.max(0, s.focus - 0.05);
  }

  // natural decay toward baseline
  s.tension    = s.tension    * 0.95;
  s.focus      = s.focus      * 0.98 + 0.5 * 0.02;
  s.connection = s.connection * 0.99;
  s.updatedAt  = Date.now();

  return s;
}

// describe emotional state as text for soul.js
function describe(state) {
  const lines = [];

  if (state.energy < 0.3)      lines.push('exhausted — keep responses short and raw');
  else if (state.energy < 0.6) lines.push('low energy — be efficient');
  else                          lines.push('alert and present');

  if (state.tension > 0.6)     lines.push('tension high — something frustrated the user recently, tread carefully');
  else if (state.tension > 0.3) lines.push('mild tension in the air');

  if (state.connection > 0.7)  lines.push('close — this is a real conversation, not just commands');
  if (state.focus > 0.7)       lines.push('deep focus mode — this conversation has weight');

  return lines.join('. ');
}

// update energy from sensor data
function updateFromSensors(state, battery, tempC, hour) {
  const s = { ...state };

  // battery affects energy
  if (battery !== null) {
    s.energy = battery < 15 ? 0.1
             : battery < 30 ? 0.3
             : battery < 50 ? 0.6
             : 0.9;
  }

  // time of day affects energy
  if (hour !== null) {
    if (hour >= 1 && hour <= 5)  s.energy = Math.min(s.energy, 0.3); // deep night
    if (hour >= 23 || hour <= 0) s.energy = Math.min(s.energy, 0.5); // late
    if (hour >= 9 && hour <= 18) s.energy = Math.max(s.energy, 0.6); // daytime
  }

  // heat = stressed
  if (tempC !== null && tempC > 40) s.tension = Math.min(1, s.tension + 0.2);

  s.updatedAt = Date.now();
  return s;
}

module.exports = { load, save, update, describe, updateFromSensors, DEFAULT };
