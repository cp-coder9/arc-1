/**
 * Unit tests for explainClause() handler in copilotService.ts
 *
 * Tests:
 * - Input validation via ClauseExplanationInputSchema
 * - AI call with 15-second timeout enforcement
 * - Legal disclaimer appended to every response
 * - Copyright compliance check (max 15 consecutive words)
 * - Contextualisation with project contract when available
 * - Clarification request when clause/contract type unidentifiable
 * - Provenance record creation
 *
 * @requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase-admin
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({ id: 'mock-provenance-id', set: vi.fn().mockResolvedValue(undefined) })),
    })),
    doc: vi.fn(() => ({ get: vi.fn(), set: vi.fn(), update: vi.fn() })),
  },
}));

// Mock geminiService
vi.mock('@/services/geminiService', () => ({
  callGeminiProxy: vi.fn(),
}));

// Mock provenanceService
vi.mock('@/services/provenanceService', () => ({
  createProvenanceRecord: vi.fn().mockResolvedValue({ id: 'prov_clause_123' }),
}));

import { explainClause } from '@/services/copilotService';
import type { ClauseExplanationInput, CopilotProjectContext } from '@/services/copilotTypes';
import { createProvenanceRecord } from '@/services/provenanceService';

// ─── Test Fixtures ─────────────────────────────────────────────────────────

const mockContext: CopilotProjectContext = {
  passport: {
    projectName: 'Sandton Office Tower',
    currentPhase: 'construction',
    riskLevel: 'medium',
    leadProfessional: 'A. Botha',
    keyDates: [
      { label: 'Practical Completion', date: '2026-09-30' },
      { label: 'Final Account', date: '2026-12-15' },
    ],
    teamMembers: [
      { name: 'A. Botha', role: 'Principal Agent' },
      { name: 'M. Patel', role: 'Main Contractor' },
      { name: 'K. Dlamini', role: 'Quantity Surveyor' },
    ],
  },
  documentRegister: [
    { id: 'doc-1', title: 'JBCC Principal Building Agreement', status: 'issued', type: 'contract', updatedAt: '2026-01-15T10:00:00Z' },
  ],
  pendingActions: [],
  auditTrail: [],
  userContext: {
    role: 'architect',
    projectAccessRole: null,
    displayName: 'Anna Botha',
  },
  unavailableSources: [],
};

function generateSampleExplanation(): string {
  // Approx 200 words explanation
  return `This clause establishes the obligations of the contractor regarding the completion of works within the agreed timeframe. It applies primarily to the main contractor but has implications for the principal agent who must certify compliance.

The key obligations created by this clause include the requirement to maintain adequate progress on site, to notify the principal agent of any anticipated delays, and to provide a recovery programme if progress falls behind the agreed schedule.

In practical terms, this means the contractor must monitor their progress weekly against the programme and take proactive steps if delays are identified. The principal agent has the power to issue instructions regarding acceleration or alternative sequencing.

Related clauses that interact with this provision include the extension of time clause, which provides relief for qualifying delays, and the penalties clause which prescribes the financial consequences of late completion. The variation clause is also relevant as variations may affect the completion date.

For built environment professionals, understanding this clause is essential because it forms the basis of the time management framework within the contract and directly affects both liability and commercial outcomes.`;
}

const sampleExplanation = generateSampleExplanation();

const validInput: ClauseExplanationInput = {
  clauseText: 'The contractor shall complete the works within the period stated in the schedule.',
  contractType: 'JBCC',
};

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('explainClause', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('input validation', () => {
    it('rejects empty clause text', async () => {
      const input: ClauseExplanationInput = { clauseText: '' };

      await expect(
        explainClause('project-1', 'user-1', input, null)
      ).rejects.toThrow();
    });

    it('rejects clause text exceeding 2000 characters', async () => {
      const input: ClauseExplanationInput = { clauseText: 'x'.repeat(2001) };

      await expect(
        explainClause('project-1', 'user-1', input, null)
      ).rejects.toThrow();
    });

    it('accepts valid clause text without contract type', async () => {
      const mockAI = vi.fn().mockResolvedValue(sampleExplanation);
      vi.mocked(await import('@/services/geminiService')).callGeminiProxy = mockAI;

      // Use dynamic import to get the mock set up
      const { callGeminiProxy } = await import('@/services/geminiService');
      vi.mocked(callGeminiProxy).mockResolvedValue(sampleExplanation);

      const input: ClauseExplanationInput = {
        clauseText: 'The employer shall give possession of the site to the contractor.',
      };

      const result = await explainClause('project-1', 'user-1', input, null);
      expect(result.explanation).toBeTruthy();
    });

    it('accepts valid input with all contract types', async () => {
      const { callGeminiProxy } = await import('@/services/geminiService');
      vi.mocked(callGeminiProxy).mockResolvedValue(sampleExplanation);

      const contractTypes = ['JBCC', 'NEC', 'FIDIC', 'GCC'] as const;
      for (const contractType of contractTypes) {
        const input: ClauseExplanationInput = {
          clauseText: 'Sample clause text for testing purposes.',
          contractType,
        };
        const result = await explainClause('project-1', 'user-1', input, null);
        expect(result.explanation).toBeTruthy();
      }
    });
  });

  describe('disclaimer', () => {
    it('always includes the legal disclaimer in the output', async () => {
      const { callGeminiProxy } = await import('@/services/geminiService');
      vi.mocked(callGeminiProxy).mockResolvedValue(sampleExplanation);

      const result = await explainClause('project-1', 'user-1', validInput, null);

      expect(result.disclaimer).toBe(
        'This is AI-generated guidance and does not constitute legal advice. Consult a legal professional for binding interpretations.'
      );
    });

    it('includes disclaimer even for clarification responses', async () => {
      const { callGeminiProxy } = await import('@/services/geminiService');
      vi.mocked(callGeminiProxy).mockResolvedValue(
        'I need more information. Could you please clarify which contract type and edition this clause belongs to?'
      );

      const input: ClauseExplanationInput = { clauseText: 'Clause 14.2' };
      const result = await explainClause('project-1', 'user-1', input, null);

      expect(result.disclaimer).toBe(
        'This is AI-generated guidance and does not constitute legal advice. Consult a legal professional for binding interpretations.'
      );
    });
  });

  describe('contextualisation', () => {
    it('sets contextualised to true when project context has passport data', async () => {
      const { callGeminiProxy } = await import('@/services/geminiService');
      vi.mocked(callGeminiProxy).mockResolvedValue(sampleExplanation);

      const result = await explainClause('project-1', 'user-1', validInput, mockContext);

      expect(result.contextualised).toBe(true);
    });

    it('sets contextualised to false when no context provided', async () => {
      const { callGeminiProxy } = await import('@/services/geminiService');
      vi.mocked(callGeminiProxy).mockResolvedValue(sampleExplanation);

      const result = await explainClause('project-1', 'user-1', validInput, null);

      expect(result.contextualised).toBe(false);
    });

    it('sets contextualised to false when context has no project name', async () => {
      const { callGeminiProxy } = await import('@/services/geminiService');
      vi.mocked(callGeminiProxy).mockResolvedValue(sampleExplanation);

      const emptyContext: CopilotProjectContext = {
        ...mockContext,
        passport: {
          ...mockContext.passport,
          projectName: '',
        },
      };

      const result = await explainClause('project-1', 'user-1', validInput, emptyContext);

      expect(result.contextualised).toBe(false);
    });

    it('includes project parties in system prompt when contextualised', async () => {
      const { callGeminiProxy } = await import('@/services/geminiService');
      const mockCall = vi.mocked(callGeminiProxy).mockResolvedValue(sampleExplanation);

      await explainClause('project-1', 'user-1', validInput, mockContext);

      const [systemPrompt] = mockCall.mock.calls[0];
      expect(systemPrompt).toContain('Sandton Office Tower');
      expect(systemPrompt).toContain('A. Botha');
      expect(systemPrompt).toContain('M. Patel');
    });
  });

  describe('AI call and timeout', () => {
    it('calls AI with system and user prompts', async () => {
      const { callGeminiProxy } = await import('@/services/geminiService');
      const mockCall = vi.mocked(callGeminiProxy).mockResolvedValue(sampleExplanation);

      await explainClause('project-1', 'user-1', validInput, null);

      expect(mockCall).toHaveBeenCalledTimes(1);
      const [systemPrompt, userPrompt] = mockCall.mock.calls[0];
      expect(systemPrompt).toContain('built-environment contract advisor');
      expect(systemPrompt).toContain('150 and 600 words');
      expect(systemPrompt).toContain('15 consecutive words');
      expect(userPrompt).toContain(validInput.clauseText);
    });

    it('includes contract type in system prompt', async () => {
      const { callGeminiProxy } = await import('@/services/geminiService');
      const mockCall = vi.mocked(callGeminiProxy).mockResolvedValue(sampleExplanation);

      await explainClause('project-1', 'user-1', validInput, null);

      const [systemPrompt] = mockCall.mock.calls[0];
      expect(systemPrompt).toContain('JBCC');
    });

    it('throws error when AI call times out', async () => {
      const { callGeminiProxy } = await import('@/services/geminiService');
      vi.mocked(callGeminiProxy).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve('late'), 20_000))
      );

      // Use fake timers to avoid waiting 15 seconds
      vi.useFakeTimers();

      const promise = explainClause('project-1', 'user-1', validInput, null);
      vi.advanceTimersByTime(15_001);

      await expect(promise).rejects.toThrow('timed out');

      vi.useRealTimers();
    });

    it('throws error when AI returns empty response', async () => {
      const { callGeminiProxy } = await import('@/services/geminiService');
      vi.mocked(callGeminiProxy).mockResolvedValue('');

      await expect(
        explainClause('project-1', 'user-1', validInput, null)
      ).rejects.toThrow('empty response');
    });
  });

  describe('clarification request detection', () => {
    it('detects clarification response and returns it', async () => {
      const { callGeminiProxy } = await import('@/services/geminiService');
      vi.mocked(callGeminiProxy).mockResolvedValue(
        'I cannot determine the contract type from this text. Could you please clarify which contract form this clause is from?'
      );

      const input: ClauseExplanationInput = { clauseText: 'Clause 22.1' };
      const result = await explainClause('project-1', 'user-1', input, null);

      expect(result.explanation).toContain('please clarify');
      expect(result.contextualised).toBe(false);
    });
  });

  describe('provenance', () => {
    it('creates a provenance record with explain_clause capability', async () => {
      const { callGeminiProxy } = await import('@/services/geminiService');
      vi.mocked(callGeminiProxy).mockResolvedValue(sampleExplanation);

      const result = await explainClause('project-1', 'user-1', validInput, null);

      expect(createProvenanceRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'project-1',
          acceptedBy: 'user-1',
          source: 'internal',
          capability: 'explain_clause',
        })
      );
      expect(result.provenanceId).toBe('prov_clause_123');
    });

    it('returns empty provenanceId when provenance creation fails', async () => {
      const { callGeminiProxy } = await import('@/services/geminiService');
      vi.mocked(callGeminiProxy).mockResolvedValue(sampleExplanation);
      vi.mocked(createProvenanceRecord).mockRejectedValueOnce(new Error('Firestore error'));

      const result = await explainClause('project-1', 'user-1', validInput, null);

      expect(result.provenanceId).toBe('');
      expect(result.explanation).toBeTruthy();
    });
  });

  describe('copyright compliance', () => {
    it('accepts content that passes copyright check', async () => {
      const { callGeminiProxy } = await import('@/services/geminiService');
      vi.mocked(callGeminiProxy).mockResolvedValue(sampleExplanation);

      const result = await explainClause('project-1', 'user-1', validInput, null);

      expect(result.explanation).toBe(sampleExplanation.trim());
    });

    it('attempts regeneration when copyright violation detected', async () => {
      const { callGeminiProxy } = await import('@/services/geminiService');
      // First call returns content with a legal phrase that triggers the heuristic
      const violatingContent = 'The contractor shall be liable to indemnify the employer against all claims arising from any breach of this contract whatsoever and howsoever arising without limitation of time or amount in terms of clause 25 of this agreement.';
      const cleanContent = 'This clause requires the contractor to compensate the employer if there is a breach. It creates a broad indemnity obligation without specific time or monetary limits.';

      vi.mocked(callGeminiProxy)
        .mockResolvedValueOnce(violatingContent)
        .mockResolvedValueOnce(cleanContent);

      const result = await explainClause('project-1', 'user-1', validInput, null);

      // Should have called AI twice (original + regeneration)
      expect(callGeminiProxy).toHaveBeenCalledTimes(2);
      // The second call's system prompt should contain the stricter instruction
      const [secondSystemPrompt] = vi.mocked(callGeminiProxy).mock.calls[1];
      expect(secondSystemPrompt).toContain('CRITICAL');
    });
  });
});
