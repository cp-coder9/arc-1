/**
 * Practice Management — Integration Adapters
 *
 * Adapter services for integrating with platform spine:
 *  - Project Passport (practice financial health metrics)
 *  - Action Centre / Inbox (approvals, alerts, overdue invoices)
 *  - Audit Trail (state-changing operations, access violations)
 *
 * @module practiceManagement/adapters
 */

export { buildPracticePassportData } from './passportAdapter';
export type { PracticePassportData, PracticePassportInput } from './passportAdapter';

export {
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

export {
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
} from './auditAdapter';
