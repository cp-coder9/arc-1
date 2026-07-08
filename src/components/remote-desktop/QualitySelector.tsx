/**
 * QualitySelector — Quality profile picker for Remote Desktop sessions
 *
 * Renders a compact set of pill-style radio buttons allowing the consumer
 * to manually select a quality profile (High, Balanced, Low) or re-enable
 * automatic bandwidth adaptation (Auto).
 *
 * On manual selection, the component communicates to the Host Agent via
 * the signalling channel to suspend automatic adaptation.
 *
 * Requirements: 6.7, 10.3
 */

import React from 'react';
import { Monitor, Gauge } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type QualitySelectorProfile = 'high' | 'balanced' | 'low' | 'auto';

export interface QualitySelectorProps {
  /** Currently active quality profile */
  currentProfile: QualitySelectorProfile;
  /** Callback when the user selects a profile */
  onSelect: (profile: QualitySelectorProfile) => void;
}

// ─── Profile metadata ───────────────────────────────────────────────────────────

interface ProfileOption {
  id: QualitySelectorProfile;
  label: string;
  detail: string;
}

const PROFILE_OPTIONS: ProfileOption[] = [
  { id: 'high', label: 'High', detail: '1080p / 30fps' },
  { id: 'balanced', label: 'Balanced', detail: '720p / 24fps' },
  { id: 'low', label: 'Low', detail: '480p / 15fps' },
  { id: 'auto', label: 'Auto', detail: 'Adaptive' },
];

// ─── Component ──────────────────────────────────────────────────────────────────

export function QualitySelector({ currentProfile, onSelect }: QualitySelectorProps) {
  return (
    <div style={styles.container}>
      <span style={styles.icon}>
        <Gauge size={14} />
      </span>
      <div style={styles.options}>
        {PROFILE_OPTIONS.map((option) => {
          const isActive = currentProfile === option.id;
          return (
            <button
              key={option.id}
              type="button"
              className="pill"
              onClick={() => onSelect(option.id)}
              style={{
                ...styles.option,
                color: isActive ? 'var(--teal)' : 'var(--muted)',
                background: isActive
                  ? 'rgba(25, 183, 176, 0.1)'
                  : 'rgba(16, 32, 51, 0.04)',
                borderColor: isActive
                  ? 'rgba(25, 183, 176, 0.18)'
                  : 'var(--border)',
                fontWeight: isActive ? 600 : 400,
              }}
              aria-pressed={isActive}
              aria-label={`${option.label} quality: ${option.detail}`}
            >
              {option.id === 'auto' && (
                <Monitor size={12} style={{ marginRight: 3, flexShrink: 0 }} />
              )}
              <span style={styles.label}>{option.label}</span>
              <span style={styles.detail}>{option.detail}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  icon: {
    display: 'flex',
    alignItems: 'center',
    color: 'var(--muted)',
  },
  options: {
    display: 'flex',
    gap: 4,
    flexWrap: 'nowrap',
  },
  option: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    cursor: 'pointer',
    border: '1px solid',
    borderRadius: 999,
    padding: '4px 10px',
    fontSize: 11,
    lineHeight: '16px',
    transition: 'all 0.15s ease',
    whiteSpace: 'nowrap',
  },
  label: {
    fontSize: 11,
    fontWeight: 'inherit',
  },
  detail: {
    fontSize: 10,
    opacity: 0.7,
  },
};

export default QualitySelector;
