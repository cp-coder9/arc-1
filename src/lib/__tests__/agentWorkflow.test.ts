import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Router } from 'express';
import apiRouter from '../api-router';

// Mock the agent services
vi.mock('../services/agentWorkflow/agentService', () => ({
  AgentService: {
    getOrCreateUserAgent: vi.fn(),
    getOrCreateProjectAgent: vi.fn(),
    getAgentContext: vi.fn(),
    updateAgentContext: vi.fn(),
  },
}));
vi.mock('../services/agentWorkflow/agentEventNormalizer', () => ({
  default: {
    normalizeEvent: vi.fn(),
  },
}));
vi.mock('../services/agentWorkflow/agentRecommendationService', () => ({
  AgentRecommendationService: {
    generateRecommendation: vi.fn(),
    saveRecommendation: vi.fn(),
    getRecommendationsForOwner: vi.fn(),
    updateRecommendationStatus: vi.fn(),
    logEvent: vi.fn(),
    logToolInvocation: vi.fn(),
    logDecision: vi.fn(),
  },
}));

// Mock the verifyAuth function
vi.mock('../middleware/verifyAuth', () => ({
  verifyAuth: vi.fn().mockResolvedValue({ uid: 'test-user-id' }),
}));

// Mock the rate limiter
vi.mock('express-rate-limit', () => {
  return vi.fn().mockImplementation((options) => {
    return (req, res, next) => next();
  });
});

describe('Agent Workflow API Endpoints', () => {
  let router: Router;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    router = Router();
    router.use('/api', apiRouter);
  });

  describe('POST /api/agents', () => {
    it('should create a user agent', async () => {
      const mockAgentId = 'user-agent-123';
      // @ts-expect-error - mocking
      require('../services/agentWorkflow/agentService').AgentService.getOrCreateUserAgent.mockResolvedValue(mockAgentId);

      const res = await router.handle(
        {
          method: 'POST',
          url: '/api/agents',
          headers: { authorization: 'Bearer fake-token' },
          body: { ownerType: 'user', ownerId: 'user-123', context: { test: true } },
        },
        { status: 200 }
      );

      expect(res.statusCode).toBe(200);
      expect(res._getJSON()).toEqual({
        agentId: mockAgentId,
        ownerType: 'user',
        ownerId: 'user-123',
      });
    });

    it('should create a project agent', async () => {
      const mockAgentId = 'project-agent-456';
      // @ts-expect-error - mocking
      require('../services/agentWorkflow/agentService').AgentService.getOrCreateProjectAgent.mockResolvedValue(mockAgentId);

      const res = await router.handle(
        {
          method: 'POST',
          url: '/api/agents',
          headers: { authorization: 'Bearer fake-token' },
          body: { ownerType: 'project', ownerId: 'job-123', context: { stage: 'intake' } },
        },
        { status: 200 }
      );

      expect(res.statusCode).toBe(200);
      expect(res._getJSON()).toEqual({
        agentId: mockAgentId,
        ownerType: 'project',
        ownerId: 'job-123',
      });
    });

    it('should return 400 for invalid ownerType', async () => {
      const res = await router.handle(
        {
          method: 'POST',
          url: '/api/agents',
          headers: { authorization: 'Bearer fake-token' },
          body: { ownerType: 'invalid', ownerId: '123' },
        },
        { status: 400 }
      );

      expect(res.statusCode).toBe(400);
      expect(res._getJSON().error).toContain('ownerType must be');
    });
  });

  describe('GET /api/agents/me', () => {
    it('should return the current user agent and context', async () => {
      const mockAgentId = 'user-agent-789';
      const mockContext = { id: mockAgentId, ownerType: 'user', ownerId: 'user-123', context: { test: true }, updatedAt: new Date().toISOString() };
      // @ts-expect-error - mocking
      require('../services/agentWorkflow/agentService').AgentService.getOrCreateUserAgent.mockResolvedValue(mockAgentId);
      // @ts-expect-error - mocking
      require('../services/agentWorkflow/agentService').AgentService.getAgentContext.mockResolvedValue(mockContext);

      const res = await router.handle(
        {
          method: 'GET',
          url: '/api/agents/me',
          headers: { authorization: 'Bearer fake-token' },
        },
        { status: 200 }
      );

      expect(res.statusCode).toBe(200);
      expect(res._getJSON()).toEqual({
        agentId: mockAgentId,
        context: mockContext,
      });
    });
  });

  describe('GET /api/jobs/:jobId/agent', () => {
    it('should return the project agent and context', async () => {
      const jobId = 'job-456';
      const mockAgentId = jobId; // as per implementation
      const mockContext = { id: mockAgentId, ownerType: 'project', ownerId: jobId, context: { stage: 'intake' }, updatedAt: new Date().toISOString() };
      // @ts-expect-error - mocking
      require('../services/agentWorkflow/agentService').AgentService.getOrCreateProjectAgent.mockResolvedValue(mockAgentId);
      // @ts-expect-error - mocking
      require('../services/agentWorkflow/agentService').AgentService.getAgentContext.mockResolvedValue(mockContext);

      const res = await router.handle(
        {
          method: 'GET',
          url: `/api/jobs/${jobId}/agent`,
          headers: { authorization: 'Bearer fake-token' },
        },
        { status: 200 }
      );

      expect(res.statusCode).toBe(200);
      expect(res._getJSON()).toEqual({
        agentId: mockAgentId,
        context: mockContext,
      });
    });
  });

  describe('POST /api/agents/event', () => {
    it('should process an event and generate a recommendation', async () => {
      const mockEvent = {
        id: 'event-123',
        type: 'job_created',
        ownerType: 'project',
        ownerId: 'job-123',
        jobId: 'job-123',
        userId: 'user-123',
        source: 'workflow',
        payload: { jobData: { description: 'Test job' } },
        createdAt: new Date().toISOString(),
      };
      // @ts-expect-error - mocking
      require('../services/agentWorkflow/agentEventNormalizer').default.normalizeEvent.mockReturnValue(mockEvent);
      const mockRecommendation = {
        id: 'rec-123',
        agentId: 'briefing_agent',
        jobId: 'job-123',
        userId: 'user-123',
        surface: 'dashboard',
        title: 'Test Recommendation',
        summary: 'Test summary',
        suggestedAction: { label: 'Test', actionType: 'test', payload: {} },
        status: 'suggested',
        requiresHumanApproval: true,
        createdAt: new Date().toISOString(),
      };
      // @ts-expect-error - mocking
      require('../services/agentWorkflow/agentRecommendationService').AgentRecommendationService.generateRecommendation.mockResolvedValue(mockRecommendation);

      const res = await router.handle(
        {
          method: 'POST',
          url: '/api/agents/event',
          headers: { authorization: 'Bearer fake-token' },
          body: {
            type: 'job_created',
            ownerType: 'project',
            ownerId: 'job-123',
            source: 'workflow',
            payload: { jobData: { description: 'Test job' } },
            userId: 'user-123',
            jobId: 'job-123',
          },
        },
        { status: 200 }
      );

      expect(res.statusCode).toBe(200);
      expect(res._getJSON()).toEqual({ recommendation: mockRecommendation });
    });

    it('should return 500 if recommendation generation fails', async () => {
      const mockEvent = {
        id: 'event-123',
        type: 'job_created',
        ownerType: 'project',
        ownerId: 'job-123',
        jobId: 'job-123',
        userId: 'user-123',
        source: 'workflow',
        payload: { jobData: { description: 'Test job' } },
        createdAt: new Date().toISOString(),
      };
      // @ts-expect-error - mocking
      require('../services/agentWorkflow/agentEventNormalizer').default.normalizeEvent.mockReturnValue(mockEvent);
      // @ts-expect-error - mocking
      require('../services/agentWorkflow/agentRecommendationService').AgentRecommendationService.generateRecommendation.mockResolvedValue(null);

      const res = await router.handle(
        {
          method: 'POST',
          url: '/api/agents/event',
          headers: { authorization: 'Bearer fake-token' },
          body: {
            type: 'job_created',
            ownerType: 'project',
            ownerId: 'job-123',
            source: 'workflow',
            payload: { jobData: { description: 'Test job' } },
            userId: 'user-123',
            jobId: 'job-123',
          },
        },
        { status: 500 }
      );

      expect(res.statusCode).toBe(500);
      expect(res._getJSON().error).toBe('Failed to generate recommendation');
    });
  });
});