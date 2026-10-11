@echo off
REM Remote Control: this home PC appears in the Claude app on the phone. Close this window to stop.
REM Runs from a temp copy so that updating this file never breaks the running loop.
if not "%~1"=="_run" (
  copy /y "%~f0" "%TEMP%\cloudteam-remote.cmd" >nul
  "%TEMP%\cloudteam-remote.cmd" _run "%~dp0"
  exit /b
)
cd /d "%~2"
:loop
claude remote-control --name "Home PC" --chrome
timeout /t 10 /nobreak >nul
goto loop
