import { useState } from "react";
import { SiteStateProvider } from "./state/SiteStateContext";
import { SiteList } from "./components/SiteList";
import { MainView } from "./components/MainView";
import { SitePanel } from "./components/SitePanel";
import { AlertsPanel } from "./components/AlertsPanel";
import { TrainingPanel } from "./components/TrainingPanel";
import { CitizenReportForm } from "./components/CitizenReportForm";
import { SettingsModal } from "./components/SettingsModal";
import { AlertToast } from "./components/AlertToast";
import { SimulationWorkspace } from "./components/SimulationWorkspace";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "simulation", label: "Simulation Data" },
  { id: "alerts", label: "Alerts" },
  { id: "training", label: "Training" },
  { id: "reports", label: "Citizen reports" },
];

function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <SiteStateProvider>
      <AlertToast />
      <div className="app-shell">
        <div className="topbar">
          <div className="topbar-brand">
            <h1>Bhu-Rakshak</h1>
            <span className="tagline">Landslide early-warning console</span>
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
            <button
              className="topbar-tab"
              onClick={() => setIsSettingsOpen(true)}
              style={{ background: "rgba(255, 255, 255, 0.15)", marginLeft: 8 }}
            >
              ⚙️ Settings
            </button>
          </div>
        </div>

        <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

        {/* 1. Main Dashboard: Clean original 3-column layout */}
        {activeTab === "dashboard" && (
          <>
            <div className="sidebar">
              <SiteList />
            </div>
            <MainView />
            <div className="right-panel"><SitePanel /></div>
          </>
        )}

        {/* 2. Simulation Data: Dedicated full workspace with map + 3 regions */}
        {activeTab === "simulation" && (
          <div className="simulation-full-workspace">
            <ErrorBoundary>
              <SimulationWorkspace />
            </ErrorBoundary>
          </div>
        )}

        {/* 3. Auxiliary tabs */}
        {activeTab !== "dashboard" && activeTab !== "simulation" && (
          <>
            <div className="sidebar">
              <SiteList />
            </div>
            <div className="right-panel" style={{ gridColumn: "2 / span 2" }}>
              {activeTab === "alerts" && <AlertsPanel />}
              {activeTab === "training" && <TrainingPanel />}
              {activeTab === "reports" && <CitizenReportForm />}
            </div>
          </>
        )}
      </div>
    </SiteStateProvider>
  );
}

export default App;
