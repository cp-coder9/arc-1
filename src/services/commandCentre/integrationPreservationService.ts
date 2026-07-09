/**
 * Project Command Centre — Integration Preservation Service
 *
 * Wires all existing integration services (passportWritebackService, actionCentreService,
 * specForgeSyncService, complianceFinanceIntegrationService) into the unified Command Centre.
 * Implements the safeIntegrationCall pattern for failure safety.
 *
 * Key behaviours:
 * - Milestone status changes trigger passport health document updates (scheduleHealth, milestoneProgress)
 * - Budget variance detection triggers financialHealth writeback
 * - Task/RFI/milestone generates Action Centre entry with required fields
 * - SpecForge sync maintains bidirectional link records
 * - Payment certification queues payment workflow request
 * - Integration failures: log error, preserve passport state, create failed_sync alert
 *
 * All existing service exports remain unchanged — this module wires them together.
 *
 * @module commandCentre/integrationPreservationService
 */

import { passportWritebackService } from './passportWritebackService';
import { actionCentreService } from './actionCentreService';
import { specForgeSyncService } from './specForgeSyncService';
import { complianceFinanceIntegrationService } from './complianceFinanceIntegrationService';
import type { Priority } from './types';

// ── Types ────────────────────────────────────────────────────────────────────

export type FinancialHealthStatus = 'healthy' | 'at_risk' | 'over_budget';

export interface MilestoneStatusChange {
  projectId: string;
  milestoneId: string;
  newStatus: 'complete' | 'on_track' | 'at_risk' | 'overdue' | 'pending';
  total: number;
  completed: number;
  overdue: number;
}

export interface ActionCentreEntry {
  projectId: string;
  actionType: 'approval' | 'technical' | 'financial' | 'design' | 'planning';
  assigneeId: string;
  priority: Priority;
  dueDate: string;
  status: 'pending';
  title: string;
  description: string;
  sourceSubsystem: string;
  sourceEntityId: string;
}

export interface FailedSyncAlert {
  projectId: string;
  type: 'failed_sync';
  targetModule: string;
  message: string;
  entityId: string;
  timestamp: string;
}

// ── Financial Health Derivation ──────────────────────────────────────────────

/**
 * Derives financial health status from budget cost variance percentage.
 *
 * - variance ≤ 5% → "healthy"
 * - variance > 5% and ≤ 15% → "at_risk"
 * - variance > 15% → "over_budget"
 *
 * Property 14: Financial Health Derivation
 * Validates: Requirements 9.2
 */
export function determineFinancialHealth(variancePercent: number): FinancialHealthStatus {
  if (variancePercent <= 5) {
    return 'healthy';
  }
  if (variancePercent <= 15) {
    return 'at_risk';
  }
  return 'over_budget';
}

// ── Safe Integration Call Pattern ────────────────────────────────────────────

/**
 * Executes an integration operation with failure safety.
 *
 * On success: the operation completes normally.
 * On failure:
 *   1. Logs the error with service name and project context
 *   2. Does NOT modify Project Passport state (preserves current state)
 *   3. Creates a failed_sync alert in the Action Centre containing
 *      the target module name and affected entity ID
 *
 * Property 16: Integration Failure Safety
 * Validates: Requirements 9.7
 */
export async function safeIntegrationCall(
  projectId: string,
  serviceName: string,
  operation: () => Promise<void>,
  entityId?: string,
): Promise<void> {
  try {
    await operation();
  } catch (err) {
    console.error(`[${serviceName}] Integration failed for project ${projectId}:`, err);
    // Do NOT modify passport state — preserve current state

    // Create failed_sync alert in Action Centre
    try {
      await actionCentreService.createAction(projectId, {
        type: 'technical',
        title: `${serviceName} sync failed`,
        description: `Integration with ${serviceName} failed for entity ${entityId || 'unknown'}. Manual retry may be required.`,
        assigneeId: 'system',
        priority: 'high',
        dueDate: new Date().toISOString(),
        sourceSubsystem: serviceName,
        sourceEntityId: entityId || projectId,
        status: 'pending',
      });
    } catch (alertErr) {
      // If we can't even create the alert, log it — but never throw from here
      console.error(`[${serviceName}] Failed to create failed_sync alert:`, alertErr);
    }
  }
}

// ── Passport Writeback Wiring ────────────────────────────────────────────────

/**
 * Triggers passport health document update when a milestone status changes.
 * Updates both scheduleHealth and milestoneProgress in the passport.
 *
 * Validates: Requirements 9.1, 9.2
 */
export async function onMilestoneStatusChange(change: MilestoneStatusChange): Promise<void> {
  const { projectId, milestoneId, total, completed, overdue } = change;

  await safeIntegrationCall(
    projectId,
    'passportWritebackService',
    async () => {
      // Determine schedule health from milestone data
      const scheduleHealth = overdue > 0 ? 'at_risk' : 'on_track';
      await passportWritebackService.writeScheduleHealth(projectId, scheduleHealth);
      await passportWritebackService.writeMilestoneProgress(projectId, { total, completed, overdue });
    },
    milestoneId,
  );
}

/**
 * Triggers financialHealth writeback when budget variance is detected.
 * Uses determineFinancialHealth to derive the status from variance percentage.
 *
 * Validates: Requirements 9.2
 */
export async function onBudgetVarianceDetected(
  projectId: string,
  variancePercent: number,
  entityId?: string,
): Promise<void> {
  await safeIntegrationCall(
    projectId,
    'passportWritebackService',
    async () => {
      const healthStatus = determineFinancialHealth(variancePercent);
      await passportWritebackService.writeFinancialHealth(projectId, healthStatus);
    },
    entityId || projectId,
  );
}

// ── Action Centre Wiring ─────────────────────────────────────────────────────

/**
 * Creates an Action Centre entry when a task, RFI, or milestone generates an action.
 * Ensures all required fields are present: projectId, actionType, assigneeId, priority, dueDate, status='pending'.
 *
 * Property 15: Action Centre Entry Completeness
 * Validates: Requirements 9.3
 */
export async function createActionFromSubsystem(entry: ActionCentreEntry): Promise<void> {
  const { projectId, ...actionData } = entry;

  await safeIntegrationCall(
    projectId,
    'actionCentreService',
    async () => {
      await actionCentreService.createAction(projectId, {
        type: actionData.actionType,
        title: actionData.title,
        description: actionData.description,
        assigneeId: actionData.assigneeId,
        priority: actionData.priority,
        dueDate: actionData.dueDate,
        sourceSubsystem: actionData.sourceSubsystem,
        sourceEntityId: actionData.sourceEntityId,
        status: 'pending',
      });
    },
    actionData.sourceEntityId,
  );
}

// ── SpecForge Sync Wiring ────────────────────────────────────────────────────

/**
 * Maintains bidirectional link records in specforge_links collection.
 * Updates all linked records within 5 seconds on status change.
 *
 * Validates: Requirements 9.4
 */
export async function onSpecForgeItemStatusChange(
  projectId: string,
  specForgeItemId: string,
  newStatus: string,
): Promise<void> {
  await safeIntegrationCall(
    projectId,
    'specForgeSyncService',
    async () => {
      await specForgeSyncService.onSpecForgeStatusChange(projectId, specForgeItemId, newStatus);
    },
    specForgeItemId,
  );
}

/**
 * Links a Command Centre entity to a SpecForge specification item.
 *
 * Validates: Requirements 9.4
 */
export async function linkEntityToSpecForge(
  projectId: string,
  entityType: 'task' | 'procurement_order' | 'activity',
  entityId: string,
  specForgeItemId: string,
  itemTitle: string,
  itemStatus: string,
): Promise<void> {
  await safeIntegrationCall(
    projectId,
    'specForgeSyncService',
    async () => {
      await specForgeSyncService.linkToSpecForgeItem(
        projectId,
        entityType,
        entityId,
        specForgeItemId,
        itemTitle,
        itemStatus,
      );
    },
    entityId,
  );
}

// ── Compliance Finance Integration Wiring ────────────────────────────────────

/**
 * Queues a payment workflow request when a payment certificate is certified.
 * Returns PaymentWorkflowResult with status "pending_approval" or "failed".
 *
 * Validates: Requirements 9.5
 */
export async function onPaymentCertified(
  projectId: string,
  certificateId: string,
  workflowType: 'escrow_release' | 'direct_payment' = 'escrow_release',
): Promise<void> {
  await safeIntegrationCall(
    projectId,
    'complianceFinanceIntegrationService',
    async () => {
      await complianceFinanceIntegrationService.triggerPaymentWorkflow(
        projectId,
        certificateId,
        workflowType,
      );
    },
    certificateId,
  );
}

// ── Service Export ───────────────────────────────────────────────────────────

export const integrationPreservationService = {
  // Core patterns
  safeIntegrationCall,
  determineFinancialHealth,

  // Passport writeback wiring
  onMilestoneStatusChange,
  onBudgetVarianceDetected,

  // Action Centre wiring
  createActionFromSubsystem,

  // SpecForge sync wiring
  onSpecForgeItemStatusChange,
  linkEntityToSpecForge,

  // Compliance Finance wiring
  onPaymentCertified,
};

export default integrationPreservationService;
