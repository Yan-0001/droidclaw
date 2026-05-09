'use strict';
const mind = require('../../src/core/mind');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function testMemoryDecay() {
  console.log('Testing SOMA Memory Decay...');
  mind.init();
  
  for(let i=0; i<100; i++) {
    mind.storeMemory(`mem ${i}`, { importance: 0.1, emotion: 0.1 });
  }
  
  const countBefore = mind.stats().memories;
  mind.decayMemories();
  console.log(`Memories before: ${countBefore}, after: ${mind.stats().memories}`);
  console.log('✅ Decay function executed without crash.');
}

async function testBeliefConsistency() {
  console.log('\nTesting Belief Consistency...');
  
  mind.upsertBelief('identity', 'loves coding', { confidence: 0.5 });
  mind.upsertBelief('identity', 'loves coding', { confidence: 0.8 }); 
  
  const beliefs = mind.getBeliefs('identity');
  const loveCoding = beliefs.find(b => b.value === 'loves coding');
  
  if (loveCoding && loveCoding.confidence > 0.5) {
    console.log(`✅ SUCCESS: Confidence increased to ${loveCoding.confidence.toFixed(2)}`);
  } else {
    console.error('❌ FAILURE: Confidence did not increase.');
  }
  
  mind.contradictBelief('identity', 'loves coding', 'hates coding');
  const filtered = mind.getBeliefs('identity');
  if (!filtered.find(b => b.value === 'loves coding')) {
    console.log('✅ SUCCESS: Contradicted belief hidden.');
  } else {
    console.error('❌ FAILURE: Contradicted belief still visible.');
  }
}

testMemoryDecay().then(testBeliefConsistency).catch(console.error);
