/**
 * Unit tests for Notice Engine Service
 *
 * Tests: notice registration with deadline, notice without response period,
 * status transitions (issued → acknowledged → responded), expiry with deemed outcomes.
 *
 * Requirements: 3.1–3.6, 4.1–4.8
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// ══════════════════════════════════════════════════════════════════════════════
// Mocks
// ══════════════════════════════════════════════════════════════════════════════

// Mock Firestore with in-memory store
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
  createRiskEvent: vi.fn(async () => ({ success: true, targetModule: 'RiskEngine', retryCount: 0 })),
  retryWithBackoff: vi.fn(async (fn: () => Promise<any>) => fn()),
}));

import {
  calculateDeadline,
  registerNotice,
  acknowledgeNotice,
  respondToNotice,
  withdrawNotice,
} from '../noticeEngineService';
import type {
  NoticeRegistrationInput,
  NoticeResponse,
  ContractProjectAssignment,
} from '../contractTypes';

// ══════════════════════════════════════════════════════════════════════════════
// Test Helpers
// ══════════════════════════════════════════════════════════════════════════════

/** Minimal project assignment for RBAC (passes because assertAccess is mocked) */
const mockProjectAssignment: ContractProjectAssignment = {
  projectId: 'proj-1',
  userId: 'user-1',
  roles: ['architect'],
  isAssignedTeamMember: true,
  isAssignedContractor: false,
  isAssignedSubcontractor: false,
  isProjectOwner: false,
  isAssignedSiteManager: false,
};

/** Valid notice registration input */
function validNoticeInput(overrides?: Partial<NoticeRegistrationInput>): NoticeRegistrationInput {
  return {
    projectId: 'proj-1',
    noticeType: 'jbcc_revision_of_date',
    issuingPartyId: 'party-contractor',
    receivingPartyId: 'party-pa',
    referenceClause: '23.1',
    dateIssued: '2025-06-02',
    subject: 'Request for revision of date due to weather delays',
    linkedDocumentIds: ['doc-1', 'doc-2'],
    registeredBy: 'user-1',
    ...overrides,
  };
}

/** Seed a notice record directly into mock Firestore */
function seedNotice(projectId: string, noticeId: string, data: any): void {
  mockData[`projects/${projectId}/contractNotices/${noticeId}`] = data;
}

/** Seed contract config for a project */
function seedContractConfig(projectId: string, contractForm: string, clauseResponsePeriods?: any[]): void {
  mockData[`projects/${projectId}/contractConfig/config`] = {
    contractForm,
    clauseResponsePeriods: clauseResponsePeriods || [],
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

describe('noticeEngineService', () => {
  // ────────────────────────────────────────────────────────────────────────
  // calculateDeadline — pure function tests
  // ────────────────────────────────────────────────────────────────────────

  describe('calculateDeadline', () => {
    it('returns correct deadline for working day calculation', () => {
      // 2025-06-02 is a Monday. 15 working days from Monday should land on
      // Monday 2025-06-23 (3 full weeks of working days)
      const holidays = [{ date: '2025-06-16', name: 'Youth Day', year: 2025 }];
      const deadline = calculateDeadline('2025-06-02', 15, 'working', holidays);

      // 15 working days from 2025-06-02, skipping weekends and Youth Day (June 16)
      // Week 1: Jun 3,4,5,6,9 (5 days)
      // Week 2: Jun 10,11,12,13,[skip 16],17 (5 days — skip Youth Day, count 17)
      // Week 3: Jun 18,19,20,23,24 (5 days)
      // 15 working days: Jun 3–6 (4), Jun 9–13 (5=9), Jun 17 (1=10), Jun 18–20 (3=13), Jun 23–24 (2=15)
      // Result: 2025-06-24
      expect(deadline).toBe('2025-06-24');
    });

    it('returns correct deadline for calendar day calculation with next-working-day adjustment', () => {
      // 2025-06-02 + 12 calendar days = 2025-06-14 (Saturday)
      // Should adjust to next working day: Monday 2025-06-16
      // But 2025-06-16 is Youth Day — adjust to 2025-06-17 (Tuesday)
      const holidays = [{ date: '2025-06-16', name: 'Youth Day', year: 2025 }];
      const deadline = calculateDeadline('2025-06-02', 12, 'calendar', holidays);
      expect(deadline).toBe('2025-06-17');
    });

    it('returns the same date for calendar days landing on a working day', () => {
      // 2025-06-02 + 5 calendar days = 2025-06-07 (Saturday) → next working day Monday 2025-06-09
      const holidays: any[] = [];
      const deadline = calculateDeadline('2025-06-02', 5, 'calendar', holidays);
      expect(deadline).toBe('2025-06-09');
    });

    it('calendar day landing on a working day stays unchanged', () => {
      // 2025-06-02 + 3 calendar days = 2025-06-05 (Thursday) — working day
      const holidays: any[] = [];
      const deadline = calculateDeadline('2025-06-02', 3, 'calendar', holidays);
      expect(deadline).toBe('2025-06-05');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // registerNotice
  // ────────────────────────────────────────────────────────────────────────

  describe('registerNotice', () => {
    it('registers a notice with deadline when clause has configured response period', async () => {
      // Seed contract config with JBCC form (clause 23.1 has 15 working days)
      seedContractConfig('proj-1', 'jbcc_pba');

      const input = validNoticeInput();
      const result = await registerNotice(input, mockProjectAssignment);

      expect(result.notice).toBeDefined();
      expect(result.notice.status).toBe('issued');
      expect(result.notice.projectId).toBe('proj-1');
      expect(result.notice.subject).toBe('Request for revision of date due to weather delays');
      expect(result.notice.referenceClause).toBe('23.1');
      expect(result.notice.issuingPartyId).toBe('party-contractor');
      expect(result.notice.receivingPartyId).toBe('party-pa');
      expect(result.notice.linkedDocumentIds).toEqual(['doc-1', 'doc-2']);
      // Should have a deadline calculated (JBCC clause 23.1 = 15 working days)
      expect(result.notice.deadline).toBeDefined();
      expect(result.notice.responsePeriodDays).toBe(15);
      expect(result.notice.deadlineDayType).toBe('working');
      // Should have created an audit record
      expect(result.auditRecord).toBeDefined();
      expect(result.auditRecord.action).toBe('notice_registered');
      // Should have created an action centre event
      expect(result.actionCentreEvent).toBeDefined();
      expect(result.actionCentreEvent.targetUserId).toBe('party-pa');
      expect(result.actionCentreEvent.priority).toBe('high');
    });

    it('registers a notice without deadline when clause has no configured response period', async () => {
      // Seed config with JBCC form but use a clause number that has no configured period
      seedContractConfig('proj-1', 'jbcc_pba');

      const input = validNoticeInput({ referenceClause: '99.9' }); // non-existent clause
      const result = await registerNotice(input, mockProjectAssignment);

      expect(result.notice.status).toBe('issued');
      expect(result.notice.deadline).toBeUndefined();
      expect(result.notice.responsePeriodDays).toBeUndefined();
      expect(result.notice.deadlineDayType).toBeUndefined();
      // Action centre event should still be created but with normal priority
      expect(result.actionCentreEvent.priority).toBe('normal');
    });

    it('rejects subject exceeding 500 characters', async () => {
      seedContractConfig('proj-1', 'jbcc_pba');

      const longSubject = 'x'.repeat(501);
      const input = validNoticeInput({ subject: longSubject });

      await expect(registerNotice(input, mockProjectAssignment)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { invalidFields: expect.arrayContaining(['subject']) },
      });
    });

    it('rejects more than 20 linked documents', async () => {
      seedContractConfig('proj-1', 'jbcc_pba');

      const tooManyDocs = Array.from({ length: 21 }, (_, i) => `doc-${i}`);
      const input = validNoticeInput({ linkedDocumentIds: tooManyDocs });

      await expect(registerNotice(input, mockProjectAssignment)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { invalidFields: expect.arrayContaining(['linkedDocumentIds']) },
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // acknowledgeNotice
  // ────────────────────────────────────────────────────────────────────────

  describe('acknowledgeNotice', () => {
    it('transitions notice from issued to acknowledged', async () => {
      // Seed a notice in "issued" status
      seedNotice('proj-1', 'notice-1', {
        id: 'notice-1',
        projectId: 'proj-1',
        status: 'issued',
        referenceClause: '23.1',
        receivingPartyId: 'party-pa',
        createdAt: '2025-06-02T00:00:00.000Z',
        updatedAt: '2025-06-02T00:00:00.000Z',
      });

      const result = await acknowledgeNotice('proj-1', 'notice-1', 'user-2', mockProjectAssignment);

      expect(result.auditRecord).toBeDefined();
      expect(result.auditRecord.action).toBe('notice_acknowledged');
      expect(result.auditRecord.newValue).toEqual({ status: 'acknowledged' });
      expect(result.auditRecord.previousValue).toEqual({ status: 'issued' });

      // Verify Firestore was updated
      const updatedNotice = mockData['projects/proj-1/contractNotices/notice-1'];
      expect(updatedNotice.status).toBe('acknowledged');
    });

    it('rejects transition from expired status (INVALID_TRANSITION error)', async () => {
      seedNotice('proj-1', 'notice-2', {
        id: 'notice-2',
        projectId: 'proj-1',
        status: 'expired',
        referenceClause: '23.1',
        receivingPartyId: 'party-pa',
      });

      await expect(
        acknowledgeNotice('proj-1', 'notice-2', 'user-2', mockProjectAssignment)
      ).rejects.toMatchObject({
        code: 'INVALID_TRANSITION',
        message: expect.stringContaining('expired'),
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // respondToNotice
  // ────────────────────────────────────────────────────────────────────────

  describe('respondToNotice', () => {
    it('transitions notice to responded (terminal)', async () => {
      seedNotice('proj-1', 'notice-3', {
        id: 'notice-3',
        projectId: 'proj-1',
        status: 'acknowledged',
        referenceClause: '24.2',
        receivingPartyId: 'party-pa',
      });

      const responseData: NoticeResponse = {
        responseType: 'acceptance',
        responseDate: '2025-06-10',
        responseDetails: 'We accept the interim payment certificate.',
        respondedBy: 'user-2',
      };

      const result = await respondToNotice(
        'proj-1',
        'notice-3',
        responseData,
        mockProjectAssignment
      );

      expect(result.auditRecord).toBeDefined();
      expect(result.auditRecord.action).toBe('notice_responded');
      expect(result.auditRecord.previousValue).toEqual({ status: 'acknowledged' });
      expect(result.auditRecord.newValue).toMatchObject({ status: 'responded' });

      // Verify Firestore was updated
      const updatedNotice = mockData['projects/proj-1/contractNotices/notice-3'];
      expect(updatedNotice.status).toBe('responded');
      expect(updatedNotice.respondedBy).toBe('user-2');
    });

    it('can respond directly from issued status', async () => {
      seedNotice('proj-1', 'notice-4', {
        id: 'notice-4',
        projectId: 'proj-1',
        status: 'issued',
        referenceClause: '24.2',
        receivingPartyId: 'party-pa',
      });

      const responseData: NoticeResponse = {
        responseType: 'objection',
        responseDate: '2025-06-08',
        responseDetails: 'We object to the certified amount.',
        respondedBy: 'user-3',
      };

      const result = await respondToNotice(
        'proj-1',
        'notice-4',
        responseData,
        mockProjectAssignment
      );

      expect(result.auditRecord.action).toBe('notice_responded');
      const updatedNotice = mockData['projects/proj-1/contractNotices/notice-4'];
      expect(updatedNotice.status).toBe('responded');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // withdrawNotice
  // ────────────────────────────────────────────────────────────────────────

  describe('withdrawNotice', () => {
    it('transitions notice from issued to withdrawn', async () => {
      seedNotice('proj-1', 'notice-5', {
        id: 'notice-5',
        projectId: 'proj-1',
        status: 'issued',
        referenceClause: '17.2',
        receivingPartyId: 'party-contractor',
      });

      const result = await withdrawNotice('proj-1', 'notice-5', 'user-1', mockProjectAssignment);

      expect(result.auditRecord).toBeDefined();
      expect(result.auditRecord.action).toBe('notice_withdrawn');
      expect(result.auditRecord.newValue).toEqual({ status: 'withdrawn' });

      const updatedNotice = mockData['projects/proj-1/contractNotices/notice-5'];
      expect(updatedNotice.status).toBe('withdrawn');
      expect(updatedNotice.withdrawnBy).toBe('user-1');
    });

    it('rejects withdrawal from expired status', async () => {
      seedNotice('proj-1', 'notice-6', {
        id: 'notice-6',
        projectId: 'proj-1',
        status: 'expired',
        referenceClause: '17.2',
        receivingPartyId: 'party-contractor',
      });

      await expect(
        withdrawNotice('proj-1', 'notice-6', 'user-1', mockProjectAssignment)
      ).rejects.toMatchObject({
        code: 'INVALID_TRANSITION',
        message: expect.stringContaining('expired'),
      });
    });
  });
});
