// @vitest-environment node
/**
 * FM Bridge — Warranty Register Service Tests
 *
 * Unit tests for warranty status evaluation, alert calculation,
 * claim validation, claim state machine, and manual warranty creation.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8
 */

import { describe, expect, it } from 'vitest';

import type { WarrantyClaim, WarrantyItem } from '../types';
import {
  calculateWarrantyAlerts,
  evaluateWarrantyStatus,
  transitionWarrantyClaim,
  validateManualWarrantyCreation,
  validateWarrantyClaim,
} from '../services/warrantyRegister';

// ─── Test Fixtures ────────────────────────────────────────────────────────────

function createWarrantyItem(overrides: Partial<WarrantyItem> = {}): WarrantyItem {
  return {
    id: 'wty_test_001',
    buildingId: 'bld_test_001',
    description: 'Roof waterproofing membrane',
    category: 'structural',
    supplierName: 'WaterTight Systems (Pty) Ltd',
    warrantyPeriodMonths: 60,
    startDate: '2024-01-15T00:00:00.000Z',
    expiryDate: '2029-01-15T00:00:00.000Z',
    status: 'active',
    sourceHandover: true,
    createdAt: '2024-01-15T00:00:00.000Z',
    updatedAt: '2024-01-15T00:00:00.000Z',
    ...overrides,
  };
}

function createWarrantyClaim(overrides: Partial<WarrantyClaim> = {}): WarrantyClaim {
  return {
    id: 'clm_test_001',
    warrantyId: 'wty_test_001',
    buildingId: 'bld_test_001',
    claimDate: '2025-06-01T00:00:00.000Z',
    defectDescription: 'Water ingress through roof membrane at south elevation',
    locationInBuilding: 'Level 3, Unit 305 bathroom ceiling',
    photographicEvidence: ['photo_001.jpg', 'photo_002.jpg'],
    urgency: 'urgent',
    stage: 'lodged',
    stageHistory: [{ stage: 'lodged', date: '2025-06-01T00:00:00.000Z', actor: 'user_001' }],
    createdAt: '2025-06-01T00:00:00.000Z',
    updatedAt: '2025-06-01T00:00:00.000Z',
    ...overrides,
  };
}

// ─── evaluateWarrantyStatus Tests ─────────────────────────────────────────────

describe('evaluateWarrantyStatus', () => {
  it('returns "active" with remaining days when warranty has not expired', () => {
    const warranty = createWarrantyItem({
      expiryDate: '2029-01-15T00:00:00.000Z',
    });
    const now = new Date('2025-06-01T00:00:00.000Z');

    const result = evaluateWarrantyStatus(warranty, now);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('active');
      expect(result.data.remainingDays).toBeGreaterThan(0);
    }
  });

  it('returns "expired" when warranty expiry date has passed', () => {
    const warranty = createWarrantyItem({
      expiryDate: '2025-01-01T00:00:00.000Z',
      status: 'active',
    });
    const now = new Date('2025-06-01T00:00:00.000Z');

    const result = evaluateWarrantyStatus(warranty, now);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('expired');
      expect(result.data.remainingDays).toBe(0);
    }
  });

  it('returns "expired" when now equals expiry date exactly', () => {
    const warranty = createWarrantyItem({
      expiryDate: '2025-06-01T00:00:00.000Z',
      status: 'active',
    });
    const now = new Date('2025-06-01T00:00:00.000Z');

    const result = evaluateWarrantyStatus(warranty, now);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('expired');
      expect(result.data.remainingDays).toBe(0);
    }
  });

  it('retains "claimed" status regardless of dates', () => {
    const warranty = createWarrantyItem({
      status: 'claimed',
      expiryDate: '2029-01-15T00:00:00.000Z',
    });
    const now = new Date('2025-06-01T00:00:00.000Z');

    const result = evaluateWarrantyStatus(warranty, now);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('claimed');
    }
  });

  it('retains "voided" status regardless of dates', () => {
    const warranty = createWarrantyItem({
      status: 'voided',
      expiryDate: '2029-01-15T00:00:00.000Z',
    });
    const now = new Date('2025-06-01T00:00:00.000Z');

    const result = evaluateWarrantyStatus(warranty, now);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('voided');
    }
  });

  it('returns error when warranty is null', () => {
    const result = evaluateWarrantyStatus(null as unknown as WarrantyItem, new Date());
    expect(result.success).toBe(false);
  });
});

// ─── calculateWarrantyAlerts Tests ────────────────────────────────────────────

describe('calculateWarrantyAlerts', () => {
  it('generates a warning_90 alert when warranty is 60 days from expiry', () => {
    const warranty = createWarrantyItem({
      expiryDate: '2025-08-01T00:00:00.000Z',
    });
    const now = new Date('2025-06-02T00:00:00.000Z'); // ~60 days remaining

    const result = calculateWarrantyAlerts([warranty], now);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBe(1);
      expect(result.data[0].alertType).toBe('warning_90');
      expect(result.data[0].daysRemaining).toBe(60);
    }
  });

  it('generates an urgent_30 alert when warranty is 20 days from expiry', () => {
    const warranty = createWarrantyItem({
      expiryDate: '2025-06-21T00:00:00.000Z',
    });
    const now = new Date('2025-06-01T00:00:00.000Z'); // 20 days remaining

    const result = calculateWarrantyAlerts([warranty], now);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBe(1);
      expect(result.data[0].alertType).toBe('urgent_30');
      expect(result.data[0].daysRemaining).toBe(20);
    }
  });

  it('does not generate alerts for warranties more than 90 days from expiry', () => {
    const warranty = createWarrantyItem({
      expiryDate: '2029-01-15T00:00:00.000Z',
    });
    const now = new Date('2025-06-01T00:00:00.000Z');

    const result = calculateWarrantyAlerts([warranty], now);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBe(0);
    }
  });

  it('does not generate alerts for expired warranties', () => {
    const warranty = createWarrantyItem({
      expiryDate: '2025-01-01T00:00:00.000Z',
      status: 'active',
    });
    const now = new Date('2025-06-01T00:00:00.000Z');

    const result = calculateWarrantyAlerts([warranty], now);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBe(0);
    }
  });

  it('does not generate alerts for claimed warranties', () => {
    const warranty = createWarrantyItem({
      status: 'claimed',
      expiryDate: '2025-06-15T00:00:00.000Z', // Would be within 30 days
    });
    const now = new Date('2025-06-01T00:00:00.000Z');

    const result = calculateWarrantyAlerts([warranty], now);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBe(0);
    }
  });

  it('processes multiple warranties and returns correct alerts', () => {
    const warranties: WarrantyItem[] = [
      createWarrantyItem({
        id: 'wty_1',
        description: 'Roof membrane',
        expiryDate: '2025-06-15T00:00:00.000Z', // 14 days → urgent_30
      }),
      createWarrantyItem({
        id: 'wty_2',
        description: 'HVAC system',
        expiryDate: '2025-07-20T00:00:00.000Z', // 49 days → warning_90
      }),
      createWarrantyItem({
        id: 'wty_3',
        description: 'Structural',
        expiryDate: '2029-01-01T00:00:00.000Z', // Far out → no alert
      }),
    ];
    const now = new Date('2025-06-01T00:00:00.000Z');

    const result = calculateWarrantyAlerts(warranties, now);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBe(2);
      expect(result.data.find((a) => a.warrantyId === 'wty_1')?.alertType).toBe('urgent_30');
      expect(result.data.find((a) => a.warrantyId === 'wty_2')?.alertType).toBe('warning_90');
    }
  });

  it('returns empty array for empty warranties input', () => {
    const result = calculateWarrantyAlerts([], new Date('2025-06-01'));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual([]);
    }
  });
});

// ─── validateWarrantyClaim Tests ──────────────────────────────────────────────

describe('validateWarrantyClaim', () => {
  it('validates successfully for an active warranty with valid claim input', () => {
    const warranty = createWarrantyItem({
      expiryDate: '2029-01-15T00:00:00.000Z',
    });
    const claim = {
      defectDescription: 'Water leak in bathroom ceiling',
      locationInBuilding: 'Level 3, Unit 305',
      photographicEvidence: ['photo1.jpg'],
      urgency: 'urgent' as const,
    };
    const now = new Date('2025-06-01T00:00:00.000Z');

    const result = validateWarrantyClaim(warranty, claim, now);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toBe(true);
      expect(result.data.errors).toBeUndefined();
    }
  });

  it('rejects claim against expired warranty (Requirement 3.8)', () => {
    const warranty = createWarrantyItem({
      expiryDate: '2025-01-01T00:00:00.000Z',
      status: 'active',
    });
    const claim = {
      defectDescription: 'Water leak',
      locationInBuilding: 'Level 2',
      photographicEvidence: [],
      urgency: 'routine' as const,
    };
    const now = new Date('2025-06-01T00:00:00.000Z');

    const result = validateWarrantyClaim(warranty, claim, now);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toBe(false);
      expect(result.data.errors).toBeDefined();
      expect(result.data.errors!.some((e) => e.includes('expired'))).toBe(true);
    }
  });

  it('rejects claim when warranty is already claimed', () => {
    const warranty = createWarrantyItem({
      status: 'claimed',
      expiryDate: '2029-01-15T00:00:00.000Z',
    });
    const claim = {
      defectDescription: 'Another issue',
      locationInBuilding: 'Level 1',
      photographicEvidence: [],
      urgency: 'routine' as const,
    };
    const now = new Date('2025-06-01T00:00:00.000Z');

    const result = validateWarrantyClaim(warranty, claim, now);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toBe(false);
      expect(result.data.errors!.some((e) => e.includes('active claim'))).toBe(true);
    }
  });

  it('rejects claim when warranty is voided', () => {
    const warranty = createWarrantyItem({
      status: 'voided',
      expiryDate: '2029-01-15T00:00:00.000Z',
    });
    const claim = {
      defectDescription: 'Issue found',
      locationInBuilding: 'Level 1',
      photographicEvidence: [],
      urgency: 'routine' as const,
    };
    const now = new Date('2025-06-01T00:00:00.000Z');

    const result = validateWarrantyClaim(warranty, claim, now);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toBe(false);
      expect(result.data.errors!.some((e) => e.includes('voided'))).toBe(true);
    }
  });

  it('reports missing defect description', () => {
    const warranty = createWarrantyItem();
    const claim = {
      defectDescription: '',
      locationInBuilding: 'Level 1',
      photographicEvidence: [],
      urgency: 'routine' as const,
    };
    const now = new Date('2025-06-01T00:00:00.000Z');

    const result = validateWarrantyClaim(warranty, claim, now);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toBe(false);
      expect(result.data.errors!.some((e) => e.includes('description'))).toBe(true);
    }
  });

  it('reports too many photographic evidence references', () => {
    const warranty = createWarrantyItem();
    const claim = {
      defectDescription: 'Valid issue',
      locationInBuilding: 'Level 1',
      photographicEvidence: Array(11).fill('photo.jpg'),
      urgency: 'routine' as const,
    };
    const now = new Date('2025-06-01T00:00:00.000Z');

    const result = validateWarrantyClaim(warranty, claim, now);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toBe(false);
      expect(result.data.errors!.some((e) => e.includes('10'))).toBe(true);
    }
  });
});

// ─── transitionWarrantyClaim Tests ────────────────────────────────────────────

describe('transitionWarrantyClaim', () => {
  it('allows transition from lodged to acknowledged', () => {
    const claim = createWarrantyClaim({ stage: 'lodged' });

    const result = transitionWarrantyClaim(claim, 'acknowledged');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toBe(true);
      expect(result.data.next.stage).toBe('acknowledged');
    }
  });

  it('allows transition from acknowledged to inspection_scheduled', () => {
    const claim = createWarrantyClaim({ stage: 'acknowledged' });

    const result = transitionWarrantyClaim(claim, 'inspection_scheduled');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toBe(true);
      expect(result.data.next.stage).toBe('inspection_scheduled');
    }
  });

  it('allows transition from inspection_scheduled to rectification_in_progress', () => {
    const claim = createWarrantyClaim({ stage: 'inspection_scheduled' });

    const result = transitionWarrantyClaim(claim, 'rectification_in_progress');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toBe(true);
      expect(result.data.next.stage).toBe('rectification_in_progress');
    }
  });

  it('allows transition from rectification_in_progress to rectified', () => {
    const claim = createWarrantyClaim({ stage: 'rectification_in_progress' });

    const result = transitionWarrantyClaim(claim, 'rectified');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toBe(true);
      expect(result.data.next.stage).toBe('rectified');
    }
  });

  it('allows transition from rectified to closed (terminal state)', () => {
    const claim = createWarrantyClaim({ stage: 'rectified' });

    const result = transitionWarrantyClaim(claim, 'closed');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toBe(true);
      expect(result.data.next.stage).toBe('closed');
    }
  });

  it('rejects backward transition (e.g., acknowledged to lodged)', () => {
    const claim = createWarrantyClaim({ stage: 'acknowledged' });

    const result = transitionWarrantyClaim(claim, 'lodged');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toBe(false);
      expect(result.data.error).toContain('forward');
    }
  });

  it('rejects skipping stages (e.g., lodged to inspection_scheduled)', () => {
    const claim = createWarrantyClaim({ stage: 'lodged' });

    const result = transitionWarrantyClaim(claim, 'inspection_scheduled');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toBe(false);
      expect(result.data.error).toContain('acknowledged');
    }
  });

  it('rejects transition from terminal "closed" state', () => {
    const claim = createWarrantyClaim({ stage: 'closed' });

    const result = transitionWarrantyClaim(claim, 'lodged');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toBe(false);
      expect(result.data.error).toContain('terminal');
    }
  });

  it('rejects invalid target stage', () => {
    const claim = createWarrantyClaim({ stage: 'lodged' });

    const result = transitionWarrantyClaim(claim, 'invalid_stage' as any);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toBe(false);
      expect(result.data.error).toContain('Invalid target stage');
    }
  });
});

// ─── validateManualWarrantyCreation Tests ─────────────────────────────────────

describe('validateManualWarrantyCreation', () => {
  it('validates a complete valid input', () => {
    const input = {
      description: 'Geyser warranty',
      category: 'plumbing',
      warrantyPeriodMonths: 24,
      startDate: '2025-01-01T00:00:00.000Z',
      supplierName: 'Kwikot (Pty) Ltd',
    };

    const result = validateManualWarrantyCreation(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toBe(true);
      expect(result.data.errors).toBeUndefined();
    }
  });

  it('reports missing description', () => {
    const input = {
      description: '',
      category: 'plumbing',
      warrantyPeriodMonths: 24,
      startDate: '2025-01-01',
      supplierName: 'Kwikot',
    };

    const result = validateManualWarrantyCreation(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toBe(false);
      expect(result.data.errors!.some((e) => e.includes('description'))).toBe(true);
    }
  });

  it('reports description exceeding 500 characters', () => {
    const input = {
      description: 'x'.repeat(501),
      category: 'plumbing',
      warrantyPeriodMonths: 24,
      startDate: '2025-01-01',
      supplierName: 'Kwikot',
    };

    const result = validateManualWarrantyCreation(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toBe(false);
      expect(result.data.errors!.some((e) => e.includes('500'))).toBe(true);
    }
  });

  it('reports invalid category', () => {
    const input = {
      description: 'Valid description',
      category: 'invalid_category',
      warrantyPeriodMonths: 24,
      startDate: '2025-01-01',
      supplierName: 'Kwikot',
    };

    const result = validateManualWarrantyCreation(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toBe(false);
      expect(result.data.errors!.some((e) => e.includes('Category'))).toBe(true);
    }
  });

  it('reports warranty period below minimum (0)', () => {
    const input = {
      description: 'Valid description',
      category: 'electrical',
      warrantyPeriodMonths: 0,
      startDate: '2025-01-01',
      supplierName: 'ABC Electrical',
    };

    const result = validateManualWarrantyCreation(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toBe(false);
      expect(result.data.errors!.some((e) => e.includes('1 and 240'))).toBe(true);
    }
  });

  it('reports warranty period above maximum (241)', () => {
    const input = {
      description: 'Valid description',
      category: 'structural',
      warrantyPeriodMonths: 241,
      startDate: '2025-01-01',
      supplierName: 'StructureCo',
    };

    const result = validateManualWarrantyCreation(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toBe(false);
      expect(result.data.errors!.some((e) => e.includes('1 and 240'))).toBe(true);
    }
  });

  it('reports missing supplier name', () => {
    const input = {
      description: 'Valid description',
      category: 'electrical',
      warrantyPeriodMonths: 12,
      startDate: '2025-01-01',
      supplierName: '',
    };

    const result = validateManualWarrantyCreation(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toBe(false);
      expect(result.data.errors!.some((e) => e.includes('Supplier'))).toBe(true);
    }
  });

  it('reports invalid start date', () => {
    const input = {
      description: 'Valid description',
      category: 'electrical',
      warrantyPeriodMonths: 12,
      startDate: 'not-a-date',
      supplierName: 'ABC',
    };

    const result = validateManualWarrantyCreation(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toBe(false);
      expect(result.data.errors!.some((e) => e.includes('valid date'))).toBe(true);
    }
  });

  it('reports multiple errors at once', () => {
    const input = {
      description: '',
      category: '',
      warrantyPeriodMonths: 0,
      startDate: '',
      supplierName: '',
    };

    const result = validateManualWarrantyCreation(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valid).toBe(false);
      expect(result.data.errors!.length).toBeGreaterThanOrEqual(4);
    }
  });
});
