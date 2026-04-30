@echo off
title IPS Project Management Platform
cd /d "%~dp0"
echo Starting IPS Project Management Platform...
echo Open browser at: http://localhost:8000
echo Press Ctrl+C to stop.
echo.
python main.py
echo.
echo Server stopped. Press any key to close.
pause >nul
