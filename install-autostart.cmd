@echo off
REM One-time setup: start the bot with Windows, restart it fresh every night, keep the PC awake.
cd /d "%~dp0"
echo [1/3] Start with Windows...
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\CloudTeamBot.lnk'); $s.TargetPath='%~dp0start-telegram.cmd'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Save()"
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\CloudTeamRemote.lnk'); $s.TargetPath='%~dp0start-remote.cmd'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Save()"
echo [2/3] Fresh restart every night at 04:00...
schtasks /create /tn "CloudTeamBotDailyRestart" /tr "taskkill /f /im claude.exe" /sc daily /st 04:00 /f
echo [3/3] Never sleep while plugged in...
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
echo.
echo Done. You can close this window.
pause
