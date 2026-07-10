// ─── Remote Desktop Marketplace — OwnerProfileView ───────────────────────────
//
// Owner profile page. Displays firm info, trust indicators, active listings
// as mini-cards, and recent reviews. Accessible at
// /remote-desktop/marketplace/owner/:ownerUid.
//
// Privacy: NO email, phone, or address displayed.
// 404 handling: Generic "Profile unavailable" message — no account status leak.

import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Monitor, User, ExternalLink, Award } from 'lucide-react';
import type { ReviewRecord, ResourceListing } from '../types';
import { useOwnerProfile } from '../hooks/useOwnerProfile';
import { TrustBadges } from './shared/TrustBadges';
import { RatingStars } from './shared/RatingStars';
import { ReviewList } from './ReviewList';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface OwnerProfileViewProps {
  ownerUid: string;
  onBack: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function calculateTenure(memberSince: string): string {
  const start = new Date(memberSince);
  const now = new Date();
  const months =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth());

  if (months < 1) return 'Less than a month';
  if (months === 1) return '1 month';
  if (months < 12) return `${months} months`;
  const years = Math.floor(months / 12);
  const remaining = months % 12;
  if (remaining === 0) return `${years} year${years > 1 ? 's' : ''}`;
  return `${years} year${years > 1 ? 's' : ''}, ${remaining} month${remaining > 1 ? 's' : ''}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OwnerProfileView({ ownerUid, onBack }: OwnerProfileViewProps) {
  const { profile, listings, isLoading, error } = useOwnerProfile(ownerUid);

  // Only active listings, capped at 50
  const activeListings = useMemo(
    () => listings.filter((l) => l.status === 'active').slice(0, 50),
    [listings]
  );

  // Fetch the 10 most recent reviews for this owner
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);

  useEffect(() => {
    if (!ownerUid) return;
    let cancelled = false;

    async function fetchReviews() {
      try {
        const res = await fetch(
          `/api/remote-desktop-marketplace/owner/${ownerUid}/reviews?limit=10`
        );
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setReviews(data.reviews ?? data ?? []);
        }
      } catch {
        // Reviews are non-critical — fail silently
      }
    }

    fetchReviews();
    return () => { cancelled = true; };
  }, [ownerUid]);

  // ─── Loading state ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <section className="panel" style={{ padding: 44, textAlign: 'center' }}>
          <p style={{ color: 'var(--muted)' }}>Loading owner profile…</p>
        </section>
      </div>
    );
  }

  // ─── Error / 404 state (generic — no account status leak) ───────────────────

  if (error || !profile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <section className="panel" style={{ textAlign: 'center', padding: 44 }}>
          <h2 style={{ color: 'var(--ink)', marginBottom: 8 }}>
            Profile Unavailable
          </h2>
          <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
            This owner profile is not available at the moment.
          </p>
          <button className="btn" onClick={onBack}>
            ← Back
          </button>
        </section>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Back button */}
      <button
        onClick={onBack}
        className="btn"
        style={{
          alignSelf: 'flex-start',
          background: 'rgba(255,255,255,.7)',
          borderColor: 'var(--border)',
          color: 'var(--ink)',
        }}
      >
        <ArrowLeft size={14} style={{ marginRight: 6 }} />
        Back
      </button>

      {/* Profile header panel */}
      <section className="panel">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            flexWrap: 'wrap',
          }}
        >
          {/* Profile image (rounded) */}
          {profile.profileImageUrl ? (
            <img
              src={profile.profileImageUrl}
              alt={profile.firmName}
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                objectFit: 'cover',
                border: '2px solid var(--border)',
              }}
            />
          ) : (
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: 'var(--aqua)',
                border: '2px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <User size={32} color="var(--teal)" />
            </div>
          )}

          <div style={{ flex: 1 }}>
            <h1 style={{ color: 'var(--ink)', fontSize: 22, margin: 0 }}>
              {profile.firmName}
            </h1>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
              {/* "New Owner" badge if < 5 sessions */}
              {profile.isNewOwner && (
                <span
                  className="pill"
                  style={{
                    color: 'var(--amber)',
                    background: 'rgba(245,166,35,.08)',
                    borderColor: 'rgba(245,166,35,.18)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Award size={13} />
                  New Owner
                </span>
              )}

              {/* Aggregate rating */}
              {profile.aggregateRating !== null && (
                <RatingStars
                  mode="display"
                  rating={profile.aggregateRating}
                  totalReviews={profile.totalCompletedSessions}
                  size={14}
                />
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        {profile.description && (
          <p
            style={{
              color: 'var(--ink)',
              fontSize: 14,
              lineHeight: 1.6,
              marginTop: 16,
            }}
          >
            {profile.description}
          </p>
        )}
      </section>

      {/* Stats: tenure, total sessions */}
      <section className="panel">
        <h2 style={{ color: 'var(--deep)', fontSize: 13, marginBottom: 12 }}>
          OVERVIEW
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 12,
          }}
        >
          <div className="stat-card">
            <div className="stat-value">{calculateTenure(profile.memberSince)}</div>
            <div className="stat-label">Platform Tenure</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{profile.totalCompletedSessions}</div>
            <div className="stat-label">Total Sessions</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{formatDate(profile.memberSince)}</div>
            <div className="stat-label">Member Since</div>
          </div>
        </div>
      </section>

      {/* Trust indicators */}
      <section className="panel">
        <h2 style={{ color: 'var(--deep)', fontSize: 13, marginBottom: 12 }}>
          TRUST INDICATORS
        </h2>
        <TrustBadges profile={profile} />
      </section>

      {/* Active listings grid (up to 50 mini-cards) */}
      <section className="panel">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <h2 style={{ color: 'var(--deep)', fontSize: 13, margin: 0 }}>
            ACTIVE LISTINGS ({activeListings.length})
          </h2>
          <button
            className="btn"
            onClick={onBack}
            style={{
              background: 'rgba(255,255,255,.7)',
              borderColor: 'var(--border)',
              color: 'var(--teal)',
              fontSize: 12,
              padding: '6px 12px',
              height: 30,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <ExternalLink size={12} />
            View Resources
          </button>
        </div>

        {activeListings.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            No active listings at the moment.
          </p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 10,
            }}
          >
            {activeListings.map((listing) => (
              <ListingMiniCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </section>

      {/* Recent reviews (10 most recent) */}
      <section className="panel">
        <h2 style={{ color: 'var(--deep)', fontSize: 13, marginBottom: 12 }}>
          RECENT REVIEWS
        </h2>
        <ReviewList
          reviews={reviews}
          showResourceName
          emptyMessage="No reviews received yet."
        />
      </section>
    </div>
  );
}

// ─── ListingMiniCard ──────────────────────────────────────────────────────────

function ListingMiniCard({ listing }: { key?: string | number; listing: ResourceListing }) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 12,
        border: '1px solid var(--border)',
        background: 'rgba(255,255,255,.6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Monitor size={14} color="var(--teal)" />
        <strong
          style={{
            color: 'var(--ink)',
            fontSize: 12,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {listing.name.length > 40
            ? listing.name.slice(0, 40) + '…'
            : listing.name}
        </strong>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {listing.softwareCategories.slice(0, 2).map((cat) => (
          <span
            key={cat}
            className="pill"
            style={{
              fontSize: 10,
              color: 'var(--muted)',
              background: 'rgba(16,32,51,.04)',
              borderColor: 'var(--border)',
            }}
          >
            {cat}
          </span>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 2,
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600 }}>
          R{listing.hourlyRateZar}/hr
        </span>
        {listing.averageRating !== null && (
          <span style={{ fontSize: 11, color: 'var(--amber)' }}>
            ★ {listing.averageRating.toFixed(1)}
          </span>
        )}
      </div>
    </div>
  );
}

export default OwnerProfileView;
