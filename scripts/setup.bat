@echo off
setlocal EnableDelayedExpansion
:: ─────────────────────────────────────────────────────────────────────────────
:: OCTO VEC — Setup Script (Windows)
:: Checks for required dependencies and offers to install missing ones.
:: Usage:  Double-click or run: setup.bat
:: ─────────────────────────────────────────────────────────────────────────────

title OCTO VEC — Dependency Check

echo.
echo ╔══════════════════════════════════════════╗
echo ║       OCTO VEC — Dependency Check        ║
echo ╚══════════════════════════════════════════╝
echo.

set MISSING=
set MISSING_COUNT=0

:: ── 1. Node.js ──────────────────────────────────────────────────────────────

echo [1/5] Node.js (^>= 20.0.0)
where node >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=1 delims=v" %%a in ('node -v') do set NODE_RAW=%%a
    for /f "tokens=1 delims=v." %%a in ('node -v') do set NODE_MAJOR=%%a
    :: Remove the 'v' prefix for major version
    for /f "tokens=2 delims=v" %%a in ('node -v') do (
        for /f "tokens=1 delims=." %%b in ("%%a") do set NODE_MAJOR=%%b
    )
    node -v > nul 2>&1
    for /f %%v in ('node -v') do set NODE_VER=%%v
    if !NODE_MAJOR! GEQ 20 (
        echo   [OK] Node.js !NODE_VER!
    ) else (
        echo   [FAIL] Node.js !NODE_VER! ^(need ^>= 20^)
        set MISSING=!MISSING! node
        set /a MISSING_COUNT+=1
    )
) else (
    echo   [FAIL] Node.js not found
    set MISSING=!MISSING! node
    set /a MISSING_COUNT+=1
)

:: ── 2. npm ──────────────────────────────────────────────────────────────────

echo [2/5] npm
where npm >nul 2>&1
if %errorlevel% equ 0 (
    for /f %%v in ('npm -v') do set NPM_VER=%%v
    echo   [OK] npm v!NPM_VER!
) else (
    echo   [FAIL] npm not found
    set MISSING=!MISSING! npm
    set /a MISSING_COUNT+=1
)

:: ── 3. Git ──────────────────────────────────────────────────────────────────

echo [3/5] Git
where git >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=3" %%v in ('git --version') do set GIT_VER=%%v
    echo   [OK] Git v!GIT_VER!
) else (
    echo   [FAIL] Git not found
    set MISSING=!MISSING! git
    set /a MISSING_COUNT+=1
)

:: ── 4. C++ Build Tools (optional) ───────────────────────────────────────────

echo [4/5] C++ Build Tools (optional — for web terminal)
set HAS_BUILD=0

:: Check for Visual Studio Build Tools or full VS
where cl >nul 2>&1
if %errorlevel% equ 0 (
    echo   [OK] MSVC compiler found
    set HAS_BUILD=1
) else (
    :: Check common VS paths
    if exist "C:\Program Files\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC" (
        echo   [OK] VS 2022 Build Tools found
        set HAS_BUILD=1
    ) else if exist "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC" (
        echo   [OK] VS 2022 Community found
        set HAS_BUILD=1
    ) else if exist "C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\VC\Tools\MSVC" (
        echo   [OK] VS 2019 Build Tools found
        set HAS_BUILD=1
    )
)

if !HAS_BUILD! equ 0 (
    echo   [WARN] C++ build tools not found ^(web terminal won't work without them^)
    set MISSING=!MISSING! build-tools
    set /a MISSING_COUNT+=1
)

:: ── 5. Docker (optional) ────────────────────────────────────────────────────

echo [5/5] Docker (optional — for security scans)
where docker >nul 2>&1
if %errorlevel% equ 0 (
    docker info >nul 2>&1
    if !errorlevel! equ 0 (
        for /f "tokens=3" %%v in ('docker --version') do set DOCKER_VER=%%v
        echo   [OK] Docker !DOCKER_VER! ^(running^)
    ) else (
        echo   [WARN] Docker installed but not running
    )
) else (
    echo   [INFO] Docker not installed ^(security scan features won't be available^)
)

echo.

:: ── Summary ─────────────────────────────────────────────────────────────────

if !MISSING_COUNT! equ 0 (
    echo   All dependencies satisfied!
    echo.
    echo   Install OCTO VEC globally:
    echo     npm install -g octo-vec
    echo.
    echo   Then start it:
    echo     octo-vec
    echo.
    goto :end
)

echo   Missing dependencies:!MISSING!
echo.

:: ── Offer to install ────────────────────────────────────────────────────────

echo !MISSING! | findstr /C:"node" >nul
if !errorlevel! equ 0 (
    echo   Node.js 22 is required.
    set /p INSTALL_NODE="  Download and install Node.js 22? [y/N] "
    if /i "!INSTALL_NODE!"=="y" (
        echo   Downloading Node.js 22 installer...
        powershell -Command "Start-Process 'https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi'"
        echo   Please complete the installer, then re-run this script.
        goto :end
    )
)

echo !MISSING! | findstr /C:"git" >nul
if !errorlevel! equ 0 (
    set /p INSTALL_GIT="  Download and install Git? [y/N] "
    if /i "!INSTALL_GIT!"=="y" (
        where winget >nul 2>&1
        if !errorlevel! equ 0 (
            echo   Running: winget install Git.Git
            winget install Git.Git --accept-package-agreements --accept-source-agreements
        ) else (
            echo   Opening Git download page...
            powershell -Command "Start-Process 'https://git-scm.com/download/win'"
            echo   Please complete the installer, then re-run this script.
        )
    )
)

echo !MISSING! | findstr /C:"build-tools" >nul
if !errorlevel! equ 0 (
    set /p INSTALL_BUILD="  Install C++ Build Tools? (optional, for web terminal) [y/N] "
    if /i "!INSTALL_BUILD!"=="y" (
        where winget >nul 2>&1
        if !errorlevel! equ 0 (
            echo   Running: winget install Microsoft.VisualStudio.2022.BuildTools
            winget install Microsoft.VisualStudio.2022.BuildTools --accept-package-agreements --accept-source-agreements
            echo.
            echo   After install, open "Visual Studio Installer" and add:
            echo     "Desktop development with C++" workload
        ) else (
            echo   Opening VS Build Tools download page...
            powershell -Command "Start-Process 'https://visualstudio.microsoft.com/visual-cpp-build-tools/'"
            echo   Install and select "Desktop development with C++" workload.
        )
    )
)

echo.
echo   Setup complete! After installing missing dependencies, run:
echo     npm install -g octo-vec
echo     octo-vec
echo.

:end
endlocal
pause
