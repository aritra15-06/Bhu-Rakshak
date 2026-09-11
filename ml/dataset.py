"""
Training dataset builder.

HONESTY NOTE (read before trusting any metric downstream):
Bhu-Rakshak has 2-3 real pilot locations and no field-verified historical
landslide inventory loaded in this environment (no network access to
NRSC/GSI/IMERG APIs from this build sandbox). Per the JSON contract
section 23: "2-3 pilot sites demonstrate the vertical slice; they are not
enough by themselves to establish generalizable training performance."

So this module builds a SYNTHETIC training corpus:
  - Many simulated analysis cells (default 300) spanning realistic
    Himalayan-NER terrain/soil/rainfall ranges, INCLUDING the 3 real pilot
    locations' static parameters as seed points so the model has seen
    parameter regimes close to the real demo sites.
  - Each cell gets multiple analysis_time rows across a simulated rainfall
    season (default 20 per cell) -- i.e. the "many rows" come from
    (location x time) combinations, which is the actual training unit
    defined in contract section 6, not from inventing fake locations
    pretending to be real ones.
  - The REAL physics engine (physics/engine.py) is run for every single
    row -- physics features in this dataset are not faked, only the
    terrain/soil/rainfall inputs that drive them are synthetic.
  - Labels are generated from a stochastic function of the physics
    engine's own FoS output plus rainfall intensity plus a documented
    noise term -- NOT hand-picked to guarantee good metrics. This means
    the model is learning "does this synthetic labeling function
    correlate with physically hazardous conditions", not "does this
    predict real Sikkim landslides." Report metrics with that framing,
    always.

This is a defensible engineering choice for a 2-day prototype -- and it is
exactly what lets ONE model be trained that generalizes across location
*parameter space* rather than per-site identity, which is the mechanism
for monitoring ~100 real locations from one model later (see
docs/scaling_notes.md). It is not a claim of real-world validated skill.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import random
import sys
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from physics.schemas import SlopeState
from physics.engine import run_physics
from ml.feature_manifest import FEATURE_NAMES

RNG_SEED = 42


def _load_pilot_locations(path: str) -> list:
    with open(path) as f:
        data = json.load(f)
    return data["locations"]


def _sample_synthetic_cell(rng: random.Random, cell_idx: int, texture_choices) -> dict:
    """Sample one synthetic analysis-cell's static terrain/soil parameters
    within physically plausible NER-Himalaya-like ranges."""
    return {
        "location_id": f"SYN{cell_idx:04d}",
        "slope_deg": rng.uniform(8.0, 55.0),
        "aspect_deg": rng.uniform(0.0, 360.0),
        "elevation_m": rng.uniform(300.0, 4200.0),
        "cohesion_kpa": rng.uniform(1.0, 25.0),
        "friction_angle_deg": rng.uniform(18.0, 40.0),
        "unit_weight_kn_m3": rng.uniform(15.5, 21.0),
        "slip_depth_m": rng.uniform(0.5, 3.0),
        "hydraulic_conductivity_mm_h": rng.uniform(1.0, 60.0),
        "porosity_0_1": rng.uniform(0.32, 0.55),
        "initial_saturation_0_1": rng.uniform(0.1, 0.5),
        "groundwater_depth_m": None,
        "soil_texture": rng.choice(texture_choices),
        # terrain-derived context features (synthetic but internally consistent)
        "plan_curvature": rng.uniform(-0.02, 0.02),
        "profile_curvature": rng.uniform(-0.02, 0.02),
        "flow_accumulation_m2": math.exp(rng.uniform(2, 11)),
        "distance_to_stream_m": rng.uniform(5, 2000),
        "clay_percent": rng.uniform(10, 45),
        "sand_percent": rng.uniform(15, 55),
        "silt_percent": rng.uniform(15, 50),
        "bulk_density_kg_m3": rng.uniform(1100, 1600),
        "ndvi_summary": rng.uniform(0.1, 0.85),
        "historical_landslide_count_1km_5y": rng.choices([0, 1, 2, 3, 4], weights=[55, 20, 12, 8, 5])[0],
        "historical_landslide_count_5km_5y": None,  # filled below >= 1km count
    }


def _make_rainfall_season(rng: random.Random, n_hours: int, regime: str) -> list:
    """Generate an hourly rainfall series (mm/h) for a simulated monsoon
    window. `regime` biases toward dry/moderate/storm conditions so labels
    span the hazard spectrum instead of clustering at one extreme."""
    base = {"dry": 0.3, "moderate": 1.5, "storm": 4.0}[regime]
    series = []
    storm_center = rng.randint(int(n_hours * 0.4), int(n_hours * 0.9))
    storm_width = rng.uniform(6, 30)
    storm_peak = {"dry": 2.0, "moderate": 10.0, "storm": 35.0}[regime] * rng.uniform(0.6, 1.4)
    for h in range(n_hours):
        seasonal = base * (1 + 0.3 * math.sin(h / 24.0))
        storm = storm_peak * math.exp(-((h - storm_center) ** 2) / (2 * storm_width ** 2))
        noise = max(0.0, rng.gauss(0, base * 0.4))
        series.append(max(0.0, seasonal + storm + noise))
    return series


def _rainfall_window_sums(series: list, up_to_index: int) -> dict:
    def window(hours):
        start = max(0, up_to_index - hours + 1)
        return float(sum(series[start:up_to_index + 1]))
    return {
        "rainfall_1h_mm": window(1),
        "rainfall_3h_mm": window(3),
        "rainfall_6h_mm": window(6),
        "rainfall_12h_mm": window(12),
        "rainfall_24h_mm": window(24),
        "rainfall_72h_mm": window(72),
        "rainfall_7d_mm": window(24 * 7),
        "rainfall_30d_mm": window(24 * 30),
    }


def _label_probability(fos: float, rainfall_24h_mm: float, hist_count_1km: int) -> float:
    """
    Documented stochastic labeling function used ONLY to generate the
    synthetic supervised target. This is deliberately transparent (not
    hidden inside training code) so anyone auditing the dataset can see
    exactly how positive labels were produced and is not misled into
    thinking these are field-verified events.

    Logistic function of:
      - FoS (lower FoS -> higher hazard probability; centered near FoS=1.0,
        which is the physically meaningful marginal-stability point)
      - 24h rainfall intensity (higher -> higher probability, saturating)
      - nearby historical landslide density (higher -> higher probability,
        small effect, reflecting real susceptibility literature without
        claiming a fitted regional threshold)
    Plus irreducible noise, because real landslide occurrence has triggers
    (undercutting, seismic, anthropogenic) this MVP physics/rainfall model
    does not capture -- an honest dataset should NOT be perfectly
    separable by FoS alone.
    """
    if fos is None:
        fos = 2.0  # neutral fallback, should not occur for AVAILABLE rows
    fos_term = -4.0 * (fos - 1.0)  # FoS=1.0 -> 0 contribution; FoS=0.5 -> +2; FoS=2.0 -> -4
    rain_term = 2.5 * (1 - math.exp(-rainfall_24h_mm / 60.0))
    hist_term = 0.25 * min(hist_count_1km, 4)
    logit = -1.6 + fos_term + rain_term + hist_term
    return 1.0 / (1.0 + math.exp(-logit))


def build_dataset(
    pilot_locations_path: str,
    n_synthetic_cells: int = 300,
    rows_per_cell: int = 20,
    season_hours: int = 24 * 45,
    seed: int = RNG_SEED,
) -> pd.DataFrame:
    rng = random.Random(seed)
    np.random.seed(seed)

    texture_choices = ["sand", "sandy_loam", "loam", "silt_loam", "clay_loam", "clay"]

    pilots = _load_pilot_locations(pilot_locations_path)
    cells = []
    for p in pilots:
        c = dict(p)
        c.setdefault("plan_curvature", rng.uniform(-0.02, 0.02))
        c.setdefault("profile_curvature", rng.uniform(-0.02, 0.02))
        c.setdefault("flow_accumulation_m2", math.exp(rng.uniform(2, 11)))
        c.setdefault("distance_to_stream_m", rng.uniform(5, 2000))
        c.setdefault("clay_percent", rng.uniform(10, 45))
        c.setdefault("sand_percent", rng.uniform(15, 55))
        c.setdefault("silt_percent", rng.uniform(15, 50))
        c.setdefault("bulk_density_kg_m3", rng.uniform(1100, 1600))
        c.setdefault("ndvi_summary", rng.uniform(0.1, 0.85))
        c.setdefault("historical_landslide_count_1km_5y",
                      rng.choices([0, 1, 2, 3, 4], weights=[40, 25, 15, 12, 8])[0])
        cells.append(c)

    for i in range(n_synthetic_cells):
        cells.append(_sample_synthetic_cell(rng, i, texture_choices))

    for c in cells:
        if c.get("historical_landslide_count_5km_5y") is None:
            c["historical_landslide_count_5km_5y"] = c["historical_landslide_count_1km_5y"] + \
                rng.choices([0, 1, 2, 3, 4, 5], weights=[30, 25, 20, 12, 8, 5])[0]

    rows = []
    analysis_base_time = datetime(2026, 6, 1, tzinfo=timezone.utc)

    for cell in cells:
        regime = rng.choices(["dry", "moderate", "storm"], weights=[35, 40, 25])[0]
        rainfall_series = _make_rainfall_season(rng, season_hours, regime)

        state = SlopeState(
            location_id=cell["location_id"],
            slope_deg=cell["slope_deg"],
            aspect_deg=cell["aspect_deg"],
            elevation_m=cell["elevation_m"],
            cohesion_kpa=cell["cohesion_kpa"],
            friction_angle_deg=cell["friction_angle_deg"],
            unit_weight_kn_m3=cell["unit_weight_kn_m3"],
            slip_depth_m=cell["slip_depth_m"],
            hydraulic_conductivity_mm_h=cell["hydraulic_conductivity_mm_h"],
            porosity_0_1=cell["porosity_0_1"],
            initial_saturation_0_1=cell["initial_saturation_0_1"],
            groundwater_depth_m=cell.get("groundwater_depth_m"),
        )

        sample_indices = sorted(rng.sample(
            range(24 * 3, season_hours), min(rows_per_cell, season_hours - 24 * 3)
        ))

        nearest_hist_dist = rng.uniform(50, 4000) if cell["historical_landslide_count_1km_5y"] > 0 else rng.uniform(1000, 15000)

        for idx in sample_indices:
            hourly_up_to_now = rainfall_series[:idx + 1]  # only past-or-present rain: no leakage
            physics_out = run_physics(state, hourly_up_to_now, soil_texture=cell.get("soil_texture"))

            analysis_time = analysis_base_time + timedelta(hours=idx)
            wsums = _rainfall_window_sums(rainfall_series, idx)

            if physics_out.physics_status == "UNAVAILABLE":
                continue  # per manifest missing-value policy: drop, don't fabricate

            prob = _label_probability(
                fos=physics_out.factor_of_safety,
                rainfall_24h_mm=wsums["rainfall_24h_mm"],
                hist_count_1km=cell["historical_landslide_count_1km_5y"],
            )
            label = 1 if rng.random() < prob else 0

            row = {
                "location_id": cell["location_id"],
                "analysis_time_utc": analysis_time.isoformat(),
                "forecast_horizon_hours": 24,
                "landslide_occurred_24h": label,
                "verification_status": "VERIFIED",  # synthetic ground truth is fully known by construction
                "event_source": "synthetic_prototype_v1",
                **wsums,
                "elevation_m": cell["elevation_m"],
                "slope_deg": cell["slope_deg"],
                "aspect_sin": math.sin(math.radians(cell["aspect_deg"])),
                "aspect_cos": math.cos(math.radians(cell["aspect_deg"])),
                "plan_curvature": cell["plan_curvature"],
                "profile_curvature": cell["profile_curvature"],
                "flow_accumulation_m2": cell["flow_accumulation_m2"],
                "distance_to_stream_m": cell["distance_to_stream_m"],
                "clay_percent": cell["clay_percent"],
                "sand_percent": cell["sand_percent"],
                "silt_percent": cell["silt_percent"],
                "bulk_density_kg_m3": cell["bulk_density_kg_m3"],
                "ndvi_summary": cell["ndvi_summary"],
                "nearest_historical_landslide_distance_m": nearest_hist_dist,
                "historical_landslide_count_1km_5y": cell["historical_landslide_count_1km_5y"],
                "historical_landslide_count_5km_5y": cell["historical_landslide_count_5km_5y"],
                "factor_of_safety": physics_out.factor_of_safety,
                "pore_pressure_kpa": physics_out.pore_pressure_kpa,
                "effective_saturation_0_1": physics_out.effective_saturation_0_1,
                "infiltration_rate_mm_h": physics_out.infiltration_rate_mm_h,
                "cumulative_infiltration_mm": physics_out.cumulative_infiltration_mm,
                "physics_status": physics_out.physics_status,
                "stability_state": physics_out.stability_state,
                "is_real_pilot_location": cell["location_id"] in [p["location_id"] for p in pilots],
            }
            rows.append(row)

    df = pd.DataFrame(rows)
    return df


def dataset_hash(df: pd.DataFrame) -> str:
    h = hashlib.sha256(pd.util.hash_pandas_object(df, index=True).values.tobytes()).hexdigest()
    return f"sha256:{h}"


if __name__ == "__main__":
    out_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "processed")
    os.makedirs(out_dir, exist_ok=True)
    pilot_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "demo", "pilot_locations.json")

    df = build_dataset(pilot_path, n_synthetic_cells=300, rows_per_cell=20)
    print(f"Built dataset: {len(df)} rows, {df['location_id'].nunique()} unique locations")
    print(f"Positive rate: {df['landslide_occurred_24h'].mean():.4f}")
    print(df.groupby("is_real_pilot_location")["landslide_occurred_24h"].agg(["count", "mean"]))

    snapshot_id = f"SNAP-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M')}"
    out_path = os.path.join(out_dir, "training_dataset.csv")
    df.to_csv(out_path, index=False)

    manifest = {
        "snapshot_id": snapshot_id,
        "dataset_hash": dataset_hash(df),
        "n_rows": len(df),
        "n_unique_locations": int(df["location_id"].nunique()),
        "n_real_pilot_locations": int(df[df["is_real_pilot_location"]]["location_id"].nunique()),
        "positive_rate": float(df["landslide_occurred_24h"].mean()),
        "generation_seed": RNG_SEED,
        "data_provenance": "SYNTHETIC — see ml/dataset.py module docstring for full methodology and honesty notes",
        "physics_model_version": "infinite_slope_effective_stress_v1.0",
    }
    with open(os.path.join(out_dir, "dataset_manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"\nSaved to {out_path}")
    print(json.dumps(manifest, indent=2))
