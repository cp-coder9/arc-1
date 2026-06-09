import { collection, doc, addDoc, getDocs, onSnapshot, query, orderBy, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import type { SiteAgentRecommendation, Severity } from '@/types';

const PROJECTS_COL = 'projects';
const RECOMMENDATIONS_COL = 'site_agent_recommendations';

type FirestoreUnsubscribe = () => void;

function recommendationsCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return collection(db, PROJECTS_COL, projectId, RECOMMENDATIONS_COL);
}

function recommendationDocument(projectId: string, recommendationId: string) {
  if (!recommendationId) throw new Error('recommendationId is required');
  return doc(db, PROJECTS_COL, projectId, RECOMMENDATIONS_COL, recommendationId);
}

function withId<T extends { id: string }>(snap: { id: string; data: () => Record<string, unknown> }): T {
  return { id: snap.id, ...snap.data() } as T;
}

export async function createRecommendation(input: {
  projectId: string;
  agentKey: string;
  title: string;
  rationale: string;
  sourceObjectId: string;
  severity: Severity;
}): Promise<string> {
  try {
    const now = new Date().toISOString();
    const rec: Omit<SiteAgentRecommendation, 'id'> = {
      projectId: input.projectId,
      agentKey: input.agentKey,
      title: input.title,
      rationale: input.rationale,
      sourceObjectId: input.sourceObjectId,
      severity: input.severity,
      status: 'suggested',
      createdAt: now,
    };
    const ref = await addDoc(recommendationsCollection(input.projectId), rec);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${input.projectId}/${RECOMMENDATIONS_COL}`);
  }
}

export async function applyRecommendation(
  projectId: string,
  recommendationId: string,
): Promise<void> {
  try {
    await updateDoc(recommendationDocument(projectId, recommendationId), {
      status: 'applied',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${RECOMMENDATIONS_COL}/${recommendationId}`);
  }
}

export async function dismissRecommendation(
  projectId: string,
  recommendationId: string,
): Promise<void> {
  try {
    await updateDoc(recommendationDocument(projectId, recommendationId), {
      status: 'dismissed',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${RECOMMENDATIONS_COL}/${recommendationId}`);
  }
}

export async function getRecommendations(projectId: string): Promise<SiteAgentRecommendation[]> {
  try {
    const snap = await getDocs(query(recommendationsCollection(projectId), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => withId<SiteAgentRecommendation>(d));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${RECOMMENDATIONS_COL}`);
  }
}

export function subscribeToRecommendations(
  projectId: string,
  cb: (recs: SiteAgentRecommendation[]) => void,
): FirestoreUnsubscribe {
  const q = query(recommendationsCollection(projectId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => withId<SiteAgentRecommendation>(d))), (error) => {
    console.error('Failed to subscribe to recommendations:', error);
    cb([]);
  });
}

/** Generate field-control recommendations from connected site state */
export async function generateFieldRecommendations(projectId: string, input: {
  hasRespondedRfiNeedingInstruction: boolean;
  rfiId?: string;
  hasBlockingNcr: boolean;
  ncrId?: string;
  ncrSeverity?: Severity;
  hasBlockingSnag: boolean;
  snagId?: string;
  snagSeverity?: Severity;
  hasNoticeRequiredWarning: boolean;
  warningId?: string;
  activeBlockerCount: number;
  firstBlockerId?: string;
}): Promise<string[]> {
  const ids: string[] = [];

  if (input.hasRespondedRfiNeedingInstruction && input.rfiId) {
    ids.push(await createRecommendation({
      projectId,
      agentKey: 'site_execution_agent',
      title: 'Convert RFI response into authorised site instruction',
      rationale: 'The professional response requires a formal instruction before work proceeds.',
      sourceObjectId: input.rfiId,
      severity: 'medium',
    }));
  }

  if (input.hasBlockingNcr && input.ncrId && input.ncrSeverity) {
    ids.push(await createRecommendation({
      projectId,
      agentKey: 'quality_control_agent',
      title: 'Resolve NCR before recommending payment release',
      rationale: 'High/critical NCR remains open and is configured as a payment blocker.',
      sourceObjectId: input.ncrId,
      severity: input.ncrSeverity,
    }));
  }

  if (input.hasBlockingSnag && input.snagId && input.snagSeverity) {
    ids.push(await createRecommendation({
      projectId,
      agentKey: 'snag_agent',
      title: 'Reinspect priority snag before closeout/payment',
      rationale: 'Priority snag remains unresolved.',
      sourceObjectId: input.snagId,
      severity: input.snagSeverity,
    }));
  }

  if (input.hasNoticeRequiredWarning && input.warningId) {
    ids.push(await createRecommendation({
      projectId,
      agentKey: 'risk_early_warning_agent',
      title: 'Review delay notice and programme impact',
      rationale: 'Delay early warning indicates likely programme impact and requires human contract review.',
      sourceObjectId: input.warningId,
      severity: 'high',
    }));
  }

  if (input.activeBlockerCount > 0 && input.firstBlockerId) {
    ids.push(await createRecommendation({
      projectId,
      agentKey: 'finance_control_agent',
      title: 'Hold payment/release recommendation until field blockers clear',
      rationale: `${input.activeBlockerCount} active field-control blocker(s) exist.`,
      sourceObjectId: input.firstBlockerId,
      severity: 'high',
    }));
  }

  return ids;
}

export const agentRecommendationService = {
  createRecommendation,
  applyRecommendation,
  dismissRecommendation,
  getRecommendations,
  subscribeToRecommendations,
  generateFieldRecommendations,
};

export default agentRecommendationService;
