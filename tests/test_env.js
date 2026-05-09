'use strict';
const config = require('../src/config');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_FILE = path.join(os.homedir(), '.droidclaw', 'config.json');

async function testEnvSupport() {
  console.log('Testing Environment Variable Support...');
  
  // 1. Set up a dummy env var
  process.env.TEST_API_KEY = 'env_secret_123';
  
  // 2. Set config to use this env var
  config.set('apiKey', '$TEST_API_KEY');
  
  // 3. Load and verify resolution
  const resolved = config.load();
  if (resolved.apiKey === 'env_secret_123') {
    console.log('✅ SUCCESS: Env var resolved correctly.');
  } else {
    console.error('❌ FAILURE: Env var did not resolve. Got:', resolved.apiKey);
  }
  
  // 4. Verify raw value is still preserved on disk
  const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  if (raw.apiKey === '$TEST_API_KEY') {
    console.log('✅ SUCCESS: Raw value preserved on disk.');
  } else {
    console.error('❌ FAILURE: Raw value was overwritten on disk. Got:', raw.apiKey);
  }
}

testEnvSupport().catch(console.error);
