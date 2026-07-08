/**
 * FormSystemWorkspace — Main workspace for the Integrated Form System.
 * Follows the Architex workspace template pattern: Hero → Stat Row → Tab Navigation → Content.
 *
 * Renders inside AppShell 3-column grid. Uses CSS class-based styling
 * with platform tokens (var(--teal), var(--ink), etc.).
 *
 * Requirements validated: 1.1, 1.2, 1.3, 1.5, 10.1–10.5
 */

import React, { useState, useMemo } from 'react';
import type { UserProfile } from '@/types';
import FormTemplateLibrary from './FormTemplateLibrary';

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  user: UserProfile;
  projectId?: string;
  projectName?: string;
  projectStage?: string;
  projectMunicipality?: string;
}

type FormTab = 'library' | 'editor' | 'drafts' | 'export' | 'audit';

interface TabDefinition {
  id: FormTab;
  label: string;
}

// ── Tab Configuration ────────────────────────────────────────────────────────

const FORM_TABS: TabDefinition[] = [
  { id: 'library', label: 'Template Library' },
  { id: 'editor', label: 'Form Editor' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'export', label: 'Export / Sign' },
  { id: 'audit', label: 'Audit Trail' },
];

// ── Main Component ───────────────────────────────────────────────────────────

export default function FormSystemWorkspace({
  user,
  projectId,
  projectName,
  projectStage,
  projectMunicipality,
}: Props) {
  const [activeTab, setActiveTab] = useState<FormTab>('library');

  // Demo/fallback values when no project context provided
  const displayName = projectName ?? 'Form System';
  const displayStage = projectStage ?? 'All Stages';
  const displayMunicipality = projectMunicipality ?? 'All Municipalities';

  // Stats — in production these would come from hooks/services
  const stats = useMemo(() => ({
    templatesAvailable: 24,
    exported: 8,
    drafts: 3,
    stageRecommended: projectStage ? 'Comply' : '—',
  }), [projectStage]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ─── Hero ───────────────────────────────────────────────────────── */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">FORM SYSTEM</div>
            <h1>{displayName}</h1>
            <p className="sub">
              {displayMunicipality} · {displayStage} · {user.role.replace(/_/g, ' ')}
            </p>
          </div>
        </div>
        <div className="hero-pills">
          <span className="pill">
            <span className="dot"></span> Active
          </span>
          {projectId && (
            <span className="pill pill-success">
              <span className="dot"></span> Project Linked
            </span>
          )}
          {!projectId && (
            <span className="pill pill-muted">
              <span className="dot"></span> Standalone
            </span>
          )}
        </div>
      </div>

      {/* ─── Stat Row ───────────────────────────────────────────────────── */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-value">{stats.templatesAvailable}</div>
          <div className="stat-label">Templates Available</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.exported}</div>
          <div className="stat-label">Exported</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.drafts}</div>
          <div className="stat-label">Drafts</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--deep)' }}>
            {stats.stageRecommended}
          </div>
          <div className="stat-label">Stage Recommended</div>
        </div>
      </div>

      {/* ─── Tab Navigation ─────────────────────────────────────────────── */}
      <div className="panel" style={{ padding: '8px 14px' }}>
        <nav
          style={{ display: 'flex', gap: 4 }}
          role="tablist"
          aria-label="Form system tabs"
        >
          {FORM_TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: activeTab === tab.id ? 600 : 400,
                color: activeTab === tab.id ? 'var(--deep)' : 'var(--muted)',
                background: activeTab === tab.id ? 'var(--aqua)' : 'transparent',
                border: activeTab === tab.id
                  ? '1px solid var(--border)'
                  : '1px solid transparent',
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ─── Active Tab Content ─────────────────────────────────────────── */}
      {activeTab === 'library' && (
        <FormTemplateLibrary
          projectStage={projectStage}
          projectMunicipality={projectMunicipality}
        />
      )}

      {activeTab === 'editor' && (
        <div className="panel">
          <h2>Form Editor</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Select a template from the library to begin editing a form.
          </p>
        </div>
      )}

      {activeTab === 'drafts' && (
        <div className="panel">
          <h2>My Drafts</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Your saved draft forms will appear here, organized by project.
          </p>
        </div>
      )}

      {activeTab === 'export' && (
        <div className="panel">
          <h2>Export / Sign</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Export completed forms as PDF or apply digital signatures.
          </p>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="panel">
          <h2>Audit Trail</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Complete history of form changes, exports, and signatures.
          </p>
        </div>
      )}
    </div>
  );
}
