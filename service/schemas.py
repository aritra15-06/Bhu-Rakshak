"""
Raw prediction JSON schema — mirrors contract section 16 exactly.

Field names, nesting, and types here are locked to the contract. Do not
rename or restructure without updating the contract doc and notifying the
whole team (this is the "single working specification" referenced in the
contract's opening line, and the Work Distribution doc's Open Item names
this exact hand-off as "the single biggest risk to losing time on
integration").
"""

from __future__ import annotations

SCHEMA_VERSION = "4.0.0"

REQUIRED_TOP_LEVEL_KEYS = [
    "schema_version", "prediction_id", "model", "location",
    "analysis_time_utc", "forecast_horizon_hours", "ml_output",
    "physics_output", "data_quality", "traceability",
    "optional_explainability",
]

REQUIRED_MODEL_KEYS = [
    "algorithm", "model_version", "feature_schema_version",
    "physics_model_version", "decision_threshold",
]

REQUIRED_ML_OUTPUT_KEYS = [
    "raw_margin", "positive_class_probability_raw", "class_probabilities",
    "predicted_class",
]

REQUIRED_DATA_QUALITY_KEYS = [
    "overall_status", "completeness_0_1", "spatial_alignment_0_1",
    "temporal_alignment_0_1", "source_reliability_0_1",
]

REQUIRED_TRACEABILITY_KEYS = [
    "input_snapshot_id", "feature_vector_hash", "prediction_service_version",
]


def validate_raw_prediction_json(d: dict) -> list:
    """Returns a list of validation error strings; empty list == valid."""
    errors = []
    for k in REQUIRED_TOP_LEVEL_KEYS:
        if k not in d:
            errors.append(f"missing top-level key: {k}")
    if "model" in d:
        for k in REQUIRED_MODEL_KEYS:
            if k not in d["model"]:
                errors.append(f"missing model.{k}")
    if "ml_output" in d:
        for k in REQUIRED_ML_OUTPUT_KEYS:
            if k not in d["ml_output"]:
                errors.append(f"missing ml_output.{k}")
    if "data_quality" in d:
        for k in REQUIRED_DATA_QUALITY_KEYS:
            if k not in d["data_quality"]:
                errors.append(f"missing data_quality.{k}")
    if "traceability" in d:
        for k in REQUIRED_TRACEABILITY_KEYS:
            if k not in d["traceability"]:
                errors.append(f"missing traceability.{k}")

    forbidden = ["risk_score", "confidence", "affected_villages", "affected_roads",
                 "recommended_action", "action", "impact"]
    for k in forbidden:
        if k in d:
            errors.append(f"forbidden key present at top level (belongs downstream per contract section 18): {k}")

    return errors
