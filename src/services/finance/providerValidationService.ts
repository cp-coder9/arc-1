/**
 * Provider Validation Service
 *
 * Enforces platform financial integrity constraints for provider registration.
 * Every payment record, release request, and payout action must reference a
 * registered, liveConfigured provider. No action completes without both a
 * provider confirmation AND human authorization (dual confirmation).
 *
 * Architex does NOT hold funds — this module validates that all financial
 * operations reference registered third-party providers before persistence.
 *
 * @module finance/providerValidationService
 * @see Requirements 11.1, 11.2, 11.4, 11.5, 11.6
 */

import type { FinancialProvider, MoneyAmount } from './types';
import { writeImmutableAuditRecord } from './auditTrailService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of provider registration validation */
export interface ProviderValidationResult {
  valid: boolean;
  providerId: string;
  providerName?: string;
  error?: string;
  errorCode?: 'PROVIDER_NOT_FOUND' | 'PROVIDER_NOT_REGISTERED' | 'PROVIDER_NOT_LIVE_CONFIGURED';
}

/** A record that must contain provider reference fields */
export interface ProviderReferencedRecord {
  providerId?: string;
  providerTransactionRef?: string;
  providerName?: string;
  [key: string]: unknown;
}

/** Result of provider reference validation */
export interface ProviderReferenceValidationResult {
  valid: boolean;
  missingFields: string[];
  error?: string;
}

/** Dual confirmation status for a financial action */
export interface DualConfirmationStatus {
  complete: boolean;
  providerConfirmed: boolean;
  humanAuthorized: boolean;
  missingConfirmations: Array<'provider_confirmation' | 'human_authorization'>;
}

/** A record containing dual confirmation fields */
export interface DualConfirmationRecord {
  /** Provider webhook/API confirmation reference */
  providerConfirmationRef?: string;
  /** Provider confirmation timestamp */
  providerConfirmedAtIso?: string;
  /** Human authorization: signed certificate ID or admin approval ID */
  humanAuthorizationRef?: string;
  /** UID of the human who authorized */
  humanAuthorizerUid?: string;
  /** Role of the human authorizer */
  humanAuthorizerRole?: string;
  /** Human authorization timestamp */
  humanAuthorizedAtIso?: string;
  [key: string]: unknown;
}

/** Result of handling a provider timeout */
export interface ProviderTimeoutResult {
  timedOut: boolean;
  status: 'provider_configuration_required' | 'awaiting_provider' | 'confirmed';
  auditId?: string;
  notificationSent: boolean;
  elapsedMs: number;
}

/** Input for timeout handling */
export interface TimeoutHandlingInput {
  recordId: string;
  providerId: string;
  providerReference?: string;
  submittedAtIso: string;
  releaseApproverUid?: string;
  monetaryAmount?: MoneyAmount;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default provider confirmation timeout in milliseconds (120 seconds) */
export const PROVIDER_TIMEOUT_MS = 120_000;

/** Firestore collection for providers */
const PROVIDERS_COLLECTION = 'financial_providers';

/** Firestore collection for notifications */
const NOTIFICATIONS_COLLECTION = 'notifications';

// ---------------------------------------------------------------------------
// Provider Registration Validation (Requirement 11.1)
// ---------------------------------------------------------------------------

/**
 * Validates that a providerId references a registered, liveConfigured provider.
 *
 * Checks:
 * 1. Provider exists in the Firestore financial_providers collection
 * 2. Provider has `registered: true`
 * 3. Provider has `liveConfigured: true`
 *
 * @param providerId - The provider ID to validate
 * @returns ProviderValidationResult indicating validity or specific error
 *
 * @see Requirement 11.1
 */
export async function validateProviderRegistration(
  providerId: string,
): Promise<ProviderValidationResult> {
  if (!providerId) {
    return {
      valid: false,
      providerId: '',
      error: 'providerId is required but was not provided',
      errorCode: 'PROVIDER_NOT_FOUND',
    };
  }

  const { adminDb } = await import('@/lib/firebase-admin');

  const providerDoc = await adminDb
    .collection(PROVIDERS_COLLECTION)
    .doc(providerId)
    .get();

  if (!providerDoc.exists) {
    return {
      valid: false,
      providerId,
      error: `Provider '${providerId}' not found in the registry`,
      errorCode: 'PROVIDER_NOT_FOUND',
    };
  }

  const provider = providerDoc.data() as FinancialProvider;

  if (!provider.registered) {
    return {
      valid: false,
      providerId,
      providerName: provider.name,
      error: `Provider '${provider.name}' (${providerId}) is not registered`,
      errorCode: 'PROVIDER_NOT_REGISTERED',
    };
  }

  if (!provider.liveConfigured) {
    return {
      valid: false,
      providerId,
      providerName: provider.name,
      error: `Provider '${provider.name}' (${providerId}) is not live-configured`,
      errorCode: 'PROVIDER_NOT_LIVE_CONFIGURED',
    };
  }

  return {
    valid: true,
    providerId,
    providerName: provider.name,
  };
}

// ---------------------------------------------------------------------------
// Provider Reference Validation (Requirement 11.2, 11.6)
// ---------------------------------------------------------------------------

/**
 * Validates that a financial record contains the required provider reference fields.
 *
 * Every payment record, release request, and payout record must include:
 * - `providerId` — linking to a registered provider
 * - `providerTransactionRef` — the provider-issued transaction reference
 *
 * If validation fails, writes a failed-validation audit record and returns
 * a structured error indicating the missing fields.
 *
 * @param record - The record to validate for provider references
 * @param recordId - Identifier of the record being validated (for audit)
 * @param actorUid - The UID of the actor attempting the write (for audit)
 * @returns ProviderReferenceValidationResult indicating validity or missing fields
 *
 * @see Requirements 11.2, 11.6
 */
export async function validateProviderReference(
  record: ProviderReferencedRecord,
  recordId?: string,
  actorUid?: string,
): Promise<ProviderReferenceValidationResult> {
  const missingFields: string[] = [];

  if (!record.providerId) {
    missingFields.push('providerId');
  }

  if (!record.providerTransactionRef) {
    missingFields.push('providerTransactionRef');
  }

  if (missingFields.length === 0) {
    return { valid: true, missingFields: [] };
  }

  // Write failed-validation audit record per Requirement 11.6
  if (recordId && actorUid) {
    await writeImmutableAuditRecord({
      actorUid,
      actorRole: 'unknown',
      action: 'claim_rejected',
      timestampIso: new Date().toISOString(),
      targetResourceId: recordId,
      evidenceReferences: [
        { type: 'document_version', referenceId: recordId },
      ],
      previousState: 'pending_write',
      newState: 'rejected_missing_provider',
    });
  }

  return {
    valid: false,
    missingFields,
    error: `Write rejected: record is missing required provider fields: ${missingFields.join(', ')}. Every financial record must include a valid providerId and providerTransactionRef.`,
  };
}

// ---------------------------------------------------------------------------
// Dual Confirmation (Requirement 11.4)
// ---------------------------------------------------------------------------

/**
 * Checks whether both provider confirmation AND human authorization are present.
 *
 * An action is only considered complete when:
 * 1. Provider confirmation exists (webhook or API response with provider-issued reference)
 * 2. Human authorization exists (signed payment certificate or admin approval from
 *    a user with escrow:release permission)
 *
 * @param record - The record to check for dual confirmation
 * @returns DualConfirmationStatus indicating completeness or missing confirmations
 *
 * @see Requirement 11.4
 */
export function isDualConfirmationComplete(
  record: DualConfirmationRecord,
): DualConfirmationStatus {
  const providerConfirmed = Boolean(
    record.providerConfirmationRef && record.providerConfirmedAtIso,
  );

  const humanAuthorized = Boolean(
    record.humanAuthorizationRef &&
    record.humanAuthorizerUid &&
    record.humanAuthorizedAtIso,
  );

  const missingConfirmations: DualConfirmationStatus['missingConfirmations'] = [];
  if (!providerConfirmed) {
    missingConfirmations.push('provider_confirmation');
  }
  if (!humanAuthorized) {
    missingConfirmations.push('human_authorization');
  }

  return {
    complete: providerConfirmed && humanAuthorized,
    providerConfirmed,
    humanAuthorized,
    missingConfirmations,
  };
}

// ---------------------------------------------------------------------------
// Provider Timeout Handling (Requirement 11.5)
// ---------------------------------------------------------------------------

/**
 * Handles provider confirmation timeout.
 *
 * If a provider confirmation is not received within 120 seconds (default) of
 * submission, the action is marked as `provider_configuration_required`, a
 * timeout audit record is written, and the release approver is notified that
 * manual provider verification is required.
 *
 * @param input - The timeout handling input (recordId, provider details, timestamps)
 * @param timeoutMs - Timeout threshold in milliseconds (defaults to 120,000ms / 120s)
 * @returns ProviderTimeoutResult indicating whether timeout occurred and actions taken
 *
 * @see Requirement 11.5
 */
export async function handleProviderTimeout(
  input: TimeoutHandlingInput,
  timeoutMs: number = PROVIDER_TIMEOUT_MS,
): Promise<ProviderTimeoutResult> {
  const { recordId, providerId, providerReference, submittedAtIso, releaseApproverUid, monetaryAmount } = input;
  const now = Date.now();
  const submittedAt = new Date(submittedAtIso).getTime();
  const elapsedMs = now - submittedAt;

  // Not timed out yet
  if (elapsedMs < timeoutMs) {
    return {
      timedOut: false,
      status: 'awaiting_provider',
      notificationSent: false,
      elapsedMs,
    };
  }

  // Timeout has occurred — mark as provider_configuration_required
  const { adminDb } = await import('@/lib/firebase-admin');

  // Write timeout audit record including provider reference and elapsed time
  const auditId = await writeImmutableAuditRecord({
    actorUid: 'system',
    actorRole: 'system',
    action: 'escrow_timeout',
    timestampIso: new Date().toISOString(),
    monetaryAmount,
    targetResourceId: recordId,
    evidenceReferences: [
      {
        type: 'provider_transaction',
        referenceId: providerReference || `timeout-${recordId}`,
      },
    ],
    previousState: 'submitted_to_provider',
    newState: 'provider_configuration_required',
  });

  // Notify release approver that manual provider verification is required
  let notificationSent = false;
  if (releaseApproverUid) {
    const notificationId = `notif-timeout-${recordId}-${Date.now()}`;
    await adminDb.collection(NOTIFICATIONS_COLLECTION).doc(notificationId).create({
      notificationId,
      recipientUid: releaseApproverUid,
      type: 'provider_timeout',
      title: 'Provider Confirmation Timeout',
      message: `Provider confirmation for action '${recordId}' was not received within ${Math.round(timeoutMs / 1000)}s. Status set to provider_configuration_required. Manual provider verification is required.`,
      providerId,
      providerReference: providerReference || null,
      elapsedMs,
      recordId,
      createdAtIso: new Date().toISOString(),
    });
    notificationSent = true;
  }

  return {
    timedOut: true,
    status: 'provider_configuration_required',
    auditId,
    notificationSent,
    elapsedMs,
  };
}

// ---------------------------------------------------------------------------
// Enrichment Helper (Requirement 11.2)
// ---------------------------------------------------------------------------

/**
 * Enriches a financial record with provider name and provider-issued reference.
 *
 * Per Requirement 11.2, every persisted record must include the provider name
 * and provider-issued transaction reference alongside the providerId.
 *
 * @param record - The record to enrich
 * @param provider - The validated provider details
 * @param providerTransactionRef - The provider-issued reference
 * @returns The enriched record with provider fields populated
 */
export function enrichRecordWithProviderDetails<T extends ProviderReferencedRecord>(
  record: T,
  provider: { providerId: string; name: string },
  providerTransactionRef: string,
): T {
  return {
    ...record,
    providerId: provider.providerId,
    providerName: provider.name,
    providerTransactionRef,
  };
}

// ---------------------------------------------------------------------------
// Composite Validation (combines registration + reference validation)
// ---------------------------------------------------------------------------

/**
 * Full provider validation pipeline for a financial write operation.
 *
 * Combines:
 * 1. Provider registration validation (exists, registered, liveConfigured)
 * 2. Provider reference validation (providerId and providerTransactionRef present)
 *
 * If either check fails, rejects the write with a structured error and writes
 * a failed-validation audit record.
 *
 * @param record - The financial record being written
 * @param recordId - Identifier for the record (for audit)
 * @param actorUid - The UID of the actor performing the write
 * @returns Object with valid flag, provider details on success, or structured error on failure
 *
 * @see Requirements 11.1, 11.2, 11.6
 */
export async function validateProviderForWrite(
  record: ProviderReferencedRecord,
  recordId: string,
  actorUid: string,
): Promise<{
  valid: boolean;
  providerName?: string;
  error?: string;
  failedConditions?: Array<{ condition: string; description: string }>;
}> {
  const failedConditions: Array<{ condition: string; description: string }> = [];

  // Check provider reference fields are present
  const refResult = await validateProviderReference(record, recordId, actorUid);
  if (!refResult.valid) {
    for (const field of refResult.missingFields) {
      failedConditions.push({
        condition: `missing_${field}`,
        description: `Required field '${field}' is missing from the record`,
      });
    }
  }

  // If providerId is present, validate it references a registered live provider
  if (record.providerId) {
    const regResult = await validateProviderRegistration(record.providerId);
    if (!regResult.valid) {
      failedConditions.push({
        condition: regResult.errorCode || 'invalid_provider',
        description: regResult.error || 'Provider validation failed',
      });
    } else {
      // Provider is valid — return its name
      if (failedConditions.length === 0) {
        return { valid: true, providerName: regResult.providerName };
      }
    }
  }

  if (failedConditions.length > 0) {
    return {
      valid: false,
      error: `Write rejected: ${failedConditions.length} provider validation condition(s) failed`,
      failedConditions,
    };
  }

  return { valid: true };
}
