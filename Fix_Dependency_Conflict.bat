@echo off
REM Run this FIRST if Start_Bhu-Rakshak.bat has ever shown you the error:
REM   TypeError: Router.__init__() got an unexpected keyword argument 'on_startup'
REM or a "Fatal error in launcher: Unable to create process using pip.exe" error.
REM
REM This forces your Python environment to the exact tested fastapi/
REM starlette/uvicorn versions this project needs. It is safe to run as
REM many times as you want.
REM
REM After this finishes without errors, run Start_Bhu-Rakshak.bat again
REM (do NOT type a uvicorn command by hand -- see README.md for why).

where python >nul 2>&1
if errorlevel 1 (
    echo *** "python" was not found on your PATH. ***
    echo *** Install Python from https://python.org/downloads/ and make ***
    echo *** sure to check "Add python.exe to PATH" during setup.       ***
    pause
    exit /b 1
)

echo Using this Python:
python --version
where python
echo.

echo Forcing fastapi, starlette, and uvicorn to known-compatible versions...
echo (Using "python -m pip" rather than "pip" directly -- if you have more
echo  than one Python installed on this machine, a bare "pip" command can
echo  point at a broken or mismatched install even when "python" itself
echo  works fine. "python -m pip" always uses the same Python found above.)
echo.
python -m pip install --force-reinstall --no-deps fastapi==0.110.0 starlette==0.36.3 "uvicorn[standard]==0.29.0"

if errorlevel 1 (
    echo.
    echo *** This failed. Copy the error above and share it for help. ***
    echo *** Try running: python -m ensurepip --upgrade                ***
    echo *** then run this script again.                                ***
    pause
    exit /b 1
)

echo.
echo Done. Checking the installed versions now:
python -c "import fastapi, starlette; print('fastapi', fastapi.__version__); print('starlette', starlette.__version__)"

echo.
echo If you see "fastapi 0.110.0" and "starlette 0.36.3" above, the fix worked.
echo Now run Start_Bhu-Rakshak.bat to start the actual application.
echo.
pause
