import React, { useState } from 'react';
import type { UserProfile } from '@/types';

export interface WitnessPointRecordFormProps {
  user: UserProfile;
  onSubmit?: (data: WitnessPointRecordData) => void;
  onCancel?: () => void;
}

export interface WitnessPointRecordData {
  attendance: 'inspector_witnessed' | 'contractor_recorded';
  outcome: 'pass' | 'fail' | 'conditional_pass';
  observations: string;
}

/** Mock context for the inspection item being recorded */
const MOCK_CONTEXT = {
  title: 'Concrete cube test at 7 days',
  acceptanceCriteria: '7-day cube strength ≥ 67% of 28-day design strength.',
  specificationReference: 'SANS 3001-GR1 clause 6.1',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: 13,
  fontFamily: 'var(--font)',
  color: 'var(--ink)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'rgba(255,255,255,.7)',
  outline: 'none',
  transition: 'border-color 0.15s ease',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--deep)',
  marginBottom: 6,
};

/**
 * WitnessPointRecordForm — Records outcome for a witness point inspection.
 * Tracks attendance (inspector attended / contractor recorded) and outcome.
 *
 * Requirements: 4.3, 4.4, 4.5
 */
export default function WitnessPointRecordForm({ user, onSubmit, onCancel }: WitnessPointRecordFormProps) {
  const [attendance, setAttendance] = useState<'inspector_witnessed' | 'contractor_recorded'>('inspector_witnessed');
  const [outcome, setOutcome] = useState<'pass' | 'fail' | 'conditional_pass' | null>(null);
  const [observations, setObservations] = useState('');

  const canSubmit = outcome !== null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit?.({
      attendance,
      outcome,
      observations: observations.trim(),
    });
  }

  return (
    <section className="panel">
      <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--deep)', marginBottom: 16 }}>
        Witness Point Record
      </h2>

      {/* Inspection Item Context */}
      <div
        style={{
          padding: 14,
          borderRadius: 10,
          border: '1px solid var(--border)',
          background: 'var(--aqua)',
          marginBottom: 18,
        }}
      >
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: '0 0 6px' }}>
          {MOCK_CONTEXT.title}
        </h3>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
          <strong style={{ color: 'var(--deep)' }}>Acceptance Criteria:</strong>{' '}
          {MOCK_CONTEXT.acceptanceCriteria}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>
          {MOCK_CONTEXT.specificationReference}
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Attendance Toggle */}
        <div>
          <label style={labelStyle}>Attendance</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => setAttendance('inspector_witnessed')}
              className="btn"
              style={{
                flex: 1,
                borderColor: attendance === 'inspector_witnessed' ? 'var(--teal)' : 'var(--border)',
                background: attendance === 'inspector_witnessed' ? 'var(--aqua)' : 'rgba(255,255,255,.7)',
                color: attendance === 'inspector_witnessed' ? 'var(--deep)' : 'var(--ink)',
                fontWeight: attendance === 'inspector_witnessed' ? 600 : 400,
              }}
            >
              Inspector Attended
            </button>
            <button
              type="button"
              onClick={() => setAttendance('contractor_recorded')}
              className="btn"
              style={{
                flex: 1,
                borderColor: attendance === 'contractor_recorded' ? 'var(--teal)' : 'var(--border)',
                background: attendance === 'contractor_recorded' ? 'var(--aqua)' : 'rgba(255,255,255,.7)',
                color: attendance === 'contractor_recorded' ? 'var(--deep)' : 'var(--ink)',
                fontWeight: attendance === 'contractor_recorded' ? 600 : 400,
              }}
            >
              Contractor Recorded
            </button>
          </div>
          <span style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, display: 'block' }}>
            {attendance === 'inspector_witnessed'
              ? 'Inspector was present and witnessed the inspection.'
              : 'Inspector did not attend; outcome recorded by contractor.'}
          </span>
        </div>

        {/* Outcome Selection */}
        <div>
          <label style={labelStyle}>Outcome</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => setOutcome('pass')}
              className="btn"
              style={{
                flex: 1,
                borderColor: outcome === 'pass' ? 'rgba(74,222,128,.4)' : 'var(--border)',
                background: outcome === 'pass' ? 'rgba(74,222,128,.12)' : 'rgba(255,255,255,.7)',
                color: outcome === 'pass' ? 'var(--green)' : 'var(--ink)',
                fontWeight: outcome === 'pass' ? 700 : 400,
              }}
            >
              Pass
            </button>
            <button
              type="button"
              onClick={() => setOutcome('fail')}
              className="btn"
              style={{
                flex: 1,
                borderColor: outcome === 'fail' ? 'rgba(217,87,71,.4)' : 'var(--border)',
                background: outcome === 'fail' ? 'rgba(217,87,71,.08)' : 'rgba(255,255,255,.7)',
                color: outcome === 'fail' ? 'var(--red)' : 'var(--ink)',
                fontWeight: outcome === 'fail' ? 700 : 400,
              }}
            >
              Fail
            </button>
            <button
              type="button"
              onClick={() => setOutcome('conditional_pass')}
              className="btn"
              style={{
                flex: 1,
                borderColor: outcome === 'conditional_pass' ? 'rgba(245,166,35,.4)' : 'var(--border)',
                background: outcome === 'conditional_pass' ? 'rgba(245,166,35,.08)' : 'rgba(255,255,255,.7)',
                color: outcome === 'conditional_pass' ? 'var(--amber)' : 'var(--ink)',
                fontWeight: outcome === 'conditional_pass' ? 700 : 400,
              }}
            >
              Conditional
            </button>
          </div>
        </div>

        {/* Observations */}
        <div>
          <label style={labelStyle} htmlFor="witness-observations">Observations</label>
          <textarea
            id="witness-observations"
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            placeholder="Record any observations from the witness point..."
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', minHeight: 64 }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          {onCancel && (
            <button
              type="button"
              className="btn"
              onClick={onCancel}
              style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,.7)', color: 'var(--ink)' }}
            >
              Cancel
            </button>
          )}
          <button type="submit" className="btn" disabled={!canSubmit}>
            Submit Record
          </button>
        </div>
      </form>
    </section>
  );
}
