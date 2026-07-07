/**
 * TownPlanningTracker — Feature root component for the Town Planning
 * Application Tracker module.
 *
 * Implements dual operating mode:
 * - Project-scoped: within a full Architex project context
 * - Standalone: independent practice-level usage
 *
 * Follows the Workspace Template pattern: Hero → Project Toggles → Tabs → Content.
 * Uses Architex UI token system (var(--teal), var(--ink), etc.) and
 * component classes (.panel, .pill, .btn, .table, .hero).
 */

import React, { useState, useMemo } from 'react';
import type { UserProfile } from '@/types';
import { PLANNING_STAGES, APPLICATION_TYPES, SPLUMA_DEFAULT_TIMEFRAMES } from './constants';
import type { PlanningApplication, PlanningStage, ApplicationStatus } from './types';

interface Props {
  user: UserProfile;
  projectId?: string;
}

type ViewMode = 'project' | 'standalone';
type ActiveTab = 'dashboard' | 'applications' | 'deadlines' | 'participation' | 'conditions' | 'hearings' | 'municipalities' | 'reports';

export default function TownPlanningTracker({ user, projectId }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>(projectId ? 'project' : 'standalone');
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);

  // Mock data for initial render (will be replaced with API calls via hooks)
  const mockApplications: PlanningApplication[] = useMemo(() => [], []);

  const tabs: { id: ActiveTab; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'applications', label: 'Applications' },
    { id: 'deadlines', label: 'Deadlines' },
    { id: 'participation', label: 'Participation' },
    { id: 'conditions', label: 'Conditions' },
    { id: 'hearings', label: 'Hearings' },
    { id: 'municipalities', label: 'Municipalities' },
    { id: 'reports', label: 'Reports' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} data-testid="town-planning-tracker">
      {/* Hero Header */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">TOWN PLANNING APPLICATION TRACKER</div>
            <h1>{viewMode === 'project' ? 'Project Planning Portfolio' : 'My Planning Practice'}</h1>
            <p className="sub">
              {viewMode === 'project'
                ? 'Planning applications for this project · SPLUMA lifecycle management'
                : 'All applications across your practice · Independent workspace'
              }
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className="pill">
            <span className="dot"></span>
            {viewMode === 'project' ? 'Project Mode' : 'Standalone Mode'}
          </span>
          <span className="pill">
            <span className="dot"></span>
            {user.role === 'town_planner' ? 'Town Planner' : user.role}
          </span>
        </div>
      </div>

      {/* Mode Toggle + Project Toggles */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <button
          className={`btn ${viewMode === 'project' ? '' : 'btn--secondary'}`}
          onClick={() => setViewMode('project')}
          style={{ borderRadius: 20, fontSize: 12, padding: '6px 14px' }}
        >
          📋 Project
        </button>
        <button
          className={`btn ${viewMode === 'standalone' ? '' : 'btn--secondary'}`}
          onClick={() => setViewMode('standalone')}
          style={{ borderRadius: 20, fontSize: 12, padding: '6px 14px' }}
        >
          🏛️ Standalone
        </button>
        {viewMode === 'project' && (
          <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>
            Project-scoped · integrates with Passport, SpecForge, Finance
          </span>
        )}
        {viewMode === 'standalone' && (
          <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>
            Practice portfolio · no project context required
          </span>
        )}
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', overflow: 'auto' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? 'var(--teal)' : 'var(--muted)',
              borderBottom: activeTab === tab.id ? '2px solid var(--teal)' : '2px solid transparent',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontFamily: 'var(--font)',
              borderBottomWidth: 2,
              borderBottomStyle: 'solid',
              borderBottomColor: activeTab === tab.id ? 'var(--teal)' : 'transparent',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'dashboard' && <DashboardTab viewMode={viewMode} />}
      {activeTab === 'applications' && <ApplicationsTab viewMode={viewMode} onSelect={setSelectedApplicationId} />}
      {activeTab === 'deadlines' && <DeadlinesTab />}
      {activeTab === 'participation' && <ParticipationTab />}
      {activeTab === 'conditions' && <ConditionsTab />}
      {activeTab === 'hearings' && <HearingsTab />}
      {activeTab === 'municipalities' && <MunicipalitiesTab />}
      {activeTab === 'reports' && <ReportsTab />}
    </div>
  );
}

// ── Tab Content Components ────────────────────────────────────────────────────

function DashboardTab({ viewMode }: { viewMode: ViewMode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Stat Cards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <StatCard label="Total Applications" value="4" />
        <StatCard label="Active" value="2" />
        <StatCard label="At Risk" value="1" variant="danger" />
        <StatCard label="Approaching Deadlines" value="3" variant="warning" />
        <StatCard label="Hearings This Month" value="1" />
        <StatCard label="Pending Responses" value="1" variant="warning" />
      </div>

      {/* Active Applications Panel */}
      <section className="panel">
        <h2>Active Applications</h2>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
          {viewMode === 'project' ? 'Applications for this project' : 'All active applications in your practice'}
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Type</th>
              <th>Stage</th>
              <th>Status</th>
              <th>Next Deadline</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ fontFamily: 'monospace', fontSize: 12 }}>TP-2026-001</td>
              <td>Rezoning</td>
              <td>Circulation/Advertising</td>
              <td><span className="pill" style={{ fontSize: 11 }}>Active</span></td>
              <td style={{ color: 'var(--red)', fontWeight: 600, fontSize: 12 }}>3 days</td>
            </tr>
            <tr>
              <td style={{ fontFamily: 'monospace', fontSize: 12 }}>TP-2026-002</td>
              <td>Subdivision</td>
              <td>Preparation</td>
              <td><span className="pill" style={{ fontSize: 11 }}>Draft</span></td>
              <td style={{ color: 'var(--muted)', fontSize: 12 }}>30 days</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Cross-module links (project mode only) */}
      {viewMode === 'project' && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn" style={{ fontSize: 12 }}>🛂 View in Passport</button>
          <button className="btn" style={{ fontSize: 12 }}>📐 Open SpecForge</button>
          <button className="btn" style={{ fontSize: 12 }}>💰 Project Payments</button>
          <button className="btn" style={{ fontSize: 12 }}>💬 Planning Messages</button>
        </div>
      )}
    </div>
  );
}

function ApplicationsTab({ viewMode, onSelect }: { viewMode: ViewMode; onSelect: (id: string) => void }) {
  return (
    <section className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2>Planning Applications</h2>
        <button className="btn">+ New Application</button>
      </div>
      <table className="table">
        <thead>
          <tr><th>Reference</th><th>Type</th><th>Property</th><th>Stage</th><th>Municipality</th><th>Status</th></tr>
        </thead>
        <tbody>
          <tr onClick={() => onSelect('app-1')} style={{ cursor: 'pointer' }}>
            <td style={{ fontFamily: 'monospace', fontSize: 12 }}>TP-2026-001</td>
            <td>Rezoning</td>
            <td>Erf 1234, Hillside</td>
            <td>Circulation/Advertising</td>
            <td>City of Cape Town</td>
            <td><span className="pill" style={{ fontSize: 11 }}>Active</span></td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function DeadlinesTab() {
  return (
    <section className="panel">
      <h2>Deadline Register</h2>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
        All statutory and procedural deadlines across applications
      </p>
      <table className="table">
        <thead><tr><th>Deadline</th><th>Application</th><th>Due Date</th><th>Days</th><th>Status</th><th>Basis</th></tr></thead>
        <tbody>
          <tr>
            <td>Heritage assessment</td>
            <td style={{ fontFamily: 'monospace', fontSize: 12 }}>TP-2026-001</td>
            <td>15 Jul 2026</td>
            <td style={{ color: 'var(--red)', fontWeight: 600 }}>3</td>
            <td><span className="pill" style={{ fontSize: 11, color: 'var(--amber)' }}>Approaching</span></td>
            <td>NHRA S38</td>
          </tr>
          <tr>
            <td>Objection period close</td>
            <td style={{ fontFamily: 'monospace', fontSize: 12 }}>TP-2026-001</td>
            <td>20 Jul 2026</td>
            <td style={{ color: 'var(--amber)', fontWeight: 600 }}>8</td>
            <td><span className="pill" style={{ fontSize: 11, color: 'var(--amber)' }}>Approaching</span></td>
            <td>SPLUMA S56</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function ParticipationTab() {
  return (
    <section className="panel">
      <h2>Public Participation</h2>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
        Objections, comments, and responses during advertising
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 14 }}>
        <StatCard label="Objections" value="3" />
        <StatCard label="Responded" value="2" variant="success" />
        <StatCard label="Pending" value="1" variant="warning" />
      </div>
      <table className="table">
        <thead><tr><th>Objector</th><th>Date</th><th>Grounds</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td>Mrs. J. Williams</td><td>28 Jun 2026</td><td>Traffic impact</td><td><span className="pill" style={{ fontSize: 11, color: 'var(--green)' }}>Responded</span></td></tr>
          <tr><td>Hillside HOA</td><td>8 Jul 2026</td><td>Density concerns</td><td><span className="pill" style={{ fontSize: 11, color: 'var(--amber)' }}>Pending</span></td></tr>
        </tbody>
      </table>
    </section>
  );
}

function ConditionsTab() {
  return (
    <section className="panel">
      <h2>Conditions Register</h2>
      <p style={{ fontSize: 13, color: 'var(--muted)', padding: '24px 0', textAlign: 'center' }}>
        No conditions captured yet. Conditions appear after Record of Decision is issued.
      </p>
    </section>
  );
}

function HearingsTab() {
  return (
    <section className="panel">
      <h2>Hearings & Appeals</h2>
      <table className="table">
        <thead><tr><th>Date</th><th>Time</th><th>Application</th><th>Type</th><th>Venue</th><th>Status</th></tr></thead>
        <tbody>
          <tr>
            <td style={{ fontWeight: 600, color: 'var(--teal)' }}>23 Jul 2026</td>
            <td>09:00</td>
            <td style={{ fontFamily: 'monospace', fontSize: 12 }}>TP-2026-004</td>
            <td>MPT Hearing</td>
            <td>Civic Centre, Cape Town</td>
            <td><span className="pill" style={{ fontSize: 11 }}>Scheduled</span></td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function MunicipalitiesTab() {
  return (
    <section className="panel">
      <h2>Municipality Profiles</h2>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
        Configured municipality process variations, forms, and fee schedules
      </p>
      <table className="table">
        <thead><tr><th>Municipality</th><th>Province</th><th>Contact</th><th>Applications</th></tr></thead>
        <tbody>
          <tr>
            <td style={{ fontWeight: 600 }}>City of Cape Town</td>
            <td>Western Cape</td>
            <td style={{ fontSize: 12, color: 'var(--muted)' }}>landuse@capetown.gov.za</td>
            <td>4 active</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function ReportsTab() {
  return (
    <section className="panel">
      <h2>Reports & Analytics</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
        <StatCard label="Avg. Processing" value="142 days" />
        <StatCard label="Compliance Rate" value="94%" variant="success" />
        <StatCard label="Deadlines Met" value="12/13" />
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn">📊 Portfolio Report</button>
        <button className="btn">👤 Client Report</button>
        <button className="btn">✅ Compliance Report</button>
      </div>
    </section>
  );
}

// ── Shared Sub-Components ─────────────────────────────────────────────────────

function StatCard({ label, value, variant }: { label: string; value: string; variant?: 'success' | 'warning' | 'danger' }) {
  const colorMap = { success: 'var(--green)', warning: 'var(--amber)', danger: 'var(--red)' };
  const valueColor = variant ? colorMap[variant] : 'var(--ink)';

  return (
    <div className="stat-card">
      <div className="stat-value" style={{ color: valueColor }}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
