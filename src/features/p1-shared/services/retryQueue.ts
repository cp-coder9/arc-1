/**
 * Retry Queue Service
 *
 * Exponential backoff retry mechanism for platform integration writes.
 * Configuration: 3 retries, base 1000ms, max 60000ms, multiplier 2.
 * Creates a failed-sync alert on exhaustion.
 *
 * Requirements: 4.8, 10.8, 23.6
 */

import type { IntegrationWriteResult } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QueuedOperation {
  id: string;
  targetModule: 'project_passport' | 'action_centre' | 'audit_trail' | 'risk_engine' | 'documents';
  payload: unknown;
  attempts: number;
  nextRetryAt: string;
  createdAt: string;
  sourceModule: string;
  sourceEvent: string;
}

export interface RetryQueueService {
  enqueue(operation: Omit<QueuedOperation, 'id' | 'attempts' | 'nextRetryAt' | 'createdAt'>): Promise<string>;
  processQueue(): Promise<IntegrationWriteResult[]>;
  getFailedOperations(projectId: string): Promise<QueuedOperation[]>;
}

// ─── Configuration ────────────────────────────────────────────────────────────

export interface RetryQueueConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_CONFIG: RetryQueueConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
};

// ─── Persistence Hook ─────────────────────────────────────────────────────────

/**
 * Optional persistence hook for external storage (e.g., Firestore).
 * If not provided, the queue operates purely in-memory.
 */
export interface PersistenceHook {
  save(operations: QueuedOperation[]): Promise<void>;
  load(): Promise<QueuedOperation[]>;
}

// ─── Failed Sync Alert ────────────────────────────────────────────────────────

export interface FailedSyncAlert {
  id: string;
  targetModule: QueuedOperation['targetModule'];
  sourceModule: string;
  sourceEvent: string;
  operationId: string;
  createdAt: string;
  payload: unknown;
}

export type OnFailedSyncAlert = (alert: FailedSyncAlert) => void;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calculate delay for attempt K using exponential backoff.
 * Delay = min(baseDelayMs * 2^(K-1), maxDelayMs)
 */
export function calculateBackoffDelay(attempt: number, config: RetryQueueConfig = DEFAULT_CONFIG): number {
  const delay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
  return Math.min(delay, config.maxDelayMs);
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback simple UUID v4 implementation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export interface CreateRetryQueueOptions {
  config?: Partial<RetryQueueConfig>;
  persistenceHook?: PersistenceHook;
  onFailedSyncAlert?: OnFailedSyncAlert;
  /** Executor function that attempts the actual write operation. */
  executor?: (operation: QueuedOperation) => Promise<boolean>;
  /** Clock function for testability — returns current ISO timestamp. */
  now?: () => string;
}

export function createRetryQueueService(options: CreateRetryQueueOptions = {}): RetryQueueService {
  const config: RetryQueueConfig = { ...DEFAULT_CONFIG, ...options.config };
  const persistenceHook = options.persistenceHook;
  const onFailedSyncAlert = options.onFailedSyncAlert;
  const executor = options.executor ?? (() => Promise.resolve(false));
  const now = options.now ?? (() => new Date().toISOString());

  // In-memory queue
  let queue: QueuedOperation[] = [];
  // Operations that have exhausted all retries
  let failedOperations: QueuedOperation[] = [];

  async function persist(): Promise<void> {
    if (persistenceHook) {
      await persistenceHook.save([...queue, ...failedOperations]);
    }
  }

  const service: RetryQueueService = {
    async enqueue(operation): Promise<string> {
      const id = generateId();
      const createdAt = now();
      const nextRetryAt = new Date(
        new Date(createdAt).getTime() + calculateBackoffDelay(1, config),
      ).toISOString();

      const queuedOp: QueuedOperation = {
        id,
        targetModule: operation.targetModule,
        payload: operation.payload,
        attempts: 0,
        nextRetryAt,
        createdAt,
        sourceModule: operation.sourceModule,
        sourceEvent: operation.sourceEvent,
      };

      queue.push(queuedOp);
      await persist();
      return id;
    },

    async processQueue(): Promise<IntegrationWriteResult[]> {
      const results: IntegrationWriteResult[] = [];
      const currentTime = now();
      const readyOperations = queue.filter(
        (op) => op.nextRetryAt <= currentTime,
      );

      for (const op of readyOperations) {
        op.attempts += 1;

        const success = await executor(op);

        if (success) {
          // Remove from queue on success
          queue = queue.filter((q) => q.id !== op.id);
          results.push({ success: true });
        } else if (op.attempts >= config.maxRetries) {
          // Exhausted all retries — move to failed and create alert
          queue = queue.filter((q) => q.id !== op.id);
          failedOperations.push(op);

          const alert: FailedSyncAlert = {
            id: generateId(),
            targetModule: op.targetModule,
            sourceModule: op.sourceModule,
            sourceEvent: op.sourceEvent,
            operationId: op.id,
            createdAt: now(),
            payload: op.payload,
          };

          if (onFailedSyncAlert) {
            onFailedSyncAlert(alert);
          }

          results.push({
            success: false,
            retryQueued: false,
            failedSyncAlertId: alert.id,
          });
        } else {
          // Schedule next retry with exponential backoff
          const nextDelay = calculateBackoffDelay(op.attempts + 1, config);
          op.nextRetryAt = new Date(
            new Date(currentTime).getTime() + nextDelay,
          ).toISOString();

          results.push({ success: false, retryQueued: true });
        }
      }

      await persist();
      return results;
    },

    async getFailedOperations(_projectId: string): Promise<QueuedOperation[]> {
      // Return all failed operations (filtering by projectId would require
      // payload-level inspection — kept simple for now, can be enhanced with
      // persistence hook queries)
      return [...failedOperations];
    },
  };

  return service;
}
