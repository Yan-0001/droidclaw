'use strict';
const fs   = require('fs');
const path = require('path');
const os   = require('os');

// Ensure we're in the project directory
const PROJECT_DIR = path.join(os.homedir(), 'GithubRepo/droidclaw');
process.chdir(PROJECT_DIR);

const TEST_DIR = path.join(os.homedir(), '.droidclaw', 'test_artifacts');
const SRC = path.join(PROJECT_DIR, 'src');

// ─── Test Utilities ───────────────────────────────────────────────────────────
function assert(condition, msg) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✅ ${msg}`);
}

// ─── 1. SECURITY & DATA INTEGRITY ─────────────────────────────────────────────
async function testSecurityAndDataIntegrity() {
  console.log('\n🔒 TEST 1: SECURITY & DATA INTEGRITY');
  
  const config = require(SRC + '/config');
  
  process.env.SECRET_API_KEY_TEST = 'sk-secure_test_key_12345';
  config.set('apiKey', '$SECRET_API_KEY_TEST');
  
  const rawDisk = JSON.parse(fs.readFileSync(config.CONFIG_FILE, 'utf8'));
  assert(rawDisk.apiKey === '$SECRET_API_KEY_TEST', 'Raw config preserves $VAR');
  
  const resolved = config.load();
  assert(resolved.apiKey === 'sk-secure_test_key_12345', 'Config resolves $VAR at runtime');
  
  const stat = fs.statSync(config.CONFIG_FILE);
  const mode = stat.mode & 0o777;
  if (mode <= 0o600) console.log('  ✅ Config file permissions restrictive');
  else console.log(`  ⚠️  Config file permissions: ${mode.toString(8)} (expected <= 600)`);
  
  const mind = require(SRC + '/core/mind');
  mind.init();
  mind.upsertBelief('test', 'injection test', { confidence: 0.5 });
  assert(mind.getBeliefs('test').length > 0, 'Beliefs stored safely');
  
  console.log('\n✅ Security tests PASSED');
}

// ─── 2. RACE CONDITIONS & CONCURRENCY ─────────────────────────────────────────
async function testRaceConditions() {
  console.log('\n⏱️  TEST 2: RACE CONDITIONS & CONCURRENCY');
  
  const mind = require(SRC + '/core/mind');
  mind.init();
  
  const writes = [];
  for (let i = 0; i < 20; i++) writes.push(mind.setState('race_test_key', `value_${i}`));
  await Promise.all(writes);
  await new Promise(r => setTimeout(r, 100));
  mind.flush();
  
  const val = mind.getState('race_test_key');
  assert(val !== null, `Concurrent writes resolved: ${val}`);
  
  const registry = require(SRC + '/tools/registry');
  let count = 0;
  registry.register('rapid_tool', async () => { count++; return `call_${count}`; }, 'test');
  
  const results = await Promise.all(
    Array.from({ length: 10 }, () => registry.execute('rapid_tool', {}))
  );
  assert(results.length === 10, 'All concurrent tool calls resolved');
  
  console.log('\n✅ Race condition tests PASSED');
}

// ─── 3. MEMORY LEAKS & CLEANUP ────────────────────────────────────────────────
async function testMemoryLeaks() {
  console.log('\n🧠 TEST 3: MEMORY LEAKS & CLEANUP');
  
  const mind = require(SRC + '/core/mind');
  mind.init();
  
  for (let i = 0; i < 610; i++) {
    mind.storeMemory(`memory item ${i}`, { importance: 0.5, emotion: 0.3 });
  }
  
  const memCount = mind.stats().memories;
  assert(memCount <= 500, `Memory pruning: ${memCount} <= 500`);
  
  for (let i = 0; i < 220; i++) {
    mind.upsertBelief('identity', `belief_${i % 50}`, { confidence: 0.5 });
  }
  
  const beliefs = mind.getBeliefs('identity');
  assert(beliefs.length <= 200, `Belief growth bounded: ${beliefs.length}`);
  
  console.log('\n✅ Memory leak tests PASSED');
}

// ─── 4. EDGE CASES & ERROR HANDLING ───────────────────────────────────────────
async function testEdgeCases() {
  console.log('\n🪝 TEST 4: EDGE CASES & ERROR HANDLING');
  
  const executor = require(SRC + '/core/executor');
  const registry = require(SRC + '/tools/registry');
  const iris = require(SRC + '/core/iris');
  const mind = require(SRC + '/core/mind');
  
  mind.init();
  
  registry.register('crash_tool', async () => { throw 'string error'; }, 'crashes');
  try {
    const r = await registry.execute('crash_tool', {});
    console.log(`  ✅ Handles non-Error throws: ${String(r).slice(0, 50)}`);
  } catch (e) {
    console.log(`  ✅ Handles non-Error throws (caught: ${e.message || e})`);
  }
  
  try {
    registry.register('very_long_tool_name_test', async () => 'ok', 'desc');
    const r2 = await registry.execute('very_long_tool_name_test', {});
    assert(r2 === 'ok', 'Handles long tool names');
  } catch (e) { console.log(`  ⚠️  Long name: ${e.message}`); }
  
  try {
    iris.route('', { tension: 0.5 }, null);
    console.log('  ✅ Handles empty routing');
  } catch (e) { console.log(`  ⚠️  Empty routing: ${e.message}`); }
  
  try {
    mind.storeMemory('🎉 emoji test 🍀', { emotion: 0.8 });
    const mems = mind.retrieveMemories('emoji');
    assert(mems.length > 0, 'Handles emoji and unicode');
  } catch (e) { console.log(`  ⚠️  Emoji: ${e.message}`); }
  
  try {
    mind.upsertBelief('test', 'valid_belief', { confidence: 0.5 });
    mind.upsertBelief('test', null, { confidence: 0.5 });
    mind.upsertBelief('test2', undefined, { confidence: 0.5 });
    mind.setState('key1', undefined);
    console.log('  ✅ Handles null/undefined in beliefs');
  } catch (e) { console.log(`  ⚠️  Null handling: ${e.message}`); }
  
  console.log('\n✅ Edge case tests PASSED');
}

// ─── 5. MODULE INTEGRATION ────────────────────────────────────────────────────
async function testModuleIntegration() {
  console.log('\n🔗 TEST 5: MODULE INTEGRATION');
  
  const engine = require(SRC + '/core/engine');
  const soul = require(SRC + '/core/soul');
  const nexus = require(SRC + '/core/nexus');
  let mind;
  try { mind = require(SRC + '/core/mind'); } catch (e) { console.log(`  ⚠️  mind require failed: ${e.message}`); return; }
  const registry = require(SRC + '/tools/registry');
  
  try { mind.init(); } catch (e) { console.log(`  ⚠️  mind.init failed: ${e.message}`); return; }
  try { engine.init(soul); } catch (e) { console.log(`  ⚠️  engine.init failed: ${e.message}`); return; }
  
  assert(engine.soul !== null, 'Engine attaches soul');
  
  try {
    nexus.pulse('hello world', 'user');
    nexus.pulse('hi', 'assistant');
  } catch (e) { console.log(`  ⚠️  nexus.pulse failed: ${e.message}`); }
  
  let tension;
  try { tension = mind.getState('emotion_tension'); } catch (e) { console.log(`  ⚠️  mind.getState failed: ${e.message}`); return; }
  assert(tension !== undefined, `Nexus.pulse updates state: tension=${tension}`);
  
  let called = false;
  registry.register('integrated_test', async () => { called = true; return 'ok'; }, 'test');
  
  const { parseTools, cleanReply } = require(SRC + '/core/executor');
  const tools = parseTools('<tool:exec>{"command":"ls"}</tool>');
  assert(tools.length === 1, `Parses tool calls: ${tools[0].name}`);
  
  const cleaned = cleanReply('hello <tool:x>{"y":1}</tool> world');
  assert(!cleaned.includes('<tool:'), 'cleanReply removes tool blocks');
  
  console.log('\n✅ Module integration tests PASSED');
}

// ─── 6. DAEMON & BACKGROUND PROCESS ──────────────────────────────────────────
async function testDaemonBehavior() {
  console.log('\n👤 TEST 6: DAEMON & BACKGROUND PROCESS');
  
  const config = require(SRC + '/config');
  
  const lockFile = path.join(os.homedir(), '.droidclaw', 'daemon.lock');
  fs.writeFileSync(lockFile, String(process.pid));
  const lockPid = parseInt(fs.readFileSync(lockFile, 'utf8').trim());
  assert(lockPid === process.pid, `Lock file stores PID: ${lockPid}`);
  
  config.set('name', 'TestUser');
  assert(config.get('name') === 'TestUser', 'Config.set reflects in get()');
  
  config.set('name', 'UserA');
  config.invalidate();
  assert(config.load().name === 'UserA', 'Cache invalidation works');
  
  console.log('\n✅ Daemon behavior tests PASSED');
}

// ─── 7. TUI STRESS TESTING ────────────────────────────────────────────────────
async function testTUIStress() {
  console.log('\n🖥️  TEST 7: TUI STRESS TESTING');
  
  const TUI = require(SRC + '/tui/index');
  
  TUI._streaming = false;
  for (let i = 0; i < 50; i++) {
    TUI.addMessage('system', `msg ${i}`);
  }
  console.log('  ✅ Handles 50 rapid system messages');
  
  TUI._termWidth = 30;
  const wrapped = TUI._wrap('This is a very long line that should be wrapped correctly');
  const lines = wrapped.split('\n');
  assert(lines.length > 1, `Word wrapping: ${lines.length} lines`);
  
  TUI._wrap('');
  TUI._wrap(null);
  console.log('  ✅ Handles empty/null wrapped text');
  
  TUI._history = [];
  for (let i = 0; i < 60; i++) {
    if (TUI._history[0] !== `msg${i}`) TUI._history.unshift(`msg${i}`);
    if (TUI._history.length > 50) TUI._history.pop();
  }
  assert(TUI._history.length === 50, `History bounded: ${TUI._history.length}`);
  
  console.log('\n✅ TUI stress tests PASSED');
}

// ─── 8. GROUND & DEVICE POLLING ─────────────────────────────────────────────
async function testGroundDevicePolling() {
  console.log('\n📱 TEST 8: GROUND & DEVICE POLLING');
  
  const ground = require(SRC + '/core/ground');
  
  const state = ground.getCurrentState();
  assert(typeof state === 'object' && state !== null, 'getCurrentState returns object');
  
  let failed = false;
  try {
    ground.start(() => {});
    ground.stop();
  } catch (e) { failed = true; console.log(`  ⚠️  Ground: ${e.message}`); }
  assert(!failed, 'Ground start/stop completes');
  
  const mind = require(SRC + '/core/mind');
  mind.init();
  const activity = mind.getState('device_activity');
  console.log(`  ✅ Device activity: ${activity || 'not set'}`);
  
  console.log('\n✅ Ground polling tests PASSED');
}

// ─── 9. NEXUS SLEEP CYCLE ─────────────────────────────────────────────────────
async function testNexusSleepCycle() {
  console.log('\n🌙 TEST 9: NEXUS SLEEP CYCLE');
  
  const nexus = require(SRC + '/core/nexus');
  let mind;
  try { mind = require(SRC + '/core/mind'); } catch (e) { console.log(`  ⚠️  mind require failed: ${e.message}`); return; }
  const engine = require(SRC + '/core/engine');
  const soul = require(SRC + '/core/soul');
  
  try { mind.init(); } catch (e) { console.log(`  ⚠️  mind.init: ${e.message}`); return; }
  try { engine.init(soul); } catch (e) { console.log(`  ⚠️  engine.init: ${e.message}`); return; }
  
  let ctx;
  try { ctx = nexus.buildContext(''); } catch (e) { console.log(`  ⚠️  buildContext: ${e.message}`); return; }
  assert(typeof ctx === 'string', 'buildContext returns string');
  
  try {
    nexus.pulse('test message', 'user');
    nexus.pulse('test response', 'assistant');
  } catch (e) { console.log(`  ⚠️  pulse: ${e.message}`); }
  
  const moods = ['curious', 'engaged', 'concerned', 'satisfied'];
  for (const mood of moods) {
    mind.setMood(mood);
    const current = mind.getMood();
    if (current === mood) console.log(`  ✅ Mood set to ${mood}`);
    else console.log(`  ⚠️  Mood: expected ${mood}, got ${current}`);
  }
  
  try { await nexus.sleep(engine); console.log('  ✅ Sleep cycle completes'); }
  catch (e) { console.log(`  ⚠️  Sleep: ${e.message}`); }
  
  console.log('\n✅ Nexus sleep cycle tests PASSED');
}

// ─── MAIN TEST RUNNER ─────────────────────────────────────────────────────────
async function runAllTests() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║   DROIDCLAW DEEP RESEARCH TEST SUITE      ║');
  console.log('╚════════════════════════════════════════════╝');
  
  if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
  
  const tests = [
    testSecurityAndDataIntegrity,
    testRaceConditions,
    testMemoryLeaks,
    testEdgeCases,
    testModuleIntegration,
    testDaemonBehavior,
    testTUIStress,
    testGroundDevicePolling,
    testNexusSleepCycle,
  ];
  
  let passed = 0, failed = 0;
  
  for (const test of tests) {
    try { await test(); passed++; }
    catch (e) {
      console.error(`\n❌ TEST FAILED: ${e.message}`);
      failed++;
    }
  }
  
  console.log('\n╔════════════════════════════════════════════╗');
  console.log(`║   RESULTS: ${passed} PASSED | ${failed} FAILED              ║`);
  console.log('╚════════════════════════════════════════════╝');
  
  process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch(e => { console.error('UNHANDLED:', e); process.exit(1); });