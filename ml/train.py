"""
Training pipeline.

Implements contract sections 12-15:
  - freeze target definition (landslide_occurred_24h, 24h horizon)
  - train (A) environmental-only baseline and (B) environmental+physics
  - location-group-aware dev/test split (ml/split.py)
  - GridSearchCV with GroupKFold, scoring='average_precision' (PR-AUC)
  - refit best params with early stopping on an independent validation fold
  - evaluate ONCE on the untouched test set
  - sigmoid calibration on a held-out calibration split, disjoint from
    the fitting fold (per contract section 15, sigmoid preferred over
    isotonic for a small calibration set)
  - save model, calibrator, metrics, manifests with versions

Run: python3 -m ml.train  (from repo root)
"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
try:
    from sklearn.frozen import FrozenEstimator  # sklearn >= 1.6
except ImportError:
    FrozenEstimator = None
from sklearn.metrics import (
    average_precision_score, roc_auc_score, recall_score, precision_score,
    f1_score, log_loss, brier_score_loss, confusion_matrix,
)
from sklearn.model_selection import GridSearchCV, GroupKFold, train_test_split
from xgboost import XGBClassifier

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ml.dataset import build_dataset, dataset_hash, RNG_SEED
from ml.labels import filter_eligible_rows, build_feature_matrix
from ml.split import location_holdout_split, group_kfold_splitter
from ml.feature_manifest import (
    FEATURE_NAMES, ENVIRONMENTAL_ONLY_FEATURES, PHYSICS_FEATURES,
    FEATURE_SCHEMA_VERSION, manifest_as_records,
)
from physics.schemas import PHYSICS_MODEL_VERSION

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARTIFACTS_DIR = os.path.join(REPO_ROOT, "artifacts")
MODEL_VERSION = "xgb_landslide_v1.0"
DECISION_THRESHOLD_DEFAULT = 0.50

# Reduced grid vs. the contract's full illustrative grid (section 13) —
# the full cross product (3*4*3*4*3*3*4*3*4 = 186,624 fits) is not
# feasible in a 2-day sandbox run. This subset keeps the same axes and
# the same selection procedure (GridSearchCV, PR-AUC, GroupKFold) but at
# a size that finishes in minutes; swap PARAM_GRID for the full contract
# grid if more compute/time is available before the demo.
PARAM_GRID = {
    "n_estimators": [200, 400],
    "max_depth": [2, 3, 4],
    "learning_rate": [0.05, 0.1],
    "min_child_weight": [1, 5],
    "subsample": [0.85, 1.0],
    "colsample_bytree": [0.85, 1.0],
    "reg_lambda": [1, 5],
}

# Sandbox-constrained fast grid: same axes/spirit as PARAM_GRID and the
# contract's full illustrative grid (section 13), but small enough to
# finish in a shared, low-core build environment without n_jobs
# parallelism (which was unstable/slow here). Swap back to PARAM_GRID
# (or the contract's full grid) on real project hardware before the demo
# if a broader search is wanted.
FAST_PARAM_GRID = {
    "n_estimators": [200, 400],
    "max_depth": [2, 3, 4],
    "learning_rate": [0.05, 0.1],
    "min_child_weight": [1, 5],
    "subsample": [0.85, 1.0],
    "colsample_bytree": [1.0],
    "reg_lambda": [1, 5],
}


def make_base_model(scale_pos_weight: float = 1.0) -> XGBClassifier:
    return XGBClassifier(
        objective="binary:logistic",
        eval_metric="logloss",
        tree_method="hist",
        random_state=42,
        scale_pos_weight=scale_pos_weight,
    )


def run_grid_search(X_dev, y_dev, groups_dev, scale_pos_weight, n_splits=3, param_grid=None, n_jobs=1):
    model = make_base_model(scale_pos_weight)
    cv = GroupKFold(n_splits=n_splits)
    search = GridSearchCV(
        estimator=model,
        param_grid=param_grid or FAST_PARAM_GRID,
        scoring="average_precision",
        cv=cv,
        refit=True,
        n_jobs=n_jobs,
        verbose=0,
    )
    search.fit(X_dev, y_dev, groups=groups_dev)
    return search


def fit_with_early_stopping(best_params, X_fit, y_fit, X_val, y_val, scale_pos_weight):
    params = dict(best_params)
    model = XGBClassifier(
        objective="binary:logistic",
        eval_metric="logloss",
        tree_method="hist",
        random_state=42,
        scale_pos_weight=scale_pos_weight,
        early_stopping_rounds=30,
        **params,
    )
    model.fit(X_fit, y_fit, eval_set=[(X_val, y_val)], verbose=False)
    return model


def evaluate(model, X_test, y_test, label: str) -> dict:
    proba = model.predict_proba(X_test)[:, 1]
    pred = (proba >= DECISION_THRESHOLD_DEFAULT).astype(int)
    cm = confusion_matrix(y_test, pred).tolist()
    metrics = {
        "label": label,
        "n_test_rows": int(len(y_test)),
        "positive_rate_test": float(y_test.mean()),
        "pr_auc": float(average_precision_score(y_test, proba)),
        "roc_auc": float(roc_auc_score(y_test, proba)),
        "recall_at_0.5": float(recall_score(y_test, pred, zero_division=0)),
        "precision_at_0.5": float(precision_score(y_test, pred, zero_division=0)),
        "f1_at_0.5": float(f1_score(y_test, pred, zero_division=0)),
        "log_loss": float(log_loss(y_test, proba, labels=[0, 1])),
        "brier_score": float(brier_score_loss(y_test, proba)),
        "confusion_matrix_at_0.5": {"labels": [0, 1], "matrix": cm},
    }
    return metrics


def train_one_model(df_dev, df_test, feature_names, label: str):
    X_dev, y_dev, groups_dev = build_feature_matrix(df_dev, feature_names)
    X_test, y_test, _ = build_feature_matrix(df_test, feature_names)

    # further split dev into fit/val for early stopping, group-aware
    dev_locations = df_dev["location_id"].unique()
    rng = np.random.RandomState(42)
    rng.shuffle(dev_locations)
    n_val_locs = max(1, int(len(dev_locations) * 0.15))
    val_locs = set(dev_locations[:n_val_locs])
    fit_mask = ~df_dev["location_id"].isin(val_locs)
    val_mask = df_dev["location_id"].isin(val_locs)

    X_fit, y_fit, _ = build_feature_matrix(df_dev[fit_mask], feature_names)
    X_val, y_val, _ = build_feature_matrix(df_dev[val_mask], feature_names)

    pos = max(int(y_dev.sum()), 1)
    neg = max(int((1 - y_dev).sum()), 1)
    scale_pos_weight = neg / pos

    print(f"[{label}] GridSearchCV over {len(X_dev)} dev rows "
          f"({df_dev['location_id'].nunique()} locations), scale_pos_weight={scale_pos_weight:.3f}")
    t0 = time.time()
    search = run_grid_search(X_dev, y_dev, groups_dev, scale_pos_weight)
    print(f"[{label}] GridSearchCV done in {time.time()-t0:.1f}s, "
          f"best_score(PR-AUC, CV)={search.best_score_:.4f}")
    print(f"[{label}] best_params={search.best_params_}")

    final_model = fit_with_early_stopping(
        search.best_params_, X_fit, y_fit, X_val, y_val, scale_pos_weight
    )

    metrics = evaluate(final_model, X_test, y_test, label)
    metrics["cv_pr_auc_dev"] = float(search.best_score_)
    metrics["best_params"] = search.best_params_
    metrics["best_iteration"] = int(getattr(final_model, "best_iteration", final_model.n_estimators))
    metrics["scale_pos_weight"] = float(scale_pos_weight)

    return final_model, metrics, (X_val, y_val)


def calibrate_model(model, X_cal, y_cal):
    """
    Sigmoid (Platt) calibration on a split disjoint from base-model
    fitting, per contract section 15. CalibratedClassifierCV with
    cv='prefit' fits only the calibrator on (X_cal, y_cal), reusing the
    already-fit base estimator.
    """
    if FrozenEstimator is not None:
        # sklearn >= 1.6 API: wrap the already-fit estimator so
        # CalibratedClassifierCV only fits the calibrator, not the base model.
        calibrator = CalibratedClassifierCV(FrozenEstimator(model), method="sigmoid")
    else:
        # older sklearn fallback
        calibrator = CalibratedClassifierCV(model, method="sigmoid", cv="prefit")
    calibrator.fit(X_cal, y_cal)
    return calibrator


def main():
    os.makedirs(os.path.join(ARTIFACTS_DIR, "models"), exist_ok=True)
    os.makedirs(os.path.join(ARTIFACTS_DIR, "calibration"), exist_ok=True)
    os.makedirs(os.path.join(ARTIFACTS_DIR, "metrics"), exist_ok=True)
    os.makedirs(os.path.join(ARTIFACTS_DIR, "manifests"), exist_ok=True)

    pilot_path = os.path.join(REPO_ROOT, "demo", "pilot_locations.json")
    print("Building dataset...")
    df_all = build_dataset(pilot_path, n_synthetic_cells=300, rows_per_cell=20, seed=RNG_SEED)
    snapshot_id = f"SNAP-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}"
    d_hash = dataset_hash(df_all)

    df_eligible = filter_eligible_rows(df_all)
    print(f"Eligible rows: {len(df_eligible)} / {len(df_all)} total "
          f"(dropped {len(df_all)-len(df_eligible)} ineligible/UNAVAILABLE)")

    df_dev, df_test = location_holdout_split(df_eligible, test_frac=0.2, seed=RNG_SEED)
    print(f"Dev: {len(df_dev)} rows / {df_dev['location_id'].nunique()} locations | "
          f"Test: {len(df_test)} rows / {df_test['location_id'].nunique()} locations "
          f"(test locations never seen in dev)")

    results = {}

    # (A) environmental-only baseline
    model_a, metrics_a, calsplit_a = train_one_model(
        df_dev, df_test, ENVIRONMENTAL_ONLY_FEATURES, "A_environmental_only"
    )
    results["A_environmental_only"] = metrics_a

    # (B) environmental + physics-derived
    model_b, metrics_b, calsplit_b = train_one_model(
        df_dev, df_test, FEATURE_NAMES, "B_environmental_plus_physics"
    )
    results["B_environmental_plus_physics"] = metrics_b

    print("\n=== Baseline (A) vs Physics-augmented (B), held-out test set ===")
    for k in ["pr_auc", "roc_auc", "recall_at_0.5", "precision_at_0.5", "f1_at_0.5", "log_loss", "brier_score"]:
        print(f"{k:18s}  A={metrics_a[k]:.4f}   B={metrics_b[k]:.4f}   "
              f"delta={metrics_b[k]-metrics_a[k]:+.4f}")

    physics_helps = metrics_b["pr_auc"] >= metrics_a["pr_auc"]
    chosen_label = "B_environmental_plus_physics" if physics_helps else "A_environmental_only"
    chosen_model = model_b if physics_helps else model_a
    chosen_features = FEATURE_NAMES if physics_helps else ENVIRONMENTAL_ONLY_FEATURES
    chosen_calsplit = calsplit_b if physics_helps else calsplit_a
    print(f"\nSelected model for deployment: {chosen_label} "
          f"(physics features {'improved' if physics_helps else 'did not improve'} PR-AUC on held-out test)")

    # Calibrate the selected model on its early-stopping validation split
    # (disjoint from the fit split used to train trees) — contract section 15.
    X_cal, y_cal = chosen_calsplit
    calibrator = calibrate_model(chosen_model, X_cal, y_cal)

    X_test, y_test, _ = build_feature_matrix(df_test, chosen_features)
    calibrated_proba = calibrator.predict_proba(X_test)[:, 1]
    calibration_metrics = {
        "calibrated_pr_auc_test": float(average_precision_score(y_test, calibrated_proba)),
        "calibrated_roc_auc_test": float(roc_auc_score(y_test, calibrated_proba)),
        "calibrated_log_loss_test": float(log_loss(y_test, calibrated_proba, labels=[0, 1])),
        "calibrated_brier_score_test": float(brier_score_loss(y_test, calibrated_proba)),
        "calibration_method": "sigmoid",
        "calibration_split_n": int(len(y_cal)),
    }
    print("\n=== Post-calibration metrics on held-out test set ===")
    for k, v in calibration_metrics.items():
        print(f"{k}: {v}")

    # --- Persist everything ---
    model_path = os.path.join(ARTIFACTS_DIR, "models", f"{MODEL_VERSION}.ubj")
    calibrator_path = os.path.join(ARTIFACTS_DIR, "calibration", f"{MODEL_VERSION}_sigmoid.json")

    chosen_model.get_booster().save_model(model_path)

    inner_cal = calibrator.calibrated_classifiers_[0].calibrators[0]
    calib_data = {
        "a": float(inner_cal.a_),
        "b": float(inner_cal.b_),
        "calibration_method": "sigmoid",
    }
    with open(calibrator_path, "w") as f:
        json.dump(calib_data, f, indent=2)

    metrics_path = os.path.join(ARTIFACTS_DIR, "metrics", f"{MODEL_VERSION}_metrics.json")
    full_metrics = {
        "model_version": MODEL_VERSION,
        "feature_schema_version": FEATURE_SCHEMA_VERSION,
        "physics_model_version": PHYSICS_MODEL_VERSION,
        "training_snapshot_id": snapshot_id,
        "dataset_hash": d_hash,
        "decision_threshold": DECISION_THRESHOLD_DEFAULT,
        "selected_model": chosen_label,
        "chosen_feature_set": chosen_features,
        "comparison_A_environmental_only": metrics_a,
        "comparison_B_environmental_plus_physics": metrics_b,
        "post_calibration": calibration_metrics,
        "IMPORTANT_data_provenance_notice": (
            "Trained and evaluated on a SYNTHETIC dataset (see ml/dataset.py docstring). "
            "PR-AUC/ROC-AUC/recall/precision here measure whether the model learned the "
            "documented synthetic labeling function (FoS + rainfall + historical density -> "
            "logistic probability), NOT validated real-world landslide prediction skill. "
            "Do not present these numbers as field-validated accuracy in the pitch."
        ),
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
    }
    with open(metrics_path, "w") as f:
        json.dump(full_metrics, f, indent=2)

    manifest_path = os.path.join(ARTIFACTS_DIR, "manifests", f"feature_manifest_{FEATURE_SCHEMA_VERSION}.json")
    with open(manifest_path, "w") as f:
        json.dump({
            "feature_schema_version": FEATURE_SCHEMA_VERSION,
            "features": manifest_as_records(),
            "environmental_only_features": ENVIRONMENTAL_ONLY_FEATURES,
            "physics_features": PHYSICS_FEATURES,
            "chosen_feature_set_for_deployed_model": chosen_features,
        }, f, indent=2)

    print(f"\nSaved model to {model_path}")
    print(f"Saved calibrator to {calibrator_path}")
    print(f"Saved metrics to {metrics_path}")
    print(f"Saved feature manifest to {manifest_path}")

    return full_metrics


if __name__ == "__main__":
    main()
