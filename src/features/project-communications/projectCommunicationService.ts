/**
 * Architex Project Communication Engine — Service
 *
 * Thin wrapper around the existing messagingService that provides the
 * feature-level API for sending and subscribing to project communications.
 * All writes go through the same Firestore `messages` collection so mobile
 * and desktop surfaces read/write the same record.
 */

import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { messagingService, type SendMessageParams } from '@/services/messagingService';
import type { Message } from '@/types';

const COLLECTION = 'messages';

export interface SendProjectCommunicationParams extends SendMessageParams {
  /** Human-readable capture item label (e.g. "Site photo", "RFI") */
  captureItem?: string;
}

/**
 * Send a project communication message.
 * Delegates to the existing messagingService for Firestore write,
 * audit compliance, and content sanitisation.
 */
export async function sendProjectCommunication(
  params: SendProjectCommunicationParams,
): Promise<string> {
  return messagingService.sendMessage(params);
}

/**
 * Subscribe to project communications for a given job.
 * Returns a realtime Firestore snapshot listener that delivers Message[]
 * ordered by creation time ascending.
 */
export function subscribeToProjectCommunications(
  jobId: string,
  callback: (messages: Message[]) => void,
): () => void {
  const q = query(
    collection(db, COLLECTION),
    where('jobId', '==', jobId),
    orderBy('createdAt', 'asc'),
  );

  return onSnapshot(
    q,
    (snap) => {
      const messages = snap.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as Message),
      );
      callback(messages);
    },
    (error) => {
      console.warn('Project communication subscription error:', error);
      callback([]);
    },
  );
}

/**
 * Subscribe to project communications with an optional phase filter.
 */
export function subscribeToProjectCommunicationsByPhase(
  jobId: string,
  phase: string,
  callback: (messages: Message[]) => void,
): () => void {
  const q = query(
    collection(db, COLLECTION),
    where('jobId', '==', jobId),
    where('phase', '==', phase),
    orderBy('createdAt', 'asc'),
  );

  return onSnapshot(
    q,
    (snap) => {
      const messages = snap.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as Message),
      );
      callback(messages);
    },
    (error) => {
      console.warn('Project communication phase subscription error:', error);
      callback([]);
    },
  );
}
