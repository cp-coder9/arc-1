import { useState, useCallback, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/apiClient';
import type { CalendarSlot } from '../types';
import { MAX_CONSECUTIVE_SLOTS, AVAILABILITY_DAYS } from '../constants';

// ─── Configuration ────────────────────────────────────────────────────────────

/** Polling interval in milliseconds (60 seconds) */
const POLLING_INTERVAL_MS = 60 * 1000;

// ─── Hook Return Interface ────────────────────────────────────────────────────

export interface UseAvailabilityReturn {
  slots: CalendarSlot[];
  isLoading: boolean;
  error: string | null;
  selectedSlots: CalendarSlot[];
  totalCost: number;
  selectSlot: (slot: CalendarSlot) => void;
  clearSelection: () => void;
  refresh: () => void;
  navigateDay: (direction: 'prev' | 'next') => void;
  jumpToDate: (date: string) => void;
  currentStartDate: string;
}

// ─── Helper: Format date as YYYY-MM-DD ────────────────────────────────────────

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ─── Helper: Add days to a date string ────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + 'T00:00:00');
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

// ─── Helper: Check if two slots are contiguous ────────────────────────────────

function areSlotsContiguous(a: CalendarSlot, b: CalendarSlot): boolean {
  if (a.date === b.date) {
    return a.endHour === b.startHour || b.endHour === a.startHour;
  }
  // Cross-day contiguity: a ends at end of day and b starts at beginning of next day
  if (a.date < b.date) {
    return a.endHour === 22 && b.startHour === 6 && addDays(a.date, 1) === b.date;
  }
  return b.endHour === 22 && a.startHour === 6 && addDays(b.date, 1) === a.date;
}

// ─── Helper: Check if a slot can be added to current selection (contiguous) ───

function canAddSlot(
  currentSelection: CalendarSlot[],
  newSlot: CalendarSlot
): boolean {
  if (currentSelection.length === 0) return true;
  if (currentSelection.length >= MAX_CONSECUTIVE_SLOTS) return false;

  // Sort selection chronologically
  const sorted = [...currentSelection].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.startHour - b.startHour;
  });

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  // New slot must be contiguous with either start or end of current selection
  return areSlotsContiguous(last, newSlot) || areSlotsContiguous(newSlot, first);
}

// ─── Hook Implementation ──────────────────────────────────────────────────────

export function useAvailability(
  listingId: string | null,
  hourlyRate: number = 0
): UseAvailabilityReturn {
  const today = formatDate(new Date());

  const [slots, setSlots] = useState<CalendarSlot[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<CalendarSlot[]>([]);
  const [currentStartDate, setCurrentStartDate] = useState<string>(today);

  // Polling interval ref
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Abort controller
  const abortControllerRef = useRef<AbortController | null>(null);

  // ─── Cost Calculation ────────────────────────────────────────────────────────

  const totalCost = selectedSlots.length * hourlyRate;

  // ─── Fetch Availability Data ─────────────────────────────────────────────────

  const fetchAvailability = useCallback(
    async (startDate: string) => {
      if (!listingId) return;

      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ startDate });
        const response = await apiFetch(
          `/api/remote-desktop-marketplace/listings/${listingId}/availability?${params.toString()}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(
            errorData?.message || `Failed to load availability (${response.status})`
          );
        }

        const data: CalendarSlot[] = await response.json();
        setSlots(data);
        setError(null);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setError(
          err instanceof Error ? err.message : 'Failed to load availability'
        );
      } finally {
        if (abortControllerRef.current === controller) {
          setIsLoading(false);
        }
      }
    },
    [listingId]
  );

  // ─── Effect: Fetch on listingId or startDate change ──────────────────────────

  useEffect(() => {
    fetchAvailability(currentStartDate);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [currentStartDate, fetchAvailability]);

  // ─── Effect: Periodic polling (60s interval) ─────────────────────────────────

  useEffect(() => {
    if (!listingId) return;

    pollingRef.current = setInterval(() => {
      fetchAvailability(currentStartDate);
    }, POLLING_INTERVAL_MS);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [listingId, currentStartDate, fetchAvailability]);

  // ─── Slot Selection ──────────────────────────────────────────────────────────

  const selectSlot = useCallback(
    (slot: CalendarSlot) => {
      // Only allow selection of available slots
      if (slot.status !== 'available') return;

      setSelectedSlots((prev) => {
        // If already selected, deselect it (only if it's at the start or end)
        const existingIndex = prev.findIndex(
          (s) => s.date === slot.date && s.startHour === slot.startHour
        );

        if (existingIndex !== -1) {
          // Only allow deselection from edges of contiguous selection
          const sorted = [...prev].sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return a.startHour - b.startHour;
          });

          const isFirst =
            sorted[0].date === slot.date && sorted[0].startHour === slot.startHour;
          const isLast =
            sorted[sorted.length - 1].date === slot.date &&
            sorted[sorted.length - 1].startHour === slot.startHour;

          if (isFirst || isLast || prev.length === 1) {
            return prev.filter(
              (s) => !(s.date === slot.date && s.startHour === slot.startHour)
            );
          }
          // Cannot deselect from middle — ignore
          return prev;
        }

        // Check contiguity and max constraint
        if (!canAddSlot(prev, slot)) return prev;

        return [...prev, slot];
      });
    },
    []
  );

  const clearSelection = useCallback(() => {
    setSelectedSlots([]);
  }, []);

  // ─── Navigation ──────────────────────────────────────────────────────────────

  const navigateDay = useCallback(
    (direction: 'prev' | 'next') => {
      setCurrentStartDate((prev) => {
        const newDate = addDays(prev, direction === 'next' ? 1 : -1);

        // Constrain within 14-day window from today
        const minDate = today;
        const maxDate = addDays(today, AVAILABILITY_DAYS - 1);

        if (newDate < minDate) return minDate;
        if (newDate > maxDate) return maxDate;

        return newDate;
      });
    },
    [today]
  );

  const jumpToDate = useCallback(
    (date: string) => {
      // Constrain within 14-day window from today
      const minDate = today;
      const maxDate = addDays(today, AVAILABILITY_DAYS - 1);

      if (date < minDate) {
        setCurrentStartDate(minDate);
      } else if (date > maxDate) {
        setCurrentStartDate(maxDate);
      } else {
        setCurrentStartDate(date);
      }
    },
    [today]
  );

  // ─── Refresh ─────────────────────────────────────────────────────────────────

  const refresh = useCallback(() => {
    fetchAvailability(currentStartDate);
  }, [currentStartDate, fetchAvailability]);

  return {
    slots,
    isLoading,
    error,
    selectedSlots,
    totalCost,
    selectSlot,
    clearSelection,
    refresh,
    navigateDay,
    jumpToDate,
    currentStartDate,
  };
}
