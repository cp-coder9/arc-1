/**
 * Unit tests for PracticeInvoiceManagerService
 *
 * Tests invoice creation, status transitions, overdue detection,
 * WIP updates, and invoice readiness validation.
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */
import {
  createInvoice,
  updateInvoiceStatus,
  getProjectInvoices,
  getOverdueInvoices,
  checkOverdueInvoices,
  calculateTimeBasedTotal,
  getWipUpdateOnIssuance,
  validateInvoiceReadiness,
  isValidTransition,
  isOverdue,
  calculateDaysPastDue,
  OVERDUE_THRESHOLD_DAYS,
  VALID_STATUS_TRANSITIONS,
} from '../practiceInvoiceManagerService';
import type {
  PracticeInvoice,
  CreatePracticeInvoiceInput,
} from '../types';
import type { TimesheetEntryWithRate } from '../practiceInvoiceManagerService';

// ─── Test Fixtures ──────────────────────────────────────────────────────

const FIRM_ID = 'firm_001';
const PROJECT_ID = 'proj_001';
const PROJECT_ID_2 = 'proj_002';
const USER_ID = 'user_001';

function makeInvoiceInput(overrides: Partial<CreatePracticeInvoiceInput> = {}): CreatePracticeInvoiceInput {
  return {
    firmId: FIRM_ID,
    projectId: PROJECT_ID,
    invoiceType: 'lump_sum',
    amountCents: 5000000, // R50,000
    vatCents: 750000, // R7,500 (15%)
    dueDate: '2025-04-30',
    sacapStage: 'stage_3_design_development',
    description: 'Design Development - Stage 3 completion',
    clientName: 'ABC Developers',
    clientEmail: 'accounts@abc.co.za',
    createdBy: USER_ID,
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<PracticeInvoice> = {}): PracticeInvoice {
  return {
    id: 'inv_001',
    firmId: FIRM_ID,
    projectId: PROJECT_ID,
    invoiceNumber: 'INV-202503-00001',
    invoiceType: 'lump_sum',
    status: 'draft',
    amountCents: 5000000,
    vatCents: 750000,
    totalCents: 5750000,
    dueDate: '2025-04-30',
    sacapStage: 'stage_3_design_development',
    description: 'Design Development - Stage 3 completion',
    clientName: 'ABC Developers',
    clientEmail: 'accounts@abc.co.za',
    createdBy: USER_ID,
    createdAt: '2025-03-01T10:00:00.000Z',
    updatedAt: '2025-03-01T10:00:00.000Z',
    ...overrides,
  };
}

// ─── createInvoice ──────────────────────────────────────────────────────

describe('PracticeInvoiceManagerService', () => {
  describe('createInvoice', () => {
    it('creates a lump_sum invoice in draft status', () => {
      const input = makeInvoiceInput();
      const result = createInvoice(input);

      expect(result.firmId).toBe(FIRM_ID);
      expect(result.projectId).toBe(PROJECT_ID);
      expect(result.invoiceType).toBe('lump_sum');
      expect(result.status).toBe('draft');
      expect(result.amountCents).toBe(5000000);
      expect(result.vatCents).toBe(750000);
      expect(result.totalCents).toBe(5750000);
      expect(result.dueDate).toBe('2025-04-30');
      expect(result.description).toBe('Design Development - Stage 3 completion');
      expect(result.clientName).toBe('ABC Developers');
      expect(result.clientEmail).toBe('accounts@abc.co.za');
      expect(result.createdBy).toBe(USER_ID);
      expect(result.id).toBeTruthy();
      expect(result.invoiceNumber).toMatch(/^INV-\d{6}-\d{5}$/);
      expect(result.createdAt).toBeTruthy();
      expect(result.updatedAt).toBeTruthy();
    });

    it('creates a time_based invoice with timesheet entries', () => {
      const entries: TimesheetEntryWithRate[] = [
        { entryId: 'ts_001', hours: 8, rateCents: 150000 },
        { entryId: 'ts_002', hours: 6, rateCents: 150000 },
        { entryId: 'ts_003', hours: 4, rateCents: 120000 },
      ];

      const input = makeInvoiceInput({
        invoiceType: 'time_based',
        amountCents: 0, // will be calculated
      });

      const result = createInvoice(input, entries);

      // 8*150000 + 6*150000 + 4*120000 = 1200000 + 900000 + 480000 = 2580000
      expect(result.invoiceType).toBe('time_based');
      expect(result.amountCents).toBe(2580000);
      expect(result.totalCents).toBe(2580000 + 750000);
      expect(result.timesheetEntryIds).toEqual(['ts_001', 'ts_002', 'ts_003']);
    });

    it('creates a disbursement invoice with expense claim IDs', () => {
      const input = makeInvoiceInput({
        invoiceType: 'disbursement',
        amountCents: 350000,
        expenseClaimIds: ['exp_001', 'exp_002'],
      });

      const result = createInvoice(input);

      expect(result.invoiceType).toBe('disbursement');
      expect(result.amountCents).toBe(350000);
      expect(result.expenseClaimIds).toEqual(['exp_001', 'exp_002']);
    });

    it('uses provided amountCents when no timesheet entries given for time_based', () => {
      const input = makeInvoiceInput({
        invoiceType: 'time_based',
        amountCents: 2000000,
        timesheetEntryIds: ['ts_001', 'ts_002'],
      });

      const result = createInvoice(input);

      expect(result.amountCents).toBe(2000000);
      expect(result.timesheetEntryIds).toEqual(['ts_001', 'ts_002']);
    });

    it('computes totalCents as amountCents + vatCents', () => {
      const input = makeInvoiceInput({
        amountCents: 1000000,
        vatCents: 150000,
      });

      const result = createInvoice(input);

      expect(result.totalCents).toBe(1150000);
    });
  });

  // ─── updateInvoiceStatus ────────────────────────────────────────────────

  describe('updateInvoiceStatus', () => {
    it('transitions from draft to submitted', () => {
      const invoice = makeInvoice({ status: 'draft' });
      const result = updateInvoiceStatus(invoice, 'submitted');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('submitted');
      expect(result!.issuedDate).toBeTruthy();
    });

    it('transitions from submitted to sent_to_client', () => {
      const invoice = makeInvoice({ status: 'submitted', issuedDate: '2025-03-01T10:00:00.000Z' });
      const result = updateInvoiceStatus(invoice, 'sent_to_client');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('sent_to_client');
    });

    it('transitions from sent_to_client to paid', () => {
      const invoice = makeInvoice({ status: 'sent_to_client' });
      const result = updateInvoiceStatus(invoice, 'paid');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('paid');
      expect(result!.paidDate).toBeTruthy();
    });

    it('transitions from sent_to_client to overdue', () => {
      const invoice = makeInvoice({ status: 'sent_to_client' });
      const result = updateInvoiceStatus(invoice, 'overdue');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('overdue');
    });

    it('transitions from sent_to_client to write_off', () => {
      const invoice = makeInvoice({ status: 'sent_to_client' });
      const result = updateInvoiceStatus(invoice, 'write_off');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('write_off');
    });

    it('allows return to draft from submitted', () => {
      const invoice = makeInvoice({ status: 'submitted' });
      const result = updateInvoiceStatus(invoice, 'draft');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('draft');
    });

    it('allows return to draft from overdue', () => {
      const invoice = makeInvoice({ status: 'overdue' });
      const result = updateInvoiceStatus(invoice, 'draft');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('draft');
    });

    it('allows return to draft from write_off', () => {
      const invoice = makeInvoice({ status: 'write_off' });
      const result = updateInvoiceStatus(invoice, 'draft');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('draft');
    });

    it('returns null for invalid transition (draft to paid)', () => {
      const invoice = makeInvoice({ status: 'draft' });
      const result = updateInvoiceStatus(invoice, 'paid');

      expect(result).toBeNull();
    });

    it('returns null for invalid transition (paid to any)', () => {
      const invoice = makeInvoice({ status: 'paid' });

      expect(updateInvoiceStatus(invoice, 'draft')).toBeNull();
      expect(updateInvoiceStatus(invoice, 'submitted')).toBeNull();
      expect(updateInvoiceStatus(invoice, 'overdue')).toBeNull();
    });

    it('does not overwrite issuedDate on subsequent submits', () => {
      const originalDate = '2025-02-15T08:00:00.000Z';
      const invoice = makeInvoice({
        status: 'sent_to_client',
        issuedDate: originalDate,
      });
      // Return to draft then resubmit
      const backToDraft = updateInvoiceStatus(invoice, 'draft')!;
      const resubmitted = updateInvoiceStatus(backToDraft, 'submitted')!;

      expect(resubmitted.issuedDate).toBe(originalDate);
    });
  });

  // ─── getProjectInvoices ─────────────────────────────────────────────────

  describe('getProjectInvoices', () => {
    const invoices: PracticeInvoice[] = [
      makeInvoice({ id: 'inv_001', projectId: PROJECT_ID, createdAt: '2025-03-01T10:00:00.000Z' }),
      makeInvoice({ id: 'inv_002', projectId: PROJECT_ID, createdAt: '2025-04-01T10:00:00.000Z' }),
      makeInvoice({ id: 'inv_003', projectId: PROJECT_ID_2, createdAt: '2025-03-15T10:00:00.000Z' }),
      makeInvoice({ id: 'inv_004', projectId: PROJECT_ID, createdAt: '2025-02-01T10:00:00.000Z' }),
    ];

    it('returns only invoices for the specified project', () => {
      const result = getProjectInvoices(invoices, PROJECT_ID);

      expect(result).toHaveLength(3);
      expect(result.every((inv) => inv.projectId === PROJECT_ID)).toBe(true);
    });

    it('sorts invoices by createdAt descending (newest first)', () => {
      const result = getProjectInvoices(invoices, PROJECT_ID);

      expect(result[0].id).toBe('inv_002');
      expect(result[1].id).toBe('inv_001');
      expect(result[2].id).toBe('inv_004');
    });

    it('returns empty array when no invoices match project', () => {
      const result = getProjectInvoices(invoices, 'proj_nonexistent');

      expect(result).toHaveLength(0);
    });
  });

  // ─── getOverdueInvoices ─────────────────────────────────────────────────

  describe('getOverdueInvoices', () => {
    it('returns invoices more than 30 days past due', () => {
      const invoices: PracticeInvoice[] = [
        makeInvoice({ id: 'inv_overdue', status: 'sent_to_client', dueDate: '2025-03-01' }),
        makeInvoice({ id: 'inv_not_due', status: 'sent_to_client', dueDate: '2025-05-01' }),
      ];

      // Current date is April 2, 2025 — inv_overdue is 32 days past due
      const result = getOverdueInvoices(invoices, FIRM_ID, '2025-04-02');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('inv_overdue');
    });

    it('does not return invoices exactly 30 days past due', () => {
      const invoices: PracticeInvoice[] = [
        makeInvoice({ id: 'inv_boundary', status: 'sent_to_client', dueDate: '2025-03-01' }),
      ];

      // Exactly 30 days: March 1 + 30 = March 31
      const result = getOverdueInvoices(invoices, FIRM_ID, '2025-03-31');

      expect(result).toHaveLength(0);
    });

    it('returns invoices 31+ days past due', () => {
      const invoices: PracticeInvoice[] = [
        makeInvoice({ id: 'inv_31', status: 'sent_to_client', dueDate: '2025-03-01' }),
      ];

      // 31 days past due
      const result = getOverdueInvoices(invoices, FIRM_ID, '2025-04-01');

      expect(result).toHaveLength(1);
    });

    it('only considers sent_to_client and overdue status invoices', () => {
      const invoices: PracticeInvoice[] = [
        makeInvoice({ id: 'inv_draft', status: 'draft', dueDate: '2025-01-01' }),
        makeInvoice({ id: 'inv_submitted', status: 'submitted', dueDate: '2025-01-01' }),
        makeInvoice({ id: 'inv_paid', status: 'paid', dueDate: '2025-01-01' }),
        makeInvoice({ id: 'inv_sent', status: 'sent_to_client', dueDate: '2025-01-01' }),
        makeInvoice({ id: 'inv_already_overdue', status: 'overdue', dueDate: '2025-01-01' }),
      ];

      const result = getOverdueInvoices(invoices, FIRM_ID, '2025-04-01');

      expect(result).toHaveLength(2);
      const ids = result.map((r) => r.id);
      expect(ids).toContain('inv_sent');
      expect(ids).toContain('inv_already_overdue');
    });

    it('scopes results by firmId', () => {
      const invoices: PracticeInvoice[] = [
        makeInvoice({ id: 'inv_own', firmId: FIRM_ID, status: 'sent_to_client', dueDate: '2025-01-01' }),
        makeInvoice({ id: 'inv_other', firmId: 'firm_other', status: 'sent_to_client', dueDate: '2025-01-01' }),
      ];

      const result = getOverdueInvoices(invoices, FIRM_ID, '2025-04-01');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('inv_own');
    });
  });

  // ─── checkOverdueInvoices ───────────────────────────────────────────────

  describe('checkOverdueInvoices', () => {
    it('flags sent_to_client invoices as overdue and creates actions', () => {
      const invoices: PracticeInvoice[] = [
        makeInvoice({ id: 'inv_overdue', status: 'sent_to_client', dueDate: '2025-02-01' }),
      ];

      const result = checkOverdueInvoices(invoices, FIRM_ID, '2025-04-01');

      expect(result.overdueInvoices).toHaveLength(1);
      expect(result.overdueInvoices[0].status).toBe('overdue');
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].type).toBe('overdue_invoice');
      expect(result.actions[0].invoiceId).toBe('inv_overdue');
      expect(result.actions[0].daysPastDue).toBe(59); // Feb 1 to Apr 1
    });

    it('does not flag invoices that are not yet 30+ days past due', () => {
      const invoices: PracticeInvoice[] = [
        makeInvoice({ id: 'inv_recent', status: 'sent_to_client', dueDate: '2025-03-15' }),
      ];

      const result = checkOverdueInvoices(invoices, FIRM_ID, '2025-04-01');

      expect(result.overdueInvoices).toHaveLength(0);
      expect(result.actions).toHaveLength(0);
    });

    it('skips invoices already flagged as overdue', () => {
      const invoices: PracticeInvoice[] = [
        makeInvoice({ id: 'inv_already', status: 'overdue', dueDate: '2025-01-01' }),
      ];

      const result = checkOverdueInvoices(invoices, FIRM_ID, '2025-04-01');

      expect(result.overdueInvoices).toHaveLength(0);
      expect(result.actions).toHaveLength(0);
    });

    it('includes invoice details in action message', () => {
      const invoices: PracticeInvoice[] = [
        makeInvoice({
          id: 'inv_detail',
          invoiceNumber: 'INV-202503-00042',
          status: 'sent_to_client',
          dueDate: '2025-02-01',
          totalCents: 5750000,
        }),
      ];

      const result = checkOverdueInvoices(invoices, FIRM_ID, '2025-04-01');

      expect(result.actions[0].invoiceNumber).toBe('INV-202503-00042');
      expect(result.actions[0].amountCents).toBe(5750000);
      expect(result.actions[0].message).toContain('INV-202503-00042');
      expect(result.actions[0].message).toContain('59 days overdue');
    });
  });

  // ─── calculateTimeBasedTotal ────────────────────────────────────────────

  describe('calculateTimeBasedTotal', () => {
    it('calculates total from hours × rates', () => {
      const entries: TimesheetEntryWithRate[] = [
        { entryId: 'ts_001', hours: 8, rateCents: 150000 },
        { entryId: 'ts_002', hours: 4, rateCents: 120000 },
      ];

      const result = calculateTimeBasedTotal(entries);

      // 8*150000 + 4*120000 = 1200000 + 480000 = 1680000
      expect(result).toBe(1680000);
    });

    it('handles fractional hours', () => {
      const entries: TimesheetEntryWithRate[] = [
        { entryId: 'ts_001', hours: 2.5, rateCents: 100000 },
      ];

      const result = calculateTimeBasedTotal(entries);

      // 2.5 * 100000 = 250000
      expect(result).toBe(250000);
    });

    it('returns 0 for empty entries', () => {
      const result = calculateTimeBasedTotal([]);
      expect(result).toBe(0);
    });

    it('rounds to nearest cent for each entry', () => {
      const entries: TimesheetEntryWithRate[] = [
        { entryId: 'ts_001', hours: 1.333, rateCents: 100000 },
      ];

      const result = calculateTimeBasedTotal(entries);

      // 1.333 * 100000 = 133300 (rounded)
      expect(result).toBe(133300);
    });
  });

  // ─── getWipUpdateOnIssuance ─────────────────────────────────────────────

  describe('getWipUpdateOnIssuance', () => {
    it('adds invoice amount to current invoiced total', () => {
      const invoice = makeInvoice({ amountCents: 2000000 });
      const currentTotal = 3000000;

      const result = getWipUpdateOnIssuance(invoice, currentTotal);

      expect(result.projectId).toBe(PROJECT_ID);
      expect(result.invoicedAmountCents).toBe(2000000);
      expect(result.totalInvoicedCents).toBe(5000000);
    });

    it('works with zero current invoiced total', () => {
      const invoice = makeInvoice({ amountCents: 1500000 });

      const result = getWipUpdateOnIssuance(invoice, 0);

      expect(result.totalInvoicedCents).toBe(1500000);
    });
  });

  // ─── validateInvoiceReadiness ───────────────────────────────────────────

  describe('validateInvoiceReadiness', () => {
    const approvedTimesheets = new Set(['ts_001', 'ts_002', 'ts_003']);
    const approvedExpenses = new Set(['exp_001', 'exp_002']);

    it('passes validation for valid lump_sum invoice', () => {
      const input = makeInvoiceInput({ invoiceType: 'lump_sum' });
      const result = validateInvoiceReadiness(input, approvedTimesheets, approvedExpenses);

      expect(result.ready).toBe(true);
      expect(result.blockers).toHaveLength(0);
    });

    it('blocks time_based invoice without timesheet entries', () => {
      const input = makeInvoiceInput({
        invoiceType: 'time_based',
        timesheetEntryIds: undefined,
      });
      const result = validateInvoiceReadiness(input, approvedTimesheets, approvedExpenses);

      expect(result.ready).toBe(false);
      expect(result.blockers).toContain('Time-based invoices require at least one timesheet entry');
    });

    it('blocks time_based invoice with unapproved timesheet entries', () => {
      const input = makeInvoiceInput({
        invoiceType: 'time_based',
        timesheetEntryIds: ['ts_001', 'ts_unapproved'],
      });
      const result = validateInvoiceReadiness(input, approvedTimesheets, approvedExpenses);

      expect(result.ready).toBe(false);
      expect(result.blockers.some((b) => b.includes('ts_unapproved'))).toBe(true);
    });

    it('blocks disbursement invoice without expense claims', () => {
      const input = makeInvoiceInput({
        invoiceType: 'disbursement',
        expenseClaimIds: undefined,
      });
      const result = validateInvoiceReadiness(input, approvedTimesheets, approvedExpenses);

      expect(result.ready).toBe(false);
      expect(result.blockers).toContain('Disbursement invoices require at least one expense claim');
    });

    it('blocks disbursement invoice with unapproved expense claims', () => {
      const input = makeInvoiceInput({
        invoiceType: 'disbursement',
        expenseClaimIds: ['exp_001', 'exp_unapproved'],
      });
      const result = validateInvoiceReadiness(input, approvedTimesheets, approvedExpenses);

      expect(result.ready).toBe(false);
      expect(result.blockers.some((b) => b.includes('exp_unapproved'))).toBe(true);
    });

    it('warns when clientName is missing', () => {
      const input = makeInvoiceInput({ clientName: undefined });
      const result = validateInvoiceReadiness(input, approvedTimesheets, approvedExpenses);

      expect(result.ready).toBe(true);
      expect(result.warnings.some((w) => w.includes('client name'))).toBe(true);
    });

    it('warns when clientEmail is missing', () => {
      const input = makeInvoiceInput({ clientEmail: undefined });
      const result = validateInvoiceReadiness(input, approvedTimesheets, approvedExpenses);

      expect(result.ready).toBe(true);
      expect(result.warnings.some((w) => w.includes('client email'))).toBe(true);
    });
  });

  // ─── isValidTransition ──────────────────────────────────────────────────

  describe('isValidTransition', () => {
    it('allows all defined valid transitions', () => {
      expect(isValidTransition('draft', 'submitted')).toBe(true);
      expect(isValidTransition('submitted', 'sent_to_client')).toBe(true);
      expect(isValidTransition('submitted', 'draft')).toBe(true);
      expect(isValidTransition('sent_to_client', 'paid')).toBe(true);
      expect(isValidTransition('sent_to_client', 'overdue')).toBe(true);
      expect(isValidTransition('sent_to_client', 'write_off')).toBe(true);
      expect(isValidTransition('sent_to_client', 'draft')).toBe(true);
      expect(isValidTransition('overdue', 'paid')).toBe(true);
      expect(isValidTransition('overdue', 'write_off')).toBe(true);
      expect(isValidTransition('overdue', 'draft')).toBe(true);
      expect(isValidTransition('write_off', 'draft')).toBe(true);
    });

    it('rejects invalid transitions', () => {
      expect(isValidTransition('draft', 'paid')).toBe(false);
      expect(isValidTransition('draft', 'overdue')).toBe(false);
      expect(isValidTransition('draft', 'sent_to_client')).toBe(false);
      expect(isValidTransition('paid', 'draft')).toBe(false);
      expect(isValidTransition('paid', 'overdue')).toBe(false);
    });
  });

  // ─── isOverdue & calculateDaysPastDue ───────────────────────────────────

  describe('isOverdue', () => {
    it('returns true when more than 30 days past due', () => {
      expect(isOverdue('2025-03-01', '2025-04-01')).toBe(true); // 31 days
    });

    it('returns false when exactly 30 days past due', () => {
      expect(isOverdue('2025-03-01', '2025-03-31')).toBe(false); // 30 days
    });

    it('returns false when before due date', () => {
      expect(isOverdue('2025-04-30', '2025-04-01')).toBe(false);
    });

    it('returns false on the due date', () => {
      expect(isOverdue('2025-04-01', '2025-04-01')).toBe(false);
    });
  });

  describe('calculateDaysPastDue', () => {
    it('returns 0 when current date is before due date', () => {
      expect(calculateDaysPastDue('2025-04-30', '2025-04-01')).toBe(0);
    });

    it('returns 0 on the due date', () => {
      expect(calculateDaysPastDue('2025-04-01', '2025-04-01')).toBe(0);
    });

    it('calculates correct days past due', () => {
      expect(calculateDaysPastDue('2025-03-01', '2025-04-01')).toBe(31);
      expect(calculateDaysPastDue('2025-01-01', '2025-04-01')).toBe(90);
    });
  });
});
