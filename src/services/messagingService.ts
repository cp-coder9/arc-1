/**
 * Messaging Service
 * Real-time chat between clients and architects per job
 */

import { db } from '../lib/firebase';
import {
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  orderBy,
  updateDoc,
  doc,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { Message, Conversation, UserRole } from '../types';
import DOMPurify from 'dompurify';

export interface SendMessageParams {
  jobId: string;
  senderId: string;
  senderRole: 'client' | 'architect' | 'admin' | 'freelancer';
  content: string;
  attachments?: { name: string; url: string; type: string }[];
}

// HTML tags allowed in messages (for formatting)
const ALLOWED_TAGS = ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li'];

class MessagingService {
  private unsubscribeFns: Map<string, () => void> = new Map();

  /**
   * Sanitize message content to prevent XSS
   */
  private sanitizeContent(content: string): string {
    // Remove any HTML first, then allow only safe formatting tags
    const sanitized = DOMPurify.sanitize(content, {
      ALLOWED_TAGS,
      ALLOWED_ATTR: [], // No attributes allowed
      KEEP_CONTENT: true,
    });
    return sanitized;
  }

  /**
   * Send a message
   */
  async sendMessage(params: SendMessageParams): Promise<string> {
    const { jobId, senderId, senderRole, content, attachments } = params;

    // Sanitize content before storing
    const sanitizedContent = this.sanitizeContent(content);

    if (!sanitizedContent.trim()) {
      throw new Error('Message content cannot be empty');
    }

    const message: Omit<Message, 'id'> = {
      jobId,
      senderId,
      senderRole,
      content: sanitizedContent,
      attachments: attachments || [],
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    // Add message
    const docRef = await addDoc(collection(db, 'messages'), message);

    // Update conversation last message
    await this.updateConversationLastMessage(jobId, sanitizedContent, senderId);

    return docRef.id;
  }

  /**
   * Subscribe to messages for a job
   */
  subscribeToMessages(
    jobId: string,
    callback: (messages: Message[]) => void
  ): () => void {
    const q = query(
      collection(db, 'messages'),
      where('jobId', '==', jobId),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Message));
      callback(messages);
    });

    this.unsubscribeFns.set(`messages_${jobId}`, unsubscribe);
    return unsubscribe;
  }

  /**
   * Mark messages as read
   */
async markMessagesAsRead(jobId: string, userId: string): Promise<void> {
 const q = query(
 collection(db, 'messages'),
 where('jobId', '==', jobId),
 where('isRead', '==', false)
 );

 const snapshot = await getDocs(q);
 const batch = writeBatch(db);

 snapshot.docs.forEach(doc => {
 const message = doc.data() as Message;
 if (message.senderId !== userId) {
 batch.update(doc.ref, {
 isRead: true,
 readAt: new Date().toISOString(),
 });
 }
 });

 await batch.commit();
}

  /**
   * Get or create conversation
   */
  async getOrCreateConversation(
    jobId: string,
    clientId: string,
    architectId: string
  ): Promise<Conversation> {
    const q = query(
      collection(db, 'conversations'),
      where('jobId', '==', jobId)
    );

    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      return {
        id: snapshot.docs[0].id,
        ...snapshot.docs[0].data()
      } as Conversation;
    }

    // Create new conversation
    const conversation: Omit<Conversation, 'id'> = {
      jobId,
      clientId,
      architectId,
      lastMessageAt: new Date().toISOString(),
      unreadCount: {
        [clientId]: 0,
        [architectId]: 0,
      },
    };

    const docRef = await addDoc(collection(db, 'conversations'), conversation);
    return { id: docRef.id, ...conversation };
  }

  /**
   * Subscribe to conversation updates
   */
  subscribeToConversation(
    jobId: string,
    userId: string,
    callback: (unreadCount: number) => void
  ): () => void {
    const q = query(
      collection(db, 'conversations'),
      where('jobId', '==', jobId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const conversation = snapshot.docs[0].data() as Conversation;
        const unreadCount = conversation.unreadCount?.[userId] || 0;
        callback(unreadCount);
      }
    });

    this.unsubscribeFns.set(`conversation_${jobId}`, unsubscribe);
    return unsubscribe;
  }

  /**
   * Update conversation last message
   */
  private async updateConversationLastMessage(
    jobId: string,
    content: string,
    senderId: string
  ): Promise<void> {
    const q = query(
      collection(db, 'conversations'),
      where('jobId', '==', jobId)
    );

    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const conversation = snapshot.docs[0];
      const data = conversation.data() as Conversation;

      // Increment unread for the other user
      const otherUserId = data.clientId === senderId ? data.architectId : data.clientId;
      const currentUnread = data.unreadCount?.[otherUserId] || 0;

      await updateDoc(conversation.ref, {
        lastMessageAt: new Date().toISOString(),
        lastMessage: content.substring(0, 100),
        [`unreadCount.${otherUserId}`]: currentUnread + 1,
      });
    }
  }

  /**
   * Reset unread count for user in conversation
   */
  async resetUnreadCount(jobId: string, userId: string): Promise<void> {
    const q = query(
      collection(db, 'conversations'),
      where('jobId', '==', jobId)
    );

    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      await updateDoc(snapshot.docs[0].ref, {
        [`unreadCount.${userId}`]: 0,
      });
    }
  }

  /**
   * Get unread message count across all conversations for a user
   */
  async getTotalUnreadCount(userId: string): Promise<number> {
    const q = query(
      collection(db, 'conversations'),
      where('clientId', '==', userId)
    );

    const q2 = query(
      collection(db, 'conversations'),
      where('architectId', '==', userId)
    );

    const [snapshot1, snapshot2] = await Promise.all([getDocs(q), getDocs(q2)]);

    let total = 0;

    snapshot1.docs.forEach(doc => {
      const data = doc.data() as Conversation;
      total += data.unreadCount?.[userId] || 0;
    });

    snapshot2.docs.forEach(doc => {
      const data = doc.data() as Conversation;
      total += data.unreadCount?.[userId] || 0;
    });

    return total;
  }

  /**
   * Cleanup subscriptions
   */
  cleanup(): void {
    this.unsubscribeFns.forEach(unsubscribe => unsubscribe());
    this.unsubscribeFns.clear();
  }
}

export const messagingService = new MessagingService();
