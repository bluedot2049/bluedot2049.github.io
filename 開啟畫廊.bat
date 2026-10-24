@echo off
cd /d "%~dp0"
echo Gallery: http://localhost:8000
echo Close this window to stop.
start "" http://localhost:8000
python -m http.server 8000
