import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type OccupationReadinessStatus = 'not_started' | 'in_progress' | 'ready' | 'blocked' | 'conditional_approval' | 'approved';
export type UtilityServiceType = 'water' | 'electricity' | 'gas' | 'sewerage' | 'telecommunications' | 'roads_access' | 'stormwater' | 'refuse';

export interface OccupancyCertificate {
  id: string;
  projectId: string;
  certificateNumber?: string;
  issuingAuthority: string;
  issuedAt?: string;
  status: 'pending' | 'obtained' | 'conditional' | 'rejected' | 'not_required';
  conditions?: string[];
  documentUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface InsuranceTransitionCheck {
  id: string;
  projectId: string;
  constructionPolicyActive: boolean;
  constructionPolicyExpiry?: string;
  occupationPolicyQuoted: boolean;
  occupationPolicyActive: boolean;
  occupationPolicyStartDate?: string;
  gapInCover: boolean;
  requiresBrokerReview: boolean;
  notes?: string;
}

export interface UtilityHandoverItem {
  id: string;
  utilityType: UtilityServiceType;
  provider: string;
  accountTransferred: boolean;
  meterReadingRecorded: boolean;
  meterReadingValue?: string;
  transferDate?: string;
  confirmationReference?: string;
  status: 'pending' | 'in_progress' | 'complete' | 'not_applicable';
  notes?: string;
}

export interface OccupationReadinessRecord {
  id: string;
  projectId: string;
  jobId?: string;
  status: OccupationReadinessStatus;
  occupancyCertificate?: OccupancyCertificate;
  insuranceTransition?: InsuranceTransitionCheck;
  utilityHandoverItems: UtilityHandoverItem[];
  statutoryApprovals: Array<{ type: string; status: string; reference?: string; obtainedAt?: string }>;
  blockers: string[];
  readyForOccupation: boolean;
  createdAt: string;
  updatedAt: string;
}

const REQUIRED_UTILITY_TYPES: UtilityServiceType[] = ['water', 'electricity', 'sewerage'];
const UTILITY_LABELS: Record<UtilityServiceType, string> = {
  water: 'Water supply',
  electricity: 'Electricity supply',
  gas: 'Gas supply',
  sewerage: 'Sewerage connection',
  telecommunications: 'Telecommunications',
  roads_access: 'Roads and access',
  stormwater: 'Stormwater drainage',
  refuse: 'Refuse collection',
};

export function getRequiredUtilityTypes(): UtilityServiceType[] {
  return [...REQUIRED_UTILITY_TYPES];
}

export function getUtilityLabel(type: UtilityServiceType): string {
  return UTILITY_LABELS[type] ?? type;
}

export function evaluateOccupancyCertificate(input: {
  certificateObtained: boolean;
  issuingAuthority: string;
  hasConditions: boolean;
  conditions?: string[];
}): { valid: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (!input.certificateObtained) {
    blockers.push(`Occupancy certificate from ${input.issuingAuthority || 'the municipality'} has not been obtained.`);
  }
  if (input.hasConditions && (input.conditions ?? []).length > 0) {
    blockers.push(`Occupancy certificate has ${input.conditions!.length} condition(s) that must be addressed.`);
  }
  return { valid: blockers.length === 0, blockers };
}

export function evaluateInsuranceTransition(input: {
  constructionPolicyActive: boolean;
  occupationPolicyQuoted: boolean;
  occupationPolicyActive: boolean;
}): { ready: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (!input.constructionPolicyActive) {
    blockers.push('Construction insurance policy status is not confirmed active.');
  }
  if (!input.occupationPolicyQuoted) {
    blockers.push('Occupation insurance policy has not been quoted.');
  }
  if (!input.occupationPolicyActive) {
    blockers.push('Occupation insurance policy is not yet active.');
  }
  return { ready: blockers.length === 0, blockers };
}

export function evaluateUtilityHandover(utilities: UtilityHandoverItem[] = []): { ready: boolean; blockers: string[]; completedItems: UtilityHandoverItem[]; pendingItems: UtilityHandoverItem[] } {
  const blockers: string[] = [];
  const completedItems: UtilityHandoverItem[] = [];
  const pendingItems: UtilityHandoverItem[] = [];

  for (const utility of utilities) {
    if (utility.status === 'complete' || utility.status === 'not_applicable') {
      completedItems.push(utility);
    } else {
      pendingItems.push(utility);
    }
  }

  const requiredPending = pendingItems.filter((u) => REQUIRED_UTILITY_TYPES.includes(u.utilityType));
  if (requiredPending.length > 0) {
    blockers.push(`${requiredPending.length} required utility service(s) not yet handed over: ${requiredPending.map((u) => UTILITY_LABELS[u.utilityType]).join(', ')}.`);
  }

  return { ready: blockers.length === 0, blockers, completedItems, pendingItems };
}

export function evaluateOccupationReadiness(input: {
  occupancyCertificate: OccupancyCertificate;
  insuranceTransition: InsuranceTransitionCheck;
  utilityHandoverItems: UtilityHandoverItem[];
  statutoryApprovals?: Array<{ type: string; status: string; reference?: string }>;
}): { ready: boolean; status: OccupationReadinessStatus; blockers: string[] } {
  const blockers: string[] = [];

  const ocEval = evaluateOccupancyCertificate({
    certificateObtained: input.occupancyCertificate.status === 'obtained' || input.occupancyCertificate.status === 'conditional',
    issuingAuthority: input.occupancyCertificate.issuingAuthority,
    hasConditions: input.occupancyCertificate.status === 'conditional',
    conditions: input.occupancyCertificate.conditions,
  });
  blockers.push(...ocEval.blockers);

  const insEval = evaluateInsuranceTransition({
    constructionPolicyActive: input.insuranceTransition.constructionPolicyActive,
    occupationPolicyQuoted: input.insuranceTransition.occupationPolicyQuoted,
    occupationPolicyActive: input.insuranceTransition.occupationPolicyActive,
  });
  blockers.push(...insEval.blockers);

  const utilEval = evaluateUtilityHandover(input.utilityHandoverItems);
  blockers.push(...utilEval.blockers);

  const statutoryApprovals = input.statutoryApprovals ?? [];
  const pendingStatutory = statutoryApprovals.filter((a) => String(a.status ?? '').toLowerCase() !== 'approved' && String(a.status ?? '').toLowerCase() !== 'not_required');
  if (pendingStatutory.length > 0) {
    blockers.push(`${pendingStatutory.length} statutory approval(s) still pending.`);
  }

  const statutoryBlockers = statutoryApprovals.filter((a) => String(a.status ?? '').toLowerCase() === 'rejected');
  statutoryBlockers.forEach((a) => blockers.push(`Statutory approval "${a.type}" was rejected${a.reference ? ` (ref: ${a.reference})` : ''}.`));

  let status: OccupationReadinessStatus = 'blocked';
  if (blockers.length === 0) {
    status = input.occupancyCertificate.status === 'conditional' ? 'conditional_approval' : 'ready';
  }

  return { ready: blockers.length === 0, status, blockers };
}

export async function createOccupationReadinessRecord(input: {
  projectId: string;
  jobId?: string;
  occupancyCertificate: OccupancyCertificate;
  insuranceTransition: InsuranceTransitionCheck;
  utilityHandoverItems: UtilityHandoverItem[];
  statutoryApprovals?: Array<{ type: string; status: string; reference?: string; obtainedAt?: string }>;
}): Promise<OccupationReadinessRecord> {
  const now = new Date().toISOString();
  const evaluation = evaluateOccupationReadiness(input);

  const record: OccupationReadinessRecord = {
    id: `occ-readiness-${input.projectId}`,
    projectId: input.projectId,
    jobId: input.jobId,
    status: evaluation.status,
    occupancyCertificate: input.occupancyCertificate,
    insuranceTransition: input.insuranceTransition,
    utilityHandoverItems: input.utilityHandoverItems,
    statutoryApprovals: input.statutoryApprovals ?? [],
    blockers: evaluation.blockers,
    readyForOccupation: evaluation.ready,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(doc(db, 'occupation_readiness', record.id), record);

  await updateDoc(doc(db, 'projects', input.projectId), {
    occupationReadiness: {
      status: evaluation.status,
      readyForOccupation: evaluation.ready,
      occupancyCertificateStatus: input.occupancyCertificate.status,
      updatedAt: now,
    },
    updatedAt: now,
  });

  return record;
}

export async function getOccupationReadinessRecord(projectId: string): Promise<OccupationReadinessRecord | null> {
  const snap = await getDoc(doc(db, 'occupation_readiness', `occ-readiness-${projectId}`));
  if (!snap.exists()) return null;
  return snap.data() as OccupationReadinessRecord;
}

export async function updateUtilityHandoverItem(recordId: string, item: UtilityHandoverItem): Promise<void> {
  const snap = await getDoc(doc(db, 'occupation_readiness', recordId));
  if (!snap.exists()) throw new Error(`Occupation readiness record ${recordId} not found`);

  const record = snap.data() as OccupationReadinessRecord;
  const items = record.utilityHandoverItems.map((u) => (u.id === item.id ? { ...item, updatedAt: new Date().toISOString() } : u));
  const evaluation = evaluateUtilityHandover(items);

  await updateDoc(doc(db, 'occupation_readiness', recordId), {
    utilityHandoverItems: items,
    blockers: [
      ...record.blockers.filter((b) => !b.includes('utility service')),
      ...evaluation.blockers,
    ],
    readyForOccupation: evaluation.ready && record.blockers.filter((b) => !b.includes('utility service')).length === 0,
    updatedAt: new Date().toISOString(),
  });
}

export async function recordOccupancyCertificate(projectId: string, certificate: OccupancyCertificate): Promise<void> {
  const existing = await getOccupationReadinessRecord(projectId);
  const now = new Date().toISOString();

  if (existing) {
    const evaluation = evaluateOccupationReadiness({
      occupancyCertificate: certificate,
      insuranceTransition: existing.insuranceTransition,
      utilityHandoverItems: existing.utilityHandoverItems,
      statutoryApprovals: existing.statutoryApprovals,
    });

    await updateDoc(doc(db, 'occupation_readiness', existing.id), {
      occupancyCertificate: certificate,
      status: evaluation.status,
      blockers: evaluation.blockers,
      readyForOccupation: evaluation.ready,
      updatedAt: now,
    });
    return;
  }

  await createOccupationReadinessRecord({
    projectId,
    occupancyCertificate: certificate,
    insuranceTransition: {
      id: `insurance-${projectId}`,
      projectId,
      constructionPolicyActive: false,
      occupationPolicyQuoted: false,
      occupationPolicyActive: false,
      gapInCover: true,
      requiresBrokerReview: true,
    },
    utilityHandoverItems: [],
  });
}

export const occupationReadinessService = {
  evaluateOccupancyCertificate,
  evaluateInsuranceTransition,
  evaluateUtilityHandover,
  evaluateOccupationReadiness,
  createOccupationReadinessRecord,
  getOccupationReadinessRecord,
  updateUtilityHandoverItem,
  recordOccupancyCertificate,
  getRequiredUtilityTypes,
  getUtilityLabel,
};

export default occupationReadinessService;
