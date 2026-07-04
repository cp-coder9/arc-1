/**
 * Contract Administration — Payment Scheduler Service
 *
 * Generates and manages payment certificate schedules aligned to contract terms.
 * Tracks certificate issue deadlines, payment deadlines, retention calculations,
 * and overdue notifications.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
 */

import type {
  PaymentScheduleEntry,
  PaymentCycleStatus,
  ContractAuditRecord,
  ContractWorkflowEvent,
  PaymentOverdueResult,
  RetentionResult,
  PublicHoliday,
  IntegrationWriteResult,
} from './contractTypes';
import {
  addWorkingDays,
  getRemainingWorkingDays,
  getSouthAfricanHolidays,
  getNextWorkingDay,
} from './workingDayCalculator';
import { getPaymentIntervalConfig } from './contractFormConfigs';
import { surfaceToActionCentre, writeToAuditTrail } from './contractIntegrationService';
import { adminDb } from '@/lib/firebase-admin';

// ══════════════════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════════════════

/** Warning thresholds in working days before certificate deadline */
const CERTIFICATE_WARNING_THRESHOLDS = [7, 3, 1] as const;

/** Default certificate issue days (working) if not configured */
const DEFAULT_CERTIFICATE_ISSUE_DAYS = 5;

/** Default payment due days (calendar) if not configured */
const DEFAULT_PAYMENT_DUE_DAYS = 7;

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

/** Get current ISO timestamp */
function nowIso(): string {
  return new Date().toISOString();
}

/** Get current ISO date (YYYY-MM-DD) */
function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Generate a unique ID */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/** Parse an ISO date string to a Date object (local, no timezone shift) */
function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Format a Date object to ISO date string YYYY-MM-DD */
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Add calendar days to a date */
function addCalendarDays(iso: string, days: number): string {
  const date = parseDate(iso);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

/** Count calendar days between two ISO dates (exclusive start, inclusive end) */
function calendarDaysBetween(startIso: string, endIso: string): number {
  const start = parseDate(startIso);
  const end = parseDate(endIso);
  const diffMs = end.getTime() - start.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// ══════════════════════════════════════════════════════════════════════════════
// Pure Functions
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Generates a payment schedule spanning from commencement to completion.
 *
 * PURE FUNCTION — no Firestore interaction.
 *
 * Logic:
 * - First valuation date = commencementDate + paymentIntervalDays (calendar)
 * - Subsequent entries spaced exactly paymentIntervalDays apart
 * - Last entry's valuation date must be on or before completionDate
 * - certificateDeadline = valuationDate + certificateIssueDays (working days)
 * - paymentDeadline = certificateDeadline + paymentDueDays (calendar days)
 *
 * @param commencementDate ISO date string
 * @param completionDate ISO date string, must be after commencementDate
 * @param paymentIntervalDays Number of calendar days between valuations
 * @param holidays Array of PublicHoliday for working day calculations
 * @param certificateIssueDays Working days from valuation to certificate (default 5)
 * @param paymentDueDays Calendar days from certificate to payment (default 7)
 * @returns Array of PaymentScheduleEntry
 */
export function generateSchedule(
  commencementDate: string,
  completionDate: string,
  paymentIntervalDays: number,
  holidays: PublicHoliday[],
  certificateIssueDays: number = DEFAULT_CERTIFICATE_ISSUE_DAYS,
  paymentDueDays: number = DEFAULT_PAYMENT_DUE_DAYS,
): PaymentScheduleEntry[] {
  const entries: PaymentScheduleEntry[] = [];
  const completionMs = parseDate(completionDate).getTime();

  let cycleNumber = 1;
  let currentValuationDate = addCalendarDays(commencementDate, paymentIntervalDays);

  while (parseDate(currentValuationDate).getTime() <= completionMs) {
    // Certificate deadline = valuation date + certificateIssueDays (working days)
    const certificateDeadline = addWorkingDays(currentValuationDate, certificateIssueDays, holidays);

    // Payment deadline = certificate deadline + paymentDueDays (calendar days)
    const paymentDeadline = addCalendarDays(certificateDeadline, paymentDueDays);

    const entry: PaymentScheduleEntry = {
      id: generateId(),
      cycleNumber,
      valuationDate: currentValuationDate,
      certificateDeadline,
      paymentDeadline,
      status: 'pending' as PaymentCycleStatus,
    };

    entries.push(entry);
    cycleNumber++;
    currentValuationDate = addCalendarDays(currentValuationDate, paymentIntervalDays);
  }

  return entries;
}

/**
 * Calculates retention held and whether the retention limit has been reached.
 *
 * PURE FUNCTION — no Firestore interaction.
 *
 * Formula:
 * - retentionHeld = min(cumulativeCertified × retentionPercentage / 100, retentionLimit)
 * - atLimit = (cumulativeCertified × retentionPercentage / 100) >= retentionLimit
 *
 * @param cumulativeCertified Total cumulative certified amount
 * @param retentionPercentage Retention percentage (0.00–100.00)
 * @param retentionLimit Maximum retention amount (cap)
 * @returns RetentionResult with retentionHeld and atLimit flag
 */
export function calculateRetention(
  cumulativeCertified: number,
  retentionPercentage: number,
  retentionLimit: number,
): RetentionResult {
  const calculatedRetention = (cumulativeCertified * retentionPercentage) / 100;
  const retentionHeld = Math.min(calculatedRetention, retentionLimit);
  const atLimit = calculatedRetention >= retentionLimit;

  return { retentionHeld, atLimit };
}

// ══════════════════════════════════════════════════════════════════════════════
// Firestore-Dependent Functions
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Regenerates remaining (future) schedule entries when the completion date changes.
 *
 * Steps:
 * 1. Reads the existing schedule from Firestore
 * 2. Reads the contract config for payment interval parameters
 * 3. Identifies the last completed/certificate_issued entry
 * 4. Removes all future 'pending' entries
 * 5. Regenerates from the last completed entry's valuation date to the revised completion date
 * 6. Persists new entries to Firestore
 * 7. Writes an audit record documenting the schedule change
 *
 * @param projectId The project identifier
 * @param revisedCompletionDate New completion date (ISO string)
 */
export async function regenerateRemainingSchedule(
  projectId: string,
  revisedCompletionDate: string,
): Promise<void> {
  const scheduleRef = adminDb.collection(`projects/${projectId}/contractPaymentSchedule`);
  const configRef = adminDb.collection(`projects/${projectId}/contractConfig`);

  // Load contract config to get payment interval parameters
  const configSnap = await configRef.doc('config').get();
  if (!configSnap.exists) {
    throw new Error(`Contract config not found for project ${projectId}`);
  }
  const config = configSnap.data()!;
  const contractForm = config.contractForm;
  const paymentConfig = getPaymentIntervalConfig(contractForm);

  // Load existing schedule entries
  const scheduleSnap = await scheduleRef.orderBy('cycleNumber', 'asc').get();
  const existingEntries: (PaymentScheduleEntry & { docId: string })[] = [];
  scheduleSnap.forEach((doc) => {
    existingEntries.push({ ...(doc.data() as PaymentScheduleEntry), docId: doc.id });
  });

  // Find the last non-pending entry (completed or certificate_issued)
  const completedEntries = existingEntries.filter(
    (e) => e.status === 'certificate_issued' || e.status === 'payment_confirmed',
  );
  const lastCompletedEntry = completedEntries.length > 0
    ? completedEntries[completedEntries.length - 1]
    : null;

  // Determine the base valuation date for regeneration
  const baseValuationDate = lastCompletedEntry
    ? lastCompletedEntry.valuationDate
    : config.commencementDate;

  // Determine the starting cycle number
  const startCycleNumber = lastCompletedEntry
    ? lastCompletedEntry.cycleNumber + 1
    : 1;

  // Delete future pending entries
  const pendingEntries = existingEntries.filter((e) => e.status === 'pending');
  const batch = adminDb.batch();
  for (const entry of pendingEntries) {
    batch.delete(scheduleRef.doc(entry.docId));
  }

  // Get holidays for the relevant years
  const startYear = parseDate(baseValuationDate).getFullYear();
  const endYear = parseDate(revisedCompletionDate).getFullYear();
  let holidays: PublicHoliday[] = [];
  for (let y = startYear; y <= endYear + 1; y++) {
    holidays = holidays.concat(getSouthAfricanHolidays(y));
  }

  // Generate new schedule entries from base to revised completion
  const certificateIssueDays = paymentConfig.certificateIssueDays;
  const paymentDueDays = paymentConfig.paymentDueDays;
  const intervalDays = paymentConfig.defaultIntervalDays;

  const newEntries = generateSchedule(
    baseValuationDate,
    revisedCompletionDate,
    intervalDays,
    holidays,
    certificateIssueDays,
    paymentDueDays,
  );

  // Renumber cycle numbers and persist
  for (let i = 0; i < newEntries.length; i++) {
    const entry = newEntries[i];
    entry.cycleNumber = startCycleNumber + i;
    const docRef = scheduleRef.doc(entry.id);
    batch.set(docRef, entry);
  }

  await batch.commit();

  // Write audit record via integration service (Requirement 10.6)
  const auditRecord: ContractAuditRecord = {
    id: generateId(),
    projectId,
    entityType: 'payment_schedule',
    entityId: projectId,
    action: 'schedule_regenerated',
    previousValue: {
      pendingEntriesRemoved: pendingEntries.length,
      previousCompletionDate: config.practicalCompletionDate,
    },
    newValue: {
      revisedCompletionDate,
      newEntriesGenerated: newEntries.length,
    },
    clauseReference: paymentConfig.clauseNumber,
    actorId: 'system',
    timestamp: nowIso(),
  };

  await writeToAuditTrail(projectId, auditRecord);
}

/**
 * Links a finance module certificate to a specific payment schedule entry.
 *
 * Updates the entry with the certificateId and certifiedAmount,
 * and sets the status to 'certificate_issued'.
 *
 * @param projectId The project identifier
 * @param scheduleEntryId The ID of the schedule entry to update
 * @param certificateId The finance module certificate ID
 * @param certifiedAmount The certified amount from the certificate
 */
export async function linkCertificate(
  projectId: string,
  scheduleEntryId: string,
  certificateId: string,
  certifiedAmount: number,
): Promise<void> {
  const entryRef = adminDb
    .collection(`projects/${projectId}/contractPaymentSchedule`)
    .doc(scheduleEntryId);

  const entrySnap = await entryRef.get();
  if (!entrySnap.exists) {
    throw new Error(
      `Schedule entry ${scheduleEntryId} not found for project ${projectId}`,
    );
  }

  await entryRef.update({
    certificateId,
    certifiedAmount,
    status: 'certificate_issued' as PaymentCycleStatus,
  });
}

/**
 * Checks all pending payment schedule entries for overdue deadlines.
 *
 * For each 'pending' entry where the paymentDeadline has passed,
 * marks the entry as 'overdue' and returns a PaymentOverdueResult array.
 *
 * @param projectId The project identifier
 * @returns Array of PaymentOverdueResult for all overdue entries
 */
export async function runPaymentDeadlineCheck(
  projectId: string,
): Promise<PaymentOverdueResult[]> {
  const scheduleRef = adminDb.collection(`projects/${projectId}/contractPaymentSchedule`);
  const today = todayIso();

  const scheduleSnap = await scheduleRef
    .where('status', '==', 'pending')
    .get();

  const overdueResults: PaymentOverdueResult[] = [];

  const batch = adminDb.batch();
  let batchHasUpdates = false;

  scheduleSnap.forEach((doc) => {
    const entry = doc.data() as PaymentScheduleEntry;
    const deadlineMs = parseDate(entry.paymentDeadline).getTime();
    const todayMs = parseDate(today).getTime();

    if (deadlineMs < todayMs) {
      // Payment deadline has passed — mark as overdue
      const daysOverdue = calendarDaysBetween(entry.paymentDeadline, today);

      batch.update(doc.ref, { status: 'overdue' as PaymentCycleStatus });
      batchHasUpdates = true;

      overdueResults.push({
        scheduleEntryId: entry.id,
        cycleNumber: entry.cycleNumber,
        paymentDeadline: entry.paymentDeadline,
        daysOverdue,
      });
    }
  });

  if (batchHasUpdates) {
    await batch.commit();
  }

  return overdueResults;
}

/**
 * Generates certificate deadline reminders for upcoming deadlines.
 *
 * Checks all 'pending' entries and surfaces reminders at 7, 3, and 1
 * working days before the certificate deadline.
 *
 * @param projectId The project identifier
 * @returns Array of ContractWorkflowEvent for entries needing reminders
 */
export async function generateCertificateReminders(
  projectId: string,
): Promise<ContractWorkflowEvent[]> {
  const scheduleRef = adminDb.collection(`projects/${projectId}/contractPaymentSchedule`);
  const today = todayIso();

  // Get holidays for current and next year
  const currentYear = new Date().getFullYear();
  const holidays = [
    ...getSouthAfricanHolidays(currentYear),
    ...getSouthAfricanHolidays(currentYear + 1),
  ];

  const scheduleSnap = await scheduleRef
    .where('status', '==', 'pending')
    .get();

  const events: ContractWorkflowEvent[] = [];

  scheduleSnap.forEach((doc) => {
    const entry = doc.data() as PaymentScheduleEntry;
    const remainingDays = getRemainingWorkingDays(today, entry.certificateDeadline, holidays);

    for (const threshold of CERTIFICATE_WARNING_THRESHOLDS) {
      if (remainingDays === threshold) {
        const priority = threshold === 1 ? 'high' : 'normal';
        const event: ContractWorkflowEvent = {
          projectId,
          targetUserId: '', // Resolved by caller (principal agent / QS)
          priority,
          deadlineDate: entry.certificateDeadline,
          remainingDays: threshold,
          subject: `Payment certificate deadline: Cycle ${entry.cycleNumber} — ${threshold} working day${threshold > 1 ? 's' : ''} remaining`,
          entityType: 'payment',
          entityId: entry.id,
        };
        events.push(event);
      }
    }
  });

  return events;
}


// ══════════════════════════════════════════════════════════════════════════════
// Payment Certificate Event Handling (Finance Module Integration)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Represents a payment certificate event received from the Finance module.
 *
 * The adapter matches the certificate to a schedule entry by valuation period
 * (the certificate's valuation date falling within the schedule entry's cycle).
 */
export interface PaymentCertificateEvent {
  /** The project this certificate belongs to */
  projectId: string;
  /** The certificate ID from the Finance module */
  certificateId: string;
  /** The certified amount (ZAR) */
  certifiedAmount: number;
  /** ISO date string of the valuation period this certificate covers */
  valuationDate: string;
  /** ISO date string when the certificate was issued */
  issuedAt: string;
}

/**
 * Result of handling a payment certificate event.
 */
export interface PaymentCertificateEventResult {
  /** Whether the certificate was successfully matched and linked */
  matched: boolean;
  /** The schedule entry ID that was matched, if any */
  matchedEntryId?: string;
  /** If unmatched, whether a reconciliation action was created */
  reconciliationActionCreated?: boolean;
  /** Integration write result for the reconciliation action, if created */
  actionCentreResult?: IntegrationWriteResult;
}

/**
 * Handles a payment certificate event from the Finance module.
 *
 * Workflow:
 * 1. Receives the certificate event with a valuation date
 * 2. Queries the project's payment schedule to find a matching entry
 *    by valuation period (exact date match on the entry's valuationDate)
 * 3. If matched: calls linkCertificate to update the entry status to 'certificate_issued'
 * 4. If unmatched: flags the certificate and creates a reconciliation action
 *    in the Action Centre requesting manual intervention
 *
 * Requirements: 10.4, 10.10, 7.6
 *
 * @param event - The payment certificate event from the Finance module
 * @returns PaymentCertificateEventResult indicating match outcome
 */
export async function handlePaymentCertificateEvent(
  event: PaymentCertificateEvent,
): Promise<PaymentCertificateEventResult> {
  const { projectId, certificateId, certifiedAmount, valuationDate } = event;

  // Query the payment schedule for a matching entry by valuation date
  const scheduleRef = adminDb.collection(`projects/${projectId}/contractPaymentSchedule`);
  const matchingSnap = await scheduleRef
    .where('valuationDate', '==', valuationDate)
    .limit(1)
    .get();

  if (!matchingSnap.empty) {
    // Match found — link certificate to the schedule entry
    const matchedDoc = matchingSnap.docs[0];
    const matchedEntry = matchedDoc.data() as PaymentScheduleEntry;

    await linkCertificate(projectId, matchedDoc.id, certificateId, certifiedAmount);

    return {
      matched: true,
      matchedEntryId: matchedEntry.id,
    };
  }

  // No exact match — try to find the closest schedule entry whose valuation
  // period covers the certificate's valuation date (entry valuation date is
  // within one payment interval before the certificate valuation date)
  const allPendingSnap = await scheduleRef
    .where('status', '==', 'pending')
    .orderBy('valuationDate', 'asc')
    .get();

  let closestEntry: (PaymentScheduleEntry & { docId: string }) | null = null;
  const certValMs = parseDate(valuationDate).getTime();

  allPendingSnap.forEach((doc) => {
    const entry = doc.data() as PaymentScheduleEntry;
    const entryValMs = parseDate(entry.valuationDate).getTime();

    // Check if the certificate valuation date falls within a reasonable
    // window around the entry's valuation date (±15 calendar days)
    const diffDays = Math.abs(certValMs - entryValMs) / (1000 * 60 * 60 * 24);
    if (diffDays <= 15) {
      if (
        !closestEntry ||
        diffDays < Math.abs(certValMs - parseDate(closestEntry.valuationDate).getTime()) / (1000 * 60 * 60 * 24)
      ) {
        closestEntry = { ...entry, docId: doc.id };
      }
    }
  });

  if (closestEntry) {
    // Close enough match found — link the certificate
    await linkCertificate(projectId, (closestEntry as { docId: string }).docId, certificateId, certifiedAmount);

    return {
      matched: true,
      matchedEntryId: (closestEntry as PaymentScheduleEntry).id,
    };
  }

  // Unmatched certificate — flag and create reconciliation action
  // Persist the unmatched certificate record for audit
  const unmatchedRef = adminDb
    .collection(`projects/${projectId}/contractPaymentSchedule`)
    .doc(`unmatched_${certificateId}`);

  await unmatchedRef.set({
    id: `unmatched_${certificateId}`,
    certificateId,
    certifiedAmount,
    valuationDate,
    issuedAt: event.issuedAt,
    status: 'unmatched',
    flaggedAt: nowIso(),
  });

  // Surface reconciliation action to the Action Centre
  const reconciliationEvent: ContractWorkflowEvent = {
    projectId,
    targetUserId: '', // Resolved by the contract administrator role
    priority: 'high',
    subject: `Unmatched payment certificate requires reconciliation — Certificate ${certificateId} (valuation: ${valuationDate})`,
    entityType: 'payment',
    entityId: certificateId,
    remainingDays: undefined,
    deadlineDate: undefined,
  };

  const actionResult = await surfaceToActionCentre(reconciliationEvent);

  return {
    matched: false,
    reconciliationActionCreated: actionResult.success,
    actionCentreResult: actionResult,
  };
}
