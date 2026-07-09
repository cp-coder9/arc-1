import React, { useState } from 'react';
import type { UserProfile } from '@/types';

export interface HoldPointSignOffFormProps {
  user: UserProfile;
  onSubmit?: (data: HoldPointSignOffData) => void;
  onCancel?: () => void;
}

export interface HoldPointSignOffData {
  outcome: 'pass' | 'fail' | 'conditional_pass';
  observations: string;
  conditions?: string;
  conditionsDeadlineDays?: number;
}

/** Mock context for the inspection item being signed off */
const MOCK_CONTEXT = {
  title: 'Rebar placement inspection before pour',
  acceptanceCriteria: 'Rebar spacing ±10mm, cover ≥40mm, all laps and ties per drawing.',
  specificationReference: 'SANS 10100-1 clause 8.4',
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
 * HoldPointSignOffForm — Inspector sign-off form for hold point inspections.
 * Shows item context, outcome selection (Pass/Fail/Conditional), observations,
 * and conditional fields (conditions text, deadline days).
 *
 * Requirements: 3.5, 3.7
 */
export default function HoldPointSignOffForm({ user, onSubmit, onCancel }: HoldPointSignOffFormProps) {
  const [outcome, setOutcome] = useState<'pass' | 'fail' | 'conditional_pass' | null>(null);
  const [observations, setObservations] = useState('');
  const [conditions, setConditions] = useState('');
  const [deadlineDays, setDeadlineDays] = useState(7);

  const canSubmit = outcome !== null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit?.({
      outcome,
      observations: observations.trim(),
      conditions: outcome === 'conditional_pass' ? conditions.trim() : undefined,
      conditionsDeadlineDays: outcome === 'conditional_pass' ? deadlineDays : undefined,
    });
  }

  return (
    <section className="panel">
      <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--deep)', marginBottom: 16 }}>
        Hold Point Sign-Off
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
          <label style={labelStyle} htmlFor="signoff-observations">Observations</label>
          <textarea
            id="signoff-observations"
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            placeholder="Record any observations from the inspection..."
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', minHeight: 64 }}
          />
        </div>

        {/* Conditional Fields */}
        {outcome === 'conditional_pass' && (
          <>
            <div>
              <label style={labelStyle} htmlFor="signoff-conditions">Conditions</label>
              <textarea
                id="signoff-conditions"
                value={conditions}
                onChange={(e) => setConditions(e.target.value)}
                placeholder="Describe the conditions that must be addressed..."
                maxLength={2000}
                rows={3}
                required
                style={{ ...inputStyle, resize: 'vertical', minHeight: 64 }}
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor="signoff-deadline">Deadline (business days)</label>
              <select
                id="signoff-deadline"
                value={deadlineDays}
                onChange={(e) => setDeadlineDays(Number(e.target.value))}
                style={inputStyle}
              >
                {Array.from({ length: 30 }, (_, i) => i + 1).map((day) => (
                  <option key={day} value={day}>
                    {day} day{day !== 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

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
            Submit Sign-Off
          </button>
        </div>
      </form>
    </section>
  );
}
