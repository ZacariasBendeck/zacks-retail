@echo off
echo ============================================
echo   Benlow RICS - Inventory Management App
echo ============================================
echo.

cd /d "%~dp0"

echo [1/4] Installing dependencies...
call pnpm install
if errorlevel 1 (
    echo ERROR: pnpm install failed. Make sure pnpm is installed.
    echo Run: npm install -g pnpm
    pause
    exit /b 1
)

echo.
echo [2/4] Building API...
cd apps\api
call pnpm build
if not exist "data" mkdir data

echo.
echo [3/4] Seeding database with test data...
if not exist "data\inventory.db" (
    node --experimental-sqlite seed.js
) else (
    echo Database already exists, skipping seed. Delete apps\api\data\inventory.db to re-seed.
)

echo.
echo [4/4] Starting servers...
echo.
echo   Frontend: http://localhost:3000
echo   API:      http://localhost:4000
echo   Swagger:  http://localhost:4000/api-docs
echo.
echo   Press Ctrl+C to stop.
echo ============================================
echo.

start "Benlow API" cmd /c "node --env-file-if-exists=.env --experimental-sqlite dist\index.js"
cd /d "%~dp0\apps\web"
call pnpm dev
