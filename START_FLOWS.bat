@echo off
title FLOWS - Flash Flood & Landslide Observation & Warning System
color 0B

echo ======================================================================
echo    FLOWS -- Flash Flood & Landslide Observation & Warning System
echo    SIH Round 2 -- Team Heisenbug
echo ======================================================================
echo.
echo Launching FLOWS Dashboard from: %~dp0FLOWS
echo Localhost URL: http://localhost:8000
echo.

cd /d "%~dp0FLOWS"

:: Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not found in PATH!
    echo Please install Python 3.10+ and add it to your system PATH.
    pause
    exit /b 1
)

:: Run the server (auto-opens browser at http://localhost:8000)
python run.py

pause
