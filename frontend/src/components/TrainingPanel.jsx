import { useState, useRef } from "react";
import { api } from "../api/client";

export function TrainingPanel() {
  const [job, setJob] = useState(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef(null);

  async function handleStart() {
    setStarting(true);
    try {
      const { job_id } = await api.startTraining();
      setJob({ job_id, status: "RUNNING", progress_pct: 0, stage: "starting", log_tail: [] });
      pollRef.current = setInterval(async () => {
        const status = await api.getTrainingStatus(job_id);
        setJob(status);
        if (status.status === "COMPLETED" || status.status === "FAILED") {
          clearInterval(pollRef.current);
        }
      }, 2500);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div>
      <div className="panel-section">
        <h3>Model training</h3>
        <div className="caveat-note">
          This runs the real training pipeline (dataset build, GridSearchCV over environmental-only
          vs. physics-augmented features, calibration) as a background process — typically 3–5 minutes.
          It is not a simulated progress bar; every stage shown below is read from the pipeline's actual
          log output.
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" disabled={starting || job?.status === "RUNNING"} onClick={handleStart}>
            {starting ? "Starting…" : "Retrain model"}
          </button>
        </div>
      </div>

      {job && (
        <div className="panel-section">
          <h3>Job {job.job_id}</h3>
          <div className="metric-row">
            <span className="metric-label">Status</span>
            <span className="metric-value">{job.status}</span>
          </div>
          <div className="metric-row">
            <span className="metric-label">Stage</span>
            <span className="metric-value">{job.stage}</span>
          </div>
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${job.progress_pct}%` }} />
          </div>
          <div className="metric-row">
            <span className="metric-label">Elapsed</span>
            <span className="metric-value">{job.elapsed_seconds != null ? `${job.elapsed_seconds}s` : "—"}</span>
          </div>
          {job.log_tail && job.log_tail.length > 0 && (
            <div className="log-tail">{job.log_tail.join("\n")}</div>
          )}
          {job.status === "COMPLETED" && (
            <div className="caveat-note">
              Training complete. New model artifacts saved. Restart the backend to load the new model
              into the running prediction service (a hot-swap endpoint is future work, not built for this demo).
            </div>
          )}
        </div>
      )}
    </div>
  );
}
