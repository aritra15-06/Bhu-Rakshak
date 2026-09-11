import { useEffect } from "react";
import { useSiteState } from "../state/SiteStateContext";

export function AlertToast() {
  const { toastAlert, setToastAlert } = useSiteState();

  useEffect(() => {
    if (!toastAlert) return;
    const timer = setTimeout(() => {
      setToastAlert(null);
    }, 12000);
    return () => clearTimeout(timer);
  }, [toastAlert, setToastAlert]);

  if (!toastAlert) return null;

  const isDanger = toastAlert.type === "danger";
  const isWarning = toastAlert.type === "warning";
  const isSuccess = toastAlert.type === "success";

  return (
    <div className={`alert-toast-container ${toastAlert.type || "danger"}`}>
      <div className="toast-header">
        <div className="toast-title-group">
          <span className="toast-icon">
            {isDanger ? "🚨" : isWarning ? "⚠️" : "✅"}
          </span>
          <span className="toast-title">{toastAlert.title}</span>
        </div>
        <button
          className="toast-close-btn"
          onClick={() => setToastAlert(null)}
          title="Dismiss notification"
        >
          ✕
        </button>
      </div>

      <div className="toast-body">
        <p className="toast-message">{toastAlert.message}</p>

        {toastAlert.evac_towns && toastAlert.evac_towns.length > 0 && (
          <div className="toast-section">
            <span className="toast-pill-label">Urgent Evacuation:</span>
            <div className="toast-pill-wrap">
              {toastAlert.evac_towns.map((t, idx) => (
                <span key={idx} className="toast-pill danger">
                  🚨 {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {toastAlert.blocked_roads && toastAlert.blocked_roads.length > 0 && (
          <div className="toast-section">
            <span className="toast-pill-label">Blocked Highways:</span>
            <div className="toast-pill-wrap">
              {toastAlert.blocked_roads.map((r, idx) => (
                <span key={idx} className="toast-pill blocked">
                  ⛔ {r}
                </span>
              ))}
            </div>
          </div>
        )}

        {toastAlert.detour_towns && toastAlert.detour_towns.length > 0 && (
          <div className="toast-section">
            <span className="toast-pill-label">Transit Detours:</span>
            <div className="toast-pill-wrap">
              {toastAlert.detour_towns.map((d, idx) => (
                <span key={idx} className="toast-pill warning">
                  ↗️ {d}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="toast-footer">
        <span>Bhu-Rakshak Dynamic Dispatch Core</span>
        <button className="toast-dismiss-link" onClick={() => setToastAlert(null)}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
