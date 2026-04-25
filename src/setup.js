'use strict';
/**
 * Setup wizard — runs on first launch
 * Guides any stranger through getting Kira working
 * No assumptions. No jargon. Just clear steps.
 */

const readline = require('readline');
const fs       = require('fs');
const os       = require('os');
const { spawnSync } = require('child_process');

const config = require('./config');

const ENV = { ...process.env, PATH: '/data/data/com.termux/files/usr/bin:' + (process.env.PATH || '') };

// ── Colors without chalk dependency during setup ──────────────────────────────
const c = {
  teal:   s => `\x1b[36m${s}\x1b[0m`,
  amber:  s => `\x1b[33m${s}\x1b[0m`,
  green:  s => `\x1b[32m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
  reset:  s => `\x1b[0m${s}\x1b[0m`,
};

function print(msg = '') { process.stdout.write(msg + '\n'); }
function gap()           { print(); }

// ── Readline helper ───────────────────────────────────────────────────────────
function ask(prompt, defaultVal = '') {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    const display = defaultVal ? `${prompt} ${c.dim(`[${defaultVal}]`)} ` : `${prompt} `;
    rl.question(display, answer => {
      rl.close();
      resolve(answer.trim() || defaultVal);
    });
  });
}

function askSecret(prompt) {
  return new Promise(resolve => {
    process.stdout.write(prompt + ' ');
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    let input = '';
    process.stdin.on('data', function handler(ch) {
      if (ch === '\r' || ch === '\n') {
        process.stdin.setRawMode?.(false);
        process.stdin.pause();
        process.stdin.removeListener('data', handler);
        process.stdout.write('\n');
        resolve(input);
      } else if (ch === '\u0003') {
        process.exit(0);
      } else if (ch === '\u007f') {
        if (input.length > 0) { input = input.slice(0, -1); process.stdout.write('\u0008 \u0008'); }
      } else {
        input += ch;
        process.stdout.write('*');
      }
    });
  });
}

// ── Detection helpers ─────────────────────────────────────────────────────────
function checkTermuxApi() {
  try {
    const result = spawnSync('termux-battery-status', [], { encoding: 'utf8', timeout: 4000, env: ENV });
    return !result.error && result.status === 0;
  } catch { return false; }
}

function checkKiraService() {
  try {
    const result = spawnSync('curl', ['-s', '-m', '3', 'http://localhost:7070/health'], { encoding: 'utf8', timeout: 4000 });
    if (result.error || result.status !== 0) return false;
    const data = JSON.parse(result.stdout);
    return data.status === 'ok';
  } catch { return false; }
}

async function testApiKey(baseUrl, apiKey, model) {
  try {
    const body = JSON.stringify({
      model,
      max_tokens: 10,
      messages: [{ role: 'user', content: 'hi' }],
    });
    const result = spawnSync('curl', [
      '-s', '-m', '15',
      '-X', 'POST',
      `${baseUrl}/chat/completions`,
      '-H', 'Content-Type: application/json',
      '-H', `Authorization: Bearer ${apiKey}`,
      '-d', body,
    ], { encoding: 'utf8', timeout: 16000 });

    if (result.error) return { ok: false, error: result.error.message };
    const data = JSON.parse(result.stdout);
    if (data.error) return { ok: false, error: data.error.message || JSON.stringify(data.error) };
    if (data.choices?.[0]?.message?.content) return { ok: true };
    return { ok: false, error: 'unexpected response format' };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function testTelegram(token) {
  try {
    const result = spawnSync('curl', ['-s', '-m', '8', `https://api.telegram.org/bot${token}/getMe`], { encoding: 'utf8', timeout: 9000 });
    if (result.error) return { ok: false };
    const data = JSON.parse(result.stdout);
    return { ok: data.ok, name: data.result?.first_name, username: data.result?.username };
  } catch { return { ok: false }; }
}

// ── Main setup flow ───────────────────────────────────────────────────────────
async function run() {
  console.clear();

  print(c.teal('  ╭─────────────────────────────────╮'));
  print(c.teal('  │  ◈  K I R A  —  Setup          │'));
  print(c.teal('  ╰─────────────────────────────────╯'));
  gap();
  print(c.dim('  Let\'s get you set up. This takes about 2 minutes.'));
  gap();

  // ── Step 1: Name ──────────────────────────────────────────────────────────
  print(c.bold('  Step 1 of 4 — Who are you?'));
  gap();
  const existingName = config.get('name') || '';
  const name = await ask(c.amber('  Your name:'), existingName || '');
  if (!name) { print(c.red('  Name is required.')); process.exit(1); }
  config.set('name', name);
  gap();

  // ── Step 2: API setup ─────────────────────────────────────────────────────
  print(c.bold('  Step 2 of 4 — AI Model'));
  gap();
  print('  Kira works with any OpenAI-compatible API.');
  print('  The easiest free option: NVIDIA NIM (no credit card needed)');
  print(c.dim('  → Sign up at: integrate.api.nvidia.com'));
  gap();

  const providers = [
    { label: 'NVIDIA NIM (free, recommended)', url: 'https://integrate.api.nvidia.com/v1', model: 'minimaxai/minimax-m2.7' },
    { label: 'OpenAI',                         url: 'https://api.openai.com/v1',           model: 'gpt-4o-mini' },
    { label: 'OpenRouter',                      url: 'https://openrouter.ai/api/v1',        model: 'mistralai/mistral-7b-instruct' },
    { label: 'Ollama (local)',                  url: 'http://localhost:11434/v1',            model: 'llama3.2' },
    { label: 'Custom',                          url: '',                                    model: '' },
  ];

  print('  Choose your provider:');
  providers.forEach((p, i) => print(`    ${c.amber(String(i + 1))}. ${p.label}`));
  gap();

  const choice = await ask(c.amber('  Enter number:'), '1');
  const idx    = Math.max(0, Math.min(parseInt(choice) - 1, providers.length - 1));
  let   { url: baseUrl, model } = providers[idx];

  if (!baseUrl) baseUrl = await ask(c.amber('  API base URL:'), config.get('baseUrl') || '');
  if (!model)   model   = await ask(c.amber('  Model name:'),   config.get('model')   || '');
  gap();

  print('  Enter your API key:');
  print(c.dim('  (input hidden)'));
  const existingKey = config.get('apiKey') || '';
  let apiKey = await askSecret(c.amber('  API key:'));
  if (!apiKey && existingKey) {
    print(c.dim('  keeping existing key'));
    apiKey = existingKey;
  }
  if (!apiKey) { print(c.red('  API key is required.')); process.exit(1); }
  gap();

  // test the key
  process.stdout.write(c.dim('  Testing API connection... '));
  const test = await testApiKey(baseUrl, apiKey, model);
  if (test.ok) {
    print(c.green('✓'));
  } else {
    print(c.red('✗'));
    print(c.red(`  Error: ${test.error}`));
    print(c.dim('  Check your API key and try again. Setup saved what you entered.'));
  }

  config.set('apiKey',   apiKey);
  config.set('baseUrl',  baseUrl);
  config.set('model',    model);
  gap();

  // ── Step 3: Detect capabilities ───────────────────────────────────────────
  print(c.bold('  Step 3 of 4 — Capabilities'));
  gap();

  process.stdout.write('  Checking Termux:API... ');
  const hasTermuxApi = checkTermuxApi();
  if (hasTermuxApi) {
    print(c.green('✓ found'));
    config.set('hasTermuxApi', true);
  } else {
    print(c.amber('✗ not found'));
    print(c.dim('  Install from F-Droid: f-droid.org/en/packages/com.termux.api/'));
    print(c.dim('  Kira works without it but has limited phone control.'));
    config.set('hasTermuxApi', false);
  }

  process.stdout.write('  Checking KiraService... ');
  const hasKiraService = checkKiraService();
  if (hasKiraService) {
    print(c.green('✓ running'));
  } else {
    print(c.amber('✗ not running'));
    print(c.dim('  Download KiraService.apk from github.com/levilyf/droidclaw/releases'));
    print(c.dim('  Install it and enable the accessibility service in Android Settings.'));
    print(c.dim('  Kira works without it but cannot read your screen or control apps.'));
  }
  gap();

  // ── Step 4: Telegram (optional) ───────────────────────────────────────────
  print(c.bold('  Step 4 of 4 — Telegram (optional)'));
  gap();
  print('  Telegram lets Kira message you proactively — when something matters,');
  print('  she reaches out without you opening the app.');
  gap();

  const wantTelegram = await ask(c.amber('  Set up Telegram? (y/n):'), 'n');

  if (wantTelegram.toLowerCase() === 'y') {
    print(c.dim('  Create a bot at t.me/BotFather → /newbot → copy the token'));
    gap();
    const token = await ask(c.amber('  Bot token:'), config.get('telegramToken') || '');
    if (token) {
      process.stdout.write(c.dim('  Testing bot... '));
      const tgTest = await testTelegram(token);
      if (tgTest.ok) {
        print(c.green(`✓ ${tgTest.name} (@${tgTest.username})`));
        config.set('telegramToken', token);
        gap();
        print('  Now send any message to your bot on Telegram,');
        print('  then press Enter here to auto-detect your chat ID.');
        await ask(c.amber('  Press Enter when ready:'));

        // detect chat ID
        try {
          const result = spawnSync('curl', ['-s', '-m', '8', `https://api.telegram.org/bot${token}/getUpdates`], { encoding: 'utf8', timeout: 9000 });
          const data   = JSON.parse(result.stdout);
          const chatId = String(data.result?.slice(-1)[0]?.message?.chat?.id || '');
          if (chatId) {
            config.set('telegramChatId', chatId);
            print(c.green(`  ✓ Chat ID detected: ${chatId}`));
          } else {
            // fallback — check telegramAllowed
            const allowed = config.get('telegramAllowed') || [];
            if (allowed.length) {
              config.set('telegramChatId', String(allowed[0]));
              print(c.green(`  ✓ Chat ID from existing config: ${allowed[0]}`));
            } else {
              print(c.amber('  Could not auto-detect. Send a message to your bot first.'));
            }
          }
        } catch {
          print(c.amber('  Could not auto-detect chat ID. You can set it later in /config.'));
        }
      } else {
        print(c.red('✗ invalid token'));
        print(c.dim('  Skipping Telegram. You can set it up later with /config'));
      }
    }
  } else {
    print(c.dim('  Skipped. Set up anytime with /config'));
  }
  gap();

  // ── Done ──────────────────────────────────────────────────────────────────
  config.set('setupDone', true);
  config.set('device', spawnSync('getprop', ['ro.product.model'], { encoding: 'utf8', env: ENV }).stdout?.trim() || 'Android');

  print(c.teal('  ───────────────────────────────────'));
  print(c.green('  ✓ Setup complete'));
  gap();

  if (!test.ok) {
    print(c.amber('  Note: API test failed — double-check your key with /config'));
  }

  print(c.dim('  Commands: /config · /reload · /clear · /exit'));
  print(c.dim('  Ctrl+L to clear screen · ↑↓ for history'));
  gap();
  print(c.teal('  Starting Kira...'));
  gap();
}

module.exports = { run };
