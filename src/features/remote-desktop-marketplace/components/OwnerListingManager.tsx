import React, { useState, useCallback } from 'react';
import type {
  ResourceListing,
  BookingRecord,
  ReviewRecord,
  MarketplaceApiError,
} from '../types';
import { SOFTWARE_CATEGORIES, SA_LOCATIONS } from '../constants';
import {
  validateListingData,
  publishListing,
  updateListing,
  pauseListing,
  activateListing,
  getListingAnalytics,
} from '../services/listingManagementService';
import type { ListingAnalytics } from '../services/listingManagementService';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface OwnerListingManagerProps {
  user: { role: string };
}

// ─── Form State ───────────────────────────────────────────────────────────────

interface ListingFormData {
  name: string;
  description: string;
  softwareCategories: string[];
  hourlyRateZar: string;
  minBookingHours: string;
  maxBookingHours: string;
  locationTag: string;
  sessionRecordingEnabled: boolean;
}

const EMPTY_FORM: ListingFormData = {
  name: '',
  description: '',
  softwareCategories: [],
  hourlyRateZar: '',
  minBookingHours: '1',
  maxBookingHours: '8',
  locationTag: '',
  sessionRecordingEnabled: false,
};

type ManagerView = 'list' | 'create' | 'edit';

// ─── Component ────────────────────────────────────────────────────────────────

export default function OwnerListingManager({ user }: OwnerListingManagerProps) {
  // Simulated data stores (in a full app, these come from hooks/API)
  const [listings, setListings] = useState<ResourceListing[]>([]);
  const [bookings] = useState<BookingRecord[]>([]);
  const [reviews] = useState<ReviewRecord[]>([]);
  const [viewCounts] = useState<Record<string, number>>({});

  // UI state
  const [view, setView] = useState<ManagerView>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ListingFormData>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [analyticsListingId, setAnalyticsListingId] = useState<string | null>(null);

  // ─── Derived Data ───────────────────────────────────────────────────────────

  const ownerId = 'current-user'; // In real implementation, derive from user auth

  const editingListing = editingId
    ? listings.find((l) => l.id === editingId)
    : null;

  const analyticsData: ListingAnalytics | null = analyticsListingId
    ? getListingAnalytics(
        analyticsListingId,
        bookings,
        reviews,
        viewCounts[analyticsListingId] || 0
      )
    : null;

  // ─── Category Toggle ──────────────────────────────────────────────────────────

  const toggleCategory = useCallback((cat: string) => {
    setFormData((prev) => {
      if (prev.softwareCategories.includes(cat)) {
        return {
          ...prev,
          softwareCategories: prev.softwareCategories.filter((c) => c !== cat),
        };
      }
      if (prev.softwareCategories.length >= 5) return prev;
      return {
        ...prev,
        softwareCategories: [...prev.softwareCategories, cat],
      };
    });
  }, []);

  // ─── Form Submit (Create / Edit) ─────────────────────────────────────────────

  const handleFormSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setFormErrors([]);

      const hourlyRate = parseFloat(formData.hourlyRateZar);
      const minHours = parseInt(formData.minBookingHours, 10);
      const maxHours = parseInt(formData.maxBookingHours, 10);

      const listingData: Partial<ResourceListing> = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        softwareCategories: formData.softwareCategories,
        hourlyRateZar: isNaN(hourlyRate) ? undefined : hourlyRate,
        minBookingHours: isNaN(minHours) ? undefined : minHours,
        maxBookingHours: isNaN(maxHours) ? undefined : maxHours,
        locationTag: formData.locationTag,
        sessionRecordingEnabled: formData.sessionRecordingEnabled,
      };

      // Validate first
      const validation = validateListingData(listingData);
      if (!validation.valid) {
        setFormErrors(validation.errors);
        return;
      }

      setIsSubmitting(true);

      try {
        if (view === 'edit' && editingId) {
          const result = updateListing(ownerId, editingId, listingData, listings);
          if ('error' in result) {
            setFormErrors(
              (result.error.details?.errors as string[]) || [result.error.message]
            );
          } else {
            setListings((prev) =>
              prev.map((l) => (l.id === editingId ? result.listing : l))
            );
            setView('list');
            setEditingId(null);
            setFormData(EMPTY_FORM);
          }
        } else {
          const result = publishListing(ownerId, listingData, listings);
          if ('error' in result) {
            // Draft retention on rejection — do NOT clear form
            setFormErrors(
              (result.error.details?.errors as string[]) || [result.error.message]
            );
          } else {
            setListings((prev) => [...prev, result.listing]);
            setView('list');
            setFormData(EMPTY_FORM);
          }
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [formData, view, editingId, ownerId, listings]
  );

  // ─── Pause/Activate ───────────────────────────────────────────────────────────

  const handlePause = useCallback(
    (listingId: string) => {
      const result = pauseListing(ownerId, listingId, listings, bookings);
      if ('listing' in result) {
        setListings((prev) =>
          prev.map((l) => (l.id === listingId ? result.listing : l))
        );
      }
    },
    [ownerId, listings, bookings]
  );

  const handleActivate = useCallback(
    (listingId: string) => {
      const result = activateListing(ownerId, listingId, listings);
      if ('listing' in result) {
        setListings((prev) =>
          prev.map((l) => (l.id === listingId ? result.listing : l))
        );
      }
    },
    [ownerId, listings]
  );

  // ─── Start Editing ────────────────────────────────────────────────────────────

  const startEdit = useCallback(
    (listing: ResourceListing) => {
      setEditingId(listing.id);
      setFormData({
        name: listing.name,
        description: listing.description,
        softwareCategories: listing.softwareCategories,
        hourlyRateZar: String(listing.hourlyRateZar),
        minBookingHours: String(listing.minBookingHours),
        maxBookingHours: String(listing.maxBookingHours),
        locationTag: listing.locationTag,
        sessionRecordingEnabled: listing.sessionRecordingEnabled,
      });
      setFormErrors([]);
      setView('edit');
    },
    []
  );

  // ─── Status Pill ──────────────────────────────────────────────────────────────

  function renderStatusPill(status: ResourceListing['status']) {
    const statusStyles: Record<string, React.CSSProperties> = {
      active: {
        color: 'var(--green)',
        background: 'rgba(74,222,128,.1)',
        borderColor: 'rgba(74,222,128,.18)',
      },
      paused: {
        color: 'var(--amber)',
        background: 'rgba(245,166,35,.08)',
        borderColor: 'rgba(245,166,35,.18)',
      },
      draft: {
        color: 'var(--muted)',
        background: 'rgba(16,32,51,.04)',
        borderColor: 'var(--border)',
      },
      removed: {
        color: 'var(--red)',
        background: 'rgba(217,87,71,.06)',
        borderColor: 'rgba(217,87,71,.18)',
      },
    };

    return (
      <span className="pill" style={statusStyles[status] || {}}>
        <span className="dot"></span> {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  }

  // ─── Render: Analytics Panel ──────────────────────────────────────────────────

  function renderAnalytics(analytics: ListingAnalytics) {
    return (
      <div style={styles.analyticsGrid}>
        <div className="stat-card" style={styles.statCard}>
          <div className="stat-value">{analytics.totalViews}</div>
          <div className="stat-label">Views</div>
        </div>
        <div className="stat-card" style={styles.statCard}>
          <div className="stat-value">{analytics.totalBookings}</div>
          <div className="stat-label">Bookings</div>
        </div>
        <div className="stat-card" style={styles.statCard}>
          <div className="stat-value">
            {(analytics.bookingConversionRate * 100).toFixed(1)}%
          </div>
          <div className="stat-label">Conversion</div>
        </div>
        <div className="stat-card" style={styles.statCard}>
          <div className="stat-value">
            {analytics.averageRating !== null
              ? analytics.averageRating.toFixed(1)
              : '—'}
          </div>
          <div className="stat-label">Avg Rating</div>
        </div>
        <div className="stat-card" style={styles.statCard}>
          <div className="stat-value">
            R {analytics.monthlyRevenueZar.toLocaleString('en-ZA')}
          </div>
          <div className="stat-label">Monthly Revenue</div>
        </div>
      </div>
    );
  }

  // ─── Render: Listing Form ─────────────────────────────────────────────────────

  function renderForm() {
    return (
      <section className="panel" style={styles.formContainer}>
        <h2 style={styles.heading}>
          {view === 'edit' ? 'Edit Listing' : 'Publish New Listing'}
        </h2>

        {/* Validation Errors */}
        {formErrors.length > 0 && (
          <div style={styles.errorContainer} role="alert">
            {formErrors.map((err, i) => (
              <div key={i} style={styles.errorText}>
                {err}
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleFormSubmit} style={styles.form}>
          {/* Name */}
          <div style={styles.fieldGroup}>
            <label htmlFor="listing-name" style={styles.label}>
              Resource Name
            </label>
            <input
              id="listing-name"
              type="text"
              placeholder="e.g. Revit 2025 Workstation"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              maxLength={100}
              style={styles.input}
            />
            <span style={styles.charCounter}>{formData.name.length}/100</span>
          </div>

          {/* Description */}
          <div style={styles.fieldGroup}>
            <label htmlFor="listing-description" style={styles.label}>
              Description
            </label>
            <textarea
              id="listing-description"
              placeholder="Describe the resource capabilities, installed software, and ideal use cases..."
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, description: e.target.value }))
              }
              rows={4}
              style={styles.textarea}
            />
          </div>

          {/* Software Categories */}
          <div style={styles.fieldGroup}>
            <label style={styles.label}>
              Software Categories
              <span style={styles.optionalTag}>(select 1–5)</span>
            </label>
            <div style={styles.categoryGrid}>
              {SOFTWARE_CATEGORIES.map((cat) => {
                const isSelected = formData.softwareCategories.includes(cat);
                const isDisabled =
                  !isSelected && formData.softwareCategories.length >= 5;
                return (
                  <button
                    key={cat}
                    type="button"
                    className="pill"
                    onClick={() => toggleCategory(cat)}
                    disabled={isDisabled}
                    style={{
                      ...styles.catPill,
                      ...(isSelected ? styles.catPillActive : {}),
                      ...(isDisabled ? styles.catPillDisabled : {}),
                    }}
                    aria-pressed={isSelected}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Hourly Rate */}
          <div style={styles.fieldGroup}>
            <label htmlFor="listing-rate" style={styles.label}>
              Hourly Rate (ZAR)
            </label>
            <input
              id="listing-rate"
              type="number"
              placeholder="R50 – R5000"
              value={formData.hourlyRateZar}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, hourlyRateZar: e.target.value }))
              }
              min={50}
              max={5000}
              style={styles.input}
            />
          </div>

          {/* Min/Max Booking Hours */}
          <div style={styles.fieldRow}>
            <div style={styles.fieldGroup}>
              <label htmlFor="listing-min-hours" style={styles.label}>
                Min Hours
              </label>
              <input
                id="listing-min-hours"
                type="number"
                value={formData.minBookingHours}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    minBookingHours: e.target.value,
                  }))
                }
                min={1}
                max={8}
                style={styles.input}
              />
            </div>
            <div style={styles.fieldGroup}>
              <label htmlFor="listing-max-hours" style={styles.label}>
                Max Hours
              </label>
              <input
                id="listing-max-hours"
                type="number"
                value={formData.maxBookingHours}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    maxBookingHours: e.target.value,
                  }))
                }
                min={1}
                max={24}
                style={styles.input}
              />
            </div>
          </div>

          {/* Location */}
          <div style={styles.fieldGroup}>
            <label htmlFor="listing-location" style={styles.label}>
              Location
            </label>
            <select
              id="listing-location"
              value={formData.locationTag}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, locationTag: e.target.value }))
              }
              style={styles.input}
            >
              <option value="">Select location…</option>
              {SA_LOCATIONS.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>

          {/* Session Recording Toggle */}
          <div style={styles.toggleRow}>
            <label htmlFor="listing-recording" style={styles.label}>
              Session Recording
            </label>
            <button
              id="listing-recording"
              type="button"
              className="pill"
              onClick={() =>
                setFormData((prev) => ({
                  ...prev,
                  sessionRecordingEnabled: !prev.sessionRecordingEnabled,
                }))
              }
              style={{
                ...styles.togglePill,
                ...(formData.sessionRecordingEnabled
                  ? styles.togglePillActive
                  : {}),
              }}
              aria-pressed={formData.sessionRecordingEnabled}
            >
              {formData.sessionRecordingEnabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          {/* Actions */}
          <div style={styles.actions}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setView('list');
                setEditingId(null);
                setFormData(EMPTY_FORM);
                setFormErrors([]);
              }}
              style={styles.cancelButton}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn"
              disabled={isSubmitting}
              style={styles.submitButton}
            >
              {isSubmitting
                ? 'Saving…'
                : view === 'edit'
                  ? 'Save Changes'
                  : 'Publish Listing'}
            </button>
          </div>
        </form>
      </section>
    );
  }

  // ─── Render: Listings List ────────────────────────────────────────────────────

  function renderListingsTable() {
    return (
      <section className="panel">
        <div style={styles.listHeader}>
          <h2 style={styles.heading}>My Listings</h2>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setView('create');
              setFormData(EMPTY_FORM);
              setFormErrors([]);
            }}
          >
            + New Listing
          </button>
        </div>

        {listings.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyText}>
              No listings yet. Publish your first resource to start receiving bookings.
            </p>
          </div>
        ) : (
          <table className="table" style={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Rate</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((listing) => (
                <tr key={listing.id}>
                  <td style={styles.nameCell}>{listing.name}</td>
                  <td>{renderStatusPill(listing.status)}</td>
                  <td style={styles.rateCell}>
                    R {listing.hourlyRateZar}/hr
                  </td>
                  <td>
                    <div style={styles.actionButtons}>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => startEdit(listing)}
                        style={styles.smallBtn}
                      >
                        Edit
                      </button>
                      {listing.status === 'active' && (
                        <button
                          type="button"
                          className="btn"
                          onClick={() => handlePause(listing.id)}
                          style={styles.smallBtnSecondary}
                        >
                          Pause
                        </button>
                      )}
                      {(listing.status === 'paused' ||
                        listing.status === 'draft') && (
                        <button
                          type="button"
                          className="btn"
                          onClick={() => handleActivate(listing.id)}
                          style={styles.smallBtn}
                        >
                          Activate
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          setAnalyticsListingId(
                            analyticsListingId === listing.id
                              ? null
                              : listing.id
                          )
                        }
                        style={styles.smallBtnSecondary}
                      >
                        {analyticsListingId === listing.id
                          ? 'Hide Stats'
                          : 'Stats'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Analytics Panel */}
        {analyticsData && analyticsListingId && (
          <div style={styles.analyticsPanel}>
            <h3 style={styles.analyticsHeading}>
              Analytics:{' '}
              {listings.find((l) => l.id === analyticsListingId)?.name || ''}
            </h3>
            {renderAnalytics(analyticsData)}
          </div>
        )}
      </section>
    );
  }

  // ─── Main Render ──────────────────────────────────────────────────────────────

  if (view === 'create' || view === 'edit') {
    return renderForm();
  }

  return renderListingsTable();
}

// ─── Styles (CSS token-based) ─────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  formContainer: {
    maxWidth: 600,
  },
  heading: {
    fontSize: 18,
    fontWeight: 600,
    color: 'var(--ink)',
    marginBottom: 16,
  },
  errorContainer: {
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid var(--red)',
    background: 'rgba(217, 87, 71, 0.06)',
    marginBottom: 14,
  },
  errorText: {
    fontSize: 13,
    color: 'var(--red)',
    marginBottom: 4,
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 14,
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
    flex: 1,
  },
  fieldRow: {
    display: 'flex',
    gap: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--ink)',
  },
  optionalTag: {
    fontSize: 11,
    color: 'var(--muted)',
    marginLeft: 6,
    fontWeight: 400,
  },
  input: {
    width: '100%',
    padding: '8px 12px',
    fontSize: 13,
    color: 'var(--ink)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    outline: 'none',
    background: 'rgba(255,255,255,.7)',
  },
  textarea: {
    width: '100%',
    padding: '8px 12px',
    fontSize: 13,
    color: 'var(--ink)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    outline: 'none',
    background: 'rgba(255,255,255,.7)',
    resize: 'vertical' as const,
    minHeight: 80,
  },
  charCounter: {
    fontSize: 11,
    color: 'var(--muted)',
    textAlign: 'right' as const,
  },
  categoryGrid: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 6,
  },
  catPill: {
    cursor: 'pointer',
    fontSize: 12,
    padding: '5px 10px',
    border: '1px solid var(--border)',
    background: 'rgba(255,255,255,.7)',
    color: 'var(--ink)',
    borderRadius: 999,
    transition: 'all 0.15s ease',
  },
  catPillActive: {
    borderColor: 'var(--teal)',
    background: 'var(--aqua)',
    color: 'var(--deep)',
  },
  catPillDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  togglePill: {
    cursor: 'pointer',
    fontSize: 12,
    padding: '6px 14px',
    border: '1px solid var(--border)',
    background: 'rgba(255,255,255,.7)',
    color: 'var(--muted)',
    borderRadius: 999,
  },
  togglePillActive: {
    borderColor: 'var(--teal)',
    background: 'var(--aqua)',
    color: 'var(--deep)',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 6,
  },
  cancelButton: {
    borderColor: 'var(--border)',
    background: 'rgba(255,255,255,.7)',
    color: 'var(--ink)',
  },
  submitButton: {
    opacity: 1,
  },
  listHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: '32px 16px',
  },
  emptyText: {
    fontSize: 13,
    color: 'var(--muted)',
  },
  table: {
    width: '100%',
  },
  nameCell: {
    fontWeight: 500,
    color: 'var(--ink)',
    fontSize: 13,
  },
  rateCell: {
    fontSize: 13,
    color: 'var(--teal)',
    fontWeight: 500,
  },
  actionButtons: {
    display: 'flex',
    gap: 6,
  },
  smallBtn: {
    fontSize: 11,
    padding: '4px 10px',
    height: 28,
  },
  smallBtnSecondary: {
    fontSize: 11,
    padding: '4px 10px',
    height: 28,
    borderColor: 'var(--border)',
    background: 'rgba(255,255,255,.7)',
    color: 'var(--ink)',
  },
  analyticsPanel: {
    marginTop: 16,
    paddingTop: 16,
    borderTop: '1px solid var(--border)',
  },
  analyticsHeading: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--ink)',
    marginBottom: 12,
  },
  analyticsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: 10,
  },
  statCard: {
    textAlign: 'center' as const,
  },
};
