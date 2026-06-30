@echo off
cd /d "%~dp0"

echo ========================================
echo   xiabanya v2.0 - Electron + React
echo ========================================
echo.

if exist "node_modules\" (
    echo [OK] Dependencies already installed, skipping...
) else (
    echo [1/2] Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed
        pause
        exit /b 1
    )
)

echo.
echo [2/2] Starting dev server...
call npm run dev
pause
