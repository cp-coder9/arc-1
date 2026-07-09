/**
 * Billing Rate Table Service
 *
 * Pure business logic for billing rate management. Supports:
 * - Rate CRUD (create, update)
 * - Temporal lookup (find the most recent effective date on or before query date)
 * - Multiple rate versions per role with effective dates
 * - Returns null when no applicable rate exists (entry saved with zero cost, flagged)
 *
 * This service operates on arrays of typed objects (dependency injection pattern)
 * with no Firestore dependencies.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4
 * @module practiceManagement/billingRateTableService
 */

import type {
  BillingRate,
  BillingRateRole,
  CreateBillingRateInput,
} from './types';

/**
 * Creates a new billing rate entry.
 *
 * Validates: Requirement 3.2
 * WHEN a firm_admin creates a billing rate, requires role, rate type,
 * rate amount in ZAR cents, and effective date.
 *
 * @param input - The billing rate creation input (firmId, role, rateType, rateCents, effectiveDate)
 * @param createdBy - The userId of the firm_admin creating the rate
 * @returns The newly created BillingRate object
 */
export function createRate(
  input: CreateBillingRateInput,
  createdBy: string,
): BillingRate {
  const now = new Date().toISOString();
  const id = generateRateId(input.firmId, input.role, input.effectiveDate);

  return {
    id,
    firmId: input.firmId,
    role: input.role,
    rateType: input.rateType,
    rateCents: input.rateCents,
    effectiveDate: input.effectiveDate,
    createdBy,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Updates an existing billing rate. Returns a new BillingRate object with the
 * updates applied (immutable pattern).
 *
 * Validates: Requirement 3.2
 *
 * @param existingRates - All billing rates (used to find the target)
 * @param rateId - The ID of the rate to update
 * @param updates - Partial updates to apply (rateCents, rateType, effectiveDate)
 * @returns The updated BillingRate, or null if the rate was not found
 */
export function updateRate(
  existingRates: BillingRate[],
  rateId: string,
  updates: Partial<Pick<BillingRate, 'rateCents' | 'rateType' | 'effectiveDate'>>,
): BillingRate | null {
  const existing = existingRates.find((r) => r.id === rateId);
  if (!existing) return null;

  return {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Finds the applicable billing rate for a given role on a specific date.
 *
 * Temporal lookup: finds the most recent effective date on or before the query date.
 * If no applicable rate exists, returns null (the entry is saved with zero cost, flagged).
 *
 * Validates: Requirements 3.3, 3.4
 * THE Billing_Rate_Table SHALL support multiple rate versions per role with effective dates,
 * applying the rate valid at the timesheet entry date.
 * IF no applicable rate exists, THE Timesheet_Engine SHALL allow the entry with a zero
 * billing rate and flag it for rate assignment.
 *
 * @param rates - All billing rates for the firm
 * @param role - The billing rate role to look up
 * @param firmId - The firm ID to scope the search
 * @param date - The date to find the applicable rate for (ISO date string YYYY-MM-DD)
 * @returns The applicable BillingRate, or null if none found
 */
export function getApplicableRate(
  rates: BillingRate[],
  role: BillingRateRole,
  firmId: string,
  date: string,
): BillingRate | null {
  // Filter rates for this firm and role that are effective on or before the query date
  const applicable = rates.filter(
    (r) =>
      r.firmId === firmId &&
      r.role === role &&
      r.effectiveDate <= date,
  );

  if (applicable.length === 0) return null;

  // Sort by effective date descending and return the most recent
  applicable.sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  return applicable[0];
}

/**
 * Gets all billing rate versions for a specific role within a firm,
 * ordered by effective date descending (most recent first).
 *
 * Validates: Requirement 3.1
 * THE Billing_Rate_Table SHALL support defining rates per role with hourly, daily, and fixed rate types.
 *
 * @param rates - All billing rates
 * @param role - The role to filter by
 * @param firmId - The firm ID to scope the search
 * @returns Array of BillingRate objects for the given role, sorted by effectiveDate descending
 */
export function getRatesForRole(
  rates: BillingRate[],
  role: BillingRateRole,
  firmId: string,
): BillingRate[] {
  return rates
    .filter((r) => r.firmId === firmId && r.role === role)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
}

/**
 * Gets all billing rates for a firm, ordered by role then effective date descending.
 *
 * @param rates - All billing rates
 * @param firmId - The firm ID to scope the search
 * @returns Array of all BillingRate objects for the firm
 */
export function getAllRates(
  rates: BillingRate[],
  firmId: string,
): BillingRate[] {
  return rates
    .filter((r) => r.firmId === firmId)
    .sort((a, b) => {
      // Primary sort by role alphabetically
      const roleCompare = a.role.localeCompare(b.role);
      if (roleCompare !== 0) return roleCompare;
      // Secondary sort by effective date descending (most recent first)
      return b.effectiveDate.localeCompare(a.effectiveDate);
    });
}

/**
 * Generates a deterministic rate ID from firm, role, and effective date.
 * This provides idempotent creation when the same rate is defined.
 */
function generateRateId(firmId: string, role: string, effectiveDate: string): string {
  return `rate_${firmId}_${role}_${effectiveDate}_${Date.now()}`;
}
