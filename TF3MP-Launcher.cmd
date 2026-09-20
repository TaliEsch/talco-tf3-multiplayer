@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0TF3MP-Launcher.ps1"
if errorlevel 1 (
  echo.
  echo Launcher exited with an error. Review the message above.
  pause
)
endlocal
