'use strict';
const { spawnSync } = require('child_process');

const TERMUX_BIN = '/data/data/com.termux/files/usr/bin';
const ENV = { ...process.env, PATH: `${TERMUX_BIN}:${process.env.PATH || ''}` };

function _run(cmd) {
  const result = spawnSync(cmd, [], {
    encoding: 'utf8',
    timeout:  8000,
    shell:    true,
    env:      ENV,
  });
  if (result.error || result.status !== 0) return null;
  return result.stdout;
}

// read phone state and return structured sensor data
function read() {
  const result = {
    battery:    null,
    temp:       null,
    hour:       new Date().getHours(),
    charging:   false,
    pickups:    null,
    wifi:       null,
    bodyState:  'unknown'
  };

  // battery
  try {
    const out = _run('termux-battery-status');
    if (out) {
      const bat = JSON.parse(out);
      result.battery  = bat.percentage;
      result.temp     = bat.temperature;
      result.charging = bat.status === 'CHARGING' || bat.status === 'FULL';
    }
  } catch {}

  // wifi
  try {
    const out = _run('termux-wifi-connectioninfo');
    if (out) {
      const wifi = JSON.parse(out);
      result.wifi = wifi.ssid || null;
    }
  } catch {}

  // derive body state
  result.bodyState = deriveBodyState(result);

  return result;
}

function deriveBodyState(data) {
  const { battery, temp, hour, charging } = data;

  if (battery !== null && battery < 15 && !charging) return 'critical — dying';
  if (battery !== null && battery < 30 && !charging) return 'low power — conserving';
  if (temp !== null && temp > 42)                    return 'overheating — stressed';
  if (hour >= 1 && hour <= 5)                        return 'deep night — minimal';
  if (hour >= 23 || hour === 0)                      return 'late night — winding down';
  if (hour >= 6 && hour <= 8)                        return 'early morning — coming online';
  if (hour >= 9 && hour <= 18)                       return 'daytime — full capacity';
  if (hour >= 19 && hour <= 22)                      return 'evening — reflective';

  return 'nominal';
}

// describe body state for soul.js injection
function describe(sensorData) {
  const lines = [];
  const { battery, temp, hour, charging, wifi, bodyState } = sensorData;

  lines.push(`body state: ${bodyState}`);
  if (battery !== null) lines.push(`power: ${battery}%${charging ? ' (charging)' : ''}`);
  if (temp !== null)    lines.push(`temp: ${temp}°C`);
  if (!wifi)            lines.push('offline — no wifi');

  return lines.join(' · ');
}

module.exports = { read, describe, deriveBodyState };
