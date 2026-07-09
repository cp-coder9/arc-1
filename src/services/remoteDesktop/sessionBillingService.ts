/**
 * Remote Desktop Core — Session Billing Service
 *
 * Manages billing calculation, reporting, and finalisation for remote sessions.
 *
 * Key responsibilities:
 * - calculateBilledDuration(): Compute actual connected time minus gaps ≥60s, rounded up to nearest minute
 * - generateUsageRecord(): Create a billing record for a completed session
 * - adjustBilledDuration(): Allow owner to adjust billed minutes within bounds
 * - handleZeroMinuteEdge(): Require explicit owner action when actual duration is 0 min
 * - finaliseBilling(): Finalise record with owner approval (never auto-finalise)
 * - isFinalisationBlocked(): Block if >14 days without approval
 * - sendReminder(): Send 48-hour reminder if not finalised
 * - Retry 3 times at 10-second intervals on reporting failure; flag as "billing-pending" if exhausted
 *
 * Governance invariants (Requirements 14.2, 14.5):
 * - Never auto-finalise billing records
 * - Block finalisation after 14 days without owner approval (flag for review)
 *
 * Requirements: 12.1, 12.2, 12.4, 12.5, 12.6, 12.7, 14.2, 14.5
 */

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface DisconnectionGap {
  /** Duration of disconnection gap in seconds */
  durationSeconds: number;
}

export interface UsageRecord {
  sessionId: string;
  bookingId: string;
  bookedDurationMinutes: number;
  actualDurationMinutes: number;
  billedDurationMinutes: number;
  ownerApproved: boolean;
  finalisationTimestamp: number | null; // Unix ms
  status: 'pending' | 'finalised' | 'billing-pending' | 'cancelled' | 'blocked';
  createdAt: number; // Unix ms
  reminderSentAt: number | null; // Unix ms
  ownerUid: string;
  consumerUid: string;
  zeroMinuteEdge: boolean;
}

export interface SessionBillingInput {
  sessionId: string;
  bookingId: string;
  ownerUid: string;
  consumerUid: string;
  totalConnectedSeconds: number;
  disconnectionGaps: DisconnectionGap[];
  bookingWindowMinutes: number;
  sessionEndTimestamp: number; // Unix ms
}

export interface BillingReportResult {
  success: boolean;
  record?: UsageRecord;
  error?: string;
  retriesExhausted?: boolean;
}

export interface AdjustBilledDurationInput {
  sessionId: string;
  ownerAdjustedMinutes: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Minimum gap duration (seconds) to be deducted from billing */
const DEDUCTIBLE_GAP_THRESHOLD_SECONDS = 60;

/** Maximum retry attempts for billing pipeline reporting */
const MAX_REPORT_RETRIES = 3;

/** Retry interval in milliseconds */
const RETRY_INTERVAL_MS = 10_000;

/** Reminder threshold: 48 hours in milliseconds */
const REMINDER_THRESHOLD_MS = 48 * 60 * 60 * 1000;

/** Finalisation block threshold: 14 days in milliseconds */
const FINALISATION_BLOCK_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000;

// ─── In-Memory Store ────────────────────────────────────────────────────────────

const usageRecords: Map<string, UsageRecord> = new Map();

// ─── Core Billing Logic ─────────────────────────────────────────────────────────

/**
 * Calculate billed duration from total connected seconds and disconnection gaps.
 *
 * Requirement 12.1:
 * - Actual connected duration = total time connected - sum of disconnection gaps ≥60s each
 * - Rounded up to the nearest minute
 *
 * @param totalConnectedSeconds Total seconds the consumer was connected
 * @param disconnectionGaps Array of disconnection gap durations
 * @returns Billed duration in minutes (rounded up to nearest minute)
 */
export function calculateBilledDuration(
  totalConnectedSeconds: number,
  disconnectionGaps: DisconnectionGap[],
): number {
  if (totalConnectedSeconds < 0) {
    return 0;
  }

  // Sum gaps that are ≥60 seconds
  const deductibleGapSeconds = disconnectionGaps
    .filter(gap => gap.durationSeconds >= DEDUCTIBLE_GAP_THRESHOLD_SECONDS)
    .reduce((sum, gap) => sum + gap.durationSeconds, 0);

  const actualConnectedSeconds = Math.max(0, totalConnectedSeconds - deductibleGapSeconds);

  // Round up to nearest minute
  return Math.ceil(actualConnectedSeconds / 60);
}

/**
 * Generate a usage record for a completed session.
 *
 * Requirements 12.1, 12.5, 12.7:
 * - Calculate actual duration and create billing record
 * - Detect zero-minute edge case
 * - Write usage record with all required fields
 *
 * @param input Session billing input data
 * @returns The generated usage record
 */
export function generateUsageRecord(input: SessionBillingInput): UsageRecord {
  if (!input.sessionId || !input.bookingId || !input.ownerUid || !input.consumerUid) {
    throw new Error('Missing required fields for usage record generation');
  }

  if (input.bookingWindowMinutes <= 0) {
    throw new Error('Booking window duration must be greater than 0 minutes');
  }

  const actualDurationMinutes = calculateBilledDuration(
    input.totalConnectedSeconds,
    input.disconnectionGaps,
  );

  const isZeroMinute = actualDurationMinutes === 0;

  const record: UsageRecord = {
    sessionId: input.sessionId,
    bookingId: input.bookingId,
    bookedDurationMinutes: input.bookingWindowMinutes,
    actualDurationMinutes,
    billedDurationMinutes: actualDurationMinutes,
    ownerApproved: false,
    finalisationTimestamp: null,
    status: 'pending',
    createdAt: input.sessionEndTimestamp,
    reminderSentAt: null,
    ownerUid: input.ownerUid,
    consumerUid: input.consumerUid,
    zeroMinuteEdge: isZeroMinute,
  };

  usageRecords.set(input.sessionId, record);
  return record;
}

/**
 * Adjust the billed duration for a session.
 *
 * Requirement 12.4:
 * - Owner can adjust billed duration between 1 minute and total booking window
 * - Preserves humanApprovalRequired governance gate
 *
 * @param input Adjustment input with session ID and new duration
 * @returns Updated usage record
 */
export function adjustBilledDuration(input: AdjustBilledDurationInput): UsageRecord {
  const record = usageRecords.get(input.sessionId);

  if (!record) {
    throw new Error(`Usage record not found for session: ${input.sessionId}`);
  }

  if (record.status === 'finalised') {
    throw new Error('Cannot adjust billed duration on a finalised record');
  }

  if (record.status === 'blocked') {
    throw new Error('Cannot adjust billed duration on a blocked record');
  }

  if (input.ownerAdjustedMinutes < 1) {
    throw new Error('Billed duration must be at least 1 minute');
  }

  if (input.ownerAdjustedMinutes > record.bookedDurationMinutes) {
    throw new Error(
      `Billed duration cannot exceed booking window (${record.bookedDurationMinutes} minutes)`,
    );
  }

  record.billedDurationMinutes = input.ownerAdjustedMinutes;
  // Clear the zero-minute edge flag if owner explicitly sets a value ≥1
  if (record.zeroMinuteEdge && input.ownerAdjustedMinutes >= 1) {
    record.zeroMinuteEdge = false;
  }

  return record;
}

/**
 * Handle the zero-minute edge case.
 *
 * Requirement 12.5:
 * - When actual connected duration is 0 minutes, require owner to explicitly
 *   set ≥1 min or cancel the billing record
 *
 * @param sessionId The session to check
 * @returns Object indicating whether action is required and current record state
 */
export function handleZeroMinuteEdge(sessionId: string): {
  requiresAction: boolean;
  record: UsageRecord;
} {
  const record = usageRecords.get(sessionId);

  if (!record) {
    throw new Error(`Usage record not found for session: ${sessionId}`);
  }

  return {
    requiresAction: record.zeroMinuteEdge,
    record,
  };
}

/**
 * Cancel a billing record (used when owner chooses to cancel a zero-minute record).
 *
 * @param sessionId The session to cancel billing for
 * @returns Updated usage record
 */
export function cancelBillingRecord(sessionId: string): UsageRecord {
  const record = usageRecords.get(sessionId);

  if (!record) {
    throw new Error(`Usage record not found for session: ${sessionId}`);
  }

  if (record.status === 'finalised') {
    throw new Error('Cannot cancel a finalised billing record');
  }

  record.status = 'cancelled';
  return record;
}

/**
 * Finalise the billing record with owner approval.
 *
 * Requirements 14.2, 14.5:
 * - Never auto-finalise
 * - Block if >14 days without approval
 *
 * @param sessionId The session to finalise billing for
 * @param currentTime Optional Unix ms timestamp for testing
 * @returns The finalised usage record
 */
export function finaliseBilling(sessionId: string, currentTime?: number): UsageRecord {
  const now = currentTime ?? Date.now();
  const record = usageRecords.get(sessionId);

  if (!record) {
    throw new Error(`Usage record not found for session: ${sessionId}`);
  }

  if (record.status === 'finalised') {
    throw new Error('Billing record is already finalised');
  }

  if (record.status === 'cancelled') {
    throw new Error('Cannot finalise a cancelled billing record');
  }

  if (record.status === 'blocked') {
    throw new Error('Billing record is blocked for review — cannot finalise');
  }

  // Check zero-minute edge case — require resolution first
  if (record.zeroMinuteEdge) {
    throw new Error(
      'Cannot finalise: actual duration is 0 minutes. Owner must set ≥1 min or cancel.',
    );
  }

  // Check 14-day finalisation block
  if (isFinalisationBlocked(record.createdAt, now)) {
    record.status = 'blocked';
    throw new Error(
      'Billing record blocked: not approved within 14 days. Flagged for platform review.',
    );
  }

  record.ownerApproved = true;
  record.finalisationTimestamp = now;
  record.status = 'finalised';

  return record;
}

/**
 * Check if finalisation is blocked (>14 days since session end without approval).
 *
 * Requirement 14.5:
 * - Usage logs not approved within 14 days blocked from finalisation, flagged for review
 *
 * @param sessionEndTimestamp When the session ended (Unix ms)
 * @param currentTime Current time (Unix ms)
 * @returns true if finalisation should be blocked
 */
export function isFinalisationBlocked(sessionEndTimestamp: number, currentTime?: number): boolean {
  const now = currentTime ?? Date.now();
  return (now - sessionEndTimestamp) > FINALISATION_BLOCK_THRESHOLD_MS;
}

/**
 * Send a 48-hour reminder if the billing record has not been finalised.
 *
 * Requirement 12.6:
 * - Send single reminder via Action Centre at 48 hours
 * - Never auto-finalise
 *
 * @param sessionId The session to check/send reminder for
 * @param currentTime Optional Unix ms timestamp for testing
 * @returns Object indicating if reminder was sent and the record state
 */
export function sendReminder(
  sessionId: string,
  currentTime?: number,
): { sent: boolean; record: UsageRecord } {
  const now = currentTime ?? Date.now();
  const record = usageRecords.get(sessionId);

  if (!record) {
    throw new Error(`Usage record not found for session: ${sessionId}`);
  }

  // Don't send reminders for finalised, cancelled, or blocked records
  if (record.status !== 'pending' && record.status !== 'billing-pending') {
    return { sent: false, record };
  }

  // Don't resend if already sent
  if (record.reminderSentAt !== null) {
    return { sent: false, record };
  }

  // Check if 48 hours have elapsed since session end
  const elapsed = now - record.createdAt;
  if (elapsed < REMINDER_THRESHOLD_MS) {
    return { sent: false, record };
  }

  // Send the reminder (mark as sent)
  record.reminderSentAt = now;

  return { sent: true, record };
}

/**
 * Report usage to the billing pipeline with retry logic.
 *
 * Requirement 12.2:
 * - Report within 30 seconds of session end
 * - Retry 3 times at 10-second intervals
 * - Flag as "billing-pending" if exhausted
 *
 * @param sessionId The session to report
 * @param reportFn External reporting function (injected for testability)
 * @returns Result of the reporting attempt
 */
export async function reportToBillingPipeline(
  sessionId: string,
  reportFn: (record: UsageRecord) => Promise<boolean>,
): Promise<BillingReportResult> {
  const record = usageRecords.get(sessionId);

  if (!record) {
    return {
      success: false,
      error: `Usage record not found for session: ${sessionId}`,
    };
  }

  for (let attempt = 1; attempt <= MAX_REPORT_RETRIES; attempt++) {
    try {
      const success = await reportFn(record);
      if (success) {
        return { success: true, record };
      }
    } catch {
      // Continue to next retry
    }

    // Wait before next retry (except after last attempt)
    if (attempt < MAX_REPORT_RETRIES) {
      await delay(RETRY_INTERVAL_MS);
    }
  }

  // All retries exhausted — flag as billing-pending
  record.status = 'billing-pending';
  return {
    success: false,
    record,
    error: 'All retry attempts exhausted. Session flagged as billing-pending.',
    retriesExhausted: true,
  };
}

// ─── Retrieval ──────────────────────────────────────────────────────────────────

/**
 * Get a usage record by session ID.
 */
export function getUsageRecord(sessionId: string): UsageRecord | undefined {
  return usageRecords.get(sessionId);
}

// ─── Internal Helpers ───────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Test Utilities ─────────────────────────────────────────────────────────────

/**
 * Clear all usage records (for testing only).
 * @internal
 */
export function _clearAllUsageRecords(): void {
  usageRecords.clear();
}

/**
 * Get the count of usage records (for testing only).
 * @internal
 */
export function _getUsageRecordCount(): number {
  return usageRecords.size;
}

/**
 * Get the deductible gap threshold in seconds (for testing).
 * @internal
 */
export function _getDeductibleGapThreshold(): number {
  return DEDUCTIBLE_GAP_THRESHOLD_SECONDS;
}

/**
 * Get the retry interval in ms (for testing).
 * @internal
 */
export function _getRetryIntervalMs(): number {
  return RETRY_INTERVAL_MS;
}

/**
 * Get the max report retries (for testing).
 * @internal
 */
export function _getMaxReportRetries(): number {
  return MAX_REPORT_RETRIES;
}

/**
 * Get the reminder threshold in ms (for testing).
 * @internal
 */
export function _getReminderThresholdMs(): number {
  return REMINDER_THRESHOLD_MS;
}

/**
 * Get the finalisation block threshold in ms (for testing).
 * @internal
 */
export function _getFinalisationBlockThresholdMs(): number {
  return FINALISATION_BLOCK_THRESHOLD_MS;
}
