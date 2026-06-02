import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AgentEvent, AgentRecommendation, AgentSurface, AgentActionStatus } from '@/types';
import { getAgentConfig, callGeminiProxy, getLLMConfig } from '../geminiService';
import { Agent } from '@/types';

/**
 * Service for generating and managing agent recommendations
 */
export class AgentRecommendationService {
  private static readonly RECOMMENDATIONS_COLLECTION = 'agentRecommendations';
  private static readonly EVENTS_COLLECTION = 'agentEvents';
  private static readonly TOOL_INVOCATIONS_COLLECTION = 'agentToolInvocations';
  private static readonly DECISIONS_COLLECTION = 'agentDecisions';

  /**
   * Generate recommendation for an event using available agents
   */
  static async generateRecommendation(event: AgentEvent): Promise<AgentRecommendation | null> {
    try {
      // For now, we'll use the briefing agent as our first integrated specialist agent
      // In a full implementation, we'd route to appropriate agents based on event type
      if (event.type === 'job_created' || event.type === 'brief_submitted') {
        // Safely extract description from payload based on event type
        let description = 'No description provided';
        if (event.type === 'job_created') {
          description = ((event.payload as any)?.jobData?.description) ||
                       ((event.payload as any)?.description) ||
                       'No description provided';
        } else if (event.type === 'brief_submitted') {
          description = (event.payload as any)?.description || 'No description provided';
        }
                           
        const briefResult = await this.runBriefingAgent(description);
        if (briefResult) {
          const recommendation: AgentRecommendation = {
            id: `rec_${event.id}`,
            agentId: 'briefing_agent',
            jobId: event.jobId,
            userId: event.userId,
            surface: 'dashboard' as AgentSurface,
            title: 'Project Brief Analysis',
            summary: `Suggested category: ${briefResult.suggestedCategory}. Estimated budget: R${briefResult.estimatedBudget.min.toLocaleString()} - R${briefResult.estimatedBudget.max.toLocaleString()}.`,
            suggestedAction: {
              label: 'View Detailed Analysis',
              actionType: 'navigate_to_brief_analysis',
              payload: {
                analysis: briefResult,
                sourceEventId: event.id
              }
            },
            status: 'suggested' as AgentActionStatus,
            requiresHumanApproval: true,
            createdAt: new Date().toISOString()
          };
          
          // Save recommendation
          await this.saveRecommendation(recommendation);
          return recommendation;
        }
      }
      
      // For other event types, provide a generic recommendation
      const genericRecommendation: AgentRecommendation = {
        id: `rec_${event.id}`,
        agentId: 'platform_agent',
        jobId: event.jobId,
        userId: event.userId,
        surface: 'notification' as AgentSurface,
        title: 'Platform Event Processed',
        summary: `Agent processed ${event.type} event for ${event.ownerType}: ${event.ownerId}.`,
        suggestedAction: {
          label: 'View Details',
          actionType: 'view_event_details',
          payload: {
            eventId: event.id
          }
        },
        status: 'suggested' as AgentActionStatus,
        requiresHumanApproval: false,
        createdAt: new Date().toISOString()
      };
      
      await this.saveRecommendation(genericRecommendation);
      return genericRecommendation;
    } catch (error) {
      console.error('Failed to generate agent recommendation:', error);
      return null;
    }
  }

  /**
   * Run the briefing agent on a project description
   */
  private static async runBriefingAgent(description: string): Promise<any> {
    try {
      // Import the briefing agent function
      const { analyzeBrief } = await import('../agents/briefingAgent');
      return await analyzeBrief(description);
    } catch (error) {
      console.warn('Briefing agent unavailable:', error);
      return null;
    }
  }

  /**
   * Save recommendation to Firestore
   */
  private static async saveRecommendation(recommendation: AgentRecommendation): Promise<void> {
    const ref = doc(collection(db, this.RECOMMENDATIONS_COLLECTION));
    await setDoc(ref, {
      ...recommendation,
      id: recommendation.id // Ensure ID is stored
    });
  }

  /**
   * Get recommendations for a user or project
   */
  static async getRecommendationsForOwner(
    ownerType: 'user' | 'project',
    ownerId: string,
    limitCount = 10
  ): Promise<AgentRecommendation[]> {
    const q = query(
      collection(db, this.RECOMMENDATIONS_COLLECTION),
      where(`${ownerType}Id`, '==', ownerId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as AgentRecommendation[];
  }

  /**
   * Update recommendation status
   */
  static async updateRecommendationStatus(
    recommendationId: string,
    status: AgentActionStatus,
    appliedBy?: string
  ): Promise<void> {
    const ref = doc(db, this.RECOMMENDATIONS_COLLECTION, recommendationId);
    await updateDoc(ref, {
      status,
      updatedAt: new Date().toISOString(),
      appliedBy: appliedBy || undefined,
      appliedAt: appliedBy ? new Date().toISOString() : undefined
    });
  }

  /**
   * Log agent event for audit trail
   */
  static async logEvent(event: AgentEvent): Promise<void> {
    const ref = doc(collection(db, this.EVENTS_COLLECTION));
    await setDoc(ref, {
      ...event,
      id: event.id
    });
  }

  /**
   * Log tool invocation for audit trail
   */
  static async logToolInvocation(
    agentId: string,
    toolName: string,
    input: Record<string, unknown>,
    output: Record<string, unknown> | null,
    success: boolean
  ): Promise<void> {
    const ref = doc(collection(db, this.TOOL_INVOCATIONS_COLLECTION));
    await setDoc(ref, {
      agentId,
      toolName,
      input,
      output,
      success,
      timestamp: new Date().toISOString(),
      id: `${agentId}_${toolName}_${Date.now()}`
    });
  }

  /**
   * Log agent decision for audit trail
   */
  static async logDecision(
    recommendationId: string,
    decision: 'approved' | 'rejected' | 'modified',
    decidedBy: string,
    notes?: string
  ): Promise<void> {
    const ref = doc(collection(db, this.DECISIONS_COLLECTION));
    await setDoc(ref, {
      recommendationId,
      decision,
      decidedBy,
      notes,
      timestamp: new Date().toISOString(),
      id: `dec_${recommendationId}_${Date.now()}`
    });
  }
}

export default AgentRecommendationService;
