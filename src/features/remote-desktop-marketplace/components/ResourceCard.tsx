// ─── Remote Desktop Marketplace — ResourceCard ──────────────────────────────
//
// Individual listing card in the catalogue grid.
// Uses `.panel` container with hover state. Uses var(--teal) for interactive elements.

import { Heart } from 'lucide-react';
import type { ResourceListingSummary } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ResourceCardProps {
  listing: ResourceListingSummary;
  isFavourited: boolean;
  onToggleFavourite: (listingId: string) => void;
  onSelect: (listingId: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Truncate name to 60 chars with ellipsis */
function truncateName(name: string): string {
  if (name.length <= 60) return name;
  return name.slice(0, 60) + '…';
}

/** Format hourly rate in ZAR */
function formatRate(rateZar: number): string {
  return `R${rateZar}/hr`;
}

/** Format average rating to 1 decimal place */
function formatRating(rating: number | null): string | null {
  if (rating === null) return null;
  return rating.toFixed(1);
}

/** Determine session-readiness status from heartbeat timestamp */
export function getSessionReadiness(
  lastHeartbeatAt: string | null
): 'ready' | 'stale' | 'unreachable' {
  if (!lastHeartbeatAt) return 'unreachable';

  const now = Date.now();
  const heartbeat = new Date(lastHeartbeatAt).getTime();
  const diffSeconds = (now - heartbeat) / 1000;

  if (diffSeconds <= 60) return 'ready';
  if (diffSeconds <= 300) return 'stale';
  return 'unreachable';
}

/** Get readiness pill styles */
function getReadinessStyles(status: 'ready' | 'stale' | 'unreachable'): React.CSSProperties {
  switch (status) {
    case 'ready':
      return {
        color: 'var(--green)',
        background: 'rgba(74,222,128,.1)',
        borderColor: 'rgba(74,222,128,.18)',
      };
    case 'stale':
      return {
        color: 'var(--amber)',
        background: 'rgba(245,166,35,.08)',
        borderColor: 'rgba(245,166,35,.18)',
      };
    case 'unreachable':
      return {
        color: 'var(--red)',
        background: 'rgba(217,87,71,.06)',
        borderColor: 'rgba(217,87,71,.18)',
      };
  }
}

/** Get readiness label */
function getReadinessLabel(status: 'ready' | 'stale' | 'unreachable'): string {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'stale':
      return 'Stale';
    case 'unreachable':
      return 'Unreachable';
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ResourceCard({
  listing,
  isFavourited,
  onToggleFavourite,
  onSelect,
}: ResourceCardProps) {
  const readiness = getSessionReadiness(listing.lastHeartbeatAt);
  const readinessStyles = getReadinessStyles(readiness);
  const readinessLabel = getReadinessLabel(readiness);
  const displayRating = formatRating(listing.averageRating);

  return (
    <article
      className="panel"
      style={{
        cursor: 'pointer',
        transition: 'box-shadow 0.2s ease, transform 0.15s ease',
        position: 'relative',
      }}
      onClick={() => onSelect(listing.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(listing.id);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`View details for ${listing.name}`}
    >
      {/* Favourite heart icon */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavourite(listing.id);
        }}
        aria-label={isFavourited ? 'Remove from favourites' : 'Add to favourites'}
        style={{
          position: 'absolute',
          top: 14,
          right: 14,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 4,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: isFavourited ? 'var(--red)' : 'var(--muted)',
          transition: 'color 0.2s ease',
        }}
      >
        <Heart
          size={18}
          fill={isFavourited ? 'currentColor' : 'none'}
          strokeWidth={2}
        />
      </button>

      {/* Resource name */}
      <h3
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--ink)',
          marginBottom: 8,
          paddingRight: 30,
          lineHeight: 1.3,
        }}
        title={listing.name}
      >
        {truncateName(listing.name)}
      </h3>

      {/* Software category badge */}
      <span
        className="pill"
        style={{
          fontSize: 10,
          marginBottom: 10,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <span className="dot" />
        {listing.primaryCategory}
      </span>

      {/* Hourly rate */}
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: 'var(--deep)',
          marginBottom: 6,
        }}
      >
        {formatRate(listing.hourlyRateZar)}
      </div>

      {/* Rating */}
      <div
        style={{
          fontSize: 12,
          color: 'var(--muted)',
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {displayRating ? (
          <>
            <span style={{ color: 'var(--amber)' }}>★</span>
            <span>{displayRating}</span>
            <span style={{ color: 'var(--muted)', fontSize: 11 }}>
              ({listing.totalReviews})
            </span>
          </>
        ) : (
          <span style={{ fontStyle: 'italic' }}>No ratings yet</span>
        )}
      </div>

      {/* Location tag */}
      <div
        style={{
          fontSize: 11,
          color: 'var(--muted)',
          marginBottom: 10,
        }}
      >
        📍 {listing.locationTag}
      </div>

      {/* Session readiness indicator */}
      <span
        className="pill"
        style={{
          fontSize: 10,
          ...readinessStyles,
        }}
      >
        <span
          className="dot"
          style={{ background: 'currentColor' }}
        />
        {readinessLabel}
      </span>
    </article>
  );
}
