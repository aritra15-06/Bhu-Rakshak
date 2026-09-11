@echo off
REM =========================================================================
REM Bhu-Rakshak - Launcher for Version 2: Public Monitoring & History Console
REM Includes: Alert History (Dispatched SMS Log + Past Landslide & Danger Tracking)
REM Excludes: Alerts Section Removed, Settings Option Removed, Citizen Reports Removed
REM =========================================================================

cd /d "%~dp0"

echo Setting active profile to Version 2 (History)...
python -c "from backend.routes.profile import set_active_profile; set_active_profile('history'); print('Profile set: Version 2 (History)')"

set PORT=8731
set URL=http://127.0.0.1:%PORT%/?version=2

echo Starting Bhu-Rakshak in Version 2 Mode...
start "" "%URL%"
python -m uvicorn backend.main:app --host 127.0.0.1 --port %PORT%
