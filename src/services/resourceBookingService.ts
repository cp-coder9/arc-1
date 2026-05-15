export type ResourceBookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

export interface ResourceBookingWindow {
  id: string;
  resourceId: string;
  startsAt: string;
  endsAt: string;
  status: ResourceBookingStatus;
}

export interface ResourceBookingRequest {
  resourceId: string;
  startsAt: string;
  endsAt: string;
}

export interface ResourceBookingConflict {
  bookingId: string;
  resourceId: string;
  startsAt: string;
  endsAt: string;
  status: ResourceBookingStatus;
}

export interface ResourceUsageLogInput {
  bookingId: string;
  resourceId: string;
  userId: string;
  startedAt: string;
  endedAt: string;
  meteredUnits?: number;
  notes?: string;
}

export interface ResourceUsageBillingPolicy {
  billingMode: 'hourly' | 'metered_unit';
  hourlyRateCents?: number;
  meteredUnitRateCents?: number;
  minimumBillableMinutes?: number;
  platformFeeBps: number;
  currency: string;
}

export interface ResourceUsageBillingResult {
  bookingId: string;
  resourceId: string;
  userId: string;
  billableMinutes: number;
  meteredUnits: number;
  grossAmountCents: number;
  platformFeeCents: number;
  ownerPayoutCents: number;
  currency: string;
  formula: string;
}

export interface ResourcePayoutRecordInput {
  resourceId: string;
  ownerId: string;
  usageBillingResults: ResourceUsageBillingResult[];
  payoutBatchId: string;
  createdAt: string;
}

export interface ResourcePayoutRecord {
  resourceId: string;
  ownerId: string;
  payoutBatchId: string;
  usageBookingIds: string[];
  grossAmountCents: number;
  platformFeeCents: number;
  ownerPayoutCents: number;
  currency: string;
  status: 'pending';
  createdAt: string;
}

const ACTIVE_BOOKING_STATUSES = new Set<ResourceBookingStatus>(['pending', 'confirmed']);

const toMillis = (value: string, fieldName: string): number => {
  const millis = Date.parse(value);
  if (Number.isNaN(millis)) {
    throw new Error(`${fieldName} must be a valid ISO date string.`);
  }
  return millis;
};

export const assertValidResourceBookingWindow = (window: Pick<ResourceBookingWindow, 'startsAt' | 'endsAt'>): void => {
  const startsAt = toMillis(window.startsAt, 'startsAt');
  const endsAt = toMillis(window.endsAt, 'endsAt');

  if (endsAt <= startsAt) {
    throw new Error('Resource booking end time must be after start time.');
  }
};

export const resourceBookingWindowsOverlap = (
  first: Pick<ResourceBookingWindow, 'startsAt' | 'endsAt'>,
  second: Pick<ResourceBookingWindow, 'startsAt' | 'endsAt'>
): boolean => {
  assertValidResourceBookingWindow(first);
  assertValidResourceBookingWindow(second);

  return toMillis(first.startsAt, 'startsAt') < toMillis(second.endsAt, 'endsAt')
    && toMillis(second.startsAt, 'startsAt') < toMillis(first.endsAt, 'endsAt');
};

export const findResourceBookingConflicts = (
  request: ResourceBookingRequest,
  existingBookings: ResourceBookingWindow[]
): ResourceBookingConflict[] => {
  assertValidResourceBookingWindow(request);

  return existingBookings
    .filter((booking) => booking.resourceId === request.resourceId)
    .filter((booking) => ACTIVE_BOOKING_STATUSES.has(booking.status))
    .filter((booking) => resourceBookingWindowsOverlap(request, booking))
    .map((booking) => ({
      bookingId: booking.id,
      resourceId: booking.resourceId,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      status: booking.status,
    }));
};

export const canConfirmResourceBooking = (
  request: ResourceBookingRequest,
  existingBookings: ResourceBookingWindow[]
): { canConfirm: true; conflicts: [] } | { canConfirm: false; conflicts: ResourceBookingConflict[] } => {
  const conflicts = findResourceBookingConflicts(request, existingBookings);

  if (conflicts.length > 0) {
    return { canConfirm: false, conflicts };
  }

  return { canConfirm: true, conflicts: [] };
};

export const calculateResourceUsageBilling = (
  usage: ResourceUsageLogInput,
  policy: ResourceUsageBillingPolicy
): ResourceUsageBillingResult => {
  assertValidResourceBookingWindow({ startsAt: usage.startedAt, endsAt: usage.endedAt });

  if (policy.platformFeeBps < 0 || policy.platformFeeBps > 10_000) {
    throw new Error('platformFeeBps must be between 0 and 10000.');
  }

  const elapsedMinutes = Math.ceil((toMillis(usage.endedAt, 'endedAt') - toMillis(usage.startedAt, 'startedAt')) / 60_000);
  const billableMinutes = Math.max(elapsedMinutes, policy.minimumBillableMinutes ?? 0);
  const meteredUnits = usage.meteredUnits ?? 0;

  if (meteredUnits < 0) {
    throw new Error('meteredUnits cannot be negative.');
  }

  let grossAmountCents: number;
  let formula: string;

  if (policy.billingMode === 'hourly') {
    if (policy.hourlyRateCents === undefined || policy.hourlyRateCents < 0) {
      throw new Error('hourlyRateCents must be provided and non-negative for hourly billing.');
    }
    grossAmountCents = Math.ceil((billableMinutes / 60) * policy.hourlyRateCents);
    formula = `ceil((${billableMinutes} / 60) * ${policy.hourlyRateCents})`;
  } else {
    if (policy.meteredUnitRateCents === undefined || policy.meteredUnitRateCents < 0) {
      throw new Error('meteredUnitRateCents must be provided and non-negative for metered billing.');
    }
    grossAmountCents = Math.ceil(meteredUnits * policy.meteredUnitRateCents);
    formula = `ceil(${meteredUnits} * ${policy.meteredUnitRateCents})`;
  }

  const platformFeeCents = Math.ceil((grossAmountCents * policy.platformFeeBps) / 10_000);
  const ownerPayoutCents = grossAmountCents - platformFeeCents;

  return {
    bookingId: usage.bookingId,
    resourceId: usage.resourceId,
    userId: usage.userId,
    billableMinutes,
    meteredUnits,
    grossAmountCents,
    platformFeeCents,
    ownerPayoutCents,
    currency: policy.currency,
    formula: `${formula}; platformFee=ceil(${grossAmountCents} * ${policy.platformFeeBps} / 10000); ownerPayout=${grossAmountCents}-${platformFeeCents}`,
  };
};

export const buildResourcePayoutRecord = ({
  resourceId,
  ownerId,
  usageBillingResults,
  payoutBatchId,
  createdAt,
}: ResourcePayoutRecordInput): ResourcePayoutRecord => {
  if (usageBillingResults.length === 0) {
    throw new Error('At least one usage billing result is required to build a resource payout.');
  }

  const currencies = new Set(usageBillingResults.map((result) => result.currency));
  if (currencies.size !== 1) {
    throw new Error('Resource payout cannot combine multiple currencies.');
  }

  const mismatchedResource = usageBillingResults.find((result) => result.resourceId !== resourceId);
  if (mismatchedResource) {
    throw new Error('Resource payout cannot include usage from another resource.');
  }

  return {
    resourceId,
    ownerId,
    payoutBatchId,
    usageBookingIds: usageBillingResults.map((result) => result.bookingId),
    grossAmountCents: usageBillingResults.reduce((sum, result) => sum + result.grossAmountCents, 0),
    platformFeeCents: usageBillingResults.reduce((sum, result) => sum + result.platformFeeCents, 0),
    ownerPayoutCents: usageBillingResults.reduce((sum, result) => sum + result.ownerPayoutCents, 0),
    currency: usageBillingResults[0].currency,
    status: 'pending',
    createdAt,
  };
};
