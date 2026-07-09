/**
 * Unit tests for generateNarrative() handler in copilotService.ts
 *
 * Tests:
 * - Input validation via NarrativeInputSchema
 * - AI call with timeout enforcement
 * - Word count, paragraph count, readability grade calculation
 * - Provenance record creation
 * - South African vocabulary grounding in system prompt
 * - Never fabricates firm-specific claims
 *
 * @requirements 9.1, 9.2, 9.3, 9.5, 9.6, 9.7
 */

import { describe, it, expect, vi } from 'vitest';

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
  createProvenanceRecord: vi.fn().mockResolvedValue({ id: 'prov_test_123' }),
}));

import {
  generateNarrative,
  countSyllables,
  calculateReadabilityGrade,
} from '@/services/copilotService';
import type { GenerateNarrativeParams } from '@/services/copilotService';
import type { CopilotProjectContext, NarrativeInput } from '@/services/copilotTypes';

// ─── Test Fixtures ─────────────────────────────────────────────────────────

const mockContext: CopilotProjectContext = {
  passport: {
    projectName: 'Greenfield Mixed-Use Development',
    currentPhase: 'design',
    riskLevel: 'medium',
    leadProfessional: 'J. van der Merwe',
    keyDates: [
      { label: 'Design Deadline', date: '2026-03-15' },
      { label: 'Tender Submission', date: '2026-05-01' },
    ],
    teamMembers: [
      { name: 'J. van der Merwe', role: 'Principal Agent' },
      { name: 'S. Naidoo', role: 'Structural Engineer' },
      { name: 'T. Mbeki', role: 'Quantity Surveyor' },
    ],
  },
  documentRegister: [
    { id: 'doc-1', title: 'Architectural Drawings Rev C', status: 'issued', type: 'drawing', updatedAt: '2026-01-15T10:00:00Z' },
    { id: 'doc-2', title: 'Structural Report', status: 'pending_review', type: 'report', updatedAt: '2026-01-10T10:00:00Z' },
  ],
  pendingActions: [
    { id: 'act-1', title: 'Review structural calculations', priority: 'high', dueDate: '2026-02-01', type: 'review' },
  ],
  auditTrail: [
    { action: 'document_uploaded', actor: 'J. van der Merwe', timestamp: '2026-01-15T10:00:00Z', detail: 'Uploaded Rev C drawings' },
  ],
  userContext: {
    role: 'architect',
    projectAccessRole: null,
    displayName: 'Johan van der Merwe',
  },
  unavailableSources: [],
};

const validInput: NarrativeInput = {
  narrativeType: 'approach_statement',
  targetAudience: 'client',
  tone: 'formal',
};

function generateSampleNarrative(wordCount: number, paragraphCount: number): string {
  const wordsPerParagraph = Math.ceil(wordCount / paragraphCount);
  const paragraphs: string[] = [];
  let remainingWords = wordCount;

  for (let i = 0; i < paragraphCount; i++) {
    const targetWords = Math.min(wordsPerParagraph, remainingWords);
    // Generate a sentence-rich paragraph
    const sentences: string[] = [];
    let currentWords = 0;
    while (currentWords < targetWords) {
      sentences.push('Our team brings extensive experience in the South African built environment sector.');
      currentWords += 12;
    }
    paragraphs.push(sentences.join(' '));
    remainingWords -= targetWords;
  }

  return paragraphs.join('\n\n');
}

const sampleNarrative = generateSampleNarrative(300, 3);

function baseParams(overrides: Partial<GenerateNarrativeParams> = {}): GenerateNarrativeParams {
  return {
    userId: 'user-123',
    projectId: 'project-456',
    input: validInput,
    context: mockContext,
    callAI: vi.fn().mockResolvedValue(sampleNarrative),
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('generateNarrative', () => {
  describe('input validation', () => {
    it('rejects invalid narrative type', async () => {
      const params = baseParams({
        input: { narrativeType: 'invalid_type' as any, targetAudience: 'client', tone: 'formal' },
      });

      await expect(generateNarrative(params)).rejects.toThrow('Validation failed');
    });

    it('rejects invalid audience', async () => {
      const params = baseParams({
        input: { narrativeType: 'methodology', targetAudience: 'invalid' as any, tone: 'formal' },
      });

      await expect(generateNarrative(params)).rejects.toThrow('Validation failed');
    });

    it('rejects invalid tone', async () => {
      const params = baseParams({
        input: { narrativeType: 'methodology', targetAudience: 'client', tone: 'invalid' as any },
      });

      await expect(generateNarrative(params)).rejects.toThrow('Validation failed');
    });

    it('accepts all valid narrative types', async () => {
      const types = ['approach_statement', 'methodology', 'team_capability', 'project_understanding', 'fee_justification'] as const;

      for (const narrativeType of types) {
        const params = baseParams({
          input: { narrativeType, targetAudience: 'client', tone: 'formal' },
        });
        const result = await generateNarrative(params);
        expect(result.content).toBeTruthy();
      }
    });
  });

  describe('AI call and timeout', () => {
    it('calls AI with system and user prompts', async () => {
      const mockAI = vi.fn().mockResolvedValue(sampleNarrative);
      const params = baseParams({ callAI: mockAI });

      await generateNarrative(params);

      expect(mockAI).toHaveBeenCalledTimes(1);
      const [systemPrompt, userPrompt] = mockAI.mock.calls[0];
      expect(systemPrompt).toContain('South African built environment');
      expect(systemPrompt).toContain('CIDB');
      expect(systemPrompt).toContain('SACAP');
      expect(systemPrompt).toContain('ECSA');
      expect(systemPrompt).toContain('approach_statement');
      expect(userPrompt).toContain('Approach Statement');
    });

    it('includes project context in system prompt', async () => {
      const mockAI = vi.fn().mockResolvedValue(sampleNarrative);
      const params = baseParams({ callAI: mockAI });

      await generateNarrative(params);

      const [systemPrompt] = mockAI.mock.calls[0];
      expect(systemPrompt).toContain('Greenfield Mixed-Use Development');
      expect(systemPrompt).toContain('J. van der Merwe');
      expect(systemPrompt).toContain('design');
    });

    it('includes never-fabricate instruction in system prompt', async () => {
      const mockAI = vi.fn().mockResolvedValue(sampleNarrative);
      const params = baseParams({ callAI: mockAI });

      await generateNarrative(params);

      const [systemPrompt] = mockAI.mock.calls[0];
      expect(systemPrompt).toContain('NEVER fabricate firm-specific claims');
    });

    it('includes word count constraints in system prompt', async () => {
      const mockAI = vi.fn().mockResolvedValue(sampleNarrative);
      const params = baseParams({ callAI: mockAI });

      await generateNarrative(params);

      const [systemPrompt] = mockAI.mock.calls[0];
      expect(systemPrompt).toContain('200');
      expect(systemPrompt).toContain('800');
      expect(systemPrompt).toContain('2 to 6 paragraphs');
    });

    it('throws on AI timeout after 30 seconds', async () => {
      const slowAI = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve('text'), 35_000))
      );
      const params = baseParams({ callAI: slowAI });

      await expect(generateNarrative(params)).rejects.toThrow('timeout');
    }, 35_000);

    it('throws on AI service error', async () => {
      const failingAI = vi.fn().mockRejectedValue(new Error('Service unavailable'));
      const params = baseParams({ callAI: failingAI });

      await expect(generateNarrative(params)).rejects.toThrow('Narrative generation failed');
    });

    it('throws on empty AI response', async () => {
      const emptyAI = vi.fn().mockResolvedValue('');
      const params = baseParams({ callAI: emptyAI });

      await expect(generateNarrative(params)).rejects.toThrow('empty response');
    });
  });

  describe('output metrics', () => {
    it('returns correct word count', async () => {
      const text = 'The quick brown fox jumps over the lazy dog. This is a second sentence with more words.';
      const mockAI = vi.fn().mockResolvedValue(text);
      const params = baseParams({ callAI: mockAI });

      const result = await generateNarrative(params);
      expect(result.wordCount).toBe(18);
    });

    it('returns correct paragraph count for multi-paragraph text', async () => {
      const text = 'First paragraph content here.\n\nSecond paragraph content here.\n\nThird paragraph content here.';
      const mockAI = vi.fn().mockResolvedValue(text);
      const params = baseParams({ callAI: mockAI });

      const result = await generateNarrative(params);
      expect(result.paragraphCount).toBe(3);
    });

    it('returns paragraph count of 1 for single paragraph', async () => {
      const text = 'This is a single paragraph with no line breaks at all. It continues on the same paragraph.';
      const mockAI = vi.fn().mockResolvedValue(text);
      const params = baseParams({ callAI: mockAI });

      const result = await generateNarrative(params);
      expect(result.paragraphCount).toBe(1);
    });

    it('returns readability grade as a number', async () => {
      const params = baseParams();
      const result = await generateNarrative(params);

      expect(typeof result.readabilityGrade).toBe('number');
      expect(result.readabilityGrade).toBeGreaterThanOrEqual(0);
    });

    it('returns provenanceId in output', async () => {
      const params = baseParams();
      const result = await generateNarrative(params);

      expect(result.provenanceId).toBe('prov_test_123');
    });
  });

  describe('provenance handling', () => {
    it('still returns output when provenance creation fails', async () => {
      const { createProvenanceRecord } = await import('@/services/provenanceService');
      vi.mocked(createProvenanceRecord).mockRejectedValueOnce(new Error('Firestore error'));

      const params = baseParams();
      const result = await generateNarrative(params);

      expect(result.content).toBeTruthy();
      expect(result.provenanceId).toBe('');
    });
  });
});

// ─── Readability Helper Tests ──────────────────────────────────────────────

describe('countSyllables', () => {
  it('returns 1 for single-syllable words', () => {
    expect(countSyllables('the')).toBe(1);
    expect(countSyllables('cat')).toBe(1);
    expect(countSyllables('run')).toBe(1);
  });

  it('returns 2 for two-syllable words', () => {
    expect(countSyllables('water')).toBe(2);
    expect(countSyllables('happy')).toBe(2);
  });

  it('returns 3 for three-syllable words', () => {
    expect(countSyllables('beautiful')).toBe(3);
    expect(countSyllables('important')).toBe(3);
  });

  it('returns at minimum 1 for any non-empty word', () => {
    expect(countSyllables('x')).toBe(1);
    expect(countSyllables('str')).toBe(1);
  });

  it('returns 0 for empty string', () => {
    expect(countSyllables('')).toBe(0);
  });
});

describe('calculateReadabilityGrade', () => {
  it('returns 0 for empty text', () => {
    expect(calculateReadabilityGrade('')).toBe(0);
  });

  it('returns a reasonable grade for simple text', () => {
    const simpleText = 'The cat sat on the mat. The dog ran fast. It was a good day.';
    const grade = calculateReadabilityGrade(simpleText);
    // Simple sentences should have low grade level (elementary reading)
    expect(grade).toBeGreaterThan(0);
    expect(grade).toBeLessThan(10);
  });

  it('returns a higher grade for complex text', () => {
    const complexText = 'The architectural documentation substantially demonstrates comprehensive integration of multidisciplinary professional specifications. Furthermore, the implementation methodology systematically addresses regulatory compliance requirements established by governmental authorities.';
    const grade = calculateReadabilityGrade(complexText);
    // Complex sentences with long words should have higher grade level
    expect(grade).toBeGreaterThan(10);
  });

  it('returns a number rounded to 1 decimal place', () => {
    const text = 'This is a sample text for testing the readability calculation. It has multiple sentences of varying length.';
    const grade = calculateReadabilityGrade(text);
    const decimalPlaces = (grade.toString().split('.')[1] || '').length;
    expect(decimalPlaces).toBeLessThanOrEqual(1);
  });
});
