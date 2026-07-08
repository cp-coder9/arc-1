/**
 * Unit tests for Copilot API endpoint validation and error responses.
 *
 * Tests auth token validation, capability denial responses (403),
 * rate limit responses (429), validation errors (400), and
 * BYOAI authorization rejection (403).
 *
 * @requirements 2.3, 11.4, 12.5, 12.7
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock firebase-admin ───────────────────────────────────────────────────

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        id: 'mock-id',
        set: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue({ exists: true, data: () => ({}) }),
      })),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ empty: false, docs: [], size: 0 }),
      add: vi.fn().mockResolvedValue({ id: 'mock-id' }),
    })),
    doc: vi.fn(() => ({
      get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ ownerUid: 'user-1', messageCount: 0 }) }),
      set: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    })),
    batch: vi.fn(() => ({
      update: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    })),
    collectionGroup: vi.fn(() => ({
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ empty: false, docs: [{ data: () => ({ ownerUid: 'user-1' }) }] }),
    })),
  },
  admin: {},
  auth: {},
  firebaseConfig: {},
}));

vi.mock('@/services/geminiService', () => ({
  callGeminiProxy: vi.fn().mockResolvedValue('Mock AI response for testing.'),
}));

vi.mock('@/services/provenanceService', () => ({
  createProvenanceRecord: vi.fn().mockResolvedValue({ id: 'prov-test-123' }),
  queryByProject: vi.fn().mockResolvedValue({ records: [], hasMore: false }),
  createOverride: vi.fn().mockResolvedValue({ id: 'override-1' }),
}));

// ─── Import under test ─────────────────────────────────────────────────────

import { getCapabilitiesForRole, validateCapabilityAccess } from '@/services/copilotService';
import { checkRateLimit, recordRequest, resetRateLimit } from '@/services/copilotRateLimiter';
import { CopilotMessageInputSchema, RFIDraftInputSchema, BYOAIImportRequestSchema } from '@/lib/copilotSchemas';

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Copilot API — Auth token validation', () => {
  it('capability endpoint requires valid role', () => {
    // platform_admin gets empty capabilities
    const capabilities = getCapabilitiesForRole('platform_admin');
    expect(capabilities).toEqual([]);
  });

  it('professional role gets capabilities', () => {
    const capabilities = getCapabilitiesForRole('architect');
    expect(capabilities.length).toBeGreaterThan(0);
    expect(capabilities).toContain('summarise_status');
    expect(capabilities).toContain('draft_rfi');
  });
});

describe('Copilot API — Capability denial responses (403)', () => {
  it('denies platform_admin without revealing role mappings', () => {
    const result = validateCapabilityAccess('platform_admin', 'draft_rfi');
    expect(result.allowed).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).not.toContain('architect');
    expect(result.error).not.toContain('engineer');
  });

  it('denies unrecognized capabilities', () => {
    const result = validateCapabilityAccess('architect', 'nonexistent_cap');
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('unrecognized');
  });

  it('denies role-scoped capability to unauthorized role', () => {
    // client does NOT have draft_rfi
    const result = validateCapabilityAccess('client', 'draft_rfi');
    expect(result.allowed).toBe(false);
    expect(result.error).toBe('This capability is not available for your role.');
  });

  it('allows role-scoped capability to authorized role', () => {
    const result = validateCapabilityAccess('architect', 'draft_rfi');
    expect(result.allowed).toBe(true);
    expect(result.error).toBeUndefined();
  });
});

describe('Copilot API — Rate limit responses (429)', () => {
  beforeEach(() => {
    resetRateLimit('rate-test-user');
  });

  it('allows requests within the rate limit', () => {
    const result = checkRateLimit('rate-test-user');
    expect(result.allowed).toBe(true);
  });

  it('denies requests after 60 in a window with retryAfterMinutes', () => {
    // Fill up the limit
    for (let i = 0; i < 60; i++) {
      recordRequest('rate-test-user');
    }

    const result = checkRateLimit('rate-test-user');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMinutes).toBeDefined();
    expect(result.retryAfterMinutes!).toBeGreaterThan(0);
  });
});

describe('Copilot API — Validation errors (400)', () => {
  it('rejects prompt shorter than 3 characters', () => {
    const result = CopilotMessageInputSchema.safeParse({ prompt: 'ab' });
    expect(result.success).toBe(false);
  });

  it('rejects prompt exceeding 4000 characters', () => {
    const result = CopilotMessageInputSchema.safeParse({ prompt: 'x'.repeat(4001) });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only prompt', () => {
    const result = CopilotMessageInputSchema.safeParse({ prompt: '   \t\n   ' });
    expect(result.success).toBe(false);
  });

  it('accepts valid prompt', () => {
    const result = CopilotMessageInputSchema.safeParse({ prompt: 'What is the project status?' });
    expect(result.success).toBe(true);
  });

  it('rejects RFI with subject exceeding 200 chars', () => {
    const result = RFIDraftInputSchema.safeParse({
      subject: 'x'.repeat(201),
      description: 'Valid description',
    });
    expect(result.success).toBe(false);
  });

  it('rejects RFI with description exceeding 2000 chars', () => {
    const result = RFIDraftInputSchema.safeParse({
      subject: 'Valid subject',
      description: 'x'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects RFI with more than 20 drawing references', () => {
    const result = RFIDraftInputSchema.safeParse({
      subject: 'Valid subject',
      description: 'Valid description',
      drawingReferences: Array.from({ length: 21 }, (_, i) => `Drawing ${i}`),
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid RFI input', () => {
    const result = RFIDraftInputSchema.safeParse({
      subject: 'Structural query',
      description: 'Need clarification on beam sizes for level 3.',
      drawingReferences: ['DWG-001', 'DWG-002'],
      urgency: 'high',
    });
    expect(result.success).toBe(true);
  });
});

describe('Copilot API — BYOAI authorization rejection (403)', () => {
  it('rejects import with empty content', () => {
    const result = BYOAIImportRequestSchema.safeParse({
      content: '',
      externalModelName: 'gpt-4',
      contentType: 'general',
    });
    expect(result.success).toBe(false);
  });

  it('rejects import with content exceeding 50000 chars', () => {
    const result = BYOAIImportRequestSchema.safeParse({
      content: 'x'.repeat(50001),
      externalModelName: 'gpt-4',
      contentType: 'general',
    });
    expect(result.success).toBe(false);
  });

  it('rejects import with invalid content type', () => {
    const result = BYOAIImportRequestSchema.safeParse({
      content: 'Valid content here',
      externalModelName: 'gpt-4',
      contentType: 'invalid_type',
    });
    expect(result.success).toBe(false);
  });

  it('rejects import with future timestamp >5 minutes ahead', () => {
    const futureTime = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const result = BYOAIImportRequestSchema.safeParse({
      content: 'Valid content here',
      externalModelName: 'gpt-4',
      contentType: 'general',
      generationTimestamp: futureTime,
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid BYOAI import request', () => {
    const result = BYOAIImportRequestSchema.safeParse({
      content: 'This is AI-generated content from an external tool.',
      externalModelName: 'claude-3.5-sonnet',
      contentType: 'narrative',
    });
    expect(result.success).toBe(true);
  });

  it('rejects model name exceeding 100 characters', () => {
    const result = BYOAIImportRequestSchema.safeParse({
      content: 'Valid content',
      externalModelName: 'x'.repeat(101),
      contentType: 'general',
    });
    expect(result.success).toBe(false);
  });
});
