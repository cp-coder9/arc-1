import { describe, expect, it } from 'vitest';

import {
  performEMPrHandover,
  createCommissioningItems,
  isEMPrHandoverRequired,
} from '@/services/eia/eiaCommissioningService';
import type { EMPrCommitment } from '@/services/eia/eiaTypes';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeCommitment(
  overrides?: Partial<EMPrCommitment>
): EMPrCommitment {
  return {
    id: 'empr-test-1',
    projectId: 'proj-123',
    reference: 'EMPr-001',
    description: 'Dust control on construction site',
    applicablePhase: 'construction',
    responsibleParty: 'Site Manager',
    monitoringFrequency: 'weekly',
    complianceStatus: 'compliant',
    ...overrides,
  };
}

// ─── performEMPrHandover ─────────────────────────────────────────────────────

describe('performEMPrHandover', () => {
  it('transfers compliant commitments to post-construction context', () => {
    const commitments: EMPrCommitment[] = [
      makeCommitment({ id: 'c1', complianceStatus: 'compliant' }),
      makeCommitment({ id: 'c2', complianceStatus: 'non_compliant' }),
    ];

    const result = performEMPrHandover(commitments);

    expect(result.handoverItems).toHaveLength(2);
    expect(result.handoverItems[0].applicablePhase).toBe('operation');
    expect(result.handoverItems[1].applicablePhase).toBe('operation');
  });

  it('retains title, category, responsible party, and compliance fields', () => {
    const commitments: EMPrCommitment[] = [
      makeCommitment({
        description: 'Noise monitoring during piling',
        responsibleParty: 'EAP Jones',
        complianceStatus: 'compliant',
        monitoringFrequency: 'daily',
      }),
    ];

    const result = performEMPrHandover(commitments);
    const item = result.handoverItems[0];

    expect(item.description).toBe('Noise monitoring during piling');
    expect(item.responsibleParty).toBe('EAP Jones');
    expect(item.complianceStatus).toBe('compliant');
    expect(item.monitoringFrequency).toBe('daily');
  });

  it('excludes not_yet_applicable commitments from handover', () => {
    const commitments: EMPrCommitment[] = [
      makeCommitment({ id: 'c1', complianceStatus: 'compliant' }),
      makeCommitment({ id: 'c2', complianceStatus: 'not_yet_applicable' }),
    ];

    const result = performEMPrHandover(commitments);

    expect(result.handoverItems).toHaveLength(1);
    expect(result.handoverItems[0].complianceStatus).toBe('compliant');
  });

  it('returns empty set with audit event when no items are applicable', () => {
    const commitments: EMPrCommitment[] = [
      makeCommitment({ complianceStatus: 'not_yet_applicable' }),
    ];

    const result = performEMPrHandover(commitments);

    expect(result.handoverItems).toHaveLength(0);
    expect(result.auditEntry.outcome).toBe(
      'zero commitments applicable for post-construction monitoring'
    );
    expect(result.auditEntry.action).toBe('empr_handover');
    expect(result.auditEntry.metadata?.applicableCount).toBe(0);
    expect(result.auditEntry.metadata?.stage).toBe('closeout');
  });

  it('returns empty set with audit event when commitments array is empty', () => {
    const result = performEMPrHandover([]);

    expect(result.handoverItems).toHaveLength(0);
    expect(result.auditEntry.outcome).toBe(
      'zero commitments applicable for post-construction monitoring'
    );
    expect(result.auditEntry.metadata?.totalCommitments).toBe(0);
  });

  it('generates new IDs for handover items', () => {
    const commitments: EMPrCommitment[] = [
      makeCommitment({ id: 'original-id', complianceStatus: 'compliant' }),
    ];

    const result = performEMPrHandover(commitments);

    expect(result.handoverItems[0].id).not.toBe('original-id');
    expect(result.handoverItems[0].id).toContain('empr-handover');
  });

  it('produces audit entry with correct metadata for successful handover', () => {
    const commitments: EMPrCommitment[] = [
      makeCommitment({ id: 'c1', reference: 'REF-A', complianceStatus: 'compliant' }),
      makeCommitment({ id: 'c2', reference: 'REF-B', complianceStatus: 'non_compliant' }),
      makeCommitment({ id: 'c3', complianceStatus: 'not_yet_applicable' }),
    ];

    const result = performEMPrHandover(commitments);

    expect(result.auditEntry.action).toBe('empr_handover');
    expect(result.auditEntry.projectId).toBe('proj-123');
    expect(result.auditEntry.metadata?.totalCommitments).toBe(3);
    expect(result.auditEntry.metadata?.applicableCount).toBe(2);
    expect(result.auditEntry.metadata?.stage).toBe('closeout');
  });
});

// ─── createCommissioningItems ────────────────────────────────────────────────

describe('createCommissioningItems', () => {
  it('creates EMPr commitments from commissioning inputs', () => {
    const items = [
      { title: 'Noise testing at boundary', category: 'noise', verificationMethod: 'sound level meter' },
      { title: 'Air quality verification', category: 'air quality', verificationMethod: 'particulate sampling' },
    ];

    const result = createCommissioningItems(items, 'proj-456');

    expect(result).toHaveLength(2);
    expect(result[0].description).toBe('Noise testing at boundary');
    expect(result[0].projectId).toBe('proj-456');
    expect(result[1].description).toBe('Air quality verification');
  });

  it('links items to operation phase (Close-out context)', () => {
    const items = [
      { title: 'Stormwater activation', category: 'stormwater', verificationMethod: 'flow test' },
    ];

    const result = createCommissioningItems(items);

    expect(result[0].applicablePhase).toBe('operation');
  });

  it('sets initial compliance status to not_yet_applicable', () => {
    const items = [
      { title: 'Noise testing', category: 'noise', verificationMethod: 'meter' },
    ];

    const result = createCommissioningItems(items);

    expect(result[0].complianceStatus).toBe('not_yet_applicable');
  });

  it('generates unique IDs for each item', () => {
    const items = [
      { title: 'Item A', category: 'noise', verificationMethod: 'test A' },
      { title: 'Item B', category: 'air', verificationMethod: 'test B' },
    ];

    const result = createCommissioningItems(items);

    expect(result[0].id).not.toBe(result[1].id);
    expect(result[0].id).toContain('empr-commission');
    expect(result[1].id).toContain('empr-commission');
  });

  it('generates reference from category', () => {
    const items = [
      { title: 'Air test', category: 'air quality', verificationMethod: 'sampling' },
    ];

    const result = createCommissioningItems(items);

    expect(result[0].reference).toBe('COMMISSION-AIR-QUALITY');
  });

  it('sets monitoring frequency to event-triggered', () => {
    const items = [
      { title: 'Noise test', category: 'noise', verificationMethod: 'meter' },
    ];

    const result = createCommissioningItems(items);

    expect(result[0].monitoringFrequency).toBe('event-triggered');
  });

  it('returns empty array for empty input', () => {
    const result = createCommissioningItems([]);
    expect(result).toHaveLength(0);
  });
});

// ─── isEMPrHandoverRequired ─────────────────────────────────────────────────

describe('isEMPrHandoverRequired', () => {
  it('returns true when compliant commitments exist', () => {
    const commitments: EMPrCommitment[] = [
      makeCommitment({ complianceStatus: 'compliant' }),
    ];

    expect(isEMPrHandoverRequired(commitments)).toBe(true);
  });

  it('returns true when non_compliant commitments exist', () => {
    const commitments: EMPrCommitment[] = [
      makeCommitment({ complianceStatus: 'non_compliant' }),
    ];

    expect(isEMPrHandoverRequired(commitments)).toBe(true);
  });

  it('returns false when all commitments are not_yet_applicable', () => {
    const commitments: EMPrCommitment[] = [
      makeCommitment({ complianceStatus: 'not_yet_applicable' }),
      makeCommitment({ complianceStatus: 'not_yet_applicable' }),
    ];

    expect(isEMPrHandoverRequired(commitments)).toBe(false);
  });

  it('returns false for empty array', () => {
    expect(isEMPrHandoverRequired([])).toBe(false);
  });

  it('returns true when mixed statuses include at least one active', () => {
    const commitments: EMPrCommitment[] = [
      makeCommitment({ complianceStatus: 'not_yet_applicable' }),
      makeCommitment({ complianceStatus: 'compliant' }),
    ];

    expect(isEMPrHandoverRequired(commitments)).toBe(true);
  });
});
