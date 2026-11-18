@echo off
setlocal
cd /d "%~dp0"
echo ==========================================
echo Patient Monitoring System
echo ==========================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed.
  echo Install Node.js 18 or newer from https://nodejs.org/
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo ERROR: npm install failed.
    pause
    exit /b 1
  )
)
echo.
echo Starting Patient Monitoring System...
call npm start
