/**
 * Unit tests for EMPr Service
 * Tests: CRUD, compliance calculation, reminder logic, non-compliant flagging
 * Requirements: 8.1–8.7
 */

import { describe, it, expect } from 'vitest';
import {
  createCommitment,
  updateCommitmentStatus,
  calculateCompliancePercentage,
  calculateNextDueDate,
  isReminderDue,
  findNonCompliantItems,
  createAudit,
  isEventTriggeredReminderDue,
} from '../../services/eia/emprService';
import type { EMPrCommitment } from '../../services/eia/eiaTypes';

// ─── Helper Factories ────────────────────────────────────────────────────────

function makeCommitment(overrides: Partial<EMPrCommitment> = {}): EMPrCommitment {
  return {
    id: 'test-id',
    projectId: 'proj-1',
    reference: 'EMPr-001',
    description: 'Dust suppression on access road',
    applicablePhase: 'construction',
    responsibleParty: 'Site Manager',
    monitoringFrequency: 'weekly',
    complianceStatus: 'compliant',
    ...overrides,
  };
}

// ─── createCommitment ────────────────────────────────────────────────────────

describe('createCommitment', () => {
  it('should generate a unique ID', () => {
    const result = createCommitment({
      projectId: 'proj-1',
      reference: 'EMPr-001',
      description: 'Dust control',
      applicablePhase: 'construction',
      responsibleParty: 'Site Manager',
      monitoringFrequency: 'daily',
      complianceStatus: 'compliant',
    });

    expect(result.id).toBeDefined();
    expect(result.id).toMatch(/^empr-commit-/);
  });

  it('should preserve all provided fields', () => {
    const data = {
      projectId: 'proj-2',
      reference: 'EMPr-010',
      description: 'Noise monitoring at boundary',
      applicablePhase: 'operation' as const,
      responsibleParty: 'EAP',
      monitoringFrequency: 'monthly' as const,
      complianceStatus: 'not_yet_applicable' as const,
    };

    const result = createCommitment(data);

    expect(result.projectId).toBe('proj-2');
    expect(result.reference).toBe('EMPr-010');
    expect(result.description).toBe('Noise monitoring at boundary');
    expect(result.applicablePhase).toBe('operation');
    expect(result.responsibleParty).toBe('EAP');
    expect(result.monitoringFrequency).toBe('monthly');
    expect(result.complianceStatus).toBe('not_yet_applicable');
  });

  it('should calculate nextDueDate when lastMonitoredDate is provided with time-based frequency', () => {
    const result = createCommitment({
      projectId: 'proj-1',
      reference: 'EMPr-002',
      description: 'Water quality check',
      applicablePhase: 'construction',
      responsibleParty: 'Env Officer',
      monitoringFrequency: 'weekly',
      complianceStatus: 'compliant',
      lastMonitoredDate: '2025-01-01T00:00:00.000Z',
    });

    expect(result.nextDueDate).toBe('2025-01-08T00:00:00.000Z');
  });

  it('should NOT calculate nextDueDate for event-triggered frequency', () => {
    const result = createCommitment({
      projectId: 'proj-1',
      reference: 'EMPr-003',
      description: 'Spill response',
      applicablePhase: 'construction',
      responsibleParty: 'Site Manager',
      monitoringFrequency: 'event-triggered',
      complianceStatus: 'compliant',
      lastMonitoredDate: '2025-01-01T00:00:00.000Z',
    });

    // event-triggered returns the lastMonitoredDate itself, but the service skips calculation
    expect(result.nextDueDate).toBeUndefined();
  });
});

// ─── updateCommitmentStatus ──────────────────────────────────────────────────

describe('updateCommitmentStatus', () => {
  it('should return a new object with updated status', () => {
    const original = makeCommitment({ complianceStatus: 'compliant' });
    const updated = updateCommitmentStatus(original, 'non_compliant');

    expect(updated.complianceStatus).toBe('non_compliant');
    expect(original.complianceStatus).toBe('compliant'); // original unchanged
  });

  it('should preserve all other fields', () => {
    const original = makeCommitment({ reference: 'EMPr-050', description: 'Test' });
    const updated = updateCommitmentStatus(original, 'not_yet_applicable');

    expect(updated.reference).toBe('EMPr-050');
    expect(updated.description).toBe('Test');
    expect(updated.id).toBe(original.id);
  });
});

// ─── calculateCompliancePercentage ───────────────────────────────────────────

describe('calculateCompliancePercentage', () => {
  it('should return 0% when no items are applicable (all not_yet_applicable)', () => {
    const commitments = [
      makeCommitment({ complianceStatus: 'not_yet_applicable' }),
      makeCommitment({ complianceStatus: 'not_yet_applicable' }),
    ];

    const result = calculateCompliancePercentage(commitments);

    expect(result.compliancePercentage).toBe(0);
    expect(result.totalApplicable).toBe(0);
    expect(result.compliantCount).toBe(0);
    expect(result.nonCompliantCount).toBe(0);
  });

  it('should return 0% when empty array provided', () => {
    const result = calculateCompliancePercentage([]);

    expect(result.compliancePercentage).toBe(0);
    expect(result.totalApplicable).toBe(0);
  });

  it('should calculate correct percentage with mixed statuses', () => {
    const commitments = [
      makeCommitment({ complianceStatus: 'compliant' }),
      makeCommitment({ complianceStatus: 'compliant' }),
      makeCommitment({ complianceStatus: 'non_compliant' }),
      makeCommitment({ complianceStatus: 'not_yet_applicable' }),
    ];

    const result = calculateCompliancePercentage(commitments);

    // 2 compliant / 3 applicable = 66.67% → rounds to 67%
    expect(result.compliancePercentage).toBe(67);
    expect(result.totalApplicable).toBe(3);
    expect(result.compliantCount).toBe(2);
    expect(result.nonCompliantCount).toBe(1);
  });

  it('should return 100% when all applicable items are compliant', () => {
    const commitments = [
      makeCommitment({ complianceStatus: 'compliant' }),
      makeCommitment({ complianceStatus: 'compliant' }),
      makeCommitment({ complianceStatus: 'not_yet_applicable' }),
    ];

    const result = calculateCompliancePercentage(commitments);

    expect(result.compliancePercentage).toBe(100);
    expect(result.totalApplicable).toBe(2);
    expect(result.compliantCount).toBe(2);
    expect(result.nonCompliantCount).toBe(0);
  });

  it('should return 0% when all applicable items are non-compliant', () => {
    const commitments = [
      makeCommitment({ complianceStatus: 'non_compliant' }),
      makeCommitment({ complianceStatus: 'non_compliant' }),
    ];

    const result = calculateCompliancePercentage(commitments);

    expect(result.compliancePercentage).toBe(0);
    expect(result.totalApplicable).toBe(2);
    expect(result.compliantCount).toBe(0);
    expect(result.nonCompliantCount).toBe(2);
  });
});

// ─── calculateNextDueDate ────────────────────────────────────────────────────

describe('calculateNextDueDate', () => {
  it('should add 1 day for daily frequency', () => {
    const result = calculateNextDueDate('2025-03-15T10:00:00.000Z', 'daily');
    expect(result).toBe('2025-03-16T10:00:00.000Z');
  });

  it('should add 7 days for weekly frequency', () => {
    const result = calculateNextDueDate('2025-03-15T10:00:00.000Z', 'weekly');
    expect(result).toBe('2025-03-22T10:00:00.000Z');
  });

  it('should add 1 month for monthly frequency (handles overflow)', () => {
    const result = calculateNextDueDate('2025-01-31T10:00:00.000Z', 'monthly');
    // JavaScript Date.setMonth overflows: Jan 31 + 1 month → March 3 (Feb doesn't have 31 days)
    const nextDate = new Date(result);
    // Month is 2 (March, 0-indexed) due to JS Date overflow behavior
    expect(nextDate.getMonth()).toBe(2);
    expect(nextDate.getDate()).toBe(3);
  });

  it('should return the same date for event-triggered frequency', () => {
    const result = calculateNextDueDate('2025-03-15T10:00:00.000Z', 'event-triggered');
    expect(result).toBe('2025-03-15T10:00:00.000Z');
  });

  it('should handle month boundary correctly for monthly', () => {
    const result = calculateNextDueDate('2025-03-15T00:00:00.000Z', 'monthly');
    expect(result).toBe('2025-04-15T00:00:00.000Z');
  });
});

// ─── isReminderDue ───────────────────────────────────────────────────────────

describe('isReminderDue', () => {
  it('should return true when within 24h before due date', () => {
    const commitment = makeCommitment({
      nextDueDate: '2025-06-15T12:00:00.000Z',
      monitoringFrequency: 'weekly',
    });

    // 12 hours before due
    const now = new Date('2025-06-15T00:00:00.000Z');
    expect(isReminderDue(commitment, now)).toBe(true);
  });

  it('should return true when exactly at due date', () => {
    const commitment = makeCommitment({
      nextDueDate: '2025-06-15T12:00:00.000Z',
      monitoringFrequency: 'daily',
    });

    const now = new Date('2025-06-15T12:00:00.000Z');
    expect(isReminderDue(commitment, now)).toBe(true);
  });

  it('should return false when more than 24h before due', () => {
    const commitment = makeCommitment({
      nextDueDate: '2025-06-15T12:00:00.000Z',
      monitoringFrequency: 'weekly',
    });

    // 48 hours before
    const now = new Date('2025-06-13T12:00:00.000Z');
    expect(isReminderDue(commitment, now)).toBe(false);
  });

  it('should return false when no nextDueDate', () => {
    const commitment = makeCommitment({ nextDueDate: undefined });
    expect(isReminderDue(commitment)).toBe(false);
  });

  it('should return false for event-triggered frequency', () => {
    const commitment = makeCommitment({
      monitoringFrequency: 'event-triggered',
      nextDueDate: '2025-06-15T12:00:00.000Z',
    });

    const now = new Date('2025-06-15T00:00:00.000Z');
    expect(isReminderDue(commitment, now)).toBe(false);
  });

  it('should return true when slightly past due (within 24h window)', () => {
    const commitment = makeCommitment({
      nextDueDate: '2025-06-15T12:00:00.000Z',
      monitoringFrequency: 'monthly',
    });

    // 6 hours past due
    const now = new Date('2025-06-15T18:00:00.000Z');
    expect(isReminderDue(commitment, now)).toBe(true);
  });
});

// ─── isEventTriggeredReminderDue ─────────────────────────────────────────────

describe('isEventTriggeredReminderDue', () => {
  it('should return true immediately after trigger', () => {
    const triggerDate = '2025-06-15T10:00:00.000Z';
    const now = new Date('2025-06-15T10:00:00.000Z');
    expect(isEventTriggeredReminderDue(triggerDate, now)).toBe(true);
  });

  it('should return true within 48h window', () => {
    const triggerDate = '2025-06-15T10:00:00.000Z';
    // 24 hours after trigger
    const now = new Date('2025-06-16T10:00:00.000Z');
    expect(isEventTriggeredReminderDue(triggerDate, now)).toBe(true);
  });

  it('should return true at exactly 48h boundary', () => {
    const triggerDate = '2025-06-15T10:00:00.000Z';
    const now = new Date('2025-06-17T10:00:00.000Z');
    expect(isEventTriggeredReminderDue(triggerDate, now)).toBe(true);
  });

  it('should return false after 48h window has passed', () => {
    const triggerDate = '2025-06-15T10:00:00.000Z';
    // 49 hours after trigger
    const now = new Date('2025-06-17T11:00:00.000Z');
    expect(isEventTriggeredReminderDue(triggerDate, now)).toBe(false);
  });

  it('should return false before trigger event', () => {
    const triggerDate = '2025-06-15T10:00:00.000Z';
    const now = new Date('2025-06-14T10:00:00.000Z');
    expect(isEventTriggeredReminderDue(triggerDate, now)).toBe(false);
  });
});

// ─── findNonCompliantItems ───────────────────────────────────────────────────

describe('findNonCompliantItems', () => {
  it('should return only non-compliant items', () => {
    const commitments = [
      makeCommitment({ id: '1', complianceStatus: 'compliant' }),
      makeCommitment({ id: '2', complianceStatus: 'non_compliant' }),
      makeCommitment({ id: '3', complianceStatus: 'not_yet_applicable' }),
      makeCommitment({ id: '4', complianceStatus: 'non_compliant' }),
    ];

    const result = findNonCompliantItems(commitments);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('2');
    expect(result[1].id).toBe('4');
  });

  it('should return empty array when no non-compliant items', () => {
    const commitments = [
      makeCommitment({ complianceStatus: 'compliant' }),
      makeCommitment({ complianceStatus: 'not_yet_applicable' }),
    ];

    const result = findNonCompliantItems(commitments);
    expect(result).toHaveLength(0);
  });

  it('should return empty array for empty input', () => {
    expect(findNonCompliantItems([])).toHaveLength(0);
  });
});

// ─── createAudit ─────────────────────────────────────────────────────────────

describe('createAudit', () => {
  it('should generate a unique ID', () => {
    const result = createAudit({
      projectId: 'proj-1',
      auditDate: '2025-06-01',
      auditorName: 'John Smith',
      findingsSummary: 'All commitments are being met. Minor note on dust suppression timing.',
      overallStatus: 'compliant',
    });

    expect(result.id).toBeDefined();
    expect(result.id).toMatch(/^empr-audit-/);
  });

  it('should preserve all provided fields', () => {
    const data = {
      projectId: 'proj-3',
      auditDate: '2025-07-15',
      auditorName: 'Jane Doe',
      findingsSummary: 'Non-compliance found in stormwater management.',
      overallStatus: 'non_compliant' as const,
    };

    const result = createAudit(data);

    expect(result.projectId).toBe('proj-3');
    expect(result.auditDate).toBe('2025-07-15');
    expect(result.auditorName).toBe('Jane Doe');
    expect(result.findingsSummary).toBe('Non-compliance found in stormwater management.');
    expect(result.overallStatus).toBe('non_compliant');
  });
});
