"""
Training job tracker. Runs ml/train.py as a background subprocess and
tails its log output to report status/progress -- honest, since every
reported stage is a line the training pipeline actually printed, not a
simulated progress bar.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
import threading
import time
import uuid

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LOG_DIR = os.path.join(REPO_ROOT, "data", "snapshots")

_jobs: dict = {}

# (regex pattern in ml/train.py's stdout, progress_pct, stage label)
STAGE_MARKERS = [
    (r"Building dataset", 5, "building_dataset"),
    (r"Eligible rows:", 15, "filtering_eligible_rows"),
    (r"Dev: \d+ rows", 20, "splitting_dev_test"),
    (r"\[A_environmental_only\] GridSearchCV", 30, "grid_search_model_A"),
    (r"\[A_environmental_only\] GridSearchCV done", 48, "grid_search_model_A_done"),
    (r"\[B_environmental_plus_physics\] GridSearchCV", 55, "grid_search_model_B"),
    (r"\[B_environmental_plus_physics\] GridSearchCV done", 75, "grid_search_model_B_done"),
    (r"Selected model for deployment", 85, "model_selected"),
    (r"Post-calibration metrics", 92, "calibrating"),
    (r"Saved model to", 98, "saving_artifacts"),
]


def start_training_job() -> str:
    job_id = str(uuid.uuid4())[:8]
    os.makedirs(LOG_DIR, exist_ok=True)
    log_path = os.path.join(LOG_DIR, f"train_job_{job_id}.log")

    proc = subprocess.Popen(
        [sys.executable, "-u", "-m", "ml.train"],
        cwd=REPO_ROOT,
        stdout=open(log_path, "w"),
        stderr=subprocess.STDOUT,
    )

    _jobs[job_id] = {
        "job_id": job_id, "status": "RUNNING", "stage": "starting",
        "progress_pct": 0, "log_path": log_path, "process": proc,
        "started_at": time.time(), "finished_at": None,
    }

    threading.Thread(target=_watch_job, args=(job_id,), daemon=True).start()
    return job_id


def _watch_job(job_id: str):
    job = _jobs[job_id]
    proc = job["process"]
    while proc.poll() is None:
        time.sleep(1.5)
        _update_progress(job_id)
    _update_progress(job_id)
    job["status"] = "COMPLETED" if proc.returncode == 0 else "FAILED"
    job["finished_at"] = time.time()
    job["progress_pct"] = 100 if proc.returncode == 0 else job["progress_pct"]


def _update_progress(job_id: str):
    job = _jobs[job_id]
    try:
        with open(job["log_path"]) as f:
            content = f.read()
    except FileNotFoundError:
        return

    for pattern, pct, stage in STAGE_MARKERS:
        if re.search(pattern, content):
            if pct > job["progress_pct"]:
                job["progress_pct"] = pct
                job["stage"] = stage

    lines = content.strip().split("\n")
    job["log_tail"] = lines[-8:] if lines else []


def get_job_status(job_id: str) -> dict:
    job = _jobs.get(job_id)
    if not job:
        return {"error": "unknown job_id"}
    _update_progress(job_id)
    return {
        "job_id": job["job_id"], "status": job["status"], "stage": job["stage"],
        "progress_pct": job["progress_pct"], "log_tail": job.get("log_tail", []),
        "elapsed_seconds": round((job["finished_at"] or time.time()) - job["started_at"], 1),
    }
