"""
Prediction service.

Combines the Physics Engine and the trained/calibrated XGBoost model into
ONE raw prediction JSON, matching contract section 16 exactly. This is the
"single stable hand-off" artifact that every other team member's system
(dashboard, Action Engine, Impact Engine, alerts) consumes.

This module is deliberately decoupled from any web framework (FastAPI is
optional per the Work Distribution doc: "Wire a real backend (FastAPI)
only if time allows — it changes nothing the judges see"). Everyone can
call `predict_location(...)` directly, or a thin FastAPI wrapper can call
it — the JSON shape is identical either way.

Scaling note (this is the actual mechanism for monitoring ~100 locations
from ONE trained model, see docs/scaling_notes.md for the full
explanation): predict_location() takes a location_id + its current
terrain/soil/rainfall state as arguments. It loads ONE shared model file.
Calling it 100 times for 100 different location payloads reuses the same
in-memory model — there is no per-location model artifact, no per-location
training run, and no growth in deployed model count as pilot coverage
grows from 3 to 100 locations.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import sys
from datetime import datetime, timezone
from typing import List, Optional

import numpy as np
import pandas as pd
import xgboost as xgb

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from physics.schemas import SlopeState, PHYSICS_MODEL_VERSION
from physics.engine import run_physics
from ml.feature_manifest import FEATURE_SCHEMA_VERSION
from ml.explain import top_feature_contributions
from service.schemas import SCHEMA_VERSION, validate_raw_prediction_json

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PREDICTION_SERVICE_VERSION = "1.0.0"

# Expected SHA-256 of the shipped model file, so a corrupted/incomplete
# download (a real, observed failure mode: partial downloads, antivirus
# quarantine-and-mangle, browser "(1)" duplicate-download artifacts) is
# caught with a clear, actionable message instead of crashing deep
# inside XGBoost's C library with "input stream corrupted", which gives
# no indication of what actually went wrong or how to fix it.
EXPECTED_MODEL_SHA256 = "e3d8b0510647132c2002903172e34dcc954ff40dbd6663b679b32e94760b1919"


def _verify_file_integrity(path: str, expected_sha256: Optional[str], label: str):
    if expected_sha256 is None:
        return
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"\n\n*** {label} not found at: {path}\n"
            f"*** This usually means the zip was extracted incompletely, or you are\n"
            f"*** running from the wrong folder. Re-download and fully re-extract the\n"
            f"*** project zip, then try again.\n"
        )
    with open(path, "rb") as f:
        actual = hashlib.sha256(f.read()).hexdigest()
    if actual != expected_sha256:
        raise ValueError(
            f"\n\n*** {label} appears to be CORRUPTED OR INCOMPLETE.\n"
            f"*** Expected SHA-256: {expected_sha256}\n"
            f"*** Actual SHA-256:   {actual}\n"
            f"*** File size on disk: {os.path.getsize(path)} bytes\n"
            f"***\n"
            f"*** This is a file-integrity problem, not a code bug -- something altered\n"
            f"*** the file between when it was built and when it reached this machine.\n"
            f"*** Known causes: an interrupted/partial download (look for a duplicate\n"
            f"*** file like 'Bhu-Rakshak_Complete_System (1).zip' next to the original --\n"
            f"*** that '(1)' usually means the first download did not finish), antivirus\n"
            f"*** quarantine touching the file, or extracting with a tool that alters\n"
            f"*** binary files (rare, but some very old zip tools do this).\n"
            f"***\n"
            f"*** FIX: delete this entire extracted folder AND any partial zip files,\n"
            f"*** re-download the zip fresh, and fully re-extract it before running\n"
            f"*** the launcher again. Do not reuse this folder.\n"
        )


class PredictionService:
    """
    Loads the trained model + calibrator + feature manifest ONCE, then
    serves predictions for any number of locations. This is the object
    that makes "one shared model for ~100 places" concrete: instantiate
    once, call predict() many times with different location payloads.
    """

    def __init__(
        self,
        model_path: str,
        calibrator_path: str,
        metrics_path: str,
        model_version: str,
        decision_threshold: float = 0.50,
        expected_model_sha256: Optional[str] = None,
    ):
        _verify_file_integrity(model_path, expected_model_sha256, "Model file")
        try:
            self.base_model = xgb.Booster()
            self.base_model.load_model(model_path)
        except Exception as e:
            raise RuntimeError(
                f"\n\n*** Failed to load the model file at {model_path}\n"
                f"*** Underlying error: {e}\n"
                f"*** This usually means the file is corrupted or incomplete, even though\n"
                f"*** its integrity check passed (or was skipped). Try re-downloading and\n"
                f"*** fully re-extracting the project zip.\n"
            ) from e

        with open(calibrator_path) as f:
            calib_data = json.load(f)
        self.calib_a = float(calib_data["a"])
        self.calib_b = float(calib_data["b"])

        with open(metrics_path) as f:
            self.metrics_meta = json.load(f)
        self.feature_names = self.metrics_meta["chosen_feature_set"]
        self.model_version = model_version
        self.decision_threshold = decision_threshold

    @classmethod
    def load_default(cls) -> "PredictionService":
        model_version = "xgb_landslide_v1.0"
        return cls(
            model_path=os.path.join(REPO_ROOT, "artifacts", "models", f"{model_version}.ubj"),
            calibrator_path=os.path.join(REPO_ROOT, "artifacts", "calibration", f"{model_version}_sigmoid.json"),
            metrics_path=os.path.join(REPO_ROOT, "artifacts", "metrics", f"{model_version}_metrics.json"),
            model_version=model_version,
            expected_model_sha256=EXPECTED_MODEL_SHA256,
        )

    def _calibrated_probability(self, raw_margin: float) -> float:
        raw_p = 1.0 / (1.0 + math.exp(-raw_margin))
        cal_p = 1.0 / (1.0 + math.exp(self.calib_a * raw_p + self.calib_b))
        return float(np.clip(cal_p, 0.0, 1.0))

    def _assess_data_quality(self, features_row: dict, hourly_rainfall_mm: List[float]) -> dict:
        """
        Lightweight, documented data-quality scoring for the data_quality
        block. This is intentionally simple rule-based scoring for the
        MVP, not a learned model — consistent with contract section 5's
        note that data-quality scores are "preferably not used as hazard
        predictors" and belong in confidence/evidence, not ml_output.
        """
        n_missing = sum(1 for v in features_row.values() if v is None or (isinstance(v, float) and np.isnan(v)))
        completeness = max(0.0, 1.0 - n_missing / max(len(features_row), 1))
        temporal_alignment = 1.0 if len(hourly_rainfall_mm) >= 24 else max(0.5, len(hourly_rainfall_mm) / 24.0)
        spatial_alignment = 0.95  # placeholder constant for MVP; real value needs per-source alignment metadata
        source_reliability = 0.90  # placeholder constant for MVP; real value needs per-source reliability registry
        overall_status = "PASS" if completeness >= 0.8 and temporal_alignment >= 0.8 else "PARTIAL"
        return {
            "overall_status": overall_status,
            "completeness_0_1": round(completeness, 4),
            "spatial_alignment_0_1": spatial_alignment,
            "temporal_alignment_0_1": round(temporal_alignment, 4),
            "source_reliability_0_1": source_reliability,
        }

    def predict_location(
        self,
        location_id: str,
        latitude: float,
        longitude: float,
        slope_state: SlopeState,
        hourly_rainfall_mm: List[float],
        environmental_features: dict,
        analysis_time_utc: Optional[str] = None,
        forecast_horizon_hours: int = 24,
        soil_texture: Optional[str] = None,
        include_explainability: bool = True,
    ) -> dict:
        """
        environmental_features must supply every non-physics feature name
        listed in ml/feature_manifest.py (elevation_m, slope_deg,
        aspect_sin/cos, rainfall window sums, soil %, historical counts,
        etc). Physics-derived features are computed here, not passed in,
        so they cannot drift from the physics engine version used to
        score this location_id.
        """
        analysis_time_utc = analysis_time_utc or datetime.now(timezone.utc).isoformat()

        physics_out = run_physics(slope_state, hourly_rainfall_mm, soil_texture=soil_texture)

        feature_row = dict(environmental_features)
        feature_row.update({
            "factor_of_safety": physics_out.factor_of_safety,
            "pore_pressure_kpa": physics_out.pore_pressure_kpa,
            "effective_saturation_0_1": physics_out.effective_saturation_0_1,
            "infiltration_rate_mm_h": physics_out.infiltration_rate_mm_h,
            "cumulative_infiltration_mm": physics_out.cumulative_infiltration_mm,
        })

        missing = [f for f in self.feature_names if f not in feature_row]
        if missing:
            raise ValueError(f"missing required features for prediction: {missing}")

        X = pd.DataFrame([{f: feature_row[f] for f in self.feature_names}])

        if physics_out.physics_status == "UNAVAILABLE":
            # Per contract: physics_status must reach all downstream
            # consumers; ML cannot fabricate a prediction on missing
            # physics features that the deployed model requires.
            ml_output = {
                "raw_margin": None,
                "positive_class_probability_raw": None,
                "class_probabilities": {"0": None, "1": None},
                "predicted_class": None,
            }
            explainability = {"feature_contributions": []}
        else:
            dmatrix = xgb.DMatrix(X)
            raw_margin = float(self.base_model.predict(dmatrix, output_margin=True)[0])
            raw_proba = 1.0 / (1.0 + math.exp(-raw_margin))
            calibrated_proba = self._calibrated_probability(raw_margin)
            predicted_class = int(calibrated_proba >= self.decision_threshold)

            ml_output = {
                "raw_margin": round(raw_margin, 4),
                "positive_class_probability_raw": round(raw_proba, 4),
                "class_probabilities": {
                    "0": round(1 - raw_proba, 4),
                    "1": round(raw_proba, 4),
                },
                "predicted_class": predicted_class,
                # calibrated_probability is additionally exposed here for
                # downstream convenience; ml_output.positive_class_probability_raw
                # remains the raw (uncalibrated) figure the contract names.
                "calibrated_probability": round(calibrated_proba, 4),
            }

            if include_explainability:
                contributions = top_feature_contributions(self.base_model, X, self.feature_names, top_k=5)
            else:
                contributions = []
            explainability = {"feature_contributions": contributions}

        data_quality = self._assess_data_quality(feature_row, hourly_rainfall_mm)

        feature_vector_str = json.dumps({f: feature_row.get(f) for f in self.feature_names}, sort_keys=True)
        feature_vector_hash = "sha256:" + hashlib.sha256(feature_vector_str.encode()).hexdigest()
        input_snapshot_id = f"SNAP-{analysis_time_utc.replace(':', '').replace('-', '')}-{location_id}"

        prediction_id = f"BR-{location_id}-{analysis_time_utc}"

        result = {
            "schema_version": SCHEMA_VERSION,
            "prediction_id": prediction_id,
            "model": {
                "algorithm": "XGBoostClassifier",
                "model_version": self.model_version,
                "feature_schema_version": FEATURE_SCHEMA_VERSION,
                "physics_model_version": PHYSICS_MODEL_VERSION,
                "decision_threshold": self.decision_threshold,
            },
            "location": {
                "location_id": location_id,
                "latitude": latitude,
                "longitude": longitude,
            },
            "analysis_time_utc": analysis_time_utc,
            "forecast_horizon_hours": forecast_horizon_hours,
            "ml_output": ml_output,
            "physics_output": physics_out.to_json_dict(),
            "data_quality": data_quality,
            "traceability": {
                "input_snapshot_id": input_snapshot_id,
                "feature_vector_hash": feature_vector_hash,
                "prediction_service_version": PREDICTION_SERVICE_VERSION,
            },
            "optional_explainability": explainability,
        }

        errors = validate_raw_prediction_json(result)
        if errors:
            raise RuntimeError(f"prediction service produced an invalid contract JSON: {errors}")

        return result

    def predict_many(self, location_payloads: List[dict]) -> List[dict]:
        """
        Convenience batch entry point: scores an arbitrary number of
        locations (e.g. all ~100 monitored NER sites) through the SAME
        loaded model instance. This is the concrete "simultaneous
        monitoring" path — see docs/scaling_notes.md.
        Each payload dict must match predict_location's kwargs.
        """
        return [self.predict_location(**payload) for payload in location_payloads]
