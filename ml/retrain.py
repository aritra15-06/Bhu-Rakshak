"""
Retraining pipeline — architecture for contract section 19's feedback loop.

"The system does not have the standard reinforcement-learning structure...
supervised learning with delayed labels" — the mechanism is: verified
field/authority outcomes get appended to the training table as new rows
with verification_status=VERIFIED, then a full retrain runs through the
SAME train.py pipeline used originally, and the candidate is promoted only
if it passes quality gates against the current champion.

This is NOT wired to a live feedback database for the 2-day prototype —
per the Work Distribution doc, real-time ML training / large-scale
pipeline is explicitly cut for this round. This module is the documented
scaffold so the mechanism exists and is demonstrable, matching contract
section 21 item 4: "Do not try to train a model live on stage."
"""

from __future__ import annotations

import json
import os
import shutil
import sys
from datetime import datetime, timezone

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FEEDBACK_STORE_PATH = os.path.join(REPO_ROOT, "data", "labels", "verified_feedback.csv")


def append_verified_outcome(
    location_id: str,
    analysis_time_utc: str,
    forecast_horizon_hours: int,
    landslide_occurred_24h: int,
    event_time_utc: str = None,
    event_source: str = "field_verification",
    verification_status: str = "VERIFIED",
):
    """
    Contract section 19.2 steps 1-4: store each verified outcome, run
    QC (here: simple duplicate check on location_id+analysis_time_utc),
    and append only new rows.
    """
    os.makedirs(os.path.dirname(FEEDBACK_STORE_PATH), exist_ok=True)
    new_row = {
        "location_id": location_id,
        "analysis_time_utc": analysis_time_utc,
        "forecast_horizon_hours": forecast_horizon_hours,
        "landslide_occurred_24h": landslide_occurred_24h,
        "event_time_utc": event_time_utc,
        "event_source": event_source,
        "verification_status": verification_status,
        "ingested_at_utc": datetime.now(timezone.utc).isoformat(),
    }

    if os.path.exists(FEEDBACK_STORE_PATH):
        df = pd.read_csv(FEEDBACK_STORE_PATH)
        dup = ((df["location_id"] == location_id) & (df["analysis_time_utc"] == analysis_time_utc)).any()
        if dup:
            return False  # section 19.2 step 4: do not append duplicate events
        df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
    else:
        df = pd.DataFrame([new_row])

    df.to_csv(FEEDBACK_STORE_PATH, index=False)
    return True


def promotion_gate(candidate_metrics: dict, champion_metrics: dict) -> bool:
    """
    Contract section 19.2 step 8: "Promote the candidate only when it
    meets minimum recall/PR-AUC/calibration gates and does not violate
    agreed safety constraints."

    MVP gate (documented, adjustable): candidate must not regress recall
    by more than 2 percentage points versus champion, AND must not
    regress PR-AUC at all, AND calibrated Brier score must not get worse
    by more than 0.02. These thresholds are a starting policy for the
    team to tune, not a validated safety standard.
    """
    recall_ok = candidate_metrics["recall_at_0.5"] >= champion_metrics["recall_at_0.5"] - 0.02
    pr_auc_ok = candidate_metrics["pr_auc"] >= champion_metrics["pr_auc"]
    brier_ok = candidate_metrics.get("calibrated_brier_score_test", 1.0) <= \
        champion_metrics.get("calibrated_brier_score_test", 0.0) + 0.02
    return recall_ok and pr_auc_ok and brier_ok


def promote_candidate(model_version_candidate: str, model_version_champion: str):
    """
    Contract section 19.2 step 9: "Keep the previous champion model so the
    deployment can roll back immediately." Implemented here as a simple
    versioned-file rename/copy under artifacts/models — a real deployment
    would use a model registry, but the rollback semantics are the same.
    """
    models_dir = os.path.join(REPO_ROOT, "artifacts", "models")
    champion_backup = os.path.join(models_dir, f"{model_version_champion}.PREVIOUS_CHAMPION.ubj")
    current_champion_path = os.path.join(models_dir, f"{model_version_champion}.ubj")
    candidate_path = os.path.join(models_dir, f"{model_version_candidate}.ubj")

    if os.path.exists(current_champion_path):
        shutil.copy2(current_champion_path, champion_backup)

    if os.path.exists(candidate_path):
        shutil.copy2(candidate_path, current_champion_path)

    log_path = os.path.join(REPO_ROOT, "artifacts", "manifests", "promotion_log.jsonl")
    with open(log_path, "a") as f:
        f.write(json.dumps({
            "promoted_at_utc": datetime.now(timezone.utc).isoformat(),
            "candidate": model_version_candidate,
            "previous_champion_backed_up_as": os.path.basename(champion_backup),
        }) + "\n")


if __name__ == "__main__":
    print("This module provides retraining-loop primitives (append_verified_outcome, "
          "promotion_gate, promote_candidate). It is architecture, not a live scheduled "
          "job, for the 2-day prototype -- see module docstring.")
