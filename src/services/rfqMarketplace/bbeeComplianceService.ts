// ─── B-BBEE Compliance Service ───────────────────────────────────────────────
// Handles B-BBEE compliance rules, certificate validation, warnings, and
// blocking logic for the RFQ Marketplace (Module 6).
// Separate from the Comparison Engine (which handles scoring) — this service
// handles compliance rules, certificate status, warnings, and award/finalisation gates.

import type {
  EvaluationCriteria,
  SupplierMarketplaceProfile,
  ValidationResult,
  RfqValidationError,
} from './types';
import {
  RFQ_ERROR_CODES,
  RFQ_ERROR_MESSAGES,
  MIN_BBEE_WEIGHT_PUBLIC_SECTOR,
  BBEE_VALUE_THRESHOLD,
} from './types';

// ─── Types ───────────────────────────────────────────────────────────────────

/** B-BBEE certificate status for a supplier. */
export type BbeeCertificateStatus = 'valid' | 'expired' | 'missing';

/** A warning about a supplier's B-BBEE certificate status. */
export interface BbeeWarning {
  supplierId: string;
  firmName: string;
  status: BbeeCertificateStatus;
  message: string;
}

/** A warning about a supplier falling below the local-spend target. */
export interface LocalSpendWarning {
  supplierId: string;
  firmName: string;
  localContentPct: number;
  targetPct: number;
  message: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** South African provinces used for local content calculation. */
export const SA_PROVINCES = [
  'Gauteng',
  'Western Cape',
  'KwaZulu-Natal',
  'Eastern Cape',
  'Free State',
  'Limpopo',
  'Mpumalanga',
  'North West',
  'Northern Cape',
] as const;

// ─── B-BBEE Criteria Validation ──────────────────────────────────────────────

/**
 * Validates that B-BBEE criteria weight meets minimum requirements.
 * Enforces minimum 10% weight for public sector projects or estimated values > R1,000,000.
 *
 * @param criteria - The evaluation criteria to validate
 * @param isPublicSector - Whether the project is public sector
 * @param estimatedValue - The estimated RFQ value in Rand (optional)
 * @returns ValidationResult indicating whether B-BBEE weight is compliant
 */
export function validateBbeeCriteria(
  criteria: EvaluationCriteria,
  isPublicSector: boolean,
  estimatedValue?: number
): ValidationResult {
  const requiresMinimumWeight =
    isPublicSector || (estimatedValue !== undefined && estimatedValue > BBEE_VALUE_THRESHOLD);

  if (requiresMinimumWeight && criteria.bbeeWeight < MIN_BBEE_WEIGHT_PUBLIC_SECTOR) {
    const errors: RfqValidationError[] = [
      {
        code: RFQ_ERROR_CODES.RFQ_BBEE_WEIGHT_LOW,
        message: RFQ_ERROR_MESSAGES.RFQ_BBEE_WEIGHT_LOW,
        field: 'bbeeWeight',
      },
    ];
    return { valid: false, errors };
  }

  return { valid: true };
}

// ─── Certificate Status ──────────────────────────────────────────────────────

/**
 * Determines the B-BBEE certificate status for a supplier profile.
 * Returns 'valid' if certificate exists and is not expired,
 * 'expired' if certificate exists but past its validity date,
 * 'missing' if no B-BBEE level number is recorded.
 *
 * @param profile - The supplier marketplace profile
 * @param referenceDate - Optional reference date for expiry comparison (defaults to now)
 * @returns The certificate status: 'valid', 'expired', or 'missing'
 */
export function getBbeeCertificateStatus(
  profile: SupplierMarketplaceProfile,
  referenceDate: Date = new Date()
): BbeeCertificateStatus {
  // No B-BBEE level recorded — certificate is missing
  if (profile.bbeeLevelNumber === undefined || profile.bbeeLevelNumber === null) {
    return 'missing';
  }

  // B-BBEE level exists but no expiry date — treat as missing certificate documentation
  if (!profile.bbeeCertificateExpiry) {
    return 'missing';
  }

  // Check if certificate has expired
  const expiryDate = new Date(profile.bbeeCertificateExpiry);
  if (expiryDate < referenceDate) {
    return 'expired';
  }

  return 'valid';
}

// ─── B-BBEE Warnings ─────────────────────────────────────────────────────────

/**
 * Generates warnings for suppliers with expired or missing B-BBEE certificates.
 * Distinguishes between expired and missing states for UI display.
 *
 * @param profiles - Array of supplier marketplace profiles to check
 * @param referenceDate - Optional reference date for expiry comparison (defaults to now)
 * @returns Array of B-BBEE warnings for non-compliant suppliers
 */
export function getBbeeWarnings(
  profiles: SupplierMarketplaceProfile[],
  referenceDate: Date = new Date()
): BbeeWarning[] {
  const warnings: BbeeWarning[] = [];

  for (const profile of profiles) {
    const status = getBbeeCertificateStatus(profile, referenceDate);

    if (status === 'expired') {
      warnings.push({
        supplierId: profile.supplierId,
        firmName: profile.firmName,
        status: 'expired',
        message: `B-BBEE certificate for ${profile.firmName} has expired (expiry: ${profile.bbeeCertificateExpiry}). Certificate must be renewed before award.`,
      });
    } else if (status === 'missing') {
      warnings.push({
        supplierId: profile.supplierId,
        firmName: profile.firmName,
        status: 'missing',
        message: `No B-BBEE certificate on file for ${profile.firmName}. Certificate must be uploaded before award.`,
      });
    }
  }

  return warnings;
}

// ─── Comparison Finalisation Gate ────────────────────────────────────────────

/**
 * Determines whether a comparison can be finalised.
 * For public sector projects, at least one supplier must have a valid B-BBEE certificate.
 *
 * @param profiles - Array of supplier marketplace profiles in the comparison
 * @param isPublicSector - Whether the project is public sector
 * @param referenceDate - Optional reference date for expiry comparison (defaults to now)
 * @returns true if comparison can be finalised, false if blocked
 */
export function canFinaliseComparison(
  profiles: SupplierMarketplaceProfile[],
  isPublicSector: boolean,
  referenceDate: Date = new Date()
): boolean {
  // Non-public sector projects can always finalise
  if (!isPublicSector) {
    return true;
  }

  // Public sector: at least one supplier must have a valid certificate
  return profiles.some(
    (profile) => getBbeeCertificateStatus(profile, referenceDate) === 'valid'
  );
}

// ─── Award Progression Gate ──────────────────────────────────────────────────

/**
 * Determines whether award progression is allowed for the recommended supplier.
 * Blocks progression if the supplier's B-BBEE certificate is expired or missing.
 *
 * @param recommendedSupplierProfile - The marketplace profile of the recommended supplier
 * @param referenceDate - Optional reference date for expiry comparison (defaults to now)
 * @returns true if award can progress, false if blocked
 */
export function canProgressAward(
  recommendedSupplierProfile: SupplierMarketplaceProfile,
  referenceDate: Date = new Date()
): boolean {
  const status = getBbeeCertificateStatus(recommendedSupplierProfile, referenceDate);
  return status === 'valid';
}

// ─── Local Content Calculation ───────────────────────────────────────────────

/**
 * Calculates local content percentage for a supplier based on delivery origin.
 * A supplier's delivery regions are compared against the project delivery region
 * to determine what percentage of their operations are "local" to the project.
 *
 * If the supplier delivers from the same region as the project, they receive 100%.
 * If they deliver from multiple regions, the percentage is calculated as the
 * proportion of their delivery regions that include the project region.
 * If the project delivery region is not in their delivery regions, 0%.
 *
 * @param supplierProfile - The supplier's marketplace profile with delivery regions
 * @param projectDeliveryRegion - The project's delivery region (SA province)
 * @returns Local content percentage (0–100)
 */
export function calculateLocalContentPercentage(
  supplierProfile: SupplierMarketplaceProfile,
  projectDeliveryRegion: string
): number {
  const { deliveryRegions } = supplierProfile;

  // If supplier has no delivery regions defined, local content is 0%
  if (!deliveryRegions || deliveryRegions.length === 0) {
    return 0;
  }

  // Check if the supplier delivers from the project's region
  const deliversLocally = deliveryRegions.some(
    (region) => region.toLowerCase() === projectDeliveryRegion.toLowerCase()
  );

  if (!deliversLocally) {
    return 0;
  }

  // Local content percentage is the inverse of geographic spread:
  // A supplier delivering only from the project region = 100% local
  // A supplier delivering from multiple regions (including project region) =
  // 1 / total_regions * 100 (i.e., the proportion of their operations that are local)
  // This incentivises suppliers with focused local operations.
  const localContentPct = Math.round((1 / deliveryRegions.length) * 100);

  return localContentPct;
}

// ─── Local Spend Warnings ────────────────────────────────────────────────────

/**
 * Generates warnings for suppliers whose local content percentage falls below
 * the project's local-spend target.
 *
 * @param profiles - Array of supplier marketplace profiles to check
 * @param localSpendTargetPct - The project's local-spend target percentage (0–100)
 * @param projectDeliveryRegion - The project's delivery region (SA province)
 * @returns Array of local-spend warnings for non-compliant suppliers
 */
export function getLocalSpendWarnings(
  profiles: SupplierMarketplaceProfile[],
  localSpendTargetPct: number,
  projectDeliveryRegion: string
): LocalSpendWarning[] {
  const warnings: LocalSpendWarning[] = [];

  for (const profile of profiles) {
    const localContentPct = calculateLocalContentPercentage(profile, projectDeliveryRegion);

    if (localContentPct < localSpendTargetPct) {
      warnings.push({
        supplierId: profile.supplierId,
        firmName: profile.firmName,
        localContentPct,
        targetPct: localSpendTargetPct,
        message: `${profile.firmName} local content (${localContentPct}%) is below the project target of ${localSpendTargetPct}%.`,
      });
    }
  }

  return warnings;
}
