@echo off
REM Bhu-Rakshak launcher (Windows)
REM Double-click this file to start the system and open your browser.
REM
REM IMPORTANT: if you have ever run "uvicorn backend.main:app" or
REM "python -m uvicorn ..." by hand in a terminal on this machine, that
REM bypasses every fix this launcher applies. Always start the system
REM through THIS file, not by typing commands yourself -- otherwise you
REM can hit the same old error even after this launcher has already
REM fixed your Python environment.

cd /d "%~dp0"

set PORT=8731
set URL=http://127.0.0.1:%PORT%

echo ===================================================
echo   Bhu-Rakshak - Landslide Early-Warning Console
echo ===================================================
echo.

REM Find a working Python. Multiple Python installs on one machine
REM (e.g. 3.11 and 3.13 side by side) commonly leave a broken "pip.exe"
REM stub on PATH that points at a python.exe which no longer exists at
REM that path -- calling "pip" directly then fails with a launcher
REM error even though Python itself works fine. Using "python -m pip"
REM instead asks a specific, already-verified-working Python to run its
REM own pip module, which sidesteps that broken-stub problem entirely.
echo Checking for a working Python installation...
where python >nul 2>&1
if errorlevel 1 (
    echo.
    echo *** "python" was not found on your PATH. ***
    echo *** Install Python from https://python.org/downloads/ and make ***
    echo *** sure to check "Add python.exe to PATH" during setup.       ***
    pause
    exit /b 1
)

python --version
if errorlevel 1 (
    echo.
    echo *** "python" was found on PATH but running it failed.        ***
    echo *** Your Python installation may be broken or removed.       ***
    echo *** Try reinstalling Python from https://python.org/downloads/ ***
    pause
    exit /b 1
)

echo.
echo Step 1/4: Installing/checking base Python dependencies...
python -m pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo *** "python -m pip install -r requirements.txt" FAILED. See above. ***
    echo *** Common cause: no internet access, or a corrupted pip.          ***
    echo *** Try running: python -m ensurepip --upgrade                     ***
    pause
    exit /b 1
)

echo.
echo Step 2/4: Forcing the exact tested fastapi/starlette/uvicorn versions...
echo (This runs EVERY time, even if you have run this before, because a
echo  mismatched fastapi/starlette pairing already on this machine from
echo  some other project is the single most common cause of the
echo  "Router.__init__() got an unexpected keyword argument 'on_startup'"
echo  crash. This step corrects that unconditionally.)
python -m pip install --force-reinstall --no-deps fastapi==0.110.0 starlette==0.36.3 "uvicorn[standard]==0.29.0"
if errorlevel 1 (
    echo.
    echo *** Forcing fastapi/starlette/uvicorn versions FAILED. See above. ***
    pause
    exit /b 1
)

echo.
echo Step 3/4: Installing remaining Python dependencies...
python -m pip install python-multipart geopy twilio shapely pyproj
if errorlevel 1 (
    echo.
    echo *** Installing remaining dependencies FAILED. See the error above. ***
    pause
    exit /b 1
)

if not exist "frontend\dist" (
    echo.
    echo Frontend build not found, building now, one-time, needs Node.js installed...
    cd frontend
    call npm install
    call npm run build
    cd ..
)

echo.
echo Step 4/4: Starting the backend server in a new window...
echo (A SECOND window will open running the server. If something is still
echo  wrong, the error will be visible in THAT window -- please read it
echo  before asking for help, it usually says exactly what is broken.)
echo.

python -c "from backend.routes.profile import set_active_profile; set_active_profile('operations')" >nul 2>&1
start "Bhu-Rakshak Server (do not close while using the dashboard)" cmd /k python -m uvicorn backend.main:app --host 127.0.0.1 --port %PORT%

echo Waiting for server to respond...
set count=0
:waitloop
timeout /t 1 /nobreak > nul
curl -s %URL%/api/health > nul 2>&1
if errorlevel 1 (
    set /a count+=1
    if %count% lss 30 goto waitloop
    echo.
    echo *** Server did not respond after 30 seconds. ***
    echo *** Check the "Bhu-Rakshak Server" window that opened for the actual error. ***
    pause
    exit /b 1
)

echo Server is ready.
start "" "%URL%"

echo.
echo Bhu-Rakshak is running at %URL%
echo Keep the "Bhu-Rakshak Server" window open while using the dashboard.
echo You can close THIS window now.
echo.
pause
