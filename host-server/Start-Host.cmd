@echo off
cd /d "%~dp0"
where node >nul 2>&1 || (echo Node.js is required to start ZOOCAFE server. & pause & exit /b 1)
if not exist node_modules (
  echo Installing server dependencies once...
  call npm ci
  if errorlevel 1 (echo npm install failed. & pause & exit /b 1)
)
echo Starting ZOOCAFE at http://localhost:3000
node server.js
pause
