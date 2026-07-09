// ─── Remote Desktop Marketplace — ResourceDetailView ─────────────────────────
//
// Full listing detail page. Shows all resource info, availability calendar,
// reviews, owner profile link, and booking CTA.

import { useState, useEffect, useCallback } from 'react';
import { Heart } from 'lucide-react';
import { apiFetch } from '@/lib/apiClient';
import type {
  ResourceListing,
  ReviewRecord,
  OwnerProfile,
  CalendarSlot,
} from '../types';
import { useFavourites } from '../hooks/useFavourites';
import { useAvailability } from '../hooks/useAvailability';
import { AvailabilityCalendar } from './AvailabilityCalendar';

// ─── Props ────────────────────────────────────────────────────────────────────

interface ResourceDetailViewProps {
  listingId: string;
  onBack: () => void;
  user: { role: string };
}

// ─── Helper: Format ZAR currency ──────────────────────────────────────────────

function formatZar(amount: number): string {
  return `R${amount.toFixed(2)}`;
}

// ─── Helper: Determine session readiness from heartbeat ───────────────────────

function getSessionReadiness(lastHeartbeatAt: string | null): {
  label: string;
  status: 'ready' | 'stale' | 'unreachable';
} {
  if (!lastHeartbeatAt) {
    return { label: 'Unreachable', status: 'unreachable' };
  }

  const elapsed = Date.now() - new Date(lastHeartbeatAt).getTime();
  const seconds = elapsed / 1000;

  if (seconds <= 60) return { label: 'Ready', status: 'ready' };
  if (seconds <= 300) return { label: 'Stale', status: 'stale' };
  return { label: 'Unreachable', status: 'unreachable' };
}

// ─── Helper: Format date for display ──────────────────────────────────────────

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ResourceDetailView({
  listingId,
  onBack,
}: ResourceDetailViewProps) {
  const [listing, setListing] = useState<ResourceListing | null>(null);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [ownerProfile, setOwnerProfile] = useState<OwnerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const { isFavourited, addFavourite, removeFavourite } = useFavourites();
  const availability = useAvailability(listingId, listing?.hourlyRateZar ?? 0);

  // ─── Fetch listing data ───────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setIsLoading(true);
      setNotFound(false);

      try {
        const listingRes = await apiFetch(
          `/api/remote-desktop-marketplace/listings/${listingId}`
        );

        if (!listingRes.ok) {
          if (listingRes.status === 404) {
            setNotFound(true);
            return;
          }
          throw new Error('Failed to load listing');
        }

        const listingData: ResourceListing = await listingRes.json();
        if (cancelled) return;
        setListing(listingData);

        // Fetch reviews and owner profile in parallel
        const [reviewsRes, ownerRes] = await Promise.all([
          apiFetch(
            `/api/remote-desktop-marketplace/listings/${listingId}/reviews?limit=5`
          ),
          apiFetch(
            `/api/remote-desktop-marketplace/owner/${listingData.ownerId}`
          ),
        ]);

        if (cancelled) return;

        if (reviewsRes.ok) {
          const reviewsData = await reviewsRes.json();
          setReviews(reviewsData.reviews ?? reviewsData ?? []);
        }

        if (ownerRes.ok) {
          setOwnerProfile(await ownerRes.json());
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [listingId]);

  // ─── Favourite toggle ─────────────────────────────────────────────────────

  const handleFavouriteToggle = useCallback(() => {
    if (isFavourited(listingId)) {
      removeFavourite(listingId);
    } else {
      addFavourite(listingId);
    }
  }, [listingId, isFavourited, addFavourite, removeFavourite]);

  // ─── Slot selection handler ───────────────────────────────────────────────

  const handleSlotsSelected = useCallback((_slots: CalendarSlot[]) => {
    // Will be consumed by BookingRequestForm (future task)
  }, []);

  // ─── 404 State ────────────────────────────────────────────────────────────

  if (notFound) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <section className="panel" style={{ textAlign: 'center', padding: 44 }}>
          <h2 style={{ color: 'var(--ink)', marginBottom: 8 }}>
            Resource No Longer Available
          </h2>
          <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
            This resource listing has been removed or does not exist.
          </p>
          <button className="btn" onClick={onBack}>
            Back to Catalogue
          </button>
        </section>
      </div>
    );
  }

  // ─── Loading State ────────────────────────────────────────────────────────

  if (isLoading || !listing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <section className="panel" style={{ padding: 44, textAlign: 'center' }}>
          <p style={{ color: 'var(--muted)' }}>Loading resource details…</p>
        </section>
      </div>
    );
  }

  // ─── Derived values ───────────────────────────────────────────────────────

  const readiness = getSessionReadiness(listing.lastHeartbeatAt);
  const isFav = isFavourited(listingId);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Back link */}
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
        ← Back to Catalogue
      </button>

      {/* Unreachable warning banner */}
      {readiness.status === 'unreachable' && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: 12,
            background: 'rgba(245,166,35,.08)',
            border: '1px solid rgba(245,166,35,.18)',
            color: 'var(--amber)',
            fontSize: 13,
          }}
        >
          ⚠ This resource may not be available for immediate sessions. The
          machine has not responded recently. Consider contacting the owner
          before booking.
        </div>
      )}

      {/* Main info panel */}
      <section className="panel">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: 1 }}>
            <h1 style={{ color: 'var(--ink)', fontSize: 22, margin: 0 }}>
              {listing.name}
            </h1>
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                marginTop: 8,
                flexWrap: 'wrap',
              }}
            >
              <span className="pill">
                <span className="dot"></span> {listing.locationTag}
              </span>
              <span
                className="pill"
                style={{
                  color:
                    readiness.status === 'ready'
                      ? 'var(--green)'
                      : readiness.status === 'stale'
                        ? 'var(--amber)'
                        : 'var(--red)',
                  background:
                    readiness.status === 'ready'
                      ? 'rgba(74,222,128,.1)'
                      : readiness.status === 'stale'
                        ? 'rgba(245,166,35,.08)'
                        : 'rgba(217,87,71,.06)',
                  borderColor:
                    readiness.status === 'ready'
                      ? 'rgba(74,222,128,.18)'
                      : readiness.status === 'stale'
                        ? 'rgba(245,166,35,.18)'
                        : 'rgba(217,87,71,.18)',
                }}
              >
                <span className="dot"></span> {readiness.label}
              </span>
              <span
                className="pill"
                style={{
                  color: 'var(--muted)',
                  background: 'rgba(16,32,51,.04)',
                  borderColor: 'var(--border)',
                }}
              >
                {listing.sessionRecordingEnabled
                  ? '● Recording Enabled'
                  : '○ No Recording'}
              </span>
            </div>
          </div>

          {/* Favourite button */}
          <button
            onClick={handleFavouriteToggle}
            aria-label={isFav ? 'Remove from favourites' : 'Save to favourites'}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 8,
              color: isFav ? 'var(--red)' : 'var(--muted)',
            }}
          >
            <Heart
              size={24}
              fill={isFav ? 'var(--red)' : 'none'}
              stroke="currentColor"
            />
          </button>
        </div>

        {/* Description */}
        <p
          style={{
            color: 'var(--ink)',
            fontSize: 14,
            lineHeight: 1.6,
            marginTop: 16,
          }}
        >
          {listing.description}
        </p>
      </section>

      {/* Software applications */}
      <section className="panel">
        <h2 style={{ color: 'var(--deep)', fontSize: 13, marginBottom: 12 }}>
          SOFTWARE APPLICATIONS
        </h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {listing.softwareApplications.map((app) => (
            <span
              key={`${app.name}-${app.version}`}
              className="pill"
              style={{
                color: 'var(--teal)',
                background: 'rgba(25,183,176,.06)',
                borderColor: 'rgba(25,183,176,.18)',
              }}
            >
              {app.name} v{app.version}
            </span>
          ))}
        </div>
      </section>

      {/* Hardware specs — stat cards */}
      <section className="panel">
        <h2 style={{ color: 'var(--deep)', fontSize: 13, marginBottom: 12 }}>
          HARDWARE SPECIFICATIONS
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 12,
          }}
        >
          <div className="stat-card">
            <div className="stat-value">{listing.hardwareSpecs.cpu}</div>
            <div className="stat-label">CPU</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{listing.hardwareSpecs.ramGb} GB</div>
            <div className="stat-label">RAM</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{listing.hardwareSpecs.gpu}</div>
            <div className="stat-label">GPU</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {listing.hardwareSpecs.storageGb} GB
            </div>
            <div className="stat-label">Storage</div>
          </div>
        </div>
      </section>

      {/* Pricing and booking constraints */}
      <section className="panel">
        <h2 style={{ color: 'var(--deep)', fontSize: 13, marginBottom: 12 }}>
          PRICING &amp; BOOKING
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 12,
          }}
        >
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--teal)' }}>
              {formatZar(listing.hourlyRateZar)}/hr
            </div>
            <div className="stat-label">Hourly Rate</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{listing.minBookingHours}h</div>
            <div className="stat-label">Min Booking</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{listing.maxBookingHours}h</div>
            <div className="stat-label">Max Booking</div>
          </div>
        </div>
      </section>

      {/* Aggregate rating + reviews */}
      <section className="panel">
        <h2 style={{ color: 'var(--deep)', fontSize: 13, marginBottom: 12 }}>
          REVIEWS
        </h2>

        {listing.totalReviews === 0 || listing.averageRating === null ? (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            No reviews available yet. Be the first to book and review this
            resource.
          </p>
        ) : (
          <>
            {/* Aggregate score */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 16,
              }}
            >
              <span
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  color: 'var(--teal)',
                }}
              >
                {listing.averageRating.toFixed(1)}
              </span>
              <span style={{ color: 'var(--amber)', fontSize: 18 }}>
                {'★'.repeat(Math.round(listing.averageRating))}
                {'☆'.repeat(5 - Math.round(listing.averageRating))}
              </span>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                ({listing.totalReviews}{' '}
                {listing.totalReviews === 1 ? 'review' : 'reviews'})
              </span>
            </div>

            {/* Recent reviews list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {reviews.map((review) => (
                <div
                  key={review.id}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: 'rgba(255,255,255,.5)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 6,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong style={{ color: 'var(--ink)', fontSize: 13 }}>
                        {review.consumerDisplayName}
                      </strong>
                      <span style={{ color: 'var(--amber)', fontSize: 12 }}>
                        {'★'.repeat(review.rating)}
                        {'☆'.repeat(5 - review.rating)}
                      </span>
                    </div>
                    <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                      {formatDate(review.createdAt)}
                    </span>
                  </div>
                  {review.comment && (
                    <p
                      style={{
                        color: 'var(--ink)',
                        fontSize: 13,
                        lineHeight: 1.5,
                        margin: 0,
                      }}
                    >
                      {review.comment}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Owner profile link */}
      {ownerProfile && (
        <section className="panel">
          <h2 style={{ color: 'var(--deep)', fontSize: 13, marginBottom: 12 }}>
            RESOURCE OWNER
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {ownerProfile.profileImageUrl && (
              <img
                src={ownerProfile.profileImageUrl}
                alt={ownerProfile.firmName}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '1px solid var(--border)',
                }}
              />
            )}
            <div>
              <strong style={{ color: 'var(--ink)', fontSize: 14 }}>
                {ownerProfile.firmName}
              </strong>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  marginTop: 4,
                  flexWrap: 'wrap',
                }}
              >
                {ownerProfile.isIdentityVerified && (
                  <span
                    className="pill"
                    style={{
                      color: 'var(--green)',
                      background: 'rgba(74,222,128,.1)',
                      borderColor: 'rgba(74,222,128,.18)',
                      fontSize: 11,
                    }}
                  >
                    ✓ Verified
                  </span>
                )}
                <span
                  style={{ color: 'var(--muted)', fontSize: 12 }}
                >
                  {ownerProfile.totalCompletedSessions} sessions completed
                </span>
                <span
                  style={{ color: 'var(--muted)', fontSize: 12 }}
                >
                  Member since {formatDate(ownerProfile.memberSince)}
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Availability calendar */}
      <section className="panel">
        <h2 style={{ color: 'var(--deep)', fontSize: 13, marginBottom: 12 }}>
          AVAILABILITY
        </h2>
        <AvailabilityCalendar
          listingId={listingId}
          hourlyRate={listing.hourlyRateZar}
          onSlotsSelected={handleSlotsSelected}
          availabilityHook={availability}
        />
      </section>

      {/* Book CTA */}
      <button
        className="btn"
        style={{
          width: '100%',
          height: 48,
          fontSize: 15,
          fontWeight: 600,
          background: 'var(--teal)',
          color: 'var(--white)',
          borderColor: 'var(--teal)',
          borderRadius: 12,
        }}
      >
        Book This Resource
      </button>
    </div>
  );
}

export default ResourceDetailView;
