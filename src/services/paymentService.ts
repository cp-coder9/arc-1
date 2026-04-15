/**
 * Payment Service
 * Handles PayFast integration, escrow management, and payment processing
 */

import { db } from '../lib/firebase';
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  query,
  where,
  onSnapshot,
  getDocs,
  getDoc,
  orderBy,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { Payment, Escrow, Job, UserProfile } from '../types';
import { notificationService } from './notificationService';
import { toast } from 'sonner';

// PayFast configuration
const PAYFAST_CONFIG = {
  merchantId: import.meta.env.VITE_PAYFAST_MERCHANT_ID || '',
  merchantKey: import.meta.env.VITE_PAYFAST_MERCHANT_KEY || '',
  passphrase: import.meta.env.VITE_PAYFAST_PASSPHRASE || '',
  sandbox: import.meta.env.VITE_PAYFAST_SANDBOX === 'true',
  url: import.meta.env.VITE_PAYFAST_SANDBOX === 'true'
    ? 'https://sandbox.payfast.co.za/eng/process'
    : 'https://www.payfast.co.za/eng/process',
};

const PLATFORM_FEE_PERCENTAGE = 0.05;

class PaymentService {
  /**
   * Generate MD5 hash for PayFast signature
   */
  private async generateMD5(input: string): Promise<string> {
    // Use browser's crypto API for MD5 (or server-side crypto in production)
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('MD5', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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
   * Initialize escrow for a job
   */
  async initializeEscrow(job: Job, client: UserProfile): Promise<{ paymentUrl: string; paymentId: string }> {
    const platformFee = Math.round(job.budget * PLATFORM_FEE_PERCENTAGE);
    const totalAmount = job.budget + platformFee;

    // Create escrow record
    const escrowData: Omit<Escrow, 'jobId'> = {
      totalAmount: totalAmount,
      heldAmount: 0, // Will be updated after payment confirmation
      releasedAmount: 0,
      platformFeeAmount: platformFee,
      status: 'pending',
      milestones: {
        initial: { percentage: 20, status: 'pending', released: false },
        draft: { percentage: 40, status: 'pending', released: false },
        final: { percentage: 40, status: 'pending', released: false },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await updateDoc(doc(db, 'escrow', job.id), escrowData);

    // Create initial payment record
    const payment: Omit<Payment, 'id'> = {
      jobId: job.id,
      payerId: job.clientId,
      payeeId: job.selectedArchitectId || '',
      amount: totalAmount,
      type: 'escrow_deposit',
      status: 'pending',
      metadata: {
        platformFee,
        architectAmount: job.budget,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const paymentDoc = await addDoc(collection(db, 'payments'), payment);

    // Generate PayFast payment URL
    const paymentUrl = await this.generatePayFastUrl(paymentDoc.id, totalAmount, job.title, client);

    // Update escrow with payment reference
    await updateDoc(doc(db, 'escrow', job.id), {
      paymentId: paymentDoc.id,
    });

    return { paymentUrl, paymentId: paymentDoc.id };
  }

  /**
   * Confirm payment received from PayFast
   */
  async confirmPayment(paymentId: string, pfData: Record<string, string>): Promise<void> {
    const paymentRef = doc(db, 'payments', paymentId);
    const paymentSnap = await getDoc(paymentRef);

    if (!paymentSnap.exists()) {
      throw new Error('Payment not found');
    }

    const payment = paymentSnap.data() as Payment;

    // Verify payment data
    const expectedAmount = (payment.amount / 100).toFixed(2);
    if (pfData['amount_gross'] !== expectedAmount) {
      throw new Error('Payment amount mismatch');
    }

    // Update payment status
    await updateDoc(paymentRef, {
      status: 'completed',
      transactionId: pfData['pf_payment_id'],
      processedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {
        ...payment.metadata,
        payfastData: pfData,
      },
    });

    // Update escrow
    const escrowRef = doc(db, 'escrow', payment.jobId);
    await updateDoc(escrowRef, {
      status: 'funded',
      heldAmount: payment.amount,
      fundedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Notify parties
    await notificationService.notifyEscrowFunded(
      payment.payerId,
      payment.payeeId,
      payment.amount,
      payment.jobId
    );

    toast.success('Escrow funded successfully!');
  }

  /**
   * Release milestone payment
   */
  async releaseMilestone(
    job: Job,
    milestone: 'initial' | 'draft' | 'final',
    requestingUserId: string
  ): Promise<void> {
    // Verify requester is the client
    if (requestingUserId !== job.clientId) {
      throw new Error('Only the client can release payments');
    }

    // Get escrow
    const escrowRef = doc(db, 'escrow', job.id);
    const escrowSnap = await getDoc(escrowRef);

    if (!escrowSnap.exists()) {
      throw new Error('Escrow not found');
    }

    const escrow = escrowSnap.data() as Escrow;

    // Check if escrow is funded
    if (escrow.status !== 'funded' && escrow.status !== 'partially_released') {
      throw new Error('Escrow is not funded');
    }

    // Check if milestone already released
    if (escrow.milestones[milestone].released) {
      throw new Error('Milestone already released');
    }

    const percentages = {
      initial: 0.20,
      draft: 0.40,
      final: 0.40,
    };

    const releaseAmount = Math.round(job.budget * percentages[milestone]);
    const platformFee = Math.round(releaseAmount * PLATFORM_FEE_PERCENTAGE);
    const architectAmount = releaseAmount - platformFee;

    // Use batch for atomic update
    const batch = writeBatch(db);

    // Update escrow
    batch.update(escrowRef, {
      heldAmount: escrow.heldAmount - releaseAmount,
      releasedAmount: escrow.releasedAmount + releaseAmount,
      platformFeeAmount: escrow.platformFeeAmount + platformFee,
      [`milestones.${milestone}.status`]: 'released',
      [`milestones.${milestone}.released`]: true,
      [`milestones.${milestone}.releasedAt`]: new Date().toISOString(),
      [`milestones.${milestone}.amount`]: architectAmount,
      status: escrow.heldAmount - releaseAmount <= 0 ? 'fully_released' : 'partially_released',
      updatedAt: new Date().toISOString(),
    });

    // Create payment record
    const paymentRef = doc(collection(db, 'payments'));
    const payment: Omit<Payment, 'id'> = {
      jobId: job.id,
      payerId: job.clientId,
      payeeId: job.selectedArchitectId || '',
      amount: architectAmount,
      type: 'milestone_release',
      milestone,
      status: 'completed',
      metadata: {
        platformFee,
        grossAmount: releaseAmount,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    batch.set(paymentRef, payment);

    await batch.commit();

    // Notify architect
    if (job.selectedArchitectId) {
      await notificationService.notifyPaymentReleased(
        job.selectedArchitectId,
        architectAmount,
        milestone,
        job.id
      );
    }

    toast.success(`R${architectAmount.toLocaleString()} released successfully`);
  }

  /**
   * Request milestone release (architect initiates)
   */
  async requestMilestoneRelease(
    job: Job,
    milestone: 'initial' | 'draft' | 'final',
    architectId: string
  ): Promise<void> {
    if (architectId !== job.selectedArchitectId) {
      throw new Error('Only the assigned architect can request payment');
    }

    // Get escrow
    const escrowRef = doc(db, 'escrow', job.id);
    const escrowSnap = await getDoc(escrowRef);

    if (!escrowSnap.exists()) {
      throw new Error('Escrow not found');
    }

    const escrow = escrowSnap.data() as Escrow;

    if (escrow.milestones[milestone].released) {
      throw new Error('Milestone already released');
    }

    if (escrow.milestones[milestone].status === 'requested') {
      throw new Error('Release already requested');
    }

    // Update milestone status
    await updateDoc(escrowRef, {
      [`milestones.${milestone}.status`]: 'requested',
      [`milestones.${milestone}.requestedAt`]: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Notify client
    await notificationService.notifyMilestoneRequest(
      job.clientId,
      job.title,
      milestone,
      job.id
    );

    toast.success('Payment release requested');
  }

  /**
   * Process refund
   */
  async processRefund(
    job: Job,
    amount: number,
    reason: string,
    requestingUserId: string
  ): Promise<void> {
    // Only client can request refund
    if (requestingUserId !== job.clientId) {
      throw new Error('Only the client can request a refund');
    }

    // Get escrow
    const escrowRef = doc(db, 'escrow', job.id);
    const escrowSnap = await getDoc(escrowRef);

    if (!escrowSnap.exists()) {
      throw new Error('Escrow not found');
    }

    const escrow = escrowSnap.data() as Escrow;

    // Check available amount
    if (amount > escrow.heldAmount) {
      throw new Error('Refund amount exceeds available funds');
    }

    const platformFee = Math.round(amount * PLATFORM_FEE_PERCENTAGE);
    const refundAmount = amount - platformFee;

    const batch = writeBatch(db);

    // Update escrow
    batch.update(escrowRef, {
      heldAmount: escrow.heldAmount - amount,
      refundedAmount: (escrow.refundedAmount || 0) + refundAmount,
      status: escrow.heldAmount - amount <= 0 ? 'refunded' : 'partially_refunded',
      updatedAt: new Date().toISOString(),
    });

    // Create refund payment record
    const paymentRef = doc(collection(db, 'payments'));
    const payment: Omit<Payment, 'id'> = {
      jobId: job.id,
      payerId: job.clientId,
      payeeId: job.selectedArchitectId || '',
      amount: refundAmount,
      type: 'refund',
      status: 'completed',
      metadata: { reason, platformFee },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    batch.set(paymentRef, payment);

    await batch.commit();

    // Notify parties
    await notificationService.notifyRefundProcessed(
      job.clientId,
      refundAmount,
      reason,
      job.id
    );

    toast.success(`Refund of R${refundAmount.toLocaleString()} processed`);
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
    const returnUrl = `${window.location.origin}/payment/success?payment_id=${paymentId}`;
    const cancelUrl = `${window.location.origin}/payment/cancel?payment_id=${paymentId}`;
    const notifyUrl = `${window.location.origin}/api/payment/notify`;

    const data: Record<string, string> = {
      merchant_id: PAYFAST_CONFIG.merchantId,
      merchant_key: PAYFAST_CONFIG.merchantKey,
      return_url: returnUrl,
      cancel_url: cancelUrl,
      notify_url: notifyUrl,
      name_first: payer.displayName.split(' ')[0] || payer.displayName,
      name_last: payer.displayName.split(' ').slice(1).join(' ') || '',
      email_address: payer.email,
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
      if (payment.metadata?.platformFee) {
        totalFees += payment.metadata.platformFee;
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
