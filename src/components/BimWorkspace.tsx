import React from 'react';
import type { UserProfile } from '@/types';
import { BIM_UPLOAD_ROLES } from '@/services/bim/types';

// ─── Props ───────────────────────────────────────────────────────────────────

interface BimWorkspaceProps {
  user: UserProfile;
  projectId?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function BimWorkspace({ user }: BimWorkspaceProps) {
  // ─── Role Guard (Requirement 10.1–10.7) ─────────────────────────────────
  const hasAccess =
    BIM_UPLOAD_ROLES.includes(user.role) ||
    user.role === 'client' ||
    user.role === 'subcontractor' ||
    user.role === 'supplier';

  if (!hasAccess) {
    return (
      <section className="panel" style={{ textAlign: 'center', padding: 40 }}>
        <h2 style={{ color: 'var(--ink)', marginBottom: 8 }}>Access Restricted</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          Your role does not have access to the BIM Quantity Extraction workspace.
        </p>
      </section>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ─── Hero ──────────────────────────────────────────────────────────── */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">BIM QUANTITIES</div>
            <h1>IFC Model Extraction &amp; BoQ</h1>
            <p className="sub">Upload IFC models · Extract quantities · Generate ASAQS/JBCC Bills of Quantities</p>
          </div>
        </div>
        <div className="hero-pills" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className="pill"><span className="dot"></span> {user.role.replace(/_/g, ' ')}</span>
        </div>
      </div>

      {/* ─── Stat Row ──────────────────────────────────────────────────────── */}
      <div className="stat-row" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--muted)' }}>0</div>
          <div className="stat-label">Models</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--muted)' }}>0</div>
          <div className="stat-label">Elements</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--muted)' }}>—</div>
          <div className="stat-label">Coverage %</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--muted)' }}>—</div>
          <div className="stat-label">BoQ Status</div>
        </div>
      </div>

      {/* ─── Panels Placeholder ────────────────────────────────────────────── */}
      <section className="panel">
        <h2 style={{ color: 'var(--ink)', fontSize: 14, marginBottom: 12 }}>Getting Started</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          Upload an IFC file to begin extracting quantities from your BIM model.
          The extraction pipeline will parse elements, apply ASAQS trade section mapping rules,
          and generate a structured Bill of Quantities ready for tender or cost planning.
        </p>
      </section>
    </div>
  );
}
