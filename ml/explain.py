"""
Post-hoc feature explanations via SHAP.

Contract section 12 step 14: "Generate feature explanations such as SHAP
values for evidence cards. Keep explanations post-hoc and do not call them
causal proof."

This wraps the base (uncalibrated) XGBoost model's TreeExplainer since
SHAP's TreeExplainer needs direct tree access; the calibrated probability
shown to the user is a separate number (contract section 23: raw
probability, calibrated probability, confidence, risk score, FoS and
action are different quantities). SHAP contributions here explain the
raw model's margin, which is the standard and correct use of TreeExplainer
attribution — presenting it as "why the model leaned this way" language,
not as physical causation.
"""

from __future__ import annotations

import numpy as np


def top_feature_contributions(base_model, X_row, feature_names, top_k=5):
    """
    X_row: a single-row DataFrame/array with columns == feature_names.
    Returns a list of {"feature": name, "contribution": float}, sorted by
    |contribution| descending, top_k entries.
    """
    import shap

    explainer = shap.TreeExplainer(base_model)
    shap_values = explainer.shap_values(X_row)
    if isinstance(shap_values, list):
        # binary classifier sometimes returns [class0_shap, class1_shap]
        shap_values = shap_values[-1]
    values = np.array(shap_values).reshape(-1)

    pairs = list(zip(feature_names, values))
    pairs.sort(key=lambda p: abs(p[1]), reverse=True)
    top = pairs[:top_k]
    return [{"feature": name, "contribution": round(float(val), 4)} for name, val in top]
