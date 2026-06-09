/**
 * Retention Service
 *
 * Manages retention money held against construction contracts.
 *
 * Retention is calculated as a percentage of certified amounts and held
 * until the defects liability period expires. Releases follow formal
 * approval and are tracked with full audit trail.
 */
import type { MoneyAmount, RetentionRecord } from './types';

/**
 * Calculate the retention amount from a certified amount at the given percentage.
 * Uses standard rounding (to nearest Rand).
 */
export function calculateRetention(
  certifiedAmount: MoneyAmount,
  retentionPercent: number,
): MoneyAmount {
  if (retentionPercent < 0 || retentionPercent > 100) {
    throw new Error(
      `Retention percentage must be between 0 and 100, got ${retentionPercent}`,
    );
  }

  return {
    currency: certifiedAmount.currency,
    amount: Math.round((certifiedAmount.amount * retentionPercent) / 100),
  };
}

/**
 * Create a retention record for a certified payment.
 */
export function createRetentionRecord(input: {
  projectId: string;
  certificateId: string;
  amountHeld: MoneyAmount;
  percent: number;
  scheduledReleaseDate?: string;
}): RetentionRecord {
  return {
    retentionId: `ret-${input.certificateId}-${Date.now()}`,
    projectId: input.projectId,
    certificateId: input.certificateId,
    amountHeld: input.amountHeld,
    percent: input.percent,
    scheduledReleaseDate: input.scheduledReleaseDate,
    status: 'held',
    releasedAmount: { currency: 'ZAR', amount: 0 },
  };
}

/**
 * Release a portion of the retained amount.
 * Tracks partial releases and transitions to fully_released when
 * the full amount has been released.
 */
export function releaseRetention(
  record: RetentionRecord,
  releaseAmount: MoneyAmount,
): RetentionRecord {
  if (record.status === 'fully_released') {
    throw new Error(
      `Retention record '${record.retentionId}' is already fully released.`,
    );
  }

  const newReleasedAmount = record.releasedAmount.amount + releaseAmount.amount;

  if (newReleasedAmount > record.amountHeld.amount) {
    throw new Error(
      `Release amount R${releaseAmount.amount} exceeds remaining retention ` +
        `R${record.amountHeld.amount - record.releasedAmount.amount}.`,
    );
  }

  const status: RetentionRecord['status'] =
    newReleasedAmount >= record.amountHeld.amount
      ? 'fully_released'
      : 'partially_released';

  return {
    ...record,
    status,
    releasedAmount: {
      currency: 'ZAR',
      amount: newReleasedAmount,
    },
  };
}

/**
 * Schedule the retention release date.
 */
export function scheduleRetentionRelease(
  record: RetentionRecord,
  releaseDate: string,
): RetentionRecord {
  return {
    ...record,
    scheduledReleaseDate: releaseDate,
  };
}

/**
 * Calculate total retention held across multiple records.
 */
export function totalRetentionHeld(records: RetentionRecord[]): MoneyAmount {
  return {
    currency: 'ZAR',
    amount: records.reduce((sum, r) => sum + r.amountHeld.amount, 0),
  };
}

/**
 * Calculate total retention released across multiple records.
 */
export function totalRetentionReleased(records: RetentionRecord[]): MoneyAmount {
  return {
    currency: 'ZAR',
    amount: records.reduce((sum, r) => sum + r.releasedAmount.amount, 0),
  };
}

/**
 * Get the balance of retention still held (not yet released).
 */
export function retentionBalance(records: RetentionRecord[]): MoneyAmount {
  const held = totalRetentionHeld(records);
  const released = totalRetentionReleased(records);
  return {
    currency: 'ZAR',
    amount: held.amount - released.amount,
  };
}
