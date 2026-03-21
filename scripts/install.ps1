# ──────────────────────────────────────────────────────────────────────────────
# OCTO VEC — One-liner installer (Windows)
# Usage:  powershell -c "irm https://raw.githubusercontent.com/akhil2129/OCTO_VEC/main/scripts/install.ps1 | iex"
# ──────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  ╔═══════════════════════════════════════╗" -ForegroundColor White
Write-Host "  ║          OCTO VEC Installer            ║" -ForegroundColor Cyan
Write-Host "  ║   AI Agent Orchestration Platform     ║" -ForegroundColor White
Write-Host "  ╚═══════════════════════════════════════╝" -ForegroundColor White
Write-Host ""

function Write-OK($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-WARN($msg) { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-FAIL($msg) { Write-Host "  [FAIL] $msg" -ForegroundColor Red }
function Write-Step($msg)  { Write-Host "  -> $msg" -ForegroundColor Cyan }

$hasWinget = [bool](Get-Command winget -ErrorAction SilentlyContinue)

# ── 1. Check / Install Node.js ──────────────────────────────────────────────

$needNode = $false
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue

if ($nodeCmd) {
    $nodeVer = (node -v).TrimStart("v")
    $nodeMajor = [int]($nodeVer.Split(".")[0])
    if ($nodeMajor -ge 20) {
        Write-OK "Node.js v$nodeVer"
    } else {
        Write-WARN "Node.js v$nodeVer found (need >= 20)"
        $needNode = $true
    }
} else {
    $needNode = $true
}

if ($needNode) {
    Write-Step "Installing Node.js 22..."
    if ($hasWinget) {
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
        # Refresh PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        Write-OK "Node.js installed via winget"
    } else {
        Write-FAIL "winget not found. Please install Node.js 22+ manually:"
        Write-Host "    https://nodejs.org/en/download/" -ForegroundColor Yellow
        Write-Host "    Then re-run this installer."
        exit 1
    }
}

# ── 2. Check / Install Git ──────────────────────────────────────────────────

$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if ($gitCmd) {
    $gitVer = (git --version) -replace "git version ", ""
    Write-OK "Git v$gitVer"
} else {
    Write-Step "Installing Git..."
    if ($hasWinget) {
        winget install Git.Git --accept-package-agreements --accept-source-agreements
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        Write-OK "Git installed via winget"
    } else {
        Write-FAIL "winget not found. Please install Git manually:"
        Write-Host "    https://git-scm.com/download/win" -ForegroundColor Yellow
        exit 1
    }
}

# ── 3. Check npm ─────────────────────────────────────────────────────────────

$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if ($npmCmd) {
    $npmVer = npm -v
    Write-OK "npm v$npmVer"
} else {
    Write-FAIL "npm not found. It should come with Node.js."
    Write-Host "    Try closing and reopening PowerShell, or reinstall Node.js." -ForegroundColor Yellow
    exit 1
}

# ── 4. Install OCTO VEC ─────────────────────────────────────────────────────

Write-Host ""
Write-Step "Installing OCTO VEC globally..."
npm install -g octo-vec

Write-Host ""
Write-Host "  [OK] OCTO VEC installed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "  Start it with:" -ForegroundColor White
Write-Host "    octo-vec" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Dashboard opens automatically at http://localhost:4600" -ForegroundColor DarkGray
Write-Host "  Docs: https://github.com/akhil2129/OCTO_VEC" -ForegroundColor DarkGray
Write-Host ""
