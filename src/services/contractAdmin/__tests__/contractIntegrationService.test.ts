/**
 * Unit Tests — Contract Integration Service
 *
 * Tests successful writes to each target module (mock Firestore and platform spine),
 * retry logic with simulated failures, and failed-sync alert creation after max retries.
 *
 * Requirements: 10.1–10.10
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  PassportContractUpdate,
  ContractAuditRecord,
  ContractWorkflowEvent,
  SpecForgeChangeRecord,
  ContractDocumentMeta,
  ContractRiskEvent,
} from '../contractTypes';

// ── Mock Firestore ─────────────────────────────────────────────────────────

const mockSet = vi.fn().mockResolvedValue(undefined);
const mockUpdate = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          doc: vi.fn(() => ({
            set: mockSet,
            get: vi.fn().mockResolvedValue({ exists: false }),
            update: mockUpdate,
          })),
        })),
        set: mockSet,
        get: vi.fn().mockResolvedValue({ exists: false }),
        update: mockUpdate,
      })),
    })),
  },
}));

import {
  writeToProjectPassport,
  writeToAuditTrail,
  surfaceToActionCentre,
  writeToSpecForge,
  registerDocument,
  createRiskEvent,
  retryWithBackoff,
} from '../contractIntegrationService';

// ══════════════════════════════════════════════════════════════════════════════
// Test Fixtures
// ══════════════════════════════════════════════════════════════════════════════

function makePassportUpdate(): PassportContractUpdate {
  return {
    contractStatus: 'active',
    keyDates: {
      commencementDate: '2025-01-15',
      practicalCompletionDate: '2026-01-15',
    },
    outstandingNoticesCount: 3,
    nearestDeadlineDays: 7,
  };
}

function makeAuditRecord(): ContractAuditRecord {
  return {
    id: 'audit-001',
    projectId: 'proj-001',
    entityType: 'contract',
    entityId: 'contract-001',
    action: 'setup_completed',
    actorId: 'user-001',
    timestamp: '2025-01-15T10:00:00.000Z',
  };
}

function makeWorkflowEvent(): ContractWorkflowEvent {
  return {
    projectId: 'proj-001',
    targetUserId: 'user-002',
    priority: 'high',
    deadlineDate: '2025-02-15',
    clauseReference: '23.1',
    requiredResponseType: 'written_response',
    remainingDays: 7,
    subject: 'Notice response required',
    entityType: 'notice',
    entityId: 'notice-001',
  };
}

function makeSpecForgeChange(): SpecForgeChangeRecord {
  return {
    variationId: 'var-001',
    variationNumber: 'VO-001',
    specItemId: 'spec-item-001',
    approvalDate: '2025-02-01',
    costImpact: 150000,
  };
}

function makeDocumentMeta(): ContractDocumentMeta {
  return {
    documentType: 'variation_instruction',
    clauseReference: '25.3',
    originatingParty: 'Employer Corp',
    dateOfIssue: '2025-01-20',
    linkedVariationId: 'var-001',
  };
}

function makeRiskEvent(): ContractRiskEvent {
  return {
    entityType: 'notice',
    entityId: 'notice-001',
    severity: 'financial_penalty',
    description: 'Notice deadline missed — potential penalty exposure',
    clauseReference: '29.1',
    deadlineMissedDate: '2025-02-15',
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('ContractIntegrationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Successful Writes ──────────────────────────────────────────────────────

  describe('writeToProjectPassport', () => {
    it('successful write returns { success: true, targetModule: "ProjectPassport", retryCount: 0 }', async () => {
      mockSet.mockResolvedValue(undefined);

      const resultPromise = writeToProjectPassport('proj-001', makePassportUpdate());
      // Flush any pending timers (none expected for success)
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toEqual({
        success: true,
        targetModule: 'ProjectPassport',
        retryCount: 0,
      });
    });
  });

  describe('writeToAuditTrail', () => {
    it('successful write returns { success: true, targetModule: "AuditTrail", retryCount: 0 }', async () => {
      mockSet.mockResolvedValue(undefined);

      const resultPromise = writeToAuditTrail('proj-001', makeAuditRecord());
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toEqual({
        success: true,
        targetModule: 'AuditTrail',
        retryCount: 0,
      });
    });
  });

  describe('surfaceToActionCentre', () => {
    it('successful write returns { success: true, targetModule: "ActionCentre", retryCount: 0 }', async () => {
      mockSet.mockResolvedValue(undefined);

      const resultPromise = surfaceToActionCentre(makeWorkflowEvent());
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toEqual({
        success: true,
        targetModule: 'ActionCentre',
        retryCount: 0,
      });
    });
  });

  describe('writeToSpecForge', () => {
    it('successful write returns { success: true, targetModule: "SpecForge", retryCount: 0 }', async () => {
      mockSet.mockResolvedValue(undefined);

      const resultPromise = writeToSpecForge('proj-001', makeSpecForgeChange());
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toEqual({
        success: true,
        targetModule: 'SpecForge',
        retryCount: 0,
      });
    });
  });

  describe('registerDocument', () => {
    it('successful write returns { success: true, targetModule: "Documents", retryCount: 0 }', async () => {
      mockSet.mockResolvedValue(undefined);

      const resultPromise = registerDocument('proj-001', makeDocumentMeta());
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toEqual({
        success: true,
        targetModule: 'Documents',
        retryCount: 0,
      });
    });
  });

  describe('createRiskEvent', () => {
    it('successful write returns { success: true, targetModule: "RiskEngine", retryCount: 0 }', async () => {
      mockSet.mockResolvedValue(undefined);

      const resultPromise = createRiskEvent('proj-001', makeRiskEvent());
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toEqual({
        success: true,
        targetModule: 'RiskEngine',
        retryCount: 0,
      });
    });
  });

  // ── Retry Logic ────────────────────────────────────────────────────────────

  describe('retryWithBackoff', () => {
    it('succeeds on second attempt after first failure', async () => {
      let callCount = 0;
      const fn = vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Transient failure');
        }
        return 'success';
      });

      const resultPromise = retryWithBackoff(fn, 3, 100);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('throws after all retries exhausted', async () => {
      const fn = vi.fn(async () => {
        throw new Error('Persistent failure');
      });

      let caughtError: Error | undefined;
      const resultPromise = retryWithBackoff(fn, 3, 100).catch((err) => {
        caughtError = err;
      });

      // Use runAllTimersAsync which flushes timers and microtask queues
      await vi.runAllTimersAsync();
      await resultPromise;

      // 1 initial attempt + 3 retries = 4 total calls
      expect(fn).toHaveBeenCalledTimes(4);
      expect(caughtError).toBeDefined();
      expect(caughtError!.message).toBe('Persistent failure');
    });
  });

  // ── Failed Sync Alert ──────────────────────────────────────────────────────

  describe('writeToProjectPassport — failure with alert', () => {
    it('returns { success: false, failedSyncAlertId: string } after all retries fail', async () => {
      // Track call count to allow the alert write to succeed
      let setCallCount = 0;
      mockSet.mockImplementation(async () => {
        setCallCount++;
        // First 4 calls are the passport write attempts (1 initial + 3 retries)
        if (setCallCount <= 4) {
          throw new Error('Firestore unavailable');
        }
        // 5th call is the alert creation — let it succeed
        return undefined;
      });

      const resultPromise = writeToProjectPassport('proj-001', makePassportUpdate());

      // Advance through all retry delays
      await vi.advanceTimersByTimeAsync(5000);   // 1st retry delay
      await vi.advanceTimersByTimeAsync(10000);  // 2nd retry delay
      await vi.advanceTimersByTimeAsync(20000);  // 3rd retry delay
      await vi.advanceTimersByTimeAsync(40000);  // extra buffer

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.targetModule).toBe('ProjectPassport');
      expect(result.retryCount).toBe(3);
      expect(result.failedSyncAlertId).toBeDefined();
      expect(typeof result.failedSyncAlertId).toBe('string');
      expect(result.failedSyncAlertId).toContain('failed_sync_ProjectPassport_');
    });
  });
});
