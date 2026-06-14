import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  orderBy,
  limit,
  writeBatch,
} from 'firebase/firestore';
import type { PipelineProject, PipelineForecast, PipelineStatus } from '@/types';
import type { ProjectStage } from '@/types';

const PIPELINES_COL = 'pipelines';

function assertValidProbability(probability: number): void {
  if (probability < 0 || probability > 100) {
    throw new Error('Probability must be between 0 and 100.');
  }
}

function assertValidPipelineStatus(status: PipelineStatus): void {
  const valid: PipelineStatus[] = ['active', 'won', 'lost', 'abandoned', 'on_hold'];
  if (!valid.includes(status)) throw new Error(`Invalid pipeline status: ${status}`);
}

export async function addPipelineProject(input: {
  firmId: string;
  projectId: string;
  jobId?: string;
  title: string;
  stage: ProjectStage;
  status?: PipelineStatus;
  estimatedValueCents?: number;
  probability?: number;
  expectedCloseDate?: string;
  notes?: string;
  createdBy: string;
}): Promise<PipelineProject> {
  try {
    if (!input.firmId || !input.projectId || !input.title || !input.stage || !input.createdBy) {
      throw new Error('firmId, projectId, title, stage, and createdBy are required.');
    }
    if (input.probability !== undefined) assertValidProbability(input.probability);
    if (input.status) assertValidPipelineStatus(input.status);

    const now = new Date().toISOString();
    const ref = doc(collection(db, PIPELINES_COL));
    const project: PipelineProject = {
      id: ref.id,
      firmId: input.firmId,
      projectId: input.projectId,
      jobId: input.jobId,
      title: input.title.trim(),
      stage: input.stage,
      status: input.status || 'active',
      estimatedValueCents: input.estimatedValueCents || 0,
      probability: input.probability ?? 50,
      expectedCloseDate: input.expectedCloseDate,
      notes: input.notes?.trim(),
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(ref, project);
    return project;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, PIPELINES_COL);
  }
}

export async function updatePipelineStatus(
  id: string,
  status: PipelineStatus,
  updates?: { closedAt?: string; closedReason?: string; probability?: number; estimatedValueCents?: number; notes?: string }
): Promise<void> {
  try {
    assertValidPipelineStatus(status);
    if (updates?.probability !== undefined) assertValidProbability(updates.probability);

    const now = new Date().toISOString();
    const data: Record<string, unknown> = { status, updatedAt: now };

    if (status === 'won' || status === 'lost' || status === 'abandoned') {
      data.closedAt = updates?.closedAt || now;
      if (updates?.closedReason) data.closedReason = updates.closedReason;
    }
    if (updates?.probability !== undefined) data.probability = updates.probability;
    if (updates?.estimatedValueCents !== undefined) data.estimatedValueCents = updates.estimatedValueCents;
    if (updates?.notes !== undefined) data.notes = updates.notes;

    await updateDoc(doc(db, PIPELINES_COL, id), data);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PIPELINES_COL}/${id}`);
  }
}

export async function getFirmPipeline(firmId: string, filters?: { stage?: ProjectStage; status?: PipelineStatus }): Promise<PipelineProject[]> {
  try {
    const constraints = [where('firmId', '==', firmId), orderBy('createdAt', 'desc')];
    if (filters?.stage) constraints.push(where('stage', '==', filters.stage));
    if (filters?.status) constraints.push(where('status', '==', filters.status));

    const q = query(collection(db, PIPELINES_COL), ...constraints);
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as PipelineProject));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, PIPELINES_COL);
  }
}

export async function getPipelineForecast(firmId: string): Promise<PipelineForecast> {
  try {
    const projects = await getFirmPipeline(firmId, { status: 'active' });
    const byStage = {} as Record<string, { count: number; value: number; weighted: number }>;

    let totalEstimatedValueCents = 0;
    let weightedForecastCents = 0;
    let activeProjectCount = 0;
    const wonProjectCount = 0;
    const lostProjectCount = 0;

    for (const p of projects) {
      const value = p.estimatedValueCents;
      const weighted = Math.round((value * p.probability) / 100);
      totalEstimatedValueCents += value;
      weightedForecastCents += weighted;
      activeProjectCount++;

      if (!byStage[p.stage]) byStage[p.stage] = { count: 0, value: 0, weighted: 0 };
      byStage[p.stage].count++;
      byStage[p.stage].value += value;
      byStage[p.stage].weighted += weighted;
    }

    return {
      totalValueCents: totalEstimatedValueCents,
      weightedValueCents: weightedForecastCents,
      byStage: byStage as Record<ProjectStage, { count: number; value: number; weighted: number }>,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PIPELINES_COL}/forecast/${firmId}`);
  }
}

export async function getPipelineProject(id: string): Promise<PipelineProject | null> {
  try {
    const snap = await getDoc(doc(db, PIPELINES_COL, id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as PipelineProject) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PIPELINES_COL}/${id}`);
  }
}

export async function deletePipelineProject(id: string): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, PIPELINES_COL, id));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${PIPELINES_COL}/${id}`);
  }
}

export function subscribeToPipeline(firmId: string, callback: (projects: PipelineProject[]) => void): () => void {
  return onSnapshot(
    query(collection(db, PIPELINES_COL), where('firmId', '==', firmId), orderBy('createdAt', 'desc')),
    (snapshot) => callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as PipelineProject))),
    (error) => {
      console.error('Failed to subscribe to pipeline:', error);
      callback([]);
    }
  );
}

export const pipelineService = {
  addPipelineProject,
  updatePipelineStatus,
  getFirmPipeline,
  getPipelineForecast,
  getPipelineProject,
  deletePipelineProject,
  subscribeToPipeline,
};

export default pipelineService;
