import json
import os
import numpy as np
from PIL import Image
from scipy.ndimage import zoom, gaussian_filter

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HM_PATH = os.path.join(REPO_ROOT, "terrain3d", "heightmaps", "north_sikkim_region_heightmap.json")

def generate_offline_texture():
    with open(HM_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    grid_size = data["grid_size"]
    raw_h = np.array(data["heights"], dtype=np.float32).reshape((grid_size, grid_size))

    target_size = 1024
    scale = target_size / grid_size
    h = zoom(raw_h, scale, order=3)

    # Compute numerical gradients for slope and hillshade
    dy, dx = np.gradient(h, 2.0, 2.0)
    slope = np.arctan(np.sqrt(dx**2 + dy**2) / 8.0) * (180.0 / np.pi)

    # Sun illumination vector from North-West/East
    sun_x, sun_y, sun_z = 0.5, -0.6, 0.62
    sun_len = np.sqrt(sun_x**2 + sun_y**2 + sun_z**2)
    sun_x, sun_y, sun_z = sun_x/sun_len, sun_y/sun_len, sun_z/sun_len

    norm_x = -dx
    norm_y = -dy
    norm_z = np.ones_like(dx) * 12.0
    norm_len = np.sqrt(norm_x**2 + norm_y**2 + norm_z**2)
    norm_x /= norm_len
    norm_y /= norm_len
    norm_z /= norm_len

    illum = norm_x * sun_x + norm_y * sun_y + norm_z * sun_z
    illum = np.clip(0.65 + illum * 0.5, 0.6, 1.3)

    # Multi-scale organic noise for vegetation texture and rock grain
    np.random.seed(42)
    noise1 = np.random.uniform(-1, 1, (target_size, target_size))
    noise_smooth = gaussian_filter(noise1, sigma=2.0) * 18.0
    noise_micro = gaussian_filter(np.random.uniform(-1, 1, (target_size, target_size)), sigma=0.8) * 10.0

    r = np.zeros((target_size, target_size), dtype=np.float32)
    g = np.zeros((target_size, target_size), dtype=np.float32)
    b = np.zeros((target_size, target_size), dtype=np.float32)

    # Elevation & Biome rules matching real Himalayan ecology
    # Valley & River Floor (<1350m)
    mask_river = h < 1180
    mask_valley = (h >= 1180) & (h < 1400)
    mask_forest = (h >= 1400) & (h < 2400)
    mask_subalpine = (h >= 2400) & (h < 3100)
    mask_alpine = h >= 3100

    # 1. Teesta Riverbed (glacial turquoise-slate water)
    r[mask_river] = 42.0 + noise_micro[mask_river] * 0.3
    g[mask_river] = 92.0 + noise_micro[mask_river] * 0.5
    b[mask_river] = 112.0 + noise_micro[mask_river] * 0.6

    # 2. Lush valley vegetation & river terraces
    r[mask_valley] = 48.0 + noise_smooth[mask_valley] * 0.8
    g[mask_valley] = 88.0 + noise_smooth[mask_valley] * 1.2
    b[mask_valley] = 44.0 + noise_smooth[mask_valley] * 0.6

    # 3. Dense Montane Pine & Fir Forest
    # If slope is steep (>36 deg), rock cliff exposed
    cliff_forest = mask_forest & (slope > 36.0)
    trees_forest = mask_forest & (~cliff_forest)

    r[trees_forest] = 34.0 + noise_smooth[trees_forest] * 0.9
    g[trees_forest] = 72.0 + noise_smooth[trees_forest] * 1.4
    b[trees_forest] = 38.0 + noise_smooth[trees_forest] * 0.7

    r[cliff_forest] = 112.0 + noise_micro[cliff_forest]
    g[cliff_forest] = 104.0 + noise_micro[cliff_forest]
    b[cliff_forest] = 96.0 + noise_micro[cliff_forest]

    # 4. Subalpine Rhododendron & Scree belt
    cliff_sub = mask_subalpine & (slope > 33.0)
    scrub_sub = mask_subalpine & (~cliff_sub)

    r[scrub_sub] = 74.0 + noise_smooth[scrub_sub] * 0.8
    g[scrub_sub] = 92.0 + noise_smooth[scrub_sub] * 1.0
    b[scrub_sub] = 58.0 + noise_smooth[scrub_sub] * 0.6

    r[cliff_sub] = 124.0 + noise_micro[cliff_sub]
    g[cliff_sub] = 118.0 + noise_micro[cliff_sub]
    b[cliff_sub] = 110.0 + noise_micro[cliff_sub]

    # 5. Alpine Crests, high moraines & Perpetual Snow
    snow_threshold = 3200.0 + (1.0 - slope / 90.0) * 120.0
    is_snow = mask_alpine & (h > snow_threshold)
    is_rock = mask_alpine & (~is_snow)

    r[is_rock] = 132.0 + noise_micro[is_rock]
    g[is_rock] = 126.0 + noise_micro[is_rock]
    b[is_rock] = 120.0 + noise_micro[is_rock]

    r[is_snow] = 238.0 + noise_micro[is_snow] * 0.4
    g[is_snow] = 242.0 + noise_micro[is_snow] * 0.4
    b[is_snow] = 248.0 + noise_micro[is_snow] * 0.4

    # Apply hillshading illumination
    r = np.clip(r * illum, 0, 255).astype(np.uint8)
    g = np.clip(g * illum, 0, 255).astype(np.uint8)
    b = np.clip(b * illum, 0, 255).astype(np.uint8)

    rgb = np.stack([r, g, b], axis=-1)
    img = Image.fromarray(rgb, "RGB")

    out1 = os.path.join(REPO_ROOT, "frontend", "public", "terrain3d", "textures", "north_sikkim_offline_realistic.jpg")
    out2 = os.path.join(REPO_ROOT, "terrain3d", "textures", "north_sikkim_offline_realistic.jpg")
    os.makedirs(os.path.dirname(out1), exist_ok=True)
    os.makedirs(os.path.dirname(out2), exist_ok=True)

    img.save(out1, quality=92)
    img.save(out2, quality=92)
    print(f"Baked realistic offline texture to {out1} ({os.path.getsize(out1)} bytes)")

if __name__ == "__main__":
    generate_offline_texture()
