@echo off
REM Cloud team + Telegram. Runs forever: restarts Claude automatically. Close this window to stop.
cd /d "%~dp0"
set MCP_TIMEOUT=60000
:loop
git fetch --quiet origin && git reset --hard --quiet origin/claude/project-time-tracker-2pd53p
claude --model sonnet --channels plugin:telegram@claude-plugins-official
echo Restarting in 10 seconds...
timeout /t 10 /nobreak >nul
goto loop
