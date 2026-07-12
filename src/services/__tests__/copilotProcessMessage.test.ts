/**
 * Unit tests for processMessage() orchestration logic in copilotService.ts
 *
 * Tests the full message processing pipeline:
 * rate limit → validate prompt → validate capability → context → AI call →
 * guardrails → provenance → persist → respond
 *
 * Validates: Requirements 3.5, 4.2, 12.1, 12.4, 12.8
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock firebase-admin (must be before service imports) ──────────────────

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        id: 'mock-provenance-id',
        set: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ messageCount: 0 }) }),
        update: vi.fn().mockResolvedValue(undefined),
      })),
    })),
    doc: vi.fn(() => ({
      get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ messageCount: 0 }) }),
      set: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    })),
  },
}));

// Mock geminiService (to avoid network calls)
vi.mock('@/services/geminiService', () => ({
  callGeminiProxy: vi.fn().mockResolvedValue('Default mocked AI response'),
}));

import { processMessage, type ProcessMessageParams } from '@/services/copilotService';
import { resetRateLimit, recordRequest } from '@/services/copilotRateLimiter';
import type { ContextDataSources } from '@/services/copilotContextAssembler';
import type { CopilotMessage } from '@/services/copilotTypes';

// ─── Test Helpers ──────────────────────────────────────────────────────────

function createMockDataSources(): ContextDataSources {
  return {
    fetchPassport: async () => ({
      projectName: 'Test Project',
      currentPhase: 'design' as const,
      riskLevel: 'medium' as const,
      leadProfessional: 'John Smith',
      keyDates: [{ label: 'Deadline', date: '2025-06-01' }],
      teamMembers: [{ name: 'John Smith', role: 'architect' }],
    }),
    fetchDocuments: async () => [],
    fetchPendingActions: async () => [],
    fetchAuditTrail: async () => [],
    fetchUserContext: async () => ({
      role: 'architect' as const,
      projectAccessRole: null,
      displayName: 'Test User',
    }),
    checkReadPermission: async () => true,
  };
}

const persistedMessages: CopilotMessage[] = [];
async function mockPersist(message: CopilotMessage): Promise<void> {
  persistedMessages.push(message);
}

function baseParams(overrides?: Partial<ProcessMessageParams>): ProcessMessageParams {
  return {
    userId: 'user-123',
    projectId: 'proj-456',
    threadId: 'thread-789',
    prompt: 'What is the project status?',
    capability: 'summarise_status',
    role: 'architect',
    dataSources: createMockDataSources(),
    callAI: async () => 'Here is your project status summary. Everything is on track.',
    persistMessage: mockPersist,
    ...overrides,
  };
}

// ─── Test Suite ────────────────────────────────────────────────────────────

describe('processMessage', () => {
  beforeEach(() => {
    resetRateLimit('user-123');
    persistedMessages.length = 0;
  });

  describe('rate limiting', () => {
    it('returns rate_limited error when limit is exceeded', async () => {
      // Fill up the rate limit (60 requests)
      for (let i = 0; i < 60; i++) {
        recordRequest('user-123');
      }

      const result = await processMessage(baseParams());

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('rate_limited');
      expect(result.error!.retryAfterMinutes).toBeGreaterThan(0);
      expect(result.provenanceId).toBe('');
    });

    it('allows requests within the rate limit', async () => {
      const result = await processMessage(baseParams());

      expect(result.error).toBeUndefined();
      expect(result.message.role).toBe('assistant');
    });
  });

  describe('prompt validation', () => {
    it('returns validation_error for too-short prompt', async () => {
      const result = await processMessage(baseParams({ prompt: 'hi' }));

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('validation_error');
    });

    it('returns validation_error for whitespace-only prompt', async () => {
      const result = await processMessage(baseParams({ prompt: '     ' }));

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('validation_error');
    });

    it('returns validation_error for prompt exceeding 4000 chars', async () => {
      const result = await processMessage(baseParams({ prompt: 'x'.repeat(4001) }));

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('validation_error');
    });

    it('accepts a valid prompt', async () => {
      const result = await processMessage(baseParams({ prompt: 'What is the current project phase?' }));

      expect(result.error).toBeUndefined();
      expect(result.message.content).toContain('project status');
    });
  });

  describe('capability validation', () => {
    it('returns capability_denied for platform_admin-only users', async () => {
      const result = await processMessage(baseParams({ role: 'platform_admin' }));

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('capability_denied');
      expect(result.error!.message).toContain('professional role');
    });

    it('returns capability_denied for unrecognized capability', async () => {
      const result = await processMessage(baseParams({ capability: 'nonexistent_capability' }));

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('capability_denied');
      expect(result.error!.message).toContain('unrecognized');
    });

    it('returns capability_denied when role lacks access to scoped capability', async () => {
      // client role does NOT have draft_rfi access
      const result = await processMessage(baseParams({ role: 'client', capability: 'draft_rfi' }));

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('capability_denied');
      expect(result.error!.message).toContain('not available for your role');
    });

    it('allows universal capabilities for any professional role', async () => {
      const result = await processMessage(baseParams({ role: 'client', capability: 'explain_clause' }));

      expect(result.error).toBeUndefined();
      expect(result.message.role).toBe('assistant');
    });
  });

  describe('AI service call', () => {
    it('assembles the system prompt from the injected project data sources', async () => {
      const getProjectPassport = vi.fn().mockResolvedValue({
        projectId: 'proj-456',
        projectName: 'Injected Project Context',
      });
      const dataSources: ContextDataSources = {
        getProjectPassport,
        getDocumentRegister: async () => [],
        getPendingInboxActions: async () => [],
        getRecentAuditTrail: async () => [],
        getUserContext: async () => ({ uid: 'user-123', role: 'architect', displayName: 'Test User' }),
        getProjectAccessContext: async () => ({ projectId: 'proj-456', leadProfessionalId: 'user-123' }),
      };
      const callAI = vi.fn().mockResolvedValue('Context-aware response');

      await processMessage(baseParams({ dataSources, callAI }));

      expect(getProjectPassport).toHaveBeenCalledWith('proj-456');
      expect(callAI.mock.calls[0][0]).toContain('Injected Project Context');
    });

    it('returns service_unavailable when AI call throws', async () => {
      const result = await processMessage(
        baseParams({
          callAI: async () => { throw new Error('Network error'); },
        })
      );

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('service_unavailable');
    });

    it('returns service_unavailable when AI returns empty string', async () => {
      const result = await processMessage(
        baseParams({
          callAI: async () => '',
        })
      );

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('service_unavailable');
    });
  });

  describe('guardrails', () => {
    it('applies disclaimer to the response', async () => {
      const result = await processMessage(baseParams());

      expect(result.message.content).toContain('AI-generated content. Review before professional use.');
    });

    it('truncates long responses and sets truncated flag', async () => {
      const longResponse = 'A'.repeat(9000);
      const result = await processMessage(
        baseParams({ callAI: async () => longResponse })
      );

      expect(result.message.truncated).toBe(true);
      expect(result.message.content.length).toBeLessThanOrEqual(10_000);
    });

    it('returns content_policy error for harmful content', async () => {
      // The guardrail filter detects profanity patterns
      const result = await processMessage(
        baseParams({ callAI: async () => 'This response contains fuck and shit words' })
      );

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('content_policy');
    });
  });

  describe('successful response', () => {
    it('returns a complete CopilotResponse envelope', async () => {
      const result = await processMessage(baseParams());

      expect(result.error).toBeUndefined();
      expect(result.message.id).toBeTruthy();
      expect(result.message.threadId).toBe('thread-789');
      expect(result.message.role).toBe('assistant');
      expect(result.message.content).toBeTruthy();
      expect(result.message.timestamp).toBeTruthy();
      expect(result.message.capability).toBe('summarise_status');
    });

    it('persists the assistant message', async () => {
      await processMessage(baseParams());

      expect(persistedMessages.length).toBe(1);
      expect(persistedMessages[0].role).toBe('assistant');
      expect(persistedMessages[0].threadId).toBe('thread-789');
    });

    it('message content does not exceed 10,000 characters', async () => {
      const result = await processMessage(baseParams());

      expect(result.message.content.length).toBeLessThanOrEqual(10_000);
    });

    it('message has valid ISO 8601 timestamp', async () => {
      const result = await processMessage(baseParams());

      const parsed = new Date(result.message.timestamp);
      expect(parsed.toISOString()).toBe(result.message.timestamp);
    });

    it('records rate limit usage after successful response', async () => {
      await processMessage(baseParams());
      // After 1 successful message, the user should have 1 recorded request
      // Calling 59 more should still be allowed, then the 61st should be denied
      for (let i = 0; i < 59; i++) {
        recordRequest('user-123');
      }

      const result = await processMessage(baseParams());
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('rate_limited');
    });
  });

  describe('context assembly failure', () => {
    it('proceeds with empty context if assembly throws', async () => {
      const failingSources = createMockDataSources();
      failingSources.checkReadPermission = async () => { throw new Error('DB timeout'); };

      const result = await processMessage(baseParams({ dataSources: failingSources }));

      // Should still succeed — context assembly failure is non-blocking
      expect(result.error).toBeUndefined();
      expect(result.message.content).toBeTruthy();
    });
  });

  describe('persistence failure', () => {
    it('returns the message even if persistence fails', async () => {
      const result = await processMessage(
        baseParams({
          persistMessage: async () => { throw new Error('Firestore write failed'); },
        })
      );

      // Should still return the response
      expect(result.error).toBeUndefined();
      expect(result.message.content).toBeTruthy();
    });
  });
});
