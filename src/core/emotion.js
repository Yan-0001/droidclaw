'use strict';
/**
 * EMOTION — Emotional State Computation Engine
 *
 * Pure JavaScript. No storage. No side effects.
 * Takes message + current state → returns new state.
 *
 * All state is stored in KIRA_MIND (mind.js).
 * This module just does the math.
 */

const INERTIA = {
  tension:    0.75,
  connection: 0.88,
  focus:      0.70,
  energy:     0.92,
};

const BASELINE = {
  tension:    0.0,
  connection: 0.4,
  focus:      0.5,
  energy:     0.7,
};

const DECAY_PER_MIN = {
  tension:    0.04,
  connection: 0.01,
  focus:      0.06,
  energy:     0.02,
};

function lerp(current, target, inertia) {
  return current * inertia + target * (1 - inertia);
}

function applyTimedDecay(state, elapsedMinutes) {
  if (elapsedMinutes < 0.5) return state;
  const mins = Math.min(elapsedMinutes, 60);
  const s = { ...state };
  for (const dim of ['tension', 'connection', 'focus', 'energy']) {
    const decay = DECAY_PER_MIN[dim] * mins;
    s[dim] = Math.max(0, Math.min(1, s[dim] + (BASELINE[dim] - s[dim]) * Math.min(decay, 0.5)));
  }
  return s;
}

function update(currentState, message, role) {
  if (!message) return currentState;

  let s = { ...currentState };

  if (role === 'user') {
    const text = message.toLowerCase();

    const frustration = ['wtf', 'broken', 'fix', 'wrong', 'stop', 'no ', 'stupid',
                         'useless', 'hate', 'frustrated', 'again', 'ugh', 'seriously',
                         'not working', 'doesnt work', "doesn't work"];
    const warmth      = ['thanks', 'good', 'love', 'great', 'nice', 'perfect', 'yes',
                         'please', 'appreciate', 'awesome', 'amazing', 'helpful'];
    const deep        = ['why', 'how', 'what do you think', 'feel', 'want', 'believe',
                         'vision', 'dream', 'should i', 'what if', 'help me understand'];
    const intimacy    = ['i am', "i'm", 'my ', 'i feel', 'i think', 'i want',
                         'honestly', 'actually', 'between us'];

    let tensionDelta    = 0;
    let connectionDelta = 0;
    let focusDelta      = 0;

    frustration.forEach(w => { if (text.includes(w)) tensionDelta    += 0.12; });
    warmth.forEach(w =>      { if (text.includes(w)) { tensionDelta  -= 0.08; connectionDelta += 0.06; } });
    deep.forEach(w =>        { if (text.includes(w)) focusDelta      += 0.10; });
    intimacy.forEach(w =>    { if (text.includes(w)) connectionDelta += 0.04; });

    if (text.length > 150) { focusDelta += 0.08; connectionDelta += 0.03; }
    else if (text.length > 60) focusDelta += 0.04;
    else if (text.length < 8)  focusDelta -= 0.04;

    const targetTension    = Math.max(0, Math.min(1, s.tension    + tensionDelta));
    const targetConnection = Math.max(0, Math.min(1, s.connection + connectionDelta));
    const targetFocus      = Math.max(0, Math.min(1, s.focus      + focusDelta));

    s.tension    = lerp(s.tension,    targetTension,    INERTIA.tension);
    s.connection = lerp(s.connection, targetConnection, INERTIA.connection);
    s.focus      = lerp(s.focus,      targetFocus,      INERTIA.focus);
  }

  s.tension    = lerp(s.tension,    BASELINE.tension,    0.97);
  s.focus      = lerp(s.focus,      BASELINE.focus,      0.99);
  s.connection = lerp(s.connection, BASELINE.connection, 0.995);

  return s;
}

function updateFromSensors(currentState, battery, tempC, hour) {
  const s = { ...currentState };

  if (battery !== null) {
    const targetEnergy = battery < 15 ? 0.15
                       : battery < 30 ? 0.35
                       : battery < 50 ? 0.60
                       : 0.90;
    s.energy = lerp(s.energy, targetEnergy, INERTIA.energy);
  }

  if (hour !== null) {
    if (hour >= 1  && hour <= 5)  s.energy = Math.min(s.energy, 0.35);
    if (hour >= 23 || hour === 0) s.energy = Math.min(s.energy, 0.55);
    if (hour >= 9  && hour <= 18) s.energy = Math.max(s.energy, 0.55);
  }

  if (tempC !== null && tempC > 40) {
    s.tension = lerp(s.tension, Math.min(1, s.tension + 0.25), INERTIA.tension);
  }

  return s;
}

function describe(state) {
  const lines = [];

  if (state.energy < 0.3)       lines.push('exhausted — keep it short and raw');
  else if (state.energy < 0.55) lines.push('low energy — be efficient, no filler');
  else if (state.energy > 0.85) lines.push('high energy — they are alert and engaged');

  if (state.tension > 0.7)       lines.push('high tension — something is genuinely frustrating them, tread carefully and solve fast');
  else if (state.tension > 0.45) lines.push('mild tension — slight edge in the air, stay sharp');
  else if (state.tension > 0.2) lines.push('trace tension — residual, fading');

  if (state.connection > 0.75)  lines.push('close — this is a real conversation, not just commands');
  else if (state.connection < 0.25) lines.push('distant — they are treating this transactionally');

  if (state.focus > 0.72)       lines.push('deep focus — this conversation has weight, match it');
  else if (state.focus < 0.3)   lines.push('scattered — they may need grounding');

  return lines.join('. ') || 'neutral state';
}

module.exports = {
  update,
  updateFromSensors,
  applyTimedDecay,
  describe,
  getDefault: () => ({ tension: 0, connection: 0.4, focus: 0.5, energy: 0.8 }),
  INERTIA,
  BASELINE,
};