@echo off
REM Cloud team + Telegram. Runs forever: restarts Claude automatically. Close this window to stop.
cd /d "%~dp0"
set MCP_TIMEOUT=60000
:loop
git pull --no-edit --quiet || git merge --abort
claude --model sonnet --channels plugin:telegram@claude-plugins-official
echo Restarting in 10 seconds...
timeout /t 10 /nobreak >nul
goto loop
