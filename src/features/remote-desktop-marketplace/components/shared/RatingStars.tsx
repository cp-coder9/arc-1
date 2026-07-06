import React from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RatingStarsDisplayProps {
  mode: 'display';
  rating: number;
  totalReviews?: number;
  size?: number;
}

export interface RatingStarsInputProps {
  mode: 'input';
  value: number;
  onChange: (rating: number) => void;
  size?: number;
}

export type RatingStarsProps = RatingStarsDisplayProps | RatingStarsInputProps;

// ─── Star SVG Helpers ─────────────────────────────────────────────────────────

function FilledStar({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="var(--amber)"
      stroke="var(--amber)"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function HalfStar({ size }: { size: number }) {
  const clipId = React.useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width="12" height="24" />
        </clipPath>
      </defs>
      {/* Empty star background */}
      <path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        fill="none"
        stroke="var(--amber)"
        strokeWidth={1.5}
      />
      {/* Filled half */}
      <path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        fill="var(--amber)"
        stroke="var(--amber)"
        strokeWidth={1.5}
        clipPath={`url(#${clipId})`}
      />
    </svg>
  );
}

function EmptyStar({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--amber)"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

// ─── Display Mode ─────────────────────────────────────────────────────────────

function RatingStarsDisplay({ rating, totalReviews, size = 16 }: Omit<RatingStarsDisplayProps, 'mode'>) {
  const stars: React.ReactNode[] = [];

  for (let i = 1; i <= 5; i++) {
    if (rating >= i) {
      stars.push(<FilledStar key={i} size={size} />);
    } else if (rating >= i - 0.5) {
      stars.push(<HalfStar key={i} size={size} />);
    } else {
      stars.push(<EmptyStar key={i} size={size} />);
    }
  }

  return (
    <div
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
      aria-label={`Rating: ${rating.toFixed(1)} out of 5 stars${totalReviews !== undefined ? `, ${totalReviews} reviews` : ''}`}
    >
      <div style={{ display: 'flex', gap: 2 }}>{stars}</div>
      <span style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>
        {rating.toFixed(1)}
      </span>
      {totalReviews !== undefined && (
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          ({totalReviews})
        </span>
      )}
    </div>
  );
}

// ─── Input Mode ───────────────────────────────────────────────────────────────

function RatingStarsInput({ value, onChange, size = 24 }: Omit<RatingStarsInputProps, 'mode'>) {
  const [hovered, setHovered] = React.useState<number>(0);
  const displayValue = hovered || value;

  return (
    <div
      style={{ display: 'inline-flex', gap: 2 }}
      role="radiogroup"
      aria-label="Rating selection"
      onMouseLeave={() => setHovered(0)}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          aria-label={`${star} star${star > 1 ? 's' : ''}`}
          aria-checked={value === star}
          role="radio"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 2,
            display: 'inline-flex',
          }}
        >
          {displayValue >= star ? (
            <FilledStar size={size} />
          ) : (
            <EmptyStar size={size} />
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function RatingStars(props: RatingStarsProps) {
  if (props.mode === 'display') {
    const { mode: _, ...rest } = props;
    return <RatingStarsDisplay {...rest} />;
  }
  const { mode: _, ...rest } = props;
  return <RatingStarsInput {...rest} />;
}

export default RatingStars;
