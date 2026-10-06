@echo off
cd /d "%~dp0"
title Recipe Note server
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 serve.py --open
  goto end
)
where python >nul 2>nul
if %errorlevel%==0 (
  python serve.py --open
  goto end
)
echo Python was not found. Please install it from https://www.python.org/downloads/
:end
pause
