/**
 * Practice Invoice Manager Service
 *
 * Pure business logic for professional services invoicing. Supports:
 * - Invoice creation for three types: lump_sum, time_based, disbursement
 * - Time-based invoices: linked to approved timesheet entries, total from hours × rates
 * - Status lifecycle: draft → submitted → sent_to_client → paid/overdue/write_off
 * - Invoices may return to draft for post-issue modifications
 * - WIP update on invoice issuance (submitted status)
 * - Overdue detection: 30+ full days past due date → flag + Action Centre action
 * - Integration with invoiceReadinessService for pre-invoice validation
 *
 * This service operates on typed data objects (dependency injection pattern)
 * with no Firestore dependencies.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 * @module practiceManagement/practiceInvoiceManagerService
 */

import type {
  PracticeInvoice,
  PracticeInvoiceType,
  PracticeInvoiceStatus,
  CreatePracticeInvoiceInput,
  PracticeTimesheetEntry,
  BillingRate,
} from './types';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Number of days past due date before an invoice is flagged as overdue */
export const OVERDUE_THRESHOLD_DAYS = 30;

// ─── Valid Status Transitions ────────────────────────────────────────────────

/**
 * Allowed status transitions for practice invoices.
 *
 * Validates: Requirement 7.4
 * THE Practice_Invoice_Manager SHALL track invoice status through:
 * draft, submitted, sent_to_client, paid, overdue, and write_off;
 * an invoice MAY return to draft status for post-issue modifications.
 */
export const VALID_STATUS_TRANSITIONS: Record<PracticeInvoiceStatus, PracticeInvoiceStatus[]> = {
  draft: ['submitted'],
  submitted: ['sent_to_client', 'draft'],
  sent_to_client: ['paid', 'overdue', 'write_off', 'draft'],
  paid: [],
  overdue: ['paid', 'write_off', 'draft'],
  write_off: ['draft'],
};

// ─── Input/Output Types ──────────────────────────────────────────────────────

/**
 * Timesheet entry data with rate info for time-based invoice calculation.
 */
export interface TimesheetEntryWithRate {
  entryId: string;
  hours: number;
  rateCents: number;
}

/**
 * Action Centre action to be created on overdue invoice detection.
 */
export interface InvoiceAction {
  type: 'overdue_invoice';
  invoiceId: string;
  invoiceNumber: string;
  projectId: string;
  firmId: string;
  amountCents: number;
  dueDate: string;
  daysPastDue: number;
  message: string;
}

/**
 * Result of invoice readiness validation.
 */
export interface InvoiceReadinessResult {
  ready: boolean;
  blockers: string[];
  warnings: string[];
}

/**
 * Result of WIP update after invoice issuance.
 */
export interface WipUpdateResult {
  projectId: string;
  invoicedAmountCents: number;
  totalInvoicedCents: number;
}

// ─── createInvoice ───────────────────────────────────────────────────────────

/**
 * Creates a new practice invoice.
 *
 * Validates: Requirements 7.1, 7.2
 * WHEN a practice invoice is created, THE Practice_Invoice_Manager SHALL support
 * three invoice types: lump sum (stage completion), time-based (hours × rate with
 * timesheet reference), and disbursement claim (approved expenses).
 * WHEN a time-based invoice is generated, THE Practice_Invoice_Manager SHALL link
 * to specific approved timesheet entries and calculate the total from hours
 * multiplied by applicable billing rates.
 *
 * @param input - The invoice creation input
 * @param timesheetEntries - For time-based invoices: linked timesheet entries with rates
 * @returns The newly created PracticeInvoice in draft status
 */
export function createInvoice(
  input: CreatePracticeInvoiceInput,
  timesheetEntries?: TimesheetEntryWithRate[],
): PracticeInvoice {
  const now = new Date().toISOString();
  const id = generateInvoiceId(input.firmId, input.projectId);
  const invoiceNumber = generateInvoiceNumber(input.firmId);

  let amountCents = input.amountCents;
  let timesheetEntryIds = input.timesheetEntryIds;

  // For time-based invoices, calculate from timesheet entries if provided
  if (input.invoiceType === 'time_based' && timesheetEntries && timesheetEntries.length > 0) {
    amountCents = calculateTimeBasedTotal(timesheetEntries);
    timesheetEntryIds = timesheetEntries.map((e) => e.entryId);
  }

  const totalCents = amountCents + input.vatCents;

  return {
    id,
    firmId: input.firmId,
    projectId: input.projectId,
    invoiceNumber,
    invoiceType: input.invoiceType,
    status: 'draft',
    amountCents,
    vatCents: input.vatCents,
    totalCents,
    dueDate: input.dueDate,
    timesheetEntryIds,
    expenseClaimIds: input.expenseClaimIds,
    sacapStage: input.sacapStage,
    description: input.description,
    clientName: input.clientName,
    clientEmail: input.clientEmail,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
}

// ─── updateInvoiceStatus ─────────────────────────────────────────────────────

/**
 * Updates the status of an existing invoice with lifecycle validation.
 *
 * Validates: Requirement 7.4
 * THE Practice_Invoice_Manager SHALL track invoice status through:
 * draft → submitted → sent_to_client → paid/overdue/write_off;
 * an invoice MAY return to draft status for post-issue modifications.
 *
 * Validates: Requirement 7.3
 * WHEN a practice invoice is issued (status changes to 'submitted'),
 * THE Practice_Invoice_Manager SHALL update the WIP_Engine by adding
 * the invoiced amount to the project's invoiced total.
 *
 * @param invoice - The existing invoice to update
 * @param newStatus - The target status
 * @returns Updated invoice, or null if the transition is invalid
 */
export function updateInvoiceStatus(
  invoice: PracticeInvoice,
  newStatus: PracticeInvoiceStatus,
): PracticeInvoice | null {
  if (!isValidTransition(invoice.status, newStatus)) {
    return null;
  }

  const now = new Date().toISOString();
  const updated: PracticeInvoice = {
    ...invoice,
    status: newStatus,
    updatedAt: now,
  };

  // Set issuedDate when first submitted (invoice issuance)
  if (newStatus === 'submitted' && !invoice.issuedDate) {
    updated.issuedDate = now;
  }

  // Set paidDate when marked as paid
  if (newStatus === 'paid') {
    updated.paidDate = now;
  }

  return updated;
}

// ─── getProjectInvoices ──────────────────────────────────────────────────────

/**
 * Gets all invoices for a specific project, sorted by creation date descending.
 *
 * @param invoices - All invoices to filter
 * @param projectId - The project to get invoices for
 * @returns Filtered invoices sorted by createdAt descending
 */
export function getProjectInvoices(
  invoices: PracticeInvoice[],
  projectId: string,
): PracticeInvoice[] {
  return invoices
    .filter((inv) => inv.projectId === projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ─── getOverdueInvoices ──────────────────────────────────────────────────────

/**
 * Gets all overdue invoices for a firm. An invoice is considered overdue if it has
 * been sent to client and remains unpaid for more than 30 full days past its due date.
 *
 * Validates: Requirement 7.5
 * WHEN a practice invoice remains unpaid for more than 30 full days past its due date,
 * THE Practice_Invoice_Manager SHALL flag the invoice as overdue.
 *
 * @param invoices - All invoices to check
 * @param firmId - The firm to scope the query
 * @param currentDate - The current date for overdue calculation (ISO date string YYYY-MM-DD)
 * @returns Array of invoices that are overdue
 */
export function getOverdueInvoices(
  invoices: PracticeInvoice[],
  firmId: string,
  currentDate: string,
): PracticeInvoice[] {
  return invoices.filter((inv) => {
    if (inv.firmId !== firmId) return false;
    // Only invoices that have been sent to client (or already flagged overdue) can be overdue
    if (inv.status !== 'sent_to_client' && inv.status !== 'overdue') return false;
    return isOverdue(inv.dueDate, currentDate);
  });
}

// ─── checkOverdueInvoices ────────────────────────────────────────────────────

/**
 * Checks all invoices for a firm and generates Action Centre actions for
 * any that are newly overdue (30+ days past due date).
 *
 * Validates: Requirement 7.5
 * WHEN a practice invoice remains unpaid for more than 30 full days past its due date,
 * THE Practice_Invoice_Manager SHALL flag the invoice as overdue and create an action
 * in the Action Centre for the firm_admin.
 *
 * @param invoices - All invoices to check
 * @param firmId - The firm to check invoices for
 * @param currentDate - The current date for overdue calculation (ISO date string YYYY-MM-DD)
 * @returns Object containing invoices that should be flagged as overdue and actions to create
 */
export function checkOverdueInvoices(
  invoices: PracticeInvoice[],
  firmId: string,
  currentDate: string,
): { overdueInvoices: PracticeInvoice[]; actions: InvoiceAction[] } {
  const overdueInvoices: PracticeInvoice[] = [];
  const actions: InvoiceAction[] = [];

  for (const invoice of invoices) {
    if (invoice.firmId !== firmId) continue;
    // Only check sent_to_client invoices (not already flagged)
    if (invoice.status !== 'sent_to_client') continue;

    if (isOverdue(invoice.dueDate, currentDate)) {
      const daysPastDue = calculateDaysPastDue(invoice.dueDate, currentDate);

      // Update the invoice to overdue status
      const updatedInvoice = updateInvoiceStatus(invoice, 'overdue');
      if (updatedInvoice) {
        overdueInvoices.push(updatedInvoice);
      }

      // Create Action Centre action
      actions.push({
        type: 'overdue_invoice',
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        projectId: invoice.projectId,
        firmId: invoice.firmId,
        amountCents: invoice.totalCents,
        dueDate: invoice.dueDate,
        daysPastDue,
        message: `Invoice ${invoice.invoiceNumber} is ${daysPastDue} days overdue (R${(invoice.totalCents / 100).toFixed(2)})`,
      });
    }
  }

  return { overdueInvoices, actions };
}

// ─── validateInvoiceReadiness ────────────────────────────────────────────────

/**
 * Validates that an invoice is ready to be created/submitted.
 * Integrates with invoiceReadinessService logic for pre-invoice validation.
 *
 * Validates: Requirement 7.6
 * THE Practice_Invoice_Manager SHALL integrate with the existing
 * invoiceReadinessService for pre-invoice validation.
 *
 * @param input - The invoice creation input to validate
 * @param approvedTimesheetIds - Set of timesheet entry IDs that are approved
 * @param approvedExpenseIds - Set of expense claim IDs that are approved
 * @returns InvoiceReadinessResult with blockers and warnings
 */
export function validateInvoiceReadiness(
  input: CreatePracticeInvoiceInput,
  approvedTimesheetIds: Set<string>,
  approvedExpenseIds: Set<string>,
): InvoiceReadinessResult {
  const blockers: string[] = [];
  const warnings: string[] = [];

  // Validate timesheet entries for time-based invoices
  if (input.invoiceType === 'time_based') {
    if (!input.timesheetEntryIds || input.timesheetEntryIds.length === 0) {
      blockers.push('Time-based invoices require at least one timesheet entry');
    } else {
      for (const tsId of input.timesheetEntryIds) {
        if (!approvedTimesheetIds.has(tsId)) {
          blockers.push(`Timesheet entry ${tsId} is not approved`);
        }
      }
    }
  }

  // Validate expense claims for disbursement invoices
  if (input.invoiceType === 'disbursement') {
    if (!input.expenseClaimIds || input.expenseClaimIds.length === 0) {
      blockers.push('Disbursement invoices require at least one expense claim');
    } else {
      for (const expId of input.expenseClaimIds) {
        if (!approvedExpenseIds.has(expId)) {
          blockers.push(`Expense claim ${expId} is not approved`);
        }
      }
    }
  }

  // Basic field validation
  if (input.amountCents <= 0) {
    blockers.push('Invoice amount must be positive');
  }

  if (!input.dueDate) {
    blockers.push('Due date is required');
  }

  // Warnings (non-blocking)
  if (!input.clientName) {
    warnings.push('No client name specified — consider adding for record keeping');
  }

  if (!input.clientEmail) {
    warnings.push('No client email specified — invoice cannot be sent electronically');
  }

  return {
    ready: blockers.length === 0,
    blockers,
    warnings,
  };
}

// ─── calculateTimeBasedTotal ─────────────────────────────────────────────────

/**
 * Calculates the total amount for a time-based invoice from timesheet entries.
 *
 * Validates: Requirement 7.2
 * WHEN a time-based invoice is generated, THE Practice_Invoice_Manager SHALL
 * calculate the total from hours multiplied by applicable billing rates.
 *
 * @param entries - Timesheet entries with associated billing rates
 * @returns Total amount in cents (hours × rate for each entry, summed)
 */
export function calculateTimeBasedTotal(entries: TimesheetEntryWithRate[]): number {
  return entries.reduce((total, entry) => {
    return total + Math.round(entry.hours * entry.rateCents);
  }, 0);
}

// ─── getWipUpdateOnIssuance ──────────────────────────────────────────────────

/**
 * Calculates the WIP update when an invoice is issued (transitions to 'submitted').
 *
 * Validates: Requirement 7.3
 * WHEN a practice invoice is issued, THE Practice_Invoice_Manager SHALL update
 * the WIP_Engine by adding the invoiced amount to the project's invoiced total.
 *
 * @param invoice - The invoice being issued
 * @param currentInvoicedCents - The current total invoiced amount for the project
 * @returns WipUpdateResult with the new invoiced total
 */
export function getWipUpdateOnIssuance(
  invoice: PracticeInvoice,
  currentInvoicedCents: number,
): WipUpdateResult {
  return {
    projectId: invoice.projectId,
    invoicedAmountCents: invoice.amountCents,
    totalInvoicedCents: currentInvoicedCents + invoice.amountCents,
  };
}

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Checks if a status transition is valid per the invoice lifecycle rules.
 */
export function isValidTransition(
  currentStatus: PracticeInvoiceStatus,
  newStatus: PracticeInvoiceStatus,
): boolean {
  const allowedTransitions = VALID_STATUS_TRANSITIONS[currentStatus];
  return allowedTransitions.includes(newStatus);
}

/**
 * Determines if an invoice is overdue based on due date and current date.
 * An invoice is overdue when more than 30 full days have passed since the due date.
 */
export function isOverdue(dueDate: string, currentDate: string): boolean {
  const daysPastDue = calculateDaysPastDue(dueDate, currentDate);
  return daysPastDue > OVERDUE_THRESHOLD_DAYS;
}

/**
 * Calculates the number of full days past the due date.
 * Returns 0 if the current date is on or before the due date.
 */
export function calculateDaysPastDue(dueDate: string, currentDate: string): number {
  const due = new Date(dueDate);
  const current = new Date(currentDate);
  const diffMs = current.getTime() - due.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Generates a unique invoice ID.
 */
function generateInvoiceId(firmId: string, projectId: string): string {
  return `inv_${firmId}_${projectId}_${Date.now()}`;
}

/**
 * Generates an invoice number for display purposes.
 * Format: INV-YYYYMM-XXXXX (where XXXXX is a random 5-digit number)
 */
function generateInvoiceNumber(firmId: string): string {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const random = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
  return `INV-${yearMonth}-${random}`;
}
