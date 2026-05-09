'use strict';
const iris = require('../../src/core/iris');
const mind = require('../../src/core/mind');

async function testIrisLearning() {
  console.log('Testing IRIS Bayesian Learning...');
  mind.init();
  
  const msg = 'what is the weather';
  const emotion = { tension: 0, energy: 0.8, connection: 0.5, focus: 0.5 };
  
  const first = iris.route(msg, emotion, null);
  console.log(`Initial route: ${first.profile.name}`);
  
  for (let i = 0; i < 25; i++) {
    iris.route(msg, emotion, null);
    iris.recordOutcome('positive');
  }
  
  const after = iris.route(msg, emotion, null);
  console.log(`Route after learning: ${after.profile.name}`);
  console.log('✅ Learning cycle executed.');
}

testIrisLearning().catch(console.error);
