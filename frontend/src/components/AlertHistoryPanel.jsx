import { useState, useEffect } from "react";

export function AlertHistoryPanel() {
  const [activeSubTab, setActiveSubTab] = useState("alerts"); // "alerts" or "incidents"
  const [historyData, setHistoryData] = useState({ alerts: [], incidents: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterType, setFilterType] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [deleting, setDeleting] = useState(false);

  function fetchHistory() {
    setLoading(true);
    fetch("/api/alerts/history")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setHistoryData({
          alerts: data.alerts || [],
          incidents: data.incidents || [],
        });
        setError(null);
      })
      .catch((err) => {
        console.error("Failed to load alert history:", err);
        setError("Failed to load history data from server.");
      })
      .finally(() => setLoading(false));
  }

  function handleDeleteHistory() {
    const isAlertsTab = activeSubTab === "alerts";
    const promptMsg = isAlertsTab
      ? "Are you sure you want to delete all dispatched citizen alert records? This cannot be undone."
      : "Are you sure you want to delete all alert and incident history records? This cannot be undone.";

    if (!window.confirm(promptMsg)) return;

    setDeleting(true);
    fetch(`/api/alerts/history?scope=${isAlertsTab ? "alerts" : "all"}`, {
      method: "DELETE",
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(() => {
        fetchHistory();
      })
      .catch((err) => {
        console.error("Failed to delete history:", err);
        alert("Failed to delete history. Please try again.");
      })
      .finally(() => setDeleting(false));
  }

  useEffect(() => {
    fetchHistory();
    // Auto refresh every 15 seconds
    const interval = setInterval(fetchHistory, 15000);
    return () => clearInterval(interval);
  }, []);

  const filteredAlerts = (historyData.alerts || []).filter((alt) => {
    const matchesFilter =
      filterType === "ALL" ||
      (filterType === "EMERGENCY" && (alt.type.includes("EMERGENCY") || alt.type.includes("BROADCAST") || alt.type.includes("SIMULATION"))) ||
      (filterType === "TEST" && alt.type.includes("TEST"));

    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      (alt.road_corridor && alt.road_corridor.toLowerCase().includes(q)) ||
      (alt.location_name && alt.location_name.toLowerCase().includes(q)) ||
      (alt.message && alt.message.toLowerCase().includes(q));

    return matchesFilter && matchesSearch;
  });

  const filteredIncidents = (historyData.incidents || []).filter((inc) => {
    const matchesFilter =
      filterType === "ALL" ||
      (filterType === "CRITICAL" && (inc.severity_band === "CATASTROPHIC_POTENTIAL" || inc.severity_band === "CRITICAL")) ||
      (filterType === "MAJOR" && inc.severity_band === "MAJOR") ||
      (filterType === "MODERATE" && inc.severity_band === "MODERATE");

    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      (inc.location_name && inc.location_name.toLowerCase().includes(q)) ||
      (inc.road_corridor && inc.road_corridor.toLowerCase().includes(q)) ||
      (inc.nearest_settlement && inc.nearest_settlement.toLowerCase().includes(q)) ||
      (inc.event_summary && inc.event_summary.toLowerCase().includes(q));

    return matchesFilter && matchesSearch;
  });

  return (
    <div className="alert-history-container">
      {/* Header with Title and KPI Stats */}
      <div className="history-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 20, color: "#0f172a" }}>📋 Alert & Landslide History Console</h2>
            <span className="history-mode-pill">Public / Monitoring View</span>
          </div>
          <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "#64748b" }}>
            Comprehensive audit log of citizen alert dispatches and previously predicted landslide danger occurrences across Sikkim.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn btn-sm btn-outline" onClick={fetchHistory} title="Refresh history records">
            🔄 Refresh
          </button>
          <button
            className="btn btn-sm"
            onClick={handleDeleteHistory}
            disabled={deleting || (activeSubTab === "alerts" ? historyData.alerts.length === 0 : (historyData.alerts.length === 0 && historyData.incidents.length === 0))}
            style={{
              background: "#fee2e2",
              color: "#b91c1c",
              border: "1px solid #fca5a5",
              fontWeight: 600,
              cursor: "pointer",
            }}
            title={activeSubTab === "alerts" ? "Delete all dispatched alert records" : "Delete all alert and incident history"}
          >
            {deleting ? "⏳ Deleting..." : "🗑️ Delete History"}
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="history-stats-grid">
        <div className="history-stat-card">
          <span className="stat-label">Total Dispatched Citizen Alerts</span>
          <span className="stat-value" style={{ color: "#0284c7" }}>
            {historyData.alerts.length}
          </span>
          <span className="stat-subtext">Automated & Manual SMS Broadcasts</span>
        </div>

        <div className="history-stat-card">
          <span className="stat-label">Historical Landslides & Danger Events</span>
          <span className="stat-value" style={{ color: "#dc2626" }}>
            {historyData.incidents.length}
          </span>
          <span className="stat-subtext">System-Predicted & Geological Records</span>
        </div>

        <div className="history-stat-card">
          <span className="stat-label">Protected Highway Corridors</span>
          <span className="stat-value" style={{ color: "#16a34a" }}>5</span>
          <span className="stat-subtext">NH-10, SH-1, SH-2, JN Road & Dikchu</span>
        </div>

        <div className="history-stat-card">
          <span className="stat-label">Telemetry Status</span>
          <span className="stat-value" style={{ color: "#0f172a", fontSize: 18 }}>🟢 Active</span>
          <span className="stat-subtext">Continuous Event Logging Online</span>
        </div>
      </div>

      {/* Main Sub-Tab Navigation */}
      <div className="history-tab-switcher">
        <button
          className={`history-tab-btn ${activeSubTab === "alerts" ? "active" : ""}`}
          onClick={() => {
            setActiveSubTab("alerts");
            setFilterType("ALL");
          }}
        >
          📱 Dispatched Citizen Alerts ({historyData.alerts.length})
        </button>
        <button
          className={`history-tab-btn ${activeSubTab === "incidents" ? "active" : ""}`}
          onClick={() => {
            setActiveSubTab("incidents");
            setFilterType("ALL");
          }}
        >
          🏔️ Past Dangers & Landslides Track ({historyData.incidents.length})
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="history-filter-bar">
        <div className="history-filter-chips">
          <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Filter:</span>
          {activeSubTab === "alerts" ? (
            <>
              <button
                className={`filter-chip ${filterType === "ALL" ? "active" : ""}`}
                onClick={() => setFilterType("ALL")}
              >
                All Alerts
              </button>
              <button
                className={`filter-chip ${filterType === "EMERGENCY" ? "active" : ""}`}
                onClick={() => setFilterType("EMERGENCY")}
              >
                🚨 Emergency Broadcasts
              </button>
              <button
                className={`filter-chip ${filterType === "TEST" ? "active" : ""}`}
                onClick={() => setFilterType("TEST")}
              >
                🧪 Diagnostic Tests
              </button>
            </>
          ) : (
            <>
              <button
                className={`filter-chip ${filterType === "ALL" ? "active" : ""}`}
                onClick={() => setFilterType("ALL")}
              >
                All Incidents
              </button>
              <button
                className={`filter-chip ${filterType === "CRITICAL" ? "active" : ""}`}
                onClick={() => setFilterType("CRITICAL")}
              >
                🚨 Critical Potential
              </button>
              <button
                className={`filter-chip ${filterType === "MAJOR" ? "active" : ""}`}
                onClick={() => setFilterType("MAJOR")}
              >
                ⚠️ Major Warnings
              </button>
              <button
                className={`filter-chip ${filterType === "MODERATE" ? "active" : ""}`}
                onClick={() => setFilterType("MODERATE")}
              >
                🟡 Moderate Advisories
              </button>
            </>
          )}
        </div>

        <div className="history-search-box">
          <input
            type="text"
            placeholder={activeSubTab === "alerts" ? "Search road corridor or message..." : "Search region, road, or event..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="history-search-input"
          />
          {searchQuery && (
            <button className="search-clear-btn" onClick={() => setSearchQuery("")}>
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Content Area */}
      {loading && historyData.alerts.length === 0 ? (
        <div className="history-loading-box">
          <div className="spinner" />
          <span>Loading historical telemetry logs...</span>
        </div>
      ) : error ? (
        <div className="history-error-box">{error}</div>
      ) : activeSubTab === "alerts" ? (
        /* Sub-Tab 1: Dispatched Alerts List */
        <div className="history-items-list">
          {filteredAlerts.length === 0 ? (
            <div className="history-empty-state">
              <span>📭 No dispatched alert records matching filter.</span>
            </div>
          ) : (
            filteredAlerts.map((alt) => (
              <div key={alt.alert_id} className="history-card alert-type-card">
                <div className="history-card-topbar">
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span className={`history-badge ${alt.type.includes("TEST") ? "test" : "emergency"}`}>
                      {alt.type.includes("TEST") ? "🧪 OPERATOR TEST" : "🚨 EMERGENCY ALERT"}
                    </span>
                    <strong style={{ fontSize: 14, color: "#0f172a" }}>{alt.road_corridor}</strong>
                    <span style={{ fontSize: 12, color: "#64748b" }}>· {alt.location_name}</span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="history-prob-pill">
                      {alt.probability_percent}% Probability
                    </span>
                    <span className="history-date-stamp">
                      📅 {alt.date_string || alt.timestamp?.slice(0, 10)}
                    </span>
                  </div>
                </div>

                {/* Message Body */}
                <div className="history-msg-quote">
                  <span className="quote-icon">📢</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "#1e293b" }}>
                      {alt.message}
                    </p>
                  </div>
                </div>

                {/* Footer with Recipients & Status */}
                <div className="history-card-footer">
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: "#475569" }}>
                      👥 Dispatched to {alt.recipients_count || alt.recipients?.length || 1} Citizen Observers:
                    </span>
                    {(alt.recipients || []).slice(0, 3).map((r, idx) => (
                      <span key={idx} className="recipient-micro-chip">
                        {r.name} ({r.town || "Sikkim"})
                      </span>
                    ))}
                    {(alt.recipients?.length || 0) > 3 && (
                      <span style={{ fontSize: 11, color: "#64748b" }}>
                        +{alt.recipients.length - 3} more
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="history-provider-tag">📡 {alt.provider || "Fast2SMS Relay"}</span>
                    <span className={`history-delivery-tag ${alt.status?.toLowerCase().includes("delivered") ? "delivered" : "pending"}`}>
                      ✓ {alt.status || "DELIVERED"}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Sub-Tab 2: Historical Landslides & Dangers */
        <div className="history-items-list">
          {filteredIncidents.length === 0 ? (
            <div className="history-empty-state">
              <span>🏔️ No historical landslide records matching filter.</span>
            </div>
          ) : (
            filteredIncidents.map((inc) => (
              <div key={inc.incident_id} className={`history-card incident-card ${inc.severity_band?.toLowerCase()}`}>
                <div className="history-card-topbar">
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span className={`severity-indicator-chip ${inc.severity_band?.toLowerCase()}`}>
                      {inc.severity_band === "CATASTROPHIC_POTENTIAL"
                        ? "🚨 CATASTROPHIC HAZARD"
                        : inc.severity_band === "MAJOR"
                        ? "⚠️ MAJOR LANDSLIDE"
                        : "🟡 MODERATE HAZARD"}
                    </span>
                    <strong style={{ fontSize: 14.5, color: "#0f172a" }}>{inc.location_name}</strong>
                    <span style={{ fontSize: 12, color: "#475569" }}>({inc.nearest_settlement})</span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="history-prob-pill red">
                      Risk: {inc.max_probability_percent}%
                    </span>
                    <span className="history-date-stamp">
                      📅 {inc.date || inc.timestamp?.slice(0, 10)}
                    </span>
                  </div>
                </div>

                {/* Corridor & Rainfall Context */}
                <div className="incident-telemetry-row">
                  <div className="telemetry-item">
                    <span className="telem-title">ROAD CORRIDOR:</span>
                    <span className="telem-data">🛣️ {inc.road_corridor}</span>
                  </div>

                  <div className="telemetry-item">
                    <span className="telem-title">PEAK 24H RAINFALL:</span>
                    <span className="telem-data">🌧️ {inc.peak_rainfall_24h_mm} mm</span>
                  </div>

                  <div className="telemetry-item">
                    <span className="telem-title">HIGHWAY BLOCKAGE:</span>
                    <span className="telem-data" style={{ color: inc.road_blocked ? "#dc2626" : "#16a34a", fontWeight: 700 }}>
                      {inc.road_blocked ? `⛔ ${inc.road_blockage_duration || "Blocked"}` : "🟢 Clear / Open"}
                    </span>
                  </div>
                </div>

                {/* Incident Summary */}
                <div className="incident-summary-box">
                  <p style={{ margin: 0, fontSize: 12.5, color: "#1e293b", lineHeight: 1.5 }}>
                    <strong>Geotechnical Failure Event:</strong> {inc.event_summary}
                  </p>
                  <p style={{ margin: "6px 0 0 0", fontSize: 12, color: "#0369a1", lineHeight: 1.45 }}>
                    <strong>Early Warning System Action:</strong> {inc.early_warning_outcome}
                  </p>
                </div>

                {/* Incident ID & Tracking Footer */}
                <div className="history-card-footer">
                  <span style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>
                    Incident Reference ID: {inc.incident_id}
                  </span>
                  <span className="incident-status-pill">
                    {inc.status?.replace(/_/g, " ") || "HISTORICAL RECORDED"}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
