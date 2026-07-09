/**
 * Project Command Centre — Action Execution Service
 *
 * Provides role-validated action dispatching with full audit trail recording.
 *
 * Key responsibilities:
 * - Verify user holds the required role permission before dispatching any action
 * - Invoke the platform service API using authenticated session credentials
 * - On success: write a complete audit record to the Project Passport audit trail
 * - On failure / timeout (15 s): display error, preserve user data, leave entity state unchanged
 * - Validate all action preconditions before execution (Property 22)
 *
 * @module commandCentre/actionExecutionService
 * @validates Requirements 16.1, 16.2, 16.3, 16.7
 */

import { addDoc } from 'firebase/firestore';
import { getDemoCol } from '@/demo-seed/demoFirestore';
import type { UserRole } from '@/types';

// ── Constants ────────────────────────────────────────────────────────────────

/** Maximum wait time before an action invocation is considered timed-out. */
export const ACTION_TIMEOUT_MS = 15_000;

const PROJECTS_COL = 'projects';
const PASSPORT_AUDIT_SUBCOL = 'passport_audit';

// ── Types ────────────────────────────────────────────────────────────────────

/** A single precondition that must be met before an action can execute. */
export interface Precondition {
  /** Unique identifier for the condition type. */
  conditionId: string;
  /** Human-readable description of what is required. */
  description: string;
  /** Whether this precondition is currently satisfied. */
  isMet: boolean;
  /** Optional: the entity this condition relates to (for display in error list). */
  relatedEntityType?: string;
  /** Optional: the entity ID this condition relates to. */
  relatedEntityId?: string;
}

/** Specification of a single executable action. */
export interface ActionSpec {
  /** Unique action identifier within the project. */
  actionId: string;
  /** Logical type of action (e.g. 'approve_milestone', 'certify_payment'). */
  actionType: string;
  /** The Firestore entity type being acted upon. */
  entityType: string;
  /** The Firestore entity ID being acted upon. */
  entityId: string;
  /** Project context. */
  projectId: string;
  /** Roles that are authorised to execute this action type. */
  requiredRoles: UserRole[];
  /** Optional preconditions that must be satisfied before execution. */
  preconditions?: Precondition[];
  /**
   * The async operation to invoke against the platform service API.
   * Must be called with an AbortSignal for timeout enforcement.
   */
  execute: (signal: AbortSignal) => Promise<unknown>;
}

/** Snapshot of the entity's state used to build the before/after audit record. */
export interface EntityStateSnapshot {
  [field: string]: unknown;
}

/** The actor performing the action. */
export interface ActorContext {
  userId: string;
  role: UserRole;
  /** ISO 8601 session token or session reference (for logging purposes). */
  sessionRef?: string;
}

/** Full audit record written to Project Passport audit trail on successful execution. */
export interface AuditRecord {
  actorId: string;
  actorRole: UserRole;
  actionType: string;
  entityType: string;
  entityId: string;
  projectId: string;
  /** ISO 8601 UTC timestamp. */
  timestamp: string;
  before: EntityStateSnapshot;
  after: EntityStateSnapshot;
}

/** Result returned by executeAction. */
export interface ActionResult {
  success: boolean;
  data?: unknown;
  auditRecordId?: string;
  error?: string;
  /** When false, indicates the user lacks the required role for this action. */
  authorized: boolean;
  /** Whether the action was blocked by unmet preconditions (vs a runtime failure). */
  blockedByPreconditions?: boolean;
  /** Unmet preconditions (populated when blockedByPreconditions is true). */
  unmetConditions?: Precondition[];
}

/** Result returned by validatePreconditions. */
export interface PreconditionValidationResult {
  /** Whether all preconditions are met and the action can proceed. */
  canExecute: boolean;
  /**
   * All preconditions that are NOT currently met.
   * Length is exactly M (the number of unmet conditions) when canExecute is false.
   * Empty array when canExecute is true.
   *
   * Property 22: For any action with M unmet preconditions (M > 0):
   * - returns exactly M unmet condition descriptions
   * - returns canExecute: false
   */
  unmetConditions: Precondition[];
}

// ── Firestore Path Helpers ───────────────────────────────────────────────────

function passportAuditCollection(projectId: string) {
  return getDemoCol(PROJECTS_COL, projectId, PASSPORT_AUDIT_SUBCOL);
}

// ── Precondition Validation ──────────────────────────────────────────────────

/**
 * Validates all preconditions for an action before execution.
 *
 * Returns `canExecute: true` only when every precondition is satisfied.
 * When any precondition is unmet, returns `canExecute: false` and populates
 * `unmetConditions` with exactly those preconditions that are not met.
 *
 * Property 22: Precondition Validation Blocking
 * For any action with N preconditions where M are unmet (M > 0):
 *   - `canExecute` is false
 *   - `unmetConditions` contains exactly M entries
 *
 * @validates Requirement 16.7
 */
export function validatePreconditions(
  action: Pick<ActionSpec, 'preconditions'>,
): PreconditionValidationResult {
  const preconditions = action.preconditions ?? [];

  const unmetConditions = preconditions.filter((p) => !p.isMet);

  return {
    canExecute: unmetConditions.length === 0,
    unmetConditions,
  };
}

// ── Role Authorisation Check ─────────────────────────────────────────────────

/**
 * Returns true when the actor's role is in the action's required-roles list.
 */
export function isAuthorizedForAction(actor: ActorContext, action: ActionSpec): boolean {
  return action.requiredRoles.includes(actor.role);
}

// ── Audit Record Writer ──────────────────────────────────────────────────────

/**
 * Writes an audit record to `projects/{projectId}/passport_audit/`.
 * Fire-and-forget — errors are logged but do NOT cause the action to fail.
 */
async function writeAuditRecord(record: AuditRecord): Promise<string | undefined> {
  try {
    const docRef = await addDoc(passportAuditCollection(record.projectId), {
      ...record,
      source: 'command_centre',
    });
    return docRef.id;
  } catch (err) {
    console.error('[actionExecutionService] Audit write failed:', err instanceof Error ? err.message : String(err));
    return undefined;
  }
}

// ── Timeout Race ─────────────────────────────────────────────────────────────

/**
 * Races an async operation against an AbortController-backed timeout.
 * Resolves with the operation result or rejects with a timeout error.
 */
function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return operation(controller.signal).finally(() => clearTimeout(timer));
}

// ── Core Action Execution ────────────────────────────────────────────────────

/**
 * Executes a Command Centre action with role validation, precondition checking,
 * platform service invocation, and audit trail recording.
 *
 * Execution flow:
 * 1. Verify actor holds a required role → deny if not authorised
 * 2. Validate all preconditions → block with list of failures if any unmet
 * 3. Race action.execute() against the 15-second timeout
 * 4. On success: write audit record to Project Passport audit trail
 * 5. On failure/timeout: surface error message, preserve entity state
 *
 * @param action - Complete specification of the action to execute.
 * @param actor - The user performing the action (id + role + optional session ref).
 * @param beforeState - Snapshot of entity state before the action (for audit record).
 * @param afterState - Expected entity state after the action (for audit record; set
 *   before calling so it can be recorded immediately on success).
 *
 * @validates Requirements 16.1, 16.2, 16.3
 */
export async function executeAction(
  action: ActionSpec,
  actor: ActorContext,
  beforeState: EntityStateSnapshot = {},
  afterState: EntityStateSnapshot = {},
): Promise<ActionResult> {
  // ── Step 1: Role authorisation ──────────────────────────────────────────
  if (!isAuthorizedForAction(actor, action)) {
    return {
      success: false,
      authorized: false,
      error: `Role '${actor.role}' is not authorised to perform '${action.actionType}'. Required roles: ${action.requiredRoles.join(', ')}.`,
    };
  }

  // ── Step 2: Precondition validation ────────────────────────────────────
  const { canExecute, unmetConditions } = validatePreconditions(action);
  if (!canExecute) {
    return {
      success: false,
      authorized: true,
      blockedByPreconditions: true,
      unmetConditions,
      error: `Action blocked: ${unmetConditions.length} precondition${unmetConditions.length !== 1 ? 's' : ''} not met.`,
    };
  }

  // ── Step 3: Invoke platform service API with timeout ───────────────────
  let resultData: unknown;

  try {
    resultData = await withTimeout(action.execute, ACTION_TIMEOUT_MS);
  } catch (err) {
    const isTimeout = err instanceof Error && err.message.includes('aborted');
    const errorMsg = isTimeout
      ? `Action '${action.actionType}' timed out after ${ACTION_TIMEOUT_MS / 1000} seconds.`
      : `Action '${action.actionType}' failed: ${err instanceof Error ? err.message : String(err)}`;

    // Do NOT alter entity state — preserve as-is
    return {
      success: false,
      authorized: true,
      error: errorMsg,
    };
  }

  // ── Step 4: Write audit record ─────────────────────────────────────────
  const auditRecord: AuditRecord = {
    actorId: actor.userId,
    actorRole: actor.role,
    actionType: action.actionType,
    entityType: action.entityType,
    entityId: action.entityId,
    projectId: action.projectId,
    timestamp: new Date().toISOString(),
    before: beforeState,
    after: afterState,
  };

  const auditRecordId = await writeAuditRecord(auditRecord);

  return {
    success: true,
    authorized: true,
    data: resultData,
    auditRecordId,
  };
}

// ── Service Export ───────────────────────────────────────────────────────────

export const actionExecutionService = {
  executeAction,
  validatePreconditions,
  isAuthorizedForAction,
  ACTION_TIMEOUT_MS,
};

export default actionExecutionService;
