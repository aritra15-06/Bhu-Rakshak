import { useSiteState } from "../state/SiteStateContext";

export function SiteList() {
  const { sites, selectedSite, setSelectedSite, loading } = useSiteState();

  if (loading) {
    return <div className="empty-state">Loading monitored sites…</div>;
  }

  const entries = Object.entries(sites);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Monitored Stations ({entries.length})</h2>
      </div>

      {entries.map(([locationId, data]) => {
        const stability = data?.prediction?.physics_output?.stability_state || "UNKNOWN";
        const sevBand = data?.severity?.severity_band || "MINOR";
        const name = data?.current_params?.name || locationId;
        const fos = data?.prediction?.physics_output?.factor_of_safety;
        const spatial = data?.spatial_context || {};
        const road = spatial.nearest_road?.name || spatial.primary_road_corridor || "Corridor";
        const nearestTown = spatial.nearest_town;
        const isSelected = selectedSite === locationId;

        let dotClass = "STABLE";
        if (sevBand === "CATASTROPHIC_POTENTIAL" || stability === "UNSTABLE" || (fos != null && fos < 1.0)) {
          dotClass = "UNSTABLE";
        } else if (sevBand === "MODERATE" || stability === "MARGINAL" || (fos != null && fos < 1.3)) {
          dotClass = "MARGINAL";
        }

        return (
          <div
            key={locationId}
            className={`site-card ${isSelected ? "selected" : ""}`}
            onClick={() => setSelectedSite(locationId)}
          >
            <span className={`site-dot ${dotClass}`} />
            <div className="site-card-text" style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="site-card-name">{name}</span>
                <span className={`site-list-sev-badge ${sevBand.toLowerCase()}`}>
                  {sevBand === "CATASTROPHIC_POTENTIAL" ? "CRIT" : sevBand}
                </span>
              </div>
              <span className="site-card-sub">
                {locationId} · {road}{nearestTown ? ` (${nearestTown.name})` : ""} · FoS: <strong>{fos != null ? fos.toFixed(2) : "—"}</strong>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
