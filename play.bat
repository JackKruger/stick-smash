@echo off
REM One-click launcher. Double-click this file from Explorer, or run from any
REM cmd prompt — the script cd's to its own folder before invoking npm so you
REM never hit "ENOENT package.json" again.
cd /d "%~dp0"
echo.
echo === Stick Smash Party ===
echo Starting server + tunnel. Public URL appears below.
echo Close this window (or Ctrl+C) to stop.
echo.
call npm run play
pause
