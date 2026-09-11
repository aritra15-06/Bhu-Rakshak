"""
Time + geography aware splitting.

Contract section 12 step 6: "Split the data by time and geography before
tuning... Do not randomly split adjacent cells from the same storm into
train and test."
Contract section 13: "A custom splitter that keeps time blocks and/or
geographic groups together is preferable to default StratifiedKFold."

Mechanism: split by location_id (group) so no location appears in both
train and test/dev (prevents the model from ever having seen the exact
site, which matters more here than temporal leakage since our synthetic
season is a single simulated monsoon window per cell, not multi-year).
Within the CV loop we use GroupKFold on location_id, which respects both
"same storm, same cell" grouping AND generalization across never-seen
locations, which is directly the property that matters for a model meant
to serve ~100 unseen monitored locations.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.model_selection import GroupKFold


def location_holdout_split(df: pd.DataFrame, test_frac: float = 0.2, seed: int = 42):
    """
    Hold out a fraction of DISTINCT locations entirely (not rows) for the
    final untouched test set (contract section 12 step 7). All real pilot
    locations are forced into the training/dev pool, never into test --
    the demo needs the model actually fit on/near the real sites' regime;
    they still generalize-test against ~90 unseen synthetic locations.
    """
    rng = np.random.RandomState(seed)
    all_locations = df["location_id"].unique()
    pilot_locations = df.loc[df["is_real_pilot_location"], "location_id"].unique()
    non_pilot = np.array([l for l in all_locations if l not in pilot_locations])
    rng.shuffle(non_pilot)

    n_test = int(len(non_pilot) * test_frac)
    test_locations = set(non_pilot[:n_test])
    dev_locations = set(non_pilot[n_test:]) | set(pilot_locations)

    test_df = df[df["location_id"].isin(test_locations)].reset_index(drop=True)
    dev_df = df[df["location_id"].isin(dev_locations)].reset_index(drop=True)
    return dev_df, test_df


def group_kfold_splitter(n_splits: int = 5):
    """GroupKFold keyed on location_id — the CV splitter passed to
    GridSearchCV's `cv` argument (paired with `groups=dev_df.location_id`)."""
    return GroupKFold(n_splits=n_splits)
