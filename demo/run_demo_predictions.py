"""
Demo script: runs the prediction service against
  (1) the 3 real pilot locations (demo/pilot_locations.json), saving one
      sample_predictions/<location_id>.json per site for the dashboard
      team to build against, and
  (2) a simulated batch of ~100 locations scored through the SAME loaded
      model instance, to demonstrate and time the "one shared model
      serves many places simultaneously" mechanism described in
      docs/scaling_notes.md.

Run: python3 -m demo.run_demo_predictions   (from repo root, after ml.train)
"""

from __future__ import annotations

import json
import math
import os
import random
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from physics.schemas import SlopeState
from service.prediction_service import PredictionService

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _synthetic_hourly_rainfall(rng, n_hours=72, regime="moderate"):
    base = {"dry": 0.3, "moderate": 2.0, "storm": 5.0}[regime]
    peak = {"dry": 1.5, "moderate": 12.0, "storm": 30.0}[regime]
    center = rng.randint(int(n_hours * 0.5), n_hours - 1)
    width = rng.uniform(6, 20)
    series = []
    for h in range(n_hours):
        val = base + peak * math.exp(-((h - center) ** 2) / (2 * width ** 2)) + max(0, rng.gauss(0, base * 0.3))
        series.append(max(0.0, val))
    return series


def _environmental_features_for(cell: dict, rng) -> dict:
    return {
        "elevation_m": cell["elevation_m"],
        "slope_deg": cell["slope_deg"],
        "aspect_sin": math.sin(math.radians(cell["aspect_deg"])),
        "aspect_cos": math.cos(math.radians(cell["aspect_deg"])),
        "plan_curvature": rng.uniform(-0.02, 0.02),
        "profile_curvature": rng.uniform(-0.02, 0.02),
        "flow_accumulation_m2": math.exp(rng.uniform(2, 11)),
        "distance_to_stream_m": rng.uniform(5, 2000),
        "clay_percent": rng.uniform(10, 45),
        "sand_percent": rng.uniform(15, 55),
        "silt_percent": rng.uniform(15, 50),
        "bulk_density_kg_m3": rng.uniform(1100, 1600),
        "ndvi_summary": rng.uniform(0.1, 0.85),
        "nearest_historical_landslide_distance_m": rng.uniform(50, 5000),
        "historical_landslide_count_1km_5y": rng.choices([0, 1, 2, 3], weights=[50, 25, 15, 10])[0],
        "historical_landslide_count_5km_5y": rng.choices([0, 1, 2, 3, 4], weights=[35, 25, 20, 12, 8])[0],
    }


def _rainfall_window_sums(series):
    def w(hours):
        return float(sum(series[-hours:])) if len(series) >= 1 else 0.0
    return {
        "rainfall_1h_mm": w(1), "rainfall_3h_mm": w(3), "rainfall_6h_mm": w(6),
        "rainfall_12h_mm": w(12), "rainfall_24h_mm": w(24), "rainfall_72h_mm": w(72),
        "rainfall_7d_mm": w(24 * 7), "rainfall_30d_mm": w(24 * 30),
    }


def score_pilot_locations(service: PredictionService, rng):
    with open(os.path.join(REPO_ROOT, "demo", "pilot_locations.json")) as f:
        pilots = json.load(f)["locations"]

    out_dir = os.path.join(REPO_ROOT, "demo", "sample_predictions")
    os.makedirs(out_dir, exist_ok=True)

    results = []
    for cell in pilots:
        rainfall = _synthetic_hourly_rainfall(rng, n_hours=72, regime="storm")
        state = SlopeState(
            location_id=cell["location_id"], slope_deg=cell["slope_deg"],
            aspect_deg=cell["aspect_deg"], elevation_m=cell["elevation_m"],
            cohesion_kpa=cell["cohesion_kpa"], friction_angle_deg=cell["friction_angle_deg"],
            unit_weight_kn_m3=cell["unit_weight_kn_m3"], slip_depth_m=cell["slip_depth_m"],
            hydraulic_conductivity_mm_h=cell["hydraulic_conductivity_mm_h"],
            porosity_0_1=cell["porosity_0_1"], initial_saturation_0_1=cell["initial_saturation_0_1"],
            groundwater_depth_m=cell.get("groundwater_depth_m"),
        )
        env = _environmental_features_for(cell, rng)
        env.update(_rainfall_window_sums(rainfall))

        result = service.predict_location(
            location_id=cell["location_id"],
            latitude=cell["latitude"], longitude=cell["longitude"],
            slope_state=state, hourly_rainfall_mm=rainfall,
            environmental_features=env,
            analysis_time_utc=datetime.now(timezone.utc).isoformat(),
            soil_texture=cell.get("soil_texture"),
        )
        results.append(result)
        with open(os.path.join(out_dir, f"{cell['location_id']}.json"), "w") as f:
            json.dump(result, f, indent=2)

    return results


def score_simulated_batch(service: PredictionService, rng, n_locations=100):
    """
    Proves the scaling claim: ONE loaded PredictionService instance scores
    n_locations distinct payloads. No per-location model object is created
    or loaded here -- self.base_model / self.calibrator are the same
    Python objects for every call.
    """
    payloads = []
    for i in range(n_locations):
        cell = {
            "location_id": f"MONITOR{i:03d}",
            "latitude": 27.0 + rng.uniform(-1.2, 1.2),
            "longitude": 88.3 + rng.uniform(-1.0, 1.0),
            "slope_deg": rng.uniform(10, 55),
            "aspect_deg": rng.uniform(0, 360),
            "elevation_m": rng.uniform(300, 4200),
            "cohesion_kpa": rng.uniform(1, 25),
            "friction_angle_deg": rng.uniform(18, 40),
            "unit_weight_kn_m3": rng.uniform(15.5, 21.0),
            "slip_depth_m": rng.uniform(0.5, 3.0),
            "hydraulic_conductivity_mm_h": rng.uniform(1, 60),
            "porosity_0_1": rng.uniform(0.32, 0.55),
            "initial_saturation_0_1": rng.uniform(0.1, 0.5),
        }
        rainfall = _synthetic_hourly_rainfall(rng, n_hours=48, regime=rng.choice(["dry", "moderate", "storm"]))
        state = SlopeState(
            location_id=cell["location_id"], slope_deg=cell["slope_deg"],
            aspect_deg=cell["aspect_deg"], elevation_m=cell["elevation_m"],
            cohesion_kpa=cell["cohesion_kpa"], friction_angle_deg=cell["friction_angle_deg"],
            unit_weight_kn_m3=cell["unit_weight_kn_m3"], slip_depth_m=cell["slip_depth_m"],
            hydraulic_conductivity_mm_h=cell["hydraulic_conductivity_mm_h"],
            porosity_0_1=cell["porosity_0_1"], initial_saturation_0_1=cell["initial_saturation_0_1"],
            groundwater_depth_m=None,
        )
        env = _environmental_features_for(cell, rng)
        env.update(_rainfall_window_sums(rainfall))

        payloads.append(dict(
            location_id=cell["location_id"], latitude=cell["latitude"], longitude=cell["longitude"],
            slope_state=state, hourly_rainfall_mm=rainfall, environmental_features=env,
            analysis_time_utc=datetime.now(timezone.utc).isoformat(),
            include_explainability=False,  # skip SHAP per-row for the 100-site timing run; not needed for every monitored site every cycle
        ))

    t0 = time.time()
    results = service.predict_many(payloads)
    elapsed = time.time() - t0
    return results, elapsed


def main():
    rng = random.Random(7)
    print("Loading PredictionService (one model, one calibrator, loaded once)...")
    service = PredictionService.load_default()

    print("\nScoring 3 real pilot locations (with SHAP explainability)...")
    pilot_results = score_pilot_locations(service, rng)
    for r in pilot_results:
        ml = r["ml_output"]
        phys = r["physics_output"]
        print(f"  {r['location']['location_id']}: "
              f"calibrated_p={ml.get('calibrated_probability')}, "
              f"FoS={phys['factor_of_safety']}, "
              f"stability={phys['stability_state']}")

    print("\nScoring simulated 100-location monitoring batch (same loaded model)...")
    batch_results, elapsed = score_simulated_batch(service, rng, n_locations=100)
    print(f"Scored {len(batch_results)} locations in {elapsed:.3f}s "
          f"({elapsed/len(batch_results)*1000:.1f} ms/location) using ONE shared model instance.")

    n_flagged = sum(1 for r in batch_results if r["ml_output"]["predicted_class"] == 1)
    print(f"{n_flagged}/{len(batch_results)} simulated locations predicted_class=1 at threshold "
          f"{service.decision_threshold} this cycle.")

    summary_path = os.path.join(REPO_ROOT, "demo", "sample_predictions", "_100_location_batch_summary.json")
    with open(summary_path, "w") as f:
        json.dump({
            "n_locations_scored": len(batch_results),
            "elapsed_seconds": elapsed,
            "ms_per_location": elapsed / len(batch_results) * 1000,
            "n_predicted_positive_at_threshold": n_flagged,
            "decision_threshold": service.decision_threshold,
            "note": "Simulated locations with randomly sampled terrain/soil parameters, "
                    "scored through the single deployed model instance to demonstrate "
                    "the shared-model scaling mechanism. Not real NER site data.",
        }, f, indent=2)
    print(f"\nSaved batch summary to {summary_path}")
    print("Saved 3 individual pilot prediction JSONs to demo/sample_predictions/<LOC_ID>.json")


if __name__ == "__main__":
    main()
