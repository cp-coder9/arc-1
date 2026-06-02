// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentEventNormalizer } from '../../services/agentWorkflow/agentEventNormalizer';
import { AgentRecommendationService } from '../../services/agentWorkflow/agentRecommendationService';

const firestoreMocks = vi.hoisted(() => ({
  setDocMock: vi.fn(),
  updateDocMock: vi.fn(),
  getDocsMock: vi.fn(),
  docMock: vi.fn((_dbOrCollection, collectionName?: string, id?: string) => ({
    collectionName,
    id: id ?? 'generated-doc-id',
  })),
  collectionMock: vi.fn((_db, collectionName: string) => ({ collectionName })),
}));

const { setDocMock, updateDocMock, getDocsMock, docMock, collectionMock } = firestoreMocks;

vi.mock('@/lib/firebase', () => ({
  db: { mocked: true },
}));

vi.mock('firebase/firestore', () => ({
  collection: firestoreMocks.collectionMock,
  doc: firestoreMocks.docMock,
  getDoc: vi.fn(),
  getDocs: firestoreMocks.getDocsMock,
  limit: vi.fn((count: number) => ({ type: 'limit', count })),
  orderBy: vi.fn((field: string, direction: string) => ({ type: 'orderBy', field, direction })),
  query: vi.fn((...parts: unknown[]) => ({ parts })),
  setDoc: firestoreMocks.setDocMock,
  updateDoc: firestoreMocks.updateDocMock,
  where: vi.fn((field: string, op: string, value: unknown) => ({ type: 'where', field, op, value })),
}));

vi.mock('../../services/agents/briefingAgent', () => ({
  analyzeBrief: vi.fn(),
}));

describe('agent workflow services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDocMock.mockResolvedValue(undefined);
    updateDocMock.mockResolvedValue(undefined);
    getDocsMock.mockResolvedValue({ docs: [] });
  });

  it('normalizes a job-created event as a project-owned workflow event', () => {
    const event = AgentEventNormalizer.normalizeJobCreationEvent(
      'user-123',
      'job-123',
      { description: 'Design a clinic reception extension' },
    );

    expect(event).toMatchObject({
      type: 'job_created',
      ownerType: 'project',
      ownerId: 'job-123',
      jobId: 'job-123',
      userId: 'user-123',
      source: 'workflow',
    });
    expect(event.payload).toMatchObject({
      createdBy: 'user-123',
      jobData: { description: 'Design a clinic reception extension' },
    });
    expect(event.id).toContain('job_created_job-123_');
  });

  it('normalizes a generic stage event with phase and timestamp payload', () => {
    const event = AgentEventNormalizer.normalizeEvent(
      'stage_transitioned',
      'project',
      'job-456',
      'workflow',
      { fromStage: 'brief', toStage: 'verification' },
      'user-456',
      'job-456',
      'verification',
    );

    expect(event).toMatchObject({
      type: 'stage_transitioned',
      ownerType: 'project',
      ownerId: 'job-456',
      userId: 'user-456',
      jobId: 'job-456',
      phase: 'verification',
      source: 'workflow',
    });
    expect(event.payload).toMatchObject({ fromStage: 'brief', toStage: 'verification' });
    expect(event.payload.timestamp).toEqual(expect.any(String));
  });

  it('creates and persists a generic notification recommendation for non-brief events', async () => {
    const event = AgentEventNormalizer.normalizeEvent(
      'stage_transitioned',
      'project',
      'job-789',
      'workflow',
      { toStage: 'construction' },
      'user-789',
      'job-789',
      'construction',
    );

    const recommendation = await AgentRecommendationService.generateRecommendation(event);

    expect(recommendation).toMatchObject({
      id: `rec_${event.id}`,
      agentId: 'platform_agent',
      jobId: 'job-789',
      userId: 'user-789',
      surface: 'notification',
      title: 'Platform Event Processed',
      requiresHumanApproval: false,
      status: 'suggested',
    });
    expect(recommendation?.suggestedAction).toMatchObject({
      label: 'View Details',
      actionType: 'view_event_details',
      payload: { eventId: event.id },
    });
    expect(collectionMock).toHaveBeenCalledWith({ mocked: true }, 'agentRecommendations');
    expect(setDocMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: `rec_${event.id}` }));
  });
});
