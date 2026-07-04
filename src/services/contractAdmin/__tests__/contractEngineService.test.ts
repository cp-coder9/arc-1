/**
 * Unit Tests — Contract Engine Service
 *
 * Tests validateContractSetup for all 4 contract forms (JBCC, NEC, GCC, FIDIC),
 * validation failure cases, and setupContract persistence with mocked Firestore.
 *
 * Requirements: 1.1–1.10
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ContractSetupInput, JbccParams, NecParams, GccParams, FidicParams } from '../contractTypes';

// ── Mock Firestore ─────────────────────────────────────────────────────────

const mockSet = vi.fn().mockResolvedValue(undefined);
const mockGet = vi.fn().mockResolvedValue({ exists: false, data: () => null });
const mockUpdate = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          doc: vi.fn(() => ({
            set: mockSet,
            get: mockGet,
            update: mockUpdate,
          })),
        })),
        set: mockSet,
        get: mockGet,
        update: mockUpdate,
      })),
    })),
  },
}));

// ── Mock RBAC ──────────────────────────────────────────────────────────────

vi.mock('../contractRbacService', () => ({
  assertAccess: vi.fn(),
}));

import { validateContractSetup, setupContract } from '../contractEngineService';

// ══════════════════════════════════════════════════════════════════════════════
// Test Fixtures
// ══════════════════════════════════════════════════════════════════════════════

function makeValidJbccInput(): ContractSetupInput {
  return {
    projectId: 'proj-001',
    contractForm: 'jbcc_pba',
    parties: [
      { id: 'p1', name: 'Employer Corp', role: 'employer' },
      { id: 'p2', name: 'Builder Ltd', role: 'contractor' },
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
    } as JbccParams,
    setupBy: 'user-001',
  };
}

function makeValidNecInput(): ContractSetupInput {
  return {
    projectId: 'proj-002',
    contractForm: 'nec_ecc',
    parties: [
      { id: 'p1', name: 'Employer Corp', role: 'employer' },
      { id: 'p2', name: 'Builder Ltd', role: 'contractor' },
    ],
    commencementDate: '2025-03-01',
    practicalCompletionDate: '2026-06-30',
    contractSum: 10_000_000,
    clauseElections: [],
    formSpecificParams: {
      earlyWarningWeeks: 4,
      compensationEventNotificationWeeks: 8,
      programmeSubmissionIntervalWeeks: 4,
    } as NecParams,
    setupBy: 'user-002',
  };
}

function makeValidGccInput(): ContractSetupInput {
  return {
    projectId: 'proj-003',
    contractForm: 'gcc_2025',
    parties: [
      { id: 'p1', name: 'Employer Corp', role: 'employer' },
      { id: 'p2', name: 'Builder Ltd', role: 'contractor' },
    ],
    commencementDate: '2025-04-01',
    practicalCompletionDate: '2027-03-31',
    contractSum: 50_000_000,
    clauseElections: [],
    formSpecificParams: {
      advanceWarningWorkingDays: 20,
      penaltyRatePerDay: 10000,
      firstStageClaimWorkingDays: 28,
      secondStageClaimWorkingDays: 28,
      deemedRejectionWorkingDays: 28,
    } as GccParams,
    setupBy: 'user-003',
  };
}

function makeValidFidicInput(): ContractSetupInput {
  return {
    projectId: 'proj-004',
    contractForm: 'fidic',
    parties: [
      { id: 'p1', name: 'Employer Corp', role: 'employer' },
      { id: 'p2', name: 'Builder Ltd', role: 'contractor' },
    ],
    commencementDate: '2025-06-01',
    practicalCompletionDate: '2028-05-31',
    contractSum: 200_000_000,
    clauseElections: [],
    formSpecificParams: {
      timeForCompletionDays: 1095,
      defectsNotificationDays: 730,
      dabComposition: 3,
    } as FidicParams,
    setupBy: 'user-004',
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('contractEngineService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── validateContractSetup — Valid inputs ───────────────────────────────

  describe('validateContractSetup — valid inputs', () => {
    it('returns valid for JBCC PBA with all fields correct', () => {
      const result = validateContractSetup(makeValidJbccInput());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns valid for NEC ECC with all fields correct', () => {
      const result = validateContractSetup(makeValidNecInput());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns valid for GCC 2025 with all fields correct', () => {
      const result = validateContractSetup(makeValidGccInput());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns valid for FIDIC with all fields correct', () => {
      const result = validateContractSetup(makeValidFidicInput());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  // ─── validateContractSetup — Missing projectId ──────────────────────────

  describe('validateContractSetup — missing projectId', () => {
    it('returns error when projectId is empty string', () => {
      const input = makeValidJbccInput();
      input.projectId = '';

      const result = validateContractSetup(input);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'projectId')).toBe(true);
    });

    it('returns error when projectId is whitespace only', () => {
      const input = makeValidJbccInput();
      input.projectId = '   ';

      const result = validateContractSetup(input);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'projectId')).toBe(true);
    });
  });

  // ─── validateContractSetup — Invalid contract form ──────────────────────

  describe('validateContractSetup — invalid contract form', () => {
    it('returns error for unsupported contract form', () => {
      const input = makeValidJbccInput();
      (input as any).contractForm = 'invalid_form';

      const result = validateContractSetup(input);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'contractForm')).toBe(true);
    });
  });

  // ─── validateContractSetup — Fewer than 2 parties ───────────────────────

  describe('validateContractSetup — fewer than 2 parties', () => {
    it('returns error when only 1 party is provided', () => {
      const input = makeValidJbccInput();
      input.parties = [{ id: 'p1', name: 'Employer Corp', role: 'employer' }];

      const result = validateContractSetup(input);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'parties' && e.message.includes('2'))).toBe(true);
    });

    it('returns error when parties array is empty', () => {
      const input = makeValidJbccInput();
      input.parties = [];

      const result = validateContractSetup(input);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'parties')).toBe(true);
    });
  });

  // ─── validateContractSetup — Missing employer role ──────────────────────

  describe('validateContractSetup — missing employer role', () => {
    it('returns error when no party has employer role', () => {
      const input = makeValidJbccInput();
      input.parties = [
        { id: 'p1', name: 'Agent', role: 'principal_agent' },
        { id: 'p2', name: 'Builder Ltd', role: 'contractor' },
      ];

      const result = validateContractSetup(input);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'parties' && e.message.includes('employer'))).toBe(true);
    });
  });

  // ─── validateContractSetup — Missing contractor role ────────────────────

  describe('validateContractSetup — missing contractor role', () => {
    it('returns error when no party has contractor role', () => {
      const input = makeValidJbccInput();
      input.parties = [
        { id: 'p1', name: 'Employer Corp', role: 'employer' },
        { id: 'p2', name: 'Agent', role: 'principal_agent' },
      ];

      const result = validateContractSetup(input);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'parties' && e.message.includes('contractor'))).toBe(true);
    });
  });

  // ─── validateContractSetup — Date ordering ──────────────────────────────

  describe('validateContractSetup — practicalCompletionDate before commencementDate', () => {
    it('returns error when completion date is before commencement date', () => {
      const input = makeValidJbccInput();
      input.commencementDate = '2025-06-01';
      input.practicalCompletionDate = '2025-01-01';

      const result = validateContractSetup(input);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'practicalCompletionDate' && e.message.includes('after'))).toBe(true);
    });

    it('returns error when completion date equals commencement date', () => {
      const input = makeValidJbccInput();
      input.commencementDate = '2025-06-01';
      input.practicalCompletionDate = '2025-06-01';

      const result = validateContractSetup(input);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'practicalCompletionDate')).toBe(true);
    });
  });

  // ─── validateContractSetup — contractSum out of range ───────────────────

  describe('validateContractSetup — contractSum out of range', () => {
    it('returns error when contractSum is 0', () => {
      const input = makeValidJbccInput();
      input.contractSum = 0;

      const result = validateContractSetup(input);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'contractSum')).toBe(true);
    });

    it('returns error when contractSum is negative', () => {
      const input = makeValidJbccInput();
      input.contractSum = -100;

      const result = validateContractSetup(input);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'contractSum')).toBe(true);
    });

    it('returns error when contractSum exceeds maximum', () => {
      const input = makeValidJbccInput();
      input.contractSum = 1_000_000_000_000; // above 999,999,999,999.99

      const result = validateContractSetup(input);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'contractSum')).toBe(true);
    });
  });

  // ─── validateContractSetup — JBCC params out of range ───────────────────

  describe('validateContractSetup — JBCC params out of range', () => {
    it('returns errors for all invalid JBCC params', () => {
      const input = makeValidJbccInput();
      input.formSpecificParams = {
        interimPaymentPeriodDays: 0,
        penaltyRatePerDay: 0,
        retentionPercentage: 15,
        defectsLiabilityMonths: 25,
      } as JbccParams;

      const result = validateContractSetup(input);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'formSpecificParams.interimPaymentPeriodDays')).toBe(true);
      expect(result.errors.some((e) => e.field === 'formSpecificParams.penaltyRatePerDay')).toBe(true);
      expect(result.errors.some((e) => e.field === 'formSpecificParams.retentionPercentage')).toBe(true);
      expect(result.errors.some((e) => e.field === 'formSpecificParams.defectsLiabilityMonths')).toBe(true);
    });
  });

  // ─── validateContractSetup — NEC params out of range ────────────────────

  describe('validateContractSetup — NEC params out of range', () => {
    it('returns errors for all invalid NEC params', () => {
      const input = makeValidNecInput();
      input.formSpecificParams = {
        earlyWarningWeeks: 0,
        compensationEventNotificationWeeks: 13,
        programmeSubmissionIntervalWeeks: 9,
      } as NecParams;

      const result = validateContractSetup(input);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'formSpecificParams.earlyWarningWeeks')).toBe(true);
      expect(result.errors.some((e) => e.field === 'formSpecificParams.compensationEventNotificationWeeks')).toBe(true);
      expect(result.errors.some((e) => e.field === 'formSpecificParams.programmeSubmissionIntervalWeeks')).toBe(true);
    });
  });

  // ─── validateContractSetup — GCC params out of range ────────────────────

  describe('validateContractSetup — GCC params out of range', () => {
    it('returns errors for all invalid GCC params', () => {
      const input = makeValidGccInput();
      input.formSpecificParams = {
        advanceWarningWorkingDays: 0,
        penaltyRatePerDay: 0,
        firstStageClaimWorkingDays: 4,
        secondStageClaimWorkingDays: 61,
        deemedRejectionWorkingDays: 0,
      } as GccParams;

      const result = validateContractSetup(input);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'formSpecificParams.advanceWarningWorkingDays')).toBe(true);
      expect(result.errors.some((e) => e.field === 'formSpecificParams.penaltyRatePerDay')).toBe(true);
      expect(result.errors.some((e) => e.field === 'formSpecificParams.firstStageClaimWorkingDays')).toBe(true);
      expect(result.errors.some((e) => e.field === 'formSpecificParams.secondStageClaimWorkingDays')).toBe(true);
      expect(result.errors.some((e) => e.field === 'formSpecificParams.deemedRejectionWorkingDays')).toBe(true);
    });
  });

  // ─── validateContractSetup — FIDIC params out of range ──────────────────

  describe('validateContractSetup — FIDIC params out of range', () => {
    it('returns errors for all invalid FIDIC params', () => {
      const input = makeValidFidicInput();
      input.formSpecificParams = {
        timeForCompletionDays: 0,
        defectsNotificationDays: 100,
        dabComposition: 2 as any,
      } as FidicParams;

      const result = validateContractSetup(input);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'formSpecificParams.timeForCompletionDays')).toBe(true);
      expect(result.errors.some((e) => e.field === 'formSpecificParams.defectsNotificationDays')).toBe(true);
      expect(result.errors.some((e) => e.field === 'formSpecificParams.dabComposition')).toBe(true);
    });
  });

  // ─── validateContractSetup — Multiple invalid fields ────────────────────

  describe('validateContractSetup — multiple invalid fields returns all errors at once', () => {
    it('returns all errors when multiple fields are invalid simultaneously', () => {
      const input: ContractSetupInput = {
        projectId: '',
        contractForm: 'jbcc_pba',
        parties: [{ id: 'p1', name: 'Agent', role: 'principal_agent' }],
        commencementDate: '2025-06-01',
        practicalCompletionDate: '2025-01-01',
        contractSum: -1,
        clauseElections: [],
        formSpecificParams: {
          interimPaymentPeriodDays: -5,
          penaltyRatePerDay: 0,
          retentionPercentage: 20,
          defectsLiabilityMonths: 0,
        } as JbccParams,
        setupBy: '',
      };

      const result = validateContractSetup(input);
      expect(result.valid).toBe(false);

      // Should have errors for: projectId, parties (min 2), parties (employer),
      // parties (contractor), practicalCompletionDate, contractSum, setupBy,
      // and form-specific params
      expect(result.errors.length).toBeGreaterThanOrEqual(7);

      const fields = result.errors.map((e) => e.field);
      expect(fields).toContain('projectId');
      expect(fields).toContain('parties');
      expect(fields).toContain('practicalCompletionDate');
      expect(fields).toContain('contractSum');
      expect(fields).toContain('setupBy');
      expect(fields.some((f) => f.startsWith('formSpecificParams.'))).toBe(true);
    });
  });

  // ─── setupContract — successful persistence ─────────────────────────────

  describe('setupContract — Firestore persistence', () => {
    it('persists contract config and audit record for valid JBCC setup', async () => {
      const input = makeValidJbccInput();
      const projectAssignment = {
        projectId: 'proj-001',
        userId: 'user-001',
        roles: ['architect' as const],
        isAssignedTeamMember: true,
        isAssignedContractor: false,
        isAssignedSubcontractor: false,
        isProjectOwner: false,
        isAssignedSiteManager: false,
      };

      const result = await setupContract(input, projectAssignment);

      expect(result.contractId).toContain('contract_proj-001_');
      expect(result.status).toBe('active');
      expect(result.auditRecordId).toBeDefined();

      // Verify Firestore set was called (config + audit)
      expect(mockSet).toHaveBeenCalled();

      // Verify audit record shape
      expect(result.auditRecord.entityType).toBe('contract');
      expect(result.auditRecord.action).toBe('contract_setup');
      expect(result.auditRecord.actorId).toBe('user-001');

      // Verify passport update shape
      expect(result.passportUpdate.contractStatus).toBe('active');
      expect(result.passportUpdate.keyDates.commencementDate).toBe('2025-01-15');
      expect(result.passportUpdate.keyDates.practicalCompletionDate).toBe('2026-01-15');

      // Verify action centre event shape
      expect(result.actionCentreEvent.projectId).toBe('proj-001');
      expect(result.actionCentreEvent.entityType).toBe('contract');
    });

    it('throws VALIDATION_ERROR for invalid input', async () => {
      const input = makeValidJbccInput();
      input.projectId = '';

      const projectAssignment = {
        projectId: 'proj-001',
        userId: 'user-001',
        roles: ['architect' as const],
        isAssignedTeamMember: true,
        isAssignedContractor: false,
        isAssignedSubcontractor: false,
        isProjectOwner: false,
        isAssignedSiteManager: false,
      };

      await expect(setupContract(input, projectAssignment)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('validation failed'),
      });
    });
  });
});
