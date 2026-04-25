'use strict';
/**
 * GROUND — Continuous Grounding Layer
 *
 * Runs every 60 seconds in the background.
 * Watches everything on the device passively.
 * Never waits to be asked.
 *
 * This is what separates Kira from every other AI:
 * she observes your life even when you're not talking to her.
 *
 * After one week she knows things about you
 * that you never told her. She noticed.
 */

const fs  = require('fs');
const os  = require('os');
const { spawnSync } = require('child_process');

const KIRA_BASE     = 'http://localhost:7070';
const POLL_INTERVAL = 60 * 1000; // 60 seconds

let _timer    = null;
let _running  = false;
let _onUpdate = null; // callback when significant change detected

// ── HTTP helper ───────────────────────────────────────────────────────────────
function _get(endpoint) {
  try {
    const result = spawnSync('curl', ['-s', '-m', '5', `${KIRA_BASE}${endpoint}`], {
      encoding: 'utf8', timeout: 6000
    });
    if (result.error || result.status !== 0) return null;
    return JSON.parse(result.stdout);
  } catch { return null; }
}

function _post(endpoint, body) {
  try {
    const result = spawnSync('curl', [
      '-s', '-m', '5', '-X', 'POST',
      `${KIRA_BASE}${endpoint}`,
      '-H', 'Content-Type: application/json',
      '-d', JSON.stringify(body)
    ], { encoding: 'utf8', timeout: 6000 });
    if (result.error || result.status !== 0) return null;
    return JSON.parse(result.stdout);
  } catch { return null; }
}

// ── Termux API helper ─────────────────────────────────────────────────────────
function _termux(cmd) {
  try {
    const ENV    = { ...process.env, PATH: '/data/data/com.termux/files/usr/bin:' + (process.env.PATH || '') };
    const result = spawnSync(cmd, [], { encoding: 'utf8', timeout: 5000, shell: true, env: ENV });
    if (result.error || result.status !== 0) return null;
    return JSON.parse(result.stdout);
  } catch { return null; }
}

// ── Detect current app from widget class names ────────────────────────────────
// Each Android app uses unique widget class prefixes
function _detectAppFromClasses(nodes) {
  if (!nodes || !nodes.length) return null;

  const classes = nodes.map(n => (n.class || '').toLowerCase()).join(' ');
  const text    = nodes.map(n => (n.text || '').toLowerCase()).join(' ');

  // check class prefixes — most reliable
  const classMap = [
    ['com.termux',                ['termux', 'com.termux']],
    ['com.whatsapp',              ['whatsapp']],
    ['com.instagram.android',     ['instagram']],
    ['org.telegram.messenger',    ['telegram', 'org.telegram']],
    ['com.twitter.android',       ['twitter', 'com.twitter']],
    ['com.google.android.youtube',['youtube']],
    ['com.android.chrome',        ['chromium', 'com.chrome', 'org.chromium']],
    ['com.spotify.music',         ['spotify']],
    ['com.discord',               ['discord']],
    ['com.google.android.gm',     ['gmail', 'com.google.android.gm']],
    ['com.netflix.mediaclient',   ['netflix']],
    ['com.snapchat.android',      ['snapchat']],
    ['com.facebook.katana',       ['facebook']],
    ['com.samsung.android.dialer',['dialer', 'incallui']],
    ['com.android.settings',      ['com.android.settings']],
  ];

  for (const [pkg, patterns] of classMap) {
    if (patterns.some(p => classes.includes(p) || text.includes(p))) return pkg;
  }

  // Termux-specific: ESC key is unique to Termux extra keys bar
  if (text.includes('esc') || text.includes('ctrl') || text.includes('tab')) return 'com.termux';

  // fallback: detect from screen text patterns
  if (text.includes('whatsapp') || text.includes('message')) return 'com.whatsapp';
  if (text.includes('instagram') || text.includes('reel')) return 'com.instagram.android';
  if (text.includes('youtube') || text.includes('subscribe')) return 'com.google.android.youtube';
  if (text.includes('gmail') || text.includes('inbox')) return 'com.google.android.gm';

  return null;
}

// ── Vision-based screen analysis ─────────────────────────────────────────────
// Takes screenshot, sends to LLM vision, returns structured understanding
// Image processed in memory — never written to disk
async function _analyzeScreen() {
  try {
    // get screenshot as base64 from KiraService
    const res = _get('/screenshot_image');
    if (!res || !res.image) return null;

    const base64 = res.image.replace(/\n/g, '');
    if (base64.length < 100) return null;

    // load config for API key
    const cfg = require('../config').load();
    if (!cfg.apiKey) return null;

    // use dedicated vision model for screen analysis
    // separate from the main conversation model
    const visionModel = 'meta/llama-3.2-11b-vision-instruct';

    // call LLM vision API
    const body = {
      model:      visionModel,
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${base64}` }
          },
          {
            type: 'text',
            text: `Analyze this Android screenshot carefully.
Respond in JSON only, no explanation:
{
  "app_name": "exact app name visible on screen, or null if uncertain",
  "app_package": "com.example.app if you can identify it confidently, or null",
  "activity": "coding|social|media|reading|gaming|calling|idle|unknown",
  "context": "one sentence describing exactly what is visible, be literal not interpretive",
  "visible_text": "key text literally visible on screen, max 80 chars"
}

Rules:
- If you cannot identify the app with high confidence, use null
- Do not guess or infer app names from partial text
- activity must be one of the exact values listed
- context should describe what you literally see, not what you think they're doing`
          }
        ]
      }]
    };

    const apiRes = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!apiRes.ok) return null;

    const data   = await apiRes.json();
    const text   = data.choices?.[0]?.message?.content || '';
    const clean  = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);

  } catch { return null; }
}

// ── Take a snapshot of device state ──────────────────────────────────────────
async function _snapshot() {
  const now  = Date.now();
  const hour = new Date().getHours();
  const snap = {
    ts:           now,
    hour,
    minute:       new Date().getMinutes(),
    dayOfWeek:    new Date().getDay(), // 0=Sun
    // app context
    currentApp:   null,
    screenContent: [],
    // notifications
    notifications: [],
    newNotifCount: 0,
    notifApps:    [],
    // physical
    sensors:      null,
    facingUp:     null,
    isMoving:     null,
    // device
    battery:      null,
    charging:     false,
    temp:         null,
    wifi:         null,
    // derived
    activity:     'unknown', // coding | social | media | reading | idle | sleeping
    physicalState: 'unknown', // active | still | pocketed
  };

  // ── Screen understanding via vision ──────────────────────────────────────
  // Take screenshot, analyze with LLM vision — works for ANY app
  // Never saved to disk — processed in memory and discarded
  const screenVision = await _analyzeScreen();
  if (screenVision) {
    snap.currentApp    = screenVision.app_package || null;
    snap.appName       = screenVision.app_name    || null;
    snap.screenContext = screenVision.context      || null;
    snap.activity      = screenVision.activity     || 'unknown';
    snap.screenText    = screenVision.visible_text || null;
  }

  // ── Notifications ─────────────────────────────────────────────────────────
  const notifs = _get('/notifications');
  if (notifs && notifs.length) {
    snap.notifications = notifs.slice(0, 20).map(n => ({
      pkg:   n.package,
      title: (n.title || '').slice(0, 60),
      text:  (n.text  || '').slice(0, 100),
      ts:    n.timestamp,
    }));
    snap.notifApps    = [...new Set(notifs.map(n => n.package).filter(Boolean))];
    snap.newNotifCount = notifs.length;
  }

  // ── Physical sensors ──────────────────────────────────────────────────────
  const sensors = _get('/sensors');
  if (sensors) {
    snap.sensors = sensors;
    // detect if phone is face down (proximity near + accelerometer z negative)
    if (sensors.proximity !== undefined) {
      snap.facingUp = sensors.proximity > 3; // >3cm = face up
    }
    // detect movement from accelerometer
    if (sensors.accelerometer) {
      const { x, y, z } = sensors.accelerometer;
      const magnitude    = Math.sqrt((x||0)**2 + (y||0)**2 + (z||0)**2);
      snap.isMoving      = magnitude > 12; // gravity = 9.8, movement adds to this
    }
  }

  // ── Battery & device ──────────────────────────────────────────────────────
  const bat = _termux('termux-battery-status');
  if (bat) {
    snap.battery  = bat.percentage;
    snap.charging = bat.status === 'CHARGING' || bat.status === 'FULL';
    snap.temp     = bat.temperature;
  }

  const wifi = _termux('termux-wifi-connectioninfo');
  if (wifi && wifi.ssid && wifi.ssid !== '<unknown ssid>') {
    snap.wifi = wifi.ssid;
  }

  // ── Derive fallback activity if vision didn't get it ─────────────────────
  if (!snap.activity || snap.activity === 'unknown') {
    snap.activity = _deriveActivity(snap);
  }
  snap.physicalState = _derivePhysical(snap);

  return snap;
}

// ── Derive what the user is doing ─────────────────────────────────────────────
function _deriveActivity(snap) {
  // if vision analysis already determined activity — trust it
  if (snap.activity && snap.activity !== 'unknown') return snap.activity;

  // fallback from notification apps
  const notifApps = snap.notifApps || [];
  if (notifApps.some(a => a.includes('whatsapp') || a.includes('telegram') || a.includes('instagram'))) return 'social';

  const hour = snap.hour;
  if ((hour >= 0 && hour <= 5) && !snap.isMoving) return 'sleeping';
  if (!snap.isMoving) return 'idle';

  return 'unknown';
}

// ── Derive physical state ─────────────────────────────────────────────────────
function _derivePhysical(snap) {
  if (snap.facingUp === false) return 'pocketed'; // face down = in pocket
  if (snap.isMoving) return 'active';
  return 'still';
}

// ── In-memory state for change detection only ────────────────────────────────
// Ground writes device state to KIRA_MIND directly.
// This local state is only used to diff prev vs current snapshot.
let _prevSnapshot = null;

function loadState() {
  return { lastSnapshot: _prevSnapshot, currentActivity: _prevSnapshot?.activity || 'unknown' };
}

function saveState(state) {
  _prevSnapshot = state.lastSnapshot || null;
}

// ── Detect significant changes ────────────────────────────────────────────────
function _detectChanges(prev, curr) {
  const changes = [];

  if (prev && curr.currentApp !== prev.currentApp) {
    changes.push({
      type: 'app_switch',
      from: prev.currentApp,
      to:   curr.currentApp,
      at:   curr.ts,
    });
  }

  if (prev && curr.activity !== prev.activity) {
    changes.push({
      type: 'activity_change',
      from: prev.activity,
      to:   curr.activity,
      at:   curr.ts,
    });
  }

  if (prev && curr.newNotifCount > (prev.newNotifCount || 0)) {
    const newApps = curr.notifApps.filter(a => !(prev.notifApps || []).includes(a));
    if (newApps.length) {
      changes.push({
        type:  'new_notifications',
        apps:  newApps,
        count: curr.newNotifCount - (prev.newNotifCount || 0),
        at:    curr.ts,
      });
    }
  }

  if (prev && curr.battery !== null && prev.battery !== null) {
    if (curr.battery <= 15 && prev.battery > 15) {
      changes.push({ type: 'battery_critical', level: curr.battery, at: curr.ts });
    }
    if (curr.charging && !prev.charging) {
      changes.push({ type: 'started_charging', at: curr.ts });
    }
    if (!curr.charging && prev.charging) {
      changes.push({ type: 'unplugged', level: curr.battery, at: curr.ts });
    }
  }

  if (prev && curr.physicalState !== prev.physicalState) {
    changes.push({
      type: 'physical_change',
      from: prev.physicalState,
      to:   curr.physicalState,
      at:   curr.ts,
    });
  }

  return changes;
}

// ── Main poll loop ────────────────────────────────────────────────────────────
async function _poll() {
  if (!_running) return;

  try {
    const state   = loadState();
    const prev    = state.lastSnapshot;
    const curr    = await _snapshot();

    const changes = _detectChanges(prev, curr);

    saveState({ lastSnapshot: curr, currentActivity: curr.activity });

    // write directly to KIRA_MIND — the single source of truth
    try {
      const mind = require('./mind');
      mind.setState('device_battery',     curr.battery);
      mind.setState('device_charging',    curr.charging);
      mind.setState('device_temp',        curr.temp);
      mind.setState('device_activity',    curr.activity);
      mind.setState('device_app_name',    curr.appName   || null);
      mind.setState('device_app_package', curr.currentApp || null);
      mind.setState('device_context',     curr.screenContext || null);
      mind.setState('device_physical',    curr.physicalState);
      mind.setState('device_notif_count', curr.newNotifCount || 0);
      mind.setState('device_notif_apps',  curr.notifApps || []);
      mind.setState('device_hour',        curr.hour);
      mind.setState('device_wifi',        curr.wifi || null);
    } catch {}

    // notify proactive handler of changes
    if (changes.length && _onUpdate) {
      _onUpdate(changes, curr);
    }

  } catch {}
}

// ── Public API ────────────────────────────────────────────────────────────────
function start(onUpdate) {
  if (_running) return;
  _running  = true;
  _onUpdate = onUpdate || null;
  _poll();
  _timer = setInterval(_poll, POLL_INTERVAL);
}

function stop() {
  _running = false;
  if (_timer) { clearInterval(_timer); _timer = null; }
}

// read current device state from MIND — single source of truth
function getCurrentState() {
  try {
    const mind = require('./mind');
    return {
      activity:    mind.getState('device_activity'),
      appName:     mind.getState('device_app_name'),
      battery:     mind.getState('device_battery'),
      charging:    mind.getState('device_charging'),
      notifCount:  mind.getState('device_notif_count'),
      notifApps:   mind.getState('device_notif_apps'),
      physical:    mind.getState('device_physical'),
      context:     mind.getState('device_context'),
    };
  } catch { return {}; }
}

module.exports = { start, stop, getCurrentState };
