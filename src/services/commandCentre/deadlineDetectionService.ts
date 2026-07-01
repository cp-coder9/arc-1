/**
 * Project Command Centre — Deadline Detection Service
 *
 * Pure utility for classifying deadline status across all entity types
 * with deadline fields. Generates appropriate Action Centre events on
 * threshold breach.
 *
 * Entity types handled:
 * - Tasks: overdue when past due date
 * - Milestones: overdue when past planned date
 * - RFIs: escalated when past contractual response period
 * - Deliveries (Procurement): overdue when past expected delivery date
 * - Contracts: flagged when expiry within 30 days
 * - Inspections (Milestones with nhbrc_inspection category): flagged when due within 7 days
 *
 * @module commandCentre/deadlineDetectionService
 */

import type {
  TaskBoardItem,
  CommandCentreMilestone,
  ProcurementOrder,
  ContractItem,
  CommandCentreAction,
  Priority,
} from '@/services/commandCentre/types';

// ── Deadline Status Types ────────────────────────────────────────────────────

export type DeadlineStatusKind =
  | 'overdue'
  | 'escalated'
  | 'expiring_soon'
  | 'due_soon'
  | 'on_track'
  | 'complete';

export interface DeadlineStatus {
  kind: DeadlineStatusKind;
  triggered: boolean;
  daysOverdue?: number;
  daysUntilDeadline?: number;
  description: string;
}

/**
 * RFI entity shape for deadline detection purposes.
 * The command centre RFI types are not yet fully defined in types.ts,
 * so we define the minimal interface needed for deadline classification.
 */
export interface RFIEntity {
  id: string;
  projectId: string;
  rfiNumber: number;
  subject: string;
  addresseeId: string;
  dateRaised: string;
  responseDueDate: string;
  status: 'pending' | 'critical' | 'closed';
}

// ── Entity Type Discriminator ────────────────────────────────────────────────

export type DeadlineEntity =
  | { type: 'task'; entity: TaskBoardItem }
  | { type: 'milestone'; entity: CommandCentreMilestone }
  | { type: 'rfi'; entity: RFIEntity }
  | { type: 'delivery'; entity: ProcurementOrder }
  | { type: 'contract'; entity: ContractItem }
  | { type: 'inspection'; entity: CommandCentreMilestone };

// ── Constants ────────────────────────────────────────────────────────────────

/** Contracts are flagged when expiry is within this many days */
export const CONTRACT_EXPIRY_THRESHOLD_DAYS = 30;

/** Inspections are flagged when due within this many days */
export const INSPECTION_DUE_THRESHOLD_DAYS = 7;

// ── Pure Date Utility ────────────────────────────────────────────────────────

/**
 * Calculates the difference in calendar days between two dates.
 * Returns positive if target is in the future, negative if in the past.
 */
export function daysDifference(targetDate: string, currentDate: Date): number {
  const target = new Date(targetDate + 'T00:00:00.000Z');
  const current = new Date(currentDate.toISOString().split('T')[0] + 'T00:00:00.000Z');
  const diffMs = target.getTime() - current.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

// ── Threshold Check Helpers (per entity type) ────────────────────────────────

/**
 * Checks if a task is overdue (past due date and not done).
 */
export function isTaskOverdue(task: TaskBoardItem, currentDate: Date): boolean {
  if (task.status === 'done') return false;
  const diff = daysDifference(task.dueDate, currentDate);
  return diff < 0;
}

/**
 * Checks if a milestone is overdue (past planned date without completion).
 */
export function isMilestoneOverdue(milestone: CommandCentreMilestone, currentDate: Date): boolean {
  if (milestone.status === 'complete') return false;
  const diff = daysDifference(milestone.plannedDate, currentDate);
  return diff < 0;
}

/**
 * Checks if an RFI has exceeded its contractual response period.
 */
export function isRFIEscalated(rfi: RFIEntity, currentDate: Date): boolean {
  if (rfi.status === 'closed') return false;
  const diff = daysDifference(rfi.responseDueDate, currentDate);
  return diff < 0;
}

/**
 * Checks if a procurement delivery is overdue (past expected delivery date
 * and not yet delivered).
 */
export function isDeliveryOverdue(order: ProcurementOrder, currentDate: Date): boolean {
  if (order.status === 'delivered') return false;
  const diff = daysDifference(order.expectedDeliveryDate, currentDate);
  return diff < 0;
}

/**
 * Checks if a contract is expiring within the threshold (30 days).
 * Only flags active contracts that haven't already expired.
 */
export function isContractExpiringSoon(contract: ContractItem, currentDate: Date): boolean {
  if (contract.status !== 'active') return false;
  const diff = daysDifference(contract.expiryDate, currentDate);
  return diff >= 0 && diff <= CONTRACT_EXPIRY_THRESHOLD_DAYS;
}

/**
 * Checks if an inspection milestone is due within the threshold (7 days).
 * Only flags incomplete inspections that haven't passed yet.
 */
export function isInspectionDueSoon(milestone: CommandCentreMilestone, currentDate: Date): boolean {
  if (milestone.status === 'complete') return false;
  if (milestone.category !== 'nhbrc_inspection') return false;
  const diff = daysDifference(milestone.plannedDate, currentDate);
  return diff >= 0 && diff <= INSPECTION_DUE_THRESHOLD_DAYS;
}

// ── Main Classification Function ─────────────────────────────────────────────

/**
 * Classifies the deadline status of any entity type with a deadline field.
 *
 * Pure function — no side effects, no Firestore access.
 *
 * @param deadlineEntity - Discriminated union of entity type + entity data
 * @param currentDate - The reference date for comparison
 * @returns DeadlineStatus with classification and descriptive message
 */
export function classifyDeadlineStatus(
  deadlineEntity: DeadlineEntity,
  currentDate: Date,
): DeadlineStatus {
  switch (deadlineEntity.type) {
    case 'task':
      return classifyTask(deadlineEntity.entity, currentDate);
    case 'milestone':
      return classifyMilestone(deadlineEntity.entity, currentDate);
    case 'rfi':
      return classifyRFI(deadlineEntity.entity, currentDate);
    case 'delivery':
      return classifyDelivery(deadlineEntity.entity, currentDate);
    case 'contract':
      return classifyContract(deadlineEntity.entity, currentDate);
    case 'inspection':
      return classifyInspection(deadlineEntity.entity, currentDate);
  }
}

// ── Per-Type Classifiers ─────────────────────────────────────────────────────

function classifyTask(task: TaskBoardItem, currentDate: Date): DeadlineStatus {
  if (task.status === 'done') {
    return { kind: 'complete', triggered: false, description: 'Task completed' };
  }

  const diff = daysDifference(task.dueDate, currentDate);

  if (diff < 0) {
    return {
      kind: 'overdue',
      triggered: true,
      daysOverdue: Math.abs(diff),
      description: `Task "${task.title}" is ${Math.abs(diff)} day(s) overdue`,
    };
  }

  return {
    kind: 'on_track',
    triggered: false,
    daysUntilDeadline: diff,
    description: `Task "${task.title}" due in ${diff} day(s)`,
  };
}

function classifyMilestone(milestone: CommandCentreMilestone, currentDate: Date): DeadlineStatus {
  if (milestone.status === 'complete') {
    return { kind: 'complete', triggered: false, description: 'Milestone completed' };
  }

  const diff = daysDifference(milestone.plannedDate, currentDate);

  if (diff < 0) {
    return {
      kind: 'overdue',
      triggered: true,
      daysOverdue: Math.abs(diff),
      description: `Milestone "${milestone.name}" is ${Math.abs(diff)} day(s) overdue`,
    };
  }

  return {
    kind: 'on_track',
    triggered: false,
    daysUntilDeadline: diff,
    description: `Milestone "${milestone.name}" due in ${diff} day(s)`,
  };
}

function classifyRFI(rfi: RFIEntity, currentDate: Date): DeadlineStatus {
  if (rfi.status === 'closed') {
    return { kind: 'complete', triggered: false, description: 'RFI closed' };
  }

  const diff = daysDifference(rfi.responseDueDate, currentDate);

  if (diff < 0) {
    return {
      kind: 'escalated',
      triggered: true,
      daysOverdue: Math.abs(diff),
      description: `RFI #${rfi.rfiNumber} "${rfi.subject}" is ${Math.abs(diff)} day(s) past response deadline — escalate to Critical`,
    };
  }

  return {
    kind: 'on_track',
    triggered: false,
    daysUntilDeadline: diff,
    description: `RFI #${rfi.rfiNumber} response due in ${diff} day(s)`,
  };
}

function classifyDelivery(order: ProcurementOrder, currentDate: Date): DeadlineStatus {
  if (order.status === 'delivered') {
    return { kind: 'complete', triggered: false, description: 'Delivery received' };
  }

  const diff = daysDifference(order.expectedDeliveryDate, currentDate);

  if (diff < 0) {
    return {
      kind: 'overdue',
      triggered: true,
      daysOverdue: Math.abs(diff),
      description: `Delivery for order ${order.orderNumber} is ${Math.abs(diff)} day(s) overdue`,
    };
  }

  return {
    kind: 'on_track',
    triggered: false,
    daysUntilDeadline: diff,
    description: `Delivery for order ${order.orderNumber} expected in ${diff} day(s)`,
  };
}

function classifyContract(contract: ContractItem, currentDate: Date): DeadlineStatus {
  if (contract.status !== 'active') {
    return {
      kind: 'complete',
      triggered: false,
      description: `Contract ${contract.reference} is ${contract.status}`,
    };
  }

  const diff = daysDifference(contract.expiryDate, currentDate);

  if (diff < 0) {
    return {
      kind: 'overdue',
      triggered: true,
      daysOverdue: Math.abs(diff),
      description: `Contract ${contract.reference} expired ${Math.abs(diff)} day(s) ago`,
    };
  }

  if (diff <= CONTRACT_EXPIRY_THRESHOLD_DAYS) {
    return {
      kind: 'expiring_soon',
      triggered: true,
      daysUntilDeadline: diff,
      description: `Contract ${contract.reference} expires in ${diff} day(s) — review and renew`,
    };
  }

  return {
    kind: 'on_track',
    triggered: false,
    daysUntilDeadline: diff,
    description: `Contract ${contract.reference} expires in ${diff} day(s)`,
  };
}

function classifyInspection(milestone: CommandCentreMilestone, currentDate: Date): DeadlineStatus {
  if (milestone.status === 'complete') {
    return { kind: 'complete', triggered: false, description: 'Inspection completed' };
  }

  const diff = daysDifference(milestone.plannedDate, currentDate);

  if (diff < 0) {
    return {
      kind: 'overdue',
      triggered: true,
      daysOverdue: Math.abs(diff),
      description: `Inspection "${milestone.name}" is ${Math.abs(diff)} day(s) overdue`,
    };
  }

  if (diff <= INSPECTION_DUE_THRESHOLD_DAYS) {
    return {
      kind: 'due_soon',
      triggered: true,
      daysUntilDeadline: diff,
      description: `Inspection "${milestone.name}" due in ${diff} day(s) — prepare documentation`,
    };
  }

  return {
    kind: 'on_track',
    triggered: false,
    daysUntilDeadline: diff,
    description: `Inspection "${milestone.name}" due in ${diff} day(s)`,
  };
}

// ── Action Centre Event Generation ───────────────────────────────────────────

/** ID generator for action events */
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Generates an Action Centre event for a triggered deadline.
 * Only generates an event if the deadline status is triggered.
 *
 * @returns CommandCentreAction or null if not triggered
 */
export function generateDeadlineAction(
  deadlineEntity: DeadlineEntity,
  currentDate: Date,
): CommandCentreAction | null {
  const status = classifyDeadlineStatus(deadlineEntity, currentDate);
  if (!status.triggered) return null;

  const now = currentDate.toISOString();

  switch (deadlineEntity.type) {
    case 'task':
      return buildTaskOverdueAction(deadlineEntity.entity, status, now);
    case 'milestone':
      return buildMilestoneOverdueAction(deadlineEntity.entity, status, now);
    case 'rfi':
      return buildRFIEscalationAction(deadlineEntity.entity, status, now);
    case 'delivery':
      return buildDeliveryOverdueAction(deadlineEntity.entity, status, now);
    case 'contract':
      return buildContractExpiryAction(deadlineEntity.entity, status, now);
    case 'inspection':
      return buildInspectionDueAction(deadlineEntity.entity, status, now);
  }
}

function determinePriority(daysOverdueOrRemaining: number, isOverdue: boolean): Priority {
  if (isOverdue) {
    if (daysOverdueOrRemaining > 7) return 'critical';
    if (daysOverdueOrRemaining > 3) return 'high';
    return 'medium';
  }
  // Upcoming
  if (daysOverdueOrRemaining <= 2) return 'high';
  return 'medium';
}

function buildTaskOverdueAction(
  task: TaskBoardItem,
  status: DeadlineStatus,
  now: string,
): CommandCentreAction {
  return {
    id: generateId(),
    projectId: task.projectId,
    type: 'planning',
    title: `Task overdue: "${task.title}"`,
    description: status.description,
    assigneeId: task.assigneeId,
    dueDate: task.dueDate,
    priority: determinePriority(status.daysOverdue ?? 1, true),
    sourceSubsystem: 'tasks',
    sourceEntityId: task.id,
    status: 'pending',
    createdAt: now,
  };
}

function buildMilestoneOverdueAction(
  milestone: CommandCentreMilestone,
  status: DeadlineStatus,
  now: string,
): CommandCentreAction {
  return {
    id: generateId(),
    projectId: milestone.projectId,
    type: 'planning',
    title: `Milestone overdue: "${milestone.name}"`,
    description: status.description,
    assigneeId: milestone.createdBy,
    dueDate: milestone.plannedDate,
    priority: determinePriority(status.daysOverdue ?? 1, true),
    sourceSubsystem: 'milestones',
    sourceEntityId: milestone.id,
    status: 'pending',
    createdAt: now,
  };
}

function buildRFIEscalationAction(
  rfi: RFIEntity,
  status: DeadlineStatus,
  now: string,
): CommandCentreAction {
  return {
    id: generateId(),
    projectId: rfi.projectId,
    type: 'technical',
    title: `RFI #${rfi.rfiNumber} past response deadline — escalate`,
    description: status.description,
    assigneeId: rfi.addresseeId,
    dueDate: rfi.responseDueDate,
    priority: determinePriority(status.daysOverdue ?? 1, true),
    sourceSubsystem: 'rfis',
    sourceEntityId: rfi.id,
    status: 'pending',
    createdAt: now,
  };
}

function buildDeliveryOverdueAction(
  order: ProcurementOrder,
  status: DeadlineStatus,
  now: string,
): CommandCentreAction {
  return {
    id: generateId(),
    projectId: order.projectId,
    type: 'planning',
    title: `Delivery overdue: order ${order.orderNumber}`,
    description: status.description,
    assigneeId: order.createdBy,
    dueDate: order.expectedDeliveryDate,
    priority: determinePriority(status.daysOverdue ?? 1, true),
    sourceSubsystem: 'procurement',
    sourceEntityId: order.id,
    status: 'pending',
    createdAt: now,
  };
}

function buildContractExpiryAction(
  contract: ContractItem,
  status: DeadlineStatus,
  now: string,
): CommandCentreAction {
  return {
    id: generateId(),
    projectId: contract.projectId,
    type: 'financial',
    title: `Contract ${contract.reference} expiring soon`,
    description: status.description,
    assigneeId: contract.createdBy,
    dueDate: contract.expiryDate,
    priority: determinePriority(status.daysUntilDeadline ?? 30, false),
    sourceSubsystem: 'contracts',
    sourceEntityId: contract.id,
    status: 'pending',
    createdAt: now,
  };
}

function buildInspectionDueAction(
  milestone: CommandCentreMilestone,
  status: DeadlineStatus,
  now: string,
): CommandCentreAction {
  const isOverdue = status.kind === 'overdue';
  return {
    id: generateId(),
    projectId: milestone.projectId,
    type: 'technical',
    title: isOverdue
      ? `Inspection overdue: "${milestone.name}"`
      : `Inspection due soon: "${milestone.name}" — prepare documentation`,
    description: status.description,
    assigneeId: milestone.createdBy,
    dueDate: milestone.plannedDate,
    priority: isOverdue
      ? determinePriority(status.daysOverdue ?? 1, true)
      : determinePriority(status.daysUntilDeadline ?? 7, false),
    sourceSubsystem: 'quality',
    sourceEntityId: milestone.id,
    status: 'pending',
    createdAt: now,
  };
}

// ── Batch Processing ─────────────────────────────────────────────────────────

/**
 * Processes a batch of entities and returns all triggered deadline actions.
 * Useful for scheduled checks across all project entities.
 *
 * @param entities - Array of deadline entities to check
 * @param currentDate - The reference date for comparison
 * @returns Array of Action Centre events for all triggered deadlines
 */
export function processDeadlineBatch(
  entities: DeadlineEntity[],
  currentDate: Date,
): CommandCentreAction[] {
  const actions: CommandCentreAction[] = [];

  for (const entity of entities) {
    const action = generateDeadlineAction(entity, currentDate);
    if (action) {
      actions.push(action);
    }
  }

  return actions;
}

// ── Service Export ───────────────────────────────────────────────────────────

export const deadlineDetectionService = {
  classifyDeadlineStatus,
  generateDeadlineAction,
  processDeadlineBatch,
  // Individual threshold check helpers
  isTaskOverdue,
  isMilestoneOverdue,
  isRFIEscalated,
  isDeliveryOverdue,
  isContractExpiringSoon,
  isInspectionDueSoon,
  // Utilities
  daysDifference,
  // Constants
  CONTRACT_EXPIRY_THRESHOLD_DAYS,
  INSPECTION_DUE_THRESHOLD_DAYS,
};

export default deadlineDetectionService;
