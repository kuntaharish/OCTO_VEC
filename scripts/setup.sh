#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# OCTO VEC — Setup Script (macOS / Linux)
# Checks for required dependencies and offers to install missing ones.
# Usage:  bash setup.sh   or   chmod +x setup.sh && ./setup.sh
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

ok()   { echo -e "  ${GREEN}✔${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
fail() { echo -e "  ${RED}✘${NC} $1"; }
info() { echo -e "  ${CYAN}ℹ${NC} $1"; }

MISSING=()

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║       OCTO VEC — Dependency Check        ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── Detect OS & package manager ──────────────────────────────────────────────

OS="$(uname -s)"
ARCH="$(uname -m)"
PKG_MGR=""

if [[ "$OS" == "Darwin" ]]; then
    PLATFORM="macOS"
    if command -v brew &>/dev/null; then
        PKG_MGR="brew"
    fi
elif [[ "$OS" == "Linux" ]]; then
    PLATFORM="Linux"
    if command -v apt-get &>/dev/null; then
        PKG_MGR="apt"
    elif command -v dnf &>/dev/null; then
        PKG_MGR="dnf"
    elif command -v yum &>/dev/null; then
        PKG_MGR="yum"
    elif command -v pacman &>/dev/null; then
        PKG_MGR="pacman"
    elif command -v apk &>/dev/null; then
        PKG_MGR="apk"
    fi
else
    PLATFORM="Unknown"
fi

echo -e "  Platform: ${BOLD}$PLATFORM ($ARCH)${NC}"
echo -e "  Package manager: ${BOLD}${PKG_MGR:-none detected}${NC}"
echo ""

# ── 1. Node.js ───────────────────────────────────────────────────────────────

echo -e "${BOLD}[1/5] Node.js (>= 20.0.0)${NC}"
if command -v node &>/dev/null; then
    NODE_VER=$(node -v | sed 's/v//')
    NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
    if [[ "$NODE_MAJOR" -ge 20 ]]; then
        ok "Node.js v$NODE_VER"
    else
        fail "Node.js v$NODE_VER (need >= 20)"
        MISSING+=("node")
    fi
else
    fail "Node.js not found"
    MISSING+=("node")
fi

# ── 2. npm ───────────────────────────────────────────────────────────────────

echo -e "${BOLD}[2/5] npm${NC}"
if command -v npm &>/dev/null; then
    NPM_VER=$(npm -v)
    ok "npm v$NPM_VER"
else
    fail "npm not found"
    MISSING+=("npm")
fi

# ── 3. Git ───────────────────────────────────────────────────────────────────

echo -e "${BOLD}[3/5] Git${NC}"
if command -v git &>/dev/null; then
    GIT_VER=$(git --version | awk '{print $3}')
    ok "Git v$GIT_VER"
else
    fail "Git not found"
    MISSING+=("git")
fi

# ── 4. C++ Build Tools (optional — for node-pty terminal) ────────────────────

echo -e "${BOLD}[4/5] C++ Build Tools (optional — for web terminal)${NC}"
HAS_BUILD_TOOLS=false

if [[ "$OS" == "Darwin" ]]; then
    if xcode-select -p &>/dev/null; then
        ok "Xcode Command Line Tools"
        HAS_BUILD_TOOLS=true
    else
        warn "Xcode CLT not found (web terminal won't work without it)"
        MISSING+=("build-tools")
    fi
elif [[ "$OS" == "Linux" ]]; then
    if command -v g++ &>/dev/null || command -v c++ &>/dev/null; then
        ok "C++ compiler found"
        HAS_BUILD_TOOLS=true
    else
        warn "C++ compiler not found (web terminal won't work without it)"
        MISSING+=("build-tools")
    fi
fi

# ── 5. Docker (optional — for security scans) ────────────────────────────────

echo -e "${BOLD}[5/5] Docker (optional — for security scans)${NC}"
if command -v docker &>/dev/null; then
    if docker info &>/dev/null 2>&1; then
        DOCKER_VER=$(docker --version | awk '{print $3}' | sed 's/,//')
        ok "Docker v$DOCKER_VER (running)"
    else
        warn "Docker installed but not running"
    fi
else
    info "Docker not installed (security scan features won't be available)"
fi

echo ""

# ── Summary & install ────────────────────────────────────────────────────────

if [[ ${#MISSING[@]} -eq 0 ]]; then
    echo -e "${GREEN}${BOLD}  All dependencies satisfied!${NC}"
    echo ""
    echo -e "  Install OCTO VEC globally:"
    echo -e "    ${CYAN}npm install -g octo-vec${NC}"
    echo ""
    echo -e "  Then start it:"
    echo -e "    ${CYAN}octo-vec${NC}"
    echo ""
    exit 0
fi

echo -e "${YELLOW}${BOLD}  Missing dependencies: ${MISSING[*]}${NC}"
echo ""

# ── Offer to install ─────────────────────────────────────────────────────────

install_node() {
    if [[ "$OS" == "Darwin" ]]; then
        if [[ "$PKG_MGR" == "brew" ]]; then
            echo "  Running: brew install node@22"
            brew install node@22
        else
            echo -e "  ${YELLOW}Install Homebrew first:${NC}"
            echo '    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
            echo "  Then: brew install node@22"
            return 1
        fi
    elif [[ "$OS" == "Linux" ]]; then
        case "$PKG_MGR" in
            apt)
                echo "  Running: curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs"
                curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
                sudo apt-get install -y nodejs
                ;;
            dnf|yum)
                echo "  Running: curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash - && sudo $PKG_MGR install -y nodejs"
                curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
                sudo "$PKG_MGR" install -y nodejs
                ;;
            pacman)
                echo "  Running: sudo pacman -S nodejs npm"
                sudo pacman -S --noconfirm nodejs npm
                ;;
            apk)
                echo "  Running: apk add nodejs npm"
                sudo apk add nodejs npm
                ;;
            *)
                echo "  Please install Node.js 22+ manually: https://nodejs.org"
                return 1
                ;;
        esac
    fi
}

install_git() {
    if [[ "$OS" == "Darwin" ]]; then
        if [[ "$PKG_MGR" == "brew" ]]; then
            echo "  Running: brew install git"
            brew install git
        else
            echo "  Install Xcode CLT (includes git): xcode-select --install"
            return 1
        fi
    elif [[ "$OS" == "Linux" ]]; then
        case "$PKG_MGR" in
            apt)    sudo apt-get install -y git ;;
            dnf|yum) sudo "$PKG_MGR" install -y git ;;
            pacman) sudo pacman -S --noconfirm git ;;
            apk)    sudo apk add git ;;
            *) echo "  Please install Git manually."; return 1 ;;
        esac
    fi
}

install_build_tools() {
    if [[ "$OS" == "Darwin" ]]; then
        echo "  Running: xcode-select --install"
        xcode-select --install 2>/dev/null || true
        echo "  Follow the dialog to install Xcode Command Line Tools."
    elif [[ "$OS" == "Linux" ]]; then
        case "$PKG_MGR" in
            apt)
                echo "  Running: sudo apt-get install -y build-essential python3"
                sudo apt-get install -y build-essential python3
                ;;
            dnf|yum)
                echo "  Running: sudo $PKG_MGR groupinstall -y 'Development Tools'"
                sudo "$PKG_MGR" groupinstall -y "Development Tools"
                ;;
            pacman)
                echo "  Running: sudo pacman -S base-devel"
                sudo pacman -S --noconfirm base-devel
                ;;
            apk)
                echo "  Running: apk add build-base python3"
                sudo apk add build-base python3
                ;;
            *) echo "  Please install C++ build tools (gcc/g++, make, python3) manually."; return 1 ;;
        esac
    fi
}

for dep in "${MISSING[@]}"; do
    case "$dep" in
        node|npm)
            read -rp "  Install Node.js 22? [y/N] " yn
            if [[ "$yn" =~ ^[Yy]$ ]]; then
                install_node || true
            fi
            ;;
        git)
            read -rp "  Install Git? [y/N] " yn
            if [[ "$yn" =~ ^[Yy]$ ]]; then
                install_git || true
            fi
            ;;
        build-tools)
            read -rp "  Install C++ build tools? (optional, for web terminal) [y/N] " yn
            if [[ "$yn" =~ ^[Yy]$ ]]; then
                install_build_tools || true
            fi
            ;;
    esac
done

echo ""
echo -e "${BOLD}  Setup complete!${NC} Install OCTO VEC:"
echo -e "    ${CYAN}npm install -g octo-vec${NC}"
echo -e "    ${CYAN}octo-vec${NC}"
echo ""
