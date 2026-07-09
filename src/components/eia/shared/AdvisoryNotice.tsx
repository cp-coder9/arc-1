// AdvisoryNotice — Reusable disclaimer banner with advisory language
// All EIA assessments are indicative and advisory only.
// Requirements: 14.5, 14.7

import React from 'react';
import { AlertTriangle } from 'lucide-react';

export interface AdvisoryNoticeProps {
  /** Optional custom advisory text. Falls back to standard disclaimer. */
  text?: string;
}

/**
 * Advisory disclaimer banner displayed across all EIA workspace panels.
 * Reinforces that platform outputs are advisory only and require professional review.
 */
export function AdvisoryNotice({ text }: AdvisoryNoticeProps) {
  const advisoryText =
    text ??
    'All environmental assessments presented here are indicative and advisory only. Results do not constitute a formal determination by a Competent Authority and must not be relied upon as legal advice or regulatory approval.';

  return (
    <section
      className="panel"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '14px 18px',
        borderColor: 'rgba(245,166,35,.18)',
        background: 'rgba(245,166,35,.04)',
      }}
      role="alert"
      aria-label="Advisory notice"
    >
      <AlertTriangle
        size={18}
        style={{ color: 'var(--amber)', flexShrink: 0, marginTop: 2 }}
        aria-hidden="true"
      />
      <div style={{ flex: 1 }}>
        <p
          style={{
            fontSize: 12,
            lineHeight: 1.5,
            color: 'var(--ink)',
            margin: 0,
            fontFamily: 'var(--font)',
          }}
        >
          {advisoryText}
        </p>
        <div style={{ marginTop: 8 }}>
          <span
            className="pill"
            style={{
              color: 'var(--amber)',
              background: 'rgba(245,166,35,.08)',
              borderColor: 'rgba(245,166,35,.18)',
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            <span className="dot" style={{ background: 'var(--amber)' }}></span>
            Professional review required
          </span>
        </div>
      </div>
    </section>
  );
}

export default AdvisoryNotice;
