import { useState } from "react";
import { SiteStateProvider } from "./state/SiteStateContext";
import { SiteList } from "./components/SiteList";
import { MainView } from "./components/MainView";
import { SitePanel } from "./components/SitePanel";
import { AlertHistoryPanel } from "./components/AlertHistoryPanel";
import { TrainingPanel } from "./components/TrainingPanel";
import { AlertToast } from "./components/AlertToast";
import { SimulationWorkspace } from "./components/SimulationWorkspace";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "simulation", label: "Simulation Data" },
  { id: "history", label: "Alert History" },
  { id: "training", label: "Training" },
];

function App() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <SiteStateProvider>
      <AlertToast />
      <div className="app-shell">
        <div className="topbar">
          <div className="topbar-brand">
            <h1>Bhu-Rakshak</h1>
            <span className="tagline">Landslide Early-Warning &amp; Geotechnical Intelligence System</span>
          </div>

          <div className="topbar-tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`topbar-tab ${activeTab === t.id ? "active" : ""}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 1. Main Dashboard: Clean 3-column layout */}
        {activeTab === "dashboard" && (
          <>
            <div className="sidebar">
              <SiteList />
            </div>
            <MainView />
            <div className="right-panel">
              <SitePanel />
            </div>
          </>
        )}

        {/* 2. Simulation Data: Dedicated full workspace with map + pilot regions */}
        {activeTab === "simulation" && (
          <div className="simulation-full-workspace">
            <ErrorBoundary>
              <SimulationWorkspace />
            </ErrorBoundary>
          </div>
        )}

        {/* 3. Auxiliary tabs: Alert History & Training */}
        {activeTab !== "dashboard" && activeTab !== "simulation" && (
          <>
            <div className="sidebar">
              <SiteList />
            </div>
            <div className="right-panel" style={{ gridColumn: "2 / span 2" }}>
              {activeTab === "history" && <AlertHistoryPanel />}
              {activeTab === "training" && <TrainingPanel />}
            </div>
          </>
        )}
      </div>
    </SiteStateProvider>
  );
}

export default App;
