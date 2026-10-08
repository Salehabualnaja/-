@echo off
REM Cloud team + Telegram channel. Keep this window open. Close it to stop.
cd /d "%~dp0"
:loop
git pull --quiet
claude --channels plugin:telegram@claude-plugins-official
echo Claude stopped. Restarting in 15 seconds... (close this window to stop)
timeout /t 15
goto loop
