'use strict';
/**
 * PROACTIVE — Real proactive intelligence
 *
 * Reads from KIRA_MIND. Speaks up when something matters.
 * Not on a schedule. When the data says something is worth saying.
 */

const mind   = require('./mind');
const ground = require('./ground');

let _tui   = null;
let _timer = null;
let _lastSpoke = 0;
const MIN_SPEAK_INTERVAL = 10 * 60 * 1000; // max once per 10 mins

function _shouldSpeak() {
  return Date.now() - _lastSpoke >= MIN_SPEAK_INTERVAL;
}

async function _check() {
  if (!_tui || !_shouldSpeak()) return;

  try {
    // check high priority kira observations
    const obs = mind.getKiraState('observation').filter(k => k.priority >= 3);
    if (obs.length) {
      _lastSpoke = Date.now();
      _tui.addMessage('agent', obs[0].value);
      mind.resolveKira(obs[0].id);
      return;
    }

    // check device triggers
    const battery  = mind.getState('device_battery');
    const charging = mind.getState('device_charging');
    const notifs   = mind.getState('device_notif_count');

    if (battery !== null && battery <= 15 && !charging) {
      _lastSpoke = Date.now();
      _tui.addMessage('agent', `battery at ${battery}%. want me to do anything before it dies?`);
      return;
    }

    if (notifs > 15) {
      _lastSpoke = Date.now();
      const apps = (mind.getState('device_notif_apps') || []).slice(0, 3).join(', ');
      _tui.addMessage('agent', `${notifs} notifications piling up from ${apps}. want me to check?`);
    }

  } catch {}
}

function start(deps) {
  _tui = deps.tui || null;

  // initialize kira's default goals if empty
  const goals = mind.getKiraState('goal');
  if (!goals.length) {
    mind.setKiraState('goal', 'understand why this person builds things', 1);
    mind.setKiraState('goal', 'learn their frustration patterns before they happen', 2);
    mind.setKiraState('goal', 'figure out what they need before they ask', 2);
  }

  // start ground observer
  ground.start((changes, curr) => {
    // high urgency changes go to kira observations
    changes.forEach(change => {
      if (change.type === 'battery_critical') {
        mind.setKiraState('observation', `battery critical at ${curr.battery}%`, 3);
      }
      if (change.type === 'activity_change' && change.from === 'coding' && change.to === 'social') {
        mind.setKiraState('thought', `switched from coding to social at ${new Date().toLocaleTimeString()}`, 1);
      }
    });
  });

  // check every 5 minutes
  _timer = setInterval(_check, 5 * 60 * 1000);
}

function stop() {
  if (_timer) { clearInterval(_timer); _timer = null; }
  ground.stop();
}

module.exports = { start, stop };
