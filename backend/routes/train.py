from fastapi import APIRouter, HTTPException

from backend.models.training_jobs import start_training_job, get_job_status

router = APIRouter()


@router.post("/train/start")
def train_start():
    job_id = start_training_job()
    return {"job_id": job_id, "status": "RUNNING"}


@router.get("/train/status/{job_id}")
def train_status(job_id: str):
    status = get_job_status(job_id)
    if "error" in status:
        raise HTTPException(status_code=404, detail=status["error"])
    return status
