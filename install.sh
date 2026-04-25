#!/data/data/com.termux/files/usr/bin/bash
set -e

RST='\033[0m'
GRN='\033[0;32m'
YLW='\033[0;33m'
RED='\033[0;31m'
DIM='\033[2m'
BLD='\033[1m'
TEL='\033[0;36m'

clear

echo ""
echo -e "${TEL}  ╭─────────────────────────────────╮${RST}"
echo -e "${TEL}  │  ◈  K I R A  —  Install        │${RST}"
echo -e "${TEL}  ╰─────────────────────────────────╯${RST}"
echo ""
echo -e "${DIM}  Built on a Samsung A13 by an 18-year-old in India.${RST}"
echo -e "${DIM}  Runs entirely on your Android phone via Termux.${RST}"
echo ""

if [ ! -d "/data/data/com.termux" ]; then
  echo -e "${RED}  ✕ This must be run inside Termux.${RST}"
  echo -e "${DIM}  Install Termux from F-Droid: f-droid.org/en/packages/com.termux/${RST}"
  exit 1
fi

echo -e "${GRN}[1/5]${RST} Updating packages..."
pkg update -y -q 2>/dev/null || true
echo -e "      ${GRN}✓${RST}"

echo -e "${GRN}[2/5]${RST} Installing dependencies..."
pkg install -y -q nodejs git curl 2>/dev/null || {
  echo -e "${RED}  ✕ Failed to install dependencies.${RST}"
  echo -e "${DIM}  Try: pkg install nodejs git curl${RST}"
  exit 1
}
echo -e "      ${GRN}✓${RST} nodejs $(node --version)"

echo -e "${GRN}[3/5]${RST} Getting Kira..."
DROIDCLAW="$HOME/droidclaw"
if [ -d "$DROIDCLAW/.git" ]; then
  echo -e "      existing install — updating..."
  cd "$DROIDCLAW"
  git pull -q origin main 2>/dev/null || echo -e "      ${YLW}⚠ using existing version${RST}"
else
  [ -d "$DROIDCLAW" ] && mv "$DROIDCLAW" "${DROIDCLAW}_backup_$(date +%s)"
  git clone -q https://github.com/levilyf/droidclaw.git "$DROIDCLAW" || {
    echo -e "${RED}  ✕ Clone failed. Check your connection.${RST}"
    exit 1
  }
fi
echo -e "      ${GRN}✓${RST}"

cd "$DROIDCLAW"

echo -e "${GRN}[4/5]${RST} Installing node modules..."
npm install -q --no-audit --no-fund 2>/dev/null || {
  echo -e "${RED}  ✕ npm install failed.${RST}"
  echo -e "${DIM}  Try: cd ~/droidclaw && npm install${RST}"
  exit 1
}
echo -e "      ${GRN}✓${RST}"

echo -e "${GRN}[5/5]${RST} Setting up kira command..."
mkdir -p "$HOME/.local/bin"
mkdir -p "$HOME/.droidclaw"

cat > "$HOME/.local/bin/kira" << 'KIRA_CMD'
#!/data/data/com.termux/files/usr/bin/node
'use strict';
const { spawn, spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const DROIDCLAW = path.join(os.homedir(), 'droidclaw');
const DOT_DIR   = path.join(os.homedir(), '.droidclaw');
const PID_FILE  = path.join(DOT_DIR, 'daemon.pid');
const LOCK_FILE = path.join(DOT_DIR, 'daemon.lock');
const LOG_FILE  = path.join(DOT_DIR, 'daemon.log');
const DAEMON    = path.join(DROIDCLAW, 'src', 'daemon.js');
const INDEX     = path.join(DROIDCLAW, 'src', 'index.js');

if (!fs.existsSync(DOT_DIR)) fs.mkdirSync(DOT_DIR, { recursive: true });

const args = process.argv.slice(2);

if (args[0] === 'stop')   { stopDaemon();  process.exit(0); }
if (args[0] === 'status') { showStatus();  process.exit(0); }
if (args[0] === 'logs') {
  const n = parseInt(args[1]) || 30;
  try {
    const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean);
    console.log(lines.slice(-n).join('\n'));
  } catch { console.log('no logs yet'); }
  process.exit(0);
}

ensureDaemon();
launchUI();

function isDaemonRunning() {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim());
    if (!pid || isNaN(pid)) return false;
    process.kill(pid, 0);
    return pid;
  } catch { return false; }
}

function ensureDaemon() {
  if (isDaemonRunning()) return;
  try { fs.unlinkSync(PID_FILE);  } catch {}
  try { fs.unlinkSync(LOCK_FILE); } catch {}
  if (!fs.existsSync(DAEMON)) return; // daemon not installed yet
  const log   = fs.openSync(LOG_FILE, 'a');
  const child = spawn(process.execPath, [DAEMON], {
    detached: true,
    stdio:    ['ignore', log, log],
    cwd:      DROIDCLAW,
  });
  child.unref();
  try { fs.writeFileSync(PID_FILE, String(child.pid)); } catch {}
}

function stopDaemon() {
  const pid = isDaemonRunning();
  if (!pid) { console.log('daemon not running'); return; }
  try {
    process.kill(pid, 'SIGTERM');
    try { fs.unlinkSync(PID_FILE);  } catch {}
    try { fs.unlinkSync(LOCK_FILE); } catch {}
    console.log('daemon stopped');
  } catch { console.log('could not stop daemon'); }
}

function showStatus() {
  const pid = isDaemonRunning();
  if (pid) {
    console.log('daemon: running (pid ' + pid + ')');
    try {
      const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean);
      console.log('\nlast activity:');
      lines.slice(-5).forEach(l => console.log(' ', l));
    } catch {}
  } else {
    console.log('daemon: not running — start with: kira');
  }
}

function launchUI() {
  if (!fs.existsSync(INDEX)) {
    console.error('Kira not found at ' + DROIDCLAW);
    console.error('Run the install script again: bash install.sh');
    process.exit(1);
  }
  const child = spawnSync(process.execPath, [INDEX, ...args], {
    stdio: 'inherit',
    cwd:   DROIDCLAW,
  });
  process.exit(child.status || 0);
}
KIRA_CMD

chmod +x "$HOME/.local/bin/kira"

for RC in "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.zshrc" "$HOME/.profile"; do
  if [ -f "$RC" ] && ! grep -q '\.local/bin' "$RC" 2>/dev/null; then
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$RC"
  fi
done
export PATH="$HOME/.local/bin:$PATH"

echo -e "      ${GRN}✓${RST}"

echo ""
echo -e "  ${BLD}Done.${RST}"
echo ""
echo -e "  ${YLW}kira${RST}           start"
echo -e "  ${YLW}kira status${RST}    what Kira's been thinking"
echo -e "  ${YLW}kira logs${RST}      daemon log"
echo -e "  ${YLW}kira stop${RST}      stop daemon"
echo ""
echo -e "  ${DIM}For full features:${RST}"
echo -e "  ${DIM}· Termux:API — f-droid.org/en/packages/com.termux.api/${RST}"
echo -e "  ${DIM}· KiraService — github.com/levilyf/droidclaw/releases${RST}"
echo ""
echo -e "  ${TEL}Type 'kira' to begin.${RST}"
echo ""
