// AuthorizationRegister — Environmental Authorization register with condition tracking
// Requirements: 6.1–6.7

import React, { useState } from 'react';
import { Plus, Shield } from 'lucide-react';

import type {
  AuthorizationRecord,
  AuthorizationCondition,
  AuthorizationStatus,
  ConditionComplianceStatus,
  AuthorizationConditionSummary,
} from '@/services/eia/eiaTypes';
import { calculateConditionSummary } from '@/services/eia/authorizationService';

export interface AuthorizationRegisterProps {
  projectId: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const AUTHORIZATION_STATUSES: { value: AuthorizationStatus; label: string }[] = [
  { value: 'pending_decision', label: 'Pending Decision' },
  { value: 'authorized', label: 'Authorized' },
  { value: 'authorized_with_conditions', label: 'Authorized with Conditions' },
  { value: 'refused', label: 'Refused' },
  { value: 'appealed', label: 'Appealed' },
  { value: 'lapsed', label: 'Lapsed' },
  { value: 'amended', label: 'Amended' },
];

const COMPLIANCE_STATUSES: { value: ConditionComplianceStatus; label: string }[] = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'complied', label: 'Complied' },
  { value: 'non_compliant', label: 'Non-Compliant' },
];

function getStatusChipClass(status: AuthorizationStatus): string {
  switch (status) {
    case 'authorized':
    case 'authorized_with_conditions':
      return 'chip chip-approved';
    case 'pending_decision':
      return 'chip chip-pending';
    case 'refused':
      return 'chip chip-rejected';
    case 'appealed':
    case 'lapsed':
    case 'amended':
      return 'chip chip-draft';
    default:
      return 'chip';
  }
}

function getComplianceColor(status: ConditionComplianceStatus): string {
  switch (status) {
    case 'complied':
      return 'var(--green)';
    case 'in_progress':
      return 'var(--amber)';
    case 'non_compliant':
      return 'var(--red)';
    case 'not_started':
    default:
      return 'var(--muted)';
  }
}

interface AuthFormState {
  referenceNumber: string;
  dateOfIssue: string;
  competentAuthority: string;
  validityStart: string;
  validityExpiry: string;
  status: AuthorizationStatus;
  authorizedActivities: string;
}

const INITIAL_FORM: AuthFormState = {
  referenceNumber: '',
  dateOfIssue: '',
  competentAuthority: '',
  validityStart: '',
  validityExpiry: '',
  status: 'pending_decision',
  authorizedActivities: '',
};

let localIdCounter = 0;
function generateLocalId(prefix: string): string {
  localIdCounter += 1;
  return `${prefix}_${Date.now()}_${localIdCounter}`;
}

/**
 * AuthorizationRegister — Environmental Authorization register
 * Manages authorization records with condition tracking, compliance status,
 * and summary statistics (total, complied, outstanding, overdue).
 *
 * Requirements: 6.1–6.7
 */
export function AuthorizationRegister({ projectId }: AuthorizationRegisterProps) {
  const [authorizations, setAuthorizations] = useState<AuthorizationRecord[]>([]);
  const [form, setForm] = useState<AuthFormState>(INITIAL_FORM);
  const [showForm, setShowForm] = useState(false);

  // ─── Add Authorization ─────────────────────────────────────────────────────

  function handleAddAuthorization(e: React.FormEvent) {
    e.preventDefault();
    if (!form.referenceNumber || !form.dateOfIssue || !form.competentAuthority ||
        !form.validityStart || !form.validityExpiry) {
      return;
    }

    const activities = form.authorizedActivities
      .split('\n')
      .map((a) => a.trim())
      .filter((a) => a.length > 0);

    const newAuth: AuthorizationRecord = {
      id: generateLocalId('auth'),
      projectId,
      referenceNumber: form.referenceNumber,
      dateOfIssue: form.dateOfIssue,
      competentAuthority: form.competentAuthority,
      validityStart: form.validityStart,
      validityExpiry: form.validityExpiry,
      authorizedActivities: activities,
      status: form.status,
      conditions: [],
    };

    setAuthorizations((prev) => [...prev, newAuth]);
    setForm(INITIAL_FORM);
    setShowForm(false);
  }

  // ─── Update Authorization Status ──────────────────────────────────────────

  function handleStatusChange(authId: string, newStatus: AuthorizationStatus) {
    setAuthorizations((prev) =>
      prev.map((a) => (a.id === authId ? { ...a, status: newStatus } : a))
    );
  }

  // ─── Add Condition ─────────────────────────────────────────────────────────

  function handleAddCondition(authId: string) {
    setAuthorizations((prev) =>
      prev.map((a) => {
        if (a.id !== authId) return a;
        const newCondition: AuthorizationCondition = {
          id: generateLocalId('cond'),
          conditionNumber: a.conditions.length + 1,
          conditionText: '',
          responsibleParty: '',
          complianceStatus: 'not_started',
        };
        return { ...a, conditions: [...a.conditions, newCondition] };
      })
    );
  }

  // ─── Update Condition ──────────────────────────────────────────────────────

  function handleConditionChange(
    authId: string,
    conditionId: string,
    field: keyof AuthorizationCondition,
    value: string
  ) {
    setAuthorizations((prev) =>
      prev.map((a) => {
        if (a.id !== authId) return a;
        const updatedConditions = a.conditions.map((c) =>
          c.id === conditionId ? { ...c, [field]: value } : c
        );
        return { ...a, conditions: updatedConditions };
      })
    );
  }

  // ─── Global Summary ────────────────────────────────────────────────────────

  const allConditions = authorizations.flatMap((a) => a.conditions);
  const globalSummary: AuthorizationConditionSummary =
    calculateConditionSummary(allConditions);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Stat Row — Summary Stats */}
      <div className="stat-row" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--ink)' }}>
            {globalSummary.total}
          </div>
          <div className="stat-label">Total Conditions</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--green)' }}>
            {globalSummary.complied}
          </div>
          <div className="stat-label">Complied</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--amber)' }}>
            {globalSummary.outstanding}
          </div>
          <div className="stat-label">Outstanding</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--red)' }}>
            {globalSummary.overdue}
          </div>
          <div className="stat-label">Overdue</div>
        </div>
      </div>

      {/* Professional Review Notice */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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

      {/* Add Authorization Panel */}
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
            Authorization Register
          </h2>
          <button
            className="btn"
            onClick={() => setShowForm(!showForm)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={14} aria-hidden="true" />
            {showForm ? 'Cancel' : 'Add Authorization'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleAddAuthorization}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 14,
                marginBottom: 16,
              }}
            >
              <FieldGroup label="Reference Number">
                <input
                  type="text"
                  value={form.referenceNumber}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, referenceNumber: e.target.value }))
                  }
                  placeholder="e.g. 14/12/16/3/3/2/1234"
                  maxLength={100}
                  style={inputStyle}
                  required
                />
              </FieldGroup>

              <FieldGroup label="Date of Issue">
                <input
                  type="date"
                  value={form.dateOfIssue}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, dateOfIssue: e.target.value }))
                  }
                  style={inputStyle}
                  required
                />
              </FieldGroup>

              <FieldGroup label="Competent Authority">
                <input
                  type="text"
                  value={form.competentAuthority}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, competentAuthority: e.target.value }))
                  }
                  placeholder="e.g. DFFE / Western Cape DEADP"
                  maxLength={200}
                  style={inputStyle}
                  required
                />
              </FieldGroup>

              <FieldGroup label="Validity Start">
                <input
                  type="date"
                  value={form.validityStart}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, validityStart: e.target.value }))
                  }
                  style={inputStyle}
                  required
                />
              </FieldGroup>

              <FieldGroup label="Validity Expiry">
                <input
                  type="date"
                  value={form.validityExpiry}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, validityExpiry: e.target.value }))
                  }
                  style={inputStyle}
                  required
                />
              </FieldGroup>

              <FieldGroup label="Status">
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      status: e.target.value as AuthorizationStatus,
                    }))
                  }
                  style={inputStyle}
                >
                  {AUTHORIZATION_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </FieldGroup>
            </div>

            <FieldGroup label="Authorized Activities (one per line)">
              <textarea
                value={form.authorizedActivities}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, authorizedActivities: e.target.value }))
                }
                placeholder="Enter each authorized activity on a new line"
                rows={3}
                style={{
                  ...inputStyle,
                  height: 'auto',
                  padding: '10px 12px',
                  resize: 'vertical',
                }}
              />
            </FieldGroup>

            <div style={{ marginTop: 14 }}>
              <button
                type="submit"
                className="btn"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Shield size={14} aria-hidden="true" />
                Save Authorization
              </button>
            </div>
          </form>
        )}

        {/* Empty State */}
        {authorizations.length === 0 && !showForm && (
          <p
            style={{
              fontSize: 13,
              color: 'var(--muted)',
              fontStyle: 'italic',
              margin: 0,
            }}
          >
            No authorizations recorded. Add an authorization to begin tracking
            conditions and compliance.
          </p>
        )}
      </section>

      {/* Authorization Cards */}
      {authorizations.map((auth) => {
        const summary = calculateConditionSummary(auth.conditions);
        return (
          <AuthorizationCard
            key={auth.id}
            authorization={auth}
            summary={summary}
            onStatusChange={handleStatusChange}
            onAddCondition={handleAddCondition}
            onConditionChange={handleConditionChange}
          />
        );
      })}
    </div>
  );
}

// ─── Authorization Card ──────────────────────────────────────────────────────

interface AuthorizationCardProps {
  key?: React.Key;
  authorization: AuthorizationRecord;
  summary: AuthorizationConditionSummary;
  onStatusChange: (authId: string, status: AuthorizationStatus) => void;
  onAddCondition: (authId: string) => void;
  onConditionChange: (
    authId: string,
    conditionId: string,
    field: keyof AuthorizationCondition,
    value: string
  ) => void;
}

function AuthorizationCard({
  authorization,
  summary,
  onStatusChange,
  onAddCondition,
  onConditionChange,
}: AuthorizationCardProps) {
  return (
    <section className="panel">
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 14,
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div>
          <h2
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--ink)',
              margin: '0 0 4px 0',
            }}
          >
            {authorization.referenceNumber}
          </h2>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
            {authorization.competentAuthority} · Issued:{' '}
            {authorization.dateOfIssue} · Valid:{' '}
            {authorization.validityStart} to {authorization.validityExpiry}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className={getStatusChipClass(authorization.status)}>
            {AUTHORIZATION_STATUSES.find((s) => s.value === authorization.status)?.label ??
              authorization.status}
          </span>
          <select
            value={authorization.status}
            onChange={(e) =>
              onStatusChange(authorization.id, e.target.value as AuthorizationStatus)
            }
            style={{
              ...inputStyle,
              width: 'auto',
              height: 30,
              fontSize: 11,
              padding: '0 8px',
            }}
            aria-label="Change authorization status"
          >
            {AUTHORIZATION_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Authorized Activities */}
      {authorization.authorizedActivities.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <h3
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--muted)',
              textTransform: 'uppercase',
              letterSpacing: '.3px',
              margin: '0 0 6px 0',
            }}
          >
            Authorized Activities
          </h3>
          <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 12, color: 'var(--ink)', lineHeight: 1.7 }}>
            {authorization.authorizedActivities.map((activity, idx) => (
              <li key={idx}>{activity}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Condition Summary Mini Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <MiniStat label="Total" value={summary.total} color="var(--ink)" />
        <MiniStat label="Complied" value={summary.complied} color="var(--green)" />
        <MiniStat label="Outstanding" value={summary.outstanding} color="var(--amber)" />
        <MiniStat label="Overdue" value={summary.overdue} color="var(--red)" />
      </div>

      {/* Conditions Table */}
      {authorization.conditions.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Condition Text</th>
              <th>Responsible Party</th>
              <th>Deadline</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {authorization.conditions.map((condition) => (
              <tr key={condition.id}>
                <td
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 11,
                    color: 'var(--muted)',
                  }}
                >
                  {condition.conditionNumber}
                </td>
                <td>
                  <input
                    type="text"
                    value={condition.conditionText}
                    onChange={(e) =>
                      onConditionChange(
                        authorization.id,
                        condition.id,
                        'conditionText',
                        e.target.value
                      )
                    }
                    placeholder="Condition description"
                    maxLength={2000}
                    style={{ ...inputStyle, width: '100%', minWidth: 200 }}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={condition.responsibleParty}
                    onChange={(e) =>
                      onConditionChange(
                        authorization.id,
                        condition.id,
                        'responsibleParty',
                        e.target.value
                      )
                    }
                    placeholder="Responsible party"
                    style={{ ...inputStyle, width: '100%', minWidth: 120 }}
                  />
                </td>
                <td>
                  <input
                    type="date"
                    value={condition.complianceDeadline ?? ''}
                    onChange={(e) =>
                      onConditionChange(
                        authorization.id,
                        condition.id,
                        'complianceDeadline',
                        e.target.value
                      )
                    }
                    style={{ ...inputStyle, width: 'auto' }}
                  />
                </td>
                <td>
                  <select
                    value={condition.complianceStatus}
                    onChange={(e) =>
                      onConditionChange(
                        authorization.id,
                        condition.id,
                        'complianceStatus',
                        e.target.value
                      )
                    }
                    style={{
                      ...inputStyle,
                      width: 'auto',
                      color: getComplianceColor(condition.complianceStatus),
                      fontWeight: 600,
                      fontSize: 11,
                    }}
                    aria-label={`Compliance status for condition ${condition.conditionNumber}`}
                  >
                    {COMPLIANCE_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Add Condition Button */}
      <div style={{ marginTop: 12 }}>
        <button
          className="btn btn-secondary"
          onClick={() => onAddCondition(authorization.id)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
          }}
        >
          <Plus size={12} aria-hidden="true" />
          Add Condition
        </button>
      </div>
    </section>
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

interface MiniStatProps {
  label: string;
  value: number;
  color: string;
}

function MiniStat({ label, value, color }: MiniStatProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 14, fontWeight: 700, color }}>{value}</span>
      <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>
        {label}
      </span>
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

export default AuthorizationRegister;
