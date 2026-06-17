import { db, auth } from '../lib/firebase';
import { apiFetch as configuredApiFetch, buildApiUrl } from '../lib/apiClient';
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  getDoc,
  doc,
  orderBy,
  setDoc,
  updateDoc,
  addDoc,
  runTransaction,
} from 'firebase/firestore';
import { getIdToken } from 'firebase/auth';
import { LedgerEntry, Payment, Escrow, EscrowMilestone, EscrowV2, Job, Project, ProjectStage, PROJECT_STAGE_ORDER, UserProfile } from '../types';
import { notificationService } from './notificationService';
import { recordTransaction } from './financialLedgerService';
import { calculateSplitPlatformFee } from './platformFeePolicy';
import { toast } from 'sonner';

import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';

/** Fetch a fresh Firebase ID token for the current user, or throw if not signed in. */
async function requireIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in to perform this action.');
  return getIdToken(user);
}

/** Thin wrapper for authenticated server API calls. */
async function postApiJson(path: string, body: object): Promise<any> {
  const idToken = await requireIdToken();
  const res = await configuredApiFetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Server error: ${res.status}`);
  return data;
}

const VAT_PERCENTAGE = 0.15;

const STAGE_ESCROW_MILESTONES: Array<{ id: string; name: string; stage: ProjectStage; percentage: number; releaseConditions: string[] }> = [
  { id: 'intake', name: 'Intake & Brief Confirmation', stage: 'intake', percentage: 10, releaseConditions: ['Client brief accepted', 'Project record created'] },
  { id: 'appointment', name: 'Professional Appointment', stage: 'appointment', percentage: 15, releaseConditions: ['Lead architect appointed', 'Team responsibilities confirmed'] },
  { id: 'compliance', name: 'Compliance Documentation', stage: 'compliance', percentage: 25, releaseConditions: ['Compliance review completed', 'Submission package ready'] },
  { id: 'tender', name: 'Tender & Procurement', stage: 'tender', percentage: 20, releaseConditions: ['Tender package issued or procurement completed'] },
  { id: 'delivery', name: 'Construction Delivery', stage: 'delivery', percentage: 20, releaseConditions: ['Delivery milestone evidence submitted'] },
  { id: 'closeout', name: 'Close-out & Handover', stage: 'closeout', percentage: 10, releaseConditions: ['Close-out documentation accepted'] },
];

const STAGE_ESCROW_SEQUENCE = STAGE_ESCROW_MILESTONES.map((milestone) => milestone.stage);

function assertStageReleaseAllowed(project: Project, escrow: EscrowV2, milestone: EscrowMilestone): void {
  if (milestone.status !== 'release_requested') {
    if (milestone.status === 'released') throw new Error('Milestone already released');
    throw new Error('Milestone release must be requested before approval');
  }

  const milestoneIndex = STAGE_ESCROW_SEQUENCE.indexOf(milestone.stage);
  if (milestoneIndex === -1) throw new Error('Milestone is not part of the Phase 5 escrow sequence');

  const unreleasedPriorMilestone = (escrow.milestones || []).find((item) => {
    const itemIndex = STAGE_ESCROW_SEQUENCE.indexOf(item.stage);
    return itemIndex >= 0 && itemIndex < milestoneIndex && item.status !== 'released';
  });
  if (unreleasedPriorMilestone) {
    throw new Error(`Cannot release ${milestone.stage} before prior milestone ${unreleasedPriorMilestone.stage} is released`);
  }

  const projectStageIndex = PROJECT_STAGE_ORDER.indexOf(project.currentStage);
  const requestedStageIndex = PROJECT_STAGE_ORDER.indexOf(milestone.stage);
  if (projectStageIndex === -1 || requestedStageIndex === -1) {
    throw new Error('Project stage is not valid for milestone release approval');
  }
  if (projectStageIndex < requestedStageIndex) {
    throw new Error(`Cannot release ${milestone.stage} while project is at ${project.currentStage}`);
  }
}

function buildMilestoneInvoice(project: Project, milestone: EscrowMilestone, architectId: string, createdAt: string) {
  const taxRate = VAT_PERCENTAGE * 100;
  const subtotal = Math.round(milestone.amount / (1 + VAT_PERCENTAGE));
  const taxAmount = milestone.amount - subtotal;
  const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;

  return {
    invoiceNumber,
    jobId: project.jobId,
    projectId: project.id,
    milestoneId: milestone.id,
    escrowMilestoneId: milestone.id,
    clientId: project.clientId,
    architectId,
    items: [{ description: `${milestone.name} milestone release`, quantity: 1, unitPrice: subtotal, total: subtotal }],
    subtotal,
    taxAmount,
    taxRate,
    totalAmount: milestone.amount,
    currency: 'R',
    status: 'sent',
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    notes: `Auto-generated for ${milestone.name} (${milestone.percentage}%) on project ${project.id}`,
    createdAt,
  };
}

class PaymentService {
  /**
   * Calculate escrow amounts including split platform fees.
   * Returns the breakdown of payer surcharge and payee deduction.
   */
  calculateEscrowAmounts(baseAmount: number, _feePercentage?: number) {
    const breakdown = calculateSplitPlatformFee(baseAmount);
    return {
      architectAmount: baseAmount,
      platformFee: breakdown.totalPlatformFee,
      payerSurcharge: breakdown.payerPlatformFee,
      payeeDeduction: breakdown.payeePlatformFee,
      total: breakdown.payerTotalIntoEscrow,
      payerTotalIntoEscrow: breakdown.payerTotalIntoEscrow,
      payeeNetRelease: breakdown.payeeNetRelease,
    };
  }

  /**
   * Initialize escrow for a job — delegates to server for privileged write + PayFast URL generation.
   */
  async initializeEscrow(job: Job, client: UserProfile): Promise<{ paymentUrl: string; paymentId: string }> {
    const data = await postApiJson('/api/payment/escrow/init', { jobId: job.id });
    const paymentUrl = data.paymentUrl;
    return { paymentUrl, paymentId: data.paymentId };
  }

  async initializeStageEscrow(project: Project, totalAmount: number): Promise<void> {
    const feeBreakdown = calculateSplitPlatformFee(totalAmount);
    const platformFeeAmount = feeBreakdown.totalPlatformFee;  // unified
    const milestones = STAGE_ESCROW_MILESTONES.map((milestone, index) => {
      const amount = index === STAGE_ESCROW_MILESTONES.length - 1
        ? totalAmount - STAGE_ESCROW_MILESTONES.slice(0, -1).reduce((sum, item) => sum + Math.round(totalAmount * (item.percentage / 100)), 0)
        : Math.round(totalAmount * (milestone.percentage / 100));
      return { ...milestone, amount, status: 'funded' as const };
    });
    const escrow: EscrowV2 = {
      jobId: project.jobId,
      linkedProjectId: project.id,
      totalAmount,
      heldAmount: totalAmount,
      releasedAmount: 0,
      platformFeeAmount,
      payerSurchargeAmount: feeBreakdown.payerPlatformFee,
      payeeDeductionAmount: feeBreakdown.payeePlatformFee,
      refundedAmount: 0,
      status: 'funded',
      milestones,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await setDoc(getDemoDoc( 'escrow', project.jobId), escrow, { merge: true });
    await recordTransaction({
      projectId: project.id,
      jobId: project.jobId,
      type: 'escrow_deposit',
      amount: totalAmount,
      direction: 'credit',
      description: 'Stage-linked escrow funded',
      payerId: project.clientId,
      payeeId: project.leadArchitectId || project.clientId,
      createdAt: new Date().toISOString(),
    });
  }

  async requestStageRelease(projectId: string, stage: ProjectStage): Promise<void> {
    const projectSnap = await getDoc(getDemoDoc( 'projects', projectId));
    if (!projectSnap.exists()) throw new Error('Project not found');
    const project = { id: projectSnap.id, ...projectSnap.data() } as Project;
    const escrowSnap = await getDoc(getDemoDoc( 'escrow', project.jobId));
    if (!escrowSnap.exists()) throw new Error('Escrow not found');
    const escrow = { jobId: escrowSnap.id, ...escrowSnap.data() } as EscrowV2;
    const now = new Date().toISOString();
    const milestones = (escrow.milestones || []).map((milestone) => milestone.stage === stage ? { ...milestone, status: 'release_requested' as const, requestedAt: now } : milestone);
    if (!milestones.some((milestone) => milestone.stage === stage && milestone.status === 'release_requested')) throw new Error('Milestone not found');
    await updateDoc(getDemoDoc( 'escrow', project.jobId), { milestones, updatedAt: now });
  }

  async approveStageRelease(projectId: string, stage: ProjectStage, adminId: string): Promise<void> {
    const now = new Date().toISOString();
    const result = await runTransaction(db, async (transaction) => {
      const projectRef = getDemoDoc( 'projects', projectId);
      const projectSnap = await transaction.get(projectRef);
      if (!projectSnap.exists()) throw new Error('Project not found');
      const project = { id: projectSnap.id, ...projectSnap.data() } as Project;
      const escrowRef = getDemoDoc( 'escrow', project.jobId);
      const escrowSnap = await transaction.get(escrowRef);
      if (!escrowSnap.exists()) throw new Error('Escrow not found');
      const escrow = { jobId: escrowSnap.id, ...escrowSnap.data() } as EscrowV2;
      const milestone = escrow.milestones?.find((item) => item.stage === stage);
      if (!milestone) throw new Error('Milestone not found');
      assertStageReleaseAllowed(project, escrow, milestone);

      const payeeId = project.leadArchitectId || adminId;
      const releasedMilestone = { ...milestone, status: 'released' as const, releasedAt: now, approvedBy: adminId };
      const milestones = escrow.milestones.map((item) => item.stage === stage ? releasedMilestone : item);
      const releasedAmount = (escrow.releasedAmount || 0) + milestone.amount;
      const heldAmount = Math.max((escrow.heldAmount || 0) - milestone.amount, 0);
      transaction.update(escrowRef, {
        milestones,
        releasedAmount,
        heldAmount,
        status: heldAmount === 0 ? 'fully_released' : 'partially_released',
        updatedAt: now,
      });

      const ledgerEntry: Omit<LedgerEntry, 'id'> = {
        projectId,
        jobId: project.jobId,
        type: 'milestone_release',
        amount: milestone.amount,
        direction: 'debit',
        description: `${milestone.name} released`,
        payerId: project.clientId,
        payeeId,
        escrowMilestoneId: milestone.id,
        createdAt: now,
      };
      transaction.set(doc(getDemoCol( 'ledger')), ledgerEntry);

      const invoice = buildMilestoneInvoice(project, milestone, payeeId, now);
      transaction.set(doc(getDemoCol( 'invoices')), invoice);
      return { payeeId, amount: milestone.amount, milestoneName: milestone.name, jobId: project.jobId, invoiceNumber: invoice.invoiceNumber };
    });
    await notificationService.notifyPaymentReleased(result.payeeId, result.amount, result.milestoneName, result.jobId);
    await notificationService.notifyInvoiceSent(result.payeeId, result.invoiceNumber, result.amount, result.jobId);
  }

  private async createMilestoneInvoice(project: Project, milestone: EscrowMilestone, architectId: string, createdAt: string): Promise<string> {
    const invoice = buildMilestoneInvoice(project, milestone, architectId, createdAt);
    const invoiceRef = await addDoc(getDemoCol( 'invoices'), invoice);
    await notificationService.notifyInvoiceSent(project.clientId, invoice.invoiceNumber, invoice.totalAmount, project.jobId);
    return invoiceRef.id;
  }

/**
 * Confirm payment received (manual trigger — delegates to server).
 * The server handles notification; we only toast based on response.
 */
async confirmPayment(paymentId: string, pfData: Record<string, string>): Promise<void> {
 const data = await postApiJson('/api/payment/confirm', { paymentId, pfData });
 if (data.success === true) {
 toast.success('Escrow funded successfully!');
 } else {
 toast.info(data.message || 'Payment confirmed');
 }
}

  /**
   * Release milestone payment — delegates to server for privileged write.
   */
  async releaseMilestone(
    job: Job,
    milestone: 'initial' | 'draft' | 'final',
    requestingUserId: string
  ): Promise<void> {
    const data = await postApiJson('/api/payment/milestone/release', { jobId: job.id, milestone });
    if (job.selectedArchitectId) {
      await notificationService.notifyPaymentReleased(
        job.selectedArchitectId,
        data.architectAmount,
        milestone,
        job.id
      );
    }
    toast.success(`R${data.architectAmount.toLocaleString()} released successfully`);
  }

/**
 * Request milestone release (architect initiates) — delegates to server.
 * Server emits notification; client does not duplicate.
 */
async requestMilestoneRelease(
 job: Job,
 milestone: 'initial' | 'draft' | 'final',
 architectId: string
): Promise<void> {
 await postApiJson('/api/payment/milestone/request', { jobId: job.id, milestone });
 toast.success('Payment release requested');
}

/**
 * Process refund — delegates to server for privileged write.
 * Server emits notification; client does not duplicate.
 */
async processRefund(
 job: Job,
 amount: number,
 reason: string,
 requestingUserId: string
): Promise<void> {
 const data = await postApiJson('/api/payment/refund', { jobId: job.id, amount, reason });
 toast.success(`Refund of R${data.refundAmount.toLocaleString()} processed`);
}

/** Redirect user to PayFast — server builds signed URL. */
  async redirectToPayFast(jobId: string): Promise<void> {
    const token = await requireIdToken();
    const res = await configuredApiFetch('/api/payment/escrow/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jobId }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => 'Unknown error');
      throw new Error(`Payment initiation failed (${res.status}): ${err}`);
    }
    const data = await res.json();
    if (!data.paymentUrl) throw new Error('Server did not return a payment URL');
    window.location.href = data.paymentUrl;
  }

  /**
   * Get payment history for a job
   */
  subscribeToPayments(
    jobId: string,
    callback: (payments: Payment[]) => void
  ): () => void {
    const q = query(
      getDemoCol( 'payments'),
      where('jobId', '==', jobId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const payments = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Payment));
      callback(payments);
    });

    return unsubscribe;
  }

  /**
   * Get escrow details
   */
  subscribeToEscrow(
    jobId: string,
    callback: (escrow: Escrow | null) => void
  ): () => void {
    const unsubscribe = onSnapshot(
      getDemoDoc( 'escrow', jobId),
      (doc) => {
        if (doc.exists()) {
          callback({ jobId: doc.id, ...doc.data() } as Escrow);
        } else {
          callback(null);
        }
      }
    );

    return unsubscribe;
  }

  /**
   * Get escrow snapshot (one-time fetch)
   */
  async getEscrow(jobId: string): Promise<Escrow | null> {
    const escrowSnap = await getDoc(getDemoDoc( 'escrow', jobId));
    if (escrowSnap.exists()) {
      return { jobId: escrowSnap.id, ...escrowSnap.data() } as Escrow;
    }
    return null;
  }

  /**
   * Get total platform earnings
   */
  async getPlatformEarnings(): Promise<{ totalFees: number; totalTransactions: number }> {
    const q = query(
      getDemoCol( 'payments'),
      where('status', '==', 'completed')
    );

    const snapshot = await getDocs(q);
    let totalFees = 0;

    snapshot.docs.forEach(doc => {
      const payment = doc.data() as Payment;
      if ((payment.metadata as any)?.platformFee) {
        totalFees += (payment.metadata as any).platformFee;
      }
    });

    return {
      totalFees,
      totalTransactions: snapshot.size,
    };
  }
}

export const paymentService = new PaymentService();
export default paymentService;
