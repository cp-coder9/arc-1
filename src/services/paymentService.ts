import { db, auth } from '../lib/firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  getDoc,
  doc,
  orderBy,
} from 'firebase/firestore';
import { getIdToken } from 'firebase/auth';
import { Payment, Escrow, Job, UserProfile } from '../types';
import { notificationService } from './notificationService';
import { toast } from 'sonner';
import * as jsMd5 from 'js-md5';
// Handle both ESM and CJS import styles safely
const md5 = (jsMd5 as any).default || jsMd5;

/** Fetch a fresh Firebase ID token for the current user, or throw if not signed in. */
async function requireIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in to perform this action.');
  return getIdToken(user);
}

/** Thin wrapper for authenticated server API calls. */
async function apiFetch(path: string, body: object): Promise<any> {
  const idToken = await requireIdToken();
  const res = await fetch(path, {
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

// PayFast configuration
const PAYFAST_CONFIG = {
  merchantId: String(import.meta.env.VITE_PAYFAST_MERCHANT_ID || ''),
  merchantKey: String(import.meta.env.VITE_PAYFAST_MERCHANT_KEY || ''),
  passphrase: String(import.meta.env.VITE_PAYFAST_PASSPHRASE || ''),
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
    const data = await apiFetch('/api/payment/escrow/init', { jobId: job.id });
    const paymentUrl = await this.generatePayFastUrl(data.paymentId, data.totalAmount, job.title, client);
    return { paymentUrl, paymentId: data.paymentId };
  }

  /**
   * Confirm payment received (manual trigger — delegates to server).
   */
  async confirmPayment(paymentId: string, pfData: Record<string, string>): Promise<void> {
    await apiFetch('/api/payment/confirm', { paymentId, pfData });
    toast.success('Escrow funded successfully!');
  }

  /**
   * Release milestone payment — delegates to server for privileged write.
   */
  async releaseMilestone(
    job: Job,
    milestone: 'initial' | 'draft' | 'final',
    requestingUserId: string
  ): Promise<void> {
    const data = await apiFetch('/api/payment/milestone/release', { jobId: job.id, milestone });
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
   */
  async requestMilestoneRelease(
    job: Job,
    milestone: 'initial' | 'draft' | 'final',
    architectId: string
  ): Promise<void> {
    await apiFetch('/api/payment/milestone/request', { jobId: job.id, milestone });
    await notificationService.notifyMilestoneRequest(
      job.clientId,
      job.title,
      milestone,
      job.id
    );
    toast.success('Payment release requested');
  }

  /**
   * Process refund — delegates to server for privileged write.
   */
  async processRefund(
    job: Job,
    amount: number,
    reason: string,
    requestingUserId: string
  ): Promise<void> {
    const data = await apiFetch('/api/payment/refund', { jobId: job.id, amount, reason });
    await notificationService.notifyRefundProcessed(
      job.clientId,
      data.refundAmount,
      reason,
      job.id
    );
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
    const returnUrl = `${window.location.origin}/api/payment/success?payment_id=${paymentId}`;
    const cancelUrl = `${window.location.origin}/api/payment/cancel?payment_id=${paymentId}`;
    const notifyUrl = `${window.location.origin}/api/payment/notify`;

    const data: Record<string, string> = {
      merchant_id: PAYFAST_CONFIG.merchantId,
      merchant_key: PAYFAST_CONFIG.merchantKey,
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
