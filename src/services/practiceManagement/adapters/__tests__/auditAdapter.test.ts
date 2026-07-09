/**
 * Unit tests for Practice Management Audit Trail Adapter
 *
 * Validates factory functions produce correct PracticeAuditEvent records
 * for all state-changing operations and access violations.
 *
 * Requirements: 14.5, 15.4
 */

import {
  createAuditEvent,
  createTimesheetSubmittedEvent,
  createTimesheetApprovedEvent,
  createTimesheetRejectedEvent,
  createExpenseSubmittedEvent,
  createExpenseApprovedEvent,
  createExpenseRejectedEvent,
  createInvoiceCreatedEvent,
  createInvoiceStatusChangedEvent,
  createLeaveRequestedEvent,
  createLeaveApprovedEvent,
  createLeaveRejectedEvent,
  createWriteOffCreatedEvent,
  createWriteOffReversedEvent,
  createRateCreatedEvent,
  createRateUpdatedEvent,
  createFeeDefinedEvent,
  createFeeUpdatedEvent,
  createPipelineCreatedEvent,
  createPipelineWonEvent,
  createPipelineLostEvent,
  createAccessViolationEvent,
} from '../auditAdapter';

describe('auditAdapter', () => {
  describe('createAuditEvent', () => {
    it('creates a well-formed audit event with all common fields', () => {
      const event = createAuditEvent({
        firmId: 'firm-1',
        userId: 'user-1',
        action: 'timesheet_submitted',
        entityType: 'timesheet_submission',
        entityId: 'sub-1',
        projectId: 'proj-1',
        details: { weekStartDate: '2025-01-06' },
      });

      expect(event.id).toMatch(/^pma-/);
      expect(event.firmId).toBe('firm-1');
      expect(event.userId).toBe('user-1');
      expect(event.action).toBe('timesheet_submitted');
      expect(event.entityType).toBe('timesheet_submission');
      expect(event.entityId).toBe('sub-1');
      expect(event.projectId).toBe('proj-1');
      expect(event.details).toEqual({ weekStartDate: '2025-01-06' });
      expect(event.timestamp).toBeTruthy();
      expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp);
    });

    it('generates unique IDs for each event', () => {
      const event1 = createAuditEvent({
        firmId: 'firm-1',
        userId: 'user-1',
        action: 'timesheet_submitted',
        entityType: 'timesheet_submission',
        entityId: 'sub-1',
      });
      const event2 = createAuditEvent({
        firmId: 'firm-1',
        userId: 'user-1',
        action: 'timesheet_submitted',
        entityType: 'timesheet_submission',
        entityId: 'sub-1',
      });

      expect(event1.id).not.toBe(event2.id);
    });

    it('defaults details to empty object when not provided', () => {
      const event = createAuditEvent({
        firmId: 'firm-1',
        userId: 'user-1',
        action: 'rate_created',
        entityType: 'billing_rate',
        entityId: 'rate-1',
      });

      expect(event.details).toEqual({});
    });

    it('omits projectId when not provided', () => {
      const event = createAuditEvent({
        firmId: 'firm-1',
        userId: 'user-1',
        action: 'leave_requested',
        entityType: 'leave_request',
        entityId: 'leave-1',
      });

      expect(event.projectId).toBeUndefined();
    });
  });

  describe('timesheet audit events', () => {
    it('creates timesheet_submitted event with week and hours details', () => {
      const event = createTimesheetSubmittedEvent({
        firmId: 'firm-1',
        userId: 'user-1',
        submissionId: 'sub-1',
        projectId: 'proj-1',
        weekStartDate: '2025-01-06',
        totalHours: 40,
      });

      expect(event.action).toBe('timesheet_submitted');
      expect(event.entityType).toBe('timesheet_submission');
      expect(event.entityId).toBe('sub-1');
      expect(event.details).toEqual({
        weekStartDate: '2025-01-06',
        totalHours: 40,
      });
    });

    it('creates timesheet_approved event with approver info', () => {
      const event = createTimesheetApprovedEvent({
        firmId: 'firm-1',
        userId: 'approver-1',
        submissionId: 'sub-1',
        projectId: 'proj-1',
        approvedUserId: 'user-1',
      });

      expect(event.action).toBe('timesheet_approved');
      expect(event.details).toEqual({ approvedUserId: 'user-1' });
    });

    it('creates timesheet_rejected event with reason', () => {
      const event = createTimesheetRejectedEvent({
        firmId: 'firm-1',
        userId: 'approver-1',
        submissionId: 'sub-1',
        rejectedUserId: 'user-1',
        reason: 'Missing project allocation',
      });

      expect(event.action).toBe('timesheet_rejected');
      expect(event.details).toEqual({
        rejectedUserId: 'user-1',
        reason: 'Missing project allocation',
      });
    });
  });

  describe('expense audit events', () => {
    it('creates expense_submitted event with amount and category', () => {
      const event = createExpenseSubmittedEvent({
        firmId: 'firm-1',
        userId: 'user-1',
        claimId: 'exp-1',
        projectId: 'proj-1',
        amountCents: 150000,
        category: 'travel',
      });

      expect(event.action).toBe('expense_submitted');
      expect(event.entityType).toBe('expense_claim');
      expect(event.details).toEqual({
        amountCents: 150000,
        category: 'travel',
      });
    });

    it('creates expense_approved event', () => {
      const event = createExpenseApprovedEvent({
        firmId: 'firm-1',
        userId: 'admin-1',
        claimId: 'exp-1',
        projectId: 'proj-1',
        approvedUserId: 'user-1',
        amountCents: 150000,
      });

      expect(event.action).toBe('expense_approved');
      expect(event.details).toEqual({
        approvedUserId: 'user-1',
        amountCents: 150000,
      });
    });

    it('creates expense_rejected event with reason', () => {
      const event = createExpenseRejectedEvent({
        firmId: 'firm-1',
        userId: 'admin-1',
        claimId: 'exp-1',
        projectId: 'proj-1',
        rejectedUserId: 'user-1',
        reason: 'Missing receipt',
      });

      expect(event.action).toBe('expense_rejected');
      expect(event.details).toEqual({
        rejectedUserId: 'user-1',
        reason: 'Missing receipt',
      });
    });
  });

  describe('invoice audit events', () => {
    it('creates invoice_created event with type and amount', () => {
      const event = createInvoiceCreatedEvent({
        firmId: 'firm-1',
        userId: 'admin-1',
        invoiceId: 'inv-1',
        projectId: 'proj-1',
        invoiceType: 'time_based',
        amountCents: 500000,
      });

      expect(event.action).toBe('invoice_created');
      expect(event.entityType).toBe('practice_invoice');
      expect(event.details).toEqual({
        invoiceType: 'time_based',
        amountCents: 500000,
      });
    });

    it('creates invoice_status_changed event with transition', () => {
      const event = createInvoiceStatusChangedEvent({
        firmId: 'firm-1',
        userId: 'admin-1',
        invoiceId: 'inv-1',
        projectId: 'proj-1',
        previousStatus: 'draft',
        newStatus: 'sent_to_client',
      });

      expect(event.action).toBe('invoice_status_changed');
      expect(event.details).toEqual({
        previousStatus: 'draft',
        newStatus: 'sent_to_client',
      });
    });
  });

  describe('leave audit events', () => {
    it('creates leave_requested event with dates and type', () => {
      const event = createLeaveRequestedEvent({
        firmId: 'firm-1',
        userId: 'user-1',
        requestId: 'leave-1',
        leaveType: 'annual',
        startDate: '2025-03-10',
        endDate: '2025-03-14',
        workingDays: 5,
      });

      expect(event.action).toBe('leave_requested');
      expect(event.entityType).toBe('leave_request');
      expect(event.details).toEqual({
        leaveType: 'annual',
        startDate: '2025-03-10',
        endDate: '2025-03-14',
        workingDays: 5,
      });
    });

    it('creates leave_approved event', () => {
      const event = createLeaveApprovedEvent({
        firmId: 'firm-1',
        userId: 'admin-1',
        requestId: 'leave-1',
        approvedUserId: 'user-1',
      });

      expect(event.action).toBe('leave_approved');
      expect(event.details).toEqual({ approvedUserId: 'user-1' });
    });

    it('creates leave_rejected event with reason', () => {
      const event = createLeaveRejectedEvent({
        firmId: 'firm-1',
        userId: 'admin-1',
        requestId: 'leave-1',
        rejectedUserId: 'user-1',
        reason: 'Team capacity critical',
      });

      expect(event.action).toBe('leave_rejected');
      expect(event.details).toEqual({
        rejectedUserId: 'user-1',
        reason: 'Team capacity critical',
      });
    });
  });

  describe('write-off audit events', () => {
    it('creates write_off_created event with amount and reason', () => {
      const event = createWriteOffCreatedEvent({
        firmId: 'firm-1',
        userId: 'director-1',
        writeOffId: 'wo-1',
        projectId: 'proj-1',
        amountCents: 250000,
        reason: 'scope_creep',
      });

      expect(event.action).toBe('write_off_created');
      expect(event.entityType).toBe('write_off');
      expect(event.details).toEqual({
        amountCents: 250000,
        reason: 'scope_creep',
      });
    });

    it('creates write_off_reversed event with original reference', () => {
      const event = createWriteOffReversedEvent({
        firmId: 'firm-1',
        userId: 'director-1',
        writeOffId: 'wo-2',
        projectId: 'proj-1',
        originalWriteOffId: 'wo-1',
        reason: 'Client agreed to pay',
      });

      expect(event.action).toBe('write_off_reversed');
      expect(event.details).toEqual({
        originalWriteOffId: 'wo-1',
        reason: 'Client agreed to pay',
      });
    });
  });

  describe('billing rate audit events', () => {
    it('creates rate_created event with rate details', () => {
      const event = createRateCreatedEvent({
        firmId: 'firm-1',
        userId: 'admin-1',
        rateId: 'rate-1',
        role: 'architect',
        rateType: 'hourly',
        rateCents: 85000,
      });

      expect(event.action).toBe('rate_created');
      expect(event.entityType).toBe('billing_rate');
      expect(event.details).toEqual({
        role: 'architect',
        rateType: 'hourly',
        rateCents: 85000,
      });
    });

    it('creates rate_updated event with changes', () => {
      const event = createRateUpdatedEvent({
        firmId: 'firm-1',
        userId: 'admin-1',
        rateId: 'rate-1',
        changes: { rateCents: 90000 },
      });

      expect(event.action).toBe('rate_updated');
      expect(event.details).toEqual({ changes: { rateCents: 90000 } });
    });
  });

  describe('fee tracker audit events', () => {
    it('creates fee_defined event', () => {
      const event = createFeeDefinedEvent({
        firmId: 'firm-1',
        userId: 'lead-1',
        feeStructureId: 'fee-1',
        projectId: 'proj-1',
        totalAgreedFeeCents: 5000000,
        feeBasis: 'lump_sum',
      });

      expect(event.action).toBe('fee_defined');
      expect(event.entityType).toBe('fee_structure');
      expect(event.projectId).toBe('proj-1');
      expect(event.details).toEqual({
        totalAgreedFeeCents: 5000000,
        feeBasis: 'lump_sum',
      });
    });

    it('creates fee_updated event with changes', () => {
      const event = createFeeUpdatedEvent({
        firmId: 'firm-1',
        userId: 'lead-1',
        feeStructureId: 'fee-1',
        projectId: 'proj-1',
        changes: { totalAgreedFeeCents: 5500000 },
      });

      expect(event.action).toBe('fee_updated');
      expect(event.details).toEqual({ changes: { totalAgreedFeeCents: 5500000 } });
    });
  });

  describe('pipeline audit events', () => {
    it('creates pipeline_created event with fee and probability', () => {
      const event = createPipelineCreatedEvent({
        firmId: 'firm-1',
        userId: 'bd-1',
        opportunityId: 'opp-1',
        projectId: 'proj-1',
        estimatedFeeCents: 3000000,
        probability: 60,
      });

      expect(event.action).toBe('pipeline_created');
      expect(event.entityType).toBe('pipeline_opportunity');
      expect(event.details).toEqual({
        estimatedFeeCents: 3000000,
        probability: 60,
      });
    });

    it('creates pipeline_won event', () => {
      const event = createPipelineWonEvent({
        firmId: 'firm-1',
        userId: 'bd-1',
        opportunityId: 'opp-1',
        projectId: 'proj-1',
      });

      expect(event.action).toBe('pipeline_won');
      expect(event.entityId).toBe('opp-1');
    });

    it('creates pipeline_lost event with reason', () => {
      const event = createPipelineLostEvent({
        firmId: 'firm-1',
        userId: 'bd-1',
        opportunityId: 'opp-1',
        projectId: 'proj-1',
        reason: 'Lost to competitor',
      });

      expect(event.action).toBe('pipeline_lost');
      expect(event.details).toEqual({ reason: 'Lost to competitor' });
    });
  });

  describe('access violation logging', () => {
    it('creates access_violation event with role context (Req 14.5)', () => {
      const event = createAccessViolationEvent({
        firmId: 'firm-1',
        userId: 'staff-1',
        attemptedAction: 'view_profitability',
        resourceType: 'profitability_report',
        resourceId: 'proj-1',
        projectId: 'proj-1',
        userRole: 'staff',
        requiredRoles: ['architect', 'bep', 'firm_admin'],
      });

      expect(event.action).toBe('access_violation');
      expect(event.entityType).toBe('profitability_report');
      expect(event.entityId).toBe('proj-1');
      expect(event.details).toEqual({
        attemptedAction: 'view_profitability',
        userRole: 'staff',
        requiredRoles: ['architect', 'bep', 'firm_admin'],
      });
    });

    it('works without projectId for firm-level access violations', () => {
      const event = createAccessViolationEvent({
        firmId: 'firm-1',
        userId: 'client-1',
        attemptedAction: 'view_billing_rates',
        resourceType: 'billing_rate_table',
        resourceId: 'firm-1',
        userRole: 'client',
        requiredRoles: ['firm_admin'],
      });

      expect(event.action).toBe('access_violation');
      expect(event.projectId).toBeUndefined();
      expect(event.details).toEqual({
        attemptedAction: 'view_billing_rates',
        userRole: 'client',
        requiredRoles: ['firm_admin'],
      });
    });
  });
});
