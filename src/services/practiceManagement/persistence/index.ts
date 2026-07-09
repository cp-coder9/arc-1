/**
 * Practice Management — Firestore Persistence Layer
 *
 * All collections scoped by firmId for multi-tenant isolation.
 * Uses Firestore transactions for approval workflows (atomic status + cost total updates).
 * Implements optimistic locking via updatedAt field.
 *
 * Collections:
 *  - practice_timesheet_submissions
 *  - practice_expenses
 *  - practice_billing_rates
 *  - practice_fee_structures
 *  - practice_invoices
 *  - practice_leave_requests
 *  - practice_leave_balances
 *  - practice_write_offs
 *  - practice_resource_allocations
 *
 * @module practiceManagement/persistence
 */

// ─── Timesheet Persistence ───────────────────────────────────────────────────

export {
  createTimesheetSubmission,
  getTimesheetSubmission,
  getTimesheetSubmissionsByFirm,
  getTimesheetSubmissionsByUser,
  getPendingSubmissions,
  approveTimesheetSubmission,
  rejectTimesheetSubmission,
  updateTimesheetSubmission,
  deleteTimesheetSubmission,
} from './timesheetPersistence';

// ─── Expense Persistence ─────────────────────────────────────────────────────

export {
  createExpense,
  getExpense,
  getExpensesByFirm,
  getExpensesByUser,
  getExpensesByProject,
  approveExpense,
  rejectExpense,
  updateExpense,
  deleteExpense,
} from './expensePersistence';

// ─── Billing Rate Persistence ────────────────────────────────────────────────

export {
  createBillingRate,
  getBillingRate,
  getBillingRatesByFirm,
  getBillingRatesByRole,
  getApplicableBillingRate,
  updateBillingRate,
  deleteBillingRate,
} from './billingRatePersistence';

// ─── Fee Structure Persistence ───────────────────────────────────────────────

export {
  createFeeStructure,
  getFeeStructure,
  getFeeStructureByProject,
  getFeeStructuresByFirm,
  updateFeeStructure,
  deleteFeeStructure,
} from './feePersistence';

// ─── Invoice Persistence ─────────────────────────────────────────────────────

export {
  createInvoice,
  getInvoice,
  getInvoicesByFirm,
  getInvoicesByProject,
  getOverdueInvoices,
  updateInvoiceStatus,
  updateInvoice,
  deleteInvoice,
} from './invoicePersistence';

// ─── Leave Persistence ───────────────────────────────────────────────────────

export {
  createLeaveRequest,
  getLeaveRequest,
  getLeaveRequestsByFirm,
  getLeaveRequestsByUser,
  approveLeaveRequest,
  rejectLeaveRequest,
  cancelLeaveRequest,
  getLeaveBalance,
  upsertLeaveBalance,
  getLeaveBalancesByUser,
} from './leavePersistence';

// ─── Write-Off Persistence ───────────────────────────────────────────────────

export {
  createWriteOff,
  getWriteOff,
  getWriteOffsByProject,
  getWriteOffsByFirm,
  getReversalsForWriteOff,
  getCumulativeWriteOffForProject,
  deleteWriteOff,
} from './writeOffPersistence';

// ─── Resource Allocation Persistence ─────────────────────────────────────────

export {
  createResourceAllocation,
  getResourceAllocation,
  getResourceAllocationByUserProject,
  getResourceAllocationsByFirm,
  getResourceAllocationsByUser,
  getResourceAllocationsByProject,
  updateResourceAllocation,
  deactivateResourceAllocation,
  deleteResourceAllocation,
} from './resourcePersistence';

export type { ResourceAllocationRecord } from './resourcePersistence';
