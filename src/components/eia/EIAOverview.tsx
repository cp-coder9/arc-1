// EIAOverview — Summary dashboard for the EIA workspace overview tab.
// Displays screening status, assessment phase, authorization count,
// EMPr compliance %, green building ratings, and appointed EAP details.
// Requirements: 1.2, 3.3, 14.5, 14.7

import React from 'react';
import {
  Shield,
  Users,
  FileCheck,
  Leaf,
  Award,
  ClipboardCheck,
  AlertTriangle,
} from 'lucide-react';
import { AdvisoryNotice } from './shared';

// ─── Props ───────────────────────────────────────────────────────────────────

export interface EIAOverviewProps {
  projectId: string;
}

// ─── Summary Data Types (internal) ──────────────────────────────────────────

interface OverviewSummary {
  screeningStatus: 'not_run' | 'no_eia_required' | 'basic_assessment' | 'full_scoping_eia';
  assessmentPhase: string | null;
  authorizationCount: number;
  emprCompliancePercent: number | null;
  greenStarRating: number | null;
  edgeLevel: string | null;
}

interface EAPDetails {
  practitionerName: string;
  firmName: string;
  eapasaRegistration: string;
  assignmentStatus: 'active' | 'replaced' | 'withdrawn';
  verificationStatus: 'verified' | 'unverified' | 'expired';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function screeningLabel(status: OverviewSummary['screeningStatus']): string {
  switch (status) {
    case 'not_run':
      return 'Not Screened';
    case 'no_eia_required':
      return 'No EIA Required';
    case 'basic_assessment':
      return 'Basic Assessment';
    case 'full_scoping_eia':
      return 'Full Scoping & EIA';
  }
}

function screeningColor(status: OverviewSummary['screeningStatus']): string {
  switch (status) {
    case 'not_run':
      return 'var(--muted)';
    case 'no_eia_required':
      return 'var(--green)';
    case 'basic_assessment':
      return 'var(--amber)';
    case 'full_scoping_eia':
      return 'var(--red)';
  }
}

function assignmentPillStyle(status: EAPDetails['assignmentStatus']): React.CSSProperties {
  switch (status) {
    case 'active':
      return {
        color: 'var(--green)',
        background: 'rgba(74,222,128,.1)',
        borderColor: 'rgba(74,222,128,.18)',
      };
    case 'replaced':
      return {
        color: 'var(--muted)',
        background: 'rgba(16,32,51,.04)',
        borderColor: 'var(--border)',
      };
    case 'withdrawn':
      return {
        color: 'var(--red)',
        background: 'rgba(217,87,71,.06)',
        borderColor: 'rgba(217,87,71,.18)',
      };
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * EIAOverview — Overview tab for the EIA Workspace.
 * Displays summary statistics, appointed EAP details, and advisory notice.
 * All outputs include "Professional review required" pill.
 */
export function EIAOverview({ projectId }: EIAOverviewProps) {
  // In a fully wired implementation, data would come from Firestore via hooks.
  // For now, use placeholder summary until persistence layer is connected.
  const summary: OverviewSummary = {
    screeningStatus: 'not_run',
    assessmentPhase: null,
    authorizationCount: 0,
    emprCompliancePercent: null,
    greenStarRating: null,
    edgeLevel: null,
  };

  const eap: EAPDetails | null = null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Advisory Notice — top of page */}
      <AdvisoryNotice />

      {/* Summary Stats */}
      <section className="panel">
        <h2
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--deep)',
            margin: '0 0 14px 0',
            fontFamily: 'var(--font)',
          }}
        >
          Environmental Compliance Summary
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 12,
          }}
        >
          {/* Screening Status */}
          <div className="stat-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Shield size={16} style={{ color: 'var(--teal)' }} aria-hidden="true" />
              <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Screening
              </span>
            </div>
            <div
              className="stat-value"
              style={{ color: screeningColor(summary.screeningStatus), fontSize: 16 }}
            >
              {screeningLabel(summary.screeningStatus)}
            </div>
            <ProfessionalReviewPill />
          </div>

          {/* Assessment Phase */}
          <div className="stat-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <FileCheck size={16} style={{ color: 'var(--teal)' }} aria-hidden="true" />
              <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Assessment Phase
              </span>
            </div>
            <div className="stat-value" style={{ fontSize: 16, color: 'var(--ink)' }}>
              {summary.assessmentPhase ?? '—'}
            </div>
            <ProfessionalReviewPill />
          </div>

          {/* Authorization Count */}
          <div className="stat-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <ClipboardCheck size={16} style={{ color: 'var(--teal)' }} aria-hidden="true" />
              <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Authorizations
              </span>
            </div>
            <div className="stat-value" style={{ fontSize: 22, color: 'var(--ink)' }}>
              {summary.authorizationCount}
            </div>
            <ProfessionalReviewPill />
          </div>

          {/* EMPr Compliance */}
          <div className="stat-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Leaf size={16} style={{ color: 'var(--teal)' }} aria-hidden="true" />
              <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                EMPr Compliance
              </span>
            </div>
            <div
              className="stat-value"
              style={{
                fontSize: 22,
                color:
                  summary.emprCompliancePercent === null
                    ? 'var(--muted)'
                    : summary.emprCompliancePercent >= 80
                      ? 'var(--green)'
                      : summary.emprCompliancePercent >= 50
                        ? 'var(--amber)'
                        : 'var(--red)',
              }}
            >
              {summary.emprCompliancePercent !== null
                ? `${summary.emprCompliancePercent}%`
                : '—'}
            </div>
            <ProfessionalReviewPill />
          </div>

          {/* Green Star Rating */}
          <div className="stat-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Award size={16} style={{ color: 'var(--teal)' }} aria-hidden="true" />
              <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Green Star SA
              </span>
            </div>
            <div className="stat-value" style={{ fontSize: 22, color: 'var(--ink)' }}>
              {summary.greenStarRating !== null
                ? `${summary.greenStarRating} Star`
                : '—'}
            </div>
            <ProfessionalReviewPill />
          </div>

          {/* EDGE Level */}
          <div className="stat-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Leaf size={16} style={{ color: 'var(--teal)' }} aria-hidden="true" />
              <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                EDGE Certification
              </span>
            </div>
            <div className="stat-value" style={{ fontSize: 16, color: 'var(--ink)' }}>
              {summary.edgeLevel ?? '—'}
            </div>
            <ProfessionalReviewPill />
          </div>
        </div>
      </section>

      {/* EAP Details Panel */}
      <section className="panel">
        <h2
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--deep)',
            margin: '0 0 14px 0',
            fontFamily: 'var(--font)',
          }}
        >
          Appointed Environmental Assessment Practitioner
        </h2>

        {eap ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Users size={18} style={{ color: 'var(--teal)', flexShrink: 0 }} aria-hidden="true" />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                  {eap.practitionerName}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {eap.firmName}
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 10,
                marginTop: 4,
              }}
            >
              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>
                  Registration
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink)', fontFamily: 'monospace' }}>
                  {eap.eapasaRegistration}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>
                  Status
                </div>
                <span
                  className="pill"
                  style={{
                    ...assignmentPillStyle(eap.assignmentStatus),
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                >
                  <span className="dot" style={{ background: assignmentPillStyle(eap.assignmentStatus).color }}></span>
                  {eap.assignmentStatus.charAt(0).toUpperCase() + eap.assignmentStatus.slice(1)}
                </span>
              </div>

              <div>
                <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>
                  Verification
                </div>
                <span
                  className="pill"
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: eap.verificationStatus === 'verified' ? 'var(--green)' : 'var(--amber)',
                    background: eap.verificationStatus === 'verified' ? 'rgba(74,222,128,.1)' : 'rgba(245,166,35,.08)',
                    borderColor: eap.verificationStatus === 'verified' ? 'rgba(74,222,128,.18)' : 'rgba(245,166,35,.18)',
                  }}
                >
                  <span
                    className="dot"
                    style={{ background: eap.verificationStatus === 'verified' ? 'var(--green)' : 'var(--amber)' }}
                  ></span>
                  {eap.verificationStatus.charAt(0).toUpperCase() + eap.verificationStatus.slice(1)}
                </span>
              </div>
            </div>

            <ProfessionalReviewPill />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertTriangle size={18} style={{ color: 'var(--amber)', flexShrink: 0 }} aria-hidden="true" />
              <span
                className="pill"
                style={{
                  color: 'var(--amber)',
                  background: 'rgba(245,166,35,.08)',
                  borderColor: 'rgba(245,166,35,.18)',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                <span className="dot" style={{ background: 'var(--amber)' }}></span>
                No EAP Appointed
              </span>
            </div>
            <p
              style={{
                fontSize: 12,
                color: 'var(--muted)',
                lineHeight: 1.5,
                margin: 0,
                paddingLeft: 28,
              }}
            >
              An Environmental Assessment Practitioner must be appointed before the EIA process can commence.
              Use the EAP Management section to record practitioner details.
            </p>
            <ProfessionalReviewPill />
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/**
 * Reusable "Professional review required" pill applied to all status outputs.
 * Requirements: 14.5, 14.7
 */
function ProfessionalReviewPill() {
  return (
    <div style={{ marginTop: 8 }}>
      <span
        className="pill"
        style={{
          color: 'var(--amber)',
          background: 'rgba(245,166,35,.08)',
          borderColor: 'rgba(245,166,35,.18)',
          fontSize: 10,
          fontWeight: 600,
        }}
      >
        <span className="dot" style={{ background: 'var(--amber)' }}></span>
        Professional review required
      </span>
    </div>
  );
}

export default EIAOverview;
