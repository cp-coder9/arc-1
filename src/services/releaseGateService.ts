// ─── Pack 16: Release Gate Service ──────────────────────────────────────────
// Release gate workflow and approvals for deployment, project phase transitions,
// and professional sign-off gates.

import {
  collection,

  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import type {
  DeploymentBuildInfo,
  ReleaseGateCheck,
  ReleaseGateResult,
  HumanGate,
  Priority,
} from '@/services/lifecycleTypes';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
// ─── Firestore Paths ─────────────────────────────────────────────────────────

const GATES_COL = 'release_gates';
const PROJECTS_COL = 'projects';

function gatesCollection() {
  return getDemoCol( GATES_COL);
}

function projectGatesCollection(projectId: string) {
  return getDemoCol( PROJECTS_COL, projectId, GATES_COL);
}

function gateDoc(gateId: string) {
  return getDemoDoc( GATES_COL, gateId);
}

// ─── Pure Business Logic ─────────────────────────────────────────────────────

/**
 * Evaluate a deployment release gate by comparing repo vs deployed state.
 * Checks: commit alignment, API health, route smoke tests, and vulnerability count.
 */
export function evaluateDeploymentReleaseGate(input: {
  repo: DeploymentBuildInfo;
  deployed: DeploymentBuildInfo;
  apiHealthOk: boolean;
  importantRoutesSmokeOk: boolean;
  auditVulnerabilityCount: number;
}): ReleaseGateResult {
  const checks: ReleaseGateCheck[] = [];

  const sameCommit = input.repo.shortCommit === input.deployed.shortCommit;
  checks.push({
    key: 'deployed_commit_matches_repo',
    status: sameCommit ? 'pass' : 'fail',
    detail: sameCommit
      ? `Deployed commit ${input.deployed.shortCommit} matches repo.`
      : `Test site is serving ${input.deployed.shortCommit} from ${input.deployed.branch}, while repo target is ${input.repo.shortCommit} from ${input.repo.branch}.`,
  });

  checks.push({
    key: 'api_health',
    status: input.apiHealthOk ? 'pass' : 'fail',
    detail: input.apiHealthOk ? 'API health endpoint responded.' : 'API health endpoint failed.',
  });

  checks.push({
    key: 'spa_route_smoke',
    status: input.importantRoutesSmokeOk ? 'pass' : 'warn',
    detail: input.importantRoutesSmokeOk
      ? 'Important SPA routes returned loadable HTML.'
      : 'Some route smoke checks need review.',
  });

  checks.push({
    key: 'npm_audit',
    status: input.auditVulnerabilityCount === 0 ? 'pass' : 'warn',
    detail: `${
      input.auditVulnerabilityCount
    } npm audit vulnerabilities reported; resolve before production confidence.`,
  });

  const hasFail = checks.some((check) => check.status === 'fail');
  const hasWarn = checks.some((check) => check.status === 'warn');

  return {
    status: hasFail ? 'fail' : hasWarn ? 'warn' : 'pass',
    title: hasFail
      ? 'Release gate failed: deployed site is not aligned with repo.'
      : hasWarn
        ? 'Release gate warning: deployable but not production-clean.'
        : 'Release gate passed.',
    checks,
  };
}

/**
 * Evaluate a project phase transition gate.
 * Checks that required records exist before allowing a phase advancement.
 */
export function evaluatePhaseTransitionGate(input: {
  currentPhase: string;
  targetPhase: string;
  requiredRecords: string[];
  presentRecords: string[];
  requiredApprovals: string[];
  completedApprovals: string[];
}): ReleaseGateResult {
  const checks: ReleaseGateCheck[] = [];

  // Check required records
  const missingRecords = input.requiredRecords.filter((r) => !input.presentRecords.includes(r));
  checks.push({
    key: 'required_records_present',
    status: missingRecords.length === 0 ? 'pass' : 'fail',
    detail:
      missingRecords.length === 0
        ? 'All required records are present.'
        : `Missing records: ${missingRecords.join(', ')}.`,
  });

  // Check approvals
  const missingApprovals = input.requiredApprovals.filter((a) => !input.completedApprovals.includes(a));
  checks.push({
    key: 'required_approvals_completed',
    status: missingApprovals.length === 0 ? 'pass' : 'warn',
    detail:
      missingApprovals.length === 0
        ? 'All required approvals are completed.'
        : `Pending approvals: ${missingApprovals.join(', ')}.`,
  });

  const hasFail = checks.some((check) => check.status === 'fail');
  const hasWarn = checks.some((check) => check.status === 'warn');
  const phaseLabel = `${input.currentPhase} → ${input.targetPhase}`;

  return {
    status: hasFail ? 'fail' : hasWarn ? 'warn' : 'pass',
    title: hasFail
      ? `Phase transition gate (${phaseLabel}) blocked: missing required records.`
      : hasWarn
        ? `Phase transition gate (${phaseLabel}) warning: pending approvals.`
        : `Phase transition gate (${phaseLabel}) passed.`,
    checks,
  };
}

/**
 * Evaluate a professional sign-off / human gate.
 */
export function evaluateHumanGate(input: {
  gate: HumanGate;
  signedOffBy?: string;
  requiredRole: string;
}): ReleaseGateResult {
  const checks: ReleaseGateCheck[] = [
    {
      key: 'human_gate_satisfied',
      status: input.signedOffBy ? 'pass' : 'fail',
      detail: input.signedOffBy
        ? `Gate "${input.gate}" signed off by ${input.signedOffBy}.`
        : `Gate "${input.gate}" requires sign-off from ${input.requiredRole}.`,
    },
  ];

  return {
    status: input.signedOffBy ? 'pass' : 'fail',
    title: input.signedOffBy
      ? `Human gate "${input.gate}" satisfied.`
      : `Human gate "${input.gate}" is blocking.`,
    checks,
  };
}

// ─── Firestore-backed Operations ─────────────────────────────────────────────

export type ReleaseGateType = 'deployment' | 'phase_transition' | 'human_gate' | 'professional_signoff';

export type ReleaseGateStatus = 'pending' | 'passed' | 'failed' | 'overridden';

export interface ReleaseGateRecord {
  gateId: string;
  projectId: string;
  gateType: ReleaseGateType;
  result: ReleaseGateResult;
  status: ReleaseGateStatus;
  requestedBy?: string;
  approvedBy?: string;
  approvedAt?: string;
  overriddenBy?: string;
  overrideReason?: string;
  createdAt: string;
  updatedAt?: string;
}

/** Create and persist a release gate evaluation. */
export async function createReleaseGate(input: {
  projectId: string;
  gateType: ReleaseGateType;
  result: ReleaseGateResult;
  requestedBy?: string;
}): Promise<ReleaseGateRecord & { id: string }> {
  try {
    const now = new Date().toISOString();
    const status: ReleaseGateStatus = input.result.status === 'pass' ? 'passed' : 'pending';

    const record: Omit<ReleaseGateRecord, 'gateId'> = {
      projectId: input.projectId,
      gateType: input.gateType,
      result: input.result,
      status,
      requestedBy: input.requestedBy,
      createdAt: now,
    };

    const docRef = await addDoc(projectGatesCollection(input.projectId), record);
    return { gateId: docRef.id, ...record, id: docRef.id };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${input.projectId}/${GATES_COL}`);
    throw error;
  }
}

/** Approve a release gate (overrides a failed/pending gate). */
export async function approveReleaseGate(
  gateId: string,
  approvedBy: string,
): Promise<void> {
  try {
    await updateDoc(gateDoc(gateId), {
      status: 'passed',
      approvedBy,
      approvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${GATES_COL}/${gateId}`);
  }
}

/** Override a failed release gate. */
export async function overrideReleaseGate(
  gateId: string,
  overriddenBy: string,
  reason: string,
): Promise<void> {
  try {
    await updateDoc(gateDoc(gateId), {
      status: 'overridden',
      overriddenBy,
      overrideReason: reason,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${GATES_COL}/${gateId}`);
  }
}

/** Get release gates for a project, optionally filtered by status. */
export async function getProjectReleaseGates(
  projectId: string,
  statusFilter?: ReleaseGateStatus,
): Promise<(ReleaseGateRecord & { id: string })[]> {
  try {
    const constraints = [orderBy('createdAt', 'desc')];
    if (statusFilter) {
      constraints.unshift(where('status', '==', statusFilter));
    }
    const q = query(projectGatesCollection(projectId), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      gateId: d.id,
      ...(d.data() as ReleaseGateRecord),
      id: d.id,
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${PROJECTS_COL}/${projectId}/${GATES_COL}`);
    return [];
  }
}

/** Get a single release gate by ID. */
export async function getReleaseGate(
  gateId: string,
): Promise<(ReleaseGateRecord & { id: string }) | null> {
  try {
    const docSnap = await getDoc(gateDoc(gateId));
    if (!docSnap.exists()) return null;
    const data = docSnap.data() as ReleaseGateRecord;
    return { gateId: docSnap.id, ...data, id: docSnap.id };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${GATES_COL}/${gateId}`);
    return null;
  }
}

/** Subscribe to real-time release gate updates for a project. */
export function subscribeToReleaseGates(
  projectId: string,
  cb: (gates: (ReleaseGateRecord & { id: string })[]) => void,
): () => void {
  const q = query(
    projectGatesCollection(projectId),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(
    q,
    (snap) =>
      cb(snap.docs.map((d) => ({ gateId: d.id, ...(d.data() as ReleaseGateRecord), id: d.id }))),
    (error) => {
      console.error('Error subscribing to release gates:', error);
      cb([]);
    },
  );
}

// ─── Aggregated Service Export ───────────────────────────────────────────────

export const releaseGateService = {
  evaluateDeploymentReleaseGate,
  evaluatePhaseTransitionGate,
  evaluateHumanGate,
  createReleaseGate,
  approveReleaseGate,
  overrideReleaseGate,
  getProjectReleaseGates,
  getReleaseGate,
  subscribeToReleaseGates,
};

export default releaseGateService;
