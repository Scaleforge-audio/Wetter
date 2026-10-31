@echo off
title Klar - lokaler Server
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\server.ps1"
if errorlevel 1 pause
