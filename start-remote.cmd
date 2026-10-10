@echo off
REM Remote Control: this home PC appears in the Claude app on the phone. Close this window to stop.
cd /d "%~dp0"
:loop
claude remote-control --name "Home PC"
timeout /t 10 /nobreak >nul
goto loop
