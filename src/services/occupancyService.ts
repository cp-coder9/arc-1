import { collection, doc, addDoc, getDocs, getDoc, onSnapshot, query, orderBy, updateDoc, runTransaction } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import type { OccupancyCertificate, OccupancyCertificateStatus, InspectionChecklistItem } from '@/types';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
const PROJECTS_COL = 'projects';
const OCCUPANCY_CERTIFICATES_COL = 'occupancy_certificates';

type FirestoreUnsubscribe = () => void;

function certificatesCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return getDemoCol( PROJECTS_COL, projectId, OCCUPANCY_CERTIFICATES_COL);
}

function certificateDocument(projectId: string, certificateId: string) {
  if (!certificateId) throw new Error('certificateId is required');
  return getDemoDoc( PROJECTS_COL, projectId, OCCUPANCY_CERTIFICATES_COL, certificateId);
}

function withId<T extends { id: string }>(snap: { id: string; data: () => Record<string, unknown> }): T {
  return { id: snap.id, ...snap.data() } as T;
}

/** Occupancy certificate state machine */
const CERTIFICATE_TRANSITIONS: Record<OccupancyCertificateStatus, OccupancyCertificateStatus[]> = {
  draft: ['submitted'],
  submitted: ['under_review', 'draft'],
  under_review: ['approved', 'rejected'],
  approved: ['issued'],
  rejected: ['draft'],
  issued: [],
};

export function isValidCertificateTransition(from: OccupancyCertificateStatus, to: OccupancyCertificateStatus): boolean {
  return CERTIFICATE_TRANSITIONS[from]?.includes(to) ?? false;
}

export async function createOccupancyCertificate(input: {
  projectId: string;
  certificateNumber: string;
  issuingAuthority: string;
  inspectionItems: InspectionChecklistItem[];
  notes?: string;
  createdBy: string;
}): Promise<string> {
  try {
    const now = new Date().toISOString();
    const certificate: Omit<OccupancyCertificate, 'id'> = {
      projectId: input.projectId,
      certificateNumber: input.certificateNumber,
      issuingAuthority: input.issuingAuthority,
      status: 'draft',
      inspectionItems: input.inspectionItems,
      notes: input.notes,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    const ref = await addDoc(certificatesCollection(input.projectId), certificate);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${input.projectId}/${OCCUPANCY_CERTIFICATES_COL}`);
  }
}

export async function submitCertificate(
  projectId: string,
  certificateId: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(certificateDocument(projectId, certificateId));
      if (!snap.exists()) throw new Error(`Certificate ${certificateId} not found`);
      const current = snap.data() as OccupancyCertificate;
      if (!isValidCertificateTransition(current.status, 'submitted')) {
        throw new Error(`Invalid transition from ${current.status} to submitted`);
      }
      transaction.update(certificateDocument(projectId, certificateId), {
        status: 'submitted',
        updatedAt: now,
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${OCCUPANCY_CERTIFICATES_COL}/${certificateId}`);
  }
}

export async function beginReview(
  projectId: string,
  certificateId: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(certificateDocument(projectId, certificateId));
      if (!snap.exists()) throw new Error(`Certificate ${certificateId} not found`);
      const current = snap.data() as OccupancyCertificate;
      if (!isValidCertificateTransition(current.status, 'under_review')) {
        throw new Error(`Invalid transition from ${current.status} to under_review`);
      }
      transaction.update(certificateDocument(projectId, certificateId), {
        status: 'under_review',
        updatedAt: now,
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${OCCUPANCY_CERTIFICATES_COL}/${certificateId}`);
  }
}

export async function approveCertificate(
  projectId: string,
  certificateId: string,
  approvedBy: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(certificateDocument(projectId, certificateId));
      if (!snap.exists()) throw new Error(`Certificate ${certificateId} not found`);
      const current = snap.data() as OccupancyCertificate;
      if (!isValidCertificateTransition(current.status, 'approved')) {
        throw new Error(`Invalid transition from ${current.status} to approved`);
      }
      transaction.update(certificateDocument(projectId, certificateId), {
        status: 'approved',
        approvedBy,
        approvedAt: now,
        updatedAt: now,
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${OCCUPANCY_CERTIFICATES_COL}/${certificateId}`);
  }
}

export async function issueCertificate(
  projectId: string,
  certificateId: string,
  issuedDate: string,
  expiryDate?: string,
  documentUrl?: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(certificateDocument(projectId, certificateId));
      if (!snap.exists()) throw new Error(`Certificate ${certificateId} not found`);
      const current = snap.data() as OccupancyCertificate;
      if (!isValidCertificateTransition(current.status, 'issued')) {
        throw new Error(`Invalid transition from ${current.status} to issued`);
      }
      transaction.update(certificateDocument(projectId, certificateId), {
        status: 'issued',
        issuedDate,
        expiryDate,
        documentUrl,
        updatedAt: now,
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${OCCUPANCY_CERTIFICATES_COL}/${certificateId}`);
  }
}

export async function rejectCertificate(
  projectId: string,
  certificateId: string,
  rejectedBy: string,
  rejectionReason: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(certificateDocument(projectId, certificateId));
      if (!snap.exists()) throw new Error(`Certificate ${certificateId} not found`);
      const current = snap.data() as OccupancyCertificate;
      if (!isValidCertificateTransition(current.status, 'rejected')) {
        throw new Error(`Invalid transition from ${current.status} to rejected`);
      }
      transaction.update(certificateDocument(projectId, certificateId), {
        status: 'rejected',
        rejectedBy,
        rejectedAt: now,
        rejectionReason,
        updatedAt: now,
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${OCCUPANCY_CERTIFICATES_COL}/${certificateId}`);
  }
}

export async function updateInspectionItem(
  projectId: string,
  certificateId: string,
  itemId: string,
  updates: Partial<Pick<InspectionChecklistItem, 'passed' | 'notes' | 'inspectedBy' | 'inspectedAt'>>,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    const snap = await getDoc(certificateDocument(projectId, certificateId));
    if (!snap.exists()) throw new Error(`Certificate ${certificateId} not found`);
    const certificate = snap.data() as OccupancyCertificate;
    const updatedItems = certificate.inspectionItems.map((item) =>
      item.id === itemId ? { ...item, ...updates } : item,
    );
    await updateDoc(certificateDocument(projectId, certificateId), {
      inspectionItems: updatedItems,
      updatedAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${OCCUPANCY_CERTIFICATES_COL}/${certificateId}`);
  }
}

export async function updateCertificate(
  projectId: string,
  certificateId: string,
  updates: Partial<Pick<OccupancyCertificate, 'certificateNumber' | 'issuingAuthority' | 'notes' | 'documentUrl'>>,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await updateDoc(certificateDocument(projectId, certificateId), { ...updates, updatedAt: now });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${OCCUPANCY_CERTIFICATES_COL}/${certificateId}`);
  }
}

export async function getCertificates(projectId: string): Promise<OccupancyCertificate[]> {
  try {
    const snap = await getDocs(query(certificatesCollection(projectId), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => withId<OccupancyCertificate>(d));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${OCCUPANCY_CERTIFICATES_COL}`);
  }
}

export async function getCertificate(projectId: string, certificateId: string): Promise<OccupancyCertificate | null> {
  try {
    const snap = await getDoc(certificateDocument(projectId, certificateId));
    if (!snap.exists()) return null;
    return withId<OccupancyCertificate>(snap);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${OCCUPANCY_CERTIFICATES_COL}/${certificateId}`);
  }
}

export function subscribeToCertificates(
  projectId: string,
  cb: (certificates: OccupancyCertificate[]) => void,
): FirestoreUnsubscribe {
  const q = query(certificatesCollection(projectId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => withId<OccupancyCertificate>(d))), (error) => {
    console.error('Failed to subscribe to occupancy certificates:', error);
    cb([]);
  });
}

export const occupancyService = {
  createOccupancyCertificate,
  submitCertificate,
  beginReview,
  approveCertificate,
  issueCertificate,
  rejectCertificate,
  updateInspectionItem,
  updateCertificate,
  getCertificates,
  getCertificate,
  subscribeToCertificates,
  isValidCertificateTransition,
};

export default occupancyService;
