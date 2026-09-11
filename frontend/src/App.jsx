import { useState, useEffect } from "react";
import { SiteStateProvider } from "./state/SiteStateContext";
import { SiteList } from "./components/SiteList";
import { MainView } from "./components/MainView";
import { SitePanel } from "./components/SitePanel";
import { AlertsPanel } from "./components/AlertsPanel";
import { AlertHistoryPanel } from "./components/AlertHistoryPanel";
import { TrainingPanel } from "./components/TrainingPanel";
import { SettingsModal } from "./components/SettingsModal";
import { AlertToast } from "./components/AlertToast";
import { SimulationWorkspace } from "./components/SimulationWorkspace";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";

// Version 1: Operations Mode Tabs (Alerts + Settings, Citizen Reports Removed)
const TABS_V1 = [
  { id: "dashboard", label: "Dashboard" },
  { id: "simulation", label: "Simulation Data" },
  { id: "alerts", label: "Alerts" },
  { id: "training", label: "Training" },
];

// Version 2: Public Monitoring Mode Tabs (Alert History, No Alerts, No Settings, Citizen Reports Removed)
const TABS_V2 = [
  { id: "dashboard", label: "Dashboard" },
  { id: "simulation", label: "Simulation Data" },
  { id: "history", label: "Alert History" },
  { id: "training", label: "Training" },
];

function App() {
  // Determine initial version: URL parameter "?version=2" or default to "version1"
  const getInitialVersion = () => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const v = params.get("version") || params.get("mode");
      if (v === "2" || v === "history" || v === "viewer") {
        return "version2";
      }
    }
    return "version1"; // Default on server boot: Version 1 (Operations Console with Alerts + Settings)
  };

  const [appVersion, setAppVersion] = useState(getInitialVersion);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Sync with backend profile on mount
  useEffect(() => {
    fetch("/api/app-profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.active_profile) {
          const urlParams = new URLSearchParams(window.location.search);
          // Only override if no explicit URL param was provided
          if (!urlParams.get("version") && !urlParams.get("mode")) {
            setAppVersion(data.active_profile === "history" ? "version2" : "version1");
          }
        }
      })
      .catch(() => {});
  }, []);

  function handleVersionSwitch(targetVersion) {
    setAppVersion(targetVersion);
    const profileName = targetVersion === "version2" ? "history" : "operations";

    // Switch active tab if current tab is not available in target version
    if (targetVersion === "version2" && activeTab === "alerts") {
      setActiveTab("history");
    } else if (targetVersion === "version1" && activeTab === "history") {
      setActiveTab("alerts");
    }

    // Persist to backend
    fetch("/api/app-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: profileName }),
    }).catch((err) => console.warn("Could not persist profile change:", err));
  }

  const activeTabs = appVersion === "version1" ? TABS_V1 : TABS_V2;

  return (
    <SiteStateProvider>
      <AlertToast />
      <div className="app-shell">
        <div className="topbar">
          <div className="topbar-brand">
            <h1>Bhu-Rakshak</h1>
            <span className="tagline">Landslide early-warning console</span>

            {/* Version Indicator & Mode Switcher */}
            <div className="version-switch-badge-group">
              <span className={`version-indicator-pill ${appVersion}`}>
                {appVersion === "version1" ? "🛡️ Version 1: Operations" : "📋 Version 2: Alert History"}
              </span>
              <button
                type="button"
                className="version-toggle-btn"
                onClick={() => handleVersionSwitch(appVersion === "version1" ? "version2" : "version1")}
                title={
                  appVersion === "version1"
                    ? "Switch to Version 2: Alert History & Danger Tracking (removes Alerts tab & Settings)"
                    : "Switch to Version 1: Operations Console (restores Alerts tab & Settings)"
                }
              >
                {appVersion === "version1" ? "⇄ Switch to Version 2 (History)" : "⇄ Switch to Version 1 (Operations)"}
              </button>
            </div>
          </div>

          <div className="topbar-tabs">
            {activeTabs.map((t) => (
              <button
                key={t.id}
                className={`topbar-tab ${activeTab === t.id ? "active" : ""}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}

            {/* In Version 1: Settings Button is Present */}
            {appVersion === "version1" && (
              <button
                className="topbar-tab"
                onClick={() => setIsSettingsOpen(true)}
                style={{ background: "rgba(255, 255, 255, 0.15)", marginLeft: 8 }}
                title="Configure SMS Providers, API Keys & Alert Thresholds"
              >
                ⚙️ Settings
              </button>
            )}
          </div>
        </div>

        {/* In Version 1: Settings Modal is Present */}
        {appVersion === "version1" && (
          <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        )}

        {/* 1. Main Dashboard: Clean original 3-column layout */}
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

        {/* 3. Auxiliary tabs */}
        {activeTab !== "dashboard" && activeTab !== "simulation" && (
          <>
            <div className="sidebar">
              <SiteList />
            </div>
            <div className="right-panel" style={{ gridColumn: "2 / span 2" }}>
              {/* In Version 1: Alerts Panel */}
              {appVersion === "version1" && activeTab === "alerts" && <AlertsPanel />}

              {/* In Version 2: Alert History Panel (Messages Sent + Past Dangers/Landslides) */}
              {appVersion === "version2" && activeTab === "history" && <AlertHistoryPanel />}

              {/* Training Panel (Both Versions) */}
              {activeTab === "training" && <TrainingPanel />}
            </div>
          </>
        )}
      </div>
    </SiteStateProvider>
  );
}

export default App;
