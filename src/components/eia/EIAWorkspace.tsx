import React, { useState } from 'react';
import type { UserProfile } from '@/types';
import type { EIATabId } from '@/services/eia/eiaTypes';
import {
  Leaf,
  Search,
  FileCheck,
  FileText,
  ShieldCheck,
  ClipboardList,
  Users,
  Building2,
  FolderOpen,
  PlusCircle,
} from 'lucide-react';

// ─── Role Access Control ─────────────────────────────────────────────────────

/** Roles with read access to the EIA Workspace (Requirement 1.5) */
const EIA_READ_ROLES = [
  'architect',
  'engineer',
  'town_planner',
  'energy_professional',
  'developer',
  'client',
  'platform_admin',
  'site_manager',
  'contractor',
];

/** Roles with write access to screening, assessment, authorization, and public participation tabs (Requirement 14.2) */
const EIA_WRITE_ROLES = ['architect', 'engineer', 'town_planner', 'energy_professional'];

/** Roles with write access to the EMPr tab (Requirement 14.3) */
const EMPR_WRITE_ROLES = ['architect', 'engineer', 'site_manager', 'energy_professional', 'contractor'];

/** Roles with write access to the Green Building tab (Requirement 14.4) */
const GREEN_BUILDING_WRITE_ROLES = ['architect', 'energy_professional'];

// ─── Tab Configuration ───────────────────────────────────────────────────────

interface TabConfig {
  id: EIATabId;
  label: string;
  icon: React.ReactNode;
  writeRoles: string[];
}

const TABS: TabConfig[] = [
  { id: 'overview', label: 'Overview', icon: <Leaf size={14} />, writeRoles: EIA_READ_ROLES },
  { id: 'screening', label: 'Screening', icon: <Search size={14} />, writeRoles: EIA_WRITE_ROLES },
  { id: 'basic-assessment', label: 'Basic Assessment', icon: <FileCheck size={14} />, writeRoles: EIA_WRITE_ROLES },
  { id: 'full-eia', label: 'Full EIA', icon: <FileText size={14} />, writeRoles: EIA_WRITE_ROLES },
  { id: 'authorization', label: 'Authorization', icon: <ShieldCheck size={14} />, writeRoles: EIA_WRITE_ROLES },
  { id: 'empr', label: 'EMPr', icon: <ClipboardList size={14} />, writeRoles: EMPR_WRITE_ROLES },
  { id: 'public-participation', label: 'Public Participation', icon: <Users size={14} />, writeRoles: EIA_WRITE_ROLES },
  { id: 'green-building', label: 'Green Building', icon: <Building2 size={14} />, writeRoles: GREEN_BUILDING_WRITE_ROLES },
];

// ─── Props ───────────────────────────────────────────────────────────────────

interface EIAWorkspaceProps {
  user: UserProfile;
  projectId?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function EIAWorkspace({ user, projectId }: EIAWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<EIATabId>('overview');

  // ─── Role Guard (Requirement 14.1) ──────────────────────────────────────
  if (!EIA_READ_ROLES.includes(user.role)) {
    return (
      <section className="panel" style={{ textAlign: 'center', padding: 40 }}>
        <h2 style={{ color: 'var(--ink)', marginBottom: 8 }}>Access Restricted</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          Your role does not have access to the EIA & Environmental Compliance Workspace.
        </p>
      </section>
    );
  }

  // ─── No Project Selected (Requirement 1.4) ─────────────────────────────
  if (!projectId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Hero */}
        <div className="hero">
          <div className="hero-header">
            <div>
              <div className="eyebrow">EIA &amp; ENVIRONMENTAL COMPLIANCE</div>
              <h1>Select Project</h1>
              <p className="sub">Choose a project to view environmental compliance data</p>
            </div>
          </div>
        </div>

        {/* Empty state prompt */}
        <section className="panel" style={{ textAlign: 'center', padding: 48 }}>
          <FolderOpen size={40} style={{ color: 'var(--muted)', marginBottom: 12 }} />
          <h2 style={{ color: 'var(--ink)', fontSize: 16, marginBottom: 8 }}>No Project Selected</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
            Select an existing project or create a new one to access EIA screening, assessments, authorizations, and green building tracking.
          </p>
          <button className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <PlusCircle size={14} /> Choose or Create Project
          </button>
        </section>
      </div>
    );
  }

  // ─── Check write access for active tab ──────────────────────────────────
  const activeTabConfig = TABS.find(t => t.id === activeTab);
  const hasWriteAccess = activeTabConfig?.writeRoles.includes(user.role) ?? false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ─── Hero ──────────────────────────────────────────────────────────── */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">EIA &amp; ENVIRONMENTAL COMPLIANCE</div>
            <h1>Project {projectId}</h1>
            <p className="sub">Environmental Impact Assessment · Advisory readiness · Professional review required</p>
          </div>
        </div>
        <div className="hero-pills" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className="pill"><span className="dot"></span> {user.role.replace(/_/g, ' ')}</span>
          {!hasWriteAccess && (
            <span className="pill" style={{ color: 'var(--muted)', background: 'rgba(16,32,51,.04)', borderColor: 'var(--border)' }}>
              Read Only
            </span>
          )}
        </div>
      </div>

      {/* ─── Stat Row ──────────────────────────────────────────────────────── */}
      <div className="stat-row" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--muted)' }}>—</div>
          <div className="stat-label">Screening Status</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--muted)' }}>—</div>
          <div className="stat-label">Assessment Phase</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--muted)' }}>0</div>
          <div className="stat-label">Authorizations</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--muted)' }}>—</div>
          <div className="stat-label">EMPr Compliance</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--muted)' }}>—</div>
          <div className="stat-label">Green Building</div>
        </div>
      </div>

      {/* ─── Tab Navigation ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            className="btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              background: activeTab === tab.id ? 'var(--aqua)' : 'transparent',
              color: activeTab === tab.id ? 'var(--deep)' : 'var(--muted)',
              borderColor: activeTab === tab.id ? 'var(--teal)' : 'var(--border)',
              fontWeight: activeTab === tab.id ? 600 : 400,
              fontSize: 12,
            }}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Active Tab Panel ──────────────────────────────────────────────── */}
      <div className="panel">
        <TabPanel tabId={activeTab} projectId={projectId} userRole={user.role} />
      </div>
    </div>
  );
}

// ─── Tab Panel Renderer ──────────────────────────────────────────────────────

interface TabPanelProps {
  tabId: EIATabId;
  projectId: string;
  userRole: string;
}

function TabPanel({ tabId, projectId, userRole }: TabPanelProps) {
  // Per-tab empty states with guidance on next actions (Requirement 1.7)
  switch (tabId) {
    case 'overview':
      return (
        <TabEmptyState
          title="EIA Overview"
          description="Summary of environmental compliance status will appear here once screening, assessments, or green building data has been recorded."
          action="Run Activity Screening to begin"
        />
      );
    case 'screening':
      return (
        <TabEmptyState
          title="Activity Screening"
          description="No screening records exist for this project. Run a NEMA Listed Activity screening to determine if an EIA process is required."
          action="Start New Screening"
        />
      );
    case 'basic-assessment':
      return (
        <TabEmptyState
          title="Basic Assessment Tracker"
          description="No Basic Assessment process has been initiated. A Basic Assessment is required when Listing Notice 1 or 3 activities are triggered."
          action="Initiate after screening confirms Basic Assessment required"
        />
      );
    case 'full-eia':
      return (
        <TabEmptyState
          title="Full Scoping & EIA Tracker"
          description="No Full EIA process has been initiated. A Full Scoping & EIA is required when Listing Notice 2 activities are triggered."
          action="Initiate after screening confirms Full EIA required"
        />
      );
    case 'authorization':
      return (
        <TabEmptyState
          title="Authorization Register"
          description="No Environmental Authorizations have been recorded. Authorizations are issued by the Competent Authority following successful EIA review."
          action="Record authorization once issued"
        />
      );
    case 'empr':
      return (
        <TabEmptyState
          title="EMPr Monitor"
          description="No Environmental Management Programme commitments have been captured. EMPr conditions form part of the Environmental Authorization."
          action="Capture EMPr commitments from authorization conditions"
        />
      );
    case 'public-participation':
      return (
        <TabEmptyState
          title="Public Participation Log"
          description="No Interested and Affected Parties have been registered. Public participation is required during Basic Assessment and Full EIA processes."
          action="Register I&APs to begin the public participation record"
        />
      );
    case 'green-building':
      return (
        <TabEmptyState
          title="Green Building"
          description="No green building certification tracking has been set up. Track Green Star SA, EDGE, and Net Zero progress for this project."
          action="Select a rating tool to begin"
        />
      );
    default:
      return null;
  }
}

// ─── Empty State Component ───────────────────────────────────────────────────

interface TabEmptyStateProps {
  title: string;
  description: string;
  action: string;
}

function TabEmptyState({ title, description, action }: TabEmptyStateProps) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 16px' }}>
      <h2 style={{ color: 'var(--ink)', fontSize: 15, marginBottom: 8 }}>{title}</h2>
      <p style={{ color: 'var(--muted)', fontSize: 13, maxWidth: 460, margin: '0 auto 14px' }}>
        {description}
      </p>
      <span
        className="pill"
        style={{
          color: 'var(--deep)',
          background: 'var(--aqua)',
          borderColor: 'var(--teal)',
          fontSize: 11,
        }}
      >
        {action}
      </span>
    </div>
  );
}
