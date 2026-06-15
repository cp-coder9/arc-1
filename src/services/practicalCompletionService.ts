import { collection, doc, getDoc, getDocs, query, runTransaction, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Project } from '@/types';
import { CLOSEOUT_ARTIFACTS_REQUIRED_ERROR, evaluateCloseoutGate } from './closeoutService';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
export type PracticalCompletionStatus = 'draft' | 'pending_review' | 'ready_with_minor_items' | 'blocked' | 'certified' | 'client_accepted' | 'superseded';
export type SignatoryRole = 'principal_agent' | 'lead_professional' | 'registered_professional' | 'client';

export interface SnagRegisterItem {
  id: string;
  title: string;
  status: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  trade?: string;
  assignedTo?: string;
  closedAt?: string;
  evidenceUrls?: string[];
}

export interface PracticalCompletionPrecondition {
  key: string;
  label: string;
  met: boolean;
  detail: string;
}

export interface PracticalCompletionCertificate {
  certificateId: string;
  projectId: string;
  jobId?: string;
  issuedBy: string;
  issuedByName?: string;
  signatoryRole: SignatoryRole;
  issuedAt: string;
  status: PracticalCompletionStatus;
  preconditions: PracticalCompletionPrecondition[];
  snagRegisterSummary: { total: number; open: number; closed: number };
  clientAcceptance?: { acceptedBy: string; acceptedAt: string; signatureRef?: string };
  blockers: string[];
  metadata?: Record<string, unknown>;
}

export interface PracticalCompletionResult {
  ready: boolean;
  status: PracticalCompletionStatus;
  blockers: string[];
  preconditions: PracticalCompletionPrecondition[];
  certificate?: PracticalCompletionCertificate;
}

const CLOSED_SNAG_STATUSES = new Set(['closed', 'resolved', 'accepted', 'approved']);
const CERTIFIABLE_ROLES: SignatoryRole[] = ['principal_agent', 'lead_professional', 'registered_professional'];

export function validateSignatoryRole(role: string): role is SignatoryRole {
  return CERTIFIABLE_ROLES.includes(role as SignatoryRole);
}

export function evaluateSnagRegisterClosure(snags: SnagRegisterItem[] = []): { closed: boolean; openSnags: SnagRegisterItem[]; summary: { total: number; open: number; closed: number } } {
  const openSnags = snags.filter((snag) => !CLOSED_SNAG_STATUSES.has(String(snag.status ?? '').toLowerCase()));
  const closedCount = snags.length - openSnags.length;
  return {
    closed: openSnags.length === 0,
    openSnags,
    summary: { total: snags.length, open: openSnags.length, closed: closedCount },
  };
}

export function evaluatePracticalCompletionPreconditions(input: {
  snags?: SnagRegisterItem[];
  certificates?: Array<{ id?: string; status?: string; url?: string }>;
  statutoryApprovals?: Array<{ type: string; status: string; reference?: string }>;
  insuranceActive?: boolean;
  utilitiesTransferred?: boolean;
} = {}): PracticalCompletionPrecondition[] {
  const preconditions: PracticalCompletionPrecondition[] = [];

  const snagCheck = evaluateSnagRegisterClosure(input.snags ?? []);
  preconditions.push({
    key: 'snag_register_closed',
    label: 'Snag register closed',
    met: snagCheck.closed,
    detail: snagCheck.closed
      ? `All ${snagCheck.summary.total} snags closed.`
      : `${snagCheck.summary.open} of ${snagCheck.summary.total} snags remain open.`,
  });

  const certificates = input.certificates ?? [];
  const approvedCerts = certificates.filter((c) => {
    const status = String(c.status ?? '').toLowerCase();
    return ['approved', 'issued', 'accepted', 'closed'].includes(status) && typeof c.url === 'string' && c.url.trim().length > 0;
  });
  preconditions.push({
    key: 'compliance_certificates_ready',
    label: 'Compliance certificates ready',
    met: certificates.length > 0 && approvedCerts.length === certificates.length,
    detail: certificates.length === 0
      ? 'No compliance certificates recorded.'
      : `${approvedCerts.length} of ${certificates.length} certificates approved with file links.`,
  });

  const statutoryApprovals = input.statutoryApprovals ?? [];
  const approvedStatutory = statutoryApprovals.filter((a) => String(a.status ?? '').toLowerCase() === 'approved');
  preconditions.push({
    key: 'statutory_approvals_complete',
    label: 'Statutory approvals complete',
    met: statutoryApprovals.length > 0 && approvedStatutory.length === statutoryApprovals.length,
    detail: statutoryApprovals.length === 0
      ? 'No statutory approvals recorded.'
      : `${approvedStatutory.length} of ${statutoryApprovals.length} statutory approvals obtained.`,
  });

  preconditions.push({
    key: 'insurance_active',
    label: 'Insurance active',
    met: input.insuranceActive === true,
    detail: input.insuranceActive ? 'Insurance confirmed active.' : 'Insurance status not confirmed.',
  });

  preconditions.push({
    key: 'utilities_transferred',
    label: 'Utilities/services handed over',
    met: input.utilitiesTransferred === true,
    detail: input.utilitiesTransferred ? 'Utilities transfer confirmed.' : 'Utilities/services transfer not confirmed.',
  });

  return preconditions;
}

export function certifyPracticalCompletion(input: {
  projectId: string;
  jobId?: string;
  issuedBy: string;
  issuedByName?: string;
  signatoryRole: SignatoryRole;
  snags?: SnagRegisterItem[];
  certificates?: Array<{ id?: string; status?: string; url?: string }>;
  statutoryApprovals?: Array<{ type: string; status: string; reference?: string }>;
  insuranceActive?: boolean;
  utilitiesTransferred?: boolean;
}): PracticalCompletionResult {
  const blockers: string[] = [];

  if (!validateSignatoryRole(input.signatoryRole)) {
    blockers.push(`Signatory role "${input.signatoryRole}" is not authorised to issue practical completion certificates.`);
  }

  if (!input.issuedBy?.trim()) {
    blockers.push('Certificate issuer (issuedBy) is required.');
  }

  const preconditions = evaluatePracticalCompletionPreconditions({
    snags: input.snags,
    certificates: input.certificates,
    statutoryApprovals: input.statutoryApprovals,
    insuranceActive: input.insuranceActive,
    utilitiesTransferred: input.utilitiesTransferred,
  });

  const unmetPreconditions = preconditions.filter((p) => !p.met);
  unmetPreconditions.forEach((p) => blockers.push(`${p.label}: ${p.detail}`));

  const snagSummary = evaluateSnagRegisterClosure(input.snags ?? []).summary;
  const ready = blockers.length === 0;

  const certificate: PracticalCompletionCertificate = {
    certificateId: `pc-${input.projectId}-${Date.now()}`,
    projectId: input.projectId,
    jobId: input.jobId,
    issuedBy: input.issuedBy,
    issuedByName: input.issuedByName,
    signatoryRole: input.signatoryRole,
    issuedAt: new Date().toISOString(),
    status: ready ? 'certified' : 'blocked',
    preconditions,
    snagRegisterSummary: snagSummary,
    blockers,
  };

  return { ready, status: certificate.status, blockers, preconditions, certificate };
}

export function recordClientAcceptance(certificate: PracticalCompletionCertificate, acceptedBy: string, signatureRef?: string): PracticalCompletionCertificate {
  if (certificate.status !== 'certified') {
    throw new Error('Cannot record client acceptance: practical completion certificate is not in certified status.');
  }

  return {
    ...certificate,
    status: 'client_accepted',
    clientAcceptance: {
      acceptedBy,
      acceptedAt: new Date().toISOString(),
      signatureRef,
    },
  };
}

export function evaluateOccupationReadinessGate(input: {
  practicalCompletionCertified: boolean;
  clientAcceptanceRecorded: boolean;
  occupancyCertificateObtained: boolean;
  insuranceTransitioned: boolean;
  utilitiesHandoverComplete: boolean;
} = {
  practicalCompletionCertified: false,
  clientAcceptanceRecorded: false,
  occupancyCertificateObtained: false,
  insuranceTransitioned: false,
  utilitiesHandoverComplete: false,
}): { ready: boolean; blockers: string[] } {
  const blockers: string[] = [];

  if (!input.practicalCompletionCertified) {
    blockers.push('Practical completion must be certified before occupation.');
  }
  if (!input.clientAcceptanceRecorded) {
    blockers.push('Client acceptance of practical completion must be recorded.');
  }
  if (!input.occupancyCertificateObtained) {
    blockers.push('Occupancy certificate must be obtained from the municipality.');
  }
  if (!input.insuranceTransitioned) {
    blockers.push('Insurance must transition from construction to occupation cover.');
  }
  if (!input.utilitiesHandoverComplete) {
    blockers.push('Utilities and services handover must be complete.');
  }

  return { ready: blockers.length === 0, blockers };
}

export async function persistPracticalCompletionCertificate(certificate: PracticalCompletionCertificate): Promise<void> {
  const ref = getDemoDoc( 'practical_completions', certificate.certificateId);
  await setDoc(ref, certificate);
}

export async function getPracticalCompletionCertificate(certificateId: string): Promise<PracticalCompletionCertificate | null> {
  const snap = await getDoc(getDemoDoc( 'practical_completions', certificateId));
  if (!snap.exists()) return null;
  return snap.data() as PracticalCompletionCertificate;
}

export async function getPracticalCompletionForProject(projectId: string): Promise<PracticalCompletionCertificate | null> {
  const q = query(getDemoCol( 'practical_completions'), where('projectId', '==', projectId));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].data() as PracticalCompletionCertificate;
}

export async function issuePracticalCompletion(input: {
  projectId: string;
  jobId?: string;
  issuedBy: string;
  issuedByName?: string;
  signatoryRole: SignatoryRole;
  snags?: SnagRegisterItem[];
  certificates?: Array<{ id?: string; status?: string; url?: string }>;
  statutoryApprovals?: Array<{ type: string; status: string; reference?: string }>;
  insuranceActive?: boolean;
  utilitiesTransferred?: boolean;
}): Promise<PracticalCompletionResult> {
  const result = certifyPracticalCompletion(input);

  if (result.certificate) {
    await persistPracticalCompletionCertificate(result.certificate);

    await updateDoc(getDemoDoc( 'projects', input.projectId), {
      practicalCompletion: {
        certificateId: result.certificate.certificateId,
        status: result.certificate.status,
        certifiedAt: result.certificate.issuedAt,
        certifiedBy: input.issuedBy,
      },
      updatedAt: new Date().toISOString(),
    });
  }

  return result;
}

export async function acceptPracticalCompletion(projectId: string, acceptedBy: string, signatureRef?: string): Promise<PracticalCompletionCertificate> {
  const existing = await getPracticalCompletionForProject(projectId);
  if (!existing) {
    throw new Error('No practical completion certificate found for this project.');
  }

  const accepted = recordClientAcceptance(existing, acceptedBy, signatureRef);

  await runTransaction(db, async (transaction) => {
    transaction.set(getDemoDoc( 'practical_completions', accepted.certificateId), accepted, { merge: true });
    transaction.update(getDemoDoc( 'projects', projectId), {
      'practicalCompletion.status': 'client_accepted',
      'practicalCompletion.clientAcceptedBy': acceptedBy,
      'practicalCompletion.clientAcceptedAt': accepted.clientAcceptance?.acceptedAt,
      updatedAt: new Date().toISOString(),
    });
  });

  return accepted;
}

export const practicalCompletionService = {
  evaluateSnagRegisterClosure,
  evaluatePracticalCompletionPreconditions,
  certifyPracticalCompletion,
  recordClientAcceptance,
  evaluateOccupationReadinessGate,
  persistPracticalCompletionCertificate,
  getPracticalCompletionCertificate,
  getPracticalCompletionForProject,
  issuePracticalCompletion,
  acceptPracticalCompletion,
  validateSignatoryRole,
};

export default practicalCompletionService;
