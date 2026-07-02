/**
 * Unit tests for Claims Register Service
 *
 * Tests: claim registration (valid/invalid), full claim lifecycle,
 * dispute escalation with adjudication deadline, invalid transitions,
 * and cumulative summary accuracy.
 *
 * Requirements: 8.1–8.9
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// ══════════════════════════════════════════════════════════════════════════════
// Mocks
// ══════════════════════════════════════════════════════════════════════════════

// In-memory Firestore mock store
const mockData: Record<string, any> = {};

vi.mock('@/lib/firebase-admin', () => {
  return {
    adminDb: {
      collection: vi.fn((path: string) => ({
        doc: vi.fn((id: string) => ({
          set: vi.fn(async (data: any) => {
            mockData[`${path}/${id}`] = { ...data };
          }),
          get: vi.fn(async () => {
            const d = mockData[`${path}/${id}`];
            return { exists: !!d, data: () => (d ? { ...d } : undefined) };
          }),
          update: vi.fn(async (data: any) => {
            if (mockData[`${path}/${id}`]) {
              Object.assign(mockData[`${path}/${id}`], data);
            }
          }),
        })),
        where: vi.fn((_field: string, _op: string, _value: any) => ({
          get: vi.fn(async () => {
            const matches = Object.entries(mockData)
              .filter(([key, doc]) => key.startsWith(path + '/') && doc.status === _value);
            return {
              empty: matches.length === 0,
              docs: matches.map(([, doc]) => ({ data: () => ({ ...doc }) })),
            };
          }),
        })),
        get: vi.fn(async () => {
          // Return all docs in this collection path
          const docs = Object.entries(mockData)
            .filter(([key]) => key.startsWith(path + '/') && key.split('/').length === path.split('/').length + 1)
            .map(([, doc]) => ({ data: () => ({ ...doc }) }));
          return { docs, size: docs.length };
        }),
      })),
    },
  };
});

// Mock RBAC service — assertAccess is a no-op for unit tests
vi.mock('../contractRbacService', () => ({
  assertAccess: vi.fn(),
}));

// Mock Integration service — avoid real Firestore writes and retry backoff in tests
vi.mock('../contractIntegrationService', () => ({
  writeToAuditTrail: vi.fn(async () => ({ success: true, targetModule: 'AuditTrail', retryCount: 0 })),
  surfaceToActionCentre: vi.fn(async () => ({ success: true, targetModule: 'ActionCentre', retryCount: 0 })),
  createRiskEvent: vi.fn(async () => ({ success: true, targetModule: 'RiskEngine', retryCount: 0 })),
  writeToProjectPassport: vi.fn(async () => ({ success: true, targetModule: 'ProjectPassport', retryCount: 0 })),
  retryWithBackoff: vi.fn(async (fn: () => Promise<any>) => fn()),
}));

// Mock contractFormConfigs — provide a minimal getFormConfig
vi.mock('../contractFormConfigs', () => ({
  getFormConfig: vi.fn(() => ({
    eotNotificationRule: {
      notificationPeriodDays: 28,
      dayType: 'calendar',
      clauseNumber: '25.1',
      clauseTitle: 'Notification of Claim',
    },
  })),
}));

import {
  registerClaim,
  isValidClaimTransition,
  transitionClaim,
  registerDissatisfaction,
  getCumulativeSummary,
} from '../claimsRegisterService';
import type {
  ClaimInput,
  ClaimStatus,
  ContractProjectAssignment,
} from '../contractTypes';

// ══════════════════════════════════════════════════════════════════════════════
// Test Helpers
// ══════════════════════════════════════════════════════════════════════════════

/** Minimal project assignment for RBAC (passes because assertAccess is mocked) */
const mockProjectAssignment: ContractProjectAssignment = {
  projectId: 'proj-1',
  userId: 'user-qs',
  roles: ['quantity_surveyor'],
  isAssignedTeamMember: true,
  isAssignedContractor: false,
  isAssignedSubcontractor: false,
  isProjectOwner: false,
  isAssignedSiteManager: false,
};

/** Valid claim input factory */
function validClaimInput(overrides?: Partial<ClaimInput>): ClaimInput {
  return {
    projectId: 'proj-1',
    claimType: 'loss_and_expense',
    dateOfEvent: '2025-06-01',
    notificationDate: '2025-06-05',
    amountClaimed: 250000.00,
    timeImpactDays: 14,
    linkedEvidenceIds: ['ev-001', 'ev-002'],
    createdBy: 'user-qs',
    ...overrides,
  };
}

/** Seed a claim record directly into mock Firestore */
function seedClaim(projectId: string, claimId: string, data: any): void {
  mockData[`projects/${projectId}/contractClaims/${claimId}`] = data;
}

/** Seed a contract config for dissatisfaction deadline calculation */
function seedContractConfig(projectId: string, contractForm: string): void {
  mockData[`projects/${projectId}/contractConfig/config`] = {
    id: 'config',
    projectId,
    contractForm,
    parties: [],
    commencementDate: '2025-01-01',
    practicalCompletionDate: '2026-01-01',
    contractSum: 5000000,
    clauseElections: [],
    formSpecificParams: {},
    status: 'active',
    setupBy: 'user-admin',
    setupAt: '2025-01-01T00:00:00.000Z',
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

beforeEach(() => {
  // Clear all stored mock data between tests
  for (const key of Object.keys(mockData)) {
    delete mockData[key];
  }
});

describe('claimsRegisterService', () => {
  // ────────────────────────────────────────────────────────────────────────
  // registerClaim
  // ────────────────────────────────────────────────────────────────────────

  describe('registerClaim', () => {
    it('creates a claim in notified status with auto-generated reference', async () => {
      const input = validClaimInput();
      const result = await registerClaim(input, mockProjectAssignment);

      expect(result.claim).toBeDefined();
      expect(result.claim.status).toBe('notified');
      expect(result.claim.projectId).toBe('proj-1');
      expect(result.claim.claimType).toBe('loss_and_expense');
      expect(result.claim.dateOfEvent).toBe('2025-06-01');
      expect(result.claim.notificationDate).toBe('2025-06-05');
      expect(result.claim.amountClaimed).toBe(250000.00);
      expect(result.claim.timeImpactDays).toBe(14);
      expect(result.claim.linkedEvidenceIds).toEqual(['ev-001', 'ev-002']);
      expect(result.claim.createdBy).toBe('user-qs');
      expect(result.claim.id).toBeDefined();
      expect(result.claim.createdAt).toBeDefined();
      expect(result.claim.updatedAt).toBeDefined();

      // Auto-generated claim reference should follow pattern CLM-{prefix}-{seq}
      expect(result.claim.claimReference).toMatch(/^CLM-LE-\d{4}$/);

      // Should have created an audit record
      expect(result.auditRecord).toBeDefined();
      expect(result.auditRecord.entityType).toBe('claim');
      expect(result.auditRecord.action).toBe('claim_registered');
      expect(result.auditRecord.actorId).toBe('user-qs');
    });

    it('rejects missing mandatory fields (claimType, dateOfEvent, notificationDate, amountClaimed)', async () => {
      // Missing claimType (invalid value)
      const inputNoType = validClaimInput({ claimType: '' as any });
      await expect(registerClaim(inputNoType, mockProjectAssignment)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { invalidFields: expect.arrayContaining(['claimType']) },
      });

      // Missing dateOfEvent
      const inputNoDate = validClaimInput({ dateOfEvent: '' });
      await expect(registerClaim(inputNoDate, mockProjectAssignment)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { invalidFields: expect.arrayContaining(['dateOfEvent']) },
      });

      // Missing notificationDate
      const inputNoNotification = validClaimInput({ notificationDate: '' });
      await expect(registerClaim(inputNoNotification, mockProjectAssignment)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { invalidFields: expect.arrayContaining(['notificationDate']) },
      });

      // Missing amountClaimed (zero is below minimum 0.01)
      const inputNoAmount = validClaimInput({ amountClaimed: 0 });
      await expect(registerClaim(inputNoAmount, mockProjectAssignment)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { invalidFields: expect.arrayContaining(['amountClaimed']) },
      });
    });

    it('rejects invalid claim type', async () => {
      const inputInvalidType = validClaimInput({ claimType: 'invalid_type' as any });
      await expect(registerClaim(inputInvalidType, mockProjectAssignment)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { invalidFields: expect.arrayContaining(['claimType']) },
      });
    });

    it('rejects amount outside 0.01–999,999,999.99 range', async () => {
      // Below minimum
      const inputTooLow = validClaimInput({ amountClaimed: 0.001 });
      await expect(registerClaim(inputTooLow, mockProjectAssignment)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { invalidFields: expect.arrayContaining(['amountClaimed']) },
      });

      // Above maximum
      const inputTooHigh = validClaimInput({ amountClaimed: 1_000_000_000 });
      await expect(registerClaim(inputTooHigh, mockProjectAssignment)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { invalidFields: expect.arrayContaining(['amountClaimed']) },
      });

      // Negative value
      const inputNegative = validClaimInput({ amountClaimed: -100 });
      await expect(registerClaim(inputNegative, mockProjectAssignment)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { invalidFields: expect.arrayContaining(['amountClaimed']) },
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // isValidClaimTransition
  // ────────────────────────────────────────────────────────────────────────

  describe('isValidClaimTransition', () => {
    it('returns true for valid transitions', () => {
      const validTransitions: [ClaimStatus, ClaimStatus][] = [
        ['notified', 'substantiated'],
        ['substantiated', 'assessed'],
        ['assessed', 'accepted'],
        ['assessed', 'partially_accepted'],
        ['assessed', 'rejected'],
        ['accepted', 'disputed'],
        ['partially_accepted', 'disputed'],
        ['rejected', 'disputed'],
      ];

      for (const [from, to] of validTransitions) {
        expect(isValidClaimTransition(from, to)).toBe(true);
      }
    });

    it('returns false for invalid transitions', () => {
      const invalidTransitions: [ClaimStatus, ClaimStatus][] = [
        ['notified', 'assessed'],
        ['notified', 'accepted'],
        ['notified', 'rejected'],
        ['notified', 'disputed'],
        ['substantiated', 'notified'],
        ['substantiated', 'accepted'],
        ['substantiated', 'disputed'],
        ['assessed', 'notified'],
        ['assessed', 'substantiated'],
        ['assessed', 'disputed'],
        ['accepted', 'notified'],
        ['accepted', 'assessed'],
        ['rejected', 'notified'],
        ['rejected', 'assessed'],
        ['rejected', 'accepted'],
        ['disputed', 'notified'],
        ['disputed', 'substantiated'],
        ['disputed', 'assessed'],
        ['disputed', 'accepted'],
      ];

      for (const [from, to] of invalidTransitions) {
        expect(isValidClaimTransition(from, to)).toBe(false);
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // transitionClaim
  // ────────────────────────────────────────────────────────────────────────

  describe('transitionClaim', () => {
    it('notified → substantiated succeeds', async () => {
      seedClaim('proj-1', 'claim-1', {
        id: 'claim-1',
        projectId: 'proj-1',
        claimReference: 'CLM-LE-0001',
        claimType: 'loss_and_expense',
        status: 'notified',
        amountClaimed: 100000,
        createdBy: 'user-qs',
        createdAt: '2025-06-05T00:00:00.000Z',
        updatedAt: '2025-06-05T00:00:00.000Z',
      });

      const result = await transitionClaim(
        'proj-1',
        'claim-1',
        'substantiated',
        'user-qs',
        'Evidence gathered and substantiation complete',
        mockProjectAssignment
      );

      expect(result.auditRecord).toBeDefined();
      expect(result.auditRecord.action).toBe('claim_transitioned_to_substantiated');
      expect(result.auditRecord.previousValue).toEqual({ status: 'notified' });
      expect(result.auditRecord.newValue).toEqual({
        status: 'substantiated',
        reason: 'Evidence gathered and substantiation complete',
      });
      expect(result.auditRecord.actorId).toBe('user-qs');

      // Verify Firestore was updated
      const updatedClaim = mockData['projects/proj-1/contractClaims/claim-1'];
      expect(updatedClaim.status).toBe('substantiated');
    });

    it('notified → accepted fails (INVALID_TRANSITION)', async () => {
      seedClaim('proj-1', 'claim-2', {
        id: 'claim-2',
        projectId: 'proj-1',
        claimReference: 'CLM-DIS-0001',
        claimType: 'disruption',
        status: 'notified',
        amountClaimed: 50000,
        createdBy: 'user-contractor',
        createdAt: '2025-06-10T00:00:00.000Z',
        updatedAt: '2025-06-10T00:00:00.000Z',
      });

      await expect(
        transitionClaim(
          'proj-1',
          'claim-2',
          'accepted',
          'user-qs',
          'Attempting invalid transition',
          mockProjectAssignment
        )
      ).rejects.toMatchObject({
        code: 'INVALID_TRANSITION',
        message: expect.stringContaining('notified'),
        details: {
          currentStatus: 'notified',
          attemptedStatus: 'accepted',
          permittedTransitions: ['substantiated'],
        },
      });

      // Status should remain unchanged
      const unchangedClaim = mockData['projects/proj-1/contractClaims/claim-2'];
      expect(unchangedClaim.status).toBe('notified');
    });

    it('full lifecycle: notified → substantiated → assessed → accepted', async () => {
      // Register a claim
      const input = validClaimInput();
      const { claim } = await registerClaim(input, mockProjectAssignment);
      expect(claim.status).toBe('notified');

      // Transition: notified → substantiated
      await transitionClaim(
        'proj-1',
        claim.id,
        'substantiated',
        'user-qs',
        'Claim substantiated with full documentation',
        mockProjectAssignment
      );
      const substantiated = mockData[`projects/proj-1/contractClaims/${claim.id}`];
      expect(substantiated.status).toBe('substantiated');

      // Transition: substantiated → assessed
      await transitionClaim(
        'proj-1',
        claim.id,
        'assessed',
        'user-qs',
        'Claim assessed by quantity surveyor',
        mockProjectAssignment
      );
      const assessed = mockData[`projects/proj-1/contractClaims/${claim.id}`];
      expect(assessed.status).toBe('assessed');

      // Transition: assessed → accepted
      await transitionClaim(
        'proj-1',
        claim.id,
        'accepted',
        'user-pa',
        'Claim accepted in full',
        mockProjectAssignment
      );
      const accepted = mockData[`projects/proj-1/contractClaims/${claim.id}`];
      expect(accepted.status).toBe('accepted');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // registerDissatisfaction
  // ────────────────────────────────────────────────────────────────────────

  describe('registerDissatisfaction', () => {
    it('calculates adjudication deadline for rejected claim (JBCC PBA: 10 working days)', async () => {
      seedContractConfig('proj-1', 'jbcc_pba');

      seedClaim('proj-1', 'claim-diss', {
        id: 'claim-diss',
        projectId: 'proj-1',
        claimReference: 'CLM-LE-0003',
        claimType: 'loss_and_expense',
        status: 'rejected',
        amountClaimed: 300000,
        createdBy: 'user-contractor',
        createdAt: '2025-06-01T00:00:00.000Z',
        updatedAt: '2025-06-20T00:00:00.000Z',
      });

      const result = await registerDissatisfaction(
        'proj-1',
        'claim-diss',
        '2025-07-01',
        'user-contractor',
        mockProjectAssignment
      );

      // JBCC PBA: 10 working days → approximated as 10 * 1.4 = 14 calendar days
      expect(result.adjudicationDeadline).toBeDefined();
      expect(result.adjudicationDeadline).toBe('2025-07-15');

      // Verify the claim was updated with dissatisfaction details
      const updatedClaim = mockData['projects/proj-1/contractClaims/claim-diss'];
      expect(updatedClaim.dissatisfactionDate).toBe('2025-07-01');
      expect(updatedClaim.adjudicationDeadline).toBe('2025-07-15');
    });

    it('calculates adjudication deadline for NEC ECC (28 calendar days)', async () => {
      seedContractConfig('proj-1', 'nec_ecc');

      seedClaim('proj-1', 'claim-nec', {
        id: 'claim-nec',
        projectId: 'proj-1',
        claimReference: 'CLM-PRO-0001',
        claimType: 'prolongation',
        status: 'partially_accepted',
        amountClaimed: 180000,
        createdBy: 'user-contractor',
        createdAt: '2025-06-01T00:00:00.000Z',
        updatedAt: '2025-06-20T00:00:00.000Z',
      });

      const result = await registerDissatisfaction(
        'proj-1',
        'claim-nec',
        '2025-07-01',
        'user-contractor',
        mockProjectAssignment
      );

      // NEC ECC: 28 calendar days from notice date
      expect(result.adjudicationDeadline).toBe('2025-07-29');
    });

    it('rejects dissatisfaction for claim in notified status', async () => {
      seedClaim('proj-1', 'claim-early', {
        id: 'claim-early',
        projectId: 'proj-1',
        claimReference: 'CLM-DIS-0002',
        claimType: 'disruption',
        status: 'notified',
        amountClaimed: 50000,
        createdBy: 'user-contractor',
        createdAt: '2025-06-01T00:00:00.000Z',
        updatedAt: '2025-06-01T00:00:00.000Z',
      });

      await expect(
        registerDissatisfaction(
          'proj-1',
          'claim-early',
          '2025-07-01',
          'user-contractor',
          mockProjectAssignment
        )
      ).rejects.toMatchObject({
        code: 'INVALID_TRANSITION',
        message: expect.stringContaining('notified'),
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // getCumulativeSummary
  // ────────────────────────────────────────────────────────────────────────

  describe('getCumulativeSummary', () => {
    it('computes correct totals with mixed claim types', async () => {
      // Seed multiple claims with different types and statuses
      seedClaim('proj-1', 'claim-le1', {
        id: 'claim-le1',
        projectId: 'proj-1',
        claimType: 'loss_and_expense',
        status: 'notified',
        amountClaimed: 100000,
      });

      seedClaim('proj-1', 'claim-le2', {
        id: 'claim-le2',
        projectId: 'proj-1',
        claimType: 'loss_and_expense',
        status: 'accepted',
        amountClaimed: 200000,
      });

      seedClaim('proj-1', 'claim-dis1', {
        id: 'claim-dis1',
        projectId: 'proj-1',
        claimType: 'disruption',
        status: 'assessed',
        amountClaimed: 75000,
      });

      seedClaim('proj-1', 'claim-pro1', {
        id: 'claim-pro1',
        projectId: 'proj-1',
        claimType: 'prolongation',
        status: 'partially_accepted',
        amountClaimed: 150000,
      });

      seedClaim('proj-1', 'claim-vw1', {
        id: 'claim-vw1',
        projectId: 'proj-1',
        claimType: 'varied_work',
        status: 'rejected',
        amountClaimed: 50000,
      });

      const summary = await getCumulativeSummary('proj-1');

      // Count by type
      expect(summary.totalByType.loss_and_expense).toBe(2);
      expect(summary.totalByType.disruption).toBe(1);
      expect(summary.totalByType.prolongation).toBe(1);
      expect(summary.totalByType.varied_work).toBe(1);

      // Total amount claimed = sum of all claims
      expect(summary.totalAmountClaimed).toBe(575000); // 100k + 200k + 75k + 150k + 50k

      // Total assessed = claims in assessed+ statuses (assessed, accepted, partially_accepted, rejected, disputed)
      // assessed (75k) + accepted (200k) + partially_accepted (150k) + rejected (50k)
      expect(summary.totalAmountAssessed).toBe(475000);

      // Total settled = claims in accepted or partially_accepted
      // accepted (200k) + partially_accepted (150k)
      expect(summary.totalAmountSettled).toBe(350000);
    });
  });
});
