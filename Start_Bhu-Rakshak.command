#!/usr/bin/env bash
# Bhu-Rakshak launcher (Mac/Linux)
#
# Double-click this file (you may need to right-click -> Open, or run
# `chmod +x Start_Bhu-Rakshak.command` once first -- macOS/Linux require a
# file to be marked executable before double-click will run it, which is
# a one-time OS permission step, not a bug in this script).
#
# This starts the backend server and opens your browser to the dashboard
# automatically once the server is ready.

set -e
cd "$(dirname "$0")"

PORT=8731
URL="http://127.0.0.1:${PORT}"

echo "==================================================="
echo "  Bhu-Rakshak -- Landslide Early-Warning Console"
echo "==================================================="
echo ""
echo "Starting backend server on port ${PORT}..."
echo "(Keep this window open while using the dashboard.)"
echo ""

# Install dependencies on first run only (checks for a marker file so
# repeat launches are fast).
if [ ! -f ".deps_installed" ]; then
  echo "First run: installing Python dependencies (this takes a minute)..."
  python3 -m pip install -r requirements.txt --quiet --break-system-packages 2>/dev/null || python3 -m pip install -r requirements.txt --quiet
  python3 -m pip install python-multipart geopy twilio shapely pyproj --quiet --break-system-packages 2>/dev/null || \
    python3 -m pip install python-multipart geopy twilio shapely pyproj --quiet
  touch .deps_installed
fi

# ALWAYS force the exact tested fastapi/starlette/uvicorn pair, on every
# launch, not just first run. This is deliberately NOT gated behind the
# .deps_installed marker above: if a previous run (including a failed
# one, or an older copy of this folder) already created that marker, a
# stale/mismatched fastapi or starlette already on this machine would
# otherwise never get corrected, and the launcher would silently repeat
# the same crash every time. This runs fast when versions are already
# correct, so there is no real cost to doing it unconditionally.
echo "Verifying fastapi/starlette/uvicorn versions..."
python3 -m pip install --force-reinstall --no-deps fastapi==0.110.0 starlette==0.36.3 "uvicorn[standard]==0.29.0" --quiet --break-system-packages 2>/dev/null || \
  python3 -m pip install --force-reinstall --no-deps fastapi==0.110.0 starlette==0.36.3 "uvicorn[standard]==0.29.0" --quiet

if [ ! -d "frontend/dist" ]; then
  echo "Frontend build not found -- building now (one-time, needs Node.js installed)..."
  (cd frontend && npm install --silent && npm run build)
fi

# Start the backend in the background
python3 -m uvicorn backend.main:app --host 127.0.0.1 --port ${PORT} &
SERVER_PID=$!

# Wait for the server to actually respond before opening the browser
echo "Waiting for server to be ready..."
for i in $(seq 1 30); do
  if curl -s "${URL}/api/health" > /dev/null 2>&1; then
    echo "Server ready."
    break
  fi
  sleep 1
done

# Open the default browser (cross-platform: macOS uses 'open', Linux uses
# 'xdg-open'). Backgrounded and redirected so a slow/missing browser
# helper can never block server startup.
if command -v open > /dev/null; then
  (open "${URL}" &) 2>/dev/null
elif command -v xdg-open > /dev/null; then
  (xdg-open "${URL}" &) 2>/dev/null
else
  echo "Could not auto-open a browser. Please open this URL manually: ${URL}"
fi

echo ""
echo "Bhu-Rakshak is running at ${URL}"
echo "Press Ctrl+C in this window to stop the server."
echo ""

wait $SERVER_PID
