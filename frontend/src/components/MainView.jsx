import { useState } from "react";
import { MapView } from "./MapView";
import { Terrain3DView } from "./Terrain3DView";

export function MainView() {
  const [mode, setMode] = useState("map");

  return (
    <div className="main-view">
      <div className="map-toggle">
        <button className={mode === "map" ? "active" : ""} onClick={() => setMode("map")}>2D Map</button>
        <button className={mode === "3d" ? "active" : ""} onClick={() => setMode("3d")}>3D Terrain</button>
      </div>
      {mode === "map" ? <MapView /> : <Terrain3DView />}
    </div>
  );
}
