/**
 * Contract Integration Service — Platform Spine Write-Back Adapter
 *
 * Provides write-back functions to each platform spine module:
 * Project Passport, Audit Trail, Action Centre, SpecForge, Documents, and Risk Engine.
 *
 * Each function uses retryWithBackoff to ensure resilience. On final failure,
 * a failed-sync alert is created in the Action Centre.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10
 *
 * @module contractIntegrationService
 */

import type {
  IntegrationWriteResult,
  PassportContractUpdate,
  ContractAuditRecord,
  ContractWorkflowEvent,
  SpecForgeChangeRecord,
  ContractDocumentMeta,
  ContractRiskEvent,
} from './contractTypes';
import { adminDb } from '@/lib/firebase-admin';

// ══════════════════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════════════════

/** Default max retries for integration writes */
const DEFAULT_MAX_RETRIES = 3;

/** Default initial delay in ms between retries (exponential backoff) */
const DEFAULT_DELAY_MS = 5000;

// ══════════════════════════════════════════════════════════════════════════════
// Retry Utility
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Retries an async function up to `maxRetries` times with exponential backoff.
 *
 * On each failure, waits `delayMs * 2^(attempt-1)` before retrying.
 * If all retries are exhausted, the last error is thrown.
 *
 * Requirement 10.9: retry up to 3 times over 60 seconds.
 *
 * @param fn - The async function to execute
 * @param maxRetries - Maximum number of retry attempts (default 3)
 * @param delayMs - Initial delay in milliseconds (default 5000)
 * @returns The resolved value of fn
 * @throws The last error if all retries fail
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = DEFAULT_MAX_RETRIES,
  delayMs: number = DEFAULT_DELAY_MS
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        const waitTime = delayMs * Math.pow(2, attempt);
        await sleep(waitTime);
      }
    }
  }

  throw lastError;
}

/**
 * Sleep utility for retry backoff.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ══════════════════════════════════════════════════════════════════════════════
// Failed Sync Alert Helper
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a failed-sync alert in the Action Centre when an integration write
 * fails after all retries are exhausted.
 *
 * Requirement 10.9: on final failure, create a failed-sync alert identifying
 * the target module, originating event, and timestamp.
 *
 * @returns The alert document ID
 */
async function createFailedSyncAlert(
  projectId: string,
  targetModule: string,
  originatingEvent: string,
  error: unknown
): Promise<string> {
  const alertId = `failed_sync_${targetModule}_${Date.now()}`;
  const alertRef = adminDb
    .collection('projects')
    .doc(projectId)
    .collection('actionCentre')
    .doc(alertId);

  await alertRef.set({
    id: alertId,
    type: 'failed_sync_alert',
    priority: 'high',
    targetModule,
    originatingEvent,
    errorMessage: error instanceof Error ? error.message : String(error),
    timestamp: new Date().toISOString(),
    status: 'pending',
    subject: `Integration sync failed: ${targetModule}`,
    description: `Failed to write to ${targetModule} after ${DEFAULT_MAX_RETRIES} retries. Manual intervention required.`,
  });

  return alertId;
}

// ══════════════════════════════════════════════════════════════════════════════
// Integration Write Functions
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Writes contract status and key dates to the Project Passport.
 *
 * Firestore path: `projects/{projectId}/passport/contract`
 *
 * Requirement 10.1: update Project Passport health card with current contract
 * status, outstanding notices count, and days to nearest deadline within 60s.
 *
 * @param projectId - The project to update
 * @param update - Passport contract update payload
 * @returns IntegrationWriteResult with success status
 */
export async function writeToProjectPassport(
  projectId: string,
  update: PassportContractUpdate
): Promise<IntegrationWriteResult> {
  let retryCount = 0;

  try {
    const result = await retryWithBackoff(
      async () => {
        retryCount++;
        const passportRef = adminDb
          .collection('projects')
          .doc(projectId)
          .collection('passport')
          .doc('contract');

        await passportRef.set(
          {
            ...update,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );

        return true;
      },
      DEFAULT_MAX_RETRIES,
      DEFAULT_DELAY_MS
    );

    return {
      success: result,
      targetModule: 'ProjectPassport',
      retryCount: retryCount - 1, // First attempt is not a retry
    };
  } catch (error) {
    const alertId = await createFailedSyncAlert(
      projectId,
      'ProjectPassport',
      'writeToProjectPassport',
      error
    );

    return {
      success: false,
      targetModule: 'ProjectPassport',
      retryCount: DEFAULT_MAX_RETRIES,
      failedSyncAlertId: alertId,
    };
  }
}

/**
 * Creates an immutable audit record in the contract audit trail.
 *
 * Firestore path: `projects/{projectId}/contractAudit/{auditId}`
 *
 * Requirement 10.6: write all state changes as immutable records including
 * timestamp, originating user, contract clause reference, and action description.
 *
 * @param projectId - The project to write audit for
 * @param record - The audit record to persist
 * @returns IntegrationWriteResult with success status
 */
export async function writeToAuditTrail(
  projectId: string,
  record: ContractAuditRecord
): Promise<IntegrationWriteResult> {
  let retryCount = 0;

  try {
    await retryWithBackoff(
      async () => {
        retryCount++;
        const auditRef = adminDb
          .collection('projects')
          .doc(projectId)
          .collection('contractAudit')
          .doc(record.id);

        await auditRef.set({
          ...record,
          createdAt: new Date().toISOString(),
        });
      },
      DEFAULT_MAX_RETRIES,
      DEFAULT_DELAY_MS
    );

    return {
      success: true,
      targetModule: 'AuditTrail',
      retryCount: retryCount - 1,
    };
  } catch (error) {
    const alertId = await createFailedSyncAlert(
      projectId,
      'AuditTrail',
      'writeToAuditTrail',
      error
    );

    return {
      success: false,
      targetModule: 'AuditTrail',
      retryCount: DEFAULT_MAX_RETRIES,
      failedSyncAlertId: alertId,
    };
  }
}

/**
 * Surfaces a high-priority action in the Action Centre / Inbox.
 *
 * Firestore path: `projects/{projectId}/actionCentre/{eventId}`
 *
 * Requirement 10.5: create a high-priority action with deadline date,
 * clause reference, required response type, and remaining days.
 *
 * @param event - The workflow event to surface
 * @returns IntegrationWriteResult with success status
 */
export async function surfaceToActionCentre(
  event: ContractWorkflowEvent
): Promise<IntegrationWriteResult> {
  let retryCount = 0;
  const eventId = `action_${event.entityType}_${event.entityId}_${Date.now()}`;

  try {
    await retryWithBackoff(
      async () => {
        retryCount++;
        const actionRef = adminDb
          .collection('projects')
          .doc(event.projectId)
          .collection('actionCentre')
          .doc(eventId);

        await actionRef.set({
          id: eventId,
          type: 'contract_workflow_action',
          projectId: event.projectId,
          targetUserId: event.targetUserId,
          priority: event.priority,
          deadlineDate: event.deadlineDate ?? null,
          clauseReference: event.clauseReference ?? null,
          requiredResponseType: event.requiredResponseType ?? null,
          remainingDays: event.remainingDays ?? null,
          subject: event.subject,
          entityType: event.entityType,
          entityId: event.entityId,
          status: 'pending',
          createdAt: new Date().toISOString(),
        });
      },
      DEFAULT_MAX_RETRIES,
      DEFAULT_DELAY_MS
    );

    return {
      success: true,
      targetModule: 'ActionCentre',
      retryCount: retryCount - 1,
    };
  } catch (error) {
    const alertId = await createFailedSyncAlert(
      event.projectId,
      'ActionCentre',
      'surfaceToActionCentre',
      error
    );

    return {
      success: false,
      targetModule: 'ActionCentre',
      retryCount: DEFAULT_MAX_RETRIES,
      failedSyncAlertId: alertId,
    };
  }
}

/**
 * Creates a linked change record in SpecForge for approved variations.
 *
 * Firestore path: `projects/{projectId}/specForgeChanges/{changeId}`
 *
 * Requirement 10.3: create a specification change record in SpecForge
 * within 60 seconds linking the variation to spec items.
 *
 * @param projectId - The project to write to
 * @param changeRecord - The SpecForge change record payload
 * @returns IntegrationWriteResult with success status
 */
export async function writeToSpecForge(
  projectId: string,
  changeRecord: SpecForgeChangeRecord
): Promise<IntegrationWriteResult> {
  let retryCount = 0;
  const changeId = `specforge_change_${changeRecord.variationId}_${Date.now()}`;

  try {
    await retryWithBackoff(
      async () => {
        retryCount++;
        const specForgeRef = adminDb
          .collection('projects')
          .doc(projectId)
          .collection('specForgeChanges')
          .doc(changeId);

        await specForgeRef.set({
          id: changeId,
          variationId: changeRecord.variationId,
          variationNumber: changeRecord.variationNumber,
          specItemId: changeRecord.specItemId,
          approvalDate: changeRecord.approvalDate,
          costImpact: changeRecord.costImpact,
          createdAt: new Date().toISOString(),
        });
      },
      DEFAULT_MAX_RETRIES,
      DEFAULT_DELAY_MS
    );

    return {
      success: true,
      targetModule: 'SpecForge',
      retryCount: retryCount - 1,
    };
  } catch (error) {
    const alertId = await createFailedSyncAlert(
      projectId,
      'SpecForge',
      'writeToSpecForge',
      error
    );

    return {
      success: false,
      targetModule: 'SpecForge',
      retryCount: DEFAULT_MAX_RETRIES,
      failedSyncAlertId: alertId,
    };
  }
}

/**
 * Registers a controlled document with metadata in the Documents module.
 *
 * Firestore path: `projects/{projectId}/documents/{docId}`
 *
 * Requirement 10.7: register documents with metadata including document type,
 * clause reference, originating party, date of issue, and linked references.
 *
 * @param projectId - The project to register the document in
 * @param docMeta - Document metadata payload
 * @returns IntegrationWriteResult with success status
 */
export async function registerDocument(
  projectId: string,
  docMeta: ContractDocumentMeta
): Promise<IntegrationWriteResult> {
  let retryCount = 0;
  const docId = `contract_doc_${Date.now()}`;

  try {
    await retryWithBackoff(
      async () => {
        retryCount++;
        const docRef = adminDb
          .collection('projects')
          .doc(projectId)
          .collection('documents')
          .doc(docId);

        await docRef.set({
          id: docId,
          source: 'contract_administration',
          documentType: docMeta.documentType,
          clauseReference: docMeta.clauseReference ?? null,
          originatingParty: docMeta.originatingParty,
          dateOfIssue: docMeta.dateOfIssue,
          linkedNoticeId: docMeta.linkedNoticeId ?? null,
          linkedVariationId: docMeta.linkedVariationId ?? null,
          responseDeadline: docMeta.responseDeadline ?? null,
          isControlled: true,
          createdAt: new Date().toISOString(),
        });
      },
      DEFAULT_MAX_RETRIES,
      DEFAULT_DELAY_MS
    );

    return {
      success: true,
      targetModule: 'Documents',
      retryCount: retryCount - 1,
    };
  } catch (error) {
    const alertId = await createFailedSyncAlert(
      projectId,
      'Documents',
      'registerDocument',
      error
    );

    return {
      success: false,
      targetModule: 'Documents',
      retryCount: DEFAULT_MAX_RETRIES,
      failedSyncAlertId: alertId,
    };
  }
}

/**
 * Creates a risk event in the Risk Engine with severity mapping.
 *
 * Firestore path: `projects/{projectId}/risks/{riskId}`
 *
 * Requirement 10.8: create a risk event with severity mapped from the
 * contractual consequence category (financial penalty, time extension
 * entitlement, termination right, or deemed acceptance).
 *
 * @param projectId - The project to create risk for
 * @param risk - The risk event payload
 * @returns IntegrationWriteResult with success status
 */
export async function createRiskEvent(
  projectId: string,
  risk: ContractRiskEvent
): Promise<IntegrationWriteResult> {
  let retryCount = 0;
  const riskId = `risk_${risk.entityType}_${risk.entityId}_${Date.now()}`;

  try {
    await retryWithBackoff(
      async () => {
        retryCount++;
        const riskRef = adminDb
          .collection('projects')
          .doc(projectId)
          .collection('risks')
          .doc(riskId);

        await riskRef.set({
          id: riskId,
          source: 'contract_administration',
          entityType: risk.entityType,
          entityId: risk.entityId,
          severity: risk.severity,
          severityLevel: mapSeverityToLevel(risk.severity),
          description: risk.description,
          clauseReference: risk.clauseReference ?? null,
          deadlineMissedDate: risk.deadlineMissedDate ?? null,
          status: 'active',
          createdAt: new Date().toISOString(),
        });
      },
      DEFAULT_MAX_RETRIES,
      DEFAULT_DELAY_MS
    );

    return {
      success: true,
      targetModule: 'RiskEngine',
      retryCount: retryCount - 1,
    };
  } catch (error) {
    const alertId = await createFailedSyncAlert(
      projectId,
      'RiskEngine',
      'createRiskEvent',
      error
    );

    return {
      success: false,
      targetModule: 'RiskEngine',
      retryCount: DEFAULT_MAX_RETRIES,
      failedSyncAlertId: alertId,
    };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Internal Helpers
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Maps contractual consequence severity to a numeric risk level.
 *
 * - termination_right → 'critical' (highest)
 * - financial_penalty → 'high'
 * - time_extension_entitlement → 'medium'
 * - deemed_acceptance → 'low'
 */
function mapSeverityToLevel(
  severity: ContractRiskEvent['severity']
): 'critical' | 'high' | 'medium' | 'low' {
  switch (severity) {
    case 'termination_right':
      return 'critical';
    case 'financial_penalty':
      return 'high';
    case 'time_extension_entitlement':
      return 'medium';
    case 'deemed_acceptance':
      return 'low';
    default:
      return 'medium';
  }
}
