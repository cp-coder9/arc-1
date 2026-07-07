import React, { useState, useMemo } from 'react';
import { Upload, CheckCircle2, XCircle } from 'lucide-react';
import type { UserProfile } from '@/types';

export interface LabResultFormProps {
  user: UserProfile;
}

/**
 * LabResultForm — Panel for recording a lab result with auto-threshold evaluation.
 *
 * Provides input fields for test date, result value, unit, lab name,
 * report reference, and file attachment. Automatically calculates pass/fail
 * preview based on the threshold from the testing schedule.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.7
 */
export default function LabResultForm({ user }: LabResultFormProps) {
  const [testDate, setTestDate] = useState('');
  const [resultValue, setResultValue] = useState('');
  const [resultUnit] = useState('MPa'); // Pre-filled from schedule
  const [labName, setLabName] = useState('');
  const [reportReference, setReportReference] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Mock threshold data from testing schedule — service wiring in task 17.1
  const threshold = useMemo(() => ({
    value: 25,
    unit: 'MPa',
    direction: 'gte' as const, // greater-than-or-equal
  }), []);

  /** Auto-calculated pass/fail preview */
  const passFail = useMemo(() => {
    const numericValue = parseFloat(resultValue);
    if (isNaN(numericValue) || !resultValue) return null;
    if (threshold.direction === 'gte') {
      return numericValue >= threshold.value ? 'pass' : 'fail';
    }
    return numericValue <= threshold.value ? 'pass' : 'fail';
  }, [resultValue, threshold]);

  const canSubmit = user.role === 'engineer' || user.role === 'site_manager';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    // Placeholder — service wiring in task 17.1
    setTimeout(() => setSubmitting(false), 1000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file && file.size > 25 * 1024 * 1024) {
      setAttachment(null);
      return;
    }
    setAttachment(file);
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    color: 'var(--muted)',
    marginBottom: 4,
    display: 'block',
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
  };

  return (
    <section className="panel">
      <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--deep)', margin: '0 0 16px 0' }}>
        Record Lab Result
      </h2>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          {/* Test Date */}
          <div>
            <label style={labelStyle}>Test Date</label>
            <input
              type="date"
              style={inputStyle}
              value={testDate}
              onChange={(e) => setTestDate(e.target.value)}
              required
            />
          </div>

          {/* Result Value + Unit */}
          <div>
            <label style={labelStyle}>Result Value</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="number"
                step="0.01"
                min="0"
                max="999999999.99"
                style={{ ...inputStyle, flex: 1 }}
                value={resultValue}
                onChange={(e) => setResultValue(e.target.value)}
                placeholder="e.g. 28.5"
                required
              />
              <input
                type="text"
                style={{ ...inputStyle, width: 70, textAlign: 'center', background: 'var(--aqua)' }}
                value={resultUnit}
                readOnly
                title="Unit pre-filled from testing schedule"
              />
            </div>
          </div>

          {/* Lab Name */}
          <div>
            <label style={labelStyle}>Laboratory Name</label>
            <input
              type="text"
              style={inputStyle}
              value={labName}
              onChange={(e) => setLabName(e.target.value)}
              placeholder="e.g. Geolab SA"
              maxLength={200}
              required
            />
          </div>

          {/* Report Reference */}
          <div>
            <label style={labelStyle}>Report Reference</label>
            <input
              type="text"
              style={inputStyle}
              value={reportReference}
              onChange={(e) => setReportReference(e.target.value)}
              placeholder="e.g. GL-2024-0041"
              maxLength={50}
              required
            />
          </div>
        </div>

        {/* File Attachment */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Lab Certificate (PDF, JPEG, PNG — max 25 MB)</label>
          <div
            style={{
              border: '1px dashed var(--border)',
              borderRadius: 8,
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
            }}
          >
            <Upload size={14} style={{ color: 'var(--muted)' }} />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {attachment ? attachment.name : 'Click to attach file'}
            </span>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
              onChange={handleFileChange}
            />
          </div>
        </div>

        {/* Auto-calculated Pass/Fail Preview */}
        {passFail && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 10,
              marginBottom: 14,
              background: passFail === 'pass' ? 'rgba(74,222,128,.08)' : 'rgba(217,87,71,.06)',
              border: `1px solid ${passFail === 'pass' ? 'rgba(74,222,128,.18)' : 'rgba(217,87,71,.18)'}`,
            }}
          >
            {passFail === 'pass' ? (
              <CheckCircle2 size={16} style={{ color: 'var(--green)' }} />
            ) : (
              <XCircle size={16} style={{ color: 'var(--red)' }} />
            )}
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: passFail === 'pass' ? 'var(--green)' : 'var(--red)',
              }}
            >
              {passFail === 'pass' ? 'PASS' : 'FAIL'}
            </span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              — Result {resultValue} {resultUnit} vs threshold{' '}
              {threshold.direction === 'gte' ? '≥' : '≤'} {threshold.value} {threshold.unit}
            </span>
          </div>
        )}

        {/* Submit */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="submit"
            className="btn"
            disabled={submitting || !canSubmit}
            style={{ opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? 'Recording…' : 'Record Result'}
          </button>
        </div>
      </form>
    </section>
  );
}
