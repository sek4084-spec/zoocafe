@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0Start-MungPet.ps1"
if errorlevel 1 pause
