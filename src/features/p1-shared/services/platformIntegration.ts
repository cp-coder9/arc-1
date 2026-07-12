/**
 * Platform Integration Service
 *
 * Shared write helpers for all 5 platform spine modules:
 * Project Passport, Audit Trail, Action Centre, Risk Engine, Documents.
 *
 * Each adapter accepts a typed event payload and returns Promise<IntegrationWriteResult>.
 * On failure, the operation is enqueued to the retry queue for exponential backoff.
 *
 * Requirements: 23.1, 23.2, 23.3, 23.4, 23.6, 23.7
 */

import type { IntegrationWriteResult } from '../types';
import type { RetryQueueService, QueuedOperation } from './retryQueue';

// ─── Typed Event Payloads ─────────────────────────────────────────────────────

export interface PassportWritePayload {
  projectId: string;
  moduleId: string;
  statusLabel: string;
  activeRecords: number;
  overdueItems: number;
  lastUpdated: string;
}

export interface AuditTrailWritePayload {
  projectId: string;
  moduleId: string;
  action: string;
  recordRef: string;
  actorId: string;
  timestamp: string;
  previousValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
}

export interface ActionCentreWritePayload {
  projectId: string;
  sourceModule: string;
  actionType: string;
  subject: string;
  deadline?: string;
  priority: 'normal' | 'high' | 'critical';
  targetUserId?: string;
  targetRole?: string;
}

export interface RiskEngineWritePayload {
  projectId: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  recordRef: string;
  mitigationAction?: string;
}

export interface DocumentsWritePayload {
  projectId: string;
  documentType: string;
  sourceModule: string;
  linkedRecordRef: string;
  uploadDate: string;
  responsibleParty: string;
  metadata?: Record<string, string>;
}

// ─── Writer Function Types ────────────────────────────────────────────────────

export type WriterFn<T> = (payload: T) => Promise<void>;

export interface PlatformWriters {
  passport?: WriterFn<PassportWritePayload>;
  auditTrail?: WriterFn<AuditTrailWritePayload>;
  actionCentre?: WriterFn<ActionCentreWritePayload>;
  riskEngine?: WriterFn<RiskEngineWritePayload>;
  documents?: WriterFn<DocumentsWritePayload>;
}

// ─── Service Interface ────────────────────────────────────────────────────────

export interface PlatformIntegrationService {
  writeToPassport(payload: PassportWritePayload): Promise<IntegrationWriteResult>;
  writeToAuditTrail(payload: AuditTrailWritePayload): Promise<IntegrationWriteResult>;
  writeToActionCentre(payload: ActionCentreWritePayload): Promise<IntegrationWriteResult>;
  writeToRiskEngine(payload: RiskEngineWritePayload): Promise<IntegrationWriteResult>;
  writeToDocuments(payload: DocumentsWritePayload): Promise<IntegrationWriteResult>;
}

// ─── Factory Options ──────────────────────────────────────────────────────────

export interface CreatePlatformIntegrationOptions {
  /** Injected writer functions for real platform module wiring. */
  writers?: PlatformWriters;
  /** Source module identifier used when enqueuing retry operations. */
  sourceModule?: string;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates a PlatformIntegrationService backed by the given retry queue.
 *
 * Each write method attempts the operation via the injected writer (or a no-op stub).
 * On failure, the operation is enqueued to the retry queue with the appropriate targetModule.
 */
export function createPlatformIntegrationService(
  retryQueue: RetryQueueService,
  options: CreatePlatformIntegrationOptions = {},
): PlatformIntegrationService {
  const { writers = {}, sourceModule = 'p1-shared' } = options;

  async function attemptWrite<T>(
    targetModule: QueuedOperation['targetModule'],
    payload: T,
    writerFn: WriterFn<T> | undefined,
    eventName: string,
  ): Promise<IntegrationWriteResult> {
    try {
      if (writerFn) {
        await writerFn(payload);
      }
      // If no writer is provided, treat as a successful no-op (stub mode)
      return { success: true };
    } catch {
      // On failure, enqueue to retry queue
      await retryQueue.enqueue({
        targetModule,
        payload,
        sourceModule,
        sourceEvent: eventName,
      });
      return { success: false, retryQueued: true };
    }
  }

  const service: PlatformIntegrationService = {
    async writeToPassport(payload: PassportWritePayload): Promise<IntegrationWriteResult> {
      return attemptWrite('project_passport', payload, writers.passport, 'writeToPassport');
    },

    async writeToAuditTrail(payload: AuditTrailWritePayload): Promise<IntegrationWriteResult> {
      return attemptWrite('audit_trail', payload, writers.auditTrail, 'writeToAuditTrail');
    },

    async writeToActionCentre(payload: ActionCentreWritePayload): Promise<IntegrationWriteResult> {
      return attemptWrite('action_centre', payload, writers.actionCentre, 'writeToActionCentre');
    },

    async writeToRiskEngine(payload: RiskEngineWritePayload): Promise<IntegrationWriteResult> {
      return attemptWrite('risk_engine', payload, writers.riskEngine, 'writeToRiskEngine');
    },

    async writeToDocuments(payload: DocumentsWritePayload): Promise<IntegrationWriteResult> {
      return attemptWrite('documents', payload, writers.documents, 'writeToDocuments');
    },
  };

  return service;
}
