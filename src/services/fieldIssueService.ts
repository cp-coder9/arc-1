/**
 * Field Issue Service — status & responsible-party normalization.
 *
 * Pure logic that normalizes the lifecycle status and responsible party of a
 * Field_Issue against the canonical snag state machine enum
 * (`open`, `allocated`, `ready_for_reinspection`, `closed`, `rejected`).
 *
 * - On creation the status defaults to `open` when none is supplied.
 * - The responsible party defaults to `unassigned` when none is supplied.
 * - Any out-of-enum status value is rejected with an error naming the invalid
 *   value, and the issue's existing status is left unchanged.
 *
 * The status enum is reused from `snagService` (`SNAG_STATUSES`) — this service
 * does not redefine the snag lifecycle.
 *
 * Validates: Requirements 5.1, 5.2
 */

import type {
  Severity,
  SnagStatus,
  SnagItem,
  NonConformanceReport,
  InspectionRecord,
  FieldIssue,
} from '@/types';
import { SNAG_STATUSES, isValidSnagTransition, snagBlocksPayment } from '@/services/snagService';

/** Default lifecycle status assigned to a Field_Issue on creation. */
export const DEFAULT_FIELD_ISSUE_STATUS: SnagStatus = 'open';

/** Sentinel responsible-party identifier used when none is provided. */
export const UNASSIGNED_RESPONSIBLE_PARTY = 'unassigned';

/** Error returned when a supplied status value is not in the snag enum. */
export interface StatusNormalizationError {
  code: 'invalid_status';
  /** The exact invalid value that was supplied. */
  invalidValue: string;
  message: string;
}

/** Raw inputs to normalize for a Field_Issue create or update. */
export interface FieldIssueStatusInput {
  /**
   * Proposed lifecycle status. When omitted/empty:
   *  - on creation → defaults to `open`
   *  - on update → the existing status is preserved
   */
  status?: string | null;
  /** Proposed responsible-party identifier. Empty/omitted → `unassigned`. */
  responsiblePartyId?: string | null;
}

/** Successfully normalized status + responsible party. */
export interface NormalizedFieldIssueStatus {
  status: SnagStatus;
  responsiblePartyId: string;
}

/** Result of a normalization attempt. */
export interface NormalizationResult {
  ok: boolean;
  /** Present when `ok` is true. */
  value?: NormalizedFieldIssueStatus;
  /** Present when `ok` is false. */
  error?: StatusNormalizationError;
  /**
   * The status that remains in effect when a normalization is rejected.
   * Equals the supplied `existingStatus` on update, or `undefined` on creation.
   */
  preservedStatus?: SnagStatus;
}

/** Returns true if `value` is a member of the canonical snag status enum. */
export function isValidFieldIssueStatus(value: unknown): value is SnagStatus {
  return typeof value === 'string' && SNAG_STATUSES.includes(value as SnagStatus);
}

/**
 * Normalize the lifecycle status and responsible party for a Field_Issue.
 *
 * @param input          Raw proposed status / responsible party.
 * @param existingStatus The issue's current status. Omit for a creation;
 *                       provide it for an update so it can be preserved on
 *                       rejection and used as the fallback when no status is
 *                       supplied.
 *
 * Behavior:
 *  - Responsible party: trimmed non-empty value, else `unassigned`.
 *  - Status:
 *      • no status supplied → existing status (update) or `open` (creation).
 *      • valid enum value   → that value.
 *      • any other value    → rejected, naming the invalid value; the existing
 *                             status is preserved unchanged.
 */
export function normalizeFieldIssueStatus(
  input: FieldIssueStatusInput,
  existingStatus?: SnagStatus,
): NormalizationResult {
  const responsiblePartyId = normalizeResponsibleParty(input.responsiblePartyId);

  const raw = input.status;
  const hasStatus = raw !== undefined && raw !== null && String(raw).trim() !== '';

  // No status supplied: keep existing (update) or default to `open` (creation).
  if (!hasStatus) {
    return {
      ok: true,
      value: {
        status: existingStatus ?? DEFAULT_FIELD_ISSUE_STATUS,
        responsiblePartyId,
      },
    };
  }

  const candidate = String(raw);

  if (!isValidFieldIssueStatus(candidate)) {
    return {
      ok: false,
      error: {
        code: 'invalid_status',
        invalidValue: candidate,
        message: `Invalid field issue status '${candidate}'. Expected one of: ${SNAG_STATUSES.join(', ')}.`,
      },
      preservedStatus: existingStatus,
    };
  }

  return {
    ok: true,
    value: { status: candidate, responsiblePartyId },
  };
}

/** Error returned when a requested status transition is not permitted. */
export interface TransitionGuardError {
  code: 'invalid_transition';
  /** The source status the issue is transitioning from. */
  from: SnagStatus;
  /** The target status the transition was attempting to reach. */
  to: SnagStatus;
  message: string;
}

/** Result of a status-transition guard check. */
export interface TransitionGuardResult {
  ok: boolean;
  /** The accepted target status. Present when `ok` is true. */
  value?: SnagStatus;
  /** Present when `ok` is false. */
  error?: TransitionGuardError;
  /**
   * The source status that remains in effect when the transition is rejected.
   * Always equals `from` on rejection.
   */
  preservedStatus?: SnagStatus;
}

/**
 * Guard a Field_Issue lifecycle status transition against the canonical snag
 * state machine.
 *
 * Wraps the existing `isValidSnagTransition(from, to)` from `snagService`: the
 * transition is permitted if and only if the state machine allows it. A
 * disallowed transition is rejected with an error naming both the source and
 * target statuses, and the source status is preserved unchanged.
 *
 * This function is pure — it does not persist anything; callers apply the
 * returned `value` only when `ok` is true.
 *
 * Validates: Requirements 5.3
 */
export function guardStatusTransition(from: SnagStatus, to: SnagStatus): TransitionGuardResult {
  if (isValidSnagTransition(from, to)) {
    return { ok: true, value: to };
  }

  return {
    ok: false,
    error: {
      code: 'invalid_transition',
      from,
      to,
      message: `Invalid field issue status transition from '${from}' to '${to}'.`,
    },
    preservedStatus: from,
  };
}

/** Resolve a responsible-party identifier, defaulting to `unassigned`. */
export function normalizeResponsibleParty(responsiblePartyId?: string | null): string {
  if (responsiblePartyId === undefined || responsiblePartyId === null) {
    return UNASSIGNED_RESPONSIBLE_PARTY;
  }
  const trimmed = String(responsiblePartyId).trim();
  return trimmed === '' ? UNASSIGNED_RESPONSIBLE_PARTY : trimmed;
}

// ---------------------------------------------------------------------------
// Payment-blocking flag maintenance (Requirements 5.7, 5.8)
// ---------------------------------------------------------------------------

/**
 * Terminal lifecycle statuses. An issue in either of these states never blocks
 * payment, regardless of severity — reaching one clears the blocking flag.
 */
export const TERMINAL_STATUSES: readonly SnagStatus[] = ['closed', 'rejected'] as const;

/** Returns true if `status` is a terminal status (`closed` or `rejected`). */
export function isTerminalStatus(status: SnagStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * The reconciliation action a caller must apply to the `payment_blockers`
 * collection (via the unchanged `paymentBlockerService`) to bring it in line
 * with the issue's recomputed blocking flag:
 *  - `create` — the issue newly blocks payment → `createPaymentBlocker`.
 *  - `clear`  — the issue no longer blocks payment → `clearPaymentBlocker`.
 *  - `none`   — the blocking state is unchanged; no I/O required.
 */
export type PaymentBlockerAction = 'create' | 'clear' | 'none';

/** Inputs for recomputing a Field_Issue's payment-blocking flag. */
export interface PaymentBlockingInput {
  /** The issue's severity (snag `priority`). */
  severity: Severity;
  /** The issue's current (or target, post-transition) lifecycle status. */
  status: SnagStatus;
  /** The issue's previously persisted blocking flag, if known. */
  blocksPayment?: boolean;
}

/** Result of recomputing a Field_Issue's payment-blocking flag. */
export interface PaymentBlockingResult {
  /** The authoritative blocking flag for the issue. */
  blocksPayment: boolean;
  /** Reconciliation action for the `payment_blockers` collection. */
  blockerAction: PaymentBlockerAction;
}

/**
 * Pure payment-blocking invariant.
 *
 * A Field_Issue blocks payment **if and only if** its severity is `high` or
 * `critical` (per the existing `snagBlocksPayment` rule, reused unchanged) and
 * its status is neither `closed` nor `rejected`. Composing these two clauses
 * means any transition to a terminal status clears the flag automatically.
 *
 * Validates: Requirements 5.7, 5.8
 */
export function isPaymentBlocking(severity: Severity, status: SnagStatus): boolean {
  return snagBlocksPayment(severity) && !isTerminalStatus(status);
}

/**
 * Maintain a Field_Issue's payment-blocking flag, composing the pure
 * `snagBlocksPayment` rule with the side-effecting `paymentBlockerService`
 * (which the caller drives via the returned `blockerAction`).
 *
 * Given the issue's severity, its current/target status, and its previously
 * persisted flag, this returns the recomputed `blocksPayment` value and the
 * action needed to reconcile the `payment_blockers` collection:
 *  - flag flips false → true  ⇒ `create` (call `createPaymentBlocker`)
 *  - flag flips true  → false ⇒ `clear`  (call `clearPaymentBlocker`)
 *  - flag unchanged           ⇒ `none`
 *
 * On transition to `closed` or `rejected` the flag is always cleared, so a
 * previously blocking issue yields `clear`.
 *
 * This function is pure: it performs no I/O and mutates nothing.
 *
 * Validates: Requirements 5.7, 5.8
 */
export function maintainPaymentBlocking(input: PaymentBlockingInput): PaymentBlockingResult {
  const blocksPayment = isPaymentBlocking(input.severity, input.status);
  const previous = input.blocksPayment ?? false;

  let blockerAction: PaymentBlockerAction = 'none';
  if (blocksPayment && !previous) {
    blockerAction = 'create';
  } else if (!blocksPayment && previous) {
    blockerAction = 'clear';
  }

  return { blocksPayment, blockerAction };
}

// ---------------------------------------------------------------------------
// FieldIssue normalizing adapter (Requirements 5.1, 5.4)
// ---------------------------------------------------------------------------

/**
 * Default severity assigned to source records that carry no severity of their
 * own (currently `InspectionRecord`). Mirrors the `failedItemToIssue` default.
 */
export const DEFAULT_FIELD_ISSUE_SEVERITY: Severity = 'medium';

/**
 * Maps the `NonConformanceReport` lifecycle (`open`,
 * `corrective_action_submitted`, `verified_closed`, `rejected`) onto the
 * canonical snag lifecycle enum consumed by the dashboard.
 */
const NCR_STATUS_TO_SNAG: Record<string, SnagStatus> = {
  open: 'open',
  corrective_action_submitted: 'ready_for_reinspection',
  verified_closed: 'closed',
  rejected: 'rejected',
};

/**
 * Maps the `InspectionRecord` status (`scheduled`, `completed`, `failed`,
 * `passed`) onto the canonical snag lifecycle enum. A failed or still-scheduled
 * inspection surfaces as an `open` field issue; a passed/completed one is
 * `closed`.
 */
const INSPECTION_STATUS_TO_SNAG: Record<string, SnagStatus> = {
  scheduled: 'open',
  failed: 'open',
  completed: 'closed',
  passed: 'closed',
};

/**
 * Coerce an arbitrary source status string onto the snag enum, falling back to
 * the supplied default (or `open`) when it is not a recognized snag status.
 */
function coerceSnagStatus(value: string | undefined, fallback: SnagStatus = DEFAULT_FIELD_ISSUE_STATUS): SnagStatus {
  return isValidFieldIssueStatus(value) ? value : fallback;
}

/**
 * Adapt a `SnagItem` into the uniform `FieldIssue` view-model.
 *
 * Snags already carry the canonical lifecycle status, a text `location`, an
 * optional `drawingPin`, and a persisted `blocksPayment` flag, so the mapping
 * is largely a field rename (`priority` -> `severity`).
 *
 * Validates: Requirements 5.1, 5.4
 */
export function snagToFieldIssue(snag: SnagItem): FieldIssue {
  return {
    id: snag.id,
    projectId: snag.projectId,
    sourceType: 'snag',
    status: coerceSnagStatus(snag.status),
    severity: snag.priority,
    responsiblePartyId: normalizeResponsibleParty(snag.responsiblePartyId),
    location: snag.location ?? '',
    drawingPin: snag.drawingPin,
    description: snag.description,
    blocksPayment: snag.blocksPayment,
    evidenceIds: snag.evidenceIds ?? [],
    createdAt: snag.createdAt,
    updatedAt: snag.updatedAt,
  };
}

/**
 * Adapt a `NonConformanceReport` into the uniform `FieldIssue` view-model.
 *
 * The NCR lifecycle is mapped onto the snag enum and the NCR `title` is used as
 * the location fallback (NCRs carry no dedicated location field).
 *
 * Validates: Requirements 5.1, 5.4
 */
export function ncrToFieldIssue(ncr: NonConformanceReport): FieldIssue {
  return {
    id: ncr.id,
    projectId: ncr.projectId,
    sourceType: 'ncr',
    status: NCR_STATUS_TO_SNAG[ncr.status] ?? coerceSnagStatus(ncr.status),
    severity: ncr.severity,
    responsiblePartyId: normalizeResponsibleParty(ncr.responsiblePartyId),
    location: ncr.title ?? '',
    description: ncr.description,
    blocksPayment: ncr.blocksPayment,
    evidenceIds: ncr.evidenceIds ?? [],
    createdAt: ncr.createdAt,
    updatedAt: ncr.updatedAt,
  };
}

/**
 * Adapt an `InspectionRecord` finding into the uniform `FieldIssue` view-model.
 *
 * Inspection records carry no severity, responsible party, payment flag, or
 * `updatedAt`, so those are defaulted: severity -> `medium`, responsible party
 * -> `unassigned`, `updatedAt` -> `createdAt`. The payment-blocking flag is
 * computed from the normalized severity and status via the shared invariant.
 *
 * Validates: Requirements 5.1, 5.4
 */
export function inspectionToFieldIssue(inspection: InspectionRecord): FieldIssue {
  const status = INSPECTION_STATUS_TO_SNAG[inspection.status] ?? coerceSnagStatus(inspection.status);
  const severity = DEFAULT_FIELD_ISSUE_SEVERITY;
  return {
    id: inspection.id,
    projectId: inspection.projectId,
    sourceType: 'inspection',
    status,
    severity,
    responsiblePartyId: UNASSIGNED_RESPONSIBLE_PARTY,
    location: inspection.location ?? '',
    description: inspection.findings ?? '',
    blocksPayment: isPaymentBlocking(severity, status),
    evidenceIds: inspection.evidenceIds ?? [],
    createdAt: inspection.createdAt,
    updatedAt: inspection.createdAt,
  };
}

/** Source records the adapter can normalize, grouped by type. */
export interface FieldIssueSources {
  snags?: SnagItem[];
  ncrs?: NonConformanceReport[];
  inspections?: InspectionRecord[];
}

/**
 * Normalize a mixed set of source records into a single `FieldIssue[]` for the
 * dashboard. Each source array is mapped through its dedicated adapter; the
 * result is a uniform list the dashboard can filter and count without knowing
 * the originating record type.
 *
 * Validates: Requirements 5.1, 5.4
 */
export function toFieldIssues(sources: FieldIssueSources): FieldIssue[] {
  return [
    ...(sources.snags ?? []).map(snagToFieldIssue),
    ...(sources.ncrs ?? []).map(ncrToFieldIssue),
    ...(sources.inspections ?? []).map(inspectionToFieldIssue),
  ];
}

export const fieldIssueService = {
  isValidFieldIssueStatus,
  normalizeFieldIssueStatus,
  guardStatusTransition,
  normalizeResponsibleParty,
  isPaymentBlocking,
  maintainPaymentBlocking,
  isTerminalStatus,
  snagToFieldIssue,
  ncrToFieldIssue,
  inspectionToFieldIssue,
  toFieldIssues,
  DEFAULT_FIELD_ISSUE_STATUS,
  UNASSIGNED_RESPONSIBLE_PARTY,
  TERMINAL_STATUSES,
};

export default fieldIssueService;
