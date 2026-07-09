/**
 * WriteOffPanel — Write-off tracking and creation for practice management.
 *
 * Provides a write-off creation form with reason, amount, description,
 * cumulative write-off display as percentage of fee, and reversal entry support.
 *
 * Renders inside the AppShell 3-column grid using CSS token classes.
 * Follows the Hero → Stat Row → Panels content pattern.
 *
 * Requirements: 10.1, 10.2, 10.3, 15.1, 15.2
 * @module practiceManagement/WriteOffPanel
 */

import { useState, useMemo } from 'react';
import { XCircle, RotateCcw, AlertTriangle, Plus } from 'lucide-react';
import type { UserProfile } from '@/types';
import type {
  WriteOffSummary,
  WriteOffEntry,
  WriteOffReason,
  SacapWorkStage,
} from '@/services/practiceManagement/types';
import { SACAP_STAGE_LABELS, SACAP_WORK_STAGES } from '@/services/practiceManagement/types';

// ─── Props ───────────────────────────────────────────────────────────────────

interface WriteOffPanelProps {
  user: UserProfile;
  projectId?: string;
  projectName?: string;
  writeOffSummary?: WriteOffSummary | null;
  onCreateWriteOff?: (data: WriteOffFormData) => void;
  onCreateReversal?: (writeOffId: string, reason: string) => void;
}

interface WriteOffFormData {
  amountCents: number;
  reason: WriteOffReason;
  description: string;
  sacapStage?: SacapWorkStage;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
});

function formatCents(cents: number): string {
  return currency.format(cents / 100);
}

const WRITE_OFF_REASON_LABELS: Record<WriteOffReason, string> = {
  scope_creep: 'Scope Creep',
  rework: 'Rework',
  goodwill: 'Goodwill',
  fee_negotiation: 'Fee Negotiation',
  other: 'Other',
};

function stageLabel(stage: SacapWorkStage): string {
  return SACAP_STAGE_LABELS[stage] ?? stage;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function WriteOffPanel({
  user,
  projectName = 'Project',
  writeOffSummary,
  onCreateWriteOff,
  onCreateReversal,
}: WriteOffPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState<WriteOffReason>('scope_creep');
  const [description, setDescription] = useState('');
  const [sacapStage, setSacapStage] = useState<SacapWorkStage | ''>('');
  const [reversalId, setReversalId] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState('');

  const entries: WriteOffEntry[] = writeOffSummary?.entries ?? [];
  const cumulativeTotal = writeOffSummary?.cumulativeWriteOffCents ?? 0;
  const agreedFee = writeOffSummary?.agreedFeeCents ?? 0;
  const writeOffPercentage = writeOffSummary?.writeOffPercentage ?? 0;

  const isOverThreshold = writeOffPercentage > 10;

  const handleSubmit = () => {
    if (!onCreateWriteOff) return;
    const amountCents = Math.round(parseFloat(amount || '0') * 100);
    if (amountCents <= 0) return;
    onCreateWriteOff({
      amountCents,
      reason,
      description,
      sacapStage: sacapStage || undefined,
    });
    setShowForm(false);
    setAmount('');
    setDescription('');
    setSacapStage('');
    setReason('scope_creep');
  };

  const handleReversal = () => {
    if (!onCreateReversal || !reversalId || !reversalReason.trim()) return;
    onCreateReversal(reversalId, reversalReason);
    setReversalId(null);
    setReversalReason('');
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Hero */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">WRITE-OFFS</div>
            <h1>{projectName}</h1>
            <p className="sub">
              {entries.length} write-off entr{entries.length !== 1 ? 'ies' : 'y'} recorded
            </p>
          </div>
        </div>
        <div className="hero-pills">
          {isOverThreshold && (
            <span
              className="pill"
              style={{
                color: 'var(--red)',
                background: 'rgba(217,87,71,.08)',
                borderColor: 'rgba(217,87,71,.18)',
              }}
            >
              <span className="dot" style={{ background: 'var(--red)' }}></span>{' '}
              Above 10% threshold
            </span>
          )}
          <span className="pill">
            <span className="dot"></span> {writeOffPercentage.toFixed(1)}% of Fee
          </span>
        </div>
      </div>

      {/* Stat Row */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--deep)' }}>
            {formatCents(agreedFee)}
          </div>
          <div className="stat-label">Agreed Fee</div>
        </div>
        <div className="stat-card">
          <div
            className="stat-value"
            style={{ color: isOverThreshold ? 'var(--red)' : 'var(--amber)' }}
          >
            {formatCents(cumulativeTotal)}
          </div>
          <div className="stat-label">Cumulative Write-Offs</div>
        </div>
        <div className="stat-card">
          <div
            className="stat-value"
            style={{ color: isOverThreshold ? 'var(--red)' : 'var(--amber)' }}
          >
            {writeOffPercentage.toFixed(1)}%
          </div>
          <div className="stat-label">Write-Off %</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--green)' }}>
            {formatCents(agreedFee - cumulativeTotal)}
          </div>
          <div className="stat-label">Net Fee Remaining</div>
        </div>
      </div>

      {/* Progress Bar */}
      <section className="panel">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 11,
            color: 'var(--muted)',
            marginBottom: 6,
          }}
        >
          <span>Write-off as percentage of agreed fee</span>
          <span
            style={{
              fontWeight: 600,
              color: isOverThreshold ? 'var(--red)' : 'var(--amber)',
            }}
          >
            {writeOffPercentage.toFixed(1)}%
          </span>
        </div>
        <div
          style={{
            height: 10,
            borderRadius: 5,
            background: 'var(--border)',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {/* 10% threshold marker */}
          <div
            style={{
              position: 'absolute',
              left: '10%',
              top: 0,
              bottom: 0,
              width: 2,
              background: 'var(--red)',
              opacity: 0.4,
              zIndex: 1,
            }}
          />
          <div
            style={{
              height: '100%',
              width: `${Math.min(writeOffPercentage, 100)}%`,
              borderRadius: 5,
              background: isOverThreshold ? 'var(--red)' : 'var(--amber)',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
        {isOverThreshold && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 8,
              fontSize: 11,
              color: 'var(--red)',
            }}
          >
            <AlertTriangle size={12} />
            Write-offs exceed 10% threshold — review recommended
          </div>
        )}
      </section>

      {/* Create Write-Off Form */}
      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Record Write-Off</h2>
          {!showForm && (
            <button className="btn" onClick={() => setShowForm(true)} style={{ fontSize: 12 }}>
              <Plus size={14} style={{ marginRight: 4 }} />
              New Write-Off
            </button>
          )}
        </div>

        {showForm && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
              marginTop: 12,
            }}
          >
            <div>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                Amount (ZAR) *
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                min={0}
                step={0.01}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  fontSize: 13,
                  color: 'var(--ink)',
                  background: 'rgba(255,255,255,.7)',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                Reason *
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as WriteOffReason)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  fontSize: 13,
                  color: 'var(--ink)',
                  background: 'rgba(255,255,255,.7)',
                }}
              >
                {Object.entries(WRITE_OFF_REASON_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                SACAP Stage
              </label>
              <select
                value={sacapStage}
                onChange={(e) => setSacapStage(e.target.value as SacapWorkStage | '')}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  fontSize: 13,
                  color: 'var(--ink)',
                  background: 'rgba(255,255,255,.7)',
                }}
              >
                <option value="">Select stage (optional)</option>
                {SACAP_WORK_STAGES.map((s) => (
                  <option key={s} value={s}>{SACAP_STAGE_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Reason for write-off"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  fontSize: 13,
                  color: 'var(--ink)',
                  background: 'rgba(255,255,255,.7)',
                }}
              />
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
              <button className="btn" onClick={handleSubmit} style={{ fontSize: 12 }}>
                Record Write-Off
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setShowForm(false)}
                style={{ fontSize: 12 }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Write-Off History Table */}
      {entries.length > 0 && (
        <section className="panel">
          <h2>Write-Off History</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reason</th>
                <th>Stage</th>
                <th>Description</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th style={{ textAlign: 'center' }}>Type</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{entry.date}</td>
                  <td style={{ fontSize: 12 }}>
                    {WRITE_OFF_REASON_LABELS[entry.reason]}
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {entry.sacapStage ? stageLabel(entry.sacapStage) : '—'}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {entry.description || '—'}
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      fontFamily: 'monospace',
                      fontSize: 11,
                      fontWeight: 600,
                      color: entry.isReversal ? 'var(--green)' : 'var(--red)',
                    }}
                  >
                    {entry.isReversal ? '+' : '-'}{formatCents(entry.amountCents)}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {entry.isReversal ? (
                      <span
                        style={{
                          fontSize: 10,
                          padding: '2px 6px',
                          borderRadius: 999,
                          color: 'var(--green)',
                          background: 'rgba(74,222,128,.1)',
                          border: '1px solid rgba(74,222,128,.18)',
                        }}
                      >
                        Reversal
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: 10,
                          padding: '2px 6px',
                          borderRadius: 999,
                          color: 'var(--amber)',
                          background: 'rgba(245,166,35,.08)',
                          border: '1px solid rgba(245,166,35,.18)',
                        }}
                      >
                        Write-Off
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {!entry.isReversal && onCreateReversal && (
                      <>
                        {reversalId === entry.id ? (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <input
                              type="text"
                              value={reversalReason}
                              onChange={(e) => setReversalReason(e.target.value)}
                              placeholder="Reason"
                              style={{
                                padding: '2px 6px',
                                borderRadius: 4,
                                border: '1px solid var(--border)',
                                fontSize: 10,
                                width: 100,
                              }}
                            />
                            <button
                              className="btn"
                              style={{ fontSize: 9, padding: '2px 6px', height: 20 }}
                              onClick={handleReversal}
                            >
                              Confirm
                            </button>
                          </div>
                        ) : (
                          <button
                            className="btn btn-secondary"
                            style={{ fontSize: 10, padding: '2px 6px', height: 22 }}
                            onClick={() => setReversalId(entry.id)}
                          >
                            <RotateCcw size={10} style={{ marginRight: 3 }} />
                            Reverse
                          </button>
                        )}
                      </>
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
