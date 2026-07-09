// ExpenseApproval — Expense approval queue for managers/firm admins
// Requirements: 2.2, 2.3, 2.4, 15.5

import React, { useState } from 'react';
import { Receipt, CheckCircle, XCircle, Clock } from 'lucide-react';
import type { UserProfile } from '@/types';
import type { ExpenseClaim, ExpenseCategory } from '@/services/practiceManagement/types';

export interface ExpenseApprovalProps {
  user: UserProfile;
}

// Demo data for rendering — in production these come from the expense manager service
const MOCK_PENDING_CLAIMS: ExpenseClaim[] = [
  {
    id: 'exp-001',
    firmId: 'firm-1',
    userId: 'user-2',
    projectId: 'proj-alpha',
    description: 'Site visit travel — Sandton to Midrand return',
    amountCents: 48500,
    date: '2025-07-02',
    category: 'travel',
    expenseType: 'disbursement',
    receiptUrl: '/receipts/exp-001.pdf',
    status: 'pending_approval',
    submittedAt: '2025-07-03T08:30:00Z',
    invoiced: false,
    createdAt: '2025-07-02T16:00:00Z',
    updatedAt: '2025-07-03T08:30:00Z',
  },
  {
    id: 'exp-002',
    firmId: 'firm-1',
    userId: 'user-3',
    projectId: 'proj-beta',
    description: 'Printing A1 presentation boards for client meeting',
    amountCents: 125000,
    date: '2025-07-01',
    category: 'printing',
    expenseType: 'reimbursable',
    status: 'pending_approval',
    submittedAt: '2025-07-01T14:15:00Z',
    invoiced: false,
    createdAt: '2025-07-01T12:00:00Z',
    updatedAt: '2025-07-01T14:15:00Z',
  },
  {
    id: 'exp-003',
    firmId: 'firm-1',
    userId: 'user-4',
    projectId: 'proj-alpha',
    description: 'Courier — structural drawings to engineer',
    amountCents: 22000,
    date: '2025-06-30',
    category: 'courier',
    expenseType: 'disbursement',
    status: 'pending_approval',
    submittedAt: '2025-06-30T17:00:00Z',
    invoiced: false,
    createdAt: '2025-06-30T15:30:00Z',
    updatedAt: '2025-06-30T17:00:00Z',
  },
];

// Mock user display names
const USER_NAMES: Record<string, string> = {
  'user-2': 'Sarah Nkosi',
  'user-3': 'James van der Berg',
  'user-4': 'Thabo Mokoena',
};

const PROJECT_NAMES: Record<string, string> = {
  'proj-alpha': 'Sandton Office Tower',
  'proj-beta': 'Cape Town Waterfront Residential',
};

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  travel: 'Travel',
  printing: 'Printing',
  courier: 'Courier',
  accommodation: 'Accommodation',
  meals: 'Meals',
  other: 'Other',
};

/**
 * ExpenseApproval — Expense approval queue for firm admins / project leads.
 * Displays pending expense claims with approve/reject actions.
 * Renders inside AppShell content area using CSS token classes.
 */
export function ExpenseApproval({ user }: ExpenseApprovalProps) {
  const [claims, setClaims] = useState<ExpenseClaim[]>(MOCK_PENDING_CLAIMS);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);

  const pendingClaims = claims.filter((c) => c.status === 'pending_approval');
  const processedClaims = claims.filter((c) => c.status !== 'pending_approval');

  const totalPendingCents = pendingClaims.reduce((sum, c) => sum + c.amountCents, 0);

  async function handleApprove(claimId: string) {
    setProcessing(claimId);
    try {
      // In production: await expenseManagerService.approveClaim(claimId, user.uid);
      await new Promise((resolve) => setTimeout(resolve, 400));
      setClaims((prev) =>
        prev.map((c) =>
          c.id === claimId
            ? { ...c, status: 'approved' as const, approvedBy: user.uid, approvedAt: new Date().toISOString() }
            : c
        )
      );
    } finally {
      setProcessing(null);
    }
  }

  async function handleReject(claimId: string) {
    if (!rejectReason.trim()) return;
    setProcessing(claimId);
    try {
      // In production: await expenseManagerService.rejectClaim(claimId, user.uid, rejectReason);
      await new Promise((resolve) => setTimeout(resolve, 400));
      setClaims((prev) =>
        prev.map((c) =>
          c.id === claimId
            ? {
                ...c,
                status: 'rejected' as const,
                rejectedBy: user.uid,
                rejectedAt: new Date().toISOString(),
                rejectionReason: rejectReason,
              }
            : c
        )
      );
      setRejectingId(null);
      setRejectReason('');
    } finally {
      setProcessing(null);
    }
  }

  function formatAmount(cents: number): string {
    return `R ${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-ZA', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Hero */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">EXPENSES</div>
            <h1>Expense Approvals</h1>
            <p className="sub">Review and action pending expense claims</p>
          </div>
        </div>
        <div className="hero-pills">
          <span className="pill">
            <span className="dot"></span> {pendingClaims.length} Pending
          </span>
        </div>
      </div>

      {/* Stat Row */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--amber)' }}>
            {pendingClaims.length}
          </div>
          <div className="stat-label">Awaiting Review</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{formatAmount(totalPendingCents)}</div>
          <div className="stat-label">Total Pending</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--green)' }}>
            {processedClaims.filter((c) => c.status === 'approved').length}
          </div>
          <div className="stat-label">Approved Today</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--red)' }}>
            {processedClaims.filter((c) => c.status === 'rejected').length}
          </div>
          <div className="stat-label">Rejected</div>
        </div>
      </div>

      {/* Pending Claims Table */}
      <section className="panel">
        <h2
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '.5px',
            color: 'var(--deep)',
            margin: '0 0 16px 0',
          }}
        >
          Pending Claims
        </h2>

        {pendingClaims.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '24px 0' }}>
            No expense claims awaiting approval.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Submitted By</th>
                <th>Project</th>
                <th>Description</th>
                <th>Category</th>
                <th>Type</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Receipt</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingClaims.map((claim) => (
                <tr key={claim.id}>
                  <td style={{ fontWeight: 500 }}>
                    {USER_NAMES[claim.userId] || claim.userId}
                  </td>
                  <td>{PROJECT_NAMES[claim.projectId] || claim.projectId}</td>
                  <td style={{ maxWidth: 200 }}>
                    <span
                      style={{
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={claim.description}
                    >
                      {claim.description}
                    </span>
                  </td>
                  <td>
                    <span className="chip chip-draft">
                      {CATEGORY_LABELS[claim.category]}
                    </span>
                  </td>
                  <td>
                    <span
                      style={{
                        fontSize: 11,
                        color: claim.expenseType === 'disbursement' ? 'var(--deep)' : 'var(--muted)',
                        fontWeight: 500,
                      }}
                    >
                      {claim.expenseType === 'disbursement' ? 'Disbursement' : 'Reimbursable'}
                    </span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(claim.date)}</td>
                  <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {formatAmount(claim.amountCents)}
                  </td>
                  <td>
                    {claim.receiptUrl ? (
                      <span
                        style={{
                          fontSize: 11,
                          color: 'var(--teal)',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                        }}
                      >
                        View
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>
                    )}
                  </td>
                  <td>
                    {rejectingId === claim.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 }}>
                        <input
                          type="text"
                          placeholder="Rejection reason..."
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          style={{
                            width: '100%',
                            height: 28,
                            padding: '0 8px',
                            fontSize: 12,
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            outline: 'none',
                            fontFamily: 'var(--font)',
                          }}
                          autoFocus
                        />
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            className="btn-danger"
                            style={{
                              fontSize: 11,
                              padding: '4px 10px',
                              borderRadius: 6,
                              border: '1px solid rgba(217,87,71,.18)',
                              background: 'rgba(217,87,71,.06)',
                              color: 'var(--red)',
                              cursor: 'pointer',
                              fontWeight: 600,
                            }}
                            onClick={() => handleReject(claim.id)}
                            disabled={!rejectReason.trim() || processing === claim.id}
                          >
                            Confirm
                          </button>
                          <button
                            className="btn-secondary"
                            style={{
                              fontSize: 11,
                              padding: '4px 10px',
                              borderRadius: 6,
                              border: '1px solid var(--border)',
                              background: 'rgba(255,255,255,.7)',
                              color: 'var(--ink)',
                              cursor: 'pointer',
                            }}
                            onClick={() => {
                              setRejectingId(null);
                              setRejectReason('');
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn"
                          style={{
                            fontSize: 11,
                            padding: '4px 10px',
                            borderRadius: 6,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            cursor: processing === claim.id ? 'not-allowed' : 'pointer',
                            opacity: processing === claim.id ? 0.6 : 1,
                          }}
                          onClick={() => handleApprove(claim.id)}
                          disabled={processing === claim.id}
                          title="Approve this expense claim"
                        >
                          <CheckCircle size={12} aria-hidden="true" />
                          Approve
                        </button>
                        <button
                          style={{
                            fontSize: 11,
                            padding: '4px 10px',
                            borderRadius: 6,
                            border: '1px solid rgba(217,87,71,.18)',
                            background: 'rgba(217,87,71,.06)',
                            color: 'var(--red)',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontWeight: 600,
                            fontFamily: 'var(--font)',
                          }}
                          onClick={() => setRejectingId(claim.id)}
                          disabled={processing === claim.id}
                          title="Reject this expense claim"
                        >
                          <XCircle size={12} aria-hidden="true" />
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Recently Processed */}
      {processedClaims.length > 0 && (
        <section className="panel">
          <h2
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '.5px',
              color: 'var(--deep)',
              margin: '0 0 16px 0',
            }}
          >
            Recently Processed
          </h2>
          <table className="table">
            <thead>
              <tr>
                <th>Claimant</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {processedClaims.map((claim) => (
                <tr key={claim.id}>
                  <td>{USER_NAMES[claim.userId] || claim.userId}</td>
                  <td>{claim.description}</td>
                  <td style={{ fontWeight: 600 }}>{formatAmount(claim.amountCents)}</td>
                  <td>
                    {claim.status === 'approved' ? (
                      <span className="chip chip-approved">Approved</span>
                    ) : (
                      <span className="chip chip-rejected">Rejected</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

export default ExpenseApproval;
