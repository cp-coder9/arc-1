import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, addDoc, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AgentEvent, AgentRecommendation, AgentOwnerType, AgentSurface, AgentActionStatus } from '@/types';

export interface AgentContext {
  id: string;
  ownerType: AgentOwnerType;
  ownerId: string;
  context: Record<string, unknown>;
  updatedAt: string;
}

/**
 * Service for managing agent registry and context
 */
export class AgentService {
  private static readonly USER_AGENTS_COLLECTION = 'userAgents';
  private static readonly PROJECT_AGENTS_COLLECTION = 'projectAgents';
  private static readonly AGENT_CONTEXTS_COLLECTION = 'agentContexts';

  /**
   * Create or get user agent
   */
  static async getOrCreateUserAgent(userId: string): Promise<string> {
    const agentRef = doc(db, this.USER_AGENTS_COLLECTION, userId);
    const agentSnap = await getDoc(agentRef);
    
    if (agentSnap.exists()) {
      return userId;
    }
    
    // Create new user agent record
    await setDoc(agentRef, {
      userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
      context: {
        onboardingComplete: false,
        preferences: {},
        role: ''
      }
    });
    
    return userId;
  }

  /**
   * Create or get project agent
   */
  static async getOrCreateProjectAgent(jobId: string): Promise<string> {
    const agentRef = doc(db, this.PROJECT_AGENTS_COLLECTION, jobId);
    const agentSnap = await getDoc(agentRef);
    
    if (agentSnap.exists()) {
      return jobId;
    }
    
    // Create new project agent record
    await setDoc(agentRef, {
      jobId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
      context: {
        briefCompleted: false,
        teamAppointed: false,
        currentStage: 'intake'
      }
    });
    
    return jobId;
  }

  /**
   * Get agent context
   */
  static async getAgentContext(agentId: string): Promise<AgentContext | null> {
    const contextRef = doc(db, this.AGENT_CONTEXTS_COLLECTION, agentId);
    const contextSnap = await getDoc(contextRef);
    
    if (!contextSnap.exists()) {
      return null;
    }
    
    const data = contextSnap.data();
    return {
      id: agentId,
      ownerType: data.ownerType,
      ownerId: data.ownerId,
      context: data.context || {},
      updatedAt: data.updatedAt
    };
  }

  /**
   * Update agent context
   */
  static async updateAgentContext(agentId: string, contextUpdate: Record<string, unknown>): Promise<void> {
    const contextRef = doc(db, this.AGENT_CONTEXTS_COLLECTION, agentId);
    const contextSnap = await getDoc(contextRef);
    
    if (contextSnap.exists()) {
      await updateDoc(contextRef, {
        context: { ...contextSnap.data().context, ...contextUpdate },
        updatedAt: new Date().toISOString()
      });
    } else {
      // Determine owner type from agentId pattern
      const ownerType = agentId.includes('job_') ? 'project' : 'user';
      const ownerId = ownerType === 'project' ? agentId.replace('job_', '') : agentId;
      
      await setDoc(contextRef, {
        id: agentId,
        ownerType,
        ownerId,
        context: contextUpdate,
        updatedAt: new Date().toISOString()
      });
    }
  }

  /**
   * Delete agent (for cleanup)
   */
  static async deleteUserAgent(userId: string): Promise<void> {
    await deleteDoc(doc(db, this.USER_AGENTS_COLLECTION, userId));
    await deleteDoc(doc(db, this.AGENT_CONTEXTS_COLLECTION, userId));
  }

  static async deleteProjectAgent(jobId: string): Promise<void> {
    await deleteDoc(doc(db, this.PROJECT_AGENTS_COLLECTION, jobId));
    await deleteDoc(doc(db, this.AGENT_CONTEXTS_COLLECTION, jobId));
  }
}

export default AgentService;
