"""
Real DEM tile fetcher — powered by the OpenTopography Global DEM API.

Fetches authentic SRTMGL1 (30m spaceborne radar) digital elevation models covering
the North Sikkim mountain corridor, and converts it into a high-performance 128x128
heightmap JSON mesh for the Three.js 3D terrain viewer.

Usage:
    python terrain3d/fetch_dem.py
    python terrain3d/fetch_dem.py --api-key 8af0651141b620ec93f2b78b22a2497c
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_API_KEY = os.environ.get("OPENTOPOGRAPHY_API_KEY", "8af0651141b620ec93f2b78b22a2497c")
REGION_BOUNDS = {"south": 27.05, "north": 27.75, "west": 88.45, "east": 88.80}


def fetch_dem_asc(bounds: dict, api_key: str, out_path: str):
    """Fetch elevation grid in standard Arc ASCII Grid (AAIGrid) format."""
    import requests
    url = "https://portal.opentopography.org/API/globaldem"
    params = {
        "demtype": "SRTMGL1",
        "south": bounds["south"],
        "north": bounds["north"],
        "west": bounds["west"],
        "east": bounds["east"],
        "outputFormat": "AAIGrid",
        "API_Key": api_key,
    }
    print(f"[OpenTopography] Requesting DEM from {url}...")
    t0 = time.time()
    r = requests.get(url, params=params, timeout=120)
    r.raise_for_status()
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(r.content)
    print(f"[OpenTopography] Saved DEM tile to {out_path} ({len(r.content)} bytes in {time.time()-t0:.2f}s)")


def asc_to_heightmap_json(asc_path: str, grid_size: int = 128) -> dict:
    """Parse Arc ASCII Grid into 128x128 heightmap JSON with authentic site markers."""
    import numpy as np
    from scipy.ndimage import zoom

    print(f"[OpenTopography] Parsing raster grid from {asc_path}...")
    with open(asc_path, "r", encoding="utf-8", errors="ignore") as f:
        header = {}
        for _ in range(6):
            parts = f.readline().strip().split()
            header[parts[0].lower()] = float(parts[1])

    grid = np.loadtxt(asc_path, skiprows=6, dtype=np.float32)
    print(f"[OpenTopography] Loaded raw DEM array shape: {grid.shape}, elevation range: {grid.min():.1f}m to {grid.max():.1f}m")

    # Resample to grid_size x grid_size via bilinear interpolation
    zoom_y = grid_size / grid.shape[0]
    zoom_x = grid_size / grid.shape[1]
    resampled = zoom(grid, (zoom_y, zoom_x), order=1)
    heights = [round(float(h), 1) for h in resampled.flatten()]

    # Load pilot locations
    loc_file = os.path.join(REPO_ROOT, "demo", "pilot_locations.json")
    with open(loc_file, "r", encoding="utf-8") as f:
        locations = json.load(f)["locations"]

    lat_range = REGION_BOUNDS["north"] - REGION_BOUNDS["south"]
    lon_range = REGION_BOUNDS["east"] - REGION_BOUNDS["west"]

    site_markers = []
    for loc in locations:
        u = (loc["longitude"] - REGION_BOUNDS["west"]) / lon_range
        v = (REGION_BOUNDS["north"] - loc["latitude"]) / lat_range
        grid_x = int(round(max(0, min(grid_size - 1, u * (grid_size - 1)))))
        grid_y = int(round(max(0, min(grid_size - 1, v * (grid_size - 1)))))
        elev = heights[grid_y * grid_size + grid_x]
        site_markers.append({
            "location_id": loc["location_id"],
            "name": loc["name"],
            "grid_x": grid_x,
            "grid_y": grid_y,
            "latitude": loc["latitude"],
            "longitude": loc["longitude"],
            "elevation_m": elev,
        })

    return {
        "data_provenance": "REAL DEM data from OpenTopography SRTMGL1 (30m Spaceborne Radar Topography Mission)",
        "api_provider": "OpenTopography Global DEM API (portal.opentopography.org)",
        "dem_type": "SRTMGL1",
        "resolution_m": 30,
        "grid_size": grid_size,
        "bounds": REGION_BOUNDS,
        "elevation_min_m": round(float(np.min(resampled)), 1),
        "elevation_max_m": round(float(np.max(resampled)), 1),
        "heights": heights,
        "site_markers": site_markers,
    }


def deploy_heightmap(heightmap_data: dict):
    """Write heightmap to all backend and frontend locations."""
    destinations = [
        os.path.join(REPO_ROOT, "terrain3d", "heightmaps", "north_sikkim_region_heightmap.json"),
        os.path.join(REPO_ROOT, "frontend", "public", "terrain3d", "heightmaps", "north_sikkim_region_heightmap.json"),
        os.path.join(REPO_ROOT, "frontend", "dist", "terrain3d", "heightmaps", "north_sikkim_region_heightmap.json"),
    ]
    for dest in destinations:
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "w", encoding="utf-8") as f:
            json.dump(heightmap_data, f)
        print(f"[OpenTopography] Deployed real DEM heightmap to {dest}")


def fetch_and_build_dem(api_key: str = None, grid_size: int = 128) -> dict:
    key = api_key or DEFAULT_API_KEY
    asc_path = os.path.join(REPO_ROOT, "terrain3d", "north_sikkim_srtm.asc")

    # If already downloaded, reuse unless refetch needed
    if not os.path.exists(asc_path) or os.path.getsize(asc_path) < 1000:
        fetch_dem_asc(REGION_BOUNDS, key, asc_path)

    heightmap = asc_to_heightmap_json(asc_path, grid_size=grid_size)
    deploy_heightmap(heightmap)
    return heightmap


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch real DEM from OpenTopography API")
    parser.add_argument("--api-key", default=DEFAULT_API_KEY, help="OpenTopography API key")
    parser.add_argument("--force-download", action="store_true", help="Force redownload from OpenTopography API")
    args = parser.parse_args()

    asc_path = os.path.join(REPO_ROOT, "terrain3d", "north_sikkim_srtm.asc")
    if args.force_download or not os.path.exists(asc_path):
        fetch_dem_asc(REGION_BOUNDS, args.api_key, asc_path)

    heightmap = asc_to_heightmap_json(asc_path, grid_size=128)
    deploy_heightmap(heightmap)
    print("\n[SUCCESS] Authentic OpenTopography Real DEM heightmap is live and active!")

