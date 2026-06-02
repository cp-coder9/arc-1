/**
 * Gemini Service Tests
 * Tests for AI review orchestration
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import {
  reviewDrawing,
  AIUtils,
  SPECIALIZED_AGENTS
} from '../geminiService';
import { resolveAgentsForMode } from '../agentSelectionService';
import { AIReviewResult } from '@/types';

// Mock fetch globally
const mockFetch = jest.fn<any>();
(global as any).fetch = mockFetch;

// Mock firebase
jest.mock('@/lib/firebase', () => ({
  db: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
      })),
    })),
  },
  auth: {
    currentUser: {
      uid: 'test-user-id',
      getIdToken: jest.fn(() => Promise.resolve('mock-firebase-id-token')),
    },
  },
}));

// Mock firestore functions
jest.mock('firebase/firestore', () => ({
  getDocs: jest.fn(() => Promise.resolve({
    empty: false,
    docs: SPECIALIZED_AGENTS.map(agent => ({
      id: agent.role,
      data: () => ({ ...agent, id: agent.role })
    }))
  })),
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(() => Promise.resolve({ exists: () => false })),
  updateDoc: jest.fn(() => Promise.resolve()),
  addDoc: jest.fn(() => Promise.resolve({ id: 'new-doc-id' })),
}));

describe('AIUtils.parseAIResponse', () => {
  test('should parse direct JSON response', () => {
    const response = JSON.stringify({
      status: 'passed',
      feedback: 'Good',
      categories: [],
      traceLog: 'Test'
    });

    const result = AIUtils.parseAIResponse(response);
    expect(result.status).toBe('passed');
    expect(result.feedback).toBe('Good');
  });

  test('should parse markdown-wrapped JSON', () => {
    const response = '```json\n{"status": "failed", "feedback": "Issues found", "categories": [], "traceLog": "Error"}\n```';

    const result = AIUtils.parseAIResponse(response);
    expect(result.status).toBe('failed');
  });

  test('should parse JSON within curly braces', () => {
    const response = 'Some text {"status": "passed", "feedback": "OK", "categories": [], "traceLog": "Test"} more text';

    const result = AIUtils.parseAIResponse(response);
    expect(result.status).toBe('passed');
  });

  test('should apply heuristic parsing on unparseable response', () => {
    const result = AIUtils.parseAIResponse('invalid');

    expect(result.status).toBe('failed');
    expect(result.feedback).toBe('invalid');
    expect(result.traceLog).toContain('Heuristic parsing');
  });
});

describe('AIUtils.callAgentReview', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    jest.clearAllMocks();
  });

  test('routes NVIDIA agent requests through /api/review with Firebase bearer auth', async () => {
    (mockFetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              status: 'failed',
              feedback: 'NVIDIA agent reviewed drawing',
              categories: [],
              traceLog: 'nvidia-test',
            }),
          },
        }],
      }),
    });

    const result = await AIUtils.callAgentReview(
      'You are a SANS 10400 wall checker.',
      'Review this drawing.',
      'https://example.public.blob.vercel-storage.com/test.png',
      {
        provider: 'nvidia',
        apiKey: 'client-side-placeholder',
        model: 'meta/llama-3.2-90b-vision-instruct',
        baseUrl: 'https://integrate.api.nvidia.com/v1',
      },
      {
        id: 'wall_checker',
        role: 'wall_checker',
        name: 'Wall Agent',
        description: 'Wall compliance',
        systemPrompt: 'Check walls',
        temperature: 0.1,
        status: 'online',
        lastActive: new Date().toISOString(),
      }
    );

    expect(result).toContain('NVIDIA agent reviewed drawing');
    expect(mockFetch).toHaveBeenCalledWith('/api/review', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
      }),
    }));
  });
});

describe('AIUtils.withRetry', () => {
  test('should return result on first success', async () => {
    const fn = jest.fn<() => Promise<string>>().mockResolvedValue('success');

    const result = await AIUtils.withRetry(fn, 3);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('should retry on failure', async () => {
    const fn = jest.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('fail1'))
      .mockRejectedValueOnce(new Error('fail2'))
      .mockResolvedValue('success');

    const result = await AIUtils.withRetry(fn, 3);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('AIUtils.parseAIResponseV2', () => {
  test('should parse V2 risk status and findings', () => {
    const result = AIUtils.parseAIResponseV2(JSON.stringify({
      status: 'failed',
      feedback: 'Needs review',
      riskStatus: 'requires_specialist_design',
      findings: [{
        title: 'Fire plan missing',
        description: 'No fire plan supplied.',
        discipline: 'fire',
        standardFamily: 'SANS10400',
        reference: 'SANS 10400-T',
        severity: 'high',
        confidence: 'high',
        autonomyLabel: 'professional_review_required',
        responsibleParty: 'fire_engineer',
        actionItem: 'Provide fire plan.',
        evidence: 'Submission index has no fire plan.',
        sourceCitations: [],
        drawingReferences: [],
        requiresProfessionalSignoff: true
      }],
      signOffChecklist: [],
      categories: [],
      traceLog: 'ok'
    }));

    expect(result.riskStatus).toBe('requires_specialist_design');
    expect(result.findings?.[0].discipline).toBe('fire');
  });
});

describe('agent selection', () => {
  test('should include fire agent for fire plan mode', () => {
    expect(resolveAgentsForMode('fire_plan_review')).toContain('fire_safety');
  });

  test('should include scoped discipline agents', () => {
    expect(resolveAgentsForMode('basic_ai_screen', { disciplines: ['drainage'] })).toContain('drainage_stormwater');
  });
});

describe('reviewDrawing', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
  });

  test('should return review result on success', async () => {
    // Orchestrator summary mock
    const mockSuccessResponse = {
      choices: [{
        message: {
          content: JSON.stringify({
              status: 'passed',
              feedback: 'All good',
              categories: [{ name: 'Walls', issues: [] }],
              traceLog: 'Test trace'
            })
        }
      }]
    };

    const mockScopeResponse = {
      choices: [{
        message: {
          content: JSON.stringify({
            route: 'standard',
            requiredAgents: ['wall_compliance_specialist']
          })
        }
      }]
    };

    // Agent findings mock
    const mockAgentResponse = {
      choices: [{
        message: {
          content: JSON.stringify({
            status: 'passed',
            riskStatus: 'ready_for_admin_review',
            findings: [],
            categories: [],
            signOffChecklist: [],
            feedback: 'No issues detected in this sector.'
          })
        }
      }]
    };

    // Need multiple mocks for the multiple stages of reviewDrawing
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockScopeResponse
    }).mockResolvedValueOnce({
      ok: true,
      json: async () => mockAgentResponse
    }).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSuccessResponse
    }).mockResolvedValue({
      ok: true,
      json: async () => mockSuccessResponse
    });

    const result = await reviewDrawing(
      'https://example.com/drawing.pdf',
      'test-drawing'
    );

    expect(result.status).toBe('passed');
    expect(mockFetch).toHaveBeenCalled();
  });

  test('should return failed status on API error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await reviewDrawing(
      'https://example.com/drawing.pdf',
      'test-drawing'
    );

    expect(result.status).toBe('failed');
    expect(result.feedback).toContain('error');
  });
});
