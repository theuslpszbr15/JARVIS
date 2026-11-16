@echo off
cd /d "%~dp0"
if exist "dist\JARVIS.exe" (
  start "" "dist\JARVIS.exe"
  exit /b 0
)
where node >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js 20 ou superior em https://nodejs.org/
  pause
  exit /b 1
)
if not exist node_modules\dotenv (
  call npm.cmd install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
call npm.cmd start
pause