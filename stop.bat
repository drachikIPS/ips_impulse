@echo off
title Stop IPS Server
echo Stopping IPS server on port 8000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000 " ^| findstr "LISTENING"') do (
    echo Killing PID %%a
    taskkill /PID %%a /F
)
echo Done. Press any key to close.
pause >nul
