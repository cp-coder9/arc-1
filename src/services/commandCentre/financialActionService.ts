/**
 * Project Command Centre — Financial Action Service
 *
 * Handles confirmation dialogs and downstream workflow invocation for financial
 * actions: payment certification, variation approval, and retention release.
 *
 * Key responsibilities:
 * - Show confirmation dialog requiring explicit user acknowledgement before dispatch
 * - Invoke downstream services with a 30-second timeout
 * - On failure/timeout: surface error with failing service name, record in audit trail,
 *   set action status to "completed with pending downstream"
 *
 * @module commandCentre/financialActionService
 * @validates Requirements 16.4, 16.5, 16.6
 */

import { addDoc, updateDoc, doc } from 'firebase/firestore';
import { getDemoCol } from '@/demo-seed/demoFirestore';
import type { UserRole } from '@/types';

// ── Constants ────────────────────────────────────────────────────────────────

/** Timeout (ms) for downstream service invocations. */
export const DOWNSTREAM_TIMEOUT_MS = 30_000;

const PROJECTS_COL = 'projects';
const PASSPORT_AUDIT_SUBCOL = 'passport_audit';
const ACTIONS_SUBCOL = 'actions';

// ── Types ────────────────────────────────────────────────────────────────────

/** Types of financial actions that require confirmation + downstream invocation. */
export type FinancialActionType =
  | 'payment_certification'
  | 'variation_approval'
  | 'retention_release';

/** Downstream service descriptor passed to the financial action. */
export interface DownstreamService {
  /** Display name shown in error messages, e.g. "Finance Module". */
  name: string;
  /** Async invocation function for this service. */
  invoke: (signal: AbortSignal, payload: FinancialActionPayload) => Promise<unknown>;
}

/** Payload describing the financial transaction being actioned. */
export interface FinancialActionPayload {
  projectId: string;
  actionType: FinancialActionType;
  entityId: string;
  entityType: string;
  /** Human-readable summary shown in the confirmation dialog. */
  confirmationSummary: string;
  /** Financial amount involved (for display in the confirmation dialog). */
  amount?: number;
  actorId: string;
  actorRole: UserRole;
}

/** Result of a single downstream service invocation. */
export interface DownstreamResult {
  serviceName: string;
  success: boolean;
  error?: string;
  timedOut?: boolean;
}

/** Result returned by executeFinancialAction. */
export interface FinancialActionResult {
  /** Whether the actor confirmed the dialog. */
  confirmed: boolean;
  /** Whether ALL downstream services responded successfully. */
  allDownstreamsSucceeded: boolean;
  /**
   * Final action status persisted in Firestore.
   * "completed" — all succeeded.
   * "completed_with_pending_downstream" — at least one downstream failed/timed out.
   * "cancelled" — user dismissed the confirmation dialog.
   */
  actionStatus: 'completed' | 'completed_with_pending_downstream' | 'cancelled';
  downstreamResults: DownstreamResult[];
  auditRecordId?: string;
  errors: string[];
}

// ── Firestore Path Helpers ───────────────────────────────────────────────────

function passportAuditCol(projectId: string) {
  return getDemoCol(PROJECTS_COL, projectId, PASSPORT_AUDIT_SUBCOL);
}

function actionsCol(projectId: string) {
  return getDemoCol(PROJECTS_COL, projectId, ACTIONS_SUBCOL);
}

// ── Timeout Race ─────────────────────────────────────────────────────────────

/**
 * Races an async service call against an AbortController-backed timeout.
 */
function raceTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fn(controller.signal).finally(() => clearTimeout(timer));
}

// ── Audit Trail Writer ───────────────────────────────────────────────────────

async function writeFinancialAuditRecord(
  payload: FinancialActionPayload,
  actionStatus: string,
  downstreamResults: DownstreamResult[],
): Promise<string | undefined> {
  try {
    const auditEntry = {
      actorId: payload.actorId,
      actorRole: payload.actorRole,
      actionType: payload.actionType,
      entityType: payload.entityType,
      entityId: payload.entityId,
      projectId: payload.projectId,
      timestamp: new Date().toISOString(),
      source: 'command_centre',
      financialAction: true,
      actionStatus,
      downstreamResults,
    };
    const ref = await addDoc(passportAuditCol(payload.projectId), auditEntry);
    return ref.id;
  } catch (err) {
    console.error('[financialActionService] Audit write failed:', err instanceof Error ? err.message : String(err));
    return undefined;
  }
}

// ── Action Status Update ─────────────────────────────────────────────────────

async function setActionStatus(
  projectId: string,
  entityId: string,
  status: 'completed' | 'completed_with_pending_downstream',
): Promise<void> {
  try {
    const col = actionsCol(projectId);
    const actionRef = doc(col, entityId);
    await updateDoc(actionRef, { status, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[financialActionService] Action status update failed:', err instanceof Error ? err.message : String(err));
  }
}

// ── Confirmation Gate ────────────────────────────────────────────────────────

/**
 * Presents a confirmation dialog to the user before executing a financial action.
 *
 * In the current implementation this delegates to the platform's native
 * `window.confirm`. In production this would be replaced with a proper modal
 * dialog component (see FinancialConfirmationDialog).
 *
 * @returns true when the user explicitly confirms, false otherwise.
 *
 * @validates Requirement 16.4
 */
export function presentFinancialConfirmation(payload: FinancialActionPayload): boolean {
  const label: Record<FinancialActionType, string> = {
    payment_certification: 'Payment Certification',
    variation_approval: 'Variation Approval',
    retention_release: 'Retention Release',
  };

  const amountLine =
    payload.amount !== undefined
      ? `\nAmount: R ${payload.amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`
      : '';

  const message = [
    `Confirm ${label[payload.actionType]}`,
    `\n${payload.confirmationSummary}${amountLine}`,
    '\nThis action will trigger downstream financial workflows.',
    '\nDo you wish to proceed?',
  ].join('');

  return window.confirm(message);
}

// ── Core Execution ───────────────────────────────────────────────────────────

/**
 * Executes a financial action with confirmation gate and downstream service
 * invocation, recording all outcomes in the audit trail.
 *
 * Execution flow:
 * 1. Present confirmation dialog — cancel if user dismisses
 * 2. For each downstream service: invoke with 30-second timeout
 * 3. Collect results — any timeout/failure = "completed_with_pending_downstream"
 * 4. Write audit record with action status + downstream results
 * 5. Persist action status on the action entity document
 *
 * @validates Requirements 16.4, 16.5, 16.6
 */
export async function executeFinancialAction(
  payload: FinancialActionPayload,
  downstreamServices: DownstreamService[],
  /** Override the confirmation gate (used in tests to avoid window.confirm). */
  confirmationOverride?: () => boolean,
): Promise<FinancialActionResult> {
  const confirmed = confirmationOverride
    ? confirmationOverride()
    : presentFinancialConfirmation(payload);

  if (!confirmed) {
    return {
      confirmed: false,
      allDownstreamsSucceeded: false,
      actionStatus: 'cancelled',
      downstreamResults: [],
      auditRecordId: undefined,
      errors: [],
    };
  }

  // ── Invoke each downstream service ──────────────────────────────────────

  const downstreamResults: DownstreamResult[] = [];
  const errors: string[] = [];

  for (const service of downstreamServices) {
    try {
      await raceTimeout(
        (signal) => service.invoke(signal, payload),
        DOWNSTREAM_TIMEOUT_MS,
      );
      downstreamResults.push({ serviceName: service.name, success: true });
    } catch (err) {
      const isAbort = err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'));
      const errorMsg = isAbort
        ? `${service.name} timed out after ${DOWNSTREAM_TIMEOUT_MS / 1000} seconds`
        : `${service.name} failed: ${err instanceof Error ? err.message : String(err)}`;

      downstreamResults.push({
        serviceName: service.name,
        success: false,
        error: errorMsg,
        timedOut: isAbort,
      });
      errors.push(errorMsg);

      console.error(`[financialActionService] Downstream failure (${service.name}):`, errorMsg);
    }
  }

  const allDownstreamsSucceeded = downstreamResults.every((r) => r.success);
  const actionStatus: 'completed' | 'completed_with_pending_downstream' = allDownstreamsSucceeded
    ? 'completed'
    : 'completed_with_pending_downstream';

  // ── Write audit record ───────────────────────────────────────────────────

  const auditRecordId = await writeFinancialAuditRecord(payload, actionStatus, downstreamResults);

  // ── Persist action status ────────────────────────────────────────────────

  await setActionStatus(payload.projectId, payload.entityId, actionStatus);

  return {
    confirmed: true,
    allDownstreamsSucceeded,
    actionStatus,
    downstreamResults,
    auditRecordId,
    errors,
  };
}

// ── Service Export ───────────────────────────────────────────────────────────

export const financialActionService = {
  executeFinancialAction,
  presentFinancialConfirmation,
  DOWNSTREAM_TIMEOUT_MS,
};

export default financialActionService;
