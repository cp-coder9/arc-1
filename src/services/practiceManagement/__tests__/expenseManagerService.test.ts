/**
 * Unit tests for ExpenseManagerService
 *
 * Tests claim creation, approval/rejection flows, expense type categorisation,
 * and expense summary aggregation per project.
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */
import {
  createExpenseClaim,
  submitForApproval,
  approveClaim,
  rejectClaim,
  getProjectExpenses,
  getExpenseSummary,
} from '../expenseManagerService';
import type { ExpenseClaim, CreateExpenseClaimInput } from '../types';

// ─── Test Fixtures ──────────────────────────────────────────────────────

const FIRM_ID = 'firm_001';
const USER_ID = 'user_001';
const PROJECT_ID = 'proj_001';
const APPROVER_ID = 'approver_001';

function makeExpenseInput(overrides: Partial<CreateExpenseClaimInput> = {}): CreateExpenseClaimInput {
  return {
    firmId: FIRM_ID,
    userId: USER_ID,
    projectId: PROJECT_ID,
    description: 'Site visit travel',
    amountCents: 150000, // R1,500
    date: '2025-03-15',
    category: 'travel',
    expenseType: 'disbursement',
    ...overrides,
  };
}

function makeExpenseClaim(overrides: Partial<ExpenseClaim> = {}): ExpenseClaim {
  return {
    id: 'exp_001',
    firmId: FIRM_ID,
    userId: USER_ID,
    projectId: PROJECT_ID,
    description: 'Site visit travel',
    amountCents: 150000,
    date: '2025-03-15',
    category: 'travel',
    expenseType: 'disbursement',
    status: 'draft',
    invoiced: false,
    createdAt: '2025-03-15T08:00:00.000Z',
    updatedAt: '2025-03-15T08:00:00.000Z',
    ...overrides,
  };
}

// Helper to build a set of test claims for aggregation tests
function makeSampleClaims(): ExpenseClaim[] {
  return [
    makeExpenseClaim({
      id: 'exp_001',
      amountCents: 150000,
      category: 'travel',
      expenseType: 'disbursement',
      status: 'approved',
      approvedBy: APPROVER_ID,
      approvedAt: '2025-03-16T10:00:00.000Z',
      date: '2025-03-15',
    }),
    makeExpenseClaim({
      id: 'exp_002',
      amountCents: 25000,
      category: 'printing',
      expenseType: 'disbursement',
      status: 'approved',
      approvedBy: APPROVER_ID,
      approvedAt: '2025-03-17T10:00:00.000Z',
      date: '2025-03-16',
      invoiced: true,
      invoiceId: 'inv_001',
    }),
    makeExpenseClaim({
      id: 'exp_003',
      amountCents: 80000,
      category: 'accommodation',
      expenseType: 'reimbursable',
      status: 'approved',
      approvedBy: APPROVER_ID,
      approvedAt: '2025-03-18T10:00:00.000Z',
      date: '2025-03-17',
    }),
    makeExpenseClaim({
      id: 'exp_004',
      amountCents: 45000,
      category: 'meals',
      expenseType: 'reimbursable',
      status: 'pending_approval',
      submittedAt: '2025-03-18T09:00:00.000Z',
      date: '2025-03-18',
    }),
    makeExpenseClaim({
      id: 'exp_005',
      amountCents: 30000,
      category: 'courier',
      expenseType: 'disbursement',
      status: 'rejected',
      rejectedBy: APPROVER_ID,
      rejectedAt: '2025-03-19T10:00:00.000Z',
      rejectionReason: 'Missing receipt',
      date: '2025-03-19',
    }),
    makeExpenseClaim({
      id: 'exp_006',
      amountCents: 60000,
      category: 'travel',
      expenseType: 'disbursement',
      status: 'draft',
      date: '2025-03-20',
    }),
    // Different project — should not appear in project-scoped queries
    makeExpenseClaim({
      id: 'exp_007',
      projectId: 'proj_002',
      amountCents: 200000,
      category: 'travel',
      expenseType: 'disbursement',
      status: 'approved',
      approvedBy: APPROVER_ID,
      date: '2025-03-15',
    }),
  ];
}

// ─── createExpenseClaim ─────────────────────────────────────────────────

describe('ExpenseManagerService', () => {
  describe('createExpenseClaim', () => {
    it('creates a claim with all required fields in draft status', () => {
      const input = makeExpenseInput();
      const result = createExpenseClaim(input);

      expect(result.firmId).toBe(FIRM_ID);
      expect(result.userId).toBe(USER_ID);
      expect(result.projectId).toBe(PROJECT_ID);
      expect(result.description).toBe('Site visit travel');
      expect(result.amountCents).toBe(150000);
      expect(result.date).toBe('2025-03-15');
      expect(result.category).toBe('travel');
      expect(result.expenseType).toBe('disbursement');
      expect(result.status).toBe('draft');
      expect(result.invoiced).toBe(false);
      expect(result.id).toBeTruthy();
      expect(result.createdAt).toBeTruthy();
      expect(result.updatedAt).toBeTruthy();
    });

    it('supports optional receipt URL', () => {
      const input = makeExpenseInput({ receiptUrl: 'https://storage.example.com/receipt.pdf' });
      const result = createExpenseClaim(input);

      expect(result.receiptUrl).toBe('https://storage.example.com/receipt.pdf');
    });

    it('creates claim without receipt URL when not provided', () => {
      const input = makeExpenseInput();
      const result = createExpenseClaim(input);

      expect(result.receiptUrl).toBeUndefined();
    });

    it('supports all expense categories', () => {
      const categories = ['travel', 'printing', 'courier', 'accommodation', 'meals', 'other'] as const;

      for (const category of categories) {
        const input = makeExpenseInput({ category });
        const result = createExpenseClaim(input);
        expect(result.category).toBe(category);
      }
    });

    it('supports reimbursable expense type', () => {
      const input = makeExpenseInput({ expenseType: 'reimbursable' });
      const result = createExpenseClaim(input);

      expect(result.expenseType).toBe('reimbursable');
    });

    it('supports disbursement expense type', () => {
      const input = makeExpenseInput({ expenseType: 'disbursement' });
      const result = createExpenseClaim(input);

      expect(result.expenseType).toBe('disbursement');
    });
  });

  // ─── submitForApproval ──────────────────────────────────────────────────

  describe('submitForApproval', () => {
    it('changes status from draft to pending_approval', () => {
      const claims = [makeExpenseClaim({ id: 'exp_001', status: 'draft' })];
      const result = submitForApproval(claims, 'exp_001');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('pending_approval');
      expect(result!.submittedAt).toBeTruthy();
      expect(result!.updatedAt).not.toBe(claims[0].updatedAt);
    });

    it('returns null if claim not found', () => {
      const claims = [makeExpenseClaim({ id: 'exp_001' })];
      const result = submitForApproval(claims, 'nonexistent');

      expect(result).toBeNull();
    });

    it('returns null if claim is not in draft status', () => {
      const claims = [makeExpenseClaim({ id: 'exp_001', status: 'pending_approval' })];
      const result = submitForApproval(claims, 'exp_001');

      expect(result).toBeNull();
    });

    it('returns null if claim is already approved', () => {
      const claims = [makeExpenseClaim({ id: 'exp_001', status: 'approved' })];
      const result = submitForApproval(claims, 'exp_001');

      expect(result).toBeNull();
    });

    it('returns null if claim is rejected', () => {
      const claims = [makeExpenseClaim({ id: 'exp_001', status: 'rejected' })];
      const result = submitForApproval(claims, 'exp_001');

      expect(result).toBeNull();
    });

    it('preserves all other fields', () => {
      const claims = [makeExpenseClaim({
        id: 'exp_001',
        status: 'draft',
        description: 'Printing costs',
        amountCents: 5000,
      })];
      const result = submitForApproval(claims, 'exp_001');

      expect(result!.description).toBe('Printing costs');
      expect(result!.amountCents).toBe(5000);
      expect(result!.firmId).toBe(FIRM_ID);
    });
  });

  // ─── approveClaim ───────────────────────────────────────────────────────

  describe('approveClaim', () => {
    it('changes status from pending_approval to approved', () => {
      const claims = [makeExpenseClaim({ id: 'exp_001', status: 'pending_approval' })];
      const result = approveClaim(claims, 'exp_001', APPROVER_ID);

      expect(result).not.toBeNull();
      expect(result!.status).toBe('approved');
      expect(result!.approvedBy).toBe(APPROVER_ID);
      expect(result!.approvedAt).toBeTruthy();
      expect(result!.updatedAt).not.toBe(claims[0].updatedAt);
    });

    it('returns null if claim not found', () => {
      const claims = [makeExpenseClaim({ id: 'exp_001', status: 'pending_approval' })];
      const result = approveClaim(claims, 'nonexistent', APPROVER_ID);

      expect(result).toBeNull();
    });

    it('returns null if claim is not in pending_approval status', () => {
      const claims = [makeExpenseClaim({ id: 'exp_001', status: 'draft' })];
      const result = approveClaim(claims, 'exp_001', APPROVER_ID);

      expect(result).toBeNull();
    });

    it('returns null if claim is already approved', () => {
      const claims = [makeExpenseClaim({ id: 'exp_001', status: 'approved' })];
      const result = approveClaim(claims, 'exp_001', APPROVER_ID);

      expect(result).toBeNull();
    });

    it('preserves original claim data', () => {
      const claims = [makeExpenseClaim({
        id: 'exp_001',
        status: 'pending_approval',
        amountCents: 200000,
        category: 'accommodation',
        expenseType: 'reimbursable',
      })];
      const result = approveClaim(claims, 'exp_001', APPROVER_ID);

      expect(result!.amountCents).toBe(200000);
      expect(result!.category).toBe('accommodation');
      expect(result!.expenseType).toBe('reimbursable');
    });
  });

  // ─── rejectClaim ────────────────────────────────────────────────────────

  describe('rejectClaim', () => {
    it('changes status from pending_approval to rejected with reason', () => {
      const claims = [makeExpenseClaim({ id: 'exp_001', status: 'pending_approval' })];
      const result = rejectClaim(claims, 'exp_001', APPROVER_ID, 'Missing receipt');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('rejected');
      expect(result!.rejectedBy).toBe(APPROVER_ID);
      expect(result!.rejectedAt).toBeTruthy();
      expect(result!.rejectionReason).toBe('Missing receipt');
      expect(result!.updatedAt).not.toBe(claims[0].updatedAt);
    });

    it('returns null if claim not found', () => {
      const claims = [makeExpenseClaim({ id: 'exp_001', status: 'pending_approval' })];
      const result = rejectClaim(claims, 'nonexistent', APPROVER_ID, 'reason');

      expect(result).toBeNull();
    });

    it('returns null if claim is not in pending_approval status', () => {
      const claims = [makeExpenseClaim({ id: 'exp_001', status: 'draft' })];
      const result = rejectClaim(claims, 'exp_001', APPROVER_ID, 'reason');

      expect(result).toBeNull();
    });

    it('returns null if claim is already rejected', () => {
      const claims = [makeExpenseClaim({ id: 'exp_001', status: 'rejected' })];
      const result = rejectClaim(claims, 'exp_001', APPROVER_ID, 'another reason');

      expect(result).toBeNull();
    });

    it('preserves original claim data', () => {
      const claims = [makeExpenseClaim({
        id: 'exp_001',
        status: 'pending_approval',
        description: 'Courier delivery',
        amountCents: 15000,
      })];
      const result = rejectClaim(claims, 'exp_001', APPROVER_ID, 'Not project-related');

      expect(result!.description).toBe('Courier delivery');
      expect(result!.amountCents).toBe(15000);
    });
  });

  // ─── getProjectExpenses ─────────────────────────────────────────────────

  describe('getProjectExpenses', () => {
    it('returns all claims for a specific project within a firm', () => {
      const claims = makeSampleClaims();
      const result = getProjectExpenses(claims, FIRM_ID, PROJECT_ID);

      // Should include all claims for proj_001 (6 claims), not proj_002
      expect(result).toHaveLength(6);
      expect(result.every((c) => c.projectId === PROJECT_ID)).toBe(true);
    });

    it('sorts results by date descending (most recent first)', () => {
      const claims = makeSampleClaims();
      const result = getProjectExpenses(claims, FIRM_ID, PROJECT_ID);

      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].date >= result[i + 1].date).toBe(true);
      }
    });

    it('returns empty array for a project with no claims', () => {
      const claims = makeSampleClaims();
      const result = getProjectExpenses(claims, FIRM_ID, 'proj_nonexistent');

      expect(result).toHaveLength(0);
    });

    it('scopes results by firmId', () => {
      const claims = makeSampleClaims();
      const result = getProjectExpenses(claims, 'firm_other', PROJECT_ID);

      expect(result).toHaveLength(0);
    });

    it('includes claims of all statuses', () => {
      const claims = makeSampleClaims();
      const result = getProjectExpenses(claims, FIRM_ID, PROJECT_ID);
      const statuses = new Set(result.map((c) => c.status));

      expect(statuses.has('approved')).toBe(true);
      expect(statuses.has('pending_approval')).toBe(true);
      expect(statuses.has('rejected')).toBe(true);
      expect(statuses.has('draft')).toBe(true);
    });
  });

  // ─── getExpenseSummary ──────────────────────────────────────────────────

  describe('getExpenseSummary', () => {
    it('correctly aggregates approved disbursement totals', () => {
      const claims = makeSampleClaims();
      const result = getExpenseSummary(claims, FIRM_ID, PROJECT_ID);

      // Approved disbursements: exp_001 (150000) + exp_002 (25000) = 175000
      expect(result.totalDisbursementCents).toBe(175000);
    });

    it('correctly aggregates approved reimbursable totals', () => {
      const claims = makeSampleClaims();
      const result = getExpenseSummary(claims, FIRM_ID, PROJECT_ID);

      // Approved reimbursable: exp_003 (80000)
      expect(result.totalReimbursableCents).toBe(80000);
    });

    it('correctly aggregates pending amounts', () => {
      const claims = makeSampleClaims();
      const result = getExpenseSummary(claims, FIRM_ID, PROJECT_ID);

      // Pending: exp_004 (45000)
      expect(result.pendingCents).toBe(45000);
    });

    it('correctly calculates total approved amount', () => {
      const claims = makeSampleClaims();
      const result = getExpenseSummary(claims, FIRM_ID, PROJECT_ID);

      // Approved: exp_001 (150000) + exp_002 (25000) + exp_003 (80000) = 255000
      expect(result.approvedCents).toBe(255000);
    });

    it('correctly calculates invoiced amount', () => {
      const claims = makeSampleClaims();
      const result = getExpenseSummary(claims, FIRM_ID, PROJECT_ID);

      // Invoiced: exp_002 (25000)
      expect(result.invoicedCents).toBe(25000);
    });

    it('breaks down approved amounts by category', () => {
      const claims = makeSampleClaims();
      const result = getExpenseSummary(claims, FIRM_ID, PROJECT_ID);

      expect(result.byCategory.travel).toBe(150000);
      expect(result.byCategory.printing).toBe(25000);
      expect(result.byCategory.accommodation).toBe(80000);
      expect(result.byCategory.meals).toBe(0); // meals claim is still pending
      expect(result.byCategory.courier).toBe(0); // courier claim was rejected
      expect(result.byCategory.other).toBe(0);
    });

    it('returns the correct projectId', () => {
      const claims = makeSampleClaims();
      const result = getExpenseSummary(claims, FIRM_ID, PROJECT_ID);

      expect(result.projectId).toBe(PROJECT_ID);
    });

    it('returns zero totals for a project with no claims', () => {
      const claims = makeSampleClaims();
      const result = getExpenseSummary(claims, FIRM_ID, 'proj_empty');

      expect(result.totalReimbursableCents).toBe(0);
      expect(result.totalDisbursementCents).toBe(0);
      expect(result.pendingCents).toBe(0);
      expect(result.approvedCents).toBe(0);
      expect(result.invoicedCents).toBe(0);
      expect(result.byCategory.travel).toBe(0);
      expect(result.byCategory.printing).toBe(0);
      expect(result.byCategory.courier).toBe(0);
      expect(result.byCategory.accommodation).toBe(0);
      expect(result.byCategory.meals).toBe(0);
      expect(result.byCategory.other).toBe(0);
    });

    it('excludes rejected and draft claims from approved totals', () => {
      const claims = makeSampleClaims();
      const result = getExpenseSummary(claims, FIRM_ID, PROJECT_ID);

      // Total approved should only include the 3 approved claims
      // Not the rejected (30000) or draft (60000) or pending (45000)
      expect(result.approvedCents).toBe(255000);
    });

    it('scopes results by firmId', () => {
      const claims = makeSampleClaims();
      const result = getExpenseSummary(claims, 'firm_other', PROJECT_ID);

      expect(result.approvedCents).toBe(0);
    });
  });
});
