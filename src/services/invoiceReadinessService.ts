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
  writeBatch,
} from 'firebase/firestore';
import type { InvoiceReadinessCheck } from '@/types';
import { notificationService } from './notificationService';

const INVOICE_READINESS_COL = 'invoice_readiness';

export async function checkInvoiceReadiness(input: {
  firmId: string;
  projectId: string;
  timesheetIds: string[];
  expenseIds?: string[];
  currency?: string;
}): Promise<InvoiceReadinessCheck> {
  try {
    if (!input.firmId || !input.projectId) {
      throw new Error('firmId and projectId are required.');
    }

    const blockers: string[] = [];
    const warnings: string[] = [];
    let totalAmountCents = 0;

    // Validate timesheet entries
    for (const tsId of input.timesheetIds) {
      const tsSnap = await getDoc(doc(db, 'timesheets', tsId));
      if (!tsSnap.exists()) {
        blockers.push(`Timesheet entry ${tsId} not found.`);
      } else {
        const tsData = tsSnap.data();
        if (tsData.invoiced) {
          warnings.push(`Timesheet ${tsId} already invoiced.`);
        }
        totalAmountCents += tsData.totalValueCents || 0;
      }
    }

    // Validate expense entries (if provided)
    const expenseIds = input.expenseIds || [];
    // Future: validate expenses from an expenses collection

    const readyForInvoice = blockers.length === 0 && input.timesheetIds.length > 0;
    const now = new Date().toISOString();

    const ref = doc(collection(db, INVOICE_READINESS_COL));
    const check: InvoiceReadinessCheck = {
      id: ref.id,
      firmId: input.firmId,
      projectId: input.projectId,
      timesheetIds: input.timesheetIds,
      expenseIds,
      readyForInvoice,
      blockers,
      warnings,
      totalAmountCents,
      currency: input.currency || 'ZAR',
      invoiced: false,
      checkedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(ref, check);

    if (readyForInvoice) {
      await notificationService.sendNotification(
        '', // Will be sent to firm admins via firm subscription
        'invoice_ready_for_review',
        `Invoice readiness check complete for project ${input.projectId}: R${(totalAmountCents / 100).toFixed(2)} ready.`,
        { invoiceReadinessId: ref.id, firmId: input.firmId, projectId: input.projectId }
      );
    }

    return check;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, INVOICE_READINESS_COL);
  }
}

export async function getReadyInvoices(firmId: string): Promise<InvoiceReadinessCheck[]> {
  try {
    const q = query(
      collection(db, INVOICE_READINESS_COL),
      where('firmId', '==', firmId),
      where('readyForInvoice', '==', true),
      where('invoiced', '==', false),
      orderBy('checkedAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as InvoiceReadinessCheck));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, INVOICE_READINESS_COL);
  }
}

export async function getInvoiceReadinessCheck(id: string): Promise<InvoiceReadinessCheck | null> {
  try {
    const snap = await getDoc(doc(db, INVOICE_READINESS_COL, id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as InvoiceReadinessCheck) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${INVOICE_READINESS_COL}/${id}`);
  }
}

export async function getProjectReadinessChecks(firmId: string, projectId: string): Promise<InvoiceReadinessCheck[]> {
  try {
    const q = query(
      collection(db, INVOICE_READINESS_COL),
      where('firmId', '==', firmId),
      where('projectId', '==', projectId),
      orderBy('checkedAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as InvoiceReadinessCheck));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, INVOICE_READINESS_COL);
  }
}

export async function markInvoiced(id: string, invoiceId: string): Promise<void> {
  try {
    const now = new Date().toISOString();
    await updateDoc(doc(db, INVOICE_READINESS_COL, id), {
      invoiced: true,
      invoiceId,
      updatedAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${INVOICE_READINESS_COL}/${id}`);
  }
}

export async function deleteInvoiceReadinessCheck(id: string): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, INVOICE_READINESS_COL, id));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${INVOICE_READINESS_COL}/${id}`);
  }
}

export function subscribeToReadiness(firmId: string, callback: (checks: InvoiceReadinessCheck[]) => void): () => void {
  return onSnapshot(
    query(collection(db, INVOICE_READINESS_COL), where('firmId', '==', firmId), orderBy('checkedAt', 'desc')),
    (snapshot) => callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as InvoiceReadinessCheck))),
    (error) => {
      console.error('Failed to subscribe to invoice readiness:', error);
      callback([]);
    }
  );
}

export const invoiceReadinessService = {
  checkInvoiceReadiness,
  getReadyInvoices,
  getInvoiceReadinessCheck,
  getProjectReadinessChecks,
  markInvoiced,
  deleteInvoiceReadinessCheck,
  subscribeToReadiness,
};

export default invoiceReadinessService;
