/**
 * FM Bridge — Asset Register Service
 *
 * Manages building assets with condition tracking, replacement planning,
 * CSV import validation, and alert generation.
 *
 * Pure functions — no direct persistence imports.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7
 */

import type {
  AssetCategory,
  AssetCondition,
  AssetItem,
  FMBuildingRole,
  WarrantyItem,
} from '../types';

// ─── Service Result Type ──────────────────────────────────────────────────────

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

// ─── Output Types ─────────────────────────────────────────────────────────────

/** Summary metrics for the asset register (Requirement 4.3) */
export interface AssetMetricsSummary {
  totalAssetsByCategory: Record<AssetCategory, number>;
  totalReplacementValue: number;
  assetsApproachingEndOfLife: AssetItem[];
  assetsInPoorOrFailedCondition: AssetItem[];
  assetsOverdueForInspection: AssetItem[];
}

/** Alert generated from asset evaluation */
export interface AssetAlert {
  assetId: string;
  alertType: 'end_of_life' | 'failed_condition';
  message: string;
}

/** Validation error for a CSV import row */
export interface ImportValidationError {
  row: number;
  field: string;
  message: string;
}

/** Result of CSV import validation */
export interface ImportValidationResult {
  valid: AssetItem[];
  errors: ImportValidationError[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** End-of-life threshold in months (Requirement 4.4) */
const END_OF_LIFE_THRESHOLD_MONTHS = 24;

/** Inspection overdue threshold in months (Requirement 4.3) */
const INSPECTION_OVERDUE_MONTHS = 12;

/** Valid asset categories */
const VALID_CATEGORIES: AssetCategory[] = [
  'structural', 'mechanical', 'electrical', 'plumbing', 'fire_protection',
  'lifts', 'security', 'finishes', 'landscaping', 'other',
];

/** Valid asset conditions */
const VALID_CONDITIONS: AssetCondition[] = [
  'excellent', 'good', 'fair', 'poor', 'failed',
];

/** Roles permitted to modify asset records (Requirement 4.7) */
const MODIFICATION_ROLES: FMBuildingRole[] = ['building_owner', 'facility_manager'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generates a unique ID for a new record */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Determines if an asset is approaching end of life.
 * End of life = installationDate + expectedUsefulLifeYears within 24 months of now.
 */
function isApproachingEndOfLife(asset: AssetItem, now: Date): boolean {
  if (!asset.installationDate || !asset.expectedUsefulLifeYears) {
    return false;
  }

  const installDate = new Date(asset.installationDate);
  const endOfLifeDate = new Date(installDate);
  endOfLifeDate.setFullYear(endOfLifeDate.getFullYear() + asset.expectedUsefulLifeYears);

  const thresholdDate = new Date(now);
  thresholdDate.setMonth(thresholdDate.getMonth() + END_OF_LIFE_THRESHOLD_MONTHS);

  // End of life is within 24 months if endOfLifeDate <= now + 24 months
  // AND the asset hasn't already passed end of life... actually requirement says "within 24 months"
  // which means: endOfLifeDate is between now and now + 24 months (or already past)
  return endOfLifeDate <= thresholdDate;
}

/**
 * Determines if an asset is overdue for inspection.
 * Overdue = lastInspectionDate > 12 months ago OR not set.
 */
function isOverdueForInspection(asset: AssetItem, now: Date): boolean {
  if (!asset.lastInspectionDate) {
    return true;
  }

  const lastInspection = new Date(asset.lastInspectionDate);
  const threshold = new Date(now);
  threshold.setMonth(threshold.getMonth() - INSPECTION_OVERDUE_MONTHS);

  return lastInspection < threshold;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Checks whether a given role is permitted to modify asset records.
 *
 * Only building_owner and facility_manager roles may create, update, or delete assets.
 * (Requirement 4.7)
 *
 * @param role - The user's FM building role
 * @returns ServiceResult indicating whether modification is permitted
 */
export function checkAssetModificationPermission(
  role: FMBuildingRole,
): ServiceResult<{ permitted: boolean }> {
  if (!role) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Role is required',
      },
    };
  }

  if (!MODIFICATION_ROLES.includes(role)) {
    return {
      success: true,
      data: {
        permitted: false,
      },
    };
  }

  return {
    success: true,
    data: { permitted: true },
  };
}

/**
 * Calculates summary metrics for the asset register.
 *
 * Produces:
 * - Total assets by category
 * - Total replacement value (sum of all replacement cost estimates)
 * - Assets approaching end of life (installation date + useful life within 24 months)
 * - Assets in poor or failed condition
 * - Assets overdue for inspection (last inspection > 12 months ago or not set)
 *
 * (Requirement 4.3)
 *
 * @param assets - All assets for a building
 * @param now - Current date (injected for testability)
 * @returns ServiceResult with asset metrics summary
 */
export function calculateAssetMetrics(
  assets: AssetItem[],
  now: Date,
): ServiceResult<AssetMetricsSummary> {
  if (!assets || !now) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Assets array and current date are required',
      },
    };
  }

  // Initialize category counts
  const totalAssetsByCategory = VALID_CATEGORIES.reduce(
    (acc, cat) => {
      acc[cat] = 0;
      return acc;
    },
    {} as Record<AssetCategory, number>,
  );

  let totalReplacementValue = 0;
  const assetsApproachingEndOfLife: AssetItem[] = [];
  const assetsInPoorOrFailedCondition: AssetItem[] = [];
  const assetsOverdueForInspection: AssetItem[] = [];

  for (const asset of assets) {
    // Count by category
    if (asset.category && totalAssetsByCategory[asset.category] !== undefined) {
      totalAssetsByCategory[asset.category]++;
    }

    // Sum replacement value
    if (asset.replacementCostZAR != null && asset.replacementCostZAR > 0) {
      totalReplacementValue += asset.replacementCostZAR;
    }

    // Check end of life (Requirement 4.4)
    if (isApproachingEndOfLife(asset, now)) {
      assetsApproachingEndOfLife.push(asset);
    }

    // Check condition (Requirement 4.5)
    if (asset.condition === 'poor' || asset.condition === 'failed') {
      assetsInPoorOrFailedCondition.push(asset);
    }

    // Check inspection overdue
    if (isOverdueForInspection(asset, now)) {
      assetsOverdueForInspection.push(asset);
    }
  }

  return {
    success: true,
    data: {
      totalAssetsByCategory,
      totalReplacementValue,
      assetsApproachingEndOfLife,
      assetsInPoorOrFailedCondition,
      assetsOverdueForInspection,
    },
  };
}

/**
 * Validates rows from a CSV import against asset field rules.
 *
 * Each row is validated for:
 * - description: required, max 500 characters
 * - category: must be from the defined enum
 * - locationInBuilding: required, max 200 characters
 * - expectedUsefulLifeYears: 1–100 if present
 * - replacementCostZAR: 0.01–999,999,999.99 if present
 * - condition: must be from the defined enum
 *
 * Produces valid AssetItem records and errors by row number.
 * (Requirement 4.6)
 *
 * @param rows - Array of raw row data (Record<string, unknown>)
 * @param buildingId - The building these assets belong to
 * @returns ServiceResult with valid assets and validation errors
 */
export function validateAssetImport(
  rows: Record<string, unknown>[],
  buildingId: string = 'import_building',
): ServiceResult<ImportValidationResult> {
  if (!rows) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Rows array is required',
      },
    };
  }

  const valid: AssetItem[] = [];
  const errors: ImportValidationError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 1; // 1-indexed for user-facing error messages
    const rowErrors: ImportValidationError[] = [];

    // Validate description (required, max 500)
    const description = row.description;
    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      rowErrors.push({ row: rowNumber, field: 'description', message: 'Description is required' });
    } else if (description.length > 500) {
      rowErrors.push({ row: rowNumber, field: 'description', message: 'Description must not exceed 500 characters' });
    }

    // Validate category (from enum)
    const category = row.category;
    if (!category || typeof category !== 'string' || !VALID_CATEGORIES.includes(category as AssetCategory)) {
      rowErrors.push({
        row: rowNumber,
        field: 'category',
        message: `Category must be one of: ${VALID_CATEGORIES.join(', ')}`,
      });
    }

    // Validate locationInBuilding (required, max 200)
    const location = row.locationInBuilding;
    if (!location || typeof location !== 'string' || location.trim().length === 0) {
      rowErrors.push({ row: rowNumber, field: 'locationInBuilding', message: 'Location in building is required' });
    } else if (location.length > 200) {
      rowErrors.push({ row: rowNumber, field: 'locationInBuilding', message: 'Location must not exceed 200 characters' });
    }

    // Validate expectedUsefulLifeYears (1–100 if present)
    const usefulLife = row.expectedUsefulLifeYears;
    if (usefulLife != null && usefulLife !== '' && usefulLife !== undefined) {
      const life = Number(usefulLife);
      if (isNaN(life) || !Number.isInteger(life) || life < 1 || life > 100) {
        rowErrors.push({
          row: rowNumber,
          field: 'expectedUsefulLifeYears',
          message: 'Expected useful life must be an integer between 1 and 100',
        });
      }
    }

    // Validate replacementCostZAR (0.01–999,999,999.99 if present)
    const cost = row.replacementCostZAR;
    if (cost != null && cost !== '' && cost !== undefined) {
      const costNum = Number(cost);
      if (isNaN(costNum) || costNum < 0.01 || costNum > 999_999_999.99) {
        rowErrors.push({
          row: rowNumber,
          field: 'replacementCostZAR',
          message: 'Replacement cost must be between 0.01 and 999,999,999.99',
        });
      }
    }

    // Validate condition (from enum)
    const condition = row.condition;
    if (!condition || typeof condition !== 'string' || !VALID_CONDITIONS.includes(condition as AssetCondition)) {
      rowErrors.push({
        row: rowNumber,
        field: 'condition',
        message: `Condition must be one of: ${VALID_CONDITIONS.join(', ')}`,
      });
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
    } else {
      // Build valid AssetItem
      const timestamp = new Date().toISOString();
      const asset: AssetItem = {
        id: generateId('ast'),
        buildingId,
        assetIdentifier: `AST-${String(rowNumber).padStart(4, '0')}`,
        description: (description as string).trim(),
        category: category as AssetCategory,
        locationInBuilding: (location as string).trim(),
        manufacturer: row.manufacturer ? String(row.manufacturer).slice(0, 200) : undefined,
        modelNumber: row.modelNumber ? String(row.modelNumber).slice(0, 100) : undefined,
        serialNumber: row.serialNumber ? String(row.serialNumber).slice(0, 100) : undefined,
        installationDate: row.installationDate ? String(row.installationDate) : undefined,
        expectedUsefulLifeYears: usefulLife != null && usefulLife !== '' ? Number(usefulLife) : undefined,
        replacementCostZAR: cost != null && cost !== '' ? Number(cost) : undefined,
        condition: condition as AssetCondition,
        lastInspectionDate: row.lastInspectionDate ? String(row.lastInspectionDate) : undefined,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      valid.push(asset);
    }
  }

  return {
    success: true,
    data: { valid, errors },
  };
}

/**
 * Evaluates asset alerts based on end-of-life proximity and failed condition.
 *
 * Alert types:
 * - end_of_life: asset's installationDate + expectedUsefulLifeYears within 24 months of now
 * - failed_condition: asset condition is 'failed', with warranty cross-reference suggestion
 *
 * For failed condition alerts, if the asset has an active warranty in the provided
 * warranties list, the alert message suggests a warranty claim may be applicable.
 * (Requirements 4.4, 4.5)
 *
 * @param assets - All assets to evaluate
 * @param now - Current date (injected for testability)
 * @param warranties - Optional warranty items for cross-reference
 * @returns ServiceResult with array of alerts
 */
export function evaluateAssetAlerts(
  assets: AssetItem[],
  now: Date,
  warranties: WarrantyItem[] = [],
): ServiceResult<AssetAlert[]> {
  if (!assets || !now) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Assets array and current date are required',
      },
    };
  }

  const alerts: AssetAlert[] = [];

  for (const asset of assets) {
    // End-of-life alert (Requirement 4.4)
    if (isApproachingEndOfLife(asset, now)) {
      const installDate = new Date(asset.installationDate!);
      const endOfLifeDate = new Date(installDate);
      endOfLifeDate.setFullYear(endOfLifeDate.getFullYear() + asset.expectedUsefulLifeYears!);

      alerts.push({
        assetId: asset.id,
        alertType: 'end_of_life',
        message: `Asset "${asset.description}" is approaching end of useful life (expected: ${endOfLifeDate.toISOString().slice(0, 10)}). Plan for replacement.`,
      });
    }

    // Failed condition alert (Requirement 4.5)
    if (asset.condition === 'failed') {
      // Check if active warranty exists for this asset's building
      const activeWarranty = warranties.find(
        (w) => w.buildingId === asset.buildingId && w.status === 'active',
      );

      let message = `Asset "${asset.description}" has failed condition. Replacement planning recommended.`;
      if (activeWarranty) {
        message += ` An active warranty exists (${activeWarranty.description}) — a warranty claim may be applicable.`;
      }

      alerts.push({
        assetId: asset.id,
        alertType: 'failed_condition',
        message,
      });
    }
  }

  return {
    success: true,
    data: alerts,
  };
}
