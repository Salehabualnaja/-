@echo off
REM Cloud team + Telegram. Runs forever: restarts Claude automatically. Close this window to stop.
REM Runs from a temp copy so that updating this file (git reset) never breaks the running loop.
if not "%~1"=="_run" (
  copy /y "%~f0" "%TEMP%\cloudteam-telegram.cmd" >nul
  "%TEMP%\cloudteam-telegram.cmd" _run "%~dp0"
  exit /b
)
cd /d "%~2"
set MCP_TIMEOUT=60000
:loop
git fetch --quiet origin && git reset --hard --quiet origin/claude/project-time-tracker-2pd53p
claude --model sonnet --channels plugin:telegram@claude-plugins-official
echo Restarting in 10 seconds...
timeout /t 10 /nobreak >nul
goto loop
