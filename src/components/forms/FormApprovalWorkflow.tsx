// ─── FormApprovalWorkflow Component ──────────────────────────────────────────
// Displays approval chain for a form instance with sequential approver statuses
// and approve/deny actions for the current approver in sequence.
// Requirements: 9.3

import React from 'react';
import { CheckCircle, XCircle, Clock } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface Approver {
  userId: string;
  name: string;
  role: string;
  status: 'pending' | 'approved' | 'denied';
}

interface Props {
  instanceId: string;
  approvers: Approver[];
  onApprove?: (approverId: string) => void;
  onDeny?: (approverId: string) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getStatusBadge(status: Approver['status']) {
  switch (status) {
    case 'approved':
      return {
        label: 'Approved',
        className: 'chip chip-approved',
        icon: <CheckCircle style={{ width: 12, height: 12 }} />,
      };
    case 'denied':
      return {
        label: 'Denied',
        className: 'chip chip-rejected',
        icon: <XCircle style={{ width: 12, height: 12 }} />,
      };
    case 'pending':
    default:
      return {
        label: 'Pending',
        className: 'chip chip-pending',
        icon: <Clock style={{ width: 12, height: 12 }} />,
      };
  }
}

/**
 * Finds the index of the current approver in sequence — the first pending approver
 * where all prior approvers have approved.
 */
function findCurrentApproverIndex(approvers: Approver[]): number {
  for (let i = 0; i < approvers.length; i++) {
    if (approvers[i].status === 'pending') {
      // Check all prior approvers are approved
      const allPriorApproved = approvers
        .slice(0, i)
        .every((a) => a.status === 'approved');
      if (allPriorApproved) return i;
      return -1; // Prior approvers haven't all approved yet
    }
  }
  return -1; // No pending approvers
}

// ── Component ────────────────────────────────────────────────────────────────

export default function FormApprovalWorkflow({
  instanceId: _instanceId,
  approvers,
  onApprove,
  onDeny,
}: Props) {
  const currentApproverIndex = findCurrentApproverIndex(approvers);

  if (approvers.length === 0) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: '32px 22px' }}>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          No approval workflow configured for this form.
        </p>
      </div>
    );
  }

  return (
    <div className="panel" style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <CheckCircle style={{ width: 16, height: 16, color: 'var(--deep)' }} />
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
          Approval Workflow
        </h2>
        <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>
          {approvers.filter((a) => a.status === 'approved').length}/{approvers.length} approved
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {approvers.map((approver, index) => {
          const badge = getStatusBadge(approver.status);
          const isCurrentApprover = index === currentApproverIndex;

          return (
            <div
              key={approver.userId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 0',
                borderTop: index > 0 ? '1px solid var(--border)' : 'none',
              }}
            >
              {/* Step indicator */}
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 600,
                  flexShrink: 0,
                  background:
                    approver.status === 'approved'
                      ? 'rgba(74,222,128,.15)'
                      : approver.status === 'denied'
                        ? 'rgba(217,87,71,.1)'
                        : isCurrentApprover
                          ? 'var(--aqua)'
                          : 'rgba(16,32,51,.04)',
                  color:
                    approver.status === 'approved'
                      ? 'var(--green)'
                      : approver.status === 'denied'
                        ? 'var(--red)'
                        : isCurrentApprover
                          ? 'var(--deep)'
                          : 'var(--muted)',
                  border: isCurrentApprover ? '1px solid var(--teal)' : '1px solid var(--border)',
                }}
              >
                {index + 1}
              </div>

              {/* Approver info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--ink)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {approver.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                  {approver.role}
                </div>
              </div>

              {/* Status badge */}
              <span className={badge.className} style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                {badge.icon}
                {badge.label}
              </span>

              {/* Action buttons (only for current approver in sequence) */}
              {isCurrentApprover && (
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    className="btn"
                    onClick={() => onApprove?.(approver.userId)}
                    style={{
                      fontSize: 11,
                      padding: '5px 12px',
                      height: 28,
                    }}
                  >
                    Approve
                  </button>
                  <button
                    className="btn-danger"
                    onClick={() => onDeny?.(approver.userId)}
                    style={{
                      fontSize: 11,
                      padding: '5px 12px',
                      height: 28,
                      border: '1px solid rgba(217,87,71,.18)',
                      background: 'rgba(217,87,71,.06)',
                      color: 'var(--red)',
                      borderRadius: 8,
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    Deny
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
