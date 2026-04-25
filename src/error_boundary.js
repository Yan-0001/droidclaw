'use strict';
/**
 * Global error boundary
 * Turns crashes into friendly messages for public users
 */

const c = {
  red:  s => `\x1b[31m${s}\x1b[0m`,
  dim:  s => `\x1b[2m${s}\x1b[0m`,
  bold: s => `\x1b[1m${s}\x1b[0m`,
};

const KNOWN_ERRORS = [
  {
    match: /Cannot find module.*mind/,
    msg: 'MIND database module not found.',
    fix: 'Make sure all files from the latest release are in src/core/',
  },
  {
    match: /Cannot find module.*nexus/,
    msg: 'NEXUS module not found.',
    fix: 'Make sure all files from the latest release are in src/core/',
  },
  {
    match: /ECONNREFUSED.*7070/,
    msg: 'KiraService is not running.',
    fix: 'Open the KiraService app and enable the accessibility service in Android Settings → Accessibility.',
  },
  {
    match: /ECONNREFUSED|ENOTFOUND|ETIMEDOUT/,
    msg: 'Cannot reach the API.',
    fix: 'Check your internet connection and API key with /config',
  },
  {
    match: /api.*key|apiKey|401|403/i,
    msg: 'API authentication failed.',
    fix: 'Your API key may be invalid or expired. Run /config to update it.',
  },
  {
    match: /ENOENT.*config/,
    msg: 'Config file not found.',
    fix: 'Run the install script again: bash install.sh',
  },
  {
    match: /Cannot find module/,
    msg: 'A required module is missing.',
    fix: 'Try: cd ~/droidclaw && npm install',
  },
  {
    match: /out of memory|heap/i,
    msg: 'Out of memory.',
    fix: 'Close other apps and try again. Kira needs at least 200MB free RAM.',
  },
];

function friendlyError(err) {
  const msg = err?.message || String(err);
  const known = KNOWN_ERRORS.find(e => e.match.test(msg));

  process.stdout.write('\n');
  process.stdout.write(c.red('  ✕ ') + c.bold(known ? known.msg : 'Something went wrong.') + '\n');

  if (known?.fix) {
    process.stdout.write(c.dim(`  → ${known.fix}`) + '\n');
  }

  process.stdout.write('\n');
  process.stdout.write(c.dim('  Technical details (for bug reports):') + '\n');
  process.stdout.write(c.dim(`  ${msg.split('\n')[0]}`) + '\n');
  process.stdout.write('\n');
  process.stdout.write(c.dim('  Report issues: github.com/levilyf/droidclaw/issues') + '\n');
  process.stdout.write('\n');
}

function install() {
  process.on('uncaughtException', err => {
    friendlyError(err);
    process.exit(1);
  });

  process.on('unhandledRejection', err => {
    friendlyError(err);
    process.exit(1);
  });
}

module.exports = { install, friendlyError };
