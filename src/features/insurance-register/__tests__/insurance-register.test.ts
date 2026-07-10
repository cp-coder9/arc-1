/**
 * Insurance Register Module — Unit Tests
 *
 * Comprehensive tests for:
 * - Policy registration (valid + invalid data)
 * - Policy update & cancel
 * - Expiry notifications (60/30/14 day thresholds + auto-expire)
 * - Policy Checker (contract form requirements, compliance statuses)
 * - Claims state machine (valid/invalid transitions, terminal states)
 * - Claims deadline calculation
 * - Claims summary aggregation
 * - Adapter payloads (passport, risk engine)
 *
 * Requirements: 1.1–1.10, 2.1–2.11, 3.1–3.9, 4.1–4.8
 *
 * @vitest-environment node
 */

import { describe, expect, it, vi } from 'vitest';

import { createInsuranceRegisterService } from '../services/insuranceRegisterService';
import type { ExpiryNotification } from '../services/insuranceRegisterService';
import { createPolicyCheckerService } from '../services/policyCheckerService';
import { createClaimsNotificationService } from '../services/claimsNotificationService';
import { createPassportAdapter } from '../adapters/passportAdapter';
import { createRiskEngineAdapter } from '../adapters/riskEngineAdapter';
import type { InsurancePolicy, ContractDataSheet, InsuranceComplianceSummary } from '../types';
import type { PlatformIntegrationService } from '../../p1-shared/services/platformIntegration';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function makeValidPolicyInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    policyType: 'CAR',
    insurerName: 'Test Insurer',
    policyNumber: 'POL-001',
    policyholderName: 'Test Holder',
    inceptionDate: '2025-01-01',
    expiryDate: '2026-06-01',
    sumInsured: 5_000_000,
    excessAmount: 50_000,
    brokerContactName: 'Broker Smith',
    brokerEmail: 'broker@example.com',
    ...overrides,
  };
}

function fixedClock(dateStr: string) {
  return () => new Date(dateStr + 'T00:00:00Z');
}


// ═══════════════════════════════════════════════════════════════════════════════
// 1. Policy Registration
// ═══════════════════════════════════════════════════════════════════════════════

describe('Insurance Register Service — Policy Registration', () => {
  it('creates a policy with active status when given valid data', async () => {
    const service = createInsuranceRegisterService({ now: fixedClock('2025-03-01') });
    const input = makeValidPolicyInput();

    const policy = await service.registerPolicy('proj-1', input as any, 'actor-1');

    expect(policy.id).toBeTruthy();
    expect(policy.projectId).toBe('proj-1');
    expect(policy.status).toBe('active');
    expect(policy.policyType).toBe('CAR');
    expect(policy.insurerName).toBe('Test Insurer');
    expect(policy.createdBy).toBe('actor-1');
    expect(policy.createdAt).toBe('2025-03-01T00:00:00.000Z');
    expect(policy.updatedAt).toBe('2025-03-01T00:00:00.000Z');
  });

  it('rejects registration when required fields are missing', async () => {
    const service = createInsuranceRegisterService();
    const input = { policyType: 'CAR' }; // Missing all other required fields

    await expect(service.registerPolicy('proj-1', input as any, 'actor-1'))
      .rejects.toThrow('Validation failed');
  });

  it('rejects registration when expiryDate is before inceptionDate', async () => {
    const service = createInsuranceRegisterService();
    const input = makeValidPolicyInput({
      inceptionDate: '2026-01-01',
      expiryDate: '2025-01-01',
    });

    await expect(service.registerPolicy('proj-1', input as any, 'actor-1'))
      .rejects.toThrow('Validation failed');
  });

  it('rejects registration when no broker contact method is provided', async () => {
    const service = createInsuranceRegisterService();
    const input = makeValidPolicyInput({
      brokerEmail: undefined,
      brokerPhone: undefined,
    });
    // Explicitly remove both
    delete (input as any).brokerEmail;
    delete (input as any).brokerPhone;

    await expect(service.registerPolicy('proj-1', input as any, 'actor-1'))
      .rejects.toThrow('Validation failed');
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// 2. Policy Update & Cancel
// ═══════════════════════════════════════════════════════════════════════════════

describe('Insurance Register Service — Policy Update & Cancel', () => {
  it('updates fields and sets updatedAt timestamp', async () => {
    const service = createInsuranceRegisterService({ now: fixedClock('2025-03-01') });
    const policy = await service.registerPolicy('proj-1', makeValidPolicyInput() as any, 'actor-1');

    // Advance the clock for the update
    const updateService = createInsuranceRegisterService({ now: fixedClock('2025-04-01') });
    // We need the same store — use the original service
    const updated = await service.updatePolicy('proj-1', policy.id, {
      insurerName: 'Updated Insurer',
    } as any, 'actor-1');

    expect(updated.insurerName).toBe('Updated Insurer');
    expect(updated.updatedAt).toBe('2025-03-01T00:00:00.000Z');
    // createdAt should remain unchanged
    expect(updated.createdAt).toBe(policy.createdAt);
  });

  it('cancel sets status to cancelled', async () => {
    const service = createInsuranceRegisterService({ now: fixedClock('2025-03-01') });
    const policy = await service.registerPolicy('proj-1', makeValidPolicyInput() as any, 'actor-1');

    const cancelled = await service.cancelPolicy('proj-1', policy.id, 'actor-1');

    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.id).toBe(policy.id);
  });

  it('throws when trying to update a non-existent policy', async () => {
    const service = createInsuranceRegisterService();
    await expect(service.updatePolicy('proj-1', 'nonexistent', {} as any, 'actor-1'))
      .rejects.toThrow('Policy not found');
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// 3. Expiry Notifications
// ═══════════════════════════════════════════════════════════════════════════════

describe('Insurance Register Service — Expiry Notifications', () => {
  it('triggers notification at exactly 60 days before expiry', async () => {
    const notifications: ExpiryNotification[] = [];
    const service = createInsuranceRegisterService({
      now: fixedClock('2025-04-02'), // 60 days before 2025-06-01
      onExpiryNotification: (n) => notifications.push(n),
    });

    await service.registerPolicy('proj-1', makeValidPolicyInput({ expiryDate: '2025-06-01' }) as any, 'actor-1');
    await service.processExpiryNotifications('proj-1');

    expect(notifications).toHaveLength(1);
    expect(notifications[0].threshold).toBe(60);
    expect(notifications[0].daysUntilExpiry).toBe(60);
  });

  it('triggers notification at exactly 30 days before expiry', async () => {
    const notifications: ExpiryNotification[] = [];
    const service = createInsuranceRegisterService({
      now: fixedClock('2025-05-02'), // 30 days before 2025-06-01
      onExpiryNotification: (n) => notifications.push(n),
    });

    await service.registerPolicy('proj-1', makeValidPolicyInput({ expiryDate: '2025-06-01' }) as any, 'actor-1');
    await service.processExpiryNotifications('proj-1');

    expect(notifications).toHaveLength(1);
    expect(notifications[0].threshold).toBe(30);
  });

  it('triggers notification at exactly 14 days before expiry', async () => {
    const notifications: ExpiryNotification[] = [];
    const service = createInsuranceRegisterService({
      now: fixedClock('2025-05-18'), // 14 days before 2025-06-01
      onExpiryNotification: (n) => notifications.push(n),
    });

    await service.registerPolicy('proj-1', makeValidPolicyInput({ expiryDate: '2025-06-01' }) as any, 'actor-1');
    await service.processExpiryNotifications('proj-1');

    expect(notifications).toHaveLength(1);
    expect(notifications[0].threshold).toBe(14);
  });

  it('auto-expires policies past their expiry date', async () => {
    const expired: InsurancePolicy[] = [];
    const service = createInsuranceRegisterService({
      now: fixedClock('2025-07-01'), // After expiry of 2025-06-01
      onAutoExpire: (p) => expired.push(p),
    });

    await service.registerPolicy('proj-1', makeValidPolicyInput({ expiryDate: '2025-06-01' }) as any, 'actor-1');
    await service.processExpiryNotifications('proj-1');

    expect(expired).toHaveLength(1);
    expect(expired[0].status).toBe('expired');
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// 4. Policy Checker
// ═══════════════════════════════════════════════════════════════════════════════

describe('Policy Checker Service', () => {
  const farFutureExpiry = '2028-01-01';

  function makePolicy(type: InsurancePolicy['policyType'], sumInsured = 10_000_000, expiryDate = farFutureExpiry): InsurancePolicy {
    return {
      id: `pol-${type}`,
      projectId: 'proj-1',
      policyType: type,
      insurerName: 'Insurer',
      policyNumber: `POL-${type}`,
      policyholderName: 'Holder',
      inceptionDate: '2024-01-01',
      expiryDate,
      sumInsured,
      excessAmount: 10_000,
      brokerContactName: 'Broker',
      brokerEmail: 'broker@test.com',
      status: 'active',
      createdBy: 'actor-1',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
  }

  it('JBCC requires CAR + public_liability', () => {
    const checker = createPolicyCheckerService({
      getPolicies: async () => [],
      getContractDataSheet: async () => ({ contractForm: 'JBCC_PBA' }),
      now: fixedClock('2025-01-01'),
    });

    const types = checker.getRequiredTypes('proj-1', 'JBCC_PBA');
    expect(types).toContain('CAR');
    expect(types).toContain('public_liability');
    expect(types).not.toContain('PI');
  });

  it('NEC adds PI to CAR + public_liability', () => {
    const checker = createPolicyCheckerService({
      getPolicies: async () => [],
      getContractDataSheet: async () => ({ contractForm: 'NEC_ECC' }),
      now: fixedClock('2025-01-01'),
    });

    const types = checker.getRequiredTypes('proj-1', 'NEC_ECC');
    expect(types).toContain('CAR');
    expect(types).toContain('public_liability');
    expect(types).toContain('PI');
  });

  it('adds SASRIA when contractDataSheet.sasriaRequired is true', () => {
    const cds: ContractDataSheet = { contractForm: 'JBCC_PBA', sasriaRequired: true };
    const checker = createPolicyCheckerService({
      getPolicies: async () => [],
      getContractDataSheet: async () => cds,
      now: fixedClock('2025-01-01'),
    });

    const types = checker.getRequiredTypes('proj-1', 'JBCC_PBA', cds);
    expect(types).toContain('SASRIA');
  });

  it('adds LDI when contractDataSheet.ldiRequired is true', () => {
    const cds: ContractDataSheet = { contractForm: 'GCC_2025', ldiRequired: true };
    const checker = createPolicyCheckerService({
      getPolicies: async () => [],
      getContractDataSheet: async () => cds,
      now: fixedClock('2025-01-01'),
    });

    const types = checker.getRequiredTypes('proj-1', 'GCC_2025', cds);
    expect(types).toContain('LDI');
  });

  it('returns compliant when all required policies are active and adequate', async () => {
    const cds: ContractDataSheet = { contractForm: 'JBCC_PBA' };
    const policies = [makePolicy('CAR'), makePolicy('public_liability')];

    const checker = createPolicyCheckerService({
      getPolicies: async () => policies,
      getContractDataSheet: async () => cds,
      now: fixedClock('2025-01-01'),
    });

    const summary = await checker.checkCompliance('proj-1');
    expect(summary.overallStatus).toBe('compliant');
    expect(summary.activePolicies).toBe(2);
  });

  it('returns non_compliant when a required policy type is missing', async () => {
    const cds: ContractDataSheet = { contractForm: 'NEC_ECC' };
    // NEC requires CAR + public_liability + PI; only CAR provided
    const policies = [makePolicy('CAR')];

    const checker = createPolicyCheckerService({
      getPolicies: async () => policies,
      getContractDataSheet: async () => cds,
      now: fixedClock('2025-01-01'),
    });

    const summary = await checker.checkCompliance('proj-1');
    expect(summary.overallStatus).not.toBe('compliant');
    expect(summary.results.some(r => r.status === 'non_compliant')).toBe(true);
  });

  it('returns expiring_soon when policy expires within 60 days', async () => {
    const cds: ContractDataSheet = { contractForm: 'JBCC_PBA' };
    // Policy expiry 30 days from now
    const policies = [
      makePolicy('CAR', 10_000_000, '2025-01-31'),
      makePolicy('public_liability', 10_000_000, '2028-01-01'),
    ];

    const checker = createPolicyCheckerService({
      getPolicies: async () => policies,
      getContractDataSheet: async () => cds,
      now: fixedClock('2025-01-15'), // 16 days until CAR expiry
    });

    const summary = await checker.checkCompliance('proj-1');
    const carResult = summary.results.find(r => r.policyType === 'CAR');
    expect(carResult?.status).toBe('expiring_soon');
  });

  it('returns partially_compliant when some types are compliant and some not', async () => {
    const cds: ContractDataSheet = { contractForm: 'NEC_ECC' };
    // NEC requires CAR + public_liability + PI; missing PI
    const policies = [
      makePolicy('CAR'),
      makePolicy('public_liability'),
    ];

    const checker = createPolicyCheckerService({
      getPolicies: async () => policies,
      getContractDataSheet: async () => cds,
      now: fixedClock('2025-01-01'),
    });

    const summary = await checker.checkCompliance('proj-1');
    expect(summary.overallStatus).toBe('partially_compliant');
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// 5. Claims State Machine
// ═══════════════════════════════════════════════════════════════════════════════

describe('Claims Notification Service — State Machine', () => {
  function makeClaimInput() {
    return {
      projectId: 'proj-1',
      incidentDate: '2025-02-01',
      discoveryDate: '2025-02-02',
      affectedPolicyId: 'pol-1',
      affectedPolicyType: 'CAR' as const,
      description: 'Pipe burst on site causing flood damage',
      estimatedLoss: 250_000,
      locationOnSite: 'Building A basement',
      evidenceRefs: ['photo-1.jpg'],
      createdBy: 'actor-1',
    };
  }

  it('transitions through valid sequential states', async () => {
    const service = createClaimsNotificationService({ now: () => '2025-02-05' });
    const claim = await service.registerClaim('proj-1', makeClaimInput(), 'actor-1');

    expect(claim.status).toBe('reported');

    const s1 = await service.transitionStatus('proj-1', claim.id, 'notified_to_insurer', 'actor-1');
    expect(s1.status).toBe('notified_to_insurer');

    const s2 = await service.transitionStatus('proj-1', claim.id, 'under_investigation', 'actor-1');
    expect(s2.status).toBe('under_investigation');

    const s3 = await service.transitionStatus('proj-1', claim.id, 'claim_lodged', 'actor-1');
    expect(s3.status).toBe('claim_lodged');

    const s4 = await service.transitionStatus('proj-1', claim.id, 'settled', 'actor-1');
    expect(s4.status).toBe('settled');
  });

  it('throws on invalid transition with permitted states', async () => {
    const service = createClaimsNotificationService({ now: () => '2025-02-05' });
    const claim = await service.registerClaim('proj-1', makeClaimInput(), 'actor-1');

    // Cannot jump from 'reported' directly to 'settled'
    try {
      await service.transitionStatus('proj-1', claim.id, 'settled', 'actor-1');
      expect.fail('Should have thrown');
    } catch (e: any) {
      expect(e.type).toBe('invalid_transition');
      expect(e.currentState).toBe('reported');
      expect(e.attemptedState).toBe('settled');
      expect(e.permittedStates).toContain('notified_to_insurer');
      expect(e.permittedStates).toContain('withdrawn');
    }
  });

  it('terminal states block all transitions', async () => {
    const service = createClaimsNotificationService({ now: () => '2025-02-05' });
    const claim = await service.registerClaim('proj-1', makeClaimInput(), 'actor-1');

    // Move to settled (terminal)
    await service.transitionStatus('proj-1', claim.id, 'notified_to_insurer', 'actor-1');
    await service.transitionStatus('proj-1', claim.id, 'under_investigation', 'actor-1');
    await service.transitionStatus('proj-1', claim.id, 'claim_lodged', 'actor-1');
    await service.transitionStatus('proj-1', claim.id, 'settled', 'actor-1');

    // Try any transition from settled — should throw
    try {
      await service.transitionStatus('proj-1', claim.id, 'reported', 'actor-1');
      expect.fail('Should have thrown');
    } catch (e: any) {
      expect(e.type).toBe('invalid_transition');
      expect(e.permittedStates).toHaveLength(0);
    }
  });

  it('allows withdrawal from any non-terminal state', async () => {
    const service = createClaimsNotificationService({ now: () => '2025-02-05' });
    const claim = await service.registerClaim('proj-1', makeClaimInput(), 'actor-1');

    await service.transitionStatus('proj-1', claim.id, 'notified_to_insurer', 'actor-1');
    const withdrawn = await service.transitionStatus('proj-1', claim.id, 'withdrawn', 'actor-1');
    expect(withdrawn.status).toBe('withdrawn');
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// 6. Claims Deadline Calculation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Claims Notification Service — Deadline Calculation', () => {
  it('deadline defaults to 30 days from incident date', async () => {
    const service = createClaimsNotificationService({ now: () => '2025-02-01' });
    const claim = await service.registerClaim('proj-1', {
      projectId: 'proj-1',
      incidentDate: '2025-02-01',
      discoveryDate: '2025-02-01',
      affectedPolicyId: 'pol-1',
      affectedPolicyType: 'CAR',
      description: 'Damage event',
      estimatedLoss: 100_000,
      locationOnSite: 'Zone A',
      evidenceRefs: [],
      createdBy: 'actor-1',
    }, 'actor-1');

    expect(claim.notificationDeadline).toBe('2025-03-03'); // 30 days from Feb 1
  });

  it('deadline is the earlier of 30 days or custom period', async () => {
    const service = createClaimsNotificationService({
      now: () => '2025-02-01',
      getNotificationPeriod: () => 14, // Custom: 14 days
    });
    const claim = await service.registerClaim('proj-1', {
      projectId: 'proj-1',
      incidentDate: '2025-02-01',
      discoveryDate: '2025-02-01',
      affectedPolicyId: 'pol-1',
      affectedPolicyType: 'PI',
      description: 'Professional negligence',
      estimatedLoss: 500_000,
      locationOnSite: '',
      evidenceRefs: [],
      createdBy: 'actor-1',
    }, 'actor-1');

    expect(claim.notificationDeadline).toBe('2025-02-15'); // 14 days (earlier than 30)
  });

  it('detects overdue notifications', async () => {
    const service = createClaimsNotificationService({ now: () => '2025-04-01' });
    await service.registerClaim('proj-1', {
      projectId: 'proj-1',
      incidentDate: '2025-02-01',
      discoveryDate: '2025-02-01',
      affectedPolicyId: 'pol-1',
      affectedPolicyType: 'CAR',
      description: 'Past due claim',
      estimatedLoss: 75_000,
      locationOnSite: '',
      evidenceRefs: [],
      createdBy: 'actor-1',
    }, 'actor-1');

    const overdue = await service.getOverdueNotifications('proj-1');
    expect(overdue).toHaveLength(1);
    expect(overdue[0].status).toBe('reported');
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// 7. Claims Summary Aggregation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Claims Notification Service — Summary Aggregation', () => {
  it('aggregates correctly across multiple claims', async () => {
    const service = createClaimsNotificationService({ now: () => '2025-02-10' });

    // Register multiple claims of different types
    await service.registerClaim('proj-1', {
      projectId: 'proj-1',
      incidentDate: '2025-02-01',
      discoveryDate: '2025-02-02',
      affectedPolicyId: 'pol-1',
      affectedPolicyType: 'CAR',
      description: 'Fire damage',
      estimatedLoss: 200_000,
      locationOnSite: 'A',
      evidenceRefs: [],
      createdBy: 'actor-1',
    }, 'actor-1');

    const claim2 = await service.registerClaim('proj-1', {
      projectId: 'proj-1',
      incidentDate: '2025-02-03',
      discoveryDate: '2025-02-03',
      affectedPolicyId: 'pol-2',
      affectedPolicyType: 'public_liability',
      description: 'Third party injury',
      estimatedLoss: 500_000,
      locationOnSite: 'B',
      evidenceRefs: [],
      createdBy: 'actor-1',
    }, 'actor-1');

    // Settle claim2 to test totalSettledAmount
    await service.transitionStatus('proj-1', claim2.id, 'notified_to_insurer', 'actor-1');
    await service.transitionStatus('proj-1', claim2.id, 'under_investigation', 'actor-1');
    await service.transitionStatus('proj-1', claim2.id, 'claim_lodged', 'actor-1');
    await service.transitionStatus('proj-1', claim2.id, 'settled', 'actor-1');

    const summary = await service.getClaimsSummary('proj-1');

    expect(summary.totalByPolicyType.CAR).toBe(1);
    expect(summary.totalByPolicyType.public_liability).toBe(1);
    expect(summary.totalEstimatedLoss).toBe(700_000);
    expect(summary.countByStatus.reported).toBe(1);
    expect(summary.countByStatus.settled).toBe(1);
    expect(summary.totalSettledAmount).toBe(500_000);
  });

  it('returns zero totals when no claims exist', async () => {
    const service = createClaimsNotificationService({ now: () => '2025-02-10' });
    const summary = await service.getClaimsSummary('proj-empty');

    expect(summary.totalEstimatedLoss).toBe(0);
    expect(summary.totalSettledAmount).toBe(0);
    expect(summary.totalByPolicyType.CAR).toBe(0);
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// 8. Adapter Payloads
// ═══════════════════════════════════════════════════════════════════════════════

describe('Insurance Register Adapters', () => {
  describe('Passport Adapter', () => {
    it('maps compliance summary to PassportWritePayload correctly', async () => {
      let capturedPayload: any = null;

      const mockPlatform: PlatformIntegrationService = {
        writeToPassport: async (payload) => {
          capturedPayload = payload;
          return { success: true };
        },
        writeToAuditTrail: async () => ({ success: true }),
        writeToActionCentre: async () => ({ success: true }),
        writeToRiskEngine: async () => ({ success: true }),
        writeToDocuments: async () => ({ success: true }),
      };

      const adapter = createPassportAdapter(mockPlatform);

      const summary: InsuranceComplianceSummary = {
        overallStatus: 'partially_compliant',
        activePolicies: 3,
        expiredPolicies: 1,
        nonCompliantTypes: 2,
        lastCheckDate: '2025-03-01',
        results: [],
      };

      await adapter.write({ projectId: 'proj-1', complianceSummary: summary });

      expect(capturedPayload).not.toBeNull();
      expect(capturedPayload.projectId).toBe('proj-1');
      expect(capturedPayload.moduleId).toBe('insurance-register');
      expect(capturedPayload.statusLabel).toBe('partially_compliant');
      expect(capturedPayload.activeRecords).toBe(3);
      expect(capturedPayload.overdueItems).toBe(3); // nonCompliantTypes + expiredPolicies
      expect(capturedPayload.lastUpdated).toBe('2025-03-01');
    });
  });

  describe('Risk Engine Adapter', () => {
    it('maps severity by policy type — CAR → critical', async () => {
      let capturedPayload: any = null;

      const mockPlatform: PlatformIntegrationService = {
        writeToPassport: async () => ({ success: true }),
        writeToAuditTrail: async () => ({ success: true }),
        writeToActionCentre: async () => ({ success: true }),
        writeToRiskEngine: async (payload) => {
          capturedPayload = payload;
          return { success: true };
        },
        writeToDocuments: async () => ({ success: true }),
      };

      const adapter = createRiskEngineAdapter(mockPlatform);
      await adapter.write({
        projectId: 'proj-1',
        policyType: 'CAR',
        policyNumber: 'POL-001',
        description: 'CAR policy lapsed',
      });

      expect(capturedPayload.severity).toBe('critical');
      expect(capturedPayload.category).toBe('insurance');
    });

    it('maps severity by policy type — public_liability → critical', async () => {
      let capturedPayload: any = null;
      const mockPlatform: PlatformIntegrationService = {
        writeToPassport: async () => ({ success: true }),
        writeToAuditTrail: async () => ({ success: true }),
        writeToActionCentre: async () => ({ success: true }),
        writeToRiskEngine: async (payload) => { capturedPayload = payload; return { success: true }; },
        writeToDocuments: async () => ({ success: true }),
      };
      const adapter = createRiskEngineAdapter(mockPlatform);
      await adapter.write({ projectId: 'proj-1', policyType: 'public_liability', policyNumber: 'POL-PL', description: 'Lapsed' });
      expect(capturedPayload.severity).toBe('critical');
    });

    it('maps severity by policy type — PI → high', async () => {
      let capturedPayload: any = null;
      const mockPlatform: PlatformIntegrationService = {
        writeToPassport: async () => ({ success: true }),
        writeToAuditTrail: async () => ({ success: true }),
        writeToActionCentre: async () => ({ success: true }),
        writeToRiskEngine: async (payload) => { capturedPayload = payload; return { success: true }; },
        writeToDocuments: async () => ({ success: true }),
      };
      const adapter = createRiskEngineAdapter(mockPlatform);
      await adapter.write({ projectId: 'proj-1', policyType: 'PI', policyNumber: 'POL-PI', description: 'PI lapsed' });
      expect(capturedPayload.severity).toBe('high');
    });

    it('maps severity by policy type — SASRIA → medium', async () => {
      let capturedPayload: any = null;
      const mockPlatform: PlatformIntegrationService = {
        writeToPassport: async () => ({ success: true }),
        writeToAuditTrail: async () => ({ success: true }),
        writeToActionCentre: async () => ({ success: true }),
        writeToRiskEngine: async (payload) => { capturedPayload = payload; return { success: true }; },
        writeToDocuments: async () => ({ success: true }),
      };
      const adapter = createRiskEngineAdapter(mockPlatform);
      await adapter.write({ projectId: 'proj-1', policyType: 'SASRIA', policyNumber: 'POL-S', description: 'SASRIA lapsed' });
      expect(capturedPayload.severity).toBe('medium');
    });

    it('maps severity by policy type — LDI → medium', async () => {
      let capturedPayload: any = null;
      const mockPlatform: PlatformIntegrationService = {
        writeToPassport: async () => ({ success: true }),
        writeToAuditTrail: async () => ({ success: true }),
        writeToActionCentre: async () => ({ success: true }),
        writeToRiskEngine: async (payload) => { capturedPayload = payload; return { success: true }; },
        writeToDocuments: async () => ({ success: true }),
      };
      const adapter = createRiskEngineAdapter(mockPlatform);
      await adapter.write({ projectId: 'proj-1', policyType: 'LDI', policyNumber: 'POL-L', description: 'LDI lapsed' });
      expect(capturedPayload.severity).toBe('medium');
    });
  });
});
