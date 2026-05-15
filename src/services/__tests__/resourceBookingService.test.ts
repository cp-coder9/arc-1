import { describe, expect, test } from 'vitest';
import {
  assertResourceUsageMatchesBooking,
  buildResourceBookingConflictAudit,
  buildResourcePayoutRecord,
  buildResourceUsageLedgerEntry,
  calculateResourceUsageBilling,
  canConfirmResourceBooking,
  findResourceBookingConflicts,
  resourceBookingWindowsOverlap,
  type ResourceBookingWindow,
} from '../resourceBookingService';

const existingBookings: ResourceBookingWindow[] = [
  {
    id: 'booking-1',
    resourceId: 'resource-1',
    startsAt: '2026-05-15T10:00:00.000Z',
    endsAt: '2026-05-15T12:00:00.000Z',
    status: 'confirmed',
  },
  {
    id: 'booking-2',
    resourceId: 'resource-1',
    startsAt: '2026-05-15T12:00:00.000Z',
    endsAt: '2026-05-15T13:00:00.000Z',
    status: 'cancelled',
  },
  {
    id: 'booking-3',
    resourceId: 'resource-2',
    startsAt: '2026-05-15T10:30:00.000Z',
    endsAt: '2026-05-15T11:30:00.000Z',
    status: 'confirmed',
  },
];

describe('resourceBookingService', () => {
  test('detects overlapping active bookings for the same resource', () => {
    const conflicts = findResourceBookingConflicts(
      {
        resourceId: 'resource-1',
        startsAt: '2026-05-15T11:30:00.000Z',
        endsAt: '2026-05-15T12:30:00.000Z',
      },
      existingBookings
    );

    expect(conflicts).toEqual([
      {
        bookingId: 'booking-1',
        resourceId: 'resource-1',
        startsAt: '2026-05-15T10:00:00.000Z',
        endsAt: '2026-05-15T12:00:00.000Z',
        status: 'confirmed',
      },
    ]);
  });

  test('allows adjacent windows and ignores cancelled or different-resource bookings', () => {
    expect(
      resourceBookingWindowsOverlap(
        { startsAt: '2026-05-15T08:00:00.000Z', endsAt: '2026-05-15T10:00:00.000Z' },
        existingBookings[0]
      )
    ).toBe(false);

    expect(
      canConfirmResourceBooking(
        {
          resourceId: 'resource-1',
          startsAt: '2026-05-15T12:00:00.000Z',
          endsAt: '2026-05-15T13:00:00.000Z',
        },
        existingBookings
      )
    ).toEqual({ canConfirm: true, conflicts: [] });
  });

  test('blocks confirmation when an active conflict exists', () => {
    const result = canConfirmResourceBooking(
      {
        resourceId: 'resource-1',
        startsAt: '2026-05-15T09:45:00.000Z',
        endsAt: '2026-05-15T10:15:00.000Z',
      },
      existingBookings
    );

    expect(result.canConfirm).toBe(false);
    expect(result.conflicts).toHaveLength(1);
  });

  test('builds a durable conflict audit without mutating booking state', () => {
    const audit = buildResourceBookingConflictAudit(
      {
        resourceId: 'resource-1',
        startsAt: '2026-05-15T11:00:00.000Z',
        endsAt: '2026-05-15T12:00:00.000Z',
      },
      existingBookings,
      '2026-05-15T09:00:00.000Z'
    );

    expect(audit).toMatchObject({
      canConfirm: false,
      checkedAt: '2026-05-15T09:00:00.000Z',
      reason: 'active_booking_overlap',
    });
    expect(audit.conflicts.map((conflict) => conflict.bookingId)).toEqual(['booking-1']);
  });

  test('calculates hourly usage billing with minimum minutes and owner payout', () => {
    const billing = calculateResourceUsageBilling(
      {
        bookingId: 'booking-1',
        resourceId: 'resource-1',
        userId: 'freelancer-1',
        startedAt: '2026-05-15T10:00:00.000Z',
        endedAt: '2026-05-15T10:20:00.000Z',
      },
      {
        billingMode: 'hourly',
        hourlyRateCents: 12_000,
        minimumBillableMinutes: 30,
        platformFeeBps: 1500,
        currency: 'ZAR',
      }
    );

    expect(billing).toMatchObject({
      billableMinutes: 30,
      grossAmountCents: 6_000,
      platformFeeCents: 900,
      ownerPayoutCents: 5_100,
      currency: 'ZAR',
    });
    expect(billing.formula).toContain('ownerPayout=6000-900');
  });

  test('calculates metered usage billing without external provider calls', () => {
    const billing = calculateResourceUsageBilling(
      {
        bookingId: 'booking-metered',
        resourceId: 'resource-plotter',
        userId: 'bep-1',
        startedAt: '2026-05-15T10:00:00.000Z',
        endedAt: '2026-05-15T10:05:00.000Z',
        meteredUnits: 7,
      },
      {
        billingMode: 'metered_unit',
        meteredUnitRateCents: 250,
        platformFeeBps: 1000,
        currency: 'ZAR',
      }
    );

    expect(billing.grossAmountCents).toBe(1_750);
    expect(billing.platformFeeCents).toBe(175);
    expect(billing.ownerPayoutCents).toBe(1_575);
  });

  test('rejects invalid usage billing policies and negative metered usage', () => {
    expect(() => calculateResourceUsageBilling({ bookingId: 'booking-1', resourceId: 'resource-1', userId: 'user-1', startedAt: '2026-05-15T10:00:00.000Z', endedAt: '2026-05-15T10:30:00.000Z' }, { billingMode: 'hourly', platformFeeBps: 10_001, currency: 'ZAR' })).toThrow(/platformFeeBps/);
    expect(() => calculateResourceUsageBilling({ bookingId: 'booking-1', resourceId: 'resource-1', userId: 'user-1', startedAt: '2026-05-15T10:00:00.000Z', endedAt: '2026-05-15T10:30:00.000Z' }, { billingMode: 'hourly', platformFeeBps: 0, currency: 'ZAR' })).toThrow(/hourlyRateCents/);
    expect(() => calculateResourceUsageBilling({ bookingId: 'booking-1', resourceId: 'resource-1', userId: 'user-1', startedAt: '2026-05-15T10:00:00.000Z', endedAt: '2026-05-15T10:30:00.000Z', meteredUnits: -1 }, { billingMode: 'metered_unit', meteredUnitRateCents: 100, platformFeeBps: 0, currency: 'ZAR' })).toThrow(/meteredUnits/);
    expect(() => calculateResourceUsageBilling({ bookingId: 'booking-1', resourceId: 'resource-1', userId: 'user-1', startedAt: '2026-05-15T10:00:00.000Z', endedAt: '2026-05-15T10:30:00.000Z' }, { billingMode: 'metered_unit', platformFeeBps: 0, currency: 'ZAR' })).toThrow(/meteredUnitRateCents/);
  });

  test('validates usage belongs to the booked resource window before ledgering', () => {
    const usage = {
      bookingId: 'booking-1',
      resourceId: 'resource-1',
      userId: 'freelancer-1',
      startedAt: '2026-05-15T10:15:00.000Z',
      endedAt: '2026-05-15T11:45:00.000Z',
      notes: 'Used meeting room for client workshop',
    };

    expect(() => assertResourceUsageMatchesBooking(usage, existingBookings[0])).not.toThrow();

    const ledgerEntry = buildResourceUsageLedgerEntry(
      'usage-log-1',
      usage,
      { billingMode: 'hourly', hourlyRateCents: 8_000, platformFeeBps: 1250, currency: 'ZAR' },
      '2026-05-15T11:50:00.000Z'
    );

    expect(ledgerEntry).toMatchObject({
      usageLogId: 'usage-log-1',
      bookingId: 'booking-1',
      occurredAt: '2026-05-15T11:50:00.000Z',
      notes: 'Used meeting room for client workshop',
      grossAmountCents: 12_000,
      platformFeeCents: 1_500,
      ownerPayoutCents: 10_500,
    });
  });

  test('rejects usage outside booking window or against inactive bookings', () => {
    expect(() =>
      assertResourceUsageMatchesBooking(
        {
          bookingId: 'booking-1',
          resourceId: 'resource-1',
          userId: 'freelancer-1',
          startedAt: '2026-05-15T09:59:00.000Z',
          endedAt: '2026-05-15T10:30:00.000Z',
        },
        existingBookings[0]
      )
    ).toThrow('within the booked time window');

    expect(() =>
      assertResourceUsageMatchesBooking(
        {
          bookingId: 'booking-2',
          resourceId: 'resource-1',
          userId: 'freelancer-1',
          startedAt: '2026-05-15T12:05:00.000Z',
          endedAt: '2026-05-15T12:30:00.000Z',
        },
        existingBookings[1]
      )
    ).toThrow('confirmed or completed');
  });

  test('builds traceable owner payout records from usage billing results', () => {
    const first = calculateResourceUsageBilling(
      {
        bookingId: 'booking-1',
        resourceId: 'resource-1',
        userId: 'user-1',
        startedAt: '2026-05-15T10:00:00.000Z',
        endedAt: '2026-05-15T11:00:00.000Z',
      },
      { billingMode: 'hourly', hourlyRateCents: 10_000, platformFeeBps: 1000, currency: 'ZAR' }
    );
    const second = calculateResourceUsageBilling(
      {
        bookingId: 'booking-2',
        resourceId: 'resource-1',
        userId: 'user-2',
        startedAt: '2026-05-15T12:00:00.000Z',
        endedAt: '2026-05-15T12:30:00.000Z',
      },
      { billingMode: 'hourly', hourlyRateCents: 10_000, platformFeeBps: 1000, currency: 'ZAR' }
    );

    expect(
      buildResourcePayoutRecord({
        resourceId: 'resource-1',
        ownerId: 'owner-1',
        payoutBatchId: 'batch-1',
        createdAt: '2026-05-16T00:00:00.000Z',
        usageBillingResults: [first, second],
      })
    ).toEqual({
      resourceId: 'resource-1',
      ownerId: 'owner-1',
      payoutBatchId: 'batch-1',
      usageBookingIds: ['booking-1', 'booking-2'],
      grossAmountCents: 15_000,
      platformFeeCents: 1_500,
      ownerPayoutCents: 13_500,
      currency: 'ZAR',
      status: 'pending',
      createdAt: '2026-05-16T00:00:00.000Z',
      idempotencyKey: 'resource-1|owner-1|batch-1|booking-1,booking-2',
    });
  });

  test('rejects invalid booking windows and mixed-currency payouts', () => {
    expect(() =>
      canConfirmResourceBooking(
        { resourceId: 'resource-1', startsAt: '2026-05-15T10:00:00.000Z', endsAt: '2026-05-15T10:00:00.000Z' },
        []
      )
    ).toThrow('end time must be after start time');

    expect(() =>
      buildResourcePayoutRecord({
        resourceId: 'resource-1',
        ownerId: 'owner-1',
        payoutBatchId: 'batch-1',
        createdAt: '2026-05-16T00:00:00.000Z',
        usageBillingResults: [
          {
            bookingId: 'booking-1',
            resourceId: 'resource-1',
            userId: 'user-1',
            billableMinutes: 60,
            meteredUnits: 0,
            grossAmountCents: 100,
            platformFeeCents: 10,
            ownerPayoutCents: 90,
            currency: 'ZAR',
            formula: 'test',
          },
          {
            bookingId: 'booking-2',
            resourceId: 'resource-1',
            userId: 'user-2',
            billableMinutes: 60,
            meteredUnits: 0,
            grossAmountCents: 100,
            platformFeeCents: 10,
            ownerPayoutCents: 90,
            currency: 'USD',
            formula: 'test',
          },
        ],
      })
    ).toThrow('multiple currencies');

    expect(() =>
      buildResourcePayoutRecord({
        resourceId: 'resource-1',
        ownerId: 'owner-1',
        payoutBatchId: 'batch-1',
        createdAt: '2026-05-16T00:00:00.000Z',
        usageBillingResults: [{ bookingId: 'booking-1', resourceId: 'resource-2', userId: 'user-1', billableMinutes: 60, meteredUnits: 0, grossAmountCents: 100, platformFeeCents: 10, ownerPayoutCents: 90, currency: 'ZAR', formula: 'test' }],
      })
    ).toThrow('another resource');
  });
});
