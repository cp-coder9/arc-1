// ─── Pack 16: Risk Early Warning Service ─────────────────────────────────────
// Early warning risk detection across project modules.
// Derives risk signals from project decisions and scores overall project risk.

import { collection, doc, getDoc, getDocs, setDoc, addDoc, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import type {
  ProjectDecision,

  ProjectRiskSignal,
  UnifiedProjectOperatingSnapshot,
  Priority,
  SourceModule,
} from '@/services/lifecycleTypes';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
// ─── Firestore Paths ─────────────────────────────────────────────────────────

const RISK_COL = 'risk_signals';
const PROJECTS_COL = 'projects';

function riskCollection() {
  return getDemoCol( RISK_COL);
}

function projectRiskCollection(projectId: string) {
  return getDemoCol( PROJECTS_COL, projectId, RISK_COL);
}

function riskDoc(riskId: string) {
  return getDemoDoc( RISK_COL, riskId);
}

// ─── Pure Business Logic ─────────────────────────────────────────────────────

function priorityRank(priority: Priority): number {
  return { critical: 4, high: 3, medium: 2, low: 1 }[priority];
}

function riskCategoryFromModule(sourceModule: SourceModule): ProjectRiskSignal['category'] {
  switch (sourceModule) {
    case 'finance': return 'budget';
    case 'municipal': return 'municipal';
    case 'messaging': return 'communication';
    case 'closeout': return 'closeout';
    case 'cpd': return 'cpd';
    case 'deployment': return 'deployment';
    case 'api': return 'api';
    default: return 'delay';
  }
}

/**
 * Derive risk signals from project decisions.
 * Only critical and high priority decisions generate signals.
 */
export function deriveRiskSignals(decisions: ProjectDecision[]): ProjectRiskSignal[] {
  return decisions
    .filter((decision) => decision.priority === 'critical' || decision.priority === 'high')
    .map((decision): ProjectRiskSignal => ({
      id: `risk-${decision.id}`,
      sourceModule: decision.sourceModule,
      category: riskCategoryFromModule(decision.sourceModule),
      severity: decision.priority,
      title: decision.title,
      detail: decision.plainLanguageSummary,
      linkedRecordIds: decision.linkedRecordIds,
      recommendedIntervention:
        `Route to ${decision.role} via mobile inbox and require ${
          decision.humanGate === 'none' ? 'review' : decision.humanGate
        }.`,
      humanGate: decision.humanGate,
    }))
    .sort((a, b) => priorityRank(b.severity) - priorityRank(a.severity));
}

/**
 * Score project risk from a unified operating snapshot.
 * Returns a weighted score and status summary.
 */
export function scoreProjectRisk(snapshot: UnifiedProjectOperatingSnapshot) {
  const weights: Record<Priority, number> = { critical: 35, high: 20, medium: 8, low: 2 };
  const raw = snapshot.risks.reduce((sum, risk) => sum + weights[risk.severity], 0);
  const score = Math.min(100, raw);
  return {
    score,
    status: score >= 70 ? 'critical' : score >= 35 ? 'attention_required' : 'controlled',
    topIntervention:
      snapshot.risks[0]?.recommendedIntervention ??
      'Keep monitoring project records and release gates.',
  };
}

// ─── Firestore-backed Operations ─────────────────────────────────────────────

export interface RiskSignalRecord {
  riskId: string;
  projectId: string;
  tenantId?: string;
  signal: ProjectRiskSignal;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

/** Persist a derived risk signal to Firestore. */
export async function saveRiskSignal(
  projectId: string,
  signal: ProjectRiskSignal,
  tenantId?: string,
): Promise<RiskSignalRecord & { id: string }> {
  try {
    const now = new Date().toISOString();
    const record: Omit<RiskSignalRecord, 'riskId'> = {
      projectId,
      tenantId,
      signal,
      acknowledged: false,
      resolved: false,
      createdAt: now,
    };
    const docRef = await addDoc(projectRiskCollection(projectId), record);
    return { riskId: docRef.id, ...record, id: docRef.id };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${projectId}/${RISK_COL}`);
    throw error;
  }
}

/** Get unresolved (non-acknowledged or non-resolved) risk signals for a project. */
export async function getActiveRiskSignals(
  projectId: string,
): Promise<(RiskSignalRecord & { id: string })[]> {
  try {
    const q = query(
      projectRiskCollection(projectId),
      where('resolved', '==', false),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      riskId: d.id,
      ...(d.data() as RiskSignalRecord),
      id: d.id,
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${PROJECTS_COL}/${projectId}/${RISK_COL}`);
    return [];
  }
}

/** Acknowledge a risk signal (user has seen it). */
export async function acknowledgeRisk(riskId: string, userId: string): Promise<void> {
  try {
    await setDoc(
      riskDoc(riskId),
      { acknowledged: true, acknowledgedBy: userId, acknowledgedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { merge: true },
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${RISK_COL}/${riskId}`);
  }
}

/** Mark a risk signal as resolved. */
export async function resolveRisk(riskId: string, userId: string): Promise<void> {
  try {
    await setDoc(
      riskDoc(riskId),
      { resolved: true, resolvedBy: userId, resolvedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { merge: true },
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${RISK_COL}/${riskId}`);
  }
}

/** Derive and persist all risk signals for a project from its current decisions. */
export async function syncRiskSignalsFromDecisions(
  projectId: string,
  decisions: ProjectDecision[],
  tenantId?: string,
): Promise<(RiskSignalRecord & { id: string })[]> {
  const signals = deriveRiskSignals(decisions);
  const results: (RiskSignalRecord & { id: string })[] = [];
  for (const signal of signals) {
    const saved = await saveRiskSignal(projectId, signal, tenantId);
    results.push(saved);
  }
  return results;
}

/** Subscribe to real-time risk signal updates for a project. */
export function subscribeToRiskSignals(
  projectId: string,
  cb: (signals: (RiskSignalRecord & { id: string })[]) => void,
): () => void {
  const q = query(
    projectRiskCollection(projectId),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ riskId: d.id, ...(d.data() as RiskSignalRecord), id: d.id }))),
    (error) => {
      console.error('Error subscribing to risk signals:', error);
      cb([]);
    },
  );
}

// ─── Aggregated Service Export ───────────────────────────────────────────────

export const riskEarlyWarningService = {
  deriveRiskSignals,
  scoreProjectRisk,
  saveRiskSignal,
  getActiveRiskSignals,
  acknowledgeRisk,
  resolveRisk,
  syncRiskSignalsFromDecisions,
  subscribeToRiskSignals,
};

export default riskEarlyWarningService;
