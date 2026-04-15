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
import { AIReviewResult } from '../../types';

// Mock fetch globally
const mockFetch = jest.fn() as jest.Mock;
(global as any).fetch = mockFetch;

// Mock firebase
jest.mock('../../lib/firebase', () => ({
  db: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
      })),
    })),
  },
}));

// Mock getAgents
jest.mock('firebase/firestore', () => ({
  getDocs: jest.fn(() => Promise.resolve({
    empty: false,
    docs: SPECIALIZED_AGENTS.map(agent => ({
      id: agent.role,
      data: () => agent
    }))
  })),
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  doc: jest.fn(),
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

  test('should throw on unparseable response', () => {
    expect(() => AIUtils.parseAIResponse('invalid')).toThrow('Could not parse AI response');
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

  test('should throw after max retries', async () => {
    const fn = jest.fn<() => Promise<string>>().mockRejectedValue(new Error('always fails'));

    await expect(AIUtils.withRetry(fn, 2)).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('reviewDrawing', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    jest.clearAllMocks();
  });

  test('should return review result on success', async () => {
    const mockSuccessResponse = {
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              status: 'passed',
              feedback: 'All good',
              categories: [{ name: 'Walls', issues: [] }],
              traceLog: 'Test trace'
            })
          }]
        }
      }]
    };

    (mockFetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockSuccessResponse
    });

    const result = await reviewDrawing(
      'https://example.com/drawing.pdf',
      'test-drawing',
      jest.fn()
    );

    expect(result.status).toBe('passed');
    expect(result.feedback).toBe('All good');
    // orchestrator + at least one specialized agent
    expect(mockFetch).toHaveBeenCalled();
  });

  test('should return failed status on API error', async () => {
    (mockFetch as any).mockRejectedValue(new Error('Network error'));

    const result = await reviewDrawing(
      'https://example.com/drawing.pdf',
      'test-drawing'
    );

    expect(result.status).toBe('failed');
    expect(result.feedback).toContain('error');
  });
});
