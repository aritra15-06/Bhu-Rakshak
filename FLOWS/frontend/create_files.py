import os

base_dir = r"c:\Users\aritr\Downloads\Bhu-Rakshak_Complete_System\FLOWS\frontend\src"

files = {
    "components/MapView.jsx": """import React from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useAppContext } from '../state/AppContext';
import { pilotLocations } from '../data/pilotLocations';

const MapView = () => {
  const { selectedLocation, setSelectedLocation } = useAppContext();
  
  return (
    <div className="map-container">
      <MapContainer center={[27.5, 88.6]} zoom={10} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap contributors'
        />
        {pilotLocations.map(loc => (
          <CircleMarker
            key={loc.id}
            center={[loc.lat, loc.lng]}
            radius={8}
            pathOptions={{ 
              color: loc.id === selectedLocation?.id ? '#fff' : '#000',
              fillColor: '#16a34a',
              fillOpacity: 0.8
            }}
            eventHandlers={{ click: () => setSelectedLocation(loc) }}
          >
            <Popup>{loc.name}</Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
};
export default MapView;
""",
    "components/SiteList.jsx": """import React from 'react';
import { useAppContext } from '../state/AppContext';
import { pilotLocations } from '../data/pilotLocations';

const SiteList = () => {
  const { selectedLocation, setSelectedLocation } = useAppContext();
  
  return (
    <div className="sidebar site-list">
      <h2>Pilot Sites</h2>
      <div className="list-container">
        {pilotLocations.map(loc => (
          <div 
            key={loc.id} 
            className={`site-card ${selectedLocation?.id === loc.id ? 'active' : ''}`}
            onClick={() => setSelectedLocation(loc)}
          >
            <h3>{loc.name}</h3>
            <div className="mini-status safe">SAFE</div>
          </div>
        ))}
      </div>
    </div>
  );
};
export default SiteList;
""",
    "components/SitePanel.jsx": """import React from 'react';
import { useAppContext } from '../state/AppContext';
import RiskGauge from './RiskGauge';
import EvidenceCard from './EvidenceCard';
import ActionCard from './ActionCard';

const SitePanel = () => {
  const { selectedLocation } = useAppContext();
  
  if (!selectedLocation) return <div className="right-panel empty">Select a site</div>;
  
  return (
    <div className="right-panel">
      <h2>{selectedLocation.name}</h2>
      <div className="coords">{selectedLocation.lat.toFixed(4)}, {selectedLocation.lng.toFixed(4)}</div>
      <RiskGauge />
      <EvidenceCard />
      <ActionCard />
    </div>
  );
};
export default SitePanel;
""",
    "components/RiskGauge.jsx": """import React from 'react';
const RiskGauge = () => (
  <div className="card risk-gauge">
    <h3>Compound Risk</h3>
    <div className="gauge-placeholder">
       <div className="gauge-value">12%</div>
    </div>
  </div>
);
export default RiskGauge;
""",
    "components/EvidenceCard.jsx": """import React from 'react';
const EvidenceCard = () => (
  <div className="card evidence-card">
    <h3>Evidence & Factors</h3>
    <ul>
      <li>Rainfall: High</li>
      <li>Soil Saturation: Medium</li>
    </ul>
  </div>
);
export default EvidenceCard;
""",
    "components/CompoundPathway.jsx": """import React from 'react';
const CompoundPathway = () => (
  <div className="card pathway-card">
    <h3>Pathway</h3>
    <div>RAINFALL → SATURATION → SLOPE_FAILURE</div>
  </div>
);
export default CompoundPathway;
""",
    "components/FloodPanel.jsx": """import React from 'react';
const FloodPanel = () => <div className="card">Flood Analysis</div>;
export default FloodPanel;
""",
    "components/FloodAnimation.jsx": """import React from 'react';
const FloodAnimation = () => <div className="card">Flood Animation</div>;
export default FloodAnimation;
""",
    "components/AlertPanel.jsx": """import React from 'react';
const AlertPanel = () => <div className="full-panel">Alerts Console</div>;
export default AlertPanel;
""",
    "components/SimulationWorkspace.jsx": """import React from 'react';
const SimulationWorkspace = () => <div className="full-panel">Simulation Scrubber</div>;
export default SimulationWorkspace;
""",
    "components/SourceHealthGrid.jsx": """import React from 'react';
const SourceHealthGrid = () => <div className="full-panel">Data Sources Grid</div>;
export default SourceHealthGrid;
""",
    "components/ActionCard.jsx": """import React from 'react';
const ActionCard = () => (
  <div className="card action-card">
    <h3>Action</h3>
    <p>Monitor Situation</p>
  </div>
);
export default ActionCard;
""",
    "components/ScorecardPanel.jsx": """import React from 'react';
const ScorecardPanel = () => <div className="full-panel">Scorecard Metrics</div>;
export default ScorecardPanel;
""",
    "components/TrainingPanel.jsx": """import React from 'react';
const TrainingPanel = () => <div className="full-panel">Model Training Console</div>;
export default TrainingPanel;
""",
    "components/Terrain3DView.jsx": """import React from 'react';
const Terrain3DView = () => <div className="card">3D Terrain</div>;
export default Terrain3DView;
""",
    "data/pilotLocations.js": """export const pilotLocations = [
  { id: 'S1', name: 'Chungthang Dam', lat: 27.60, lng: 88.64 },
  { id: 'S2', name: 'Mangan Town', lat: 27.50, lng: 88.53 },
  { id: 'S3', name: 'Dikchu', lat: 27.40, lng: 88.52 },
  { id: 'S4', name: 'Singtam', lat: 27.23, lng: 88.50 },
  { id: 'S5', name: 'Rangpo', lat: 27.18, lng: 88.53 },
  { id: 'S6', name: 'Lachen', lat: 27.72, lng: 88.55 },
  { id: 'S7', name: 'Lachung', lat: 27.69, lng: 88.74 },
  { id: 'S8', name: 'Teesta Urja', lat: 27.58, lng: 88.60 }
];
""",
    "data/monsoonTimeline.js": """export const MONSOON_MONTHS = ['June', 'July', 'August', 'September', 'October'];
export const getDailyState = (day) => ({ day, hazard: 'SAFE' });
"""
}

for rel_path, content in files.items():
    full_path = os.path.join(base_dir, rel_path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)

print("Created all components and data files.")
