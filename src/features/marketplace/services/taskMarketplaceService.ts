/**
 * Task Marketplace Service
 *
 * Handles task posting lifecycle: creation with validation, freelancer application
 * with eligibility checks, and application acceptance with escrow creation.
 * Integrates with the audit trail, Toolbox registry, and Escrow state machine.
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4
 */

import type {
  TaskPosting,
  TaskPostingStatus,
  TaskApplication,
  TaskDeliverable,
  DeliverableFile,
  DeliverableFormat,
  MarketplaceError,
} from '../types';

import { logMarketplaceAction } from './marketplaceAuditService';

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_DELIVERABLE_FORMATS: DeliverableFormat[] = [
  'pdf',
  'image',
  'certificate',
  'datasheet',
  'model',
  'other',
];

const MIN_TITLE_LENGTH = 5;
const MAX_TITLE_LENGTH = 200;
const MIN_DESCRIPTION_LENGTH = 20;
const MAX_DESCRIPTION_LENGTH = 5000;
const MIN_ESTIMATED_HOURS = 0.5;
const MAX_ESTIMATED_HOURS = 200;
const MIN_PAYMENT_AMOUNT = 100.0;
const MAX_PAYMENT_AMOUNT = 999999.99;
const MAX_DEADLINE_DAYS = 365;
const MIN_TRUST_SCORE = 75;
const MAX_SUBMISSIONS = 4; // initial + 3 resubmissions
const DOCUMENT_VAULT_RETRY_HOURS = 24;

// ─── Input Types ──────────────────────────────────────────────────────────────

export interface CreateTaskPostingInput {
  title: string;
  description: string;
  estimatedHours: number;
  paymentAmount: number;
  requiredTools: string[];
  deliverableFormat: string;
  deadline: string; // ISO-8601
}

export interface ValidationResult {
  valid: boolean;
  errors?: Array<{ field: string; message: string }>;
}

export interface FreelancerEligibilityResult {
  eligible: boolean;
  conditions?: string[];
}

// ─── Stub Types ───────────────────────────────────────────────────────────────

export interface ToolValidationResult {
  valid: boolean;
  invalidIds: string[];
}

export interface FreelancerApplicationData {
  trustScore: number;
  verificationStatus: string;
  toolUsageHistory: Record<string, number>; // toolId → completed job count in last 12 months
}

// ─── External Dependency Stubs ────────────────────────────────────────────────

/**
 * Validates that all referenced CalculatorDefinition tool IDs exist in the Toolbox registry.
 * Stub: In production, this queries the Toolbox registry Firestore collection.
 */
export async function validateToolIds(
  toolIds: string[]
): Promise<ToolValidationResult> {
  // Stub implementation — assumes all IDs are valid unless overridden in tests
  return { valid: true, invalidIds: [] };
}

/**
 * Fetches a freelancer's application data for eligibility checking.
 * Returns trust score, verification status, and tool usage history
 * (completed jobs per tool in the last 12 months).
 *
 * Stub: In production, queries freelancer profile, Trust Score Engine,
 * Verification Badge Service, and task completion records.
 */
export async function fetchFreelancerApplicationData(
  freelancerId: string
): Promise<FreelancerApplicationData> {
  // Stub implementation — returns default data unless overridden in tests
  void freelancerId;
  return {
    trustScore: 0,
    verificationStatus: 'unverified',
    toolUsageHistory: {},
  };
}

/**
 * Creates an escrow holding in "funded_held" state for the full task payment amount.
 *
 * Stub: In production, calls the existing escrow state machine
 * (created → funded transition with funding confirmation).
 */
export async function createTaskEscrowHolding(data: {
  taskId: string;
  applicationId: string;
  professionalId: string;
  freelancerId: string;
  paymentAmount: number;
}): Promise<{ escrowId: string }> {
  // Stub implementation — returns a generated escrow ID unless overridden in tests
  void data;
  return { escrowId: `escrow-task-${Date.now()}` };
}

// ─── Pure Validation ──────────────────────────────────────────────────────────

/**
 * Pure validation function for task posting input.
 * Returns { valid: true } or { valid: false, errors: [...] }.
 * No side effects — this is the core validation logic used by createTaskPosting.
 *
 * Validates: Requirement 5.1
 */
export function validateTaskPosting(
  input: CreateTaskPostingInput,
  postingDate?: Date
): ValidationResult {
  const errors: Array<{ field: string; message: string }> = [];
  const now = postingDate || new Date();

  // Title: 5–200 characters
  if (!input.title || input.title.trim().length === 0) {
    errors.push({ field: 'title', message: 'Title is required' });
  } else if (input.title.length < MIN_TITLE_LENGTH) {
    errors.push({ field: 'title', message: `Title must be at least ${MIN_TITLE_LENGTH} characters` });
  } else if (input.title.length > MAX_TITLE_LENGTH) {
    errors.push({ field: 'title', message: `Title must not exceed ${MAX_TITLE_LENGTH} characters` });
  }

  // Description: 20–5000 characters
  if (!input.description || input.description.trim().length === 0) {
    errors.push({ field: 'description', message: 'Description is required' });
  } else if (input.description.length < MIN_DESCRIPTION_LENGTH) {
    errors.push({ field: 'description', message: `Description must be at least ${MIN_DESCRIPTION_LENGTH} characters` });
  } else if (input.description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push({ field: 'description', message: `Description must not exceed ${MAX_DESCRIPTION_LENGTH} characters` });
  }

  // Estimated hours: 0.5–200
  if (input.estimatedHours === undefined || input.estimatedHours === null) {
    errors.push({ field: 'estimatedHours', message: 'Estimated hours is required' });
  } else if (typeof input.estimatedHours !== 'number' || isNaN(input.estimatedHours)) {
    errors.push({ field: 'estimatedHours', message: 'Estimated hours must be a number' });
  } else if (input.estimatedHours < MIN_ESTIMATED_HOURS) {
    errors.push({ field: 'estimatedHours', message: `Estimated hours must be at least ${MIN_ESTIMATED_HOURS}` });
  } else if (input.estimatedHours > MAX_ESTIMATED_HOURS) {
    errors.push({ field: 'estimatedHours', message: `Estimated hours must not exceed ${MAX_ESTIMATED_HOURS}` });
  }

  // Payment amount: ZAR 100.00–999,999.99
  if (input.paymentAmount === undefined || input.paymentAmount === null) {
    errors.push({ field: 'paymentAmount', message: 'Payment amount is required' });
  } else if (typeof input.paymentAmount !== 'number' || isNaN(input.paymentAmount)) {
    errors.push({ field: 'paymentAmount', message: 'Payment amount must be a number' });
  } else if (input.paymentAmount < MIN_PAYMENT_AMOUNT) {
    errors.push({ field: 'paymentAmount', message: `Payment amount must be at least ZAR ${MIN_PAYMENT_AMOUNT.toFixed(2)}` });
  } else if (input.paymentAmount > MAX_PAYMENT_AMOUNT) {
    errors.push({ field: 'paymentAmount', message: `Payment amount must not exceed ZAR ${MAX_PAYMENT_AMOUNT.toFixed(2)}` });
  }

  // Required tools: ≥ 1 CalculatorDefinition IDs
  if (!input.requiredTools || input.requiredTools.length === 0) {
    errors.push({ field: 'requiredTools', message: 'At least one required tool is required' });
  }

  // Deliverable format: one of the allowed set
  if (!input.deliverableFormat) {
    errors.push({ field: 'deliverableFormat', message: 'Deliverable format is required' });
  } else if (!VALID_DELIVERABLE_FORMATS.includes(input.deliverableFormat as DeliverableFormat)) {
    errors.push({
      field: 'deliverableFormat',
      message: `Deliverable format must be one of: ${VALID_DELIVERABLE_FORMATS.join(', ')}`,
    });
  }

  // Deadline: future ISO-8601, max 365 days from posting date
  if (!input.deadline) {
    errors.push({ field: 'deadline', message: 'Deadline is required' });
  } else {
    const deadlineDate = new Date(input.deadline);
    if (isNaN(deadlineDate.getTime())) {
      errors.push({ field: 'deadline', message: 'Deadline must be a valid ISO-8601 datetime' });
    } else {
      const diffMs = deadlineDate.getTime() - now.getTime();
      if (diffMs <= 0) {
        errors.push({ field: 'deadline', message: 'Deadline must be in the future' });
      } else {
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (diffDays > MAX_DEADLINE_DAYS) {
          errors.push({ field: 'deadline', message: `Deadline must be at most ${MAX_DEADLINE_DAYS} days from posting date` });
        }
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}

/**
 * Pure function to check freelancer eligibility for a task application.
 * Returns eligibility result with specific conditions not met.
 *
 * Eligibility requires:
 * - Trust Score ≥ 75
 * - Verification status "verified"
 * - At least 1 completed job using a required tool in prior 12 months
 *
 * Validates: Requirements 5.2, 5.3
 */
export function checkFreelancerEligibility(
  data: FreelancerApplicationData,
  requiredTools: string[]
): FreelancerEligibilityResult {
  const conditions: string[] = [];

  // Trust Score ≥ 75
  if (data.trustScore < MIN_TRUST_SCORE) {
    conditions.push('Trust Score below 75');
  }

  // Verification status "verified"
  if (data.verificationStatus !== 'verified') {
    conditions.push('Verification status is not "verified"');
  }

  // At least 1 completed job using a required tool in prior 12 months
  const hasRequiredToolUsage = requiredTools.some(
    (toolId) => (data.toolUsageHistory[toolId] || 0) >= 1
  );
  if (!hasRequiredToolUsage) {
    conditions.push('No completed job using a required tool in the prior 12 months');
  }

  if (conditions.length > 0) {
    return { eligible: false, conditions };
  }

  return { eligible: true };
}

// ─── ID Generation ────────────────────────────────────────────────────────────

let taskPostingCounter = 0;

function generateTaskPostingId(): string {
  taskPostingCounter += 1;
  return `task-post-${Date.now()}-${taskPostingCounter}`;
}

let applicationCounter = 0;

function generateApplicationId(): string {
  applicationCounter += 1;
  return `task-app-${Date.now()}-${applicationCounter}`;
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Creates a new task posting with full validation.
 *
 * Validates input fields, checks tool ID validity in the Toolbox registry,
 * persists to Firestore, and logs the action to the audit trail.
 *
 * Validates: Requirements 5.1, 10.3, 10.4
 */
export async function createTaskPosting(
  professionalId: string,
  input: CreateTaskPostingInput
): Promise<TaskPosting | MarketplaceError> {
  const now = new Date();

  // 1. Input validation
  const validation = validateTaskPosting(input, now);
  if (!validation.valid) {
    return {
      code: 'VALIDATION_ERROR',
      message: 'Task posting validation failed',
      details: {
        field: validation.errors![0].field,
        reason: validation.errors!.map((e) => `${e.field}: ${e.message}`).join('; '),
      },
    };
  }

  // 2. Validate all tool IDs exist in Toolbox registry
  const toolValidation = await validateToolIds(input.requiredTools);
  if (!toolValidation.valid) {
    return {
      code: 'INVALID_TOOL_IDS',
      message: 'One or more referenced tool IDs do not exist in the Toolbox registry',
      details: {
        reason: `Invalid tool IDs: ${toolValidation.invalidIds.join(', ')}`,
        missingItems: toolValidation.invalidIds,
      },
    };
  }

  // 3. Build the task posting record
  const taskId = generateTaskPostingId();
  const timestamp = now.toISOString();

  const posting: TaskPosting = {
    id: taskId,
    professionalId,
    tenantId: professionalId, // Default tenant scope to posting professional
    title: input.title,
    description: input.description,
    estimatedHours: input.estimatedHours,
    paymentAmount: input.paymentAmount,
    requiredTools: [...input.requiredTools],
    deliverableFormat: input.deliverableFormat as DeliverableFormat,
    deadline: input.deadline,
    status: 'open',
    createdAt: timestamp,
  };

  // 4. Persist to Firestore marketplace_task_postings/{taskId}
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb
      .collection('marketplace_task_postings')
      .doc(taskId)
      .set({
        professionalId: posting.professionalId,
        tenantId: posting.tenantId,
        title: posting.title,
        description: posting.description,
        estimatedHours: posting.estimatedHours,
        paymentAmount: posting.paymentAmount,
        requiredTools: posting.requiredTools,
        deliverableFormat: posting.deliverableFormat,
        deadline: posting.deadline,
        status: posting.status,
        assignedFreelancerId: null,
        createdAt: posting.createdAt,
      });
  } catch (error) {
    console.error('[TaskMarketplace] Failed to persist task posting:', error);
    return {
      code: 'PERSISTENCE_ERROR',
      message: 'Failed to save task posting',
      details: { reason: 'Firestore write failed' },
    };
  }

  // 5. Log action to audit trail
  await logMarketplaceAction({
    actorId: professionalId,
    actionType: 'task_posting_created',
    entityId: taskId,
    entityType: 'task_posting',
    afterStatus: 'open',
    metadata: {
      title: posting.title,
      paymentAmount: posting.paymentAmount,
      estimatedHours: posting.estimatedHours,
      toolCount: posting.requiredTools.length,
      deliverableFormat: posting.deliverableFormat,
    },
  });

  return posting;
}

/**
 * Applies a freelancer to a task posting.
 *
 * Verifies freelancer eligibility:
 * - Trust Score ≥ 75
 * - Verification status "verified"
 * - At least 1 completed job using a required tool in prior 12 months
 *
 * Rejects with specific eligibility condition(s) not met.
 *
 * Validates: Requirements 5.2, 5.3
 */
export async function applyToTask(
  freelancerId: string,
  taskId: string
): Promise<TaskApplication | MarketplaceError> {
  // 1. Fetch the task posting
  let posting: TaskPosting | null = null;
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const doc = await adminDb
      .collection('marketplace_task_postings')
      .doc(taskId)
      .get();

    if (!doc.exists) {
      return {
        code: 'NOT_FOUND',
        message: 'Task posting not found',
        details: { reason: `Task ${taskId} does not exist` },
      };
    }

    const data = doc.data()!;
    posting = {
      id: doc.id,
      professionalId: data.professionalId,
      tenantId: data.tenantId || data.professionalId,
      title: data.title,
      description: data.description,
      estimatedHours: data.estimatedHours,
      paymentAmount: data.paymentAmount,
      requiredTools: data.requiredTools,
      deliverableFormat: data.deliverableFormat as DeliverableFormat,
      deadline: data.deadline,
      status: data.status as TaskPostingStatus,
      assignedFreelancerId: data.assignedFreelancerId || undefined,
      createdAt: data.createdAt,
    };
  } catch (error) {
    console.error('[TaskMarketplace] Failed to fetch task posting:', error);
    return {
      code: 'FETCH_ERROR',
      message: 'Failed to fetch task posting',
      details: { reason: 'Firestore read failed' },
    };
  }

  // 2. Verify task is open (accepting applications)
  if (posting.status !== 'open') {
    return {
      code: 'INVALID_TRANSITION',
      message: 'Cannot apply to a task that is not open',
      details: { reason: `Task status is "${posting.status}", expected "open"` },
    };
  }

  // 3. Fetch freelancer application data
  const appData = await fetchFreelancerApplicationData(freelancerId);

  // 4. Check eligibility
  const eligibility = checkFreelancerEligibility(appData, posting.requiredTools);
  if (!eligibility.eligible) {
    return {
      code: 'APPLICATION_BLOCKED',
      message: 'Freelancer does not meet eligibility requirements',
      details: {
        reason: eligibility.conditions!.join('; '),
        blockers: eligibility.conditions,
      },
    };
  }

  // 5. Build the application record
  const applicationId = generateApplicationId();
  const now = new Date().toISOString();

  const application: TaskApplication = {
    id: applicationId,
    taskId,
    freelancerId,
    trustScore: appData.trustScore,
    verificationStatus: appData.verificationStatus,
    toolUsageHistory: { ...appData.toolUsageHistory },
    status: 'pending',
    createdAt: now,
  };

  // 6. Persist to Firestore marketplace_task_applications/{applicationId}
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb
      .collection('marketplace_task_applications')
      .doc(applicationId)
      .set({
        taskId: application.taskId,
        freelancerId: application.freelancerId,
        trustScore: application.trustScore,
        verificationStatus: application.verificationStatus,
        toolUsageHistory: application.toolUsageHistory,
        status: application.status,
        createdAt: application.createdAt,
      });
  } catch (error) {
    console.error('[TaskMarketplace] Failed to persist application:', error);
    return {
      code: 'PERSISTENCE_ERROR',
      message: 'Failed to save task application',
      details: { reason: 'Firestore write failed' },
    };
  }

  // 7. Log action to audit trail
  await logMarketplaceAction({
    actorId: freelancerId,
    actionType: 'task_application_submitted',
    entityId: applicationId,
    entityType: 'task_application',
    afterStatus: 'pending',
    metadata: {
      taskId,
      trustScore: appData.trustScore,
      verificationStatus: appData.verificationStatus,
    },
  });

  return application;
}

/**
 * Accepts a freelancer's application for a task.
 *
 * Creates an escrow holding in "funded_held" state for the full payment amount,
 * transitions the task to "in_progress", and records an audit trail entry.
 *
 * Validates: Requirement 5.4
 */
export async function acceptApplication(
  professionalId: string,
  taskId: string,
  applicationId: string
): Promise<{ task: TaskPosting; application: TaskApplication; escrowId: string } | MarketplaceError> {
  // 1. Fetch the task posting
  let posting: TaskPosting | null = null;
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const doc = await adminDb
      .collection('marketplace_task_postings')
      .doc(taskId)
      .get();

    if (!doc.exists) {
      return {
        code: 'NOT_FOUND',
        message: 'Task posting not found',
        details: { reason: `Task ${taskId} does not exist` },
      };
    }

    const data = doc.data()!;
    posting = {
      id: doc.id,
      professionalId: data.professionalId,
      tenantId: data.tenantId || data.professionalId,
      title: data.title,
      description: data.description,
      estimatedHours: data.estimatedHours,
      paymentAmount: data.paymentAmount,
      requiredTools: data.requiredTools,
      deliverableFormat: data.deliverableFormat as DeliverableFormat,
      deadline: data.deadline,
      status: data.status as TaskPostingStatus,
      assignedFreelancerId: data.assignedFreelancerId || undefined,
      createdAt: data.createdAt,
    };
  } catch (error) {
    console.error('[TaskMarketplace] Failed to fetch task posting:', error);
    return {
      code: 'FETCH_ERROR',
      message: 'Failed to fetch task posting',
      details: { reason: 'Firestore read failed' },
    };
  }

  // 2. Verify the professional owns this task
  if (posting.professionalId !== professionalId) {
    return {
      code: 'ACCESS_DENIED',
      message: 'Only the task owner can accept applications',
      details: { reason: 'Professional ID does not match task owner' },
    };
  }

  // 3. Verify task is open
  if (posting.status !== 'open') {
    return {
      code: 'INVALID_TRANSITION',
      message: 'Cannot accept applications for a task that is not open',
      details: { reason: `Task status is "${posting.status}", expected "open"` },
    };
  }

  // 4. Fetch the application
  let application: TaskApplication | null = null;
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const doc = await adminDb
      .collection('marketplace_task_applications')
      .doc(applicationId)
      .get();

    if (!doc.exists) {
      return {
        code: 'NOT_FOUND',
        message: 'Task application not found',
        details: { reason: `Application ${applicationId} does not exist` },
      };
    }

    const data = doc.data()!;
    application = {
      id: doc.id,
      taskId: data.taskId,
      freelancerId: data.freelancerId,
      trustScore: data.trustScore,
      verificationStatus: data.verificationStatus,
      toolUsageHistory: data.toolUsageHistory,
      status: data.status,
      createdAt: data.createdAt,
    };
  } catch (error) {
    console.error('[TaskMarketplace] Failed to fetch application:', error);
    return {
      code: 'FETCH_ERROR',
      message: 'Failed to fetch task application',
      details: { reason: 'Firestore read failed' },
    };
  }

  // 5. Verify application belongs to this task
  if (application.taskId !== taskId) {
    return {
      code: 'INVALID_APPLICATION',
      message: 'Application does not belong to this task',
      details: { reason: `Application ${applicationId} is for a different task` },
    };
  }

  // 6. Verify application is pending
  if (application.status !== 'pending') {
    return {
      code: 'INVALID_TRANSITION',
      message: 'Can only accept pending applications',
      details: { reason: `Application status is "${application.status}", expected "pending"` },
    };
  }

  // 7. Create escrow holding in "funded_held" state
  let escrowResult: { escrowId: string };
  try {
    escrowResult = await createTaskEscrowHolding({
      taskId,
      applicationId,
      professionalId,
      freelancerId: application.freelancerId,
      paymentAmount: posting.paymentAmount,
    });
  } catch (error) {
    console.error('[TaskMarketplace] Failed to create escrow holding:', error);
    return {
      code: 'ESCROW_ERROR',
      message: 'Failed to create escrow holding for task payment',
      details: { reason: 'Escrow creation failed' },
    };
  }

  // 8. Transition task to "in_progress" and assign freelancer
  const now = new Date().toISOString();
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb
      .collection('marketplace_task_postings')
      .doc(taskId)
      .update({
        status: 'in_progress',
        assignedFreelancerId: application.freelancerId,
        updatedAt: now,
      });
  } catch (error) {
    console.error('[TaskMarketplace] Failed to update task status:', error);
    return {
      code: 'PERSISTENCE_ERROR',
      message: 'Failed to update task status',
      details: { reason: 'Firestore write failed' },
    };
  }

  // 9. Update application status to "accepted"
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb
      .collection('marketplace_task_applications')
      .doc(applicationId)
      .update({
        status: 'accepted',
        updatedAt: now,
      });
  } catch (error) {
    console.error('[TaskMarketplace] Failed to update application status:', error);
    // Non-fatal: task is already in_progress, application status is best-effort
  }

  // 10. Record audit trail entry
  await logMarketplaceAction({
    actorId: professionalId,
    actionType: 'task_application_accepted',
    entityId: applicationId,
    entityType: 'task_application',
    beforeStatus: 'pending',
    afterStatus: 'accepted',
    metadata: {
      taskId,
      freelancerId: application.freelancerId,
      paymentAmount: posting.paymentAmount,
      escrowId: escrowResult.escrowId,
    },
  });

  // Return updated state
  const updatedTask: TaskPosting = {
    ...posting,
    status: 'in_progress',
    assignedFreelancerId: application.freelancerId,
  };

  const updatedApplication: TaskApplication = {
    ...application,
    status: 'accepted',
  };

  return {
    task: updatedTask,
    application: updatedApplication,
    escrowId: escrowResult.escrowId,
  };
}
// ─── Delivery & Sign-off Stubs ────────────────────────────────────────────────

/**
 * Routes a deliverable to the AI Review Queue for compliance checking.
 * Stub: In production, this publishes to the AI review pipeline.
 */
export async function routeToAiReview(
  _deliverableId: string,
  _files: DeliverableFile[]
): Promise<void> {
  // Stub — no-op in development
}

/**
 * Notifies a user via the Action Centre.
 * Stub: In production, this creates an inbox notification.
 */
export async function notifyUser(
  _userId: string,
  _notification: { type: string; message: string; entityId?: string }
): Promise<void> {
  // Stub — no-op in development
}

/**
 * Stores deliverable files in the project document vault via Documents service.
 * Returns { stored: true } on success, or { stored: false, queued: true } if
 * the service is unavailable and files are queued for retry (up to 24 hours).
 *
 * Stub: In production, integrates with the Documents service.
 */
export async function storeInDocumentVault(
  _taskId: string,
  _files: DeliverableFile[]
): Promise<{ stored: boolean; queued?: boolean }> {
  // Stub — assumes storage succeeds unless overridden in tests
  return { stored: true };
}

/**
 * Triggers escrow release for a completed task within 48 hours.
 * Stub: In production, this integrates with the Escrow Service state machine.
 */
export async function triggerEscrowRelease(
  _taskId: string,
  _freelancerId: string
): Promise<void> {
  // Stub — no-op in development
}

// ─── Deliverable ID Generation ────────────────────────────────────────────────

let deliverableCounter = 0;

function generateDeliverableId(): string {
  deliverableCounter += 1;
  return `task-del-${Date.now()}-${deliverableCounter}`;
}

// ─── Helper: Fetch Task Posting ───────────────────────────────────────────────

async function fetchTaskPostingById(
  taskId: string
): Promise<TaskPosting | MarketplaceError> {
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const doc = await adminDb
      .collection('marketplace_task_postings')
      .doc(taskId)
      .get();

    if (!doc.exists) {
      return {
        code: 'NOT_FOUND',
        message: 'Task posting not found',
        details: { reason: `Task posting ${taskId} does not exist` },
      };
    }

    const data = doc.data()!;
    return {
      id: doc.id,
      professionalId: data.professionalId,
      tenantId: data.tenantId || data.professionalId,
      title: data.title,
      description: data.description,
      estimatedHours: data.estimatedHours,
      paymentAmount: data.paymentAmount,
      requiredTools: data.requiredTools,
      deliverableFormat: data.deliverableFormat as DeliverableFormat,
      deadline: data.deadline,
      status: data.status as TaskPostingStatus,
      assignedFreelancerId: data.assignedFreelancerId || undefined,
      createdAt: data.createdAt,
    };
  } catch (error) {
    console.error('[TaskMarketplace] Failed to fetch task posting:', error);
    return {
      code: 'FETCH_ERROR',
      message: 'Failed to fetch task posting',
      details: { reason: 'Firestore read failed' },
    };
  }
}

function isMarketplaceError(value: unknown): value is MarketplaceError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value
  );
}

// ─── Delivery & Sign-off Service Functions ────────────────────────────────────

/**
 * Submits a deliverable for a task.
 *
 * Validates at least one file matches the task's deliverable format,
 * routes to AI Review Queue, notifies the Professional, stores in
 * document vault (handles unavailability with retry queue), and persists.
 *
 * Validates: Requirements 5.5, 10.7, 10.8
 */
export async function submitDeliverable(
  taskId: string,
  freelancerId: string,
  files: DeliverableFile[]
): Promise<TaskDeliverable | MarketplaceError> {
  // 1. Fetch the task posting
  const taskResult = await fetchTaskPostingById(taskId);
  if (isMarketplaceError(taskResult)) {
    return taskResult;
  }
  const taskPosting = taskResult;

  // 2. Verify task is in_progress
  if (taskPosting.status !== 'in_progress') {
    return {
      code: 'INVALID_TRANSITION',
      message: 'Task is not in progress; deliverables cannot be submitted',
      details: {
        reason: `Task status is "${taskPosting.status}", expected "in_progress"`,
      },
    };
  }

  // 3. Verify the freelancer is the assigned one
  if (taskPosting.assignedFreelancerId !== freelancerId) {
    return {
      code: 'ACCESS_DENIED',
      message: 'Only the assigned freelancer can submit deliverables',
      details: { reason: 'Freelancer ID does not match assigned freelancer' },
    };
  }

  // 4. Validate at least one file matches the deliverable format
  const hasMatchingFormat = files.some(
    (file) => file.format === taskPosting.deliverableFormat
  );
  if (!hasMatchingFormat) {
    return {
      code: 'VALIDATION_ERROR',
      message: `At least one file must match the required deliverable format: ${taskPosting.deliverableFormat}`,
      details: {
        field: 'files',
        reason: `No file matches required format "${taskPosting.deliverableFormat}"`,
      },
    };
  }

  // 5. Determine submission number from existing deliverables
  let submissionNumber = 1;
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const existing = await adminDb
      .collection('marketplace_task_deliverables')
      .where('taskId', '==', taskId)
      .where('freelancerId', '==', freelancerId)
      .get();
    submissionNumber = existing.size + 1;
  } catch (error) {
    console.error('[TaskMarketplace] Failed to count existing deliverables:', error);
  }

  // 6. Check submission limit (max 4: initial + 3 resubmissions)
  if (submissionNumber > MAX_SUBMISSIONS) {
    return {
      code: 'SUBMISSION_LIMIT_EXCEEDED',
      message: 'Maximum number of submissions (4) has been reached',
      details: {
        reason: `Submission ${submissionNumber} exceeds max of ${MAX_SUBMISSIONS}`,
      },
    };
  }

  // 7. Check deadline hasn't passed
  const deadlineDate = new Date(taskPosting.deadline);
  if (deadlineDate.getTime() <= Date.now()) {
    return {
      code: 'DEADLINE_PASSED',
      message: 'Task deadline has passed; deliverables can no longer be submitted',
      details: { reason: `Deadline was ${taskPosting.deadline}` },
    };
  }

  // 8. Build the deliverable record
  const deliverableId = generateDeliverableId();
  const now = new Date().toISOString();

  const deliverable: TaskDeliverable = {
    id: deliverableId,
    taskId,
    freelancerId,
    files: [...files],
    submissionNumber,
    aiReviewStatus: 'pending',
    professionalSignOff: false,
    submittedAt: now,
  };

  // 9. Persist to Firestore marketplace_task_deliverables/{deliverableId}
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb
      .collection('marketplace_task_deliverables')
      .doc(deliverableId)
      .set({
        taskId: deliverable.taskId,
        freelancerId: deliverable.freelancerId,
        files: deliverable.files,
        submissionNumber: deliverable.submissionNumber,
        aiReviewStatus: deliverable.aiReviewStatus,
        professionalSignOff: deliverable.professionalSignOff,
        submittedAt: deliverable.submittedAt,
      });
  } catch (error) {
    console.error('[TaskMarketplace] Failed to persist deliverable:', error);
    return {
      code: 'PERSISTENCE_ERROR',
      message: 'Failed to save deliverable',
      details: { reason: 'Firestore write failed' },
    };
  }

  // 10. Update task status to 'delivered'
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb
      .collection('marketplace_task_postings')
      .doc(taskId)
      .update({ status: 'delivered', updatedAt: now });
  } catch (error) {
    console.error('[TaskMarketplace] Failed to update task to delivered:', error);
  }

  // 11. Route to AI Review Queue
  await routeToAiReview(deliverableId, files);

  // 12. Notify Professional of submission
  await notifyUser(taskPosting.professionalId, {
    type: 'deliverable_submitted',
    message: `Deliverable submitted for task "${taskPosting.title}" (submission #${submissionNumber})`,
    entityId: deliverableId,
  });

  // 13. Store in document vault; handle unavailability with retry queue
  try {
    const vaultResult = await storeInDocumentVault(taskId, files);
    if (!vaultResult.stored && vaultResult.queued) {
      await notifyUser(freelancerId, {
        type: 'document_storage_delayed',
        message: `Document storage is delayed. Files will be stored within ${DOCUMENT_VAULT_RETRY_HOURS} hours.`,
        entityId: deliverableId,
      });
    }
  } catch (_vaultError) {
    // Documents service unavailable — notify user of delay
    await notifyUser(freelancerId, {
      type: 'document_storage_delayed',
      message: `Document storage is delayed. Files will be stored within ${DOCUMENT_VAULT_RETRY_HOURS} hours.`,
      entityId: deliverableId,
    });
  }

  // 14. Log action to audit trail
  await logMarketplaceAction({
    actorId: freelancerId,
    actionType: 'task_deliverable_submitted',
    entityId: deliverableId,
    entityType: 'task_deliverable',
    afterStatus: 'pending',
    metadata: {
      taskId,
      submissionNumber,
      fileCount: files.length,
      deliverableFormat: taskPosting.deliverableFormat,
    },
  });

  return deliverable;
}

/**
 * Professional signs off on a delivered task.
 *
 * When Professional signs off AND AI Review has passed, triggers escrow release
 * within 48 hours and transitions the task to "completed".
 *
 * Validates: Requirement 5.6
 */
export async function signOffDeliverable(
  taskId: string,
  deliverableId: string,
  professionalId: string
): Promise<TaskDeliverable | MarketplaceError> {
  // 1. Fetch the task posting
  const taskResult = await fetchTaskPostingById(taskId);
  if (isMarketplaceError(taskResult)) {
    return taskResult;
  }
  const taskPosting = taskResult;

  // 2. Verify the professional owns the task
  if (taskPosting.professionalId !== professionalId) {
    return {
      code: 'ACCESS_DENIED',
      message: 'Only the task posting owner can sign off on deliverables',
      details: { reason: 'Professional ID does not match task posting owner' },
    };
  }

  // 3. Fetch the deliverable
  let deliverable: TaskDeliverable;
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const doc = await adminDb
      .collection('marketplace_task_deliverables')
      .doc(deliverableId)
      .get();

    if (!doc.exists) {
      return {
        code: 'NOT_FOUND',
        message: 'Deliverable not found',
        details: { reason: `Deliverable ${deliverableId} does not exist` },
      };
    }

    const data = doc.data()!;
    deliverable = {
      id: doc.id,
      taskId: data.taskId,
      freelancerId: data.freelancerId,
      files: data.files,
      submissionNumber: data.submissionNumber,
      aiReviewStatus: data.aiReviewStatus,
      aiReviewReasons: data.aiReviewReasons,
      professionalSignOff: data.professionalSignOff,
      submittedAt: data.submittedAt,
    };
  } catch (error) {
    console.error('[TaskMarketplace] Failed to fetch deliverable:', error);
    return {
      code: 'FETCH_ERROR',
      message: 'Failed to fetch deliverable',
      details: { reason: 'Firestore read failed' },
    };
  }

  // 4. Verify deliverable belongs to this task
  if (deliverable.taskId !== taskId) {
    return {
      code: 'INVALID_DELIVERABLE',
      message: 'Deliverable does not belong to this task',
      details: {
        reason: `Deliverable task ID "${deliverable.taskId}" does not match "${taskId}"`,
      },
    };
  }

  // 5. Update professional sign-off
  const now = new Date().toISOString();
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb
      .collection('marketplace_task_deliverables')
      .doc(deliverableId)
      .update({ professionalSignOff: true, signedOffAt: now });
  } catch (error) {
    console.error('[TaskMarketplace] Failed to update sign-off:', error);
    return {
      code: 'PERSISTENCE_ERROR',
      message: 'Failed to record sign-off',
      details: { reason: 'Firestore write failed' },
    };
  }

  deliverable.professionalSignOff = true;

  // 6. If AI Review already passed, trigger escrow release and complete task
  if (deliverable.aiReviewStatus === 'passed') {
    await triggerEscrowRelease(taskId, deliverable.freelancerId);

    try {
      const { adminDb } = await import('@/lib/firebase-admin');
      await adminDb
        .collection('marketplace_task_postings')
        .doc(taskId)
        .update({ status: 'completed', updatedAt: now });
    } catch (error) {
      console.error('[TaskMarketplace] Failed to complete task:', error);
    }
  }

  // 7. Log action to audit trail
  await logMarketplaceAction({
    actorId: professionalId,
    actionType: 'task_deliverable_signed_off',
    entityId: deliverableId,
    entityType: 'task_deliverable',
    beforeStatus: 'delivered',
    afterStatus: deliverable.aiReviewStatus === 'passed' ? 'completed' : 'delivered',
    metadata: {
      taskId,
      aiReviewStatus: deliverable.aiReviewStatus,
      escrowReleaseTriggered: deliverable.aiReviewStatus === 'passed',
    },
  });

  return deliverable;
}

/**
 * Handles an AI Review callback result for a deliverable.
 *
 * - "passed": marks aiReviewStatus as 'passed', notifies Professional for sign-off.
 *   If Professional already signed off, triggers escrow release and completes task.
 * - "rejected": transitions deliverable to "rejected", allows up to 3 resubmissions
 *   before deadline. If exhausted or deadline passed, fails the task.
 *
 * Validates: Requirements 5.6, 5.7, 5.8
 */
export async function handleAiReviewResult(
  deliverableId: string,
  status: 'passed' | 'rejected',
  reasons?: string[]
): Promise<TaskDeliverable | MarketplaceError> {
  // 1. Fetch the deliverable
  let deliverable: TaskDeliverable;
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const doc = await adminDb
      .collection('marketplace_task_deliverables')
      .doc(deliverableId)
      .get();

    if (!doc.exists) {
      return {
        code: 'NOT_FOUND',
        message: 'Deliverable not found',
        details: { reason: `Deliverable ${deliverableId} does not exist` },
      };
    }

    const data = doc.data()!;
    deliverable = {
      id: doc.id,
      taskId: data.taskId,
      freelancerId: data.freelancerId,
      files: data.files,
      submissionNumber: data.submissionNumber,
      aiReviewStatus: data.aiReviewStatus,
      aiReviewReasons: data.aiReviewReasons,
      professionalSignOff: data.professionalSignOff,
      submittedAt: data.submittedAt,
    };
  } catch (error) {
    console.error('[TaskMarketplace] Failed to fetch deliverable:', error);
    return {
      code: 'FETCH_ERROR',
      message: 'Failed to fetch deliverable',
      details: { reason: 'Firestore read failed' },
    };
  }

  // 2. Fetch the task posting for context
  const taskResult = await fetchTaskPostingById(deliverable.taskId);
  if (isMarketplaceError(taskResult)) {
    return taskResult;
  }
  const taskPosting = taskResult;
  const now = new Date().toISOString();

  if (status === 'passed') {
    // 3a. Mark deliverable as passed
    try {
      const { adminDb } = await import('@/lib/firebase-admin');
      await adminDb
        .collection('marketplace_task_deliverables')
        .doc(deliverableId)
        .update({ aiReviewStatus: 'passed' });
    } catch (error) {
      console.error('[TaskMarketplace] Failed to update AI review status:', error);
      return {
        code: 'PERSISTENCE_ERROR',
        message: 'Failed to update AI review status',
        details: { reason: 'Firestore write failed' },
      };
    }

    deliverable.aiReviewStatus = 'passed';

    // If Professional already signed off, trigger escrow release and complete
    if (deliverable.professionalSignOff) {
      await triggerEscrowRelease(deliverable.taskId, deliverable.freelancerId);

      try {
        const { adminDb } = await import('@/lib/firebase-admin');
        await adminDb
          .collection('marketplace_task_postings')
          .doc(deliverable.taskId)
          .update({ status: 'completed', updatedAt: now });
      } catch (error) {
        console.error('[TaskMarketplace] Failed to complete task:', error);
      }
    } else {
      // Notify Professional for sign-off
      await notifyUser(taskPosting.professionalId, {
        type: 'deliverable_ai_review_passed',
        message: `AI Review passed for "${taskPosting.title}". Please sign off.`,
        entityId: deliverableId,
      });
    }
  } else {
    // 3b. status === 'rejected'
    try {
      const { adminDb } = await import('@/lib/firebase-admin');
      await adminDb
        .collection('marketplace_task_deliverables')
        .doc(deliverableId)
        .update({ aiReviewStatus: 'rejected', aiReviewReasons: reasons || [] });
    } catch (error) {
      console.error('[TaskMarketplace] Failed to update AI review rejection:', error);
      return {
        code: 'PERSISTENCE_ERROR',
        message: 'Failed to update AI review rejection',
        details: { reason: 'Firestore write failed' },
      };
    }

    deliverable.aiReviewStatus = 'rejected';
    deliverable.aiReviewReasons = reasons;

    // Check if submissions exhausted or deadline passed
    const deadlinePassed = new Date(taskPosting.deadline).getTime() <= Date.now();
    const submissionsExhausted = deliverable.submissionNumber >= MAX_SUBMISSIONS;

    if (submissionsExhausted || deadlinePassed) {
      // Transition task to "failed", notify Professional, retain escrow
      try {
        const { adminDb } = await import('@/lib/firebase-admin');
        await adminDb
          .collection('marketplace_task_postings')
          .doc(deliverable.taskId)
          .update({ status: 'failed', updatedAt: now });
      } catch (error) {
        console.error('[TaskMarketplace] Failed to transition task to failed:', error);
      }

      await notifyUser(taskPosting.professionalId, {
        type: 'task_failed',
        message: submissionsExhausted
          ? `Task "${taskPosting.title}" failed: all resubmission attempts exhausted.`
          : `Task "${taskPosting.title}" failed: deadline passed without approved deliverable.`,
        entityId: deliverable.taskId,
      });
    } else {
      // Notify freelancer of rejection with reasons, allow resubmission
      await notifyUser(deliverable.freelancerId, {
        type: 'deliverable_rejected',
        message: `Your deliverable for "${taskPosting.title}" was rejected. ${MAX_SUBMISSIONS - deliverable.submissionNumber} resubmission(s) remaining.`,
        entityId: deliverableId,
      });
    }
  }

  // 4. Log action to audit trail
  await logMarketplaceAction({
    actorId: 'system',
    actionType: `ai_review_${status}`,
    entityId: deliverableId,
    entityType: 'task_deliverable',
    beforeStatus: 'pending',
    afterStatus: status,
    metadata: {
      taskId: deliverable.taskId,
      submissionNumber: deliverable.submissionNumber,
      ...(reasons && { reasons }),
    },
  });

  return deliverable;
}

/**
 * Checks whether a task's deadline has passed without an approved deliverable.
 *
 * If deadline passed without an approved deliverable, transitions task to "failed"
 * and notifies the Professional.
 *
 * Validates: Requirement 5.8
 */
export async function checkTaskDeadline(
  taskId: string
): Promise<{ status: 'ok' | 'failed'; reason?: string } | MarketplaceError> {
  // 1. Fetch the task posting
  const taskResult = await fetchTaskPostingById(taskId);
  if (isMarketplaceError(taskResult)) {
    return taskResult;
  }
  const taskPosting = taskResult;

  // 2. Only check tasks that are in_progress or delivered
  if (taskPosting.status !== 'in_progress' && taskPosting.status !== 'delivered') {
    return {
      status: 'ok',
      reason: `Task status is "${taskPosting.status}", no deadline check needed`,
    };
  }

  // 3. Check if deadline has passed
  const deadlineDate = new Date(taskPosting.deadline);
  if (deadlineDate.getTime() > Date.now()) {
    return { status: 'ok', reason: 'Deadline has not passed yet' };
  }

  // 4. Check if any deliverable has been approved
  let hasApprovedDeliverable = false;
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const snapshot = await adminDb
      .collection('marketplace_task_deliverables')
      .where('taskId', '==', taskId)
      .where('aiReviewStatus', '==', 'passed')
      .limit(1)
      .get();
    hasApprovedDeliverable = !snapshot.empty;
  } catch (error) {
    console.error('[TaskMarketplace] Failed to check deliverables:', error);
  }

  if (hasApprovedDeliverable) {
    return { status: 'ok', reason: 'Task has an approved deliverable' };
  }

  // 5. Deadline passed without approved deliverable — transition to "failed"
  const now = new Date().toISOString();
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb
      .collection('marketplace_task_postings')
      .doc(taskId)
      .update({ status: 'failed', updatedAt: now });
  } catch (error) {
    console.error('[TaskMarketplace] Failed to transition task to failed:', error);
    return {
      code: 'PERSISTENCE_ERROR',
      message: 'Failed to update task status',
      details: { reason: 'Firestore write failed' },
    };
  }

  // 6. Notify Professional
  await notifyUser(taskPosting.professionalId, {
    type: 'task_deadline_failed',
    message: `Task "${taskPosting.title}" failed: deadline passed without approved deliverable.`,
    entityId: taskId,
  });

  // 7. Log action to audit trail
  await logMarketplaceAction({
    actorId: 'system',
    actionType: 'task_deadline_failed',
    entityId: taskId,
    entityType: 'task_posting',
    beforeStatus: taskPosting.status,
    afterStatus: 'failed',
    metadata: {
      deadline: taskPosting.deadline,
      professionalId: taskPosting.professionalId,
    },
  });

  return { status: 'failed', reason: 'Deadline passed without approved deliverable' };
}
