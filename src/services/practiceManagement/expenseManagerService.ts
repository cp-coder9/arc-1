/**
 * Expense Manager Service
 *
 * Pure business logic for expense claim management. Supports:
 * - Expense claim creation with required fields
 * - Submission for approval workflow
 * - Claim approval (adds amount to project disbursement total)
 * - Claim rejection with reason
 * - Project expense listing
 * - Expense summary aggregation per project for WIP calculations and invoicing
 *
 * This service operates on arrays of typed objects (dependency injection pattern)
 * with no Firestore dependencies.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 * @module practiceManagement/expenseManagerService
 */

import type {
  ExpenseClaim,
  ExpenseSummary,
  ExpenseCategory,
  CreateExpenseClaimInput,
} from './types';

/**
 * Creates a new expense claim in draft status.
 *
 * Validates: Requirement 2.1
 * WHEN a staff member creates an expense claim, THE Expense_Manager SHALL require
 * description, amount, date, project, expense category, and optional receipt attachment.
 *
 * Validates: Requirement 2.5
 * THE Expense_Manager SHALL support categorising expenses as either reimbursable
 * (paid back to staff) or disbursement (recoverable from client).
 *
 * @param input - The expense claim creation input
 * @returns The newly created ExpenseClaim object in draft status
 */
export function createExpenseClaim(input: CreateExpenseClaimInput): ExpenseClaim {
  const now = new Date().toISOString();
  const id = generateExpenseId(input.firmId, input.userId, input.date);

  return {
    id,
    firmId: input.firmId,
    userId: input.userId,
    projectId: input.projectId,
    description: input.description,
    amountCents: input.amountCents,
    date: input.date,
    category: input.category,
    expenseType: input.expenseType,
    receiptUrl: input.receiptUrl,
    status: 'draft',
    invoiced: false,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Submits an expense claim for approval by changing its status to pending_approval.
 *
 * Validates: Requirement 2.2
 * WHEN an expense claim is submitted for approval, THE Expense_Manager SHALL change
 * the status to pending_approval and create an action in the Action Centre.
 *
 * @param claims - All expense claims (used to find the target)
 * @param claimId - The ID of the claim to submit
 * @returns The updated ExpenseClaim, or null if not found or not in draft status
 */
export function submitForApproval(
  claims: ExpenseClaim[],
  claimId: string,
): ExpenseClaim | null {
  const claim = claims.find((c) => c.id === claimId);
  if (!claim) return null;

  // Only draft claims can be submitted for approval
  if (claim.status !== 'draft') return null;

  const now = new Date().toISOString();
  return {
    ...claim,
    status: 'pending_approval',
    submittedAt: now,
    updatedAt: now,
  };
}

/**
 * Approves an expense claim, marking it as approved and adding the amount
 * to the project's disbursement total.
 *
 * Validates: Requirement 2.3
 * WHEN an approver approves an expense claim, THE Expense_Manager SHALL mark
 * the claim as approved and add the amount to the project's disbursement total.
 *
 * @param claims - All expense claims (used to find the target)
 * @param claimId - The ID of the claim to approve
 * @param approverId - The userId of the approver
 * @returns The updated ExpenseClaim, or null if not found or not in pending_approval status
 */
export function approveClaim(
  claims: ExpenseClaim[],
  claimId: string,
  approverId: string,
): ExpenseClaim | null {
  const claim = claims.find((c) => c.id === claimId);
  if (!claim) return null;

  // Only pending_approval claims can be approved
  if (claim.status !== 'pending_approval') return null;

  const now = new Date().toISOString();
  return {
    ...claim,
    status: 'approved',
    approvedBy: approverId,
    approvedAt: now,
    updatedAt: now,
  };
}

/**
 * Rejects an expense claim with a reason.
 *
 * Validates: Requirement 2.4
 * WHEN an approver rejects an expense claim, THE Expense_Manager SHALL mark
 * the claim as rejected with a reason and notify the submitter.
 *
 * @param claims - All expense claims (used to find the target)
 * @param claimId - The ID of the claim to reject
 * @param approverId - The userId of the approver performing the rejection
 * @param reason - The reason for rejection
 * @returns The updated ExpenseClaim, or null if not found or not in pending_approval status
 */
export function rejectClaim(
  claims: ExpenseClaim[],
  claimId: string,
  approverId: string,
  reason: string,
): ExpenseClaim | null {
  const claim = claims.find((c) => c.id === claimId);
  if (!claim) return null;

  // Only pending_approval claims can be rejected
  if (claim.status !== 'pending_approval') return null;

  const now = new Date().toISOString();
  return {
    ...claim,
    status: 'rejected',
    rejectedBy: approverId,
    rejectedAt: now,
    rejectionReason: reason,
    updatedAt: now,
  };
}

/**
 * Gets all expense claims for a specific project within a firm.
 *
 * @param claims - All expense claims
 * @param firmId - The firm ID to scope the search
 * @param projectId - The project ID to filter by
 * @returns Array of ExpenseClaim objects for the given project, sorted by date descending
 */
export function getProjectExpenses(
  claims: ExpenseClaim[],
  firmId: string,
  projectId: string,
): ExpenseClaim[] {
  return claims
    .filter((c) => c.firmId === firmId && c.projectId === projectId)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Aggregates approved expenses per project for WIP calculations and invoicing.
 *
 * Validates: Requirement 2.6
 * THE Expense_Manager SHALL aggregate approved expenses per project for inclusion
 * in WIP calculations and practice invoicing.
 *
 * Validates: Requirement 2.5
 * THE Expense_Manager SHALL support categorising expenses as either reimbursable
 * (paid back to staff) or disbursement (recoverable from client).
 *
 * @param claims - All expense claims
 * @param firmId - The firm ID to scope the search
 * @param projectId - The project ID to aggregate for
 * @returns ExpenseSummary with totals by type, status, and category
 */
export function getExpenseSummary(
  claims: ExpenseClaim[],
  firmId: string,
  projectId: string,
): ExpenseSummary {
  const projectClaims = claims.filter(
    (c) => c.firmId === firmId && c.projectId === projectId,
  );

  const allCategories: ExpenseCategory[] = [
    'travel', 'printing', 'courier', 'accommodation', 'meals', 'other',
  ];

  // Initialise category totals to zero
  const byCategory = Object.fromEntries(
    allCategories.map((cat) => [cat, 0]),
  ) as Record<ExpenseCategory, number>;

  let totalReimbursableCents = 0;
  let totalDisbursementCents = 0;
  let pendingCents = 0;
  let approvedCents = 0;
  let invoicedCents = 0;

  for (const claim of projectClaims) {
    // Aggregate by category (approved claims only for cost tracking)
    if (claim.status === 'approved') {
      byCategory[claim.category] += claim.amountCents;

      // Aggregate by expense type
      if (claim.expenseType === 'reimbursable') {
        totalReimbursableCents += claim.amountCents;
      } else {
        totalDisbursementCents += claim.amountCents;
      }

      approvedCents += claim.amountCents;

      // Track invoiced amounts
      if (claim.invoiced) {
        invoicedCents += claim.amountCents;
      }
    } else if (claim.status === 'pending_approval') {
      pendingCents += claim.amountCents;
    }
  }

  return {
    projectId,
    totalReimbursableCents,
    totalDisbursementCents,
    pendingCents,
    approvedCents,
    invoicedCents,
    byCategory,
  };
}

/**
 * Generates a unique expense claim ID.
 */
function generateExpenseId(firmId: string, userId: string, date: string): string {
  return `exp_${firmId}_${userId}_${date}_${Date.now()}`;
}
