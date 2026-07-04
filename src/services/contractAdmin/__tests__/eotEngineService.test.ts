/**
 * Unit Tests — EoT Engine Service
 *
 * Tests: claim creation with auto-generated reference, submission validation,
 * late submission flagging, review flow (granted, partially granted, rejected),
 * and notification deadline calculation.
 *
 * Requirements: 6.1–6.9
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ══════════════════════════════════════════════════════════════════════════════
// In-Memory Firestore Mock
// ══════════════════════════════════════════════════════════════════════════════

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
        get: vi.fn(async () => {
          // Return docs matching the collection path prefix
          const docs = Object.entries(mockData)
            .filter(([key]) => key.startsWith(`${path}/`) && key.split('/').length === path.split('/').length + 1)
            .map(([, value]) => ({ data: () => value }));
          return { size: docs.length, docs };
        }),
        where: vi.fn(() => ({
          get: vi.fn(async () => ({ docs: [] })),
        })),
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
  writeToSpecForge: vi.fn(async () => ({ success: true, targetModule: 'SpecForge', retryCount: 0 })),
  createRiskEvent: vi.fn(async () => ({ success: true, targetModule: 'RiskEngine', retryCount: 0 })),
  writeToProjectPassport: vi.fn(async () => ({ success: true, targetModule: 'ProjectPassport', retryCount: 0 })),
  retryWithBackoff: vi.fn(async (fn: () => Promise<any>) => fn()),
}));

import {
  calculateNotificationDeadline,
  createEoTClaim,
  submitEoTClaim,
  reviewEoTClaim,
} from '../eotEngineService';
import type {
  EoTClaimInput,
  EoTClaimRecord,
  ContractConfig,
  EvidenceAttachment,
} from '../contractTypes';
import { getSouthAfricanHolidays } from '../workingDayCalculator';

// ══════════════════════════════════════════════════════════════════════════════
// Test Helpers
// ══════════════════════════════════════════════════════════════════════════════

const PROJECT_ID = 'proj-eot-001';

/** Seed contract config into mock Firestore */
function seedContractConfig(projectId: string, overrides?: Partial<ContractConfig>): void {
  const config: ContractConfig = {
    id: 'config',
    projectId,
    contractForm: 'jbcc_pba',
    parties: [
      { id: 'p1', name: 'Employer Corp', role: 'employer', userId: 'user-emp' },
      { id: 'p2', name: 'Builder Ltd', role: 'contractor', userId: 'user-con' },
      { id: 'p3', name: 'Arch Studio', role: 'principal_agent', userId: 'user-pa' },
    ],
    commencementDate: '2025-01-15',
    practicalCompletionDate: '2026-01-15',
    contractSum: 5_000_000,
    clauseElections: [],
    formSpecificParams: {
      interimPaymentPeriodDays: 30,
      penaltyRatePerDay: 5000,
      retentionPercentage: 5,
      defectsLiabilityMonths: 12,
    },
    status: 'active',
    setupBy: 'user-001',
    setupAt: '2025-01-10T08:00:00.000Z',
    ...overrides,
  };
  mockData[`projects/${projectId}/contractConfig/config`] = config;
}

/** Seed an EoT claim directly into mock Firestore */
function seedEoTClaim(projectId: string, claimId: string, data: Partial<EoTClaimRecord>): void {
  mockData[`projects/${projectId}/contractEotClaims/${claimId}`] = {
    id: claimId,
    projectId,
    claimReference: 'EOT-PROJ-EOT-001',
    cause: 'weather',
    periodClaimedDays: 10,
    delayEventDate: '2025-06-01',
    narrative: 'Rainfall exceeded threshold for 10 consecutive working days.',
    evidenceAttachments: [],
    status: 'draft',
    isLateSubmission: false,
    createdBy: 'user-con',
    createdAt: '2025-06-15T08:00:00.000Z',
    updatedAt: '2025-06-15T08:00:00.000Z',
    ...data,
  };
}

/** Create a valid evidence attachment */
function makeEvidence(overrides?: Partial<EvidenceAttachment>): EvidenceAttachment {
  return {
    id: 'ev-001',
    type: 'site_diary',
    sourceId: 'diary-001',
    date: '2025-06-02',
    caption: 'Heavy rain recorded on site',
    ...overrides,
  };
}

/** Create a valid EoT claim input */
function validEoTInput(overrides?: Partial<EoTClaimInput>): EoTClaimInput {
  return {
    projectId: PROJECT_ID,
    cause: 'weather',
    periodClaimedDays: 15,
    delayEventDate: '2025-06-01',
    narrative: 'Rainfall exceeded threshold causing work stoppage for 15 working days.',
    evidenceAttachments: [makeEvidence()],
    createdBy: 'user-con',
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

beforeEach(() => {
  // Clear in-memory data store between tests
  Object.keys(mockData).forEach((key) => delete mockData[key]);
});

describe('eotEngineService', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // 1. calculateNotificationDeadline — pure function
  // ──────────────────────────────────────────────────────────────────────────

  describe('calculateNotificationDeadline', () => {
    it('returns correct deadline for JBCC (20 working days from delay event date)', () => {
      const holidays = getSouthAfricanHolidays(2025);
      const result = calculateNotificationDeadline('jbcc_pba', '2025-06-02', holidays);

      // JBCC requires notification within 20 working days
      // Starting 2025-06-02 (Monday), count 20 working days forward
      expect(result.deadline).toBeDefined();
      expect(result.remainingDays).toBeGreaterThanOrEqual(0);

      // The deadline should be a weekday (Mon-Fri) and not a holiday
      const deadlineDate = new Date(result.deadline);
      const dayOfWeek = deadlineDate.getDay();
      expect(dayOfWeek).toBeGreaterThan(0); // Not Sunday
      expect(dayOfWeek).toBeLessThan(6); // Not Saturday
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. createEoTClaim — creates claim in draft with auto-generated reference
  // ──────────────────────────────────────────────────────────────────────────

  describe('createEoTClaim', () => {
    it('creates claim in draft status with auto-generated reference (EOT-{prefix}-001)', async () => {
      seedContractConfig(PROJECT_ID);

      const result = await createEoTClaim(validEoTInput());

      expect(result.claim).toBeDefined();
      expect(result.claim.status).toBe('draft');
      expect(result.claim.claimReference).toMatch(/^EOT-[A-Z0-9-]+-001$/);
      expect(result.claim.cause).toBe('weather');
      expect(result.claim.periodClaimedDays).toBe(15);
      expect(result.claim.projectId).toBe(PROJECT_ID);
      expect(result.claim.createdBy).toBe('user-con');
      expect(result.auditRecord).toBeDefined();
      expect(result.auditRecord.action).toBe('eot_claim_created');
    });

    // ────────────────────────────────────────────────────────────────────────
    // 3. createEoTClaim — rejects invalid cause category
    // ────────────────────────────────────────────────────────────────────────

    it('rejects invalid cause category', async () => {
      seedContractConfig(PROJECT_ID);

      await expect(
        createEoTClaim(validEoTInput({ cause: 'invalid_cause' as any }))
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { invalidFields: expect.arrayContaining(['cause']) },
      });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 4. createEoTClaim — rejects period outside 1–365 range
    // ────────────────────────────────────────────────────────────────────────

    it('rejects periodClaimedDays of 0 (below minimum)', async () => {
      seedContractConfig(PROJECT_ID);

      await expect(
        createEoTClaim(validEoTInput({ periodClaimedDays: 0 }))
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { invalidFields: expect.arrayContaining(['periodClaimedDays']) },
      });
    });

    it('rejects periodClaimedDays of 366 (above maximum)', async () => {
      seedContractConfig(PROJECT_ID);

      await expect(
        createEoTClaim(validEoTInput({ periodClaimedDays: 366 }))
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { invalidFields: expect.arrayContaining(['periodClaimedDays']) },
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. submitEoTClaim — rejects when no evidence attachments
  // ──────────────────────────────────────────────────────────────────────────

  describe('submitEoTClaim', () => {
    it('rejects submission when no evidence attachments (VALIDATION_ERROR)', async () => {
      const claimId = 'claim-no-evidence';
      seedContractConfig(PROJECT_ID);
      seedEoTClaim(PROJECT_ID, claimId, {
        evidenceAttachments: [],
        status: 'draft',
      });

      await expect(
        submitEoTClaim(PROJECT_ID, claimId, 'user-con')
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { invalidFields: expect.arrayContaining(['evidenceAttachments']) },
      });
    });

    // ────────────────────────────────────────────────────────────────────────
    // 6. submitEoTClaim — succeeds when all mandatory fields are populated
    // ────────────────────────────────────────────────────────────────────────

    it('succeeds when all mandatory fields are populated', async () => {
      const claimId = 'claim-valid-submit';
      seedContractConfig(PROJECT_ID);
      seedEoTClaim(PROJECT_ID, claimId, {
        cause: 'weather',
        periodClaimedDays: 10,
        delayEventDate: '2025-06-01',
        narrative: 'Valid narrative describing the delay event.',
        evidenceAttachments: [makeEvidence()],
        status: 'draft',
        notificationDeadline: '2025-07-01',
        isLateSubmission: false,
      });

      const result = await submitEoTClaim(PROJECT_ID, claimId, 'user-con');

      expect(result.auditRecord).toBeDefined();
      expect(result.auditRecord.action).toBe('eot_claim_submitted');
      expect(result.actionCentreEvent).toBeDefined();
      expect(result.actionCentreEvent.entityType).toBe('eot');
      expect(result.actionCentreEvent.priority).toBe('high');
    });

    // ────────────────────────────────────────────────────────────────────────
    // 7. submitEoTClaim — marks late submission when notification deadline passed
    // ────────────────────────────────────────────────────────────────────────

    it('marks late submission when notification deadline has passed', async () => {
      const claimId = 'claim-late';
      seedContractConfig(PROJECT_ID);
      // Set notificationDeadline in the past
      seedEoTClaim(PROJECT_ID, claimId, {
        cause: 'materials',
        periodClaimedDays: 5,
        delayEventDate: '2025-01-01',
        narrative: 'Material delivery delayed.',
        evidenceAttachments: [makeEvidence()],
        status: 'draft',
        notificationDeadline: '2024-01-01', // Well in the past
        isLateSubmission: false,
      });

      const result = await submitEoTClaim(PROJECT_ID, claimId, 'user-con');

      // The submission should succeed but mark late
      expect(result.auditRecord.newValue).toHaveProperty('isLateSubmission', true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 8. reviewEoTClaim — grant transitions and updates completion date
  // ──────────────────────────────────────────────────────────────────────────

  describe('reviewEoTClaim', () => {
    it('grant transitions to granted and updates revised completion date', async () => {
      const claimId = 'claim-grant';
      seedContractConfig(PROJECT_ID);
      seedEoTClaim(PROJECT_ID, claimId, {
        cause: 'client',
        periodClaimedDays: 20,
        delayEventDate: '2025-06-01',
        narrative: 'Client delayed design approval.',
        evidenceAttachments: [makeEvidence()],
        status: 'submitted',
      });

      const result = await reviewEoTClaim(
        PROJECT_ID,
        claimId,
        'granted',
        undefined,
        'user-pa'
      );

      expect(result.auditRecord.action).toBe('eot_claim_granted');
      expect(result.revisedCompletionDate).toBeDefined();
      // The revised date should be after the original completion date
      const originalCompletion = '2026-01-15';
      expect(result.revisedCompletionDate! > originalCompletion).toBe(true);
    });

    // ────────────────────────────────────────────────────────────────────────
    // 9. reviewEoTClaim — partial grant validates 1 ≤ approvedDays < periodClaimed
    // ────────────────────────────────────────────────────────────────────────

    it('partial grant validates 1 ≤ approvedDays < periodClaimed', async () => {
      const claimId = 'claim-partial-invalid';
      seedContractConfig(PROJECT_ID);
      seedEoTClaim(PROJECT_ID, claimId, {
        cause: 'weather',
        periodClaimedDays: 10,
        status: 'submitted',
        evidenceAttachments: [makeEvidence()],
      });

      // approvedDays = 0 (below minimum)
      await expect(
        reviewEoTClaim(PROJECT_ID, claimId, 'partially_granted', 0, 'user-pa')
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { invalidFields: expect.arrayContaining(['approvedDays']) },
      });

      // approvedDays = periodClaimed (not less than)
      await expect(
        reviewEoTClaim(PROJECT_ID, claimId, 'partially_granted', 10, 'user-pa')
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { invalidFields: expect.arrayContaining(['approvedDays']) },
      });
    });

    it('partial grant succeeds with valid approvedDays and updates completion date', async () => {
      const claimId = 'claim-partial-valid';
      seedContractConfig(PROJECT_ID);
      seedEoTClaim(PROJECT_ID, claimId, {
        cause: 'weather',
        periodClaimedDays: 20,
        delayEventDate: '2025-06-01',
        narrative: 'Weather delays.',
        evidenceAttachments: [makeEvidence()],
        status: 'submitted',
      });

      const result = await reviewEoTClaim(
        PROJECT_ID,
        claimId,
        'partially_granted',
        10,
        'user-pa'
      );

      expect(result.auditRecord.action).toBe('eot_claim_partially_granted');
      expect(result.revisedCompletionDate).toBeDefined();
      expect(result.auditRecord.newValue).toHaveProperty('approvedDays', 10);
    });

    // ────────────────────────────────────────────────────────────────────────
    // 10. reviewEoTClaim — rejection transitions without changing completion date
    // ────────────────────────────────────────────────────────────────────────

    it('rejection transitions to rejected without changing completion date', async () => {
      const claimId = 'claim-reject';
      seedContractConfig(PROJECT_ID);
      seedEoTClaim(PROJECT_ID, claimId, {
        cause: 'contractor',
        periodClaimedDays: 7,
        delayEventDate: '2025-06-01',
        narrative: 'Contractor fault — no entitlement.',
        evidenceAttachments: [makeEvidence()],
        status: 'submitted',
      });

      const result = await reviewEoTClaim(
        PROJECT_ID,
        claimId,
        'rejected',
        undefined,
        'user-pa'
      );

      expect(result.auditRecord.action).toBe('eot_claim_rejected');
      expect(result.revisedCompletionDate).toBeUndefined();
    });
  });
});
