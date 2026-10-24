@echo off
chcp 65001 >nul
cd /d "%~dp0"
git add -A
git diff --cached --quiet
if %errorlevel%==0 (
  echo No changes to upload.
  pause
  exit /b
)
git commit -m "Update gallery %date% %time:~0,5%"
git push
echo.
echo Uploaded. The site will update in 1-2 minutes:
echo https://bluedot2049.github.io
pause
