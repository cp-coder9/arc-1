/**
 * Unit Tests — Asset Register Service
 *
 * Tests for calculateAssetMetrics(), validateAssetImport(),
 * evaluateAssetAlerts(), and checkAssetModificationPermission().
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7
 */

import { describe, expect, it } from 'vitest';

import type { AssetItem, FMBuildingRole, WarrantyItem } from '../types';
import {
  calculateAssetMetrics,
  checkAssetModificationPermission,
  evaluateAssetAlerts,
  validateAssetImport,
} from '../services/assetRegister';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function createAsset(overrides: Partial<AssetItem> = {}): AssetItem {
  return {
    id: 'ast_001',
    buildingId: 'bld_001',
    assetIdentifier: 'AST-0001',
    description: 'HVAC Unit Level 3',
    category: 'mechanical',
    locationInBuilding: 'Level 3, Plant Room',
    manufacturer: 'Carrier',
    modelNumber: 'CR-5000',
    serialNumber: 'SN-123456',
    installationDate: '2020-01-15T00:00:00.000Z',
    expectedUsefulLifeYears: 15,
    replacementCostZAR: 250000,
    condition: 'good',
    lastInspectionDate: '2025-01-10T00:00:00.000Z',
    createdAt: '2020-01-15T00:00:00.000Z',
    updatedAt: '2025-01-10T00:00:00.000Z',
    ...overrides,
  };
}

function createWarranty(overrides: Partial<WarrantyItem> = {}): WarrantyItem {
  return {
    id: 'wty_001',
    buildingId: 'bld_001',
    description: 'HVAC System Warranty',
    category: 'mechanical',
    supplierName: 'Carrier SA',
    warrantyPeriodMonths: 60,
    startDate: '2020-01-15T00:00:00.000Z',
    expiryDate: '2025-01-15T00:00:00.000Z',
    status: 'active',
    sourceHandover: true,
    createdAt: '2020-01-15T00:00:00.000Z',
    updatedAt: '2020-01-15T00:00:00.000Z',
    ...overrides,
  };
}

const NOW = new Date('2025-07-01T10:00:00.000Z');

// ─── checkAssetModificationPermission Tests ───────────────────────────────────

describe('checkAssetModificationPermission', () => {
  it('permits building_owner to modify assets (Requirement 4.7)', () => {
    const result = checkAssetModificationPermission('building_owner');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.permitted).toBe(true);
    }
  });

  it('permits facility_manager to modify assets (Requirement 4.7)', () => {
    const result = checkAssetModificationPermission('facility_manager');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.permitted).toBe(true);
    }
  });

  it('rejects read_only role from modifying assets (Requirement 4.7)', () => {
    const result = checkAssetModificationPermission('read_only');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.permitted).toBe(false);
    }
  });

  it('rejects body_corporate_admin role from modifying assets (Requirement 4.7)', () => {
    const result = checkAssetModificationPermission('body_corporate_admin');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.permitted).toBe(false);
    }
  });
});

// ─── calculateAssetMetrics Tests ──────────────────────────────────────────────

describe('calculateAssetMetrics', () => {
  it('calculates total assets by category (Requirement 4.3)', () => {
    const assets = [
      createAsset({ category: 'mechanical' }),
      createAsset({ id: 'ast_002', category: 'mechanical' }),
      createAsset({ id: 'ast_003', category: 'electrical' }),
      createAsset({ id: 'ast_004', category: 'plumbing' }),
    ];

    const result = calculateAssetMetrics(assets, NOW);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalAssetsByCategory.mechanical).toBe(2);
      expect(result.data.totalAssetsByCategory.electrical).toBe(1);
      expect(result.data.totalAssetsByCategory.plumbing).toBe(1);
      expect(result.data.totalAssetsByCategory.structural).toBe(0);
    }
  });

  it('calculates total replacement value (Requirement 4.3)', () => {
    const assets = [
      createAsset({ replacementCostZAR: 100000 }),
      createAsset({ id: 'ast_002', replacementCostZAR: 250000 }),
      createAsset({ id: 'ast_003', replacementCostZAR: undefined }),
    ];

    const result = calculateAssetMetrics(assets, NOW);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalReplacementValue).toBe(350000);
    }
  });

  it('identifies assets approaching end of life within 24 months (Requirement 4.4)', () => {
    const assets = [
      // Installed 2020, 7-year life → end of life 2027-01-15, within 24 months of July 2025
      createAsset({ id: 'ast_eol', installationDate: '2020-01-15T00:00:00.000Z', expectedUsefulLifeYears: 7 }),
      // Installed 2020, 15-year life → end of life 2035, NOT within 24 months
      createAsset({ id: 'ast_ok', installationDate: '2020-01-15T00:00:00.000Z', expectedUsefulLifeYears: 15 }),
    ];

    const result = calculateAssetMetrics(assets, NOW);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assetsApproachingEndOfLife).toHaveLength(1);
      expect(result.data.assetsApproachingEndOfLife[0].id).toBe('ast_eol');
    }
  });

  it('does not flag end of life when installationDate or expectedUsefulLifeYears is missing', () => {
    const assets = [
      createAsset({ id: 'ast_no_date', installationDate: undefined, expectedUsefulLifeYears: 5 }),
      createAsset({ id: 'ast_no_life', installationDate: '2020-01-01T00:00:00.000Z', expectedUsefulLifeYears: undefined }),
    ];

    const result = calculateAssetMetrics(assets, NOW);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assetsApproachingEndOfLife).toHaveLength(0);
    }
  });

  it('identifies assets in poor or failed condition (Requirement 4.5)', () => {
    const assets = [
      createAsset({ id: 'ast_poor', condition: 'poor' }),
      createAsset({ id: 'ast_failed', condition: 'failed' }),
      createAsset({ id: 'ast_good', condition: 'good' }),
      createAsset({ id: 'ast_fair', condition: 'fair' }),
    ];

    const result = calculateAssetMetrics(assets, NOW);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assetsInPoorOrFailedCondition).toHaveLength(2);
      const ids = result.data.assetsInPoorOrFailedCondition.map((a) => a.id);
      expect(ids).toContain('ast_poor');
      expect(ids).toContain('ast_failed');
    }
  });

  it('identifies assets overdue for inspection — last inspection > 12 months ago (Requirement 4.3)', () => {
    const assets = [
      // Last inspected 2024-01-01 — more than 12 months before July 2025
      createAsset({ id: 'ast_overdue', lastInspectionDate: '2024-01-01T00:00:00.000Z' }),
      // Last inspected 2025-03-01 — within 12 months
      createAsset({ id: 'ast_ok', lastInspectionDate: '2025-03-01T00:00:00.000Z' }),
    ];

    const result = calculateAssetMetrics(assets, NOW);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assetsOverdueForInspection).toHaveLength(1);
      expect(result.data.assetsOverdueForInspection[0].id).toBe('ast_overdue');
    }
  });

  it('flags assets with no lastInspectionDate as overdue', () => {
    const assets = [
      createAsset({ id: 'ast_none', lastInspectionDate: undefined }),
    ];

    const result = calculateAssetMetrics(assets, NOW);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assetsOverdueForInspection).toHaveLength(1);
    }
  });

  it('returns empty metrics for an empty asset array', () => {
    const result = calculateAssetMetrics([], NOW);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalReplacementValue).toBe(0);
      expect(result.data.assetsApproachingEndOfLife).toHaveLength(0);
      expect(result.data.assetsInPoorOrFailedCondition).toHaveLength(0);
      expect(result.data.assetsOverdueForInspection).toHaveLength(0);
    }
  });

  it('returns error when inputs are invalid', () => {
    const result = calculateAssetMetrics(null as unknown as AssetItem[], NOW);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_INPUT');
    }
  });
});

// ─── validateAssetImport Tests ────────────────────────────────────────────────

describe('validateAssetImport', () => {
  it('validates a correct row and produces a valid AssetItem (Requirement 4.6)', () => {
    const rows = [
      {
        description: 'Fire pump unit',
        category: 'fire_protection',
        locationInBuilding: 'Basement B2',
        expectedUsefulLifeYears: 20,
        replacementCostZAR: 85000,
        condition: 'good',
      },
    ];

    const result = validateAssetImport(rows, 'bld_001');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toHaveLength(1);
      expect(result.data.errors).toHaveLength(0);
      expect(result.data.valid[0].description).toBe('Fire pump unit');
      expect(result.data.valid[0].category).toBe('fire_protection');
      expect(result.data.valid[0].buildingId).toBe('bld_001');
    }
  });

  it('reports error for missing description', () => {
    const rows = [
      {
        description: '',
        category: 'electrical',
        locationInBuilding: 'Level 1',
        condition: 'good',
      },
    ];

    const result = validateAssetImport(rows);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toHaveLength(0);
      expect(result.data.errors).toHaveLength(1);
      expect(result.data.errors[0].field).toBe('description');
      expect(result.data.errors[0].row).toBe(1);
    }
  });

  it('reports error for description exceeding 500 characters', () => {
    const rows = [
      {
        description: 'x'.repeat(501),
        category: 'electrical',
        locationInBuilding: 'Level 1',
        condition: 'good',
      },
    ];

    const result = validateAssetImport(rows);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.errors.some((e) => e.field === 'description')).toBe(true);
    }
  });

  it('reports error for invalid category', () => {
    const rows = [
      {
        description: 'Test item',
        category: 'invalid_category',
        locationInBuilding: 'Level 1',
        condition: 'good',
      },
    ];

    const result = validateAssetImport(rows);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toHaveLength(0);
      expect(result.data.errors.some((e) => e.field === 'category')).toBe(true);
    }
  });

  it('reports error for missing locationInBuilding', () => {
    const rows = [
      {
        description: 'Test item',
        category: 'electrical',
        locationInBuilding: '',
        condition: 'good',
      },
    ];

    const result = validateAssetImport(rows);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.errors.some((e) => e.field === 'locationInBuilding')).toBe(true);
    }
  });

  it('reports error for locationInBuilding exceeding 200 characters', () => {
    const rows = [
      {
        description: 'Test item',
        category: 'electrical',
        locationInBuilding: 'x'.repeat(201),
        condition: 'good',
      },
    ];

    const result = validateAssetImport(rows);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.errors.some((e) => e.field === 'locationInBuilding')).toBe(true);
    }
  });

  it('reports error for expectedUsefulLifeYears outside range 1–100', () => {
    const rows = [
      {
        description: 'Test item',
        category: 'electrical',
        locationInBuilding: 'Level 1',
        expectedUsefulLifeYears: 0,
        condition: 'good',
      },
      {
        description: 'Test item 2',
        category: 'electrical',
        locationInBuilding: 'Level 2',
        expectedUsefulLifeYears: 101,
        condition: 'good',
      },
    ];

    const result = validateAssetImport(rows);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toHaveLength(0);
      expect(result.data.errors.filter((e) => e.field === 'expectedUsefulLifeYears')).toHaveLength(2);
    }
  });

  it('reports error for replacementCostZAR outside range', () => {
    const rows = [
      {
        description: 'Test item',
        category: 'plumbing',
        locationInBuilding: 'Level 1',
        replacementCostZAR: 0,
        condition: 'fair',
      },
      {
        description: 'Test item 2',
        category: 'plumbing',
        locationInBuilding: 'Level 2',
        replacementCostZAR: 1_000_000_000,
        condition: 'fair',
      },
    ];

    const result = validateAssetImport(rows);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toHaveLength(0);
      expect(result.data.errors.filter((e) => e.field === 'replacementCostZAR')).toHaveLength(2);
    }
  });

  it('reports error for invalid condition', () => {
    const rows = [
      {
        description: 'Test item',
        category: 'electrical',
        locationInBuilding: 'Level 1',
        condition: 'broken',
      },
    ];

    const result = validateAssetImport(rows);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.errors.some((e) => e.field === 'condition')).toBe(true);
    }
  });

  it('handles multiple rows with mixed valid and invalid data', () => {
    const rows = [
      {
        description: 'Valid asset',
        category: 'structural',
        locationInBuilding: 'Ground Floor',
        condition: 'excellent',
      },
      {
        description: '', // invalid
        category: 'structural',
        locationInBuilding: 'Level 1',
        condition: 'good',
      },
      {
        description: 'Another valid',
        category: 'lifts',
        locationInBuilding: 'Shaft 1',
        condition: 'fair',
        replacementCostZAR: 500000,
      },
    ];

    const result = validateAssetImport(rows, 'bld_002');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toHaveLength(2);
      expect(result.data.errors).toHaveLength(1);
      expect(result.data.errors[0].row).toBe(2);
    }
  });

  it('allows optional fields to be omitted', () => {
    const rows = [
      {
        description: 'Minimal asset',
        category: 'other',
        locationInBuilding: 'Roof',
        condition: 'good',
      },
    ];

    const result = validateAssetImport(rows);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toHaveLength(1);
      expect(result.data.valid[0].expectedUsefulLifeYears).toBeUndefined();
      expect(result.data.valid[0].replacementCostZAR).toBeUndefined();
    }
  });

  it('returns error when rows is null', () => {
    const result = validateAssetImport(null as unknown as Record<string, unknown>[]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_INPUT');
    }
  });
});

// ─── evaluateAssetAlerts Tests ────────────────────────────────────────────────

describe('evaluateAssetAlerts', () => {
  it('generates end_of_life alert when asset is within 24 months of end of life (Requirement 4.4)', () => {
    // Installed 2020, 7-year life → end of life Jan 2027, within 24 months of July 2025
    const assets = [
      createAsset({
        id: 'ast_eol',
        installationDate: '2020-01-15T00:00:00.000Z',
        expectedUsefulLifeYears: 7,
      }),
    ];

    const result = evaluateAssetAlerts(assets, NOW);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].alertType).toBe('end_of_life');
      expect(result.data[0].assetId).toBe('ast_eol');
    }
  });

  it('does not generate end_of_life alert when asset is NOT within 24 months', () => {
    // Installed 2020, 15-year life → end of life 2035, NOT within 24 months of July 2025
    const assets = [
      createAsset({
        id: 'ast_ok',
        installationDate: '2020-01-15T00:00:00.000Z',
        expectedUsefulLifeYears: 15,
      }),
    ];

    const result = evaluateAssetAlerts(assets, NOW);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(0);
    }
  });

  it('generates failed_condition alert for failed assets (Requirement 4.5)', () => {
    const assets = [
      createAsset({ id: 'ast_failed', condition: 'failed' }),
    ];

    const result = evaluateAssetAlerts(assets, NOW);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].alertType).toBe('failed_condition');
      expect(result.data[0].message).toContain('failed condition');
    }
  });

  it('includes warranty cross-reference in failed_condition alert when active warranty exists (Requirement 4.5)', () => {
    const assets = [
      createAsset({ id: 'ast_failed', condition: 'failed', buildingId: 'bld_001' }),
    ];
    const warranties = [
      createWarranty({ buildingId: 'bld_001', status: 'active', description: 'Mechanical Warranty' }),
    ];

    const result = evaluateAssetAlerts(assets, NOW, warranties);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].message).toContain('warranty claim may be applicable');
      expect(result.data[0].message).toContain('Mechanical Warranty');
    }
  });

  it('does not include warranty cross-reference when warranty is expired', () => {
    const assets = [
      createAsset({ id: 'ast_failed', condition: 'failed', buildingId: 'bld_001' }),
    ];
    const warranties = [
      createWarranty({ buildingId: 'bld_001', status: 'expired' }),
    ];

    const result = evaluateAssetAlerts(assets, NOW, warranties);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].message).not.toContain('warranty claim may be applicable');
    }
  });

  it('generates both end_of_life and failed_condition alerts for the same asset', () => {
    // Installed 2020, 6-year life → end of life 2026, within 24 months; condition=failed
    const assets = [
      createAsset({
        id: 'ast_both',
        installationDate: '2020-01-01T00:00:00.000Z',
        expectedUsefulLifeYears: 6,
        condition: 'failed',
      }),
    ];

    const result = evaluateAssetAlerts(assets, NOW);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
      const types = result.data.map((a) => a.alertType);
      expect(types).toContain('end_of_life');
      expect(types).toContain('failed_condition');
    }
  });

  it('returns empty alerts for assets in good condition with distant end of life', () => {
    const assets = [
      createAsset({ condition: 'good', installationDate: '2024-01-01T00:00:00.000Z', expectedUsefulLifeYears: 20 }),
    ];

    const result = evaluateAssetAlerts(assets, NOW);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(0);
    }
  });

  it('returns error when inputs are invalid', () => {
    const result = evaluateAssetAlerts(null as unknown as AssetItem[], NOW);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_INPUT');
    }
  });
});
