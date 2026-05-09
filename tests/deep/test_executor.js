'use strict';
const executor = require('../../src/core/executor');
const registry = require('../../src/tools/registry');
const mind = require('../../src/core/mind');

async function testExecutorRecovery() {
  console.log('Testing Executor Recovery (LLM Loop Simulation)...');
  mind.init();
  
  let calls = 0;
  registry.register('mock_tool', async (args) => {
    calls++;
    if (calls < 2) return 'error: connection failed';
    return 'success: data retrieved';
  }, 'a test tool');
  
  const tools = [{ name: 'mock_tool', args: {} }];
  
  // Attempt 1: Should fail
  const res1 = await executor.execute('test task', tools, 'success');
  console.log(`Attempt 1: succeeded=${res1.succeeded}`);
  
  // Attempt 2: Should succeed (simulating LLM retrying)
  const res2 = await executor.execute('test task', tools, 'success');
  console.log(`Attempt 2: succeeded=${res2.succeeded}`);
  
  if (res2.succeeded && res2.lastResult.includes('success')) {
    console.log('✅ SUCCESS: Recovery flow works.');
  } else {
    console.error('❌ FAILURE: Recovery flow failed.');
  }
}

testExecutorRecovery().catch(console.error);
