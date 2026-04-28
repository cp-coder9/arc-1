/**
 * Notification Service
 * Handles in-app, email (SendGrid), and push (FCM) notifications
 */

import { db } from '../lib/firebase';
import { toast } from 'sonner';
import {
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  updateDoc,
  doc,
  orderBy,
  limit,
  getDocs,
  getDoc,
  writeBatch
} from 'firebase/firestore';
import { Notification, NotificationPreferences, NotificationType } from '../types';

// Notification types with their default channels
const NOTIFICATION_CONFIG: Record<NotificationType, { title: string; channels: ('in_app' | 'email' | 'push')[] }> = {
  job_application: {
    title: 'New Application',
    channels: ['in_app', 'email'],
  },
  application_accepted: {
    title: 'Application Accepted',
    channels: ['in_app', 'email', 'push'],
  },
  drawing_submitted: {
    title: 'New Drawing Submitted',
    channels: ['in_app', 'email'],
  },
  ai_review_complete: {
    title: 'AI Review Complete',
    channels: ['in_app', 'push'],
  },
  admin_approval: {
    title: 'Drawing Approved',
    channels: ['in_app', 'email', 'push'],
  },
  admin_rejection: {
    title: 'Drawing Rejected',
    channels: ['in_app', 'email', 'push'],
  },
  payment_released: {
    title: 'Payment Released',
    channels: ['in_app', 'email'],
  },
  message: {
    title: 'New Message',
    channels: ['in_app', 'email', 'push'],
  },
  milestone_due: {
    title: 'Milestone Due',
    channels: ['in_app', 'email'],
  },
  council_update: {
    title: 'Council Update',
    channels: ['in_app', 'email'],
  },
  invoice_sent: {
    title: 'New Invoice',
    channels: ['in_app', 'email'],
  },
  invoice_paid: {
    title: 'Invoice Paid',
    channels: ['in_app', 'email', 'push'],
  },
};

class NotificationService {
  private unsubscribeFns: Map<string, () => void> = new Map();

  private async getUserPreferences(userId: string): Promise<NotificationPreferences> {
    const userSnap = await getDoc(doc(db, 'users', userId));
    const preferences = userSnap.data()?.notificationPreferences as Partial<NotificationPreferences> | undefined;
    return {
      in_app: preferences?.in_app ?? true,
      email: preferences?.email ?? true,
      push: preferences?.push ?? true,
    };
  }

  /**
   * Send a notification to a user
   */
  async sendNotification(
    userId: string,
    type: NotificationType,
    body: string,
    data?: { jobId?: string; submissionId?: string; senderId?: string; applicationId?: string }
  ): Promise<void> {
    const config = NOTIFICATION_CONFIG[type];
    const preferences = await this.getUserPreferences(userId);
    const channels = config.channels.filter(channel => preferences[channel]);

    if (channels.length === 0) return;

    const notification: Omit<Notification, 'id'> = {
      userId,
      type,
      title: config.title,
      body,
      data: data || {},
      isRead: false,
      channels,
      createdAt: new Date().toISOString(),
      deliveryStatus: 'pending' as any, // Tracked by the server.ts notification worker
    };

    // Save to Firestore (triggers Cloud Function for email/push)
    await addDoc(collection(db, 'notifications'), notification);

    // Also send in-app immediately
    if (channels.includes('in_app')) {
      this.showToast(notification.title, body, type);
    }
  }

  /**
   * Subscribe to notifications for a user
   */
  subscribeToNotifications(
    userId: string,
    callback: (notifications: Notification[]) => void
  ): () => void {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifications = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Notification));
      callback(notifications);
    });

    this.unsubscribeFns.set(userId, unsubscribe);
    return unsubscribe;
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    const ref = doc(db, 'notifications', notificationId);
    await updateDoc(ref, {
      isRead: true,
      readAt: new Date().toISOString(),
    });
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<void> {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('isRead', '==', false)
    );

    const snapshot = await getDocs(q);
    const batch = writeBatch(db);

    snapshot.docs.forEach(doc => {
      batch.update(doc.ref, {
        isRead: true,
        readAt: new Date().toISOString(),
      });
    });

    await batch.commit();
  }

  /**
   * Get unread count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('isRead', '==', false)
    );

    const snapshot = await getDocs(q);
    return snapshot.size;
  }

  /**
   * Show toast notification
   */
  private showToast(title: string, body: string, type: NotificationType): void {
    const icons: Record<NotificationType, string> = {
      job_application: '👤',
      application_accepted: '✅',
      drawing_submitted: '📄',
      ai_review_complete: '🤖',
      admin_approval: '✅',
      admin_rejection: '❌',
      payment_released: '💰',
      message: '💬',
      milestone_due: '⏰',
      council_update: '🏛️',
      invoice_sent: '📄',
      invoice_paid: '💰',
    };

    toast(`${icons[type] || '🔔'} ${title}`, {
      description: body,
      duration: 5000,
    });
  }

  /**
   * Cleanup subscriptions
   */
  cleanup(): void {
    this.unsubscribeFns.forEach(unsubscribe => unsubscribe());
    this.unsubscribeFns.clear();
  }

  /**
   * Register FCM token for push notifications
   */
  async registerToken(token: string): Promise<void> {
    try {
      const { getAuth } = await import('firebase/auth');
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) return;
      const idToken = await user.getIdToken();
      await fetch('/api/notifications/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ fcmToken: token })
      });
    } catch (error) {
      console.error('Failed to register FCM token:', error);
    }
  }

  // === Notification Triggers ===

  /**
   * Notify client of new application
   */
  async notifyNewApplication(clientId: string, architectName: string, jobTitle: string, jobId: string): Promise<void> {
    await this.sendNotification(
      clientId,
      'job_application',
      `${architectName} applied for "${jobTitle}"`,
      { jobId }
    );
  }

  /**
   * Notify architect of application acceptance
   */
  async notifyApplicationAccepted(architectId: string, jobTitle: string, jobId: string): Promise<void> {
    await this.sendNotification(
      architectId,
      'application_accepted',
      `Your application for "${jobTitle}" was accepted!`,
      { jobId }
    );
  }

  /**
   * Notify client of new drawing submission
   */
  async notifyDrawingSubmitted(clientId: string, drawingName: string, jobId: string, submissionId: string): Promise<void> {
    await this.sendNotification(
      clientId,
      'drawing_submitted',
      `New drawing "${drawingName}" submitted for review`,
      { jobId, submissionId }
    );
  }

  /**
   * Notify users of AI review completion
   */
  async notifyAIReviewComplete(
    clientId: string,
    architectId: string,
    drawingName: string,
    status: 'passed' | 'failed',
    jobId: string,
    submissionId: string
  ): Promise<void> {
    const message = status === 'passed'
      ? `Drawing "${drawingName}" passed AI review`
      : `Drawing "${drawingName}" failed AI review - action required`;

    await Promise.all([
      this.sendNotification(clientId, 'ai_review_complete', message, { jobId, submissionId }),
      this.sendNotification(architectId, 'ai_review_complete', message, { jobId, submissionId }),
    ]);
  }

  /**
   * Notify architect of admin approval
   */
  async notifyAdminApproval(architectId: string, drawingName: string, jobId: string, submissionId: string): Promise<void> {
    await this.sendNotification(
      architectId,
      'admin_approval',
      `Drawing "${drawingName}" was approved and is council-ready!`,
      { jobId, submissionId }
    );
  }

  /**
   * Notify architect of admin rejection
   */
  async notifyAdminRejection(architectId: string, drawingName: string, jobId: string, submissionId: string): Promise<void> {
    await this.sendNotification(
      architectId,
      'admin_rejection',
      `Drawing "${drawingName}" was rejected. Check feedback and resubmit.`,
      { jobId, submissionId }
    );
  }

  /**
   * Notify architect of payment release
   */
  async notifyPaymentReleased(architectId: string, amount: number, milestone: string, jobId: string): Promise<void> {
    await this.sendNotification(
      architectId,
      'payment_released',
      `R${amount.toLocaleString()} released for ${milestone}`,
      { jobId }
    );
  }

  /**
   * Notify recipient of new message
   */
  async notifyNewMessage(recipientId: string, senderName: string, jobTitle: string, jobId: string): Promise<void> {
    await this.sendNotification(
      recipientId,
      'message',
      `New message from ${senderName} on "${jobTitle}"`,
      { jobId, senderId: recipientId }
    );
  }

  /**
   * Notify client of council update
   */
  async notifyCouncilUpdate(clientId: string, jobTitle: string, status: string, jobId: string): Promise<void> {
    await this.sendNotification(
      clientId,
      'council_update',
      `Council submission for "${jobTitle}" status: ${status}`,
      { jobId }
    );
  }

  /**
   * Notify client that escrow is funded
   */
  async notifyEscrowFunded(
    clientId: string,
    architectId: string,
    amount: number,
    jobId: string
  ): Promise<void> {
    await Promise.all([
      this.sendNotification(
        clientId,
        'milestone_due',
        `Escrow funded with R${amount.toLocaleString()}`,
        { jobId }
      ),
      this.sendNotification(
        architectId,
        'milestone_due',
        `Client has funded escrow with R${amount.toLocaleString()}`,
        { jobId }
      ),
    ]);
  }

  /**
   * Notify client of milestone release request
   */
  async notifyMilestoneRequest(
    clientId: string,
    jobTitle: string,
    milestone: string,
    jobId: string
  ): Promise<void> {
    await this.sendNotification(
      clientId,
      'milestone_due',
      `Architect requested release for ${milestone} milestone of "${jobTitle}"`,
      { jobId }
    );
  }

  /**
   * Notify parties of refund processing
   */
  async notifyRefundProcessed(
    clientId: string,
    amount: number,
    reason: string,
    jobId: string
  ): Promise<void> {
    await this.sendNotification(
      clientId,
      'payment_released',
      `Refund of R${amount.toLocaleString()} processed. Reason: ${reason}`,
      { jobId }
    );
  }

  /**
   * Notify client of a new invoice
   */
  async notifyInvoiceSent(clientId: string, invoiceNumber: string, amount: number, jobId: string): Promise<void> {
    await this.sendNotification(
      clientId,
      'invoice_sent',
      `New invoice ${invoiceNumber} for R${amount.toLocaleString()} has been issued`,
      { jobId }
    );
  }

  /**
   * Notify architect that an invoice has been paid
   */
  async notifyInvoicePaid(architectId: string, invoiceNumber: string, jobId: string): Promise<void> {
    await this.sendNotification(
      architectId,
      'invoice_paid',
      `Invoice ${invoiceNumber} has been marked as paid`,
      { jobId }
    );
  }
}

export const notificationService = new NotificationService();
