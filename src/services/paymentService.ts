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
import { PRD_PLATFORM_FEE_PERCENTAGE, calculateSplitPlatformFee } from './platformFeePolicy';
import { toast } from 'sonner';
import * as jsMd5 from 'js-md5';
// Handle both ESM and CJS import styles safely
const md5 = (jsMd5 as any).default || jsMd5;

type PayFastEnv = {
  VITE_PAYFAST_MERCHANT_ID?: string;
  VITE_PAYFAST_MERCHANT_KEY?: string;
  VITE_PAYFAST_PASSPHRASE?: string;
  VITE_PAYFAST_SANDBOX?: string;
};

function getPayFastEnv(): PayFastEnv {
  return typeof process !== 'undefined' ? (process.env as PayFastEnv) : {};
}

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

// Safe env accessor that works in both Vite (browser) and Jest (Node)
const getEnv = (key: string) => {
  try { if ((import.meta as any)?.env) return (import.meta as any).env[key]; } catch (e) {}
  try { if (typeof process !== 'undefined') return process.env[key]; } catch (e) {}
  return '';
};

// PayFast configuration
const payFastEnv = getPayFastEnv();
const PAYFAST_CONFIG = {
  merchantId: String(getEnv('VITE_PAYFAST_MERCHANT_ID')),
  merchantKey: String(getEnv('VITE_PAYFAST_MERCHANT_KEY')),
  passphrase: String(getEnv('VITE_PAYFAST_PASSPHRASE')),
  sandbox: getEnv('VITE_PAYFAST_SANDBOX') === 'true',
  url: getEnv('VITE_PAYFAST_SANDBOX') === 'true'
    ? 'https://sandbox.payfast.co.za/eng/process'
    : 'https://www.payfast.co.za/eng/process',
};

const PLATFORM_FEE_PERCENTAGE = PRD_PLATFORM_FEE_PERCENTAGE;
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
   * Generate MD5 hash for PayFast signature
   */
  private async generateMD5(input: string): Promise<string> {
    return md5(input);
  }

  /**
   * Generate PayFast signature
   */
  private async generateSignature(data: Record<string, string>): Promise<string> {
    // Sort keys alphabetically
    const sortedKeys = Object.keys(data).sort();
    let paramString = '';

    sortedKeys.forEach((key) => {
      const value = data[key];
      if (value !== undefined && value !== '') {
        paramString += `${key}=${encodeURIComponent(value.trim()).replace(/%20/g, '+')}&`;
      }
    });

    // Remove trailing &
    paramString = paramString.slice(0, -1);

    // Add passphrase if configured
    if (PAYFAST_CONFIG.passphrase) {
      paramString += `&passphrase=${encodeURIComponent(PAYFAST_CONFIG.passphrase).replace(/%20/g, '+')}`;
    }

    // Generate MD5 hash
    return this.generateMD5(paramString);
  }

  /**
   * Verify PayFast ITN signature
   */
  async verifyITNSignature(pfData: Record<string, string>, signature: string): Promise<boolean> {
    const expectedSignature = await this.generateSignature(pfData);
    return expectedSignature === signature;
  }


  /**
   * Initialize escrow for a job — delegates to server for privileged write.
   */
  async initializeEscrow(job: Job, client: UserProfile): Promise<{ paymentUrl: string; paymentId: string }> {
    const data = await postApiJson('/api/payment/escrow/init', { jobId: job.id });
    const paymentUrl = await this.generatePayFastUrl(data.paymentId, data.totalAmount, job.title, client);
    return { paymentUrl, paymentId: data.paymentId };
  }

  async initializeStageEscrow(project: Project, totalAmount: number): Promise<void> {
    const feeBreakdown = calculateSplitPlatformFee(totalAmount);
    const platformFeeAmount = Math.round(totalAmount * PLATFORM_FEE_PERCENTAGE);
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
    await setDoc(doc(db, 'escrow', project.jobId), escrow, { merge: true });
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
    const projectSnap = await getDoc(doc(db, 'projects', projectId));
    if (!projectSnap.exists()) throw new Error('Project not found');
    const project = { id: projectSnap.id, ...projectSnap.data() } as Project;
    const escrowSnap = await getDoc(doc(db, 'escrow', project.jobId));
    if (!escrowSnap.exists()) throw new Error('Escrow not found');
    const escrow = { jobId: escrowSnap.id, ...escrowSnap.data() } as EscrowV2;
    const now = new Date().toISOString();
    const milestones = (escrow.milestones || []).map((milestone) => milestone.stage === stage ? { ...milestone, status: 'release_requested' as const, requestedAt: now } : milestone);
    if (!milestones.some((milestone) => milestone.stage === stage && milestone.status === 'release_requested')) throw new Error('Milestone not found');
    await updateDoc(doc(db, 'escrow', project.jobId), { milestones, updatedAt: now });
  }

  async approveStageRelease(projectId: string, stage: ProjectStage, adminId: string): Promise<void> {
    const now = new Date().toISOString();
    const result = await runTransaction(db, async (transaction) => {
      const projectRef = doc(db, 'projects', projectId);
      const projectSnap = await transaction.get(projectRef);
      if (!projectSnap.exists()) throw new Error('Project not found');
      const project = { id: projectSnap.id, ...projectSnap.data() } as Project;
      const escrowRef = doc(db, 'escrow', project.jobId);
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
      transaction.set(doc(collection(db, 'ledger')), ledgerEntry);

      const invoice = buildMilestoneInvoice(project, milestone, payeeId, now);
      transaction.set(doc(collection(db, 'invoices')), invoice);
      return { payeeId, amount: milestone.amount, milestoneName: milestone.name, jobId: project.jobId, invoiceNumber: invoice.invoiceNumber };
    });
    await notificationService.notifyPaymentReleased(result.payeeId, result.amount, result.milestoneName, result.jobId);
    await notificationService.notifyInvoiceSent(result.payeeId, result.invoiceNumber, result.amount, result.jobId);
  }

  private async createMilestoneInvoice(project: Project, milestone: EscrowMilestone, architectId: string, createdAt: string): Promise<string> {
    const invoice = buildMilestoneInvoice(project, milestone, architectId, createdAt);
    const invoiceRef = await addDoc(collection(db, 'invoices'), invoice);
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

  /**
   * Generate PayFast payment URL
   */
  private async generatePayFastUrl(
    paymentId: string,
    amount: number,
    itemName: string,
    payer: UserProfile
  ): Promise<string> {
    // PayFast requires absolute URLs for redirects. 
    // We point to our backend routes so the server can handle any quick pre-processing 
    // and then 302 redirect the user back to the SPA dashboards.
    const returnUrl = buildApiUrl(`/api/payment/success?payment_id=${encodeURIComponent(paymentId)}`);
    const cancelUrl = buildApiUrl(`/api/payment/cancel?payment_id=${encodeURIComponent(paymentId)}`);
    const notifyUrl = buildApiUrl("/api/payment/notify");

    const data: Record<string, string> = {
      merchant_id: PAYFAST_CONFIG.merchantId as string,
      merchant_key: PAYFAST_CONFIG.merchantKey as string,
      return_url: returnUrl,
      cancel_url: cancelUrl,
      notify_url: notifyUrl,
      name_first: (payer.displayName || '').split(' ')[0] || payer.displayName || 'User',
      name_last: (payer.displayName || '').split(' ').slice(1).join(' ') || '',
      email_address: payer.email || '',
      m_payment_id: paymentId,
      amount: (amount / 100).toFixed(2),
      item_name: `Escrow: ${itemName.substring(0, 100)}`,
      item_description: `Payment for architectural services via Architex`,
      custom_str1: paymentId,
      custom_str2: payer.uid,
    };

    // Remove empty values
    Object.keys(data).forEach(key => {
      if (data[key] === undefined || data[key] === '') {
        delete data[key];
      }
    });

    // Generate signature
    const signature = await this.generateSignature(data);

    // Build URL
    const params = new URLSearchParams();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        params.append(key, value);
      }
    });
    params.append('signature', signature);

    return `${PAYFAST_CONFIG.url}?${params.toString()}`;
  }

  /**
   * Get payment history for a job
   */
  subscribeToPayments(
    jobId: string,
    callback: (payments: Payment[]) => void
  ): () => void {
    const q = query(
      collection(db, 'payments'),
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
      doc(db, 'escrow', jobId),
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
    const escrowSnap = await getDoc(doc(db, 'escrow', jobId));
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
      collection(db, 'payments'),
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
