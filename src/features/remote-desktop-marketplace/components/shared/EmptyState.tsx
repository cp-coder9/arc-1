import React from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmptyStateProps {
  icon?: React.ReactNode;
  heading: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EmptyState({
  icon,
  heading,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <section
      className="panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '48px 24px',
        gap: 12,
      }}
    >
      {icon && (
        <div style={{ color: 'var(--muted)', marginBottom: 4 }}>
          {icon}
        </div>
      )}

      <h3
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--ink)',
          margin: 0,
        }}
      >
        {heading}
      </h3>

      {description && (
        <p
          style={{
            fontSize: 13,
            color: 'var(--muted)',
            margin: 0,
            maxWidth: 360,
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>
      )}

      {actionLabel && onAction && (
        <button
          className="btn"
          onClick={onAction}
          style={{ marginTop: 8 }}
        >
          {actionLabel}
        </button>
      )}
    </section>
  );
}

export default EmptyState;
