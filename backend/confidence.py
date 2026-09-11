"""
Confidence assembly.

The raw prediction JSON already contains everything needed to judge
confidence -- it was never missing, just never assembled into one number
for display:
  - data_quality.completeness_0_1, spatial_alignment_0_1,
    temporal_alignment_0_1, source_reliability_0_1
  - physics_output.physics_status, physics_output.physics_validity_flags
  - ml_output.calibrated_probability's distance from 0.5 (a probability
    near 0.5 is intrinsically a less confident call than one near 0 or 1,
    independent of calibration quality)

This module combines those into ONE confidence_0_1 figure plus a
human-readable reason list, entirely downstream of the untouched JSON
contract -- same rule as severity.py: never merged into the contract,
always returned alongside it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List


@dataclass
class ConfidenceResult:
    confidence_0_1: float
    confidence_band: str  # LOW / MODERATE / HIGH
    reasons: List[str] = field(default_factory=list)


def assemble_confidence(prediction_json: dict) -> ConfidenceResult:
    dq = prediction_json["data_quality"]
    physics = prediction_json["physics_output"]
    ml = prediction_json["ml_output"]

    reasons = []

    dq_score = (
        dq["completeness_0_1"] * 0.35
        + dq["spatial_alignment_0_1"] * 0.20
        + dq["temporal_alignment_0_1"] * 0.20
        + dq["source_reliability_0_1"] * 0.25
    )
    if dq["overall_status"] != "PASS":
        reasons.append(f"Data quality flagged as {dq['overall_status']}, not PASS.")

    physics_penalty = 0.0
    if physics["physics_status"] == "UNAVAILABLE":
        physics_penalty = 0.6
        reasons.append("Physics engine could not compute a result for this input.")
    elif physics["physics_status"] == "PARTIAL":
        physics_penalty = 0.25
        n_flags = len(physics.get("physics_validity_flags", []))
        reasons.append(f"Physics engine flagged {n_flags} input validity issue(s).")

    if ml["predicted_class"] is None:
        decisiveness = 0.0
        reasons.append("No ML prediction available (physics prerequisite missing).")
    else:
        p = ml.get("calibrated_probability", ml.get("positive_class_probability_raw", 0.5))
        decisiveness = abs(p - 0.5) * 2  # 0 at p=0.5 (maximally uncertain), 1.0 at p=0 or 1
        if decisiveness < 0.3:
            reasons.append(f"Model probability ({p:.2f}) is close to the decision threshold — "
                            f"a marginal call, not a decisive one.")

    confidence = max(0.0, dq_score * (1 - physics_penalty) * (0.5 + 0.5 * decisiveness))
    confidence = round(min(1.0, confidence), 4)

    if confidence >= 0.7:
        band = "HIGH"
    elif confidence >= 0.4:
        band = "MODERATE"
    else:
        band = "LOW"

    if not reasons:
        reasons.append("Data quality checks passed, physics engine fully available, "
                        "model probability decisively away from the decision threshold.")

    return ConfidenceResult(confidence_0_1=confidence, confidence_band=band, reasons=reasons)
