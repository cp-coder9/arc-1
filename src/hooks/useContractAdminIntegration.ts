/**
 * useContractAdminIntegration — React hook for contract admin platform integration.
 *
 * Wraps contractIntegrationService calls with retry logic (3 attempts, exponential backoff).
 * On 3-retry failure, returns a FailedSyncAlert for the component to surface.
 *
 * Integration points:
 * - writeToAuditTrail: on every contract action (claim registered, variation approved, notice issued, EoT submitted)
 * - surfaceToActionCentre: when deadline ≤5 working days away
 * - writeToProjectPassport: on status changes (within 60 seconds of action)
 *
 * Requirements validated: 4.9, 4.10, 4.11, 4.12
 *
 * @module useContractAdminIntegration
 */

import { useCallback, useRef } from 'react';
import type {
  ContractAuditRecord,
  ContractWorkflowEvent,
  PassportContractUpdate,
  IntegrationWriteResult,
} from '@/services/contractAdmin/contractTypes';

// ══════════════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════════════

/** Parameters for the integration hook */
export interface UseContractAdminIntegrationParams {
  projectId: string;
  userId: string;
}

/** A failed-sync alert object surfaced when all retries are exhausted */
export interface FailedSyncAlert {
  id: string;
  type: 'failed-sync';
  targetModule: string;
  originatingEvent: string;
  failureTimestamp: string;
  errorMessage: string;
}

/** Result returned by each integration function */
export interface IntegrationCallResult {
  success: boolean;
  failedSyncAlert?: FailedSyncAlert;
}

/** The hook's return value */
export interface UseContractAdminIntegrationResult {
  /** Write an audit record for any contract action */
  writeAuditTrail: (record: Omit<ContractAuditRecord, 'id' | 'projectId' | 'timestamp' | 'actorId'>) => Promise<IntegrationCallResult>;
  /** Surface an action to the Action Centre for upcoming deadlines */
  surfaceToActionCentre: (event: Omit<ContractWorkflowEvent, 'projectId' | 'targetUserId'>) => Promise<IntegrationCallResult>;
  /** Write a status change to the Project Passport */
  writeToProjectPassport: (update: PassportContractUpdate) => Promise<IntegrationCallResult>;
}

// ══════════════════════════════════════════════════════════════════════════════
// Retry Utility (client-side variant — shorter delays for UI responsiveness)
// ══════════════════════════════════════════════════════════════════════════════

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;

/**
 * Retries an async function up to MAX_RETRIES times with exponential backoff.
 * Returns the result or throws after all attempts are exhausted.
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  delayMs: number = INITIAL_DELAY_MS
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const waitTime = delayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  throw lastError;
}

// ══════════════════════════════════════════════════════════════════════════════
// Hook Implementation
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Hook providing integration functions for the ContractAdminWorkspace.
 *
 * Each function wraps the corresponding contractIntegrationService call with
 * retry logic (3 attempts, exponential backoff). On failure after all retries,
 * returns a FailedSyncAlert object that the component can display.
 */
export function useContractAdminIntegration({
  projectId,
  userId,
}: UseContractAdminIntegrationParams): UseContractAdminIntegrationResult {
  // Track alert counter to generate unique IDs
  const alertCounter = useRef(0);

  /**
   * Creates a FailedSyncAlert when all retries are exhausted.
   */
  const createFailedSyncAlert = useCallback(
    (targetModule: string, originatingEvent: string, error: unknown): FailedSyncAlert => {
      alertCounter.current += 1;
      return {
        id: `failed_sync_${targetModule}_${Date.now()}_${alertCounter.current}`,
        type: 'failed-sync',
        targetModule,
        originatingEvent,
        failureTimestamp: new Date().toISOString(),
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    },
    []
  );

  /**
   * Writes an audit record to the contract audit trail.
   * Called on every contract action: claim registered, variation approved, notice issued, EoT submitted.
   *
   * Requirement 4.9: writeToAuditTrail on every contract action including entity type,
   * entity id, action description, acting user id, and ISO timestamp.
   */
  const writeAuditTrail = useCallback(
    async (
      record: Omit<ContractAuditRecord, 'id' | 'projectId' | 'timestamp' | 'actorId'>
    ): Promise<IntegrationCallResult> => {
      const fullRecord: ContractAuditRecord = {
        ...record,
        id: `audit_${record.entityType}_${record.entityId}_${Date.now()}`,
        projectId,
        actorId: userId,
        timestamp: new Date().toISOString(),
      };

      try {
        const { writeToAuditTrail: serviceWrite } = await import(
          '@/services/contractAdmin/contractIntegrationService'
        );

        const result: IntegrationWriteResult = await retryWithBackoff(
          () => serviceWrite(projectId, fullRecord),
          MAX_RETRIES,
          INITIAL_DELAY_MS
        );

        if (!result.success) {
          const alert = createFailedSyncAlert(
            'AuditTrail',
            `${record.entityType}:${record.action}`,
            new Error(result.failedSyncAlertId ?? 'Integration write returned failure')
          );
          return { success: false, failedSyncAlert: alert };
        }

        return { success: true };
      } catch (error) {
        const alert = createFailedSyncAlert(
          'AuditTrail',
          `${record.entityType}:${record.action}`,
          error
        );
        return { success: false, failedSyncAlert: alert };
      }
    },
    [projectId, userId, createFailedSyncAlert]
  );

  /**
   * Surfaces an action to the Action Centre when a deadline is ≤5 working days away.
   *
   * Requirement 4.10: surface action with deadline date, required response type,
   * clause reference, and number of remaining working days.
   */
  const surfaceToActionCentre = useCallback(
    async (
      event: Omit<ContractWorkflowEvent, 'projectId' | 'targetUserId'>
    ): Promise<IntegrationCallResult> => {
      const fullEvent: ContractWorkflowEvent = {
        ...event,
        projectId,
        targetUserId: userId,
      };

      try {
        const { surfaceToActionCentre: serviceSurface } = await import(
          '@/services/contractAdmin/contractIntegrationService'
        );

        const result: IntegrationWriteResult = await retryWithBackoff(
          () => serviceSurface(fullEvent),
          MAX_RETRIES,
          INITIAL_DELAY_MS
        );

        if (!result.success) {
          const alert = createFailedSyncAlert(
            'ActionCentre',
            `${event.entityType}:${event.entityId}`,
            new Error(result.failedSyncAlertId ?? 'Integration write returned failure')
          );
          return { success: false, failedSyncAlert: alert };
        }

        return { success: true };
      } catch (error) {
        const alert = createFailedSyncAlert(
          'ActionCentre',
          `${event.entityType}:${event.entityId}`,
          error
        );
        return { success: false, failedSyncAlert: alert };
      }
    },
    [projectId, userId, createFailedSyncAlert]
  );

  /**
   * Writes a contract status change to the Project Passport.
   * Must complete within 60 seconds of the triggering action.
   *
   * Requirement 4.11: write updated contract status into Project Passport
   * within 60 seconds of the action.
   */
  const writeToProjectPassport = useCallback(
    async (update: PassportContractUpdate): Promise<IntegrationCallResult> => {
      try {
        const { writeToProjectPassport: serviceWrite } = await import(
          '@/services/contractAdmin/contractIntegrationService'
        );

        const result: IntegrationWriteResult = await retryWithBackoff(
          () => serviceWrite(projectId, update),
          MAX_RETRIES,
          INITIAL_DELAY_MS
        );

        if (!result.success) {
          const alert = createFailedSyncAlert(
            'ProjectPassport',
            'statusChange',
            new Error(result.failedSyncAlertId ?? 'Integration write returned failure')
          );
          return { success: false, failedSyncAlert: alert };
        }

        return { success: true };
      } catch (error) {
        const alert = createFailedSyncAlert(
          'ProjectPassport',
          'statusChange',
          error
        );
        return { success: false, failedSyncAlert: alert };
      }
    },
    [projectId, createFailedSyncAlert]
  );

  return {
    writeAuditTrail,
    surfaceToActionCentre,
    writeToProjectPassport,
  };
}

export default useContractAdminIntegration;
