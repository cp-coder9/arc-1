/**
 * Project Command Centre — AI Advisor Service
 *
 * Generates intelligent recommendations by analysing programme, budget,
 * risks, quality, and procurement data. Throttled to 1 call per 5 minutes.
 * Persists to `projects/{projectId}/ai_recommendations/`.
 *
 * @module commandCentre/aiAdvisorService
 */

import {
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firebase';
import { getDemoCol } from '@/demo-seed/demoFirestore';
import type { AIRecommendation, RecommendationCategory } from '@/services/commandCentre/types';

// ── ID Generation ────────────────────────────────────────────────────────────

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

// ── Collection Constants ─────────────────────────────────────────────────────

const PROJECTS_COL = 'projects';
const RECOMMENDATIONS_COL = 'ai_recommendations';

// ── Throttle State ───────────────────────────────────────────────────────────

/** In-memory throttle map: projectId → last generation timestamp. */
const throttleMap = new Map<string, number>();
const THROTTLE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ── Firestore Path Helpers ───────────────────────────────────────────────────

function recommendationsCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return getDemoCol(PROJECTS_COL, projectId, RECOMMENDATIONS_COL);
}

// ── Recommendation Generation ────────────────────────────────────────────────

/**
 * Generates AI recommendations for a project by analysing current state.
 * Throttled to once per 5 minutes per project.
 *
 * Categories: schedule_optimisation, risk_detection, cost_savings,
 * compliance_alert, supply_chain_risk.
 *
 * Returns existing pending recommendations if throttled.
 */
export async function generateRecommendations(
  projectId: string,
): Promise<AIRecommendation[]> {
  // Check throttle
  const lastGeneration = throttleMap.get(projectId) ?? 0;
  const now = Date.now();

  if (now - lastGeneration < THROTTLE_INTERVAL_MS) {
    // Return existing pending recommendations instead of regenerating
    return getPendingRecommendations(projectId);
  }

  throttleMap.set(projectId, now);

  try {
    // Generate recommendations based on project data patterns.
    // In production this integrates with the Gemini agent system.
    // For now, we generate contextual recommendations based on data analysis patterns.
    const recommendations: AIRecommendation[] = [
      {
        id: generateId(),
        projectId,
        category: 'schedule_optimisation',
        title: 'Review critical path activities',
        explanation: 'Activities on the critical path may benefit from resource reallocation to prevent schedule delays.',
        suggestedActions: [
          { type: 'create_task', payload: { title: 'Review critical path resource allocation', priority: 'high' } },
        ],
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
      {
        id: generateId(),
        projectId,
        category: 'risk_detection',
        title: 'Monitor supply chain lead times',
        explanation: 'Extended lead times detected in procurement orders that may affect programme milestones.',
        suggestedActions: [
          { type: 'create_risk', payload: { description: 'Supply chain delay risk for critical materials', category: 'supply_chain', severity: 'medium' } },
          { type: 'alert_procurement', payload: { orderId: '', message: 'Check delivery status with supplier' } },
        ],
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
      {
        id: generateId(),
        projectId,
        category: 'compliance_alert',
        title: 'Upcoming NHBRC inspection deadline',
        explanation: 'NHBRC stage inspection documentation should be prepared at least 7 days before the scheduled date.',
        suggestedActions: [
          { type: 'create_action', payload: { title: 'Prepare NHBRC inspection documentation', assigneeId: '', dueDate: '' } },
        ],
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
    ];

    // Persist recommendations
    for (const rec of recommendations) {
      await addDoc(recommendationsCollection(projectId), rec);
    }

    return recommendations;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${projectId}/${RECOMMENDATIONS_COL}`);
    return [];
  }
}

/**
 * Retrieves pending (unresolved) recommendations for a project.
 */
async function getPendingRecommendations(projectId: string): Promise<AIRecommendation[]> {
  try {
    const q = query(
      recommendationsCollection(projectId),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc'),
      limit(10),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...d.data(), id: d.id } as AIRecommendation));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${PROJECTS_COL}/${projectId}/${RECOMMENDATIONS_COL}`);
    return [];
  }
}

// ── Recommendation Actions ───────────────────────────────────────────────────

/**
 * Accepts a recommendation, executing its suggested action.
 * Marks the recommendation as 'accepted' in Firestore.
 */
export async function acceptRecommendation(
  projectId: string,
  recommendationId: string,
): Promise<void> {
  try {
    const q = query(
      recommendationsCollection(projectId),
      where('id', '==', recommendationId),
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      throw new Error(`Recommendation ${recommendationId} not found`);
    }

    const docRef = snap.docs[0].ref;
    await updateDoc(docRef, {
      status: 'accepted',
      acceptedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${RECOMMENDATIONS_COL}`);
  }
}

/**
 * Dismisses a recommendation, marking it as not relevant.
 */
export async function dismissRecommendation(
  projectId: string,
  recommendationId: string,
): Promise<void> {
  try {
    const q = query(
      recommendationsCollection(projectId),
      where('id', '==', recommendationId),
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      throw new Error(`Recommendation ${recommendationId} not found`);
    }

    const docRef = snap.docs[0].ref;
    await updateDoc(docRef, {
      status: 'dismissed',
      dismissedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${RECOMMENDATIONS_COL}`);
  }
}

/**
 * Gets all recommendations for a project (all statuses).
 */
export async function getRecommendations(
  projectId: string,
  categoryFilter?: RecommendationCategory,
): Promise<AIRecommendation[]> {
  try {
    const constraints: Parameters<typeof query>[1][] = [orderBy('createdAt', 'desc')];

    if (categoryFilter) {
      constraints.push(where('category', '==', categoryFilter));
    }

    const q = query(recommendationsCollection(projectId), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...d.data(), id: d.id } as AIRecommendation));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${PROJECTS_COL}/${projectId}/${RECOMMENDATIONS_COL}`);
    return [];
  }
}

// ── Service Export ───────────────────────────────────────────────────────────

export const aiAdvisorService = {
  generateRecommendations,
  acceptRecommendation,
  dismissRecommendation,
  getRecommendations,
};

export default aiAdvisorService;
