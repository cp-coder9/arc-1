/**
 * Project Command Centre — ApprovalGate Component
 *
 * Enforces the Authority Matrix by verifying that the current user holds a
 * required role before allowing action execution. For multi-party actions,
 * displays approval status badges and tracks signatory progress.
 *
 * @module commandCentre/ApprovalGate
 * @validates Requirements 17.1, 17.2
 */

import type { ReactNode } from 'react';
import type { UserRole } from '@/types';
import {
  AUTHORITY_MATRIX,
  getAuthorityRule,
  isRoleAuthorized,
  type ApprovalRequest,
  type AuthorityRule,
} from '@/services/commandCentre/approvalStateMachine';

// ── Types ────────────────────────────────────────────────────────────────────

interface ApprovalGateProps {
  /** The action type being attempted. */
  actionType: string;
  /** The current user's role. */
  userRole: UserRole;
  /** Optional: existing approval request state (for multi-party display). */
  approvalRequest?: ApprovalRequest;
  /** Callback when the action is allowed to proceed. */
  onProceed?: () => void;
  /** Child content to render when authorized. */
  children?: ReactNode;
}

// ── Helper: Human-readable role labels ───────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  quantity_surveyor: 'Quantity Surveyor',
  architect: 'Architect',
  client: 'Client',
  site_manager: 'Site Manager',
  bep: 'Principal Agent',
  contractor: 'Contractor',
  subcontractor: 'Subcontractor',
  supplier: 'Supplier',
  engineer: 'Engineer',
  developer: 'Developer',
  firm_admin: 'Firm Admin',
  platform_admin: 'Platform Admin',
  admin: 'Admin',
  freelancer: 'Freelancer',
  town_planner: 'Town Planner',
  energy_professional: 'Energy Professional',
  fire_engineer: 'Fire Engineer',
};

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ApprovalGate({
  actionType,
  userRole,
  approvalRequest,
  onProceed,
  children,
}: ApprovalGateProps) {
  const rule = getAuthorityRule(actionType);

  // ── Unknown action type — allow through (no authority rule defined) ─────
  if (!rule) {
    return <>{children}</>;
  }

  const isAuthorized = isRoleAuthorized(actionType, userRole);

  // ── Denied: User role not in authority matrix ──────────────────────────
  if (!isAuthorized) {
    return (
      <div className="panel" style={{ borderColor: 'var(--red)', background: 'rgba(217,87,71,.04)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 style={{ fontSize: 13, color: 'var(--red)', fontWeight: 600, margin: 0 }}>
            Action Not Authorised
          </h2>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
            Your role ({roleLabel(userRole)}) does not have authority to perform this action.
          </p>
          <div style={{ fontSize: 11, color: 'var(--ink)', margin: 0 }}>
            <strong>Required role{rule.requiredRoles.length > 1 ? 's' : ''}:</strong>{' '}
            {rule.requiredRoles.map(roleLabel).join(rule.multiParty ? ' + ' : ' or ')}
          </div>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            This action requires approval from the listed role(s). You can request
            authorisation via your project inbox.
          </p>
        </div>
      </div>
    );
  }

  // ── Multi-party: Show approval status badges ───────────────────────────
  if (rule.multiParty && approvalRequest) {
    const totalRequired = approvalRequest.requiredSignatories.length;
    const approvedCount = approvalRequest.signatories.filter((s) => s.status === 'approved').length;
    const isFullyApproved = approvedCount >= totalRequired;
    const isRejected = approvalRequest.status === 'rejected';
    const isExpired = approvalRequest.status === 'expired';

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Status summary */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            className="pill"
            style={{
              color: isRejected
                ? 'var(--red)'
                : isExpired
                  ? 'var(--amber)'
                  : isFullyApproved
                    ? 'var(--green)'
                    : 'var(--teal)',
              background: isRejected
                ? 'rgba(217,87,71,.08)'
                : isExpired
                  ? 'rgba(245,166,35,.08)'
                  : isFullyApproved
                    ? 'rgba(74,222,128,.08)'
                    : 'rgba(25,183,176,.08)',
            }}
          >
            <span className="dot"></span>
            {isRejected
              ? 'Rejected'
              : isExpired
                ? 'Expired'
                : isFullyApproved
                  ? 'Approved'
                  : `${approvedCount}/${totalRequired} Approvals`}
          </span>
        </div>

        {/* Signatory badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {approvalRequest.signatories.map((signatory, idx) => {
            const statusColor =
              signatory.status === 'approved'
                ? 'var(--green)'
                : signatory.status === 'rejected'
                  ? 'var(--red)'
                  : signatory.status === 'expired'
                    ? 'var(--amber)'
                    : 'var(--muted)';

            return (
              <span
                key={`${signatory.role}-${idx}`}
                className="chip"
                style={{
                  fontSize: 10,
                  padding: '2px 8px',
                  borderRadius: 6,
                  border: `1px solid ${statusColor}`,
                  color: statusColor,
                  background: 'rgba(255,255,255,.6)',
                }}
              >
                {roleLabel(signatory.role)} — {signatory.status}
              </span>
            );
          })}
        </div>

        {/* Render children (action button) only if fully approved */}
        {isFullyApproved && children}
      </div>
    );
  }

  // ── Authorized (single-party or no existing request) — render children ──
  return <>{children}</>;
}

// ── Utility Exports ──────────────────────────────────────────────────────────

export { AUTHORITY_MATRIX, getAuthorityRule, isRoleAuthorized };
