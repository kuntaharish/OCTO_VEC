#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# OCTO VEC — One-liner installer (macOS / Linux)
# Usage:  curl -fsSL https://raw.githubusercontent.com/akhil2129/OCTO_VEC/main/scripts/install.sh | bash
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

echo ""
echo -e "${BOLD}  ╔═══════════════════════════════════════╗${NC}"
echo -e "${BOLD}  ║          ${CYAN}OCTO VEC${NC}${BOLD} Installer            ║${NC}"
echo -e "${BOLD}  ║   AI Agent Orchestration Platform     ║${NC}"
echo -e "${BOLD}  ╚═══════════════════════════════════════╝${NC}"
echo ""

OS="$(uname -s)"
ARCH="$(uname -m)"

ok()   { echo -e "  ${GREEN}✔${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
fail() { echo -e "  ${RED}✘${NC} $1"; }
step() { echo -e "  ${CYAN}→${NC} $1"; }

# ── Detect package manager ───────────────────────────────────────────────────

PKG_MGR=""
if [[ "$OS" == "Darwin" ]]; then
    command -v brew &>/dev/null && PKG_MGR="brew"
elif [[ "$OS" == "Linux" ]]; then
    if command -v apt-get &>/dev/null; then PKG_MGR="apt"
    elif command -v dnf &>/dev/null; then PKG_MGR="dnf"
    elif command -v yum &>/dev/null; then PKG_MGR="yum"
    elif command -v pacman &>/dev/null; then PKG_MGR="pacman"
    elif command -v apk &>/dev/null; then PKG_MGR="apk"
    fi
fi

# ── 1. Check / Install Node.js ──────────────────────────────────────────────

NEED_NODE=false
if command -v node &>/dev/null; then
    NODE_VER=$(node -v | sed 's/v//')
    NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
    if [[ "$NODE_MAJOR" -ge 20 ]]; then
        ok "Node.js v$NODE_VER"
    else
        warn "Node.js v$NODE_VER found (need >= 20)"
        NEED_NODE=true
    fi
else
    NEED_NODE=true
fi

if $NEED_NODE; then
    step "Installing Node.js 22..."
    if [[ "$OS" == "Darwin" ]]; then
        if [[ "$PKG_MGR" == "brew" ]]; then
            brew install node@22
            ok "Node.js installed via Homebrew"
        else
            fail "Homebrew not found. Install it first:"
            echo '    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
            echo "    Then re-run this installer."
            exit 1
        fi
    elif [[ "$OS" == "Linux" ]]; then
        case "$PKG_MGR" in
            apt)
                curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
                sudo apt-get install -y nodejs
                ;;
            dnf|yum)
                curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
                sudo "$PKG_MGR" install -y nodejs
                ;;
            pacman)
                sudo pacman -S --noconfirm nodejs npm
                ;;
            apk)
                sudo apk add nodejs npm
                ;;
            *)
                fail "Could not detect package manager. Install Node.js 22+ manually:"
                echo "    https://nodejs.org"
                exit 1
                ;;
        esac
        ok "Node.js installed"
    fi
fi

# ── 2. Check Git ─────────────────────────────────────────────────────────────

if command -v git &>/dev/null; then
    ok "Git $(git --version | awk '{print $3}')"
else
    step "Installing Git..."
    if [[ "$OS" == "Darwin" ]]; then
        if [[ "$PKG_MGR" == "brew" ]]; then
            brew install git
        else
            xcode-select --install 2>/dev/null || true
            echo "    Follow the dialog to install Xcode CLT (includes Git)."
        fi
    elif [[ "$OS" == "Linux" ]]; then
        case "$PKG_MGR" in
            apt)    sudo apt-get install -y git ;;
            dnf|yum) sudo "$PKG_MGR" install -y git ;;
            pacman) sudo pacman -S --noconfirm git ;;
            apk)    sudo apk add git ;;
        esac
    fi
    ok "Git installed"
fi

# ── 3. Check npm ─────────────────────────────────────────────────────────────

if command -v npm &>/dev/null; then
    ok "npm v$(npm -v)"
else
    fail "npm not found. It should come with Node.js."
    echo "    Try reinstalling Node.js: https://nodejs.org"
    exit 1
fi

# ── 4. Install OCTO VEC ─────────────────────────────────────────────────────

echo ""
step "Installing OCTO VEC globally..."
npm install -g octo-vec

echo ""
echo -e "${GREEN}${BOLD}  ✔ OCTO VEC installed successfully!${NC}"
echo ""
echo -e "  Start it with:"
echo -e "    ${CYAN}${BOLD}octo-vec${NC}"
echo ""
echo -e "  ${DIM}Dashboard opens automatically at http://localhost:4600${NC}"
echo -e "  ${DIM}Docs: https://github.com/akhil2129/OCTO_VEC${NC}"
echo ""
