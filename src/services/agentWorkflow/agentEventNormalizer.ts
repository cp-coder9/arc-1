import type { AgentEvent, AgentOwnerType, AgentSurface } from '@/types';

/**
 * Service for normalizing platform events into AgentEvent format
 */
export class AgentEventNormalizer {
  /**
   * Normalize onboarding/profile completion event
   */
  static normalizeOnboardingEvent(userId: string, profileData: any): AgentEvent {
    return {
      id: `onboarding_${userId}_${Date.now()}`,
      type: 'onboarding_completed',
      ownerType: 'user' as AgentOwnerType,
      ownerId: userId,
      userId: userId,
      source: 'dashboard' as AgentSurface,
      payload: {
        profileData,
        completionTimestamp: new Date().toISOString()
      },
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Normalize project brief/job creation event
   */
  static normalizeJobCreationEvent(userId: string, jobId: string, jobData: any): AgentEvent {
    return {
      id: `job_created_${jobId}_${Date.now()}`,
      type: 'job_created',
      ownerType: 'project' as AgentOwnerType,
      ownerId: jobId,
      jobId: jobId,
      userId: userId,
      source: 'workflow' as AgentSurface,
      payload: {
        jobData,
        createdBy: userId,
        creationTimestamp: new Date().toISOString()
      },
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Normalize project lifecycle stage transition event
   */
  static normalizeStageTransitionEvent(userId: string, jobId: string, fromStage: string, toStage: string): AgentEvent {
    return {
      id: `stage_transition_${jobId}_${Date.now()}`,
      type: 'stage_transitioned',
      ownerType: 'project' as AgentOwnerType,
      ownerId: jobId,
      jobId: jobId,
      userId: userId,
      phase: toStage,
      source: 'workflow' as AgentSurface,
      payload: {
        fromStage,
        toStage,
        transitionTimestamp: new Date().toISOString()
      },
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Normalize chat next-action suggestion event
   */
  static normalizeChatEvent(userId: string, jobId: string, message: string, context: any): AgentEvent {
    return {
      id: `chat_suggestion_${Date.now()}`,
      type: 'chat_suggestion',
      ownerType: 'project' as AgentOwnerType,
      ownerId: jobId,
      jobId: jobId,
      userId: userId,
      source: 'chat' as AgentSurface,
      payload: {
        message,
        context,
        timestamp: new Date().toISOString()
      },
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Normalize document upload event
   */
  static normalizeDocumentUploadEvent(userId: string, jobId: string, documentInfo: any): AgentEvent {
    return {
      id: `document_upload_${Date.now()}`,
      type: 'document_uploaded',
      ownerType: 'project' as AgentOwnerType,
      ownerId: jobId,
      jobId: jobId,
      userId: userId,
      source: 'document' as AgentSurface,
      payload: {
        documentInfo,
        uploadTimestamp: new Date().toISOString()
      },
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Generic event normalizer
   */
  static normalizeEvent(
    type: string,
    ownerType: AgentOwnerType,
    ownerId: string,
    source: AgentSurface,
    payload: Record<string, unknown>,
    userId?: string,
    jobId?: string,
    phase?: string
  ): AgentEvent {
    return {
      id: `${type}_${ownerId}_${Date.now()}`,
      type,
      ownerType,
      ownerId,
      userId: userId || undefined,
      jobId: jobId || undefined,
      phase: phase || undefined,
      source,
      payload: {
        ...payload,
        timestamp: new Date().toISOString()
      },
      createdAt: new Date().toISOString()
    };
  }
}

export default AgentEventNormalizer;
