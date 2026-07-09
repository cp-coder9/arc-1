// ─── Remote Desktop Marketplace — Availability Service ────────────────────────
//
// Pure business logic for calendar slot generation, status computation,
// slot selection validation, and booking cost calculation.
// No Firebase imports — all functions operate on data passed as parameters.

import type {
  BlockedDate,
  BookingRecord,
  CalendarSlot,
  SlotStatus,
  WeeklySchedule,
} from '../types';

import {
  AVAILABILITY_DAYS,
  AVAILABILITY_HOURS,
  MAX_CONSECUTIVE_SLOTS,
} from '../constants';

// ─── Calendar Slot Generation ─────────────────────────────────────────────────

/**
 * Generates a full 14-day × 16-slot calendar grid from a reference date.
 * Each day has hourly slots from 06:00 to 22:00 SAST with proper status.
 */
export function generateCalendarSlots(
  referenceDate: string,
  weeklySchedules: WeeklySchedule[],
  blockedDates: BlockedDate[],
  existingBookings: BookingRecord[]
): CalendarSlot[] {
  const slots: CalendarSlot[] = [];
  const startDate = new Date(referenceDate);

  for (let dayOffset = 0; dayOffset < AVAILABILITY_DAYS; dayOffset++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + dayOffset);
    const dateStr = formatDate(currentDate);

    for (
      let hour = AVAILABILITY_HOURS.start;
      hour < AVAILABILITY_HOURS.end;
      hour++
    ) {
      const status = computeSlotStatus(
        hour,
        dateStr,
        weeklySchedules,
        blockedDates,
        existingBookings
      );

      slots.push({
        date: dateStr,
        startHour: hour,
        endHour: hour + 1,
        status,
      });
    }
  }

  return slots;
}

// ─── Slot Status Computation ──────────────────────────────────────────────────

/**
 * Determines the status of a single slot based on priority rules:
 * 1. Existing booking (confirmed/active) → 'unavailable'
 * 2. Existing booking (pending_owner_confirmation) → 'pending'
 * 3. Blocked date → 'unavailable'
 * 4. Not in weekly schedule → 'unavailable'
 * 5. Otherwise → 'available'
 */
export function computeSlotStatus(
  hour: number,
  date: string,
  weeklySchedules: WeeklySchedule[],
  blockedDates: BlockedDate[],
  existingBookings: BookingRecord[]
): SlotStatus {
  // Priority 1 & 2: Check existing bookings
  const bookingStatus = isSlotBooked(date, hour, existingBookings);
  if (bookingStatus === 'unavailable') {
    return 'unavailable';
  }
  if (bookingStatus === 'pending') {
    return 'pending';
  }

  // Priority 3: Check blocked dates
  if (isSlotBlocked(date, hour, blockedDates)) {
    return 'unavailable';
  }

  // Priority 4: Check weekly schedule
  const dayOfWeek = getDayOfWeek(date);
  if (!isSlotAvailableInSchedule(dayOfWeek, hour, weeklySchedules)) {
    return 'unavailable';
  }

  // Priority 5: Available
  return 'available';
}

// ─── Slot Selection Validation ────────────────────────────────────────────────

/**
 * Validates a slot selection:
 * - All slots must be on the same date
 * - Slots must be contiguous (each slot's startHour = previous slot's endHour)
 * - Maximum 16 consecutive slots
 * - All selected slots must have status 'available'
 */
export function validateSlotSelection(
  selectedSlots: CalendarSlot[]
): { valid: boolean; error?: string } {
  if (selectedSlots.length === 0) {
    return { valid: false, error: 'No slots selected' };
  }

  if (selectedSlots.length > MAX_CONSECUTIVE_SLOTS) {
    return {
      valid: false,
      error: `Maximum ${MAX_CONSECUTIVE_SLOTS} consecutive slots allowed`,
    };
  }

  // All slots must be on the same date
  const firstDate = selectedSlots[0].date;
  const allSameDate = selectedSlots.every((slot) => slot.date === firstDate);
  if (!allSameDate) {
    return { valid: false, error: 'All slots must be on the same date' };
  }

  // All selected slots must have status 'available'
  const allAvailable = selectedSlots.every(
    (slot) => slot.status === 'available'
  );
  if (!allAvailable) {
    return {
      valid: false,
      error: 'All selected slots must have status available',
    };
  }

  // Sort slots by startHour for contiguity check
  const sorted = [...selectedSlots].sort((a, b) => a.startHour - b.startHour);

  // Slots must be contiguous
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startHour !== sorted[i - 1].endHour) {
      return { valid: false, error: 'Selected slots must be contiguous' };
    }
  }

  return { valid: true };
}

// ─── Booking Cost Calculation ─────────────────────────────────────────────────

/**
 * Calculates booking cost: hourlyRate × number of selected slots.
 */
export function calculateBookingCost(
  hourlyRate: number,
  selectedSlots: CalendarSlot[]
): number {
  return hourlyRate * selectedSlots.length;
}

// ─── Schedule Check ───────────────────────────────────────────────────────────

/**
 * Checks if a slot is defined in the weekly schedule for the given day.
 * Returns true if any schedule entry for that dayOfWeek contains the hour.
 */
export function isSlotAvailableInSchedule(
  dayOfWeek: number,
  hour: number,
  weeklySchedules: WeeklySchedule[]
): boolean {
  const daySchedule = weeklySchedules.find((s) => s.dayOfWeek === dayOfWeek);
  if (!daySchedule || daySchedule.slots.length === 0) {
    return false;
  }

  return daySchedule.slots.some(
    (slot) => hour >= slot.startHour && hour < slot.endHour
  );
}

// ─── Blocked Date Check ───────────────────────────────────────────────────────

/**
 * Checks if a slot is blocked for the given date and hour.
 * A blocked date with no startHour/endHour blocks the entire day.
 * A blocked date with startHour/endHour blocks only those hours.
 */
export function isSlotBlocked(
  date: string,
  hour: number,
  blockedDates: BlockedDate[]
): boolean {
  return blockedDates.some((blocked) => {
    if (blocked.date !== date) {
      return false;
    }

    // If no hour range specified, entire day is blocked
    if (blocked.startHour === undefined || blocked.endHour === undefined) {
      return true;
    }

    // Check if the hour falls within the blocked range
    return hour >= blocked.startHour && hour < blocked.endHour;
  });
}

// ─── Booking Status Check ─────────────────────────────────────────────────────

/**
 * Checks if a slot overlaps with any existing booking.
 * Returns 'unavailable' for confirmed/active bookings,
 * 'pending' for pending_owner_confirmation bookings,
 * or null if no overlap.
 */
export function isSlotBooked(
  date: string,
  hour: number,
  bookings: BookingRecord[]
): 'unavailable' | 'pending' | null {
  // Check for confirmed/active bookings first (higher priority)
  for (const booking of bookings) {
    if (
      booking.status !== 'confirmed' &&
      booking.status !== 'active'
    ) {
      continue;
    }

    if (doesSlotOverlapBooking(date, hour, booking)) {
      return 'unavailable';
    }
  }

  // Check for pending bookings
  for (const booking of bookings) {
    if (booking.status !== 'pending_owner_confirmation') {
      continue;
    }

    if (doesSlotOverlapBooking(date, hour, booking)) {
      return 'pending';
    }
  }

  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Checks if a given slot (date + hour) overlaps with a booking's time range.
 * Slot represents [hour, hour+1) on the given date.
 * Booking covers [startsAt, endsAt).
 */
function doesSlotOverlapBooking(
  date: string,
  hour: number,
  booking: BookingRecord
): boolean {
  const slotStart = new Date(`${date}T${padHour(hour)}:00:00`);
  const slotEnd = new Date(`${date}T${padHour(hour + 1)}:00:00`);

  const bookingStart = new Date(booking.startsAt);
  const bookingEnd = new Date(booking.endsAt);

  // Overlap: slotStart < bookingEnd && slotEnd > bookingStart
  return slotStart < bookingEnd && slotEnd > bookingStart;
}

/** Formats a Date to YYYY-MM-DD string */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Gets the day of week (0=Sunday) for a YYYY-MM-DD string */
function getDayOfWeek(date: string): number {
  return new Date(date).getDay();
}

/** Pads an hour number to 2-digit string */
function padHour(hour: number): string {
  return String(hour).padStart(2, '0');
}
