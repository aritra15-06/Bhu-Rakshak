import { useState, useEffect } from "react";
import { useSiteState } from "../state/SiteStateContext";

const REPORT_TYPES = ["crack", "seepage", "rockfall", "landslide", "road_blockage"];

// Simple client-side store for the demo (mirrors the "human verification
// list" from the Work Distribution doc — a real deployment would persist
// this server-side; kept in-browser here since it's explicitly a
// form + human-confirmation feature, not a CV/automated one).
const STORAGE_KEY = "bhurakshak_citizen_reports";

function loadReports() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveReports(reports) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
}

export function CitizenReportForm() {
  const { sites } = useSiteState();
  const [reports, setReports] = useState([]);
  const [form, setForm] = useState({ type: "crack", location_id: "", notes: "" });
  const [gpsStatus, setGpsStatus] = useState("");

  useEffect(() => { setReports(loadReports()); }, []);

  function handleGetLocation() {
    if (!navigator.geolocation) {
      setGpsStatus("Geolocation not available in this browser.");
      return;
    }
    setGpsStatus("Requesting location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => setGpsStatus(`Captured: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`),
      () => setGpsStatus("Location permission denied — report will be saved without GPS coordinates."),
    );
  }

  function handleSubmit(e) {
    e.preventDefault();
    const newReport = {
      id: `report_${Date.now()}`,
      type: form.type,
      location_id: form.location_id,
      notes: form.notes,
      submitted_at: new Date().toISOString(),
      verified: false,
    };
    const updated = [newReport, ...reports];
    setReports(updated);
    saveReports(updated);
    setForm({ type: "crack", location_id: "", notes: "" });
    setGpsStatus("");
  }

  function toggleVerified(id) {
    const updated = reports.map((r) => (r.id === id ? { ...r, verified: !r.verified } : r));
    setReports(updated);
    saveReports(updated);
  }

  return (
    <div>
      <div className="panel-section">
        <h3>Submit a field report</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label>Report type</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {REPORT_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label>Nearest monitored site</label>
            <select required value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })}>
              <option value="">Select a site…</option>
              {Object.keys(sites).map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label>Notes</label>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="What did you observe?" />
          </div>
          <div className="btn-row">
            <button type="button" className="btn" onClick={handleGetLocation}>Capture GPS</button>
          </div>
          {gpsStatus && <div className="caveat-note">{gpsStatus}</div>}
          <div className="btn-row">
            <button className="btn btn-primary" type="submit">Submit report</button>
          </div>
        </form>
      </div>

      <div className="panel-section">
        <h3>Reports awaiting verification ({reports.filter((r) => !r.verified).length})</h3>
        {reports.length === 0 && <div className="metric-row"><span className="metric-label">No reports yet</span></div>}
        {reports.map((r) => (
          <div className="citizen-report-item" key={r.id}>
            <div className="type">{r.type.replace("_", " ")} — {r.location_id}</div>
            <div className="meta">{new Date(r.submitted_at).toLocaleString()}</div>
            {r.notes && <div style={{ marginTop: 4 }}>{r.notes}</div>}
            <div className="btn-row">
              <button className="btn" onClick={() => toggleVerified(r.id)}>
                {r.verified ? "Marked verified ✓ (click to undo)" : "Mark verified"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
