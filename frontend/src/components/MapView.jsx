import { useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import { useSiteState } from "../state/SiteStateContext";
import "leaflet/dist/leaflet.css";

const SEVERITY_COLORS = {
  CATASTROPHIC_POTENTIAL: "#b91c1c", // Crimson
  MAJOR: "#ea580c",                  // Orange-red
  MODERATE: "#d97706",               // Amber
  MINOR: "#16a34a",                  // Green
};

const STABILITY_FALLBACK = {
  UNSTABLE: "#dc2626",
  MARGINAL: "#d97706",
  STABLE: "#16a34a",
  UNKNOWN: "#64748b",
};

function getSiteColor(data) {
  if (!data) return STABILITY_FALLBACK.UNKNOWN;
  const band = data?.severity?.severity_band;
  if (band && SEVERITY_COLORS[band]) return SEVERITY_COLORS[band];
  const stability = data?.prediction?.physics_output?.stability_state;
  return STABILITY_FALLBACK[stability] || STABILITY_FALLBACK.UNKNOWN;
}

export function MapView() {
  const { sites, selectedSite, setSelectedSite, loading } = useSiteState();
  const [mapLayer, setMapLayer] = useState("streets");

  if (loading) return <div className="empty-state">Loading map…</div>;

  const entries = Object.entries(sites);
  const center = entries.length && entries[0][1]?.current_params
    ? [entries[0][1].current_params.latitude, entries[0][1].current_params.longitude]
    : [27.52, 88.60];

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Floating Map Layer Switcher: Street vs Satellite */}
      <div className="map-layer-switcher">
        <button
          className={`map-layer-btn ${mapLayer === "streets" ? "active" : ""}`}
          onClick={() => setMapLayer("streets")}
        >
          🗺️ Streets
        </button>
        <button
          className={`map-layer-btn ${mapLayer === "satellite" ? "active" : ""}`}
          onClick={() => setMapLayer("satellite")}
        >
          🛰️ Satellite
        </button>
      </div>

      {/* Floating Map Severity Legend */}
      <div className="map-floating-legend">
        <div className="legend-title">Hazard Severity</div>
        <div className="legend-item"><span className="legend-dot critical" /> Critical Danger (FoS &lt; 0.9)</div>
        <div className="legend-item"><span className="legend-dot major" /> Major Danger (FoS &lt; 1.0)</div>
        <div className="legend-item"><span className="legend-dot moderate" /> Moderate Warning (FoS &lt; 1.3)</div>
        <div className="legend-item"><span className="legend-dot stable" /> Stable (FoS &ge; 1.5)</div>
      </div>

      <MapContainer center={center} zoom={9} style={{ height: "100%", width: "100%" }}>
        {mapLayer === "streets" ? (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        ) : (
          <TileLayer
            attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
        )}

        {/* Monitored Station Markers */}
        {entries.map(([locationId, data]) => {
          const params = data?.current_params;
          if (!params?.latitude || !params?.longitude) return null;

          const color = getSiteColor(data);
          const stability = data?.prediction?.physics_output?.stability_state || "UNKNOWN";
          const sevBand = data?.severity?.severity_band || "MINOR";
          const fos = data?.prediction?.physics_output?.factor_of_safety;
          const isUnstable = stability === "UNSTABLE" || (fos != null && fos < 1.0);
          const isMarginal = stability === "MARGINAL" || (fos != null && fos < 1.3);
          const isSelected = selectedSite === locationId;

          return (
            <div key={locationId}>
              {/* Outer Hazard Buffer Ring */}
              {(isUnstable || isMarginal || isSelected) && (
                <CircleMarker
                  center={[params.latitude, params.longitude]}
                  radius={isSelected ? 34 : 26}
                  pathOptions={{
                    color: color,
                    fillColor: color,
                    fillOpacity: isUnstable ? 0.22 : 0.12,
                    weight: isUnstable ? 2.5 : 1.5,
                    dashArray: isUnstable ? "6 4" : undefined,
                  }}
                />
              )}

              {/* Core Station Marker */}
              <CircleMarker
                center={[params.latitude, params.longitude]}
                radius={isSelected ? 14 : 10}
                pathOptions={{
                  color: "#FFFFFF",
                  fillColor: color,
                  fillOpacity: 0.95,
                  weight: 3,
                }}
                eventHandlers={{ click: () => setSelectedSite(locationId) }}
              >
                <Popup>
                  <div style={{ fontSize: 13, lineHeight: 1.4 }}>
                    <strong>🏔️ {params.name}</strong><br />
                    <span style={{ color: "#64748b" }}>{locationId} · Elevation {params.elevation_m}m</span><br />
                    <div style={{ marginTop: 6 }}>
                      <span>Stability: <strong>{stability}</strong></span><br />
                      <span>Factor of Safety: <strong>{fos != null ? fos.toFixed(2) : "—"}</strong></span><br />
                      <span>Severity: <strong style={{ color }}>{sevBand}</strong></span>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            </div>
          );
        })}
      </MapContainer>
    </div>
  );
}
