import React, { useMemo, useState } from 'react';
import { Calendar, Clock, Plus, Send, Trash2 } from 'lucide-react';
import type { UserProfile } from '@/types';
import type {
  SacapWorkStage,
  TimesheetSubmissionStatus,
} from '@/services/practiceManagement/types';
import { SACAP_STAGE_LABELS, SACAP_WORK_STAGES } from '@/services/practiceManagement/types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TimesheetRow {
  id: string;
  projectId: string;
  projectName: string;
  sacapStage: SacapWorkStage | '';
  activity: string;
  date: string;
  startTime: string;
  endTime: string;
}

interface Props {
  user: UserProfile;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getWeekDates(offset: number = 0): { start: string; end: string; dates: string[] } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7) + offset * 7);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return {
    start: dates[0],
    end: dates[6],
    dates,
  };
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
}

function calcHours(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff > 0 ? Math.round((diff / 60) * 100) / 100 : 0;
}

const STATUS_LABELS: Record<TimesheetSubmissionStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
};

const STATUS_PILL_CLASS: Record<TimesheetSubmissionStatus, string> = {
  draft: 'pill-muted',
  pending_approval: 'pill-warning',
  approved: 'pill-success',
  rejected: 'pill-danger',
};

// ─── Demo Projects ───────────────────────────────────────────────────────────

const DEMO_PROJECTS = [
  { id: 'proj-001', name: 'Sandton Mixed-Use Tower' },
  { id: 'proj-002', name: 'Waterfall Office Park' },
  { id: 'proj-003', name: 'Cape Town Residential' },
  { id: 'proj-004', name: 'Menlyn Maine Retail' },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function TimesheetCapture({ user }: Props) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [submissionStatus, setSubmissionStatus] = useState<TimesheetSubmissionStatus>('draft');
  const [rows, setRows] = useState<TimesheetRow[]>([]);

  const week = useMemo(() => getWeekDates(weekOffset), [weekOffset]);

  const totalHours = useMemo(
    () => rows.reduce((sum, row) => sum + calcHours(row.startTime, row.endTime), 0),
    [rows],
  );

  const entriesByDay = useMemo(() => {
    const byDay: Record<string, number> = {};
    for (const date of week.dates) byDay[date] = 0;
    for (const row of rows) {
      if (row.date && byDay[row.date] !== undefined) {
        byDay[row.date] += calcHours(row.startTime, row.endTime);
      }
    }
    return byDay;
  }, [rows, week.dates]);

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        projectId: '',
        projectName: '',
        sacapStage: '',
        activity: '',
        date: week.dates[0],
        startTime: '08:00',
        endTime: '17:00',
      },
    ]);
  };

  const updateRow = (id: string, field: keyof TimesheetRow, value: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        if (field === 'projectId') {
          const proj = DEMO_PROJECTS.find((p) => p.id === value);
          return { ...r, projectId: value, projectName: proj?.name ?? '' };
        }
        return { ...r, [field]: value };
      }),
    );
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleSubmit = () => {
    if (rows.length === 0) return;
    setSubmissionStatus('pending_approval');
  };

  const isReadOnly = submissionStatus === 'pending_approval' || submissionStatus === 'approved';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ─── Hero ─────────────────────────────────────────────────────────── */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">TIMESHEETS</div>
            <h1>Weekly Timesheet</h1>
            <p className="sub">
              {user.displayName} · Week of {formatDate(week.start)} – {formatDate(week.end)}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setWeekOffset((w) => w - 1)}
              aria-label="Previous week"
            >
              ‹ Prev
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setWeekOffset(0)}
            >
              This Week
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setWeekOffset((w) => w + 1)}
              aria-label="Next week"
            >
              Next ›
            </button>
          </div>
        </div>
        <div className="hero-pills">
          <span className={`pill ${STATUS_PILL_CLASS[submissionStatus]}`}>
            <span className="dot"></span> {STATUS_LABELS[submissionStatus]}
          </span>
        </div>
      </div>

      {/* ─── Stat Row ─────────────────────────────────────────────────────── */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-value">{totalHours.toFixed(1)}</div>
          <div className="stat-label">Total Hours</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{rows.length}</div>
          <div className="stat-label">Entries</div>
        </div>
        {week.dates.slice(0, 5).map((date) => (
          <div className="stat-card" key={date}>
            <div className="stat-value" style={{ fontSize: 16 }}>
              {(entriesByDay[date] ?? 0).toFixed(1)}h
            </div>
            <div className="stat-label">
              {new Date(date + 'T00:00:00').toLocaleDateString('en-ZA', { weekday: 'short' })}
            </div>
          </div>
        ))}
      </div>

      {/* ─── Timesheet Grid Panel ─────────────────────────────────────────── */}
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2>Time Entries</h2>
          {!isReadOnly && (
            <button className="btn" onClick={addRow}>
              <Plus size={14} style={{ marginRight: 4 }} /> Add Entry
            </button>
          )}
        </div>

        {rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--muted)' }}>
            <Clock size={32} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
            <p style={{ fontSize: 13 }}>No time entries for this week. Click "Add Entry" to start logging time.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>SACAP Stage</th>
                  <th>Activity</th>
                  <th>Date</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Hours</th>
                  {!isReadOnly && <th></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <select
                        value={row.projectId}
                        onChange={(e) => updateRow(row.id, 'projectId', e.target.value)}
                        disabled={isReadOnly}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          fontSize: 13,
                          background: 'var(--white)',
                          color: 'var(--ink)',
                        }}
                        aria-label="Project"
                      >
                        <option value="">Select project…</option>
                        {DEMO_PROJECTS.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={row.sacapStage}
                        onChange={(e) => updateRow(row.id, 'sacapStage', e.target.value)}
                        disabled={isReadOnly}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          fontSize: 13,
                          background: 'var(--white)',
                          color: 'var(--ink)',
                        }}
                        aria-label="SACAP Work Stage"
                      >
                        <option value="">Select stage…</option>
                        {SACAP_WORK_STAGES.map((stage) => (
                          <option key={stage} value={stage}>{SACAP_STAGE_LABELS[stage]}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={row.activity}
                        onChange={(e) => updateRow(row.id, 'activity', e.target.value)}
                        placeholder="Activity description…"
                        disabled={isReadOnly}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          fontSize: 13,
                          color: 'var(--ink)',
                        }}
                        aria-label="Activity"
                      />
                    </td>
                    <td>
                      <select
                        value={row.date}
                        onChange={(e) => updateRow(row.id, 'date', e.target.value)}
                        disabled={isReadOnly}
                        style={{
                          padding: '6px 8px',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          fontSize: 13,
                          background: 'var(--white)',
                          color: 'var(--ink)',
                        }}
                        aria-label="Date"
                      >
                        {week.dates.map((d) => (
                          <option key={d} value={d}>{formatDate(d)}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="time"
                        value={row.startTime}
                        onChange={(e) => updateRow(row.id, 'startTime', e.target.value)}
                        disabled={isReadOnly}
                        style={{
                          padding: '6px 8px',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          fontSize: 13,
                          color: 'var(--ink)',
                        }}
                        aria-label="Start time"
                      />
                    </td>
                    <td>
                      <input
                        type="time"
                        value={row.endTime}
                        onChange={(e) => updateRow(row.id, 'endTime', e.target.value)}
                        disabled={isReadOnly}
                        style={{
                          padding: '6px 8px',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          fontSize: 13,
                          color: 'var(--ink)',
                        }}
                        aria-label="End time"
                      />
                    </td>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--deep)' }}>
                        {calcHours(row.startTime, row.endTime).toFixed(1)}
                      </span>
                    </td>
                    {!isReadOnly && (
                      <td>
                        <button
                          onClick={() => removeRow(row.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--red)',
                            padding: 4,
                          }}
                          aria-label="Remove entry"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Actions Panel ────────────────────────────────────────────────── */}
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ marginBottom: 4 }}>Submit for Approval</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
              {submissionStatus === 'draft'
                ? 'Submit your weekly timesheet to your project lead for approval.'
                : submissionStatus === 'pending_approval'
                  ? 'Your timesheet is pending approval. You will be notified once reviewed.'
                  : submissionStatus === 'approved'
                    ? 'This timesheet has been approved. Hours have been added to project cost totals.'
                    : 'This timesheet was rejected. Please revise and resubmit.'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {submissionStatus === 'draft' && (
              <button
                className="btn"
                onClick={handleSubmit}
                disabled={rows.length === 0}
                style={{ opacity: rows.length === 0 ? 0.5 : 1 }}
              >
                <Send size={14} style={{ marginRight: 4 }} /> Submit Week
              </button>
            )}
            {submissionStatus === 'rejected' && (
              <button
                className="btn"
                onClick={() => setSubmissionStatus('draft')}
              >
                <Calendar size={14} style={{ marginRight: 4 }} /> Revise & Resubmit
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
