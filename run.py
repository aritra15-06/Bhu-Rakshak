#!/usr/bin/env python3
"""
Bhu-Rakshak & FLOWS — Root Turnkey Launcher
Starts the FLOWS Early-Warning System (Backend API + Pre-built UI + Auto-Browser Launch)
"""
import os
import sys

if __name__ == "__main__":
    root_dir = os.path.dirname(os.path.abspath(__file__))
    flows_dir = os.path.join(root_dir, "FLOWS")
    
    if os.path.exists(flows_dir):
        # Change working directory to FLOWS and execute run.py
        os.chdir(flows_dir)
        sys.path.insert(0, flows_dir)
        import run
    else:
        import uvicorn
        uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=False)
