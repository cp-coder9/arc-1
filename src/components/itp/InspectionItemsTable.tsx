import React from 'react';
import type { InspectionItem, InspectionType, InspectionItemStatus } from '@/services/itpTypes';
import type { UserProfile } from '@/types';

export interface InspectionItemsTableProps {
  user: UserProfile;
  items: InspectionItem[];
  onItemSelect?: (item: InspectionItem) => void;
}

/** Maps inspection type to chip styling */
function getTypeChip(type: InspectionType): { label: string; color: string; bg: string; border: string } {
  switch (type) {
    case 'hold_point':
      return { label: 'HOLD', color: 'var(--red)', bg: 'rgba(217,87,71,.08)', border: 'rgba(217,87,71,.18)' };
    case 'witness_point':
      return { label: 'WITNESS', color: 'var(--amber)', bg: 'rgba(245,166,35,.08)', border: 'rgba(245,166,35,.18)' };
    case 'surveillance':
      return { label: 'SURV', color: 'var(--muted)', bg: 'rgba(16,32,51,.04)', border: 'var(--border)' };
  }
}

/** Maps inspection item status to chip class */
function getStatusChipClass(status: InspectionItemStatus): string {
  switch (status) {
    case 'passed':
    case 'conditional_accepted':
    case 'ncr_resolved':
      return 'chip chip-approved';
    case 'pending':
    case 'review_required':
      return 'chip chip-draft';
    case 'in_progress':
    case 'conditional':
      return 'chip chip-needs_decision';
    case 'failed':
      return 'chip chip-rejected';
    default:
      return 'chip chip-draft';
  }
}

function formatStatus(status: InspectionItemStatus): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * InspectionItemsTable — Ordered list of inspection items with status badges,
 * type indicators, specification references, inspector roles, and NCR links.
 *
 * Requirements: 2.1, 7.5
 */
export default function InspectionItemsTable({ user, items, onItemSelect }: InspectionItemsTableProps) {
  if (items.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>
        <p style={{ fontSize: 13 }}>No inspection items defined yet.</p>
      </div>
    );
  }

  return (
    <table className="table">
      <thead>
        <tr>
          <th>#</th>
          <th>Type</th>
          <th>Title</th>
          <th>Spec Ref</th>
          <th>Inspector</th>
          <th>Status</th>
          <th>NCR</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const typeChip = getTypeChip(item.inspectionType);
          const isBlocked = item.status === 'pending' && item.inspectionType !== 'hold_point';

          return (
            <tr
              key={item.id}
              style={{ cursor: onItemSelect ? 'pointer' : undefined }}
              onClick={() => onItemSelect?.(item)}
            >
              <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)', width: 36 }}>
                {item.sequenceNumber}
              </td>
              <td>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    color: typeChip.color,
                    background: typeChip.bg,
                    border: `1px solid ${typeChip.border}`,
                    borderRadius: 99,
                  }}
                >
                  {typeChip.label}
                </span>
              </td>
              <td style={{ fontWeight: 500, color: 'var(--ink)', maxWidth: 240 }}>
                {item.title}
              </td>
              <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                {item.specificationReference}
              </td>
              <td style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'capitalize' }}>
                {item.responsibleInspectorRole.replace(/_/g, ' ')}
              </td>
              <td>
                {isBlocked ? (
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      fontSize: 10,
                      fontWeight: 600,
                      color: 'var(--muted)',
                      background: 'rgba(16,32,51,.04)',
                      border: '1px solid var(--border)',
                      borderRadius: 99,
                    }}
                  >
                    Blocked
                  </span>
                ) : (
                  <span className={getStatusChipClass(item.status)}>
                    {formatStatus(item.status)}
                  </span>
                )}
              </td>
              <td>
                {item.ncrId ? (
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--red)', fontFamily: 'monospace' }}>
                    {item.ncrId}
                  </span>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
