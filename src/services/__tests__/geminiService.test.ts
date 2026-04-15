/**
 * Gemini Service Tests
 * Tests for AI review orchestration
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import {
  reviewDrawing,
  parseAIResponse,
  withRetry,
  SPECIALIZED_AGENTS,
  AIReviewResult
} from '../geminiService';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('parseAIResponse', () => {
  test('should parse direct JSON response', () => {
    const response = JSON.stringify({
      status: 'passed',
      feedback: 'Good',
      categories: [],
      traceLog: 'Test'
    });

    const result = parseAIResponse(response);
    expect(result.status).toBe('passed');
    expect(result.feedback).toBe('Good');
  });

  test('should parse markdown-wrapped JSON', () => {
    const response = '```json\n{"status": "failed", "feedback": "Issues found", "categories": [], "traceLog": "Error"}\n```';

    const result = parseAIResponse(response);
    expect(result.status).toBe('failed');
  });

  test('should parse JSON within curly braces', () => {
    const response = 'Some text {"status": "passed", "feedback": "OK", "categories": [], "traceLog": "Test"} more text';

    const result = parseAIResponse(response);
    expect(result.status).toBe('passed');
  });

  test('should throw on unparseable response', () => {
    expect(() => parseAIResponse('invalid')).toThrow('Could not parse AI response');
  });
});

describe('withRetry', () => {
  test('should return result on first success', async () => {
    const fn = jest.fn().mockResolvedValue('success');

    const result = await withRetry(fn, 3);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('should retry on failure', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('fail1'))
      .mockRejectedValueOnce(new Error('fail2'))
      .mockResolvedValue('success');

    const result = await withRetry(fn, 3);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test('should throw after max retries', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('always fails'));

    await expect(withRetry(fn, 2)).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('SPECIALIZED_AGENTS', () => {
  test('should have all required agents', () => {
    const agentNames = SPECIALIZED_AGENTS.map(a => a.role);

    expect(agentNames).toContain('orchestrator');
    expect(agentNames).toContain('wall_checker');
    expect(agentNames).toContain('window_checker');
    expect(agentNames).toContain('door_checker');
    expect(agentNames).toContain('area_checker');
    expect(agentNames).toContain('compliance_checker');
    expect(agentNames).toContain('sans_compliance');
  });

  test('each agent should have system prompt', () => {
    SPECIALIZED_AGENTS.forEach(agent => {
      expect(agent.systemPrompt).toBeTruthy();
      expect(agent.systemPrompt.length).toBeGreaterThan(100);
    });
  });
});

describe('reviewDrawing', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  test('should return review result on success', async () => {
    const mockResponse = {
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

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });

    const result = await reviewDrawing(
      'https://example.com/drawing.pdf',
      'test-drawing',
      jest.fn()
    );

    expect(result.status).toBe('passed');
    expect(result.feedback).toBe('All good');
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
