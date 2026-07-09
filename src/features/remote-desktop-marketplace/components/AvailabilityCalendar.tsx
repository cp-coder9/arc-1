// ─── Remote Desktop Marketplace — AvailabilityCalendar ────────────────────────
//
// 14-day interactive slot calendar. Displays hour-by-day grid with
// visual states for available, unavailable, pending, and selected slots.

import { useCallback, useEffect, useMemo, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { CalendarSlot } from '../types';
import { useAvailability, type UseAvailabilityReturn } from '../hooks/useAvailability';
import { AVAILABILITY_HOURS } from '../constants';

// ─── Props ────────────────────────────────────────────────────────────────────

interface AvailabilityCalendarProps {
  listingId: string;
  hourlyRate: number;
  onSlotsSelected: (slots: CalendarSlot[]) => void;
  /** Optional: pass an existing hook instance (used when embedded in ResourceDetailView) */
  availabilityHook?: UseAvailabilityReturn;
}

// ─── Helper: Format ZAR currency ──────────────────────────────────────────────

function formatZar(amount: number): string {
  return `R${amount.toFixed(2)}`;
}

// ─── Helper: Format date for display ──────────────────────────────────────────

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ─── Helper: Format hour as "HH:00" ──────────────────────────────────────────

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

// ─── Helper: Get unique sorted dates from slots ───────────────────────────────

function getUniqueDates(slots: CalendarSlot[]): string[] {
  const dates = new Set(slots.map((s) => s.date));
  return Array.from(dates).sort();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AvailabilityCalendar({
  listingId,
  hourlyRate,
  onSlotsSelected,
  availabilityHook,
}: AvailabilityCalendarProps) {
  // Use provided hook instance or create a new one
  const ownHook = useAvailability(availabilityHook ? null : listingId, hourlyRate);
  const hook = availabilityHook ?? ownHook;

  const {
    slots,
    isLoading,
    error,
    selectedSlots,
    totalCost,
    selectSlot,
    clearSelection,
    navigateDay,
    currentStartDate,
  } = hook;

  // ─── Derived data ─────────────────────────────────────────────────────────

  const dates = useMemo(() => getUniqueDates(slots), [slots]);

  const hours = useMemo(() => {
    const result: number[] = [];
    for (let h = AVAILABILITY_HOURS.start; h < AVAILABILITY_HOURS.end; h++) {
      result.push(h);
    }
    return result;
  }, []);

  // Create a lookup map for quick slot access
  const slotMap = useMemo(() => {
    const map = new Map<string, CalendarSlot>();
    for (const slot of slots) {
      map.set(`${slot.date}-${slot.startHour}`, slot);
    }
    // Mark selected slots
    for (const slot of selectedSlots) {
      const key = `${slot.date}-${slot.startHour}`;
      const existing = map.get(key);
      if (existing) {
        map.set(key, { ...existing, status: 'selected' });
      }
    }
    return map;
  }, [slots, selectedSlots]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleSlotClick = useCallback(
    (slot: CalendarSlot) => {
      selectSlot(slot);
      // Notify parent after selection changes
      // Since setState is async, the parent will get the updated selectedSlots on next render
    },
    [selectSlot]
  );

  const handleClearSelection = useCallback(() => {
    clearSelection();
    onSlotsSelected([]);
  }, [clearSelection, onSlotsSelected]);

  // Notify parent when selection changes
  useEffect(() => {
    if (selectedSlots.length > 0) {
      onSlotsSelected(selectedSlots);
    }
  }, [selectedSlots, onSlotsSelected]);

  // ─── Slot visual style ────────────────────────────────────────────────────

  function getSlotStyle(status: CalendarSlot['status']): CSSProperties {
    const base: CSSProperties = {
      width: '100%',
      height: 28,
      borderRadius: 4,
      border: '1px solid var(--border)',
      cursor: status === 'available' ? 'pointer' : 'default',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 10,
      transition: 'all 0.15s ease',
    };

    switch (status) {
      case 'available':
        return {
          ...base,
          background: 'rgba(74,222,128,.12)',
          borderColor: 'rgba(74,222,128,.25)',
          color: 'var(--green)',
        };
      case 'unavailable':
        return {
          ...base,
          background: 'rgba(16,32,51,.04)',
          borderColor: 'var(--border)',
          color: 'var(--muted)',
          textDecoration: 'line-through',
          cursor: 'not-allowed',
        };
      case 'pending':
        return {
          ...base,
          background: 'rgba(245,166,35,.08)',
          borderColor: 'rgba(245,166,35,.18)',
          color: 'var(--amber)',
          cursor: 'not-allowed',
        };
      case 'selected':
        return {
          ...base,
          background: 'rgba(25,183,176,.15)',
          borderColor: 'var(--teal)',
          color: 'var(--teal)',
          fontWeight: 600,
          boxShadow: '0 0 0 2px rgba(25,183,176,.2)',
        };
      default:
        return base;
    }
  }

  // ─── No-availability message ──────────────────────────────────────────────

  if (!isLoading && !error && slots.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 24 }}>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          No availability has been set for this resource. The owner has not
          configured any bookable time slots.
        </p>
      </div>
    );
  }

  // ─── Error state ──────────────────────────────────────────────────────────

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: 24 }}>
        <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>
          {error}
        </p>
        <button className="btn" onClick={hook.refresh}>
          Retry
        </button>
      </div>
    );
  }

  // ─── Loading state ────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 24 }}>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          Loading availability…
        </p>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Date navigation */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <button
          className="btn"
          onClick={() => navigateDay('prev')}
          aria-label="Previous day"
          style={{
            padding: '4px 10px',
            height: 32,
            background: 'rgba(255,255,255,.7)',
            borderColor: 'var(--border)',
            color: 'var(--ink)',
          }}
        >
          <ChevronLeft size={16} />
        </button>

        <span
          style={{ color: 'var(--ink)', fontSize: 13, fontWeight: 500 }}
        >
          {formatShortDate(currentStartDate)} — 14 day view
        </span>

        <button
          className="btn"
          onClick={() => navigateDay('next')}
          aria-label="Next day"
          style={{
            padding: '4px 10px',
            height: 32,
            background: 'rgba(255,255,255,.7)',
            borderColor: 'var(--border)',
            color: 'var(--ink)',
          }}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Grid: rows=hours, columns=days */}
      <div
        style={{
          overflowX: 'auto',
          borderRadius: 12,
          border: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `56px repeat(${dates.length}, 1fr)`,
            gap: 2,
            padding: 8,
            minWidth: dates.length * 60 + 56,
          }}
        >
          {/* Header row — dates */}
          <div
            style={{
              fontSize: 10,
              color: 'var(--muted)',
              textAlign: 'center',
              padding: '4px 0',
            }}
          >
            Time
          </div>
          {dates.map((date) => (
            <div
              key={date}
              style={{
                fontSize: 10,
                color: 'var(--muted)',
                textAlign: 'center',
                padding: '4px 0',
                whiteSpace: 'nowrap',
              }}
            >
              {formatShortDate(date)}
            </div>
          ))}

          {/* Body rows — one per hour */}
          {hours.map((hour) => (
            <>
              {/* Hour label */}
              <div
                key={`label-${hour}`}
                style={{
                  fontSize: 10,
                  color: 'var(--muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {formatHour(hour)}
              </div>

              {/* Slots for each day */}
              {dates.map((date) => {
                const key = `${date}-${hour}`;
                const slot = slotMap.get(key);
                const status = slot?.status ?? 'unavailable';

                return (
                  <div
                    key={key}
                    onClick={() => {
                      if (slot && (status === 'available' || status === 'selected')) {
                        handleSlotClick(slot);
                      }
                    }}
                    style={getSlotStyle(status)}
                    title={`${formatHour(hour)} - ${formatHour(hour + 1)} · ${status}`}
                    role="button"
                    aria-label={`${date} ${formatHour(hour)} - ${status}`}
                    tabIndex={status === 'available' || status === 'selected' ? 0 : -1}
                  >
                    {status === 'available' && '●'}
                    {status === 'selected' && '✓'}
                    {status === 'pending' && '◐'}
                    {status === 'unavailable' && '—'}
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
          fontSize: 11,
          color: 'var(--muted)',
        }}
      >
        <span>
          <span style={{ color: 'var(--green)' }}>●</span> Available
        </span>
        <span>
          <span style={{ color: 'var(--muted)' }}>—</span> Unavailable
        </span>
        <span>
          <span style={{ color: 'var(--amber)' }}>◐</span> Pending
        </span>
        <span>
          <span style={{ color: 'var(--teal)' }}>✓</span> Selected
        </span>
      </div>

      {/* Selection summary */}
      {selectedSlots.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div className="stat-card" style={{ flex: 1 }}>
            <div className="stat-value" style={{ color: 'var(--teal)' }}>
              {selectedSlots.length} {selectedSlots.length === 1 ? 'hour' : 'hours'}{' '}
              selected · {formatZar(totalCost)} estimated
            </div>
            <div className="stat-label">Selection Summary</div>
          </div>

          <button
            className="btn"
            onClick={handleClearSelection}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(255,255,255,.7)',
              borderColor: 'var(--border)',
              color: 'var(--ink)',
            }}
          >
            <X size={14} /> Clear Selection
          </button>
        </div>
      )}

      {/* Conflict notification area — shown by the hook when a conflict is detected */}
    </div>
  );
}

export default AvailabilityCalendar;
