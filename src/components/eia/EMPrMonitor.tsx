// EMPrMonitor — Environmental Management Programme commitment tracker + audits
// Requirements: 8.1–8.7

import React, { useState } from 'react';
import { AlertTriangle, Link as LinkIcon, Plus, ClipboardCheck } from 'lucide-react';

import type {
  EMPrCommitment,
  EMPrAudit,
  EMPrPhase,
  MonitoringFrequency,
  EMPrComplianceStatus,
} from '@/services/eia/eiaTypes';
import {
  calculateCompliancePercentage,
  createCommitment,
  createAudit,
  findNonCompliantItems,
} from '@/services/eia/emprService';

export interface EMPrMonitorProps {
  projectId: string;
}

const PHASES: EMPrPhase[] = ['pre-construction', 'construction', 'operation', 'rehabilitation'];
const FREQUENCIES: MonitoringFrequency[] = ['daily', 'weekly', 'monthly', 'event-triggered'];
const STATUSES: EMPrComplianceStatus[] = ['compliant', 'non_compliant', 'not_yet_applicable'];

function formatPhase(phase: string): string {
  return phase
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('-');
}

function formatStatus(status: string): string {
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function statusColor(status: EMPrComplianceStatus): string {
  switch (status) {
    case 'compliant':
      return 'var(--green)';
    case 'non_compliant':
      return 'var(--red)';
    case 'not_yet_applicable':
      return 'var(--muted)';
  }
}

function statusBg(status: EMPrComplianceStatus): string {
  switch (status) {
    case 'compliant':
      return 'rgba(74,222,128,.1)';
    case 'non_compliant':
      return 'rgba(217,87,71,.06)';
    case 'not_yet_applicable':
      return 'rgba(16,32,51,.04)';
  }
}

function statusBorder(status: EMPrComplianceStatus): string {
  switch (status) {
    case 'compliant':
      return 'rgba(74,222,128,.18)';
    case 'non_compliant':
      return 'rgba(217,87,71,.18)';
    case 'not_yet_applicable':
      return 'var(--border)';
  }
}

/**
 * EMPrMonitor — EMPr commitment tracking and compliance audit recorder.
 * Displays commitments in a filterable table, shows compliance percentage,
 * flags non-compliant items with corrective action indicator, and provides
 * forms to add commitments and record audits.
 */
export function EMPrMonitor({ projectId }: EMPrMonitorProps) {
  const [commitments, setCommitments] = useState<EMPrCommitment[]>([]);
  const [audits, setAudits] = useState<EMPrAudit[]>([]);
  const [phaseFilter, setPhaseFilter] = useState<EMPrPhase | 'all'>('all');
  const [showCommitmentForm, setShowCommitmentForm] = useState(false);
  const [showAuditForm, setShowAuditForm] = useState(false);

  // ─── Commitment Form State ─────────────────────────────────────────────
  const [commitRef, setCommitRef] = useState('');
  const [commitDesc, setCommitDesc] = useState('');
  const [commitPhase, setCommitPhase] = useState<EMPrPhase>('construction');
  const [commitParty, setCommitParty] = useState('');
  const [commitFrequency, setCommitFrequency] = useState<MonitoringFrequency>('monthly');
  const [commitStatus, setCommitStatus] = useState<EMPrComplianceStatus>('not_yet_applicable');
  const [commitSpecForgeId, setCommitSpecForgeId] = useState('');

  // ─── Audit Form State ──────────────────────────────────────────────────
  const [auditDate, setAuditDate] = useState('');
  const [auditAuditor, setAuditAuditor] = useState('');
  const [auditFindings, setAuditFindings] = useState('');
  const [auditStatus, setAuditStatus] = useState<EMPrComplianceStatus>('compliant');

  // ─── Derived State ─────────────────────────────────────────────────────
  const complianceResult = calculateCompliancePercentage(commitments);
  const nonCompliantItems = findNonCompliantItems(commitments);

  const filteredCommitments =
    phaseFilter === 'all'
      ? commitments
      : commitments.filter((c) => c.applicablePhase === phaseFilter);

  // ─── Handlers ──────────────────────────────────────────────────────────
  function handleAddCommitment(e: React.FormEvent) {
    e.preventDefault();
    if (!commitRef.trim() || !commitDesc.trim() || !commitParty.trim()) return;

    const newCommitment = createCommitment({
      projectId,
      reference: commitRef.trim(),
      description: commitDesc.trim(),
      applicablePhase: commitPhase,
      responsibleParty: commitParty.trim(),
      monitoringFrequency: commitFrequency,
      complianceStatus: commitStatus,
      specForgeItemId: commitSpecForgeId.trim() || undefined,
    });

    setCommitments((prev) => [...prev, newCommitment]);
    // Reset form
    setCommitRef('');
    setCommitDesc('');
    setCommitPhase('construction');
    setCommitParty('');
    setCommitFrequency('monthly');
    setCommitStatus('not_yet_applicable');
    setCommitSpecForgeId('');
    setShowCommitmentForm(false);
  }

  function handleRecordAudit(e: React.FormEvent) {
    e.preventDefault();
    if (!auditDate || !auditAuditor.trim() || !auditFindings.trim()) return;

    const newAudit = createAudit({
      projectId,
      auditDate,
      auditorName: auditAuditor.trim(),
      findingsSummary: auditFindings.trim(),
      overallStatus: auditStatus,
    });

    setAudits((prev) => [...prev, newAudit]);
    // Reset form
    setAuditDate('');
    setAuditAuditor('');
    setAuditFindings('');
    setAuditStatus('compliant');
    setShowAuditForm(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Stat Row — Compliance Percentage */}
      <div className="stat-row" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <div className="stat-card">
          <div
            className="stat-value"
            style={{
              color:
                complianceResult.compliancePercentage >= 80
                  ? 'var(--green)'
                  : complianceResult.compliancePercentage >= 50
                    ? 'var(--amber)'
                    : 'var(--red)',
            }}
          >
            {complianceResult.compliancePercentage}%
          </div>
          <div className="stat-label">Compliance Rate</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--teal)' }}>
            {complianceResult.totalApplicable}
          </div>
          <div className="stat-label">Applicable Items</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--green)' }}>
            {complianceResult.compliantCount}
          </div>
          <div className="stat-label">Compliant</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--red)' }}>
            {complianceResult.nonCompliantCount}
          </div>
          <div className="stat-label">Non-Compliant</div>
        </div>
      </div>

      {/* Commitments Panel */}
      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '.5px',
              color: 'var(--deep)',
              margin: 0,
            }}
          >
            EMPr Commitments
          </h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Phase Filter */}
            <select
              value={phaseFilter}
              onChange={(e) => setPhaseFilter(e.target.value as EMPrPhase | 'all')}
              style={selectStyle}
              aria-label="Filter by phase"
            >
              <option value="all">All Phases</option>
              {PHASES.map((p) => (
                <option key={p} value={p}>
                  {formatPhase(p)}
                </option>
              ))}
            </select>
            <button
              className="btn"
              onClick={() => setShowCommitmentForm(!showCommitmentForm)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <Plus size={14} aria-hidden="true" />
              Add Commitment
            </button>
          </div>
        </div>

        {/* Commitment Form */}
        {showCommitmentForm && (
          <form
            onSubmit={handleAddCommitment}
            style={{
              marginBottom: 16,
              padding: 14,
              background: 'rgba(223,245,242,.25)',
              border: '1px solid var(--border)',
              borderRadius: 12,
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 10,
              }}
            >
              <FieldGroup label="Reference">
                <input
                  type="text"
                  value={commitRef}
                  onChange={(e) => setCommitRef(e.target.value)}
                  placeholder="e.g. EMPr-C001"
                  style={inputStyle}
                  required
                />
              </FieldGroup>
              <FieldGroup label="Description">
                <input
                  type="text"
                  value={commitDesc}
                  onChange={(e) => setCommitDesc(e.target.value)}
                  placeholder="Commitment description"
                  style={inputStyle}
                  required
                />
              </FieldGroup>
              <FieldGroup label="Phase">
                <select
                  value={commitPhase}
                  onChange={(e) => setCommitPhase(e.target.value as EMPrPhase)}
                  style={selectStyle}
                >
                  {PHASES.map((p) => (
                    <option key={p} value={p}>{formatPhase(p)}</option>
                  ))}
                </select>
              </FieldGroup>
              <FieldGroup label="Responsible Party">
                <input
                  type="text"
                  value={commitParty}
                  onChange={(e) => setCommitParty(e.target.value)}
                  placeholder="e.g. Site Manager"
                  style={inputStyle}
                  required
                />
              </FieldGroup>

              <FieldGroup label="Frequency">
                <select
                  value={commitFrequency}
                  onChange={(e) => setCommitFrequency(e.target.value as MonitoringFrequency)}
                  style={selectStyle}
                >
                  {FREQUENCIES.map((f) => (
                    <option key={f} value={f}>{formatStatus(f)}</option>
                  ))}
                </select>
              </FieldGroup>
              <FieldGroup label="Status">
                <select
                  value={commitStatus}
                  onChange={(e) => setCommitStatus(e.target.value as EMPrComplianceStatus)}
                  style={selectStyle}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{formatStatus(s)}</option>
                  ))}
                </select>
              </FieldGroup>
              <FieldGroup label="SpecForge Item ID (optional)">
                <input
                  type="text"
                  value={commitSpecForgeId}
                  onChange={(e) => setCommitSpecForgeId(e.target.value)}
                  placeholder="e.g. sf-item-123"
                  style={inputStyle}
                />
              </FieldGroup>
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button type="submit" className="btn">
                Save Commitment
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowCommitmentForm(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Commitments Table */}
        {filteredCommitments.length === 0 ? (
          <p
            style={{
              fontSize: 13,
              color: 'var(--muted)',
              fontStyle: 'italic',
              margin: 0,
            }}
          >
            {commitments.length === 0
              ? 'No EMPr commitments recorded. Add a commitment to begin tracking.'
              : 'No commitments match the selected phase filter.'}
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Description</th>
                <th>Phase</th>
                <th>Responsible</th>
                <th>Frequency</th>
                <th>Status</th>
                <th>SpecForge</th>
              </tr>
            </thead>
            <tbody>
              {filteredCommitments.map((c) => (
                <tr key={c.id}>
                  <td
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 11,
                      color: 'var(--muted)',
                    }}
                  >
                    {c.reference}
                  </td>
                  <td>{c.description}</td>
                  <td>{formatPhase(c.applicablePhase)}</td>
                  <td>{c.responsibleParty}</td>
                  <td>{formatStatus(c.monitoringFrequency)}</td>
                  <td>
                    <span
                      className="pill"
                      style={{
                        color: statusColor(c.complianceStatus),
                        background: statusBg(c.complianceStatus),
                        borderColor: statusBorder(c.complianceStatus),
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      <span className="dot" style={{ background: statusColor(c.complianceStatus) }}></span>
                      {formatStatus(c.complianceStatus)}
                    </span>

                    {c.complianceStatus === 'non_compliant' && (
                      <span
                        className="pill"
                        style={{
                          marginLeft: 6,
                          color: 'var(--red)',
                          background: 'rgba(217,87,71,.06)',
                          borderColor: 'rgba(217,87,71,.18)',
                          fontSize: 10,
                          fontWeight: 600,
                        }}
                      >
                        <AlertTriangle size={10} aria-hidden="true" style={{ marginRight: 3 }} />
                        Corrective Action Required
                      </span>
                    )}
                  </td>
                  <td>
                    {c.specForgeItemId ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 11,
                          color: 'var(--teal)',
                          fontFamily: 'monospace',
                        }}
                      >
                        <LinkIcon size={12} aria-hidden="true" />
                        {c.specForgeItemId}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Non-Compliant Items Alert */}
      {nonCompliantItems.length > 0 && (
        <section className="panel" style={{ borderColor: 'rgba(217,87,71,.18)' }}>
          <h2
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '.5px',
              color: 'var(--red)',
              margin: '0 0 12px 0',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <AlertTriangle size={14} aria-hidden="true" />
            Non-Compliant Items ({nonCompliantItems.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {nonCompliantItems.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  background: 'rgba(217,87,71,.03)',
                  border: '1px solid rgba(217,87,71,.12)',
                  borderRadius: 8,
                }}
              >
                <div>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 11,
                      color: 'var(--muted)',
                      marginRight: 8,
                    }}
                  >
                    {item.reference}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--ink)' }}>
                    {item.description}
                  </span>
                </div>
                <span
                  className="pill"
                  style={{
                    color: 'var(--red)',
                    background: 'rgba(217,87,71,.06)',
                    borderColor: 'rgba(217,87,71,.18)',
                    fontSize: 10,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  Corrective Action Required
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Audits Panel */}
      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '.5px',
              color: 'var(--deep)',
              margin: 0,
            }}
          >
            Compliance Audits
          </h2>
          <button
            className="btn"
            onClick={() => setShowAuditForm(!showAuditForm)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <ClipboardCheck size={14} aria-hidden="true" />
            Record Audit
          </button>
        </div>

        {/* Audit Form */}
        {showAuditForm && (
          <form
            onSubmit={handleRecordAudit}
            style={{
              marginBottom: 16,
              padding: 14,
              background: 'rgba(223,245,242,.25)',
              border: '1px solid var(--border)',
              borderRadius: 12,
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 10,
              }}
            >
              <FieldGroup label="Audit Date">
                <input
                  type="date"
                  value={auditDate}
                  onChange={(e) => setAuditDate(e.target.value)}
                  style={inputStyle}
                  required
                />
              </FieldGroup>
              <FieldGroup label="Auditor Name">
                <input
                  type="text"
                  value={auditAuditor}
                  onChange={(e) => setAuditAuditor(e.target.value)}
                  placeholder="Full name of auditor"
                  style={inputStyle}
                  required
                />
              </FieldGroup>

              <FieldGroup label="Overall Status">
                <select
                  value={auditStatus}
                  onChange={(e) => setAuditStatus(e.target.value as EMPrComplianceStatus)}
                  style={selectStyle}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{formatStatus(s)}</option>
                  ))}
                </select>
              </FieldGroup>
              <FieldGroup label="Findings Summary">
                <textarea
                  value={auditFindings}
                  onChange={(e) => setAuditFindings(e.target.value)}
                  placeholder="Summary of audit findings (max 2000 chars)"
                  maxLength={2000}
                  rows={3}
                  style={{ ...inputStyle, height: 'auto', padding: '8px 12px' }}
                  required
                />
              </FieldGroup>
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button type="submit" className="btn">
                Save Audit
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowAuditForm(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Audits Table */}
        {audits.length === 0 ? (
          <p
            style={{
              fontSize: 13,
              color: 'var(--muted)',
              fontStyle: 'italic',
              margin: 0,
            }}
          >
            No audits recorded. Record an audit to track compliance reviews.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Auditor</th>
                <th>Findings Summary</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {audits.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                    {a.auditDate}
                  </td>
                  <td>{a.auditorName}</td>
                  <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {a.findingsSummary}
                  </td>
                  <td>
                    <span
                      className="pill"
                      style={{
                        color: statusColor(a.overallStatus),
                        background: statusBg(a.overallStatus),
                        borderColor: statusBorder(a.overallStatus),
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      <span className="dot" style={{ background: statusColor(a.overallStatus) }}></span>
                      {formatStatus(a.overallStatus)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

interface FieldGroupProps {
  label: string;
  children: React.ReactNode;
}

function FieldGroup({ label, children }: FieldGroupProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--muted)',
          textTransform: 'uppercase',
          letterSpacing: '.3px',
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 36,
  padding: '0 12px',
  fontSize: 13,
  fontFamily: 'var(--font)',
  color: 'var(--ink)',
  background: 'rgba(255,255,255,.7)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  outline: 'none',
  transition: 'border-color .15s',
};

const selectStyle: React.CSSProperties = {
  height: 36,
  padding: '0 12px',
  fontSize: 13,
  fontFamily: 'var(--font)',
  color: 'var(--ink)',
  background: 'rgba(255,255,255,.7)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  outline: 'none',
  cursor: 'pointer',
};

export default EMPrMonitor;
