/**
 * FM Bridge — Warranty Register Service
 *
 * Manages warranty lifecycle, expiry alerting, claims validation,
 * and forward-only claim state machine transitions.
 *
 * Pure functions — no direct persistence imports.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8
 */

import type {
  ClaimUrgency,
  WarrantyClaim,
  WarrantyClaimStage,
  WarrantyItem,
  WarrantyStatus,
} from '../types';

// ─── Service Result Type ──────────────────────────────────────────────────────

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

// ─── Output Types ─────────────────────────────────────────────────────────────

/** Result of evaluating a warranty's current status */
export interface WarrantyStatusResult {
  status: WarrantyStatus;
  remainingDays?: number;
}

/** An alert generated for a warranty approaching expiry */
export interface WarrantyAlert {
  warrantyId: string;
  alertType: 'warning_90' | 'urgent_30';
  daysRemaining: number;
  description: string;
}

/** Input for lodging a warranty claim */
export interface WarrantyClaimInput {
  defectDescription: string;
  locationInBuilding: string;
  photographicEvidence: string[];
  urgency: ClaimUrgency;
}

/** Input for creating a manual warranty item */
export interface CreateWarrantyItemInput {
  description: string;
  category: string;
  warrantyPeriodMonths: number;
  startDate: string;
  supplierName: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Forward-only claim state machine transitions (Requirement 3.6).
 * Each stage maps to its single valid next stage.
 */
const CLAIM_STAGE_ORDER: readonly WarrantyClaimStage[] = [
  'lodged',
  'acknowledged',
  'inspection_scheduled',
  'rectification_in_progress',
  'rectified',
  'closed',
] as const;

/** Valid warranty categories for manual creation (Requirement 3.7) */
const VALID_CATEGORIES = [
  'structural',
  'mechanical',
  'electrical',
  'plumbing',
  'finishes',
  'equipment',
  'other',
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calculates the difference in calendar days between two dates.
 * A positive result means `end` is in the future relative to `start`.
 */
function daysBetween(start: Date, end: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  // Use floor to truncate partial days
  return Math.floor((end.getTime() - start.getTime()) / msPerDay);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Evaluates the current status of a warranty item based on dates and existing status.
 *
 * Rules:
 * - If status is already "claimed" or "voided", retain that status
 * - If expiryDate > now → "active" with remaining days
 * - If expiryDate <= now → "expired"
 *
 * @param warranty - The warranty item to evaluate
 * @param now - Current date (injected for testability)
 * @returns ServiceResult with derived status and remaining days
 */
export function evaluateWarrantyStatus(
  warranty: WarrantyItem,
  now: Date,
): ServiceResult<WarrantyStatusResult> {
  if (!warranty || !now) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Warranty item and current date are required',
      },
    };
  }

  // If already claimed or voided, retain that status
  if (warranty.status === 'claimed') {
    return {
      success: true,
      data: { status: 'claimed' },
    };
  }

  if (warranty.status === 'voided') {
    return {
      success: true,
      data: { status: 'voided' },
    };
  }

  const expiryDate = new Date(warranty.expiryDate);
  const remaining = daysBetween(now, expiryDate);

  // Requirement 3.4: If expiry date passes and status was active, it's expired
  if (remaining <= 0) {
    return {
      success: true,
      data: { status: 'expired', remainingDays: 0 },
    };
  }

  // Active with remaining days
  return {
    success: true,
    data: { status: 'active', remainingDays: remaining },
  };
}

/**
 * Calculates warranty alerts for warranties approaching expiry.
 *
 * Rules (Requirements 3.2, 3.3):
 * - 90-day alert: expiryDate - now <= 90 days AND status is active (warning_90)
 * - 30-day alert: expiryDate - now <= 30 days AND status is active (urgent_30)
 * - Warranties that qualify for both get only the more urgent alert (30-day)
 *
 * @param warranties - Array of warranty items to check
 * @param now - Current date (injected for testability)
 * @returns ServiceResult with array of alerts
 */
export function calculateWarrantyAlerts(
  warranties: WarrantyItem[],
  now: Date,
): ServiceResult<WarrantyAlert[]> {
  if (!warranties || !now) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Warranties array and current date are required',
      },
    };
  }

  const alerts: WarrantyAlert[] = [];

  for (const warranty of warranties) {
    // Only check active warranties
    const statusResult = evaluateWarrantyStatus(warranty, now);
    if (!statusResult.success || statusResult.data.status !== 'active') {
      continue;
    }

    const remaining = statusResult.data.remainingDays!;

    // Requirement 3.3: 30-day urgent alert takes priority
    if (remaining <= 30) {
      alerts.push({
        warrantyId: warranty.id,
        alertType: 'urgent_30',
        daysRemaining: remaining,
        description: `Warranty "${warranty.description}" expires in ${remaining} day${remaining === 1 ? '' : 's'}. Urgent: review and lodge any claims before expiry.`,
      });
    } else if (remaining <= 90) {
      // Requirement 3.2: 90-day warning alert
      alerts.push({
        warrantyId: warranty.id,
        alertType: 'warning_90',
        daysRemaining: remaining,
        description: `Warranty "${warranty.description}" expires in ${remaining} days. Review warranty conditions and plan any required claims.`,
      });
    }
  }

  return {
    success: true,
    data: alerts,
  };
}

/**
 * Validates whether a warranty claim can be lodged against a warranty item.
 *
 * Rules:
 * - Requirement 3.8: Claims REJECTED against expired warranties
 * - Warranty must be "active" to accept a claim
 * - Claim input fields are validated (description, location, evidence, urgency)
 *
 * @param warranty - The warranty item to claim against
 * @param claim - The claim input data
 * @param now - Current date (injected for testability)
 * @returns ServiceResult with validation result
 */
export function validateWarrantyClaim(
  warranty: WarrantyItem,
  claim: WarrantyClaimInput,
  now: Date,
): ServiceResult<{ valid: boolean; errors?: string[] }> {
  if (!warranty || !claim || !now) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Warranty, claim data, and current date are required',
      },
    };
  }

  const errors: string[] = [];

  // Requirement 3.8: Reject claims against expired warranties
  const statusResult = evaluateWarrantyStatus(warranty, now);
  if (statusResult.success) {
    const derivedStatus = statusResult.data.status;

    if (derivedStatus === 'expired') {
      errors.push(
        `Warranty has expired. Expiry date: ${warranty.expiryDate}. Claims cannot be lodged against expired warranties.`,
      );
    } else if (derivedStatus === 'claimed') {
      errors.push(
        'Warranty already has an active claim. Only one claim may be active at a time.',
      );
    } else if (derivedStatus === 'voided') {
      errors.push('Warranty has been voided and cannot accept claims.');
    }
  }

  // Validate claim input fields
  if (!claim.defectDescription || claim.defectDescription.trim().length === 0) {
    errors.push('Defect description is required.');
  } else if (claim.defectDescription.length > 2000) {
    errors.push('Defect description must not exceed 2000 characters.');
  }

  if (!claim.locationInBuilding || claim.locationInBuilding.trim().length === 0) {
    errors.push('Location in building is required.');
  } else if (claim.locationInBuilding.length > 500) {
    errors.push('Location in building must not exceed 500 characters.');
  }

  if (claim.photographicEvidence) {
    if (claim.photographicEvidence.length > 10) {
      errors.push('Maximum 10 photographic evidence references allowed.');
    }
  }

  if (!claim.urgency) {
    errors.push('Urgency level is required.');
  } else if (!['routine', 'urgent', 'emergency'].includes(claim.urgency)) {
    errors.push('Urgency must be one of: routine, urgent, emergency.');
  }

  return {
    success: true,
    data: {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    },
  };
}

/**
 * Transitions a warranty claim to the next stage in the forward-only state machine.
 *
 * State machine (Requirement 3.6):
 * lodged → acknowledged → inspection_scheduled → rectification_in_progress → rectified → closed
 *
 * Rules:
 * - Only forward transitions permitted
 * - "closed" is the terminal state
 * - Target stage must be the immediate next stage (no skipping)
 *
 * @param claim - The current warranty claim
 * @param targetStage - The desired next stage
 * @returns ServiceResult with the updated claim or validation error
 */
export function transitionWarrantyClaim(
  claim: WarrantyClaim,
  targetStage: WarrantyClaimStage,
): ServiceResult<{ next: WarrantyClaim; valid: boolean; error?: string }> {
  if (!claim || !targetStage) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Claim and target stage are required',
      },
    };
  }

  const currentIndex = CLAIM_STAGE_ORDER.indexOf(claim.stage);
  const targetIndex = CLAIM_STAGE_ORDER.indexOf(targetStage);

  // Validate target stage is a known stage
  if (targetIndex === -1) {
    return {
      success: true,
      data: {
        next: claim,
        valid: false,
        error: `Invalid target stage: "${targetStage}". Valid stages: ${CLAIM_STAGE_ORDER.join(', ')}`,
      },
    };
  }

  // Terminal state — no further transitions allowed
  if (claim.stage === 'closed') {
    return {
      success: true,
      data: {
        next: claim,
        valid: false,
        error: 'Claim is already at terminal stage "closed". No further transitions permitted.',
      },
    };
  }

  // Must be the immediate next stage (forward-only, no skipping)
  if (targetIndex !== currentIndex + 1) {
    const expectedNext = CLAIM_STAGE_ORDER[currentIndex + 1];
    return {
      success: true,
      data: {
        next: claim,
        valid: false,
        error: `Cannot transition from "${claim.stage}" to "${targetStage}". ` +
          `Only forward transitions are permitted. Next valid stage: "${expectedNext}".`,
      },
    };
  }

  // Valid transition — produce updated claim
  const updatedClaim: WarrantyClaim = {
    ...claim,
    stage: targetStage,
    updatedAt: new Date().toISOString(),
  };

  return {
    success: true,
    data: {
      next: updatedClaim,
      valid: true,
    },
  };
}

/**
 * Validates input for creating a new warranty item manually (Requirement 3.7).
 *
 * Required fields with constraints:
 * - description: required, max 500 characters
 * - category: required, from defined list
 * - warrantyPeriodMonths: required, range 1–240
 * - startDate: required, valid date string
 * - supplierName: required, max 200 characters
 *
 * @param input - The manual warranty creation input
 * @returns ServiceResult with validation result
 */
export function validateManualWarrantyCreation(
  input: CreateWarrantyItemInput,
): ServiceResult<{ valid: boolean; errors?: string[] }> {
  if (!input) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Warranty item input data is required',
      },
    };
  }

  const errors: string[] = [];

  // Description: required, max 500 chars
  if (!input.description || input.description.trim().length === 0) {
    errors.push('Item description is required.');
  } else if (input.description.length > 500) {
    errors.push('Item description must not exceed 500 characters.');
  }

  // Category: required, from defined list
  if (!input.category) {
    errors.push('Category is required.');
  } else if (!VALID_CATEGORIES.includes(input.category as (typeof VALID_CATEGORIES)[number])) {
    errors.push(
      `Category must be one of: ${VALID_CATEGORIES.join(', ')}. Received: "${input.category}".`,
    );
  }

  // Warranty period: required, range 1–240
  if (input.warrantyPeriodMonths === undefined || input.warrantyPeriodMonths === null) {
    errors.push('Warranty period in months is required.');
  } else if (
    !Number.isInteger(input.warrantyPeriodMonths) ||
    input.warrantyPeriodMonths < 1 ||
    input.warrantyPeriodMonths > 240
  ) {
    errors.push('Warranty period must be an integer between 1 and 240 months.');
  }

  // Start date: required
  if (!input.startDate || input.startDate.trim().length === 0) {
    errors.push('Start date is required.');
  } else {
    const parsed = new Date(input.startDate);
    if (isNaN(parsed.getTime())) {
      errors.push('Start date must be a valid date string.');
    }
  }

  // Supplier name: required, max 200 chars
  if (!input.supplierName || input.supplierName.trim().length === 0) {
    errors.push('Supplier name is required.');
  } else if (input.supplierName.length > 200) {
    errors.push('Supplier name must not exceed 200 characters.');
  }

  return {
    success: true,
    data: {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    },
  };
}
