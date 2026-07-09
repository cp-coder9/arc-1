/**
 * LeaveCalendar — Team leave calendar view with approval status indicators.
 *
 * Displays team members' leave across a month-view grid with status-coded cells.
 * Shows balance summaries and approval status per request.
 *
 * Requirements: 9.1, 9.2, 9.5, 15.5
 * @module practiceManagement/LeaveCalendar
 */

import { useState, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight, CheckCircle, Clock, XCircle } from 'lucide-react';
import type { UserProfile } from '@/types';
import type { LeaveRequest, LeaveStatus, LeaveType } from '@/services/practiceManagement/types';

// ─── Props ───────────────────────────────────────────────────────────────────

interface LeaveCalendarProps {
  user: UserProfile;
  leaveRequests?: LeaveRequest[];
  teamMembers?: Array<{ userId: string; displayName: string }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  annual: 'Annual',
  sick: 'Sick',
  family_responsibility: 'Family',
  study: 'Study',
  unpaid: 'Unpaid',
};

function statusColor(status: LeaveStatus): string {
  switch (status) {
    case 'approved': return 'var(--green)';
    case 'pending': return 'var(--amber)';
    case 'rejected': return 'var(--red)';
    case 'cancelled': return 'var(--muted)';
  }
}

function statusIcon(status: LeaveStatus) {
  switch (status) {
    case 'approved': return <CheckCircle size={12} style={{ color: 'var(--green)' }} />;
    case 'pending': return <Clock size={12} style={{ color: 'var(--amber)' }} />;
    case 'rejected': return <XCircle size={12} style={{ color: 'var(--red)' }} />;
    case 'cancelled': return <XCircle size={12} style={{ color: 'var(--muted)' }} />;
  }
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function isDateInRange(date: Date, start: string, end: string): boolean {
  const d = date.toISOString().split('T')[0];
  return d >= start && d <= end;
}

function formatMonth(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function LeaveCalendar({
  user,
  leaveRequests = [],
  teamMembers = [],
}: LeaveCalendarProps) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const daysInMonth = useMemo(() => getDaysInMonth(viewYear, viewMonth), [viewYear, viewMonth]);
  const dayNumbers = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);

  // Build a map of userId → array of leave requests for this month
  const leaveByMember = useMemo(() => {
    const map = new Map<string, LeaveRequest[]>();
    const monthStart = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
    const monthEnd = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    for (const req of leaveRequests) {
      if (req.status === 'cancelled' || req.status === 'rejected') continue;
      // Check if any part of the leave overlaps with this month
      if (req.startDate <= monthEnd && req.endDate >= monthStart) {
        const existing = map.get(req.userId) ?? [];
        existing.push(req);
        map.set(req.userId, existing);
      }
    }
    return map;
  }, [leaveRequests, viewYear, viewMonth, daysInMonth]);

  // Stats
  const stats = useMemo(() => {
    const pending = leaveRequests.filter((r) => r.status === 'pending').length;
    const approved = leaveRequests.filter((r) => r.status === 'approved').length;
    const onLeaveToday = leaveRequests.filter((r) => {
      const todayStr = today.toISOString().split('T')[0];
      return r.status === 'approved' && r.startDate <= todayStr && r.endDate >= todayStr;
    }).length;
    return { pending, approved, onLeaveToday, totalMembers: teamMembers.length };
  }, [leaveRequests, teamMembers, today]);

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  }

  function getCellLeave(userId: string, day: number): LeaveRequest | undefined {
    const requests = leaveByMember.get(userId);
    if (!requests) return undefined;
    const date = new Date(viewYear, viewMonth, day);
    // Skip weekends
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) return undefined;
    return requests.find((r) => isDateInRange(date, r.startDate, r.endDate));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Hero */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">LEAVE CALENDAR</div>
            <h1>Team Leave</h1>
            <p className="sub">Visualise team availability and leave periods</p>
          </div>
        </div>
        <div className="hero-pills">
          {stats.onLeaveToday > 0 && (
            <span className="pill" style={{ color: 'var(--amber)', background: 'rgba(245,166,35,.08)', borderColor: 'rgba(245,166,35,.18)' }}>
              <span className="dot" style={{ background: 'var(--amber)' }}></span> {stats.onLeaveToday} on leave today
            </span>
          )}
        </div>
      </div>

      {/* Stat Row */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--deep)' }}>{stats.totalMembers}</div>
          <div className="stat-label">Team Members</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--amber)' }}>{stats.pending}</div>
          <div className="stat-label">Pending Requests</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--green)' }}>{stats.approved}</div>
          <div className="stat-label">Approved</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--amber)' }}>{stats.onLeaveToday}</div>
          <div className="stat-label">On Leave Today</div>
        </div>
      </div>

      {/* Calendar Panel */}
      <section className="panel">
        {/* Month Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ margin: 0 }}>{formatMonth(viewYear, viewMonth)}</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-secondary" onClick={prevMonth} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'rgba(255,255,255,.7)', cursor: 'pointer' }}>
              <ChevronLeft size={16} />
            </button>
            <button className="btn-secondary" onClick={nextMonth} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'rgba(255,255,255,.7)', cursor: 'pointer' }}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ fontSize: 11, minWidth: 600 }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, background: 'rgba(255,255,255,.95)', zIndex: 1, minWidth: 120 }}>Team Member</th>
                {dayNumbers.map((d) => {
                  const date = new Date(viewYear, viewMonth, d);
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  return (
                    <th
                      key={d}
                      style={{
                        textAlign: 'center',
                        padding: '4px 2px',
                        minWidth: 24,
                        opacity: isWeekend ? 0.3 : 1,
                      }}
                    >
                      {d}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {teamMembers.map((member) => (
                <tr key={member.userId}>
                  <td style={{ position: 'sticky', left: 0, background: 'rgba(255,255,255,.95)', zIndex: 1, fontWeight: 500, fontSize: 12 }}>
                    {member.displayName}
                  </td>
                  {dayNumbers.map((d) => {
                    const date = new Date(viewYear, viewMonth, d);
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                    const leave = getCellLeave(member.userId, d);

                    return (
                      <td
                        key={d}
                        style={{
                          textAlign: 'center',
                          padding: '2px',
                          opacity: isWeekend ? 0.2 : 1,
                        }}
                      >
                        {leave && !isWeekend && (
                          <div
                            title={`${LEAVE_TYPE_LABELS[leave.leaveType]} (${leave.status})`}
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: 4,
                              margin: '0 auto',
                              background: `color-mix(in srgb, ${statusColor(leave.status)} 20%, transparent)`,
                              border: `1px solid ${statusColor(leave.status)}`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor(leave.status) }} />
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {teamMembers.length === 0 && (
                <tr>
                  <td colSpan={daysInMonth + 1} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>
                    No team members to display.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 11, color: 'var(--muted)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {statusIcon('approved')} Approved
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {statusIcon('pending')} Pending
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(16,32,51,.08)' }} /> Weekend
          </span>
        </div>
      </section>

      {/* Upcoming Leave Panel */}
      {leaveRequests.filter((r) => r.status === 'approved' || r.status === 'pending').length > 0 && (
        <section className="panel">
          <h2>Upcoming Requests</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Type</th>
                <th>Dates</th>
                <th style={{ textAlign: 'center' }}>Days</th>
                <th style={{ textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {leaveRequests
                .filter((r) => r.status === 'approved' || r.status === 'pending')
                .slice(0, 10)
                .map((req) => {
                  const member = teamMembers.find((m) => m.userId === req.userId);
                  return (
                    <tr key={req.id}>
                      <td style={{ fontSize: 12 }}>{member?.displayName ?? req.userId}</td>
                      <td style={{ fontSize: 12 }}>{LEAVE_TYPE_LABELS[req.leaveType]}</td>
                      <td style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--muted)' }}>
                        {req.startDate} → {req.endDate}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{req.workingDays}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: statusColor(req.status) }}>
                          {statusIcon(req.status)} {req.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
