@echo off
rem Capsid Wasteland squad server for Windows: double-click to start. Needs Node.js (LTS) from https://nodejs.org
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org and double-click this file again.
  pause
  exit /b
)
start "" http://localhost:8787/
node relay_server.js
pause
