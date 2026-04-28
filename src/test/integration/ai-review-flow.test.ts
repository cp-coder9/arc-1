/**
 * AI Review Flow Integration Tests
 * Tests the end-to-end AI compliance review process
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { reviewDrawing } from '../../services/geminiService';
import { db } from '../../lib/firebase';

// Mock fetch for LLM API calls
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

// Mock Firebase
jest.mock('../lib/firebase', () => ({
  db: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn(),
      })),
    })),
  },
}));

// Mock Firestore
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  getDocs: jest.fn(() =>
    Promise.resolve({
      empty: false,
      docs: [
        {
          id: 'wall-compliance-agent',
          data: () => ({
            role: 'wall_compliance_specialist',
            name: 'Wall Compliance Agent',
            systemPrompt: 'You are a wall compliance specialist.',
            temperature: 0.3,
            status: 'active',
          }),
        },
        {
          id: 'fenestration-agent',
          data: () => ({
            role: 'fenestration_specialist',
            name: 'Fenestration Agent',
            systemPrompt: 'You are a fenestration specialist.',
            temperature: 0.3,
            status: 'active',
          }),
        },
      ],
    })
  ),
  getDoc: jest.fn(() =>
    Promise.resolve({
      exists: () => true,
      data: () => ({
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        temperature: 0.3,
      }),
    })
  ),
  updateDoc: jest.fn(() => Promise.resolve()),
  addDoc: jest.fn(() => Promise.resolve({ id: 'new-log-id' })),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
}));

describe('AI Review Flow Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  test('should complete full AI review workflow', async () => {
    // Mock successful LLM responses for orchestrator and agents
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({
                  agents: ['wall_compliance_specialist', 'fenestration_specialist'],
                  priority: 'high',
                }),
              }],
            },
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({
                  status: 'passed',
                  feedback: 'Wall thickness complies with SANS 10400-K',
                  categories: [{
                    name: 'Wall Compliance',
                    issues: [],
                  }],
                  traceLog: 'Reviewed wall specifications',
                }),
              }],
            },
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({
                  status: 'passed',
                  feedback: 'Fenestration meets ventilation requirements',
                  categories: [{
                    name: 'Fenestration',
                    issues: [],
                  }],
                  traceLog: 'Reviewed window specifications',
                }),
              }],
            },
          }],
        }),
      });

    const result = await reviewDrawing(
      'https://example.com/drawing.pdf',
      'test-submission-123'
    );

    // Verify the review completed
    expect(result).toBeDefined();
    expect(result.status).toBe('passed');
    expect(result.feedback).toBeDefined();
    expect(result.categories).toBeInstanceOf(Array);
    expect(result.traceLog).toBeDefined();
  });

  test('should handle partial failures gracefully', async () => {
    // Mock orchestrator success but agent failure
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({
                  agents: ['wall_compliance_specialist'],
                  priority: 'high',
                }),
              }],
            },
          }],
        }),
      })
      .mockRejectedValueOnce(new Error('Agent timeout'));

    const result = await reviewDrawing(
      'https://example.com/drawing.pdf',
      'test-submission-456'
    );

    // Should return failed status but not crash
    expect(result).toBeDefined();
    expect(result.status).toBe('failed');
  });

  test('should handle all agents failing', async () => {
    mockFetch.mockRejectedValue(new Error('Service unavailable'));

    const result = await reviewDrawing(
      'https://example.com/drawing.pdf',
      'test-submission-789'
    );

    // Should handle complete failure gracefully
    expect(result).toBeDefined();
    expect(result.status).toBe('failed');
    expect(result.feedback).toContain('error');
  });

  test('should progress through review stages', async () => {
    const progressCallback = jest.fn();

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{ text: JSON.stringify({ agents: ['specialist'] }) }],
            },
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({
                  status: 'passed',
                  feedback: 'Compliant',
                  categories: [],
                  traceLog: 'Complete',
                }),
              }],
            },
          }],
        }),
      });

    await reviewDrawing(
      'https://example.com/drawing.pdf',
      'test-submission-progress',
      progressCallback
    );

    // Progress callback should have been called
    expect(progressCallback).toHaveBeenCalled();
  });
});
