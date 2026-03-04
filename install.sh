#!/data/data/com.termux/files/usr/bin/bash
set -e

RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[1;33m'
BLD='\033[1m'
RST='\033[0m'

echo ""
echo -e "${BLD}  ██╗  ██╗██╗██████╗  █████╗ ${RST}"
echo -e "${BLD}  ██║ ██╔╝██║██╔══██╗██╔══██╗${RST}"
echo -e "${BLD}  █████╔╝ ██║██████╔╝███████║${RST}"
echo -e "${BLD}  ██╔═██╗ ██║██╔══██╗██╔══██║${RST}"
echo -e "${BLD}  ██║  ██╗██║██║  ██║██║  ██║${RST}"
echo -e "${BLD}  ╚═╝  ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝${RST}"
echo ""
echo -e "  ${YLW}android. terminal. alive.${RST}"
echo ""

if [ ! -d "/data/data/com.termux" ]; then
  echo -e "${RED}error: run this inside Termux${RST}"
  exit 1
fi

echo -e "${GRN}[1/5]${RST} updating packages..."
pkg update -y -q 2>/dev/null || true

echo -e "${GRN}[2/5]${RST} installing dependencies..."
pkg install -y nodejs git 2>/dev/null

echo -e "${GRN}[3/5]${RST} cloning droidclaw..."
if [ -d "$HOME/droidclaw" ]; then
  echo "  existing install found — pulling latest..."
  cd "$HOME/droidclaw" && git pull -q
else
  git clone --depth=1 https://github.com/levilyf/droidclaw.git "$HOME/droidclaw" -q
fi

echo -e "${GRN}[4/5]${RST} installing node modules..."
cd "$HOME/droidclaw" && npm install --silent 2>/dev/null

echo -e "${GRN}[5/5]${RST} setting up kira command..."
mkdir -p "$HOME/.local/bin"
cat > "$HOME/.local/bin/kira" << 'CMD'
#!/data/data/com.termux/files/usr/bin/bash
cd "$HOME/droidclaw" && node src/index.js "$@"
CMD
chmod +x "$HOME/.local/bin/kira"

SHELL_RC="$HOME/.bashrc"
[ -f "$HOME/.zshrc" ] && SHELL_RC="$HOME/.zshrc"
if ! grep -q "\.local/bin" "$SHELL_RC" 2>/dev/null; then
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SHELL_RC"
fi
export PATH="$HOME/.local/bin:$PATH"

echo ""
echo -e "${BLD}  done.${RST}"
echo ""
echo -e "  type ${YLW}kira${RST} to start"
echo ""
echo -e "  ${RED}tip:${RST} install Termux:API for full features"
echo -e "  f-droid.org/en/packages/com.termux.api/"
echo ""
