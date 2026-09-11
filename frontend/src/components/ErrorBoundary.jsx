import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 24,
          margin: 20,
          background: "#fef2f2",
          border: "2px solid #ef4444",
          borderRadius: 8,
          color: "#991b1b"
        }}>
          <h3 style={{ margin: "0 0 8px 0" }}>⚠️ Component Encountered an Error</h3>
          <p style={{ fontSize: 13, color: "#475569", margin: "0 0 14px 0" }}>
            {this.state.error?.message || "An unexpected error occurred while rendering this section."}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: "8px 16px",
              background: "#dc2626",
              color: "#ffffff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            🔄 Reload Component
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
