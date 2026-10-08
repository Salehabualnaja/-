@echo off
REM تشغيل فريق السحابة مع قناة تيليجرام - اترك هذه النافذة مفتوحة
cd /d "%~dp0"
claude --channels plugin:telegram@claude-plugins-official
