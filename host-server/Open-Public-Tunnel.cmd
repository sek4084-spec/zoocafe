@echo off
cd /d "%~dp0"
where cloudflared >nul 2>&1 || (echo cloudflared was not found on PATH. Use your existing tunnel setup, then copy its HTTPS URL to your friend. & pause & exit /b 1)
echo Leave Start-Host.cmd running in another window.
echo Copy the printed HTTPS URL into the pet's server address on both PCs.
cloudflared tunnel --url http://localhost:3000
pause
