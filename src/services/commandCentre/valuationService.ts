/**
 * Project Command Centre — Valuation Service
 *
 * Manages payment certificates, retention calculations, and milestone-linked valuations.
 * Persisted at `projects/{projectId}/payment_certificates/`.
 *
 * @module commandCentre/valuationService
 */

import {
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firebase';
import { getDemoDoc, getDemoCol } from '@/demo-seed/demoFirestore';
import { createPaymentCertificateSchema } from '@/services/commandCentre/schemas';
import { recordAudit } from '@/services/commandCentre/commandCentreService';
import type { PaymentCertificate, CertificateStatus, CommandCentreAction } from '@/services/commandCentre/types';

// ── ID Generation ────────────────────────────────────────────────────────────

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

// ── Constants ────────────────────────────────────────────────────────────────

const PROJECTS_COL = 'projects';
const CERTIFICATES_COL = 'payment_certificates';

// ── Firestore Path Helpers ───────────────────────────────────────────────────

function certificatesCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return getDemoCol(PROJECTS_COL, projectId, CERTIFICATES_COL);
}

function certificateDocument(projectId: string, certId: string) {
  if (!projectId) throw new Error('projectId is required');
  if (!certId) throw new Error('certId is required');
  return getDemoDoc(PROJECTS_COL, projectId, CERTIFICATES_COL, certId);
}

// ── Pure Computation Functions (exported for testing) ────────────────────────

/**
 * Calculates retention amount and net certified amount from gross value and retention percentage.
 *
 * Invariant: netCertifiedAmount + retentionAmount === grossValue
 *
 * @param grossValue - The total gross value of work certified
 * @param retentionPercent - The retention percentage (0-100)
 * @returns Object containing retentionAmount and netCertifiedAmount
 */
export function calculateRetention(
  grossValue: number,
  retentionPercent: number,
): { retentionAmount: number; netCertifiedAmount: number } {
  const retentionAmount = grossValue * retentionPercent / 100;
  const netCertifiedAmount = grossValue - retentionAmount;
  return { retentionAmount, netCertifiedAmount };
}

// ── Certificate CRUD Operations ──────────────────────────────────────────────

/**
 * Creates a new payment certificate for a project.
 * Automatically calculates retention from grossValue and retentionPercent.
 * Validates input against createPaymentCertificateSchema.
 *
 * Returns the created certificate along with an optional Action Centre event
 * if the initial status is 'awaiting_signature'.
 */
export async function createCertificate(
  projectId: string,
  data: {
    grossValue: number;
    retentionPercent: number;
    period: string;
    createdBy: string;
    status?: CertificateStatus;
  },
): Promise<{ certificate: PaymentCertificate; actionEvent?: CommandCentreAction }> {
  // Validate input
  createPaymentCertificateSchema.parse({
    grossValue: data.grossValue,
    retentionPercent: data.retentionPercent,
    period: data.period,
  });

  // Calculate retention
  const { retentionAmount, netCertifiedAmount } = calculateRetention(
    data.grossValue,
    data.retentionPercent,
  );

  // Determine next certificate number
  const existingCerts = await getCertificates(projectId);
  const certificateNumber = existingCerts.length + 1;

  const now = new Date().toISOString();
  const status: CertificateStatus = data.status ?? 'draft';

  const certificateData: Omit<PaymentCertificate, 'id'> = {
    projectId,
    certificateNumber,
    period: data.period,
    grossValue: data.grossValue,
    retentionAmount,
    retentionPercent: data.retentionPercent,
    netCertifiedAmount,
    status,
    createdBy: data.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const docRef = await addDoc(certificatesCollection(projectId), certificateData);
    const certificate: PaymentCertificate = { id: docRef.id, ...certificateData };

    // Fire-and-forget audit
    recordAudit({
      projectId,
      actorId: data.createdBy,
      actorName: data.createdBy,
      actionType: 'create',
      entityType: 'payment_certificate',
      entityId: docRef.id,
      after: certificateData as unknown as Record<string, unknown>,
      timestamp: now,
    });

    // If certificate requires signature, create Action Centre event
    let actionEvent: CommandCentreAction | undefined;
    if (status === 'awaiting_signature') {
      actionEvent = buildSignatureActionEvent(projectId, certificate);
    }

    return { certificate, actionEvent };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${projectId}/${CERTIFICATES_COL}`);
  }
}

/**
 * Updates an existing payment certificate.
 * If the status changes to 'awaiting_signature', returns an Action Centre event.
 */
export async function updateCertificate(
  projectId: string,
  certId: string,
  data: Partial<Pick<PaymentCertificate, 'grossValue' | 'retentionPercent' | 'period' | 'status' | 'linkedMilestoneId'>>,
): Promise<{ certificate: PaymentCertificate; actionEvent?: CommandCentreAction }> {
  const certRef = certificateDocument(projectId, certId);

  try {
    const snap = await getDoc(certRef);
    if (!snap.exists()) {
      throw new Error(`Payment certificate '${certId}' not found`);
    }

    const existing = { id: snap.id, ...snap.data() } as PaymentCertificate;
    const now = new Date().toISOString();

    // If grossValue or retentionPercent changes, recalculate retention
    const grossValue = data.grossValue ?? existing.grossValue;
    const retentionPercent = data.retentionPercent ?? existing.retentionPercent;
    let retentionAmount = existing.retentionAmount;
    let netCertifiedAmount = existing.netCertifiedAmount;

    if (data.grossValue !== undefined || data.retentionPercent !== undefined) {
      const calc = calculateRetention(grossValue, retentionPercent);
      retentionAmount = calc.retentionAmount;
      netCertifiedAmount = calc.netCertifiedAmount;
    }

    const updates: Partial<PaymentCertificate> = {
      ...data,
      grossValue,
      retentionPercent,
      retentionAmount,
      netCertifiedAmount,
      updatedAt: now,
    };

    // Remove id from updates if present (shouldn't modify the doc ID)
    delete (updates as Record<string, unknown>)['id'];

    await updateDoc(certRef, updates as Record<string, unknown>);

    const updated: PaymentCertificate = { ...existing, ...updates, id: certId };

    // Fire-and-forget audit
    recordAudit({
      projectId,
      actorId: existing.createdBy,
      actorName: existing.createdBy,
      actionType: 'update',
      entityType: 'payment_certificate',
      entityId: certId,
      before: existing as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
      timestamp: now,
    });

    // If status changed to 'awaiting_signature', create Action Centre event
    let actionEvent: CommandCentreAction | undefined;
    if (data.status === 'awaiting_signature' && existing.status !== 'awaiting_signature') {
      actionEvent = buildSignatureActionEvent(projectId, updated);
    }

    return { certificate: updated, actionEvent };
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${CERTIFICATES_COL}/${certId}`);
  }
}

/**
 * Retrieves all payment certificates for a project, ordered by certificate number.
 */
export async function getCertificates(projectId: string): Promise<PaymentCertificate[]> {
  try {
    const q = query(certificatesCollection(projectId), orderBy('certificateNumber', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PaymentCertificate));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${PROJECTS_COL}/${projectId}/${CERTIFICATES_COL}`);
  }
}

/**
 * Links a payment certificate to a milestone.
 */
export async function linkCertificateToMilestone(
  projectId: string,
  certId: string,
  milestoneId: string,
): Promise<PaymentCertificate> {
  const certRef = certificateDocument(projectId, certId);

  try {
    const snap = await getDoc(certRef);
    if (!snap.exists()) {
      throw new Error(`Payment certificate '${certId}' not found`);
    }

    const existing = { id: snap.id, ...snap.data() } as PaymentCertificate;
    const now = new Date().toISOString();

    await updateDoc(certRef, {
      linkedMilestoneId: milestoneId,
      updatedAt: now,
    });

    // Fire-and-forget audit
    recordAudit({
      projectId,
      actorId: existing.createdBy,
      actorName: existing.createdBy,
      actionType: 'update',
      entityType: 'payment_certificate',
      entityId: certId,
      before: { linkedMilestoneId: existing.linkedMilestoneId },
      after: { linkedMilestoneId: milestoneId },
      timestamp: now,
    });

    return { ...existing, linkedMilestoneId: milestoneId, updatedAt: now };
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${CERTIFICATES_COL}/${certId}`);
  }
}

// ── Action Centre Event Builder ──────────────────────────────────────────────

/**
 * Builds an Action Centre event for certificate signature requirement.
 */
function buildSignatureActionEvent(
  projectId: string,
  certificate: PaymentCertificate,
): CommandCentreAction {
  return {
    id: generateId(),
    projectId,
    type: 'financial',
    title: `Payment Certificate #${certificate.certificateNumber} requires signature`,
    description: `Certificate for period ${certificate.period} (R ${certificate.netCertifiedAmount.toLocaleString()}) is awaiting signature from the principal agent.`,
    assigneeId: 'principal_agent', // Resolved at integration layer
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    priority: 'high',
    sourceSubsystem: 'valuations',
    sourceEntityId: certificate.id,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
}

// ── Service Export ───────────────────────────────────────────────────────────

export const valuationService = {
  createCertificate,
  updateCertificate,
  getCertificates,
  linkCertificateToMilestone,
  calculateRetention,
};

export default valuationService;
