// ─── FormAuditViewer Component ───────────────────────────────────────────────
// Displays a chronological timeline of audit events for a form instance.
// Uses getAuditTrail service for data fetching (within 3 seconds response).
// Requirements: 6.6, 8.5, 9.3

import React, { useState, useEffect, useCallback } from 'react';
import { Shield, RefreshCw } from 'lucide-react';
import type { AuditEvent, AuditEventType } from '@/services/forms/formTypes';
import { getAuditTrail } from '@/services/forms/formAuditService';

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  instanceId: string;
}

// ── Event Type Config ────────────────────────────────────────────────────────

const EVENT_TYPE_CONFIG: Record<AuditEventType, { label: string; dotClass: string }> = {
  created: { label: 'Form Created', dotClass: 'audit-dot' },
  field_modified: { label: 'Field Modified', dotClass: 'audit-dot' },
  exported: { label: 'PDF Exported', dotClass: 'audit-dot export' },
  signed: { label: 'Signature Applied', dotClass: 'audit-dot sign' },
  shared: { label: 'Collaborator Added', dotClass: 'audit-dot share' },
  approval_granted: { label: 'Approval Granted', dotClass: 'audit-dot export' },
  approval_denied: { label: 'Approval Denied', dotClass: 'audit-dot deny' },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(timestamp: unknown): string {
  let ms: number;

  if (timestamp && typeof timestamp === 'object' && 'toMillis' in (timestamp as object)) {
    ms = (timestamp as { toMillis(): number }).toMillis();
  } else if (
    timestamp &&
    typeof timestamp === 'object' &&
    '_seconds' in (timestamp as object)
  ) {
    ms = (timestamp as { _seconds: number })._seconds * 1000;
  } else {
    return 'Unknown';
  }

  const date = new Date(ms);
  return date.toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildEventDescription(event: AuditEvent): string {
  const details = event.details || {};

  switch (event.eventType) {
    case 'created':
      return `${details.templateId || 'Template'}${details.projectId ? ` · Project ${details.projectId}` : ''}`;
    case 'field_modified': {
      const fieldLabel = (details.fieldLabel as string) || (details.fieldId as string) || 'Field';
      const prev = (details.previousValue as string) || '(empty)';
      const next = (details.newValue as string) || '(empty)';
      return `${fieldLabel}: "${prev}" → "${next}"`;
    }
    case 'exported':
      return `Format: ${(details.format as string) || 'PDF'}`;
    case 'signed':
      return `Role: ${(details.role as string) || 'Signatory'}`;
    case 'shared':
      return `User ${(details.collaboratorId as string) || ''} granted edit access`;
    case 'approval_granted':
      return 'Approval granted';
    case 'approval_denied':
      return `Denied${details.reason ? `: ${details.reason}` : ''}`;
    default:
      return '';
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function FormAuditViewer({ instanceId }: Props) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAuditTrail = useCallback(async () => {
    if (!instanceId) return;
    setLoading(true);
    setError(null);
    try {
      const trail = await getAuditTrail(instanceId);
      setEvents(trail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit trail');
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    fetchAuditTrail();
  }, [fetchAuditTrail]);

  // ── Loading State ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: '32px 22px' }}>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading audit trail...</p>
      </div>
    );
  }

  // ── Error State ────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: '32px 22px' }}>
        <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>
        <button className="btn" onClick={fetchAuditTrail} style={{ marginTop: 12 }}>
          <RefreshCw style={{ width: 14, height: 14, marginRight: 6 }} />
          Retry
        </button>
      </div>
    );
  }

  // ── Empty State ────────────────────────────────────────────────────────────

  if (events.length === 0) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: '48px 22px' }}>
        <Shield style={{ width: 40, height: 40, color: 'var(--muted)', margin: '0 auto 12px' }} />
        <p style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 500 }}>No events recorded</p>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 6 }}>
          Actions on this form will appear here as an audit trail.
        </p>
      </div>
    );
  }

  // ── Timeline ───────────────────────────────────────────────────────────────

  return (
    <div className="panel" style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Shield style={{ width: 16, height: 16, color: 'var(--deep)' }} />
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
          Audit Trail
        </h2>
        <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>
          {events.length} event{events.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {events.map((event) => {
          const config = EVENT_TYPE_CONFIG[event.eventType] || {
            label: event.eventType,
            dotClass: 'audit-dot',
          };

          return (
            <div key={event.id} className="audit-item">
              <div className={config.dotClass} />
              <div className="audit-content">
                <div className="audit-text">
                  <b>{config.label}</b>
                  {' — '}
                  {buildEventDescription(event)}
                </div>
                <div className="audit-date">
                  {event.userName || event.userId} · {formatTimestamp(event.timestamp)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
