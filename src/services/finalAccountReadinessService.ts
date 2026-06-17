import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
export type FinalAccountStatus = 'not_started' | 'in_progress' | 'prepared' | 'under_review' | 'approved' | 'disputed' | 'settled' | 'closed';
export type VariationStatus = 'pending' | 'agreed' | 'disputed' | 'approved' | 'rejected';
export type ClaimStatus = 'submitted' | 'under_review' | 'agreed' | 'rejected' | 'escalated';
export type RetentionReleaseTrigger = 'practical_completion' | 'defects_liability_expiry' | 'final_account_settlement' | 'mutual_agreement';

export interface VariationRecord {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  amount: number;
  status: VariationStatus;
  requestedBy: string;
  requestedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  reason?: string;
  linkedClaimId?: string;
  metadata?: Record<string, unknown>;
}

export interface ClaimRecord {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  amount: number;
  status: ClaimStatus;
  submittedBy: string;
  submittedAt: string;
  resolvedBy?: string;
  resolvedAt?: string;
  resolution?: string;
  linkedVariationIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface RetentionRecord {
  id: string;
  projectId: string;
  totalRetentionAmount: number;
  releasedAmount: number;
  remainingAmount: number;
  releaseTriggers: Array<{
    trigger: RetentionReleaseTrigger;
    percentage: number;
    amount: number;
    released: boolean;
    releasedAt?: string;
    releasedBy?: string;
  }>;
  lastReleasedAt?: string;
  status: 'held' | 'partially_released' | 'fully_released';
}

export interface FinalPaymentCertificate {
  id: string;
  projectId: string;
  certificateNumber?: string;
  preparedBy: string;
  preparedAt: string;
  totalContractSum: number;
  variationsTotal: number;
  claimsTotal: number;
  retentionHeld: number;
  retentionToRelease: number;
  netPaymentDue: number;
  status: 'draft' | 'issued' | 'approved' | 'paid';
  approvedBy?: string;
  approvedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface FinalAccountReadinessRecord {
  id: string;
  projectId: string;
  jobId?: string;
  status: FinalAccountStatus;
  variations: VariationRecord[];
  claims: ClaimRecord[];
  retention: RetentionRecord;
  paymentCertificate?: FinalPaymentCertificate;
  allVariationsIncorporated: boolean;
  allClaimsSettled: boolean;
  retentionReconciled: boolean;
  finalPaymentReady: boolean;
  blockers: string[];
  createdAt: string;
  updatedAt: string;
}

const CLOSED_VARIATION_STATUSES: VariationStatus[] = ['agreed', 'approved', 'rejected'];
const SETTLED_CLAIM_STATUSES: ClaimStatus[] = ['agreed', 'rejected'];

export function evaluateVariationsIncorporation(variations: VariationRecord[] = []): { allIncorporated: boolean; blockers: string[]; pendingCount: number } {
  const pending = variations.filter((v) => !CLOSED_VARIATION_STATUSES.includes(v.status));
  const disputed = variations.filter((v) => v.status === 'disputed');

  const blockers: string[] = [];
  if (pending.length > 0) {
    blockers.push(`${pending.length} variation(s) still pending resolution.`);
  }
  if (disputed.length > 0) {
    blockers.push(`${disputed.length} variation(s) in dispute — these must be resolved or escalated before final account.`);
  }

  return {
    allIncorporated: blockers.length === 0,
    blockers,
    pendingCount: pending.length,
  };
}

export function evaluateClaimsSettlement(claims: ClaimRecord[] = []): { allSettled: boolean; blockers: string[]; pendingCount: number } {
  const pending = claims.filter((c) => !SETTLED_CLAIM_STATUSES.includes(c.status));
  const escalated = claims.filter((c) => c.status === 'escalated');

  const blockers: string[] = [];
  if (pending.length > 0) {
    blockers.push(`${pending.length} claim(s) still pending resolution.`);
  }
  if (escalated.length > 0) {
    blockers.push(`${escalated.length} escalated claim(s) require arbitration or decision.`);
  }

  return {
    allSettled: blockers.length === 0,
    blockers,
    pendingCount: pending.length,
  };
}

export function reconcileRetention(input: {
  totalContractSum: number;
  retentionPercentage: number;
  variationsTotal: number;
  previouslyReleased: number;
  releaseTriggersMet: RetentionReleaseTrigger[];
}): RetentionRecord {
  const adjustedSum = input.totalContractSum + input.variationsTotal;
  const totalRetentionAmount = Math.round(adjustedSum * (input.retentionPercentage / 100) * 100) / 100;

  const allTriggers: Array<{
    trigger: RetentionReleaseTrigger;
    percentage: number;
    amount: number;
    released: boolean;
  }> = [
    {
      trigger: 'practical_completion',
      percentage: 50,
      amount: Math.round(totalRetentionAmount * 0.5 * 100) / 100,
      released: input.releaseTriggersMet.includes('practical_completion'),
    },
    {
      trigger: 'defects_liability_expiry',
      percentage: 50,
      amount: Math.round(totalRetentionAmount * 50 * 100) / 100,
      released: input.releaseTriggersMet.includes('defects_liability_expiry'),
    },
    {
      trigger: 'final_account_settlement',
      percentage: 0,
      amount: 0,
      released: input.releaseTriggersMet.includes('final_account_settlement'),
    },
    {
      trigger: 'mutual_agreement',
      percentage: 0,
      amount: 0,
      released: input.releaseTriggersMet.includes('mutual_agreement'),
    },
  ];

  const releasedAmount = allTriggers
    .filter((t) => t.released)
    .reduce((sum, t) => sum + t.amount, 0);

  const remainingAmount = Math.max(0, Math.round((totalRetentionAmount - releasedAmount) * 100) / 100);

  let status: RetentionRecord['status'] = 'held';
  if (releasedAmount >= totalRetentionAmount) status = 'fully_released';
  else if (releasedAmount > 0) status = 'partially_released';

  return {
    id: `retention-${input.totalContractSum}-${Date.now()}`,
    projectId: '',
    totalRetentionAmount,
    releasedAmount,
    remainingAmount,
    releaseTriggers: allTriggers.map((t) => ({ ...t, releasedBy: t.released ? 'system' : undefined })),
    status,
  };
}

export function evaluateFinalAccountReadiness(input: {
  variations: VariationRecord[];
  claims: ClaimRecord[];
  retention: RetentionRecord;
}): { ready: boolean; status: FinalAccountStatus; blockers: string[] } {
  const blockers: string[] = [];

  const varEval = evaluateVariationsIncorporation(input.variations);
  blockers.push(...varEval.blockers);

  const claimEval = evaluateClaimsSettlement(input.claims);
  blockers.push(...claimEval.blockers);

  if (input.retention.status === 'held' && input.retention.totalRetentionAmount > 0) {
    blockers.push('Retention has not been released — ensure practical completion trigger is met.');
  }

  const ready = blockers.length === 0;
  const status: FinalAccountStatus = ready ? 'prepared' : 'in_progress';

  return {
    ready,
    status,
    blockers,
  };
}

export function prepareFinalPaymentCertificate(input: {
  projectId: string;
  preparedBy: string;
  totalContractSum: number;
  variations: VariationRecord[];
  claims: ClaimRecord[];
  retention: RetentionRecord;
}): FinalPaymentCertificate {
  const agreedVariations = input.variations.filter((v) => v.status === 'agreed' || v.status === 'approved');
  const variationsTotal = agreedVariations.reduce((sum, v) => sum + v.amount, 0);

  const settledClaims = input.claims.filter((c) => c.status === 'agreed');
  const claimsTotal = settledClaims.reduce((sum, c) => sum + c.amount, 0);

  const netPaymentDue = Math.round(
    (input.totalContractSum + variationsTotal + claimsTotal - input.retention.totalRetentionAmount + input.retention.releasedAmount) * 100
  ) / 100;

  return {
    id: `fpc-${input.projectId}-${Date.now()}`,
    projectId: input.projectId,
    preparedBy: input.preparedBy,
    preparedAt: new Date().toISOString(),
    totalContractSum: input.totalContractSum,
    variationsTotal,
    claimsTotal,
    retentionHeld: input.retention.remainingAmount,
    retentionToRelease: input.retention.releaseTriggers.filter((t) => !t.released).reduce((sum, t) => sum + t.amount, 0),
    netPaymentDue,
    status: 'draft',
  };
}

export async function createFinalAccountRecord(input: {
  projectId: string;
  jobId?: string;
  variations?: VariationRecord[];
  claims?: ClaimRecord[];
  retention: RetentionRecord;
}): Promise<FinalAccountReadinessRecord> {
  const now = new Date().toISOString();
  const variations = input.variations ?? [];
  const claims = input.claims ?? [];

  const evaluation = evaluateFinalAccountReadiness({
    variations,
    claims,
    retention: input.retention,
  });

  const record: FinalAccountReadinessRecord = {
    id: `final-account-${input.projectId}`,
    projectId: input.projectId,
    jobId: input.jobId,
    status: evaluation.status,
    variations,
    claims,
    retention: { ...input.retention, projectId: input.projectId },
    allVariationsIncorporated: evaluateVariationsIncorporation(variations).allIncorporated,
    allClaimsSettled: evaluateClaimsSettlement(claims).allSettled,
    retentionReconciled: input.retention.status === 'fully_released' || input.retention.releaseTriggers.some((t) => t.released),
    finalPaymentReady: evaluation.ready,
    blockers: evaluation.blockers,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(getDemoDoc( 'final_accounts', record.id), record);

  await updateDoc(getDemoDoc( 'projects', input.projectId), {
    finalAccount: {
      status: evaluation.status,
      finalPaymentReady: evaluation.ready,
      variationsCount: variations.length,
      claimsCount: claims.length,
      retentionStatus: input.retention.status,
      updatedAt: now,
    },
    updatedAt: now,
  });

  return record;
}

export async function getFinalAccountRecord(projectId: string): Promise<FinalAccountReadinessRecord | null> {
  const snap = await getDoc(getDemoDoc( 'final_accounts', `final-account-${projectId}`));
  if (!snap.exists()) return null;
  return snap.data() as FinalAccountReadinessRecord;
}

export async function approveFinalAccount(projectId: string, approvedBy: string): Promise<FinalAccountReadinessRecord> {
  const snap = await getDoc(getDemoDoc( 'final_accounts', `final-account-${projectId}`));
  if (!snap.exists()) throw new Error(`Final account record for project ${projectId} not found`);

  const record = snap.data() as FinalAccountReadinessRecord;
  if (record.status !== 'prepared' && record.status !== 'under_review') {
    throw new Error(`Final account must be in "prepared" or "under_review" status to approve. Current: ${record.status}`);
  }

  const now = new Date().toISOString();
  const updates = {
    status: 'approved' as FinalAccountStatus,
    approvedBy,
    approvedAt: now,
    updatedAt: now,
  };

  await updateDoc(getDemoDoc( 'final_accounts', record.id), updates);
  await updateDoc(getDemoDoc( 'projects', projectId), {
    'finalAccount.status': 'approved',
    'finalAccount.approvedBy': approvedBy,
    'finalAccount.approvedAt': now,
    updatedAt: now,
  });

  return { ...record, ...updates };
}

export const finalAccountReadinessService = {
  evaluateVariationsIncorporation,
  evaluateClaimsSettlement,
  reconcileRetention,
  evaluateFinalAccountReadiness,
  prepareFinalPaymentCertificate,
  createFinalAccountRecord,
  getFinalAccountRecord,
  approveFinalAccount,
};

export default finalAccountReadinessService;
