@echo off
REM =========================================================================
REM Bhu-Rakshak - Launcher for Version 1: Operations Console
REM Includes: Alerts Section, Live SMS Dispatch, Settings Modal, Citizen Reports Removed
REM =========================================================================

cd /d "%~dp0"

echo Setting active profile to Version 1 (Operations)...
python -c "from backend.routes.profile import set_active_profile; set_active_profile('operations'); print('Profile set: Version 1 (Operations)')"

set PORT=8731
set URL=http://127.0.0.1:%PORT%/?version=1

echo Starting Bhu-Rakshak in Version 1 Mode...
start "" "%URL%"
python -m uvicorn backend.main:app --host 127.0.0.1 --port %PORT%
