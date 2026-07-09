import {
  createTimesheetApprovalEvent,
  createExpenseApprovalEvent,
  createFeeThresholdWarningEvent,
  createFeeHealthEvents,
  createMarginAlertEvent,
  createOverdueInvoiceEvent,
  createOverdueInvoiceEvents,
  createWriteOffWarningEvent,
  createWriteOffWarningEvents,
  generatePracticeManagementInboxEvents,
  resetPracticeInboxState,
} from './inboxAdapter';
import type {
  TimesheetSubmission,
  ExpenseClaim,
  FeeHealthMetrics,
  ProfitabilityResult,
  PracticeInvoice,
  WriteOffWarning,
} from '../types';

// Mock notificationService
vi.mock('@/services/notificationService', () => ({
  notificationService: {
    sendNotification: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('practiceManagement/adapters/inboxAdapter', () => {
  beforeEach(() => {
    resetPracticeInboxState();
    vi.clearAllMocks();
  });

  describe('createTimesheetApprovalEvent', () => {
    const submission: TimesheetSubmission = {
      id: 'ts-001',
      firmId: 'firm-1',
      userId: 'user-1',
      weekStartDate: '2025-06-09',
      weekEndDate: '2025-06-15',
      entryIds: ['e1', 'e2'],
      status: 'pending_approval',
      submittedAt: '2025-06-15T17:00:00Z',
      totalHours: 40,
      totalValueCents: 320000,
      createdAt: '2025-06-09T08:00:00Z',
      updatedAt: '2025-06-15T17:00:00Z',
    };

    it('creates a WorkflowEvent with approval_required type', () => {
      const event = createTimesheetApprovalEvent(submission, 'Jane Doe');

      expect(event.type).toBe('approval_required');
      expect(event.title).toContain('Timesheet approval required');
      expect(event.title).toContain('Jane Doe');
      expect(event.detail).toContain('40h');
      expect(event.detail).toContain('R3200.00');
      expect(event.priority).toBe('medium');
      expect(event.assignedRoles).toContain('architect');
      expect(event.projectId).toBe('firm-1');
    });

    it('uses submittedAt as createdAt', () => {
      const event = createTimesheetApprovalEvent(submission, 'Jane Doe');
      expect(event.createdAt).toBe('2025-06-15T17:00:00Z');
    });

    it('sends notification when approverId provided', async () => {
      const { notificationService } = await import('@/services/notificationService');
      createTimesheetApprovalEvent(submission, 'Jane Doe', 'approver-1');
      expect(notificationService.sendNotification).toHaveBeenCalledWith(
        'approver-1',
        'timesheet_due',
        expect.stringContaining('Jane Doe'),
        expect.objectContaining({ submissionId: 'ts-001' }),
      );
    });
  });

  describe('createExpenseApprovalEvent', () => {
    const claim: ExpenseClaim = {
      id: 'exp-001',
      firmId: 'firm-1',
      userId: 'user-2',
      projectId: 'proj-1',
      description: 'Site visit travel',
      amountCents: 45000,
      date: '2025-06-10',
      category: 'travel',
      expenseType: 'disbursement',
      status: 'pending_approval',
      submittedAt: '2025-06-10T12:00:00Z',
      invoiced: false,
      createdAt: '2025-06-10T10:00:00Z',
      updatedAt: '2025-06-10T12:00:00Z',
    };

    it('creates a WorkflowEvent with approval_required type', () => {
      const event = createExpenseApprovalEvent(claim, 'John Smith');

      expect(event.type).toBe('approval_required');
      expect(event.title).toContain('Expense approval required');
      expect(event.title).toContain('R450.00');
      expect(event.detail).toContain('travel');
      expect(event.detail).toContain('John Smith');
      expect(event.priority).toBe('medium');
      expect(event.sourceModule).toBe('finance');
      expect(event.projectId).toBe('proj-1');
    });

    it('assigns to admin role', () => {
      const event = createExpenseApprovalEvent(claim, 'John Smith');
      expect(event.assignedRoles).toContain('admin');
    });
  });

  describe('createFeeThresholdWarningEvent', () => {
    it('creates a warning event at 80% threshold', () => {
      const event = createFeeThresholdWarningEvent(
        'proj-1',
        'Greenfields Estate',
        'stage_3_design_development',
        85,
      );

      expect(event.type).toBe('risk_detected');
      expect(event.title).toContain('Fee threshold warning');
      expect(event.title).toContain('Greenfields Estate');
      expect(event.detail).toContain('85%');
      expect(event.priority).toBe('medium');
    });

    it('creates a high-priority event at 100%+ (over-run)', () => {
      const event = createFeeThresholdWarningEvent(
        'proj-1',
        'Greenfields Estate',
        'stage_4_documentation',
        112,
      );

      expect(event.type).toBe('risk_detected');
      expect(event.title).toContain('Fee over-run');
      expect(event.detail).toContain('exceeded 100%');
      expect(event.detail).toContain('112%');
      expect(event.priority).toBe('high');
    });
  });

  describe('createFeeHealthEvents', () => {
    it('creates events for warning and over-run stages', () => {
      const metrics: FeeHealthMetrics = {
        projectId: 'proj-1',
        totalFeeCents: 5000000,
        totalCostsIncurredCents: 4200000,
        netPositionCents: 800000,
        warningStages: ['stage_2_concept'],
        overRunStages: ['stage_1_inception'],
      };

      const events = createFeeHealthEvents(metrics, 'Test Project');
      expect(events).toHaveLength(2);
      expect(events[0].priority).toBe('medium'); // warning
      expect(events[1].priority).toBe('high'); // over-run
    });

    it('returns empty array when no warnings or over-runs', () => {
      const metrics: FeeHealthMetrics = {
        projectId: 'proj-1',
        totalFeeCents: 5000000,
        totalCostsIncurredCents: 1000000,
        netPositionCents: 4000000,
        warningStages: [],
        overRunStages: [],
      };

      const events = createFeeHealthEvents(metrics, 'Healthy Project');
      expect(events).toHaveLength(0);
    });
  });

  describe('createMarginAlertEvent', () => {
    it('creates high-priority event for at-risk margin (<20%)', () => {
      const result: ProfitabilityResult = {
        projectId: 'proj-1',
        feeEarnedCents: 1000000,
        timeCostCents: 850000,
        disbursementsCents: 50000,
        writeOffsCents: 0,
        netProfitCents: 100000,
        marginPercent: 10,
        status: 'at_risk',
      };

      const event = createMarginAlertEvent(result, 'Riverside Apartments');

      expect(event.type).toBe('risk_detected');
      expect(event.title).toContain('Margin at risk');
      expect(event.detail).toContain('10.0%');
      expect(event.detail).toContain('below 20%');
      expect(event.priority).toBe('high');
      expect(event.assignedRoles).toEqual(['architect']);
    });

    it('creates critical event for loss-making margin (<0%)', () => {
      const result: ProfitabilityResult = {
        projectId: 'proj-2',
        feeEarnedCents: 500000,
        timeCostCents: 600000,
        disbursementsCents: 50000,
        writeOffsCents: 0,
        netProfitCents: -150000,
        marginPercent: -30,
        status: 'loss_making',
      };

      const event = createMarginAlertEvent(result, 'Loss Project');

      expect(event.type).toBe('risk_detected');
      expect(event.title).toContain('Loss-making project');
      expect(event.detail).toContain('-30.0%');
      expect(event.priority).toBe('critical');
      expect(event.assignedRoles).toEqual(['admin', 'architect']);
    });
  });

  describe('createOverdueInvoiceEvent', () => {
    const invoice: PracticeInvoice = {
      id: 'inv-001',
      firmId: 'firm-1',
      projectId: 'proj-1',
      invoiceNumber: 'INV-2025-042',
      invoiceType: 'lump_sum',
      status: 'overdue',
      amountCents: 250000,
      vatCents: 37500,
      totalCents: 287500,
      dueDate: '2025-05-01',
      description: 'Stage 2 fee claim',
      createdBy: 'user-1',
      createdAt: '2025-04-01T10:00:00Z',
      updatedAt: '2025-06-01T00:00:00Z',
    };

    it('creates a payment_due event with high priority', () => {
      const event = createOverdueInvoiceEvent(invoice, 'Greenfields Estate');

      expect(event.type).toBe('payment_due');
      expect(event.title).toContain('INV-2025-042');
      expect(event.title).toContain('R2875.00');
      expect(event.detail).toContain('2025-05-01');
      expect(event.priority).toBe('high');
      expect(event.assignedRoles).toContain('admin');
      expect(event.sourceModule).toBe('finance');
    });

    it('sends notification to firmAdminId when provided', async () => {
      const { notificationService } = await import('@/services/notificationService');
      createOverdueInvoiceEvent(invoice, 'Greenfields Estate', 'admin-user-1');
      expect(notificationService.sendNotification).toHaveBeenCalledWith(
        'admin-user-1',
        'invoice_ready_for_review',
        expect.stringContaining('INV-2025-042'),
        expect.objectContaining({ invoiceId: 'inv-001' }),
      );
    });
  });

  describe('createOverdueInvoiceEvents', () => {
    it('creates events for multiple overdue invoices', () => {
      const invoices: PracticeInvoice[] = [
        {
          id: 'inv-1', firmId: 'f1', projectId: 'p1', invoiceNumber: 'INV-001',
          invoiceType: 'lump_sum', status: 'overdue', amountCents: 100000,
          vatCents: 15000, totalCents: 115000, dueDate: '2025-04-01',
          description: 'Fee', createdBy: 'u1', createdAt: '2025-03-01T00:00:00Z',
          updatedAt: '2025-05-01T00:00:00Z',
        },
        {
          id: 'inv-2', firmId: 'f1', projectId: 'p2', invoiceNumber: 'INV-002',
          invoiceType: 'time_based', status: 'overdue', amountCents: 200000,
          vatCents: 30000, totalCents: 230000, dueDate: '2025-04-15',
          description: 'Time fee', createdBy: 'u1', createdAt: '2025-03-15T00:00:00Z',
          updatedAt: '2025-05-15T00:00:00Z',
        },
      ];

      const projectNames: Record<string, string> = { p1: 'Project A', p2: 'Project B' };
      const events = createOverdueInvoiceEvents(invoices, projectNames);

      expect(events).toHaveLength(2);
      expect(events[0].detail).toContain('Project A');
      expect(events[1].detail).toContain('Project B');
    });
  });

  describe('createWriteOffWarningEvent', () => {
    const warning: WriteOffWarning = {
      projectId: 'proj-1',
      message: 'Write-offs at 12.5% of agreed fee — exceeds 10% threshold.',
      writeOffPercentage: 12.5,
      thresholdPercent: 10,
    };

    it('creates a risk_detected event with high priority', () => {
      const event = createWriteOffWarningEvent(warning, 'Marina Tower');

      expect(event.type).toBe('risk_detected');
      expect(event.title).toContain('Write-off threshold exceeded');
      expect(event.title).toContain('Marina Tower');
      expect(event.detail).toContain('12.5%');
      expect(event.priority).toBe('high');
      expect(event.assignedRoles).toContain('admin');
      expect(event.assignedRoles).toContain('architect');
    });

    it('sends notifications to directors when provided', async () => {
      const { notificationService } = await import('@/services/notificationService');
      createWriteOffWarningEvent(warning, 'Marina Tower', ['dir-1', 'dir-2']);
      expect(notificationService.sendNotification).toHaveBeenCalledTimes(2);
    });
  });

  describe('createWriteOffWarningEvents', () => {
    it('creates events for multiple warnings', () => {
      const warnings: WriteOffWarning[] = [
        { projectId: 'p1', message: 'Over threshold', writeOffPercentage: 11, thresholdPercent: 10 },
        { projectId: 'p2', message: 'Over threshold', writeOffPercentage: 15, thresholdPercent: 10 },
      ];

      const events = createWriteOffWarningEvents(warnings, { p1: 'A', p2: 'B' });
      expect(events).toHaveLength(2);
    });
  });

  describe('generatePracticeManagementInboxEvents', () => {
    it('aggregates events from all sources', () => {
      const submission: TimesheetSubmission = {
        id: 'ts-1', firmId: 'f1', userId: 'u1', weekStartDate: '2025-06-09',
        weekEndDate: '2025-06-15', entryIds: [], status: 'pending_approval',
        totalHours: 8, totalValueCents: 64000, createdAt: '2025-06-09T00:00:00Z',
        updatedAt: '2025-06-15T00:00:00Z',
      };

      const claim: ExpenseClaim = {
        id: 'exp-1', firmId: 'f1', userId: 'u2', projectId: 'p1',
        description: 'Travel', amountCents: 5000, date: '2025-06-10',
        category: 'travel', expenseType: 'disbursement', status: 'pending_approval',
        invoiced: false, createdAt: '2025-06-10T00:00:00Z', updatedAt: '2025-06-10T00:00:00Z',
      };

      const events = generatePracticeManagementInboxEvents({
        pendingTimesheets: [{ submission, submitterName: 'Alice' }],
        pendingExpenses: [{ claim, submitterName: 'Bob' }],
      });

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('approval_required');
      expect(events[1].type).toBe('approval_required');
    });

    it('returns empty array when no inputs provided', () => {
      const events = generatePracticeManagementInboxEvents({});
      expect(events).toHaveLength(0);
    });
  });
});
