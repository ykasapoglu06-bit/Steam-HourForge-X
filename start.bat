@echo off
cd /d "%~dp0"
set "PATH=%~dp0.runtime\node-v26.13.1-win-x64;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22 LTS or newer from https://nodejs.org/ and try again.
  goto finished
)
if not exist node_modules (
  call npm ci
  if errorlevel 1 goto finished
)
call npm run build
if errorlevel 1 goto finished
call cscript //nologo "%~dp0scripts\create-shortcuts.vbs"
call cscript //nologo "%~dp0start-ui.vbs"
exit /b
:finished
echo.
echo Steam HourForge X has stopped.
pause

