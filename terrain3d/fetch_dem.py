"""
Real DEM tile fetcher — run this once you have an OpenTopography API key
and network access, to replace the synthetic heightmap with real
elevation data.

Get a free API key at https://portal.opentopography.org/myopentopo

Usage:
    python3 terrain3d/fetch_dem.py --api-key YOUR_KEY

This fetches ONE tile covering the bounding box of all 6 pilot sites
(not 6 separate fetches — see implementation plan Section 6.2 for why a
single wide mesh is the right approach for a multi-site click-to-select
3D scene), then converts it to the same heightmap JSON format
generate_synthetic_heightmap.py produces, so the frontend needs no
changes to switch from synthetic to real data.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGION_BOUNDS = {"south": 27.05, "north": 27.75, "west": 88.45, "east": 88.80}


def fetch_dem_tile(bounds: dict, api_key: str, out_path: str):
    import requests
    url = "https://portal.opentopography.org/API/globaldem"
    params = {
        "demtype": "SRTMGL1",
        "south": bounds["south"], "north": bounds["north"],
        "west": bounds["west"], "east": bounds["east"],
        "outputFormat": "GTiff", "API_Key": api_key,
    }
    r = requests.get(url, params=params, timeout=60)
    r.raise_for_status()
    with open(out_path, "wb") as f:
        f.write(r.content)
    print(f"Saved DEM tile to {out_path} ({len(r.content)} bytes)")


def geotiff_to_heightmap_json(tif_path: str, grid_size: int = 128) -> dict:
    """Requires rasterio (pip install rasterio --break-system-packages)."""
    import rasterio
    import numpy as np

    with rasterio.open(tif_path) as src:
        arr = src.read(1)
        # Resample to grid_size x grid_size for a manageable mesh
        from scipy.ndimage import zoom
        zoom_y = grid_size / arr.shape[0]
        zoom_x = grid_size / arr.shape[1]
        resampled = zoom(arr, (zoom_y, zoom_x))
        heights = resampled.flatten().tolist()

    with open(os.path.join(REPO_ROOT, "demo", "pilot_locations.json")) as f:
        locations = json.load(f)["locations"]

    lat_range = REGION_BOUNDS["north"] - REGION_BOUNDS["south"]
    lon_range = REGION_BOUNDS["east"] - REGION_BOUNDS["west"]
    site_markers = []
    for loc in locations:
        u = (loc["longitude"] - REGION_BOUNDS["west"]) / lon_range
        v = (loc["latitude"] - REGION_BOUNDS["south"]) / lat_range
        grid_x = int(max(0, min(grid_size - 1, u * grid_size)))
        grid_y = int(max(0, min(grid_size - 1, v * grid_size)))
        site_markers.append({
            "location_id": loc["location_id"], "name": loc["name"],
            "grid_x": grid_x, "grid_y": grid_y,
            "latitude": loc["latitude"], "longitude": loc["longitude"],
            "elevation_m": heights[grid_y * grid_size + grid_x],
        })

    return {
        "data_provenance": f"REAL DEM data from OpenTopography SRTMGL1, fetched {tif_path}",
        "grid_size": grid_size,
        "bounds": REGION_BOUNDS,
        "heights": heights,
        "site_markers": site_markers,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-key", required=True, help="OpenTopography API key")
    args = parser.parse_args()

    tif_path = os.path.join(REPO_ROOT, "terrain3d", "north_sikkim_region.tif")
    fetch_dem_tile(REGION_BOUNDS, args.api_key, tif_path)

    print("Converting to heightmap JSON (requires: pip install rasterio scipy --break-system-packages)...")
    heightmap = geotiff_to_heightmap_json(tif_path)

    out_path = os.path.join(REPO_ROOT, "terrain3d", "heightmaps", "north_sikkim_region_heightmap.json")
    with open(out_path, "w") as f:
        json.dump(heightmap, f)
    print(f"Replaced synthetic heightmap with REAL DEM data at {out_path}")
    print("Remove the 'Synthetic terrain' badge from the dashboard once you've confirmed this looks correct.")
