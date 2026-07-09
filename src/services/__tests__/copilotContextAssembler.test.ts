/**
 * Unit tests for the Copilot Context Assembler
 *
 * Tests: assembleContext, invalidateContext, token budget management,
 * timeout handling, partial context assembly, and cache behavior.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  assembleContext,
  invalidateContext,
  clearContextCache,
  withTimeout,
  estimateChars,
  applyTokenBudget,
  cacheKey,
  MAX_CONTEXT_CHARS,
  type ContextDataSources,
} from '../copilotContextAssembler';

// ─── Test Helpers ──────────────────────────────────────────────────────────

function createMockDataSources(overrides?: Partial<ContextDataSources>): ContextDataSources {
  return {
    fetchPassport: vi.fn().mockResolvedValue({
      projectName: 'Sandton Tower Phase 2',
      currentPhase: 'design_development',
      riskLevel: 'medium',
      leadProfessional: 'John Architect',
      keyDates: [
        { label: 'Municipal Submission', date: '2026-08-15' },
        { label: 'Tender Close', date: '2026-09-30' },
      ],
      teamMembers: [
        { name: 'John Architect', role: 'architect' },
        { name: 'Sarah Engineer', role: 'engineer' },
      ],
    }),
    fetchDocuments: vi.fn().mockResolvedValue([
      { id: 'doc-1', title: 'Technical Drawings Rev B', status: 'issued', type: 'drawing', updatedAt: '2026-07-01T10:00:00Z' },
      { id: 'doc-2', title: 'Tender Pack', status: 'draft', type: 'tender_pack', updatedAt: '2026-07-10T12:00:00Z' },
      { id: 'doc-3', title: 'Site Plan', status: 'pending_review', type: 'drawing', updatedAt: '2026-07-05T08:00:00Z' },
    ]),
    fetchPendingActions: vi.fn().mockResolvedValue([
      { id: 'action-1', title: 'Review Site Plan', priority: 'high', dueDate: '2026-07-20', type: 'approval_required' },
      { id: 'action-2', title: 'Approve Payment Cert #3', priority: 'medium', dueDate: null, type: 'payment_review' },
    ]),
    fetchAuditTrail: vi.fn().mockResolvedValue([
      { action: 'document_uploaded', actor: 'John Architect', timestamp: '2026-07-10T12:00:00Z', detail: 'Uploaded Tender Pack v1' },
      { action: 'phase_changed', actor: 'System', timestamp: '2026-07-08T09:00:00Z', detail: 'Moved to Design Development' },
    ]),
    fetchUserContext: vi.fn().mockResolvedValue({
      role: 'architect',
      projectAccessRole: 'lead_bep',
      displayName: 'John Architect',
    }),
    checkReadPermission: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('copilotContextAssembler', () => {
  beforeEach(() => {
    clearContextCache();
    vi.clearAllMocks();
  });

  describe('assembleContext — happy path', () => {
    it('assembles full context from all data sources', async () => {
      const ds = createMockDataSources();
      const context = await assembleContext('proj-1', 'user-1', ds);

      expect(context.passport.projectName).toBe('Sandton Tower Phase 2');
      expect(context.passport.currentPhase).toBe('design_development');
      expect(context.passport.riskLevel).toBe('medium');
      expect(context.passport.leadProfessional).toBe('John Architect');
      expect(context.passport.keyDates).toHaveLength(2);
      expect(context.passport.teamMembers).toHaveLength(2);
      expect(context.documentRegister).toHaveLength(3);
      expect(context.pendingActions).toHaveLength(2);
      expect(context.auditTrail).toHaveLength(2);
      expect(context.userContext.role).toBe('architect');
      expect(context.userContext.projectAccessRole).toBe('lead_bep');
      expect(context.userContext.displayName).toBe('John Architect');
      expect(context.unavailableSources).toEqual([]);
    });

    it('requests 20 most recent audit trail entries', async () => {
      const ds = createMockDataSources();
      await assembleContext('proj-1', 'user-1', ds);

      expect(ds.fetchAuditTrail).toHaveBeenCalledWith('proj-1', 20);
    });

    it('reads inbox actions for the specific user', async () => {
      const ds = createMockDataSources();
      await assembleContext('proj-1', 'user-1', ds);

      expect(ds.fetchPendingActions).toHaveBeenCalledWith('proj-1', 'user-1');
    });
  });

  describe('assembleContext — permission enforcement', () => {
    it('throws when user does not have read permission', async () => {
      const ds = createMockDataSources({
        checkReadPermission: vi.fn().mockResolvedValue(false),
      });

      await expect(assembleContext('proj-1', 'user-1', ds))
        .rejects.toThrow('Permission denied: user cannot read this project');
    });

    it('checks permissions before reading any data sources', async () => {
      const fetchPassport = vi.fn();
      const ds = createMockDataSources({
        checkReadPermission: vi.fn().mockResolvedValue(false),
        fetchPassport,
      });

      await expect(assembleContext('proj-1', 'user-1', ds)).rejects.toThrow();
      // Passport should not be called if permission is denied
      expect(fetchPassport).not.toHaveBeenCalled();
    });
  });

  describe('assembleContext — partial context (timeout/error handling)', () => {
    it('flags passport as unavailable on error and uses defaults', async () => {
      const ds = createMockDataSources({
        fetchPassport: vi.fn().mockRejectedValue(new Error('Timeout exceeded')),
      });

      const context = await assembleContext('proj-1', 'user-1', ds);

      expect(context.unavailableSources).toContain('passport');
      expect(context.passport.projectName).toBe('');
      expect(context.passport.currentPhase).toBe('onboarding');
    });

    it('flags document register as unavailable on error', async () => {
      const ds = createMockDataSources({
        fetchDocuments: vi.fn().mockRejectedValue(new Error('Firestore unavailable')),
      });

      const context = await assembleContext('proj-1', 'user-1', ds);

      expect(context.unavailableSources).toContain('documentRegister');
      expect(context.documentRegister).toEqual([]);
    });

    it('flags inbox as unavailable on error', async () => {
      const ds = createMockDataSources({
        fetchPendingActions: vi.fn().mockRejectedValue(new Error('Connection timeout')),
      });

      const context = await assembleContext('proj-1', 'user-1', ds);

      expect(context.unavailableSources).toContain('pendingActions');
      expect(context.pendingActions).toEqual([]);
    });

    it('flags audit trail as unavailable on error', async () => {
      const ds = createMockDataSources({
        fetchAuditTrail: vi.fn().mockRejectedValue(new Error('Permission denied')),
      });

      const context = await assembleContext('proj-1', 'user-1', ds);

      expect(context.unavailableSources).toContain('auditTrail');
      expect(context.auditTrail).toEqual([]);
    });

    it('proceeds with available data when multiple sources fail', async () => {
      const ds = createMockDataSources({
        fetchPassport: vi.fn().mockRejectedValue(new Error('fail')),
        fetchAuditTrail: vi.fn().mockRejectedValue(new Error('fail')),
      });

      const context = await assembleContext('proj-1', 'user-1', ds);

      expect(context.unavailableSources).toContain('passport');
      expect(context.unavailableSources).toContain('auditTrail');
      expect(context.documentRegister).toHaveLength(3);
      expect(context.pendingActions).toHaveLength(2);
    });
  });

  describe('token budget management (applyTokenBudget)', () => {
    it('does not truncate when context is within budget', async () => {
      const ds = createMockDataSources();
      const context = await assembleContext('proj-1', 'user-1', ds);

      // Default mock data is well within 32k chars
      expect(context.auditTrail).toHaveLength(2);
      expect(context.documentRegister).toHaveLength(3);
      expect(context.pendingActions).toHaveLength(2);
    });

    it('truncates audit trail first when over budget (oldest entries removed)', () => {
      const largeAudit = Array.from({ length: 500 }, (_, i) => ({
        action: `action_${i}_with_extra_padding_to_increase_size_for_token_budget_testing_purposes`,
        actor: `Actor ${i} with a reasonably long name for testing token budget management`,
        timestamp: `2026-07-${String(i % 28 + 1).padStart(2, '0')}T10:00:00Z`,
        detail: `Detailed description of action ${i} that is verbose enough to push over the token budget limit`,
      }));

      const context = applyTokenBudget({
        passport: {
          projectName: 'Test Project',
          currentPhase: 'design_development',
          riskLevel: 'high',
          leadProfessional: 'Lead',
          keyDates: [],
          teamMembers: [],
        },
        documentRegister: [],
        pendingActions: [],
        auditTrail: largeAudit,
        userContext: { role: 'architect' as const, projectAccessRole: null, displayName: 'Test' },
        unavailableSources: [],
      });

      // Audit trail should be truncated
      expect(context.auditTrail.length).toBeLessThan(500);
      // Passport should be preserved
      expect(context.passport.projectName).toBe('Test Project');
    });

    it('truncates documents after audit trail if still over budget', () => {
      const largeDocs = Array.from({ length: 300 }, (_, i) => ({
        id: `doc-${i}`,
        title: `Document ${i} with an extended title for testing the token budget truncation logic`,
        status: 'draft' as const,
        type: 'drawing',
        updatedAt: `2026-07-${String(i % 28 + 1).padStart(2, '0')}T10:00:00Z`,
      }));

      const largeAudit = Array.from({ length: 300 }, (_, i) => ({
        action: `action_${i}_padded_to_ensure_exceeds_budget_limit`,
        actor: `Actor ${i}`,
        timestamp: `2026-07-${String(i % 28 + 1).padStart(2, '0')}T10:00:00Z`,
        detail: `Detail ${i} with extra padding content to overflow the budget`,
      }));

      const context = applyTokenBudget({
        passport: {
          projectName: 'Test Project',
          currentPhase: 'design_development',
          riskLevel: 'high',
          leadProfessional: 'Lead',
          keyDates: [],
          teamMembers: [],
        },
        documentRegister: largeDocs,
        pendingActions: [],
        auditTrail: largeAudit,
        userContext: { role: 'architect' as const, projectAccessRole: null, displayName: 'Test' },
        unavailableSources: [],
      });

      // Audit trail should be empty (fully truncated first)
      expect(context.auditTrail.length).toBe(0);
      // Documents should be truncated (some removed)
      expect(context.documentRegister.length).toBeLessThan(300);
      // Passport always preserved
      expect(context.passport.projectName).toBe('Test Project');
    });

    it('never truncates the passport section', () => {
      const result = applyTokenBudget({
        passport: {
          projectName: 'A'.repeat(1000),
          currentPhase: 'construction_execution',
          riskLevel: 'critical',
          leadProfessional: 'B'.repeat(200),
          keyDates: Array.from({ length: 50 }, (_, i) => ({ label: `Date ${i}`, date: '2026-01-01' })),
          teamMembers: Array.from({ length: 50 }, (_, i) => ({ name: `Member ${i}`, role: 'architect' })),
        },
        documentRegister: [],
        pendingActions: [],
        auditTrail: [],
        userContext: { role: 'architect' as const, projectAccessRole: null, displayName: 'Test' },
        unavailableSources: [],
      });

      expect(result.passport.projectName).toHaveLength(1000);
      expect(result.passport.keyDates).toHaveLength(50);
      expect(result.passport.teamMembers).toHaveLength(50);
    });
  });

  describe('cache behavior', () => {
    it('returns cached context on subsequent calls', async () => {
      const ds = createMockDataSources();
      const first = await assembleContext('proj-1', 'user-1', ds);
      const second = await assembleContext('proj-1', 'user-1', ds);

      expect(first).toBe(second); // Same object reference (cached)
      expect(ds.fetchPassport).toHaveBeenCalledTimes(1);
    });

    it('caches per user-project combination', async () => {
      const ds = createMockDataSources();
      await assembleContext('proj-1', 'user-1', ds);
      await assembleContext('proj-1', 'user-2', ds);

      expect(ds.fetchPassport).toHaveBeenCalledTimes(2);
    });

    it('invalidateContext clears cache for all users of a project', async () => {
      const ds = createMockDataSources();
      await assembleContext('proj-1', 'user-1', ds);
      await assembleContext('proj-1', 'user-2', ds);

      invalidateContext('proj-1');

      await assembleContext('proj-1', 'user-1', ds);
      expect(ds.fetchPassport).toHaveBeenCalledTimes(3);
    });

    it('does not invalidate cache for other projects', async () => {
      const ds = createMockDataSources();
      await assembleContext('proj-1', 'user-1', ds);
      await assembleContext('proj-2', 'user-1', ds);

      invalidateContext('proj-1');

      // proj-2 should still be cached
      await assembleContext('proj-2', 'user-1', ds);
      expect(ds.fetchPassport).toHaveBeenCalledTimes(2);
    });
  });

  describe('helper functions', () => {
    it('withTimeout resolves with result when under timeout', async () => {
      const result = await withTimeout(Promise.resolve('hello'), 1000);
      expect(result).toBe('hello');
    });

    it('withTimeout resolves with null on rejection', async () => {
      const result = await withTimeout(Promise.reject(new Error('fail')), 1000);
      expect(result).toBeNull();
    });

    it('estimateChars returns JSON string length', () => {
      const data = { key: 'value', num: 42 };
      expect(estimateChars(data)).toBe(JSON.stringify(data).length);
    });

    it('cacheKey combines project and user IDs', () => {
      expect(cacheKey('proj-1', 'user-1')).toBe('proj-1::user-1');
    });
  });
});
