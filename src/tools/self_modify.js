'use strict';
const registry = require('./registry');
const fs       = require('fs');
const path     = require('path');
const os       = require('os');

const BASE     = path.join(os.homedir(), 'droidclaw', 'src');
const PENDING  = path.join(os.homedir(), '.droidclaw', 'pending_patch.json');

// Files Kira is allowed to propose changes to
const ALLOWED = [
  'tools/exec.js',
  'tools/memory.js',
  'tools/toolmaker.js',
  'tools/scheduler_tools.js',
  'tools/agents.js',
  'tools/state_tools.js',
  'tools/realworld.js',
  'tools/semantic_memory.js',
  'tools/social.js',
  'tools/self_modify.js',
  'core/soul.js',
  'core/loop.js',
  'core/proactive.js',
  'core/state.js',
];

function isAllowed(file) {
  if (ALLOWED.includes(file)) return true;
  // allow any custom tool
  if (file.startsWith('tools/custom/')) return true;
  return false;
};

// Core files that need extra confirmation
const SENSITIVE = ['core/soul.js', 'core/loop.js'];

function makeDiff(original, proposed, filename) {
  const origLines = original.split('\n');
  const newLines  = proposed.split('\n');
  const diff      = [];

  diff.push(`--- a/${filename}`);
  diff.push(`+++ b/${filename}`);

  let i = 0, j = 0;
  while (i < origLines.length || j < newLines.length) {
    if (i < origLines.length && j < newLines.length && origLines[i] === newLines[j]) {
      diff.push(`  ${origLines[i]}`);
      i++; j++;
    } else if (j < newLines.length && (i >= origLines.length || origLines[i] !== newLines[j])) {
      diff.push(`+ ${newLines[j]}`);
      j++;
    } else {
      diff.push(`- ${origLines[i]}`);
      i++;
    }
  }

  const added   = diff.filter(l => l.startsWith('+')).length;
  const removed = diff.filter(l => l.startsWith('-')).length;
  return { diff: diff.join('\n'), added, removed };
}

// ─── Tools ───────────────────────────────────────────────────────────────────

registry.register('self_propose', async function(args) {
  const file    = args.file;
  const reason  = args.reason;
  const newCode = args.code;

  if (!file || !newCode || !reason) return 'error: file, reason, and code required';
  if (!isAllowed(file)) return 'error: ' + file + ' is not in the allowed list. allowed: ' + ALLOWED.join(', ');

  const fullPath = path.join(BASE, file);
  if (!fs.existsSync(fullPath)) return 'error: file not found: ' + fullPath;

  const original = fs.readFileSync(fullPath, 'utf8');
  const { diff, added, removed } = makeDiff(original, newCode, file);

  const isSensitive = SENSITIVE.includes(file);

  // Save pending patch
  const dir = path.join(os.homedir(), '.droidclaw');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(PENDING, JSON.stringify({
    file,
    fullPath,
    original,
    proposed: newCode,
    reason,
    diff,
    added,
    removed,
    sensitive: isSensitive,
    timestamp: new Date().toISOString(),
  }, null, 2));

  let out = '';
  out += 'proposed patch to ' + file + '\n';
  out += 'reason: ' + reason + '\n';
  out += '+' + added + ' lines  -' + removed + ' lines\n';
  if (isSensitive) out += '⚠ SENSITIVE FILE — core behavior will change\n';
  out += '\n' + diff + '\n\n';
  out += 'type "apply patch" to apply or "reject patch" to discard.';

  return out;
}, 'propose a code change to one of kira\'s own files — shows diff, waits for approval');

registry.register('self_apply', async function() {
  if (!fs.existsSync(PENDING)) return 'no pending patch. use self_propose first.';

  const patch = JSON.parse(fs.readFileSync(PENDING, 'utf8'));

  // Backup original
  const backupPath = patch.fullPath + '.backup';
  fs.writeFileSync(backupPath, patch.original);

  // Apply
  fs.writeFileSync(patch.fullPath, patch.proposed);
  fs.unlinkSync(PENDING);

  return 'patch applied to ' + patch.file + '\nbackup saved at ' + backupPath + '\nrestart kira for changes to take effect.';
}, 'apply the pending proposed patch — only call after user explicitly approves');

registry.register('self_reject', async function() {
  if (!fs.existsSync(PENDING)) return 'no pending patch to reject.';
  fs.unlinkSync(PENDING);
  return 'patch rejected and discarded.';
}, 'reject and discard the pending proposed patch');

registry.register('self_restore', async function(args) {
  const file = args.file;
  if (!file) return 'error: file required';

  const fullPath   = path.join(BASE, file);
  const backupPath = fullPath + '.backup';

  if (!fs.existsSync(backupPath)) return 'no backup found for ' + file;

  const backup = fs.readFileSync(backupPath, 'utf8');
  fs.writeFileSync(fullPath, backup);
  fs.unlinkSync(backupPath);

  return 'restored ' + file + ' from backup. restart kira for changes to take effect.';
}, 'restore a file from its backup after a bad patch');

registry.register('self_list_allowed', async function() {
  return 'files kira can propose changes to:\n' + ALLOWED.map(function(f) {
    return (SENSITIVE.includes(f) ? '⚠ ' : '  ') + f;
  }).join('\n') + '\n\n⚠ = sensitive file, core behavior';
}, 'list files kira is allowed to propose self-modifications to');

module.exports = {};
