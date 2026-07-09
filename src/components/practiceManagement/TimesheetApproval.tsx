/**
 * TimesheetApproval — Approval queue for managers.
 *
 * Displays pending timesheet submissions with approve/reject actions.
 * Shows submitter name, week, total hours, and total value for each submission.
 *
 * Follows the Workspace Template pattern: Hero → Stat Row → Panel (table).
 * Uses Architex UI token system (var(--teal), var(--ink), etc.) and
 * component classes (.panel, .pill, .btn, .table).
 *
 * Requirements: 1.4, 1.5, 15.5
 */

import React, { useState, useMemo } from 'react';
import { CheckCircle, XCircle, Clock, Users } from 'lucide-react';
import type { UserProfile } from '@/types';
import type { TimesheetSubmission } from '@/services/practiceManagement/types';
import {
  approveSubmission,
  rejectSubmission,
  getSubmissionsForApproval,
} from '@/services/practiceManagement/timesheetEngineService';

interface Props {
  user: UserProfile;
}

// ─── Mock pending submissions for initial render ────────────────────────────

const MOCK_SUBMISSIONS: TimesheetSubmission[] = [
  {
    id: 'sub_001',
    firmId: 'firm_01',
    userId: 'user_jm',
    weekStartDate: '2025-06-09',
    weekEndDate: '2025-06-15',
    entryIds: ['e1', 'e2', 'e3'],
    status: 'pending_approval',
    submittedAt: '2025-06-15T17:30:00Z',
    totalHours: 38.5,
    totalValueCents: 1925000,
    createdAt: '2025-06-09T08:00:00Z',
    updatedAt: '2025-06-15T17:30:00Z',
  },
  {
    id: 'sub_002',
    firmId: 'firm_01',
    userId: 'user_km',
    weekStartDate: '2025-06-09',
    weekEndDate: '2025-06-15',
    entryIds: ['e4', 'e5'],
    status: 'pending_approval',
    submittedAt: '2025-06-15T16:00:00Z',
    totalHours: 42,
    totalValueCents: 1680000,
    createdAt: '2025-06-09T08:00:00Z',
    updatedAt: '2025-06-15T16:00:00Z',
  },
  {
    id: 'sub_003',
    firmId: 'firm_01',
    userId: 'user_tn',
    weekStartDate: '2025-06-02',
    weekEndDate: '2025-06-08',
    entryIds: ['e6', 'e7', 'e8', 'e9'],
    status: 'pending_approval',
    submittedAt: '2025-06-08T18:00:00Z',
    totalHours: 35,
    totalValueCents: 1050000,
    createdAt: '2025-06-02T08:00:00Z',
    updatedAt: '2025-06-08T18:00:00Z',
  },
];

const MOCK_USER_NAMES: Record<string, string> = {
  user_jm: 'James Mokoena',
  user_km: 'Karen Mthembu',
  user_tn: 'Thabo Nkosi',
};

export default function TimesheetApproval({ user }: Props) {
  const [submissions, setSubmissions] = useState<TimesheetSubmission[]>(MOCK_SUBMISSIONS);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);

  const firmId = user.primaryFirmId ?? 'firm_01';

  const pendingSubmissions = useMemo(
    () => getSubmissionsForApproval(submissions, firmId),
    [submissions, firmId],
  );

  const totalPendingHours = useMemo(
    () => pendingSubmissions.reduce((sum, s) => sum + s.totalHours, 0),
    [pendingSubmissions],
  );

  const totalPendingValue = useMemo(
    () => pendingSubmissions.reduce((sum, s) => sum + s.totalValueCents, 0),
    [pendingSubmissions],
  );

  const handleApprove = (submission: TimesheetSubmission) => {
    setProcessing(submission.id);
    try {
      const result = approveSubmission(submission, user.uid, []);
      setSubmissions((prev) =>
        prev.map((s) => (s.id === submission.id ? result.submission : s)),
      );
    } catch {
      // In production, show toast error
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = (submission: TimesheetSubmission) => {
    if (!rejectReason.trim()) return;
    setProcessing(submission.id);
    try {
      const result = rejectSubmission(submission, user.uid, rejectReason, []);
      setSubmissions((prev) =>
        prev.map((s) => (s.id === submission.id ? result.submission : s)),
      );
      setRejectingId(null);
      setRejectReason('');
    } catch {
      // In production, show toast error
    } finally {
      setProcessing(null);
    }
  };

  const formatCurrency = (cents: number) => {
    return `R ${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 0 })}`;
  };

  const formatWeek = (weekStart: string) => {
    const date = new Date(weekStart);
    return date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getSubmitterName = (userId: string) => {
    return MOCK_USER_NAMES[userId] ?? userId;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Hero */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">PRACTICE MANAGEMENT</div>
            <h1>Timesheet Approvals</h1>
            <p className="sub">
              Review and approve pending timesheet submissions from your team
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className="pill">
            <span className="dot"></span> {pendingSubmissions.length} Pending
          </span>
          <span className="pill">
            <span className="dot"></span> {user.displayName}
          </span>
        </div>
      </div>

      {/* Stat Row */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--amber)' }}>
            {pendingSubmissions.length}
          </div>
          <div className="stat-label">Pending Approvals</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalPendingHours.toFixed(1)}h</div>
          <div className="stat-label">Total Hours</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--deep)' }}>
            {formatCurrency(totalPendingValue)}
          </div>
          <div className="stat-label">Total Value</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            <Users size={18} style={{ color: 'var(--teal)' }} />
          </div>
          <div className="stat-label">Team Members</div>
        </div>
      </div>

      {/* Approval Queue Panel */}
      <section className="panel">
        <h2>Approval Queue</h2>

        {pendingSubmissions.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '40px 20px',
              color: 'var(--muted)',
              fontSize: 13,
            }}
          >
            <CheckCircle size={32} style={{ color: 'var(--green)', margin: '0 auto 12px' }} />
            <p>No pending timesheet submissions to review.</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Submitter</th>
                <th>Week Starting</th>
                <th>Hours</th>
                <th>Value</th>
                <th>Submitted</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingSubmissions.map((submission) => (
                <tr key={submission.id}>
                  <td>
                    <strong style={{ color: 'var(--ink)' }}>
                      {getSubmitterName(submission.userId)}
                    </strong>
                  </td>
                  <td>{formatWeek(submission.weekStartDate)}</td>
                  <td>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={13} style={{ color: 'var(--muted)' }} />
                      {submission.totalHours}h
                    </span>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>
                    {formatCurrency(submission.totalValueCents)}
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {submission.submittedAt
                      ? new Date(submission.submittedAt).toLocaleDateString('en-ZA', {
                          day: 'numeric',
                          month: 'short',
                        })
                      : '—'}
                  </td>
                  <td>
                    <span className="chip chip-pending">Pending</span>
                  </td>
                  <td>
                    {rejectingId === submission.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 }}>
                        <input
                          type="text"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="Rejection reason..."
                          style={{
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                            padding: '6px 10px',
                            fontSize: 12,
                            width: '100%',
                          }}
                        />
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            className="btn btn-danger"
                            style={{ fontSize: 11, padding: '4px 10px', height: 28 }}
                            onClick={() => handleReject(submission)}
                            disabled={!rejectReason.trim() || processing === submission.id}
                          >
                            Confirm
                          </button>
                          <button
                            className="btn btn-secondary"
                            style={{ fontSize: 11, padding: '4px 10px', height: 28 }}
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
                          style={{ fontSize: 11, padding: '4px 10px', height: 28, display: 'flex', alignItems: 'center', gap: 4 }}
                          onClick={() => handleApprove(submission)}
                          disabled={processing === submission.id}
                        >
                          <CheckCircle size={13} /> Approve
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: 11, padding: '4px 10px', height: 28, display: 'flex', alignItems: 'center', gap: 4 }}
                          onClick={() => setRejectingId(submission.id)}
                          disabled={processing === submission.id}
                        >
                          <XCircle size={13} /> Reject
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
    </div>
  );
}
