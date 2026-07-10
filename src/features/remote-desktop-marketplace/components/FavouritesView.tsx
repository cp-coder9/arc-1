// ─── Remote Desktop Marketplace — FavouritesView ─────────────────────────────
//
// The Favourites tab content — displays saved listings sorted by most-recently-added
// first, with removal, availability indicators, and empty/limit states.

import { Heart, AlertTriangle } from 'lucide-react';
import { useFavourites } from '../hooks/useFavourites';
import { MAX_FAVOURITES } from '../constants';
import type { FavouriteEntry } from '../types';
import RatingStars from './shared/RatingStars';
import SessionReadinessIndicator from './shared/SessionReadinessIndicator';
import EmptyState from './shared/EmptyState';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FavouritesViewProps {
  onSelectListing: (listingId: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FavouritesView({ onSelectListing }: FavouritesViewProps) {
  const { favourites, isLoading, error, removeFavourite, refresh } = useFavourites();

  // Sort by most-recently-added first (addedAt descending)
  const sortedFavourites = [...favourites].sort(
    (a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
  );

  const isAtLimit = favourites.length >= MAX_FAVOURITES;

  // ─── Loading state ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="panel"
            style={{
              height: 72,
              animation: 'pulse 1.5s infinite',
              background:
                'linear-gradient(90deg, rgba(255,255,255,.74) 25%, rgba(223,245,242,.3) 50%, rgba(255,255,255,.74) 75%)',
              backgroundSize: '200% 100%',
            }}
            aria-hidden="true"
          />
        ))}
      </div>
    );
  }

  // ─── Error state ────────────────────────────────────────────────────────────

  if (error) {
    return (
      <section className="panel" style={{ textAlign: 'center', padding: 40 }}>
        <p style={{ color: 'var(--red)', marginBottom: 12, fontSize: 13 }}>
          {error}
        </p>
        <button className="btn" onClick={refresh}>
          Retry
        </button>
      </section>
    );
  }

  // ─── Empty state ────────────────────────────────────────────────────────────

  if (sortedFavourites.length === 0) {
    return (
      <EmptyState
        icon={<Heart size={32} />}
        heading="No Favourites Yet"
        description="Browse the Catalogue and save interesting resources by tapping the heart icon. Your favourites will appear here for quick access."
        actionLabel="Browse Catalogue"
        onAction={() => {
          /* Navigate to Browse tab — handled by parent via tab switch */
        }}
      />
    );
  }

  // ─── List view ──────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Limit-reached inline message */}
      {isAtLimit && (
        <div
          className="panel"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 18px',
            background: 'rgba(245,166,35,.06)',
            borderColor: 'rgba(245,166,35,.18)',
          }}
          role="alert"
        >
          <AlertTriangle size={16} style={{ color: 'var(--amber)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--amber)' }}>
            You've reached the maximum of {MAX_FAVOURITES} favourites. Remove some to add new ones.
          </span>
        </div>
      )}

      {/* Favourites list */}
      <section className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        {sortedFavourites.map((entry, index) => (
          <FavouriteRow
            key={entry.listingId}
            entry={entry}
            isLast={index === sortedFavourites.length - 1}
            onSelect={onSelectListing}
            onRemove={removeFavourite}
          />
        ))}
      </section>
    </div>
  );
}

// ─── Favourite Row ────────────────────────────────────────────────────────────

interface FavouriteRowProps {
  key?: string | number;
  entry: FavouriteEntry;
  isLast: boolean;
  onSelect: (listingId: string) => void;
  onRemove: (listingId: string) => Promise<void>;
}

function FavouriteRow({ entry, isLast, onSelect, onRemove }: FavouriteRowProps) {
  const isUnavailable = entry.listingStatus === 'removed' || entry.listingStatus === 'paused';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 18px',
        borderBottom: isLast ? 'none' : '1px solid var(--border)',
        opacity: isUnavailable ? 0.55 : 1,
        cursor: isUnavailable ? 'default' : 'pointer',
        transition: 'background 0.15s ease',
      }}
      onClick={!isUnavailable ? () => onSelect(entry.listingId) : undefined}
      role={!isUnavailable ? 'button' : undefined}
      tabIndex={!isUnavailable ? 0 : undefined}
      aria-label={
        isUnavailable
          ? `${entry.listingName} — No longer available`
          : `View ${entry.listingName}`
      }
      onKeyDown={
        !isUnavailable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(entry.listingId);
              }
            }
          : undefined
      }
    >
      {/* Resource name + category */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 4,
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--ink)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {entry.listingName}
          </span>
          {isUnavailable && (
            <span
              className="pill"
              style={{
                color: 'var(--muted)',
                background: 'rgba(16,32,51,.04)',
                borderColor: 'var(--border)',
                fontSize: 10,
              }}
            >
              No Longer Available
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Software category pill */}
          <span
            className="pill"
            style={{ fontSize: 11 }}
          >
            <span className="dot" />
            {entry.softwareCategory}
          </span>

          {/* Hourly rate */}
          <span style={{ fontSize: 12, color: 'var(--deep)', fontWeight: 600 }}>
            R{entry.hourlyRateZar}/hr
          </span>

          {/* Average rating */}
          {entry.averageRating !== null && (
            <RatingStars mode="display" rating={entry.averageRating} size={14} />
          )}
          {entry.averageRating === null && (
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>No ratings</span>
          )}
        </div>
      </div>

      {/* Session readiness indicator */}
      <div style={{ flexShrink: 0 }}>
        <SessionReadinessIndicator lastHeartbeatAt={null} />
      </div>

      {/* Remove button */}
      <button
        className="btn"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(entry.listingId);
        }}
        style={{
          fontSize: 11,
          height: 28,
          padding: '0 10px',
          flexShrink: 0,
          borderColor: 'rgba(217,87,71,.18)',
          background: 'rgba(217,87,71,.06)',
          color: 'var(--red)',
        }}
        aria-label={`Remove ${entry.listingName} from favourites`}
      >
        Remove
      </button>
    </div>
  );
}
