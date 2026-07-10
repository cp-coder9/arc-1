/**
 * Unit tests for the draftRfi() capability handler in CopilotService
 *
 * Tests: input validation, sequential RFI numbering, addressed-to logic,
 * AI question body generation, drawing reference merging, deadline calculation,
 * and provenance record creation.
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.7, 6.8
 */

import { describe, it, expect, vi } from 'vitest';
import { draftRfi } from '../copilotService';
import type { CopilotProjectContext, RFIDraftInput } from '../copilotTypes';

// ─── Test Helpers ──────────────────────────────────────────────────────────

function createMockContext(overrides?: Partial<CopilotProjectContext>): CopilotProjectContext {
  return {
    passport: {
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
        { name: 'Mike QS', role: 'quantity_surveyor' },
      ],
    },
    documentRegister: [
      { id: 'doc-1', title: 'Technical Drawings Rev B', status: 'issued', type: 'drawing', updatedAt: '2026-07-01T10:00:00Z' },
      { id: 'doc-2', title: 'Tender Pack', status: 'draft', type: 'tender_pack', updatedAt: '2026-07-10T12:00:00Z' },
      { id: 'doc-3', title: 'Site Plan Rev C', status: 'pending_review', type: 'drawing', updatedAt: '2026-07-05T08:00:00Z' },
    ],
    pendingActions: [
      { id: 'action-1', title: 'Review Site Plan', priority: 'high', dueDate: '2026-07-20', type: 'approval_required' },
    ],
    auditTrail: [
      { action: 'document_uploaded', actor: 'John Architect', timestamp: '2026-07-10T12:00:00Z', detail: 'Uploaded Tender Pack' },
    ],
    userContext: {
      role: 'architect',
      projectAccessRole: null,
      displayName: 'Test User',
    },
    unavailableSources: [],
    ...overrides,
  };
}

function createValidInput(overrides?: Partial<RFIDraftInput>): RFIDraftInput {
  return {
    subject: 'Clarification on foundation detail at Grid C3',
    description: 'The structural drawings show conflicting information about the foundation depth at Grid C3. Drawing S-101 shows 1200mm while S-102 shows 900mm. Please clarify the correct depth.',
    drawingReferences: ['S-101', 'S-102'],
    urgency: 'medium',
    ...overrides,
  };
}

const mockCallAI = vi.fn().mockResolvedValue(
  'We require clarification regarding the conflicting foundation depth dimensions at Grid C3. Drawing S-101 (Rev B, issued 2026-07-01) indicates a depth of 1200mm while Drawing S-102 shows 900mm. Please confirm the correct design depth to proceed with excavation scheduling.'
);

const mockQueryHighestRfiNumber = vi.fn().mockResolvedValue(5);

// Mock provenanceService
vi.mock('../provenanceService', () => ({
  createProvenanceRecord: vi.fn().mockResolvedValue({ id: 'prov-123' }),
}));

// Mock firebase-admin
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnValue({
      orderBy: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
        }),
      }),
    }),
  },
}));

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('draftRfi()', () => {
  describe('input validation', () => {
    it('should reject empty subject', async () => {
      const input = createValidInput({ subject: '' });
      await expect(
        draftRfi({
          userId: 'user-1',
          projectId: 'proj-1',
          input,
          context: createMockContext(),
          callAI: mockCallAI,
          queryHighestRfiNumber: mockQueryHighestRfiNumber,
        })
      ).rejects.toThrow('Validation failed');
    });

    it('should reject subject exceeding 200 characters', async () => {
      const input = createValidInput({ subject: 'A'.repeat(201) });
      await expect(
        draftRfi({
          userId: 'user-1',
          projectId: 'proj-1',
          input,
          context: createMockContext(),
          callAI: mockCallAI,
          queryHighestRfiNumber: mockQueryHighestRfiNumber,
        })
      ).rejects.toThrow('Validation failed');
    });

    it('should reject empty description', async () => {
      const input = createValidInput({ description: '' });
      await expect(
        draftRfi({
          userId: 'user-1',
          projectId: 'proj-1',
          input,
          context: createMockContext(),
          callAI: mockCallAI,
          queryHighestRfiNumber: mockQueryHighestRfiNumber,
        })
      ).rejects.toThrow('Validation failed');
    });

    it('should reject more than 20 drawing references', async () => {
      const input = createValidInput({
        drawingReferences: Array.from({ length: 21 }, (_, i) => `DWG-${i}`),
      });
      await expect(
        draftRfi({
          userId: 'user-1',
          projectId: 'proj-1',
          input,
          context: createMockContext(),
          callAI: mockCallAI,
          queryHighestRfiNumber: mockQueryHighestRfiNumber,
        })
      ).rejects.toThrow('Validation failed');
    });

    it('should accept valid input with all fields', async () => {
      const result = await draftRfi({
        userId: 'user-1',
        projectId: 'proj-1',
        input: createValidInput(),
        context: createMockContext(),
        callAI: mockCallAI,
        queryHighestRfiNumber: mockQueryHighestRfiNumber,
      });
      expect(result).toBeDefined();
      expect(result.subject).toBe('Clarification on foundation detail at Grid C3');
    });

    it('should accept input with optional fields omitted', async () => {
      const input = createValidInput({
        drawingReferences: undefined,
        urgency: undefined,
      });
      const result = await draftRfi({
        userId: 'user-1',
        projectId: 'proj-1',
        input,
        context: createMockContext(),
        callAI: mockCallAI,
        queryHighestRfiNumber: mockQueryHighestRfiNumber,
      });
      expect(result).toBeDefined();
    });
  });

  describe('sequential RFI numbering', () => {
    it('should generate next sequential number after highest existing', async () => {
      const result = await draftRfi({
        userId: 'user-1',
        projectId: 'proj-1',
        input: createValidInput(),
        context: createMockContext(),
        callAI: mockCallAI,
        queryHighestRfiNumber: vi.fn().mockResolvedValue(5),
      });
      expect(result.rfiNumber).toBe(6);
    });

    it('should start at 1 when no existing RFIs', async () => {
      const result = await draftRfi({
        userId: 'user-1',
        projectId: 'proj-1',
        input: createValidInput(),
        context: createMockContext(),
        callAI: mockCallAI,
        queryHighestRfiNumber: vi.fn().mockResolvedValue(0),
      });
      expect(result.rfiNumber).toBe(1);
    });
  });

  describe('addressed-to logic', () => {
    it('should use lead professional when assigned', async () => {
      const result = await draftRfi({
        userId: 'user-1',
        projectId: 'proj-1',
        input: createValidInput(),
        context: createMockContext(),
        callAI: mockCallAI,
        queryHighestRfiNumber: mockQueryHighestRfiNumber,
      });
      expect(result.addressedTo).toBe('John Architect');
    });

    it('should return null when no lead professional assigned', async () => {
      const context = createMockContext();
      context.passport.leadProfessional = '';
      const result = await draftRfi({
        userId: 'user-1',
        projectId: 'proj-1',
        input: createValidInput(),
        context,
        callAI: mockCallAI,
        queryHighestRfiNumber: mockQueryHighestRfiNumber,
      });
      expect(result.addressedTo).toBeNull();
    });
  });

  describe('question body generation', () => {
    it('should generate question body of at least 50 characters', async () => {
      const result = await draftRfi({
        userId: 'user-1',
        projectId: 'proj-1',
        input: createValidInput(),
        context: createMockContext(),
        callAI: mockCallAI,
        queryHighestRfiNumber: mockQueryHighestRfiNumber,
      });
      expect(result.questionBody.length).toBeGreaterThanOrEqual(50);
    });

    it('should pad response to 50 chars if AI returns short text', async () => {
      const shortAI = vi.fn().mockResolvedValue('Short');
      const result = await draftRfi({
        userId: 'user-1',
        projectId: 'proj-1',
        input: createValidInput(),
        context: createMockContext(),
        callAI: shortAI,
        queryHighestRfiNumber: mockQueryHighestRfiNumber,
      });
      expect(result.questionBody.length).toBeGreaterThanOrEqual(50);
    });

    it('should fallback to description if AI call fails', async () => {
      const failingAI = vi.fn().mockRejectedValue(new Error('AI service unavailable'));
      const input = createValidInput({
        description: 'The structural drawings show conflicting information about the foundation depth at Grid C3.',
      });
      const result = await draftRfi({
        userId: 'user-1',
        projectId: 'proj-1',
        input,
        context: createMockContext(),
        callAI: failingAI,
        queryHighestRfiNumber: mockQueryHighestRfiNumber,
      });
      expect(result.questionBody).toContain('structural drawings');
      expect(result.questionBody.length).toBeGreaterThanOrEqual(50);
    });
  });

  describe('drawing references', () => {
    it('should include user-provided references', async () => {
      const result = await draftRfi({
        userId: 'user-1',
        projectId: 'proj-1',
        input: createValidInput({ drawingReferences: ['S-101', 'S-102'] }),
        context: createMockContext(),
        callAI: mockCallAI,
        queryHighestRfiNumber: mockQueryHighestRfiNumber,
      });
      expect(result.references).toContain('S-101');
      expect(result.references).toContain('S-102');
    });

    it('should merge context drawing references', async () => {
      const result = await draftRfi({
        userId: 'user-1',
        projectId: 'proj-1',
        input: createValidInput({ drawingReferences: ['S-101'] }),
        context: createMockContext(),
        callAI: mockCallAI,
        queryHighestRfiNumber: mockQueryHighestRfiNumber,
      });
      // Should include user ref + context drawings (issued/pending_review type=drawing)
      expect(result.references).toContain('S-101');
      expect(result.references).toContain('Technical Drawings Rev B');
      expect(result.references).toContain('Site Plan Rev C');
    });

    it('should not exceed 20 references', async () => {
      const input = createValidInput({
        drawingReferences: Array.from({ length: 18 }, (_, i) => `DWG-${i}`),
      });
      const result = await draftRfi({
        userId: 'user-1',
        projectId: 'proj-1',
        input,
        context: createMockContext(),
        callAI: mockCallAI,
        queryHighestRfiNumber: mockQueryHighestRfiNumber,
      });
      expect(result.references.length).toBeLessThanOrEqual(20);
    });
  });

  describe('deadline calculation', () => {
    it('should calculate deadline as today + 7 days', async () => {
      const result = await draftRfi({
        userId: 'user-1',
        projectId: 'proj-1',
        input: createValidInput(),
        context: createMockContext(),
        callAI: mockCallAI,
        queryHighestRfiNumber: mockQueryHighestRfiNumber,
      });

      const expected = new Date();
      expected.setDate(expected.getDate() + 7);
      const expectedDate = expected.toISOString().split('T')[0];
      expect(result.suggestedDeadline).toBe(expectedDate);
    });

    it('should return ISO date format (YYYY-MM-DD)', async () => {
      const result = await draftRfi({
        userId: 'user-1',
        projectId: 'proj-1',
        input: createValidInput(),
        context: createMockContext(),
        callAI: mockCallAI,
        queryHighestRfiNumber: mockQueryHighestRfiNumber,
      });
      expect(result.suggestedDeadline).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('provenance tracking', () => {
    it('should include provenanceId in the output', async () => {
      const result = await draftRfi({
        userId: 'user-1',
        projectId: 'proj-1',
        input: createValidInput(),
        context: createMockContext(),
        callAI: mockCallAI,
        queryHighestRfiNumber: mockQueryHighestRfiNumber,
      });
      expect(result.provenanceId).toBe('prov-123');
    });
  });

  describe('output structure', () => {
    it('should return complete RFIDraftOutput structure', async () => {
      const result = await draftRfi({
        userId: 'user-1',
        projectId: 'proj-1',
        input: createValidInput(),
        context: createMockContext(),
        callAI: mockCallAI,
        queryHighestRfiNumber: mockQueryHighestRfiNumber,
      });
      expect(result).toHaveProperty('rfiNumber');
      expect(result).toHaveProperty('addressedTo');
      expect(result).toHaveProperty('subject');
      expect(result).toHaveProperty('questionBody');
      expect(result).toHaveProperty('references');
      expect(result).toHaveProperty('suggestedDeadline');
      expect(result).toHaveProperty('provenanceId');
      expect(typeof result.rfiNumber).toBe('number');
      expect(Array.isArray(result.references)).toBe(true);
    });
  });
});
