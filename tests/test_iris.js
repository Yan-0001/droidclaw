'use strict';
const iris = require('../src/core/iris');

const testCases = [
  { msg: 'hi', expected: 'REFLEX' },
  { msg: 'how do I fix this npm error', expected: 'SHARP' },
  { msg: 'i feel very sad and lonely today', expected: 'GENTLE' },
  { msg: 'explain the complex relationship between quantum physics and relativity', expected: 'DEEP' },
  { msg: 'what is the weather', expected: 'FAST' },
];

async function testRouting() {
  console.log('Testing IRIS Routing Logic...');
  let passed = 0;

  for (const { msg, expected } of testCases) {
    // Use a dummy emotion state
    const result = iris.route(msg, { tension: 0, energy: 0.8, connection: 0.5, focus: 0.5 }, null);
    const profile = result.profile.name.toUpperCase();
    
    if (profile === expected) {
      console.log(`✅ PASS: "${msg}" -> ${profile}`);
      passed++;
    } else {
      console.log(`❌ FAIL: "${msg}" -> Expected ${expected}, got ${profile}`);
    }
  }

  console.log(`\nResult: ${passed}/${testCases.length} passed.`);
}

testRouting().catch(console.error);
