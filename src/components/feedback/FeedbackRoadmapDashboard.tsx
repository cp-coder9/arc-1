import * as React from "react"
import { BarChart3, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react"
import type { UserProfile } from "@/types"

/**
 * FeedbackRoadmapDashboard — Workspace page for platform_admin users.
 *
 * Displays the Feedback Intelligence dashboard following the Architex workspace pattern:
 * Hero → Stat Row → Tab Navigation → Active Tab Content.
 *
 * Access restricted to platform_admin role only.
 *
 * Requirements: 4.1, 4.2, 4.8
 */

export interface FeedbackRoadmapDashboardProps {
  user: UserProfile;
}

type DashboardTab = "overview" | "clusters" | "trend-chart" | "friction-signals"

export default function FeedbackRoadmapDashboard({ user }: FeedbackRoadmapDashboardProps) {
  const [activeTab, setActiveTab] = React.useState<DashboardTab>("overview")

  // Role guard: platform_admin only
  if (user.role !== "platform_admin") {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="panel text-center" style={{ padding: 32, maxWidth: 420 }}>
          <AlertTriangle className="mx-auto mb-3" size={32} style={{ color: "var(--amber)" }} />
          <h2 className="text-base font-semibold mb-2" style={{ color: "var(--ink)" }}>
            Access Denied
          </h2>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            The Feedback Roadmap Dashboard is restricted to platform administrators.
            Contact your admin if you believe this is an error.
          </p>
        </div>
      </div>
    )
  }

  const tabs: { id: DashboardTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "clusters", label: "Clusters" },
    { id: "trend-chart", label: "Trend Chart" },
    { id: "friction-signals", label: "Friction Signals" },
  ]

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Hero */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">FEEDBACK INTELLIGENCE</div>
            <h1>Feedback Roadmap Dashboard</h1>
            <p className="sub">
              AI-powered feedback pipeline · Platform-wide insights
            </p>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span className="pill pill-danger">
              <span className="dot"></span> High Severity
            </span>
            <span className="pill pill-warning">
              <span className="dot"></span> Pending Review
            </span>
            <span className="pill pill-success">
              <span className="dot"></span> Shipped
            </span>
          </div>
        </div>
      </div>

      {/* Stat Row */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <BarChart3 size={18} style={{ color: "var(--teal)" }} />
            <span style={{ color: "var(--teal)" }}>—</span>
          </div>
          <div className="stat-label">Total Clusters</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <AlertTriangle size={18} style={{ color: "var(--red)" }} />
            <span style={{ color: "var(--red)" }}>—</span>
          </div>
          <div className="stat-label">High Severity</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <TrendingUp size={18} style={{ color: "var(--amber)" }} />
            <span style={{ color: "var(--amber)" }}>—</span>
          </div>
          <div className="stat-label">Pending Review</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <CheckCircle2 size={18} style={{ color: "var(--green)" }} />
            <span style={{ color: "var(--green)" }}>—</span>
          </div>
          <div className="stat-label">Loop Closure Rate</div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab${activeTab === tab.id ? " active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active Tab Content */}
      <div className="panel">
        {activeTab === "overview" && (
          <div>
            <h2>Overview</h2>
            <p style={{ color: "var(--muted)", fontSize: 13 }}>
              Summary of feedback clusters, recent activity, and key metrics will appear here.
            </p>
          </div>
        )}
        {activeTab === "clusters" && (
          <div>
            <h2>Feedback Clusters</h2>
            <p style={{ color: "var(--muted)", fontSize: 13 }}>
              Cluster list sorted by severity with filtering and pagination will appear here.
            </p>
          </div>
        )}
        {activeTab === "trend-chart" && (
          <div>
            <h2>Feedback Volume — Trend Chart</h2>
            <p style={{ color: "var(--muted)", fontSize: 13 }}>
              Feedback volume by category over the previous 30 days, grouped by day, will appear here.
            </p>
          </div>
        )}
        {activeTab === "friction-signals" && (
          <div>
            <h2>Friction Signals</h2>
            <p style={{ color: "var(--muted)", fontSize: 13 }}>
              Implicit friction detections from user sessions will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
