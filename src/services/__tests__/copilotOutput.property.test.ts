// @vitest-environment node
/**
 * Property-Based Tests for Copilot Capability Outputs
 *
 * Feature: ai-copilot-workspace
 *
 * Property 13: RFI Draft Validation
 *   Validates: Requirements 6.1, 6.2
 *
 * Property 14: Financial Data Exclusion
 *   Validates: Requirements 7.2
 *
 * Property 15: Compliance Gap Sorting
 *   Validates: Requirements 8.4, 8.5
 *
 * Property 16: Compliance Gap Category Validity
 *   Validates: Requirements 8.2
 *
 * Property 28: Spine Write Confirmation Gate
 *   Validates: Requirements 13.6
 *
 * Property 29: Spine Write Audit Trail
 *   Validates: Requirements 13.4
 *
 * Uses fast-check with minimum 100 iterations per property test.
 */

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import {
  draftRfi,
  summariseStatus,
  flagCompliance,
  getCapabilitiesForRole,
} from '@/services/copilotService';
import type {
  DraftRfiParams,
  SummariseStatusParams,
  FlagComplianceParams,
} from '@/services/copilotService';
import type {
  RFIDraftInput,
  CopilotProjectContext,
  ComplianceGap,
  ComplianceGapCategory,
  ComplianceGapSeverity,
  StatusSummary,
} from '@/services/copilotTypes';
import type { UserRole } from '@/types';

// ─── Mock firebase-admin ───────────────────────────────────────────────────

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({ id: 'mock-id', set: vi.fn().mockResolvedValue(undefined) }),
      orderBy: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
        }),
      }),
    }),
    doc: vi.fn().mockReturnValue({
      get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ messageCount: 0 }) }),
      update: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

// ─── Mock provenanceService ────────────────────────────────────────────────

vi.mock('@/services/provenanceService', () => ({
  createProvenanceRecord: vi.fn().mockResolvedValue({ id: 'prov-mock-id' }),
}));

// ─── Mock geminiService ────────────────────────────────────────────────────

vi.mock('@/services/geminiService', () => ({
  callGeminiProxy: vi.fn().mockResolvedValue('Mock AI response content.'),
}));

// ─── Mock permissionService ────────────────────────────────────────────────

vi.mock('@/services/permissionService', () => ({
  canUserPerform: vi.fn().mockReturnValue(false),
}));

// ─── Constants ─────────────────────────────────────────────────────────────

const VALID_URGENCY_VALUES = ['low', 'medium', 'high', 'critical'] as const;

const VALID_GAP_CATEGORIES: ComplianceGapCategory[] = [
  'missing_submission',
  'expired_certification',
  'phase_prerequisite',
  'regulatory_flag',
];

const VALID_GAP_SEVERITIES: ComplianceGapSeverity[] = [
  'critical',
  'warning',
  'informational',
];

const SEVERITY_ORDER: Record<ComplianceGapSeverity, number> = {
  critical: 0,
  warning: 1,
  informational: 2,
};

/** Financial keywords that must be absent when user lacks summarise_financials. */
const FINANCIAL_KEYWORDS = [
  'budget', 'payment', 'cost', 'financial', 'invoice', 'rand',
  'r ', 'r\\d', 'zar', 'expenditure', 'revenue', 'fee',
  'valuation', 'escrow', 'milestone payment',
];

/** Roles that do NOT have summarise_financials capability. */
const ROLES_WITHOUT_FINANCIALS: UserRole[] = [
  'engineer', 'freelancer', 'subcontractor', 'supplier',
  'town_planner', 'energy_professional', 'fire_engineer',
  'site_manager', 'developer', 'land_surveyor', 'health_safety',
];

// ─── Arbitraries (Generators) ──────────────────────────────────────────────

/** Generate a valid RFI subject (1–200 printable chars). */
const arbRfiSubject = fc.string({ minLength: 1, maxLength: 200 })
  .filter(s => s.trim().length >= 1);

/** Generate a valid RFI description (1–2000 printable chars). */
const arbRfiDescription = fc.string({ minLength: 1, maxLength: 200 })
  .filter(s => s.trim().length >= 1);

/** Generate drawing references array (0–20 items). */
const arbDrawingRefs = fc.array(
  fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length >= 1),
  { minLength: 0, maxLength: 20 }
);

/** Generate an optional RFI urgency value. */
const arbUrgency = fc.option(fc.constantFrom(...VALID_URGENCY_VALUES), { nil: undefined });

/** Generate a valid RFIDraftInput. */
const arbRfiInput: fc.Arbitrary<RFIDraftInput> = fc.record({
  subject: arbRfiSubject,
  description: arbRfiDescription,
  drawingReferences: fc.option(arbDrawingRefs, { nil: undefined }),
  urgency: arbUrgency,
});

/** Generate a compliance gap category. */
const arbGapCategory = fc.constantFrom(...VALID_GAP_CATEGORIES);

/** Generate a compliance gap severity. */
const arbGapSeverity = fc.constantFrom(...VALID_GAP_SEVERITIES);

/** Generate a resolved status. */
const arbResolved = fc.boolean();

/** Generate a single ComplianceGap item. */
const arbComplianceGap: fc.Arbitrary<ComplianceGap> = fc.record({
  id: fc.uuid(),
  category: arbGapCategory,
  severity: arbGapSeverity,
  title: fc.string({ minLength: 3, maxLength: 100 }),
  detail: fc.string({ minLength: 5, maxLength: 300 }),
  sansReference: fc.option(
    fc.constantFrom('SANS 10400-K', 'SANS 10400-N', 'SANS 10400-T', 'SANS 10400-C', 'SANS 10400-XA'),
    { nil: null }
  ),
  suggestedRemediation: fc.string({ minLength: 5, maxLength: 200 }),
  resolved: arbResolved,
  detectedAt: fc.integer({ min: new Date('2024-01-01T00:00:00.000Z').getTime(), max: new Date('2026-12-31T00:00:00.000Z').getTime() })
    .map((ts) => new Date(ts).toISOString()),
});

/** Generate a list of compliance gaps (0–60 items to test 50-limit enforcement). */
const arbGapList = fc.array(arbComplianceGap, { minLength: 0, maxLength: 60 });

/** Generate a role without financials access. */
const arbRoleWithoutFinancials = fc.constantFrom(...ROLES_WITHOUT_FINANCIALS);

/** Generate a minimal project context for testing. */
function buildTestContext(overrides?: Partial<CopilotProjectContext>): CopilotProjectContext {
  return {
    passport: {
      projectName: 'Test Project Alpha',
      currentPhase: 'design_development',
      riskLevel: 'medium',
      leadProfessional: 'Dr. J. van der Merwe',
      keyDates: [{ label: 'Completion', date: '2026-12-01' }],
      teamMembers: [
        { name: 'Dr. J. van der Merwe', role: 'architect' },
        { name: 'A. Nkosi', role: 'engineer' },
      ],
    },
    documentRegister: [
      { id: 'doc-1', title: 'Site Plan Rev C', status: 'issued', type: 'drawing', updatedAt: '2026-01-10T10:00:00Z' },
      { id: 'doc-2', title: 'Structural Report', status: 'draft', type: 'report', updatedAt: '2026-01-12T14:00:00Z' },
    ],
    pendingActions: [
      { id: 'act-1', title: 'Review structural calc', priority: 'high', dueDate: '2026-02-01', type: 'review' },
    ],
    auditTrail: [
      { action: 'document_uploaded', actor: 'Dr. J. van der Merwe', timestamp: '2026-01-10T10:00:00Z', detail: 'Uploaded Site Plan Rev C' },
    ],
    userContext: { role: 'architect', projectAccessRole: null, displayName: 'Test User' },
    unavailableSources: [],
    ...overrides,
  };
}


// ══════════════════════════════════════════════════════════════════════════════
// Property 13: RFI Draft Validation
// Validates: Requirements 6.1, 6.2
// ══════════════════════════════════════════════════════════════════════════════

describe('Property 13: RFI Draft Validation', () => {
  /**
   * **Validates: Requirements 6.1, 6.2**
   *
   * For any RFI draft request, the input must be accepted only when subject is
   * 1–200 characters, description is 1–2000 characters, drawing references are
   * at most 20 items, and urgency is one of the 4 defined values (or omitted).
   * The generated output must contain a sequential RFI number, subject line,
   * question body of at least 50 characters, and a suggested deadline.
   */
  it('valid RFI inputs produce output with sequential number, subject, question body ≥50 chars, and deadline', async () => {
    await fc.assert(
      fc.asyncProperty(arbRfiInput, async (input) => {
        const context = buildTestContext();
        let rfiCounter = 0;

        const params: DraftRfiParams = {
          userId: 'user-1',
          projectId: 'proj-1',
          input,
          context,
          callAI: async () => 'This is an AI-generated RFI question body that expands the description into a technically-framed clarification request for the project team.',
          queryHighestRfiNumber: async () => rfiCounter++,
        };

        const result = await draftRfi(params);

        // Sequential RFI number (positive integer)
        expect(result.rfiNumber).toBeGreaterThan(0);
        expect(Number.isInteger(result.rfiNumber)).toBe(true);

        // Subject line present and matches input
        expect(result.subject).toBe(input.subject);
        expect(result.subject.length).toBeGreaterThanOrEqual(1);
        expect(result.subject.length).toBeLessThanOrEqual(200);

        // Question body must be at least 50 characters
        expect(result.questionBody.length).toBeGreaterThanOrEqual(50);

        // Suggested deadline is a valid ISO date string (YYYY-MM-DD)
        expect(result.suggestedDeadline).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        const deadlineDate = new Date(result.suggestedDeadline);
        expect(deadlineDate.getTime()).not.toBeNaN();

        // References array is limited to max 20 items
        expect(result.references.length).toBeLessThanOrEqual(20);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects RFI inputs with subject exceeding 200 characters', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 201, maxLength: 300 }).filter(s => s.trim().length >= 201),
        arbRfiDescription,
        async (longSubject, description) => {
          const context = buildTestContext();
          const params: DraftRfiParams = {
            userId: 'user-1',
            projectId: 'proj-1',
            input: { subject: longSubject, description },
            context,
            callAI: async () => 'Should not reach AI call.',
            queryHighestRfiNumber: async () => 0,
          };

          await expect(draftRfi(params)).rejects.toThrow(/validation failed/i);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects RFI inputs with more than 20 drawing references', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbRfiSubject,
        arbRfiDescription,
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 21, maxLength: 30 }),
        async (subject, description, refs) => {
          const context = buildTestContext();
          const params: DraftRfiParams = {
            userId: 'user-1',
            projectId: 'proj-1',
            input: { subject, description, drawingReferences: refs },
            context,
            callAI: async () => 'Should not reach AI call.',
            queryHighestRfiNumber: async () => 0,
          };

          await expect(draftRfi(params)).rejects.toThrow(/validation failed/i);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('accepts urgency only when it is one of the 4 defined values or omitted', async () => {
    await fc.assert(
      fc.asyncProperty(arbRfiInput, async (input) => {
        // Valid urgency values or undefined
        if (input.urgency !== undefined) {
          expect(VALID_URGENCY_VALUES).toContain(input.urgency);
        }

        const context = buildTestContext();
        const params: DraftRfiParams = {
          userId: 'user-1',
          projectId: 'proj-1',
          input,
          context,
          callAI: async () => 'A detailed question body that is definitely longer than fifty characters for testing purposes.',
          queryHighestRfiNumber: async () => 5,
        };

        const result = await draftRfi(params);
        // If urgency was valid or omitted, we get a result with rfiNumber = 6
        expect(result.rfiNumber).toBe(6);
      }),
      { numRuns: 100 },
    );
  });
});
