'use strict';
const fs  = require('fs');
const os  = require('os');

const STATE_FILE = os.homedir() + '/.droidclaw/emotion_state.json';

// ── Inertia constants ─────────────────────────────────────────────────────────
// How resistant each dimension is to change (0=instant, 1=never changes)
// Higher = more momentum = slower to shift
const INERTIA = {
  tension:    0.75,  // stress builds fast, fades slow
  connection: 0.88,  // trust is hard to build AND hard to destroy
  focus:      0.70,  // focus shifts moderately
  energy:     0.92,  // energy changes very slowly (physical state)
};

// Natural resting values each dimension drifts toward over time
const BASELINE = {
  tension:    0.0,
  connection: 0.4,
  focus:      0.5,
  energy:     0.7,
};

// How fast each dimension drifts back to baseline per minute of inactivity
const DECAY_PER_MIN = {
  tension:    0.04,  // tension fades slowly — stress lingers
  connection: 0.01,  // connection persists — trust doesn't vanish overnight
  focus:      0.06,  // focus drifts quicker without stimulation
  energy:     0.02,  // energy recovers slowly
};

const DEFAULT = {
  energy:     0.8,
  tension:    0.0,
  connection: 0.5,
  focus:      0.5,
  updatedAt:  null,
};

function load() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { ...DEFAULT }; }
}

function save(state) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); }
  catch {}
}

// ── Lerp helper ───────────────────────────────────────────────────────────────
// Move current value toward target, respecting inertia
// inertia=0.8 means 80% of current value is retained each step
function lerp(current, target, inertia) {
  return current * inertia + target * (1 - inertia);
}

// ── Time-based decay ──────────────────────────────────────────────────────────
// Apply baseline drift based on elapsed time since last update
function applyTimedDecay(state) {
  if (!state.updatedAt) return state;

  const s       = { ...state };
  const elapsed = (Date.now() - state.updatedAt) / 60000; // minutes since last update
  if (elapsed < 0.5) return s; // less than 30s — skip

  const mins = Math.min(elapsed, 60); // cap at 60 mins to avoid overcorrecting

  for (const dim of ['tension', 'connection', 'focus', 'energy']) {
    const decay   = DECAY_PER_MIN[dim] * mins;
    const baseline = BASELINE[dim];
    // Move toward baseline proportional to elapsed time
    s[dim] = s[dim] + (baseline - s[dim]) * Math.min(decay, 0.5);
    s[dim] = Math.max(0, Math.min(1, s[dim]));
  }

  return s;
}

// ── Main update ───────────────────────────────────────────────────────────────
function update(state, message, role) {
  if (!message) return state;

  // First apply time-based decay from inactivity
  let s = applyTimedDecay({ ...state });

  const text = message.toLowerCase();

  if (role === 'user') {
    // ── Signal detection ──────────────────────────────────────────────────────
    const frustration = ['wtf', 'broken', 'fix', 'wrong', 'stop', 'no ', 'stupid',
                         'useless', 'hate', 'frustrated', 'again', 'ugh', 'seriously',
                         'not working', 'doesnt work', "doesn't work"];
    const warmth      = ['thanks', 'good', 'love', 'great', 'nice', 'perfect', 'yes',
                         'please', 'appreciate', 'awesome', 'amazing', 'helpful'];
    const deep        = ['why', 'how', 'what do you think', 'feel', 'want', 'believe',
                         'vision', 'dream', 'should i', 'what if', 'help me understand'];
    const intimacy    = ['i am', "i'm", 'my ', 'i feel', 'i think', 'i want',
                         'honestly', 'actually', 'between us'];

    // Count signals — multiple hits compound
    let tensionDelta    = 0;
    let connectionDelta = 0;
    let focusDelta      = 0;

    frustration.forEach(w => { if (text.includes(w)) tensionDelta    += 0.12; });
    warmth.forEach(w =>      { if (text.includes(w)) { tensionDelta  -= 0.08; connectionDelta += 0.06; } });
    deep.forEach(w =>        { if (text.includes(w)) focusDelta      += 0.10; });
    intimacy.forEach(w =>    { if (text.includes(w)) connectionDelta += 0.04; });

    // Message length = engagement signal
    if (text.length > 150) { focusDelta += 0.08; connectionDelta += 0.03; }
    else if (text.length > 60) focusDelta += 0.04;
    else if (text.length < 8)  focusDelta -= 0.04;

    // ── Apply signals through inertia (momentum) ──────────────────────────────
    // Instead of: s.tension += delta (instant)
    // We do:      lerp toward (current + delta), keeping inertia
    const targetTension    = Math.max(0, Math.min(1, s.tension    + tensionDelta));
    const targetConnection = Math.max(0, Math.min(1, s.connection + connectionDelta));
    const targetFocus      = Math.max(0, Math.min(1, s.focus      + focusDelta));

    s.tension    = lerp(s.tension,    targetTension,    INERTIA.tension);
    s.connection = lerp(s.connection, targetConnection, INERTIA.connection);
    s.focus      = lerp(s.focus,      targetFocus,      INERTIA.focus);
  }

  // ── Per-message baseline drift (gentle, every message) ────────────────────
  // Tension always nudges toward 0 over time, but slowly
  s.tension    = lerp(s.tension,    BASELINE.tension,    0.97);
  s.focus      = lerp(s.focus,      BASELINE.focus,      0.99);
  s.connection = lerp(s.connection, BASELINE.connection, 0.995);

  s.updatedAt = Date.now();
  return s;
}

// ── Describe state for soul.js ────────────────────────────────────────────────
function describe(state) {
  const lines = [];

  // energy
  if (state.energy < 0.3)       lines.push('exhausted — keep it short and raw');
  else if (state.energy < 0.55) lines.push('low energy — be efficient, no filler');
  else if (state.energy > 0.85) lines.push('high energy — they are alert and engaged');

  // tension — with severity nuance
  if (state.tension > 0.7)      lines.push('high tension — something is genuinely frustrating them, tread carefully and solve fast');
  else if (state.tension > 0.45) lines.push('mild tension — slight edge in the air, stay sharp');
  else if (state.tension > 0.2)  lines.push('trace tension — residual, fading');

  // connection
  if (state.connection > 0.75)  lines.push('close — this is a real conversation, not just commands');
  else if (state.connection < 0.25) lines.push('distant — they are treating this transactionally');

  // focus
  if (state.focus > 0.72)       lines.push('deep focus — this conversation has weight, match it');
  else if (state.focus < 0.3)   lines.push('scattered — they may need grounding');

  return lines.join('. ') || 'neutral state';
}

// ── Sensor update ─────────────────────────────────────────────────────────────
function updateFromSensors(state, battery, tempC, hour) {
  const s = { ...state };

  // battery → energy (through inertia — physical state changes slowly)
  if (battery !== null) {
    const targetEnergy = battery < 15 ? 0.15
                       : battery < 30 ? 0.35
                       : battery < 50 ? 0.60
                       : 0.90;
    s.energy = lerp(s.energy, targetEnergy, INERTIA.energy);
  }

  // time of day modulates energy ceiling
  if (hour !== null) {
    if (hour >= 1  && hour <= 5)  s.energy = Math.min(s.energy, 0.35);
    if (hour >= 23 || hour === 0) s.energy = Math.min(s.energy, 0.55);
    if (hour >= 9  && hour <= 18) s.energy = Math.max(s.energy, 0.55);
  }

  // device heat → tension spike (physical stress)
  if (tempC !== null && tempC > 40) {
    s.tension = lerp(s.tension, Math.min(1, s.tension + 0.25), INERTIA.tension);
  }

  s.updatedAt = Date.now();
  return s;
}

module.exports = { load, save, update, describe, updateFromSensors, DEFAULT };
