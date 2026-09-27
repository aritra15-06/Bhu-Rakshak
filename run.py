#!/usr/bin/env python3
"""
Bhu-Rakshak & FLOWS — Root Turnkey Launcher
Starts the FLOWS Early-Warning System (Backend API + Pre-built UI)
"""
import os
import sys

if __name__ == "__main__":
    root_dir = os.path.dirname(os.path.abspath(__file__))
    flows_dir = os.path.join(root_dir, "FLOWS")
    
    if os.path.exists(flows_dir):
        os.chdir(flows_dir)
        sys.path.insert(0, flows_dir)
    else:
        sys.path.insert(0, root_dir)

    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=False)
