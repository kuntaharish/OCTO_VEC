# ──────────────────────────────────────────────────────────────────────────────
# OCTO VEC — Setup Script (Windows PowerShell)
# Checks for required dependencies and offers to install missing ones.
# Usage:  powershell -ExecutionPolicy Bypass -File setup.ps1
# ──────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "SilentlyContinue"

function Write-OK($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-WARN($msg) { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-FAIL($msg) { Write-Host "  [FAIL] $msg" -ForegroundColor Red }
function Write-INFO($msg) { Write-Host "  [INFO] $msg" -ForegroundColor Cyan }

$missing = @()

Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor White
Write-Host "║       OCTO VEC — Dependency Check        ║" -ForegroundColor White
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor White
Write-Host ""

# ── 1. Node.js ───────────────────────────────────────────────────────────────

Write-Host "[1/5] Node.js (>= 20.0.0)" -ForegroundColor White
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) {
    $nodeVer = (node -v).TrimStart("v")
    $nodeMajor = [int]($nodeVer.Split(".")[0])
    if ($nodeMajor -ge 20) {
        Write-OK "Node.js v$nodeVer"
    } else {
        Write-FAIL "Node.js v$nodeVer (need >= 20)"
        $missing += "node"
    }
} else {
    Write-FAIL "Node.js not found"
    $missing += "node"
}

# ── 2. npm ───────────────────────────────────────────────────────────────────

Write-Host "[2/5] npm" -ForegroundColor White
$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if ($npmCmd) {
    $npmVer = npm -v
    Write-OK "npm v$npmVer"
} else {
    Write-FAIL "npm not found"
    $missing += "npm"
}

# ── 3. Git ───────────────────────────────────────────────────────────────────

Write-Host "[3/5] Git" -ForegroundColor White
$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if ($gitCmd) {
    $gitVer = (git --version) -replace "git version ", ""
    Write-OK "Git v$gitVer"
} else {
    Write-FAIL "Git not found"
    $missing += "git"
}

# ── 4. C++ Build Tools (optional) ───────────────────────────────────────────

Write-Host "[4/5] C++ Build Tools (optional — for web terminal)" -ForegroundColor White
$hasBuild = $false

# Check for cl.exe in PATH
$clCmd = Get-Command cl -ErrorAction SilentlyContinue
if ($clCmd) {
    Write-OK "MSVC compiler found"
    $hasBuild = $true
} else {
    # Check common VS install paths
    $vsPaths = @(
        "C:\Program Files\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC",
        "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC",
        "C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\VC\Tools\MSVC"
    )
    foreach ($p in $vsPaths) {
        if (Test-Path $p) {
            Write-OK "Visual Studio Build Tools found at $p"
            $hasBuild = $true
            break
        }
    }
}

if (-not $hasBuild) {
    Write-WARN "C++ build tools not found (web terminal won't work without them)"
    $missing += "build-tools"
}

# ── 5. Docker (optional) ────────────────────────────────────────────────────

Write-Host "[5/5] Docker (optional — for security scans)" -ForegroundColor White
$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
if ($dockerCmd) {
    $dockerInfo = docker info 2>&1
    if ($LASTEXITCODE -eq 0) {
        $dockerVer = (docker --version) -replace "Docker version ", "" -replace ",.*", ""
        Write-OK "Docker v$dockerVer (running)"
    } else {
        Write-WARN "Docker installed but not running"
    }
} else {
    Write-INFO "Docker not installed (security scan features won't be available)"
}

Write-Host ""

# ── Summary ──────────────────────────────────────────────────────────────────

if ($missing.Count -eq 0) {
    Write-Host "  All dependencies satisfied!" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Install OCTO VEC globally:" -ForegroundColor White
    Write-Host "    npm install -g octo-vec" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Then start it:" -ForegroundColor White
    Write-Host "    octo-vec" -ForegroundColor Cyan
    Write-Host ""
    exit 0
}

Write-Host "  Missing dependencies: $($missing -join ', ')" -ForegroundColor Yellow
Write-Host ""

# ── Offer to install ─────────────────────────────────────────────────────────

$hasWinget = Get-Command winget -ErrorAction SilentlyContinue

if ($missing -contains "node" -or $missing -contains "npm") {
    $yn = Read-Host "  Install Node.js 22? [y/N]"
    if ($yn -eq "y" -or $yn -eq "Y") {
        if ($hasWinget) {
            Write-Host "  Running: winget install OpenJS.NodeJS.LTS" -ForegroundColor Cyan
            winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
        } else {
            Write-Host "  Opening Node.js download page..." -ForegroundColor Cyan
            Start-Process "https://nodejs.org/en/download/"
            Write-Host "  Please install Node.js 22+, then re-run this script."
        }
    }
}

if ($missing -contains "git") {
    $yn = Read-Host "  Install Git? [y/N]"
    if ($yn -eq "y" -or $yn -eq "Y") {
        if ($hasWinget) {
            Write-Host "  Running: winget install Git.Git" -ForegroundColor Cyan
            winget install Git.Git --accept-package-agreements --accept-source-agreements
        } else {
            Write-Host "  Opening Git download page..." -ForegroundColor Cyan
            Start-Process "https://git-scm.com/download/win"
            Write-Host "  Please install Git, then re-run this script."
        }
    }
}

if ($missing -contains "build-tools") {
    $yn = Read-Host "  Install C++ Build Tools? (optional, for web terminal) [y/N]"
    if ($yn -eq "y" -or $yn -eq "Y") {
        if ($hasWinget) {
            Write-Host "  Running: winget install Microsoft.VisualStudio.2022.BuildTools" -ForegroundColor Cyan
            winget install Microsoft.VisualStudio.2022.BuildTools --accept-package-agreements --accept-source-agreements
            Write-Host ""
            Write-Host "  After install, open 'Visual Studio Installer' and add:" -ForegroundColor Yellow
            Write-Host "    'Desktop development with C++' workload" -ForegroundColor Yellow
        } else {
            Write-Host "  Opening VS Build Tools download page..." -ForegroundColor Cyan
            Start-Process "https://visualstudio.microsoft.com/visual-cpp-build-tools/"
            Write-Host "  Install and select 'Desktop development with C++' workload."
        }
    }
}

Write-Host ""
Write-Host "  Setup complete! After installing missing dependencies, run:" -ForegroundColor White
Write-Host "    npm install -g octo-vec" -ForegroundColor Cyan
Write-Host "    octo-vec" -ForegroundColor Cyan
Write-Host ""
