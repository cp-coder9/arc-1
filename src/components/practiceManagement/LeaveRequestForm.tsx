/**
 * LeaveRequestForm — Leave request submission with type, dates, notes, and working days preview.
 *
 * Displays leave balance per type and calculates working days excluding weekends.
 * Renders inside the AppShell 3-column grid using CSS token classes.
 *
 * Requirements: 9.1, 9.2, 9.5, 15.5
 * @module practiceManagement/LeaveRequestForm
 */

import { useState, useMemo } from 'react';
import { Calendar, Send, Info } from 'lucide-react';
import type { UserProfile } from '@/types';
import type { LeaveType, LeaveBalance, LeaveStatus } from '@/services/practiceManagement/types';

// ─── Props ───────────────────────────────────────────────────────────────────

interface LeaveRequestFormProps {
  user: UserProfile;
  balances?: LeaveBalance[];
  onSubmit?: (request: {
    leaveType: LeaveType;
    startDate: string;
    endDate: string;
    notes: string;
    workingDays: number;
  }) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const LEAVE_TYPES: { value: LeaveType; label: string }[] = [
  { value: 'annual', label: 'Annual Leave' },
  { value: 'sick', label: 'Sick Leave' },
  { value: 'family_responsibility', label: 'Family Responsibility' },
  { value: 'study', label: 'Study Leave' },
  { value: 'unpaid', label: 'Unpaid Leave' },
];

function calculateWorkingDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (endDate < startDate) return 0;

  let count = 0;
  const current = new Date(startDate);
  while (current <= endDate) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

function statusColor(status: LeaveStatus): string {
  switch (status) {
    case 'approved': return 'var(--green)';
    case 'pending': return 'var(--amber)';
    case 'rejected': return 'var(--red)';
    case 'cancelled': return 'var(--muted)';
    default: return 'var(--muted)';
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function LeaveRequestForm({
  user,
  balances = [],
  onSubmit,
}: LeaveRequestFormProps) {
  const [leaveType, setLeaveType] = useState<LeaveType>('annual');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');

  const workingDays = useMemo(
    () => calculateWorkingDays(startDate, endDate),
    [startDate, endDate],
  );

  const currentBalance = useMemo(
    () => balances.find((b) => b.leaveType === leaveType),
    [balances, leaveType],
  );

  const insufficientBalance = currentBalance
    ? workingDays > currentBalance.available
    : false;

  function handleSubmit() {
    if (!startDate || !endDate || workingDays === 0) return;
    onSubmit?.({ leaveType, startDate, endDate, notes, workingDays });
    setStartDate('');
    setEndDate('');
    setNotes('');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Hero */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">LEAVE REQUEST</div>
            <h1>Request Leave</h1>
            <p className="sub">{user.displayName ?? user.email} · Submit a new leave request</p>
          </div>
        </div>
        <div className="hero-pills">
          <span className="pill">
            <span className="dot"></span> New Request
          </span>
        </div>
      </div>

      {/* Stat Row — Balances */}
      {balances.length > 0 && (
        <div className="stat-row">
          {balances.map((b) => (
            <div className="stat-card" key={b.leaveType}>
              <div
                className="stat-value"
                style={{ color: b.available > 0 ? 'var(--green)' : 'var(--red)' }}
              >
                {b.available}
              </div>
              <div className="stat-label">
                {LEAVE_TYPES.find((t) => t.value === b.leaveType)?.label ?? b.leaveType} available
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Panel */}
      <section className="panel">
        <h2>Leave Details</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
          {/* Leave Type */}
          <div>
            <label style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
              Leave Type
            </label>
            <select
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value as LeaveType)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'rgba(255,255,255,.7)',
                fontSize: 13,
                color: 'var(--ink)',
              }}
            >
              {LEAVE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Dates */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'rgba(255,255,255,.7)',
                  fontSize: 13,
                  color: 'var(--ink)',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'rgba(255,255,255,.7)',
                  fontSize: 13,
                  color: 'var(--ink)',
                }}
              />
            </div>
          </div>

          {/* Working Days Preview */}
          {workingDays > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                borderRadius: 10,
                background: insufficientBalance ? 'rgba(217,87,71,.06)' : 'rgba(25,183,176,.06)',
                border: `1px solid ${insufficientBalance ? 'rgba(217,87,71,.18)' : 'rgba(25,183,176,.18)'}`,
              }}
            >
              <Calendar size={16} style={{ color: insufficientBalance ? 'var(--red)' : 'var(--teal)' }} />
              <span style={{ fontSize: 13, color: 'var(--ink)' }}>
                <strong>{workingDays}</strong> working day{workingDays !== 1 ? 's' : ''}
              </span>
              {insufficientBalance && (
                <span style={{ fontSize: 11, color: 'var(--red)', marginLeft: 'auto' }}>
                  Exceeds available balance ({currentBalance?.available ?? 0} days)
                </span>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for leave or additional details..."
              rows={3}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'rgba(255,255,255,.7)',
                fontSize: 13,
                color: 'var(--ink)',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Balance Info */}
          {currentBalance && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderRadius: 8,
                background: 'rgba(16,32,51,.03)',
                fontSize: 12,
                color: 'var(--muted)',
              }}
            >
              <Info size={14} />
              <span>
                Balance: {currentBalance.entitlement} entitled · {currentBalance.used} used · {currentBalance.pending} pending · <strong style={{ color: 'var(--ink)' }}>{currentBalance.available} available</strong>
              </span>
            </div>
          )}

          {/* Submit */}
          <button
            className="btn"
            onClick={handleSubmit}
            disabled={!startDate || !endDate || workingDays === 0 || insufficientBalance}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              justifyContent: 'center',
              opacity: (!startDate || !endDate || workingDays === 0 || insufficientBalance) ? 0.5 : 1,
            }}
          >
            <Send size={14} />
            Submit Leave Request
          </button>
        </div>
      </section>
    </div>
  );
}
