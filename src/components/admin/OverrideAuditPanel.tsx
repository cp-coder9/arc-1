/**
 * OverrideAuditPanel — Admin sub-component for viewing admin override audit records.
 *
 * Displays override records showing: admin UID, target action, project ID,
 * reason, and timestamp. Adds a visual flag indicating whether the override
 * was performed by a different admin than the current reviewer.
 *
 * Records are IMMUTABLE — display-only, no edit/delete buttons.
 *
 * Follows workspace-template pattern: .panel > h2 + .table
 * Uses CSS custom properties only — NO hardcoded hex values.
 * Uses lucide-react for icons.
 *
 * Requirements: 9.9, 9.10, 9.11
 * @module admin/OverrideAuditPanel
 */

import React, { useEffect, useState } from 'react';
import { getDocs, limit, query } from 'firebase/firestore';
import { AlertTriangle, Eye, ShieldAlert, UserCheck, UserX } from 'lucide-react';
import type { UserProfile } from '@/types';
import { getDemoCol } from '../../demo-seed/demoFirestore';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OverrideAuditRecord {
  id: string;
  adminUid: string;
  adminEmail?: string;
  targetAction: string;
  projectId: string;
  reason: string;
  timestampIso: string;
  /** Whether the override bypasses a financial or professional gate */
  gateType: 'financial' | 'professional';
}

interface Props {
  user: UserProfile;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OverrideAuditPanel({ user }: Props) {
  const [records, setRecords] = useState<OverrideAuditRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Load override audit records from Firestore
  useEffect(() => {
    async function loadOverrideRecords() {
      setLoading(true);
      try {
        const overridesRef = getDemoCol('admin_override_audit');
        const q = query(overridesRef, limit(500));
        const snapshot = await getDocs(q);
        const loaded: OverrideAuditRecord[] = snapshot.docs.map((doc) => {
          const data = doc.data() as Record<string, unknown>;
          return {
            id: doc.id,
            adminUid: (data.adminUid as string) || '',
            adminEmail: data.adminEmail as string | undefined,
            targetAction: (data.targetAction as string) || 'unknown',
            projectId: (data.projectId as string) || '',
            reason: (data.reason as string) || '',
            timestampIso: (data.timestampIso as string) || (data.timestamp as string) || '',
            gateType: (data.gateType as 'financial' | 'professional') || 'financial',
          };
        });
        // Sort by most recent first
        loaded.sort((a, b) => b.timestampIso.localeCompare(a.timestampIso));
        setRecords(loaded);
      } catch (err) {
        console.warn('Failed to load override audit records:', err);
        // Fallback to empty — collection may not exist yet
        setRecords([]);
      } finally {
        setLoading(false);
      }
    }
    loadOverrideRecords();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Override Audit Log Panel */}
      <section className="panel">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldAlert size={16} style={{ color: 'var(--teal)' }} />
          Admin Override Audit Log
        </h2>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
          Immutable records of admin overrides that bypass financial or professional gates.
          Records cannot be modified or deleted after creation.
        </p>

        {/* Stats row */}
        <div className="stat-row" style={{ marginBottom: 14 }}>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--ink)' }}>{records.length}</div>
            <div className="stat-label">Total Overrides</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--amber)' }}>
              {records.filter((r) => r.gateType === 'financial').length}
            </div>
            <div className="stat-label">Financial Gate</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--deep)' }}>
              {records.filter((r) => r.gateType === 'professional').length}
            </div>
            <div className="stat-label">Professional Gate</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--red)' }}>
              {records.filter((r) => r.adminUid === user.uid).length}
            </div>
            <div className="stat-label">Self-Overrides</div>
          </div>
        </div>

        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--muted)', padding: '16px 0', textAlign: 'center' }}>
            Loading override records…
          </p>
        ) : records.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--muted)', padding: '16px 0', textAlign: 'center' }}>
            No admin override records found. Overrides are logged when an admin bypasses a financial or professional gate.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Overriding Admin</th>
                <th>Target Action</th>
                <th>Project ID</th>
                <th>Reason</th>
                <th>Gate Type</th>
                <th>Reviewer Flag</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => {
                const isDifferentAdmin = record.adminUid !== user.uid;
                return (
                  <tr key={record.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {record.timestampIso
                        ? new Date(record.timestampIso).toLocaleString()
                        : '—'}
                    </td>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                        {record.adminUid.slice(0, 8)}…
                      </span>
                      {record.adminEmail && (
                        <>
                          <br />
                          <span style={{ fontSize: 11 }}>{record.adminEmail}</span>
                        </>
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>{record.targetAction}</td>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                        {record.projectId ? record.projectId.slice(0, 12) + '…' : '—'}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {record.reason}
                    </td>
                    <td>
                      <GateTypeChip gateType={record.gateType} />
                    </td>
                    <td>
                      <SeparationOfDutyFlag isDifferentAdmin={isDifferentAdmin} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Immutability Notice */}
      <section className="panel" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Eye size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
          Override records are immutable and cannot be modified or deleted after creation.
          This panel is read-only. Any attempt to alter records will be logged as a tamper attempt.
        </p>
      </section>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * Visual flag indicating whether override was performed by a different admin than the reviewer.
 * Requirement 9.11: display flag indicating whether override was performed by different admin.
 */
function SeparationOfDutyFlag({ isDifferentAdmin }: { isDifferentAdmin: boolean }) {
  if (isDifferentAdmin) {
    return (
      <span
        className="chip-approved"
        style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}
        title="Override performed by a different admin than the current reviewer"
      >
        <UserCheck size={12} />
        Different admin
      </span>
    );
  }
  return (
    <span
      className="chip-rejected"
      style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}
      title="Self-override — same admin as reviewer"
    >
      <UserX size={12} />
      Self-override
    </span>
  );
}

/**
 * Chip indicating the type of gate that was overridden.
 */
function GateTypeChip({ gateType }: { gateType: 'financial' | 'professional' }) {
  if (gateType === 'financial') {
    return (
      <span className="chip-pending" style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <AlertTriangle size={11} />
        Financial
      </span>
    );
  }
  return (
    <span className="chip-draft" style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <ShieldAlert size={11} />
      Professional
    </span>
  );
}
