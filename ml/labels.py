"""
Label eligibility handling.

Contract section 6 critical label rule: only VERIFIED rows with a
resolved 0/1 label enter supervised training; UNKNOWN rows are excluded.
In this synthetic dataset every row is constructed as VERIFIED by design
(see ml/dataset.py), but this function is still enforced so the same
pipeline works unchanged once real field-verified rows replace/augment
the synthetic corpus (contract section 19: retraining ingests verified
outcomes into this same eligibility filter).
"""

from __future__ import annotations

import pandas as pd

from ml.feature_manifest import FEATURE_NAMES


def filter_eligible_rows(df: pd.DataFrame) -> pd.DataFrame:
    eligible = df[
        (df["verification_status"] == "VERIFIED")
        & (df["landslide_occurred_24h"].isin([0, 1]))
        & (df["physics_status"] != "UNAVAILABLE")
    ].copy()
    return eligible


def build_feature_matrix(df: pd.DataFrame, feature_names=None):
    feature_names = feature_names or FEATURE_NAMES
    missing = [f for f in feature_names if f not in df.columns]
    if missing:
        raise ValueError(f"dataset missing required feature columns: {missing}")
    X = df[feature_names].copy()
    y = df["landslide_occurred_24h"].astype(int)
    groups = df["location_id"]
    return X, y, groups
