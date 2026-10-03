@echo off
title EV Range AI Server
cd /d "%~dp0"
echo Installing Python packages (one time)...
python -m pip install -r requirements.txt -q
echo.
echo Starting website + database...
echo Open in browser: http://127.0.0.1:5000
echo Press Ctrl+C to stop.
python app.py
pause
