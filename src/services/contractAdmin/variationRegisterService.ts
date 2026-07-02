/**
 * Contract Administration — Variation Register Service
 *
 * Manages the full lifecycle of variation orders:
 * creation, valuation, state transitions, cumulative summaries,
 * and SpecForge linkage.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9
 */

import type {
  VariationInput,
  VariationRecord,
  VariationStatus,
  VariationCumulativeSummary,
  ContractAuditRecord,
  ContractProjectAssignment,
  ContractError,
  SpecForgeChangeRecord,
} from './contractTypes';
import { VARIATION_TRANSITIONS } from './contractTypes';
import { assertAccess } from './contractRbacService';
import {
  writeToAuditTrail,
  writeToSpecForge,
} from './contractIntegrationService';
import { adminDb } from '@/lib/firebase-admin';

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

/** Get current ISO timestamp */
function nowIso(): string {
  return new Date().toISOString();
}

/** Generate a unique ID */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// Public API
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Determine whether a variation status transition is valid.
 *
 * Pure function using the VARIATION_TRANSITIONS map.
 *
 * @param from - Current variation status
 * @param to - Target variation status
 * @returns true if the transition is permitted
 */
export function isValidVariationTransition(
  from: VariationStatus,
  to: VariationStatus
): boolean {
  const permitted = VARIATION_TRANSITIONS[from];
  if (!permitted) return false;
  return permitted.includes(to);
}

/**
 * Create a new variation order.
 *
 * Validates mandatory fields (variationNumber, description, dateInstructed),
 * checks uniqueness of the variation number within the project, persists the
 * record, and creates an audit record.
 *
 * @param input - The variation creation input
 * @param projectAssignment - The creator's project assignment (for RBAC)
 * @returns Object containing the variation record and audit record
 */
export async function createVariation(
  input: VariationInput,
  projectAssignment: ContractProjectAssignment
): Promise<{
  variation: VariationRecord;
  auditRecord: ContractAuditRecord;
}> {
  // RBAC check — requires write access to variations
  assertAccess(
    projectAssignment.roles,
    'variations',
    'write',
    projectAssignment
  );

  // Validate mandatory fields (Requirement 5.2)
  const invalidFields: string[] = [];

  if (!input.projectId) invalidFields.push('projectId');
  if (!input.variationNumber || input.variationNumber.trim().length === 0) {
    invalidFields.push('variationNumber');
  }
  if (!input.description || input.description.trim().length === 0) {
    invalidFields.push('description');
  }
  if (input.description && input.description.length > 2000) {
    invalidFields.push('description');
  }
  if (!input.dateInstructed || input.dateInstructed.trim().length === 0) {
    invalidFields.push('dateInstructed');
  }
  if (!input.createdBy) invalidFields.push('createdBy');

  if (invalidFields.length > 0) {
    const error: ContractError = {
      code: 'VALIDATION_ERROR',
      message: 'Variation creation failed: mandatory fields missing or invalid.',
      details: { invalidFields },
    };
    throw error;
  }

  // Check uniqueness of variation number within project
  const existingSnapshot = await adminDb
    .collection(`projects/${input.projectId}/contractVariations`)
    .where('variationNumber', '==', input.variationNumber)
    .limit(1)
    .get();

  if (!existingSnapshot.empty) {
    const error: ContractError = {
      code: 'VALIDATION_ERROR',
      message: `Variation number '${input.variationNumber}' already exists in this project.`,
      details: { invalidFields: ['variationNumber'] },
    };
    throw error;
  }

  // Build variation record
  const variationId = generateId();
  const now = nowIso();

  const variation: VariationRecord = {
    id: variationId,
    projectId: input.projectId,
    variationNumber: input.variationNumber,
    description: input.description,
    originatingInstruction: input.originatingInstruction || '',
    dateInstructed: input.dateInstructed,
    linkedSiteInstructionId: input.linkedSiteInstructionId,
    linkedRfiId: input.linkedRfiId,
    status: 'instructed',
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  // Persist to Firestore
  await adminDb
    .collection(`projects/${input.projectId}/contractVariations`)
    .doc(variationId)
    .set(variation);

  // Create audit record (Requirement 5.8) via integration service
  const auditId = generateId();
  const auditRecord: ContractAuditRecord = {
    id: auditId,
    projectId: input.projectId,
    entityType: 'variation',
    entityId: variationId,
    action: 'variation_created',
    newValue: {
      variationNumber: input.variationNumber,
      description: input.description,
      dateInstructed: input.dateInstructed,
      status: 'instructed',
    },
    actorId: input.createdBy,
    timestamp: now,
  };

  await writeToAuditTrail(input.projectId, auditRecord);

  return { variation, auditRecord };
}

/**
 * Transition a variation to a new status.
 *
 * Reads the current status, validates the transition against the state machine,
 * persists the new status, and creates an audit record.
 *
 * @param projectId - The project identifier
 * @param variationId - The variation identifier
 * @param toStatus - The target status
 * @param actorId - The user performing the transition
 * @param projectAssignment - The actor's project assignment (for RBAC)
 * @returns Object containing the audit record
 */
export async function transitionVariation(
  projectId: string,
  variationId: string,
  toStatus: VariationStatus,
  actorId: string,
  projectAssignment: ContractProjectAssignment
): Promise<{ auditRecord: ContractAuditRecord }> {
  // RBAC check
  assertAccess(
    projectAssignment.roles,
    'variations',
    'write',
    projectAssignment
  );

  // Read current variation
  const variationRef = adminDb
    .collection(`projects/${projectId}/contractVariations`)
    .doc(variationId);
  const doc = await variationRef.get();

  if (!doc.exists) {
    const error: ContractError = {
      code: 'VALIDATION_ERROR',
      message: `Variation ${variationId} not found.`,
      details: { invalidFields: ['variationId'] },
    };
    throw error;
  }

  const variation = doc.data() as VariationRecord;
  const fromStatus = variation.status;

  // Validate transition (Requirement 5.3)
  if (!isValidVariationTransition(fromStatus, toStatus)) {
    const error: ContractError = {
      code: 'INVALID_TRANSITION',
      message: `Cannot transition variation from '${fromStatus}' to '${toStatus}'.`,
      details: {
        currentStatus: fromStatus,
        attemptedStatus: toStatus,
        permittedTransitions: VARIATION_TRANSITIONS[fromStatus],
      },
    };
    throw error;
  }

  // Persist new status
  const now = nowIso();
  await variationRef.update({
    status: toStatus,
    updatedAt: now,
  });

  // Create audit record (Requirement 5.8) via integration service
  const auditId = generateId();
  const auditRecord: ContractAuditRecord = {
    id: auditId,
    projectId,
    entityType: 'variation',
    entityId: variationId,
    action: `variation_transitioned_to_${toStatus}`,
    previousValue: { status: fromStatus },
    newValue: { status: toStatus },
    actorId,
    timestamp: now,
  };

  await writeToAuditTrail(projectId, auditRecord);

  // On approval, write to SpecForge (Requirement 10.3)
  if (toStatus === 'approved' && variation.linkedSpecForgeItemId) {
    await writeToSpecForge(projectId, {
      variationId,
      variationNumber: variation.variationNumber,
      specItemId: variation.linkedSpecForgeItemId,
      approvalDate: now.split('T')[0],
      costImpact: variation.costImpact
        ? (variation.costImpact.type === 'addition'
            ? variation.costImpact.amount
            : -variation.costImpact.amount)
        : 0,
    });
  }

  return { auditRecord };
}

/**
 * Record valuation (cost + time impact) for a variation.
 *
 * The variation must be in 'instructed' status. Records cost impact
 * (addition or omission, 0.01–999,999,999.99) and time impact
 * (0–9999 working days).
 *
 * @param projectId - The project identifier
 * @param variationId - The variation identifier
 * @param costImpact - Cost impact with type and amount
 * @param timeImpactDays - Time impact in working days
 * @param valuedBy - The user performing valuation
 * @param projectAssignment - The actor's project assignment (for RBAC)
 * @returns Object containing the audit record
 */
export async function valueVariation(
  projectId: string,
  variationId: string,
  costImpact: { type: 'addition' | 'omission'; amount: number },
  timeImpactDays: number,
  valuedBy: string,
  projectAssignment: ContractProjectAssignment
): Promise<{ auditRecord: ContractAuditRecord }> {
  // RBAC check
  assertAccess(
    projectAssignment.roles,
    'variations',
    'write',
    projectAssignment
  );

  // Validate cost impact (Requirement 5.4)
  const invalidFields: string[] = [];

  if (!costImpact || !costImpact.type || !['addition', 'omission'].includes(costImpact.type)) {
    invalidFields.push('costImpact.type');
  }
  if (
    costImpact?.amount === undefined ||
    costImpact.amount < 0.01 ||
    costImpact.amount > 999_999_999.99
  ) {
    invalidFields.push('costImpact.amount');
  }
  if (timeImpactDays === undefined || timeImpactDays < 0 || timeImpactDays > 9999) {
    invalidFields.push('timeImpactDays');
  }
  if (!Number.isFinite(timeImpactDays)) {
    invalidFields.push('timeImpactDays');
  }

  if (invalidFields.length > 0) {
    const error: ContractError = {
      code: 'VALIDATION_ERROR',
      message: 'Variation valuation failed: invalid fields.',
      details: { invalidFields },
    };
    throw error;
  }

  // Read current variation
  const variationRef = adminDb
    .collection(`projects/${projectId}/contractVariations`)
    .doc(variationId);
  const doc = await variationRef.get();

  if (!doc.exists) {
    const error: ContractError = {
      code: 'VALIDATION_ERROR',
      message: `Variation ${variationId} not found.`,
      details: { invalidFields: ['variationId'] },
    };
    throw error;
  }

  const variation = doc.data() as VariationRecord;

  // Valuation requires the variation to be in 'instructed' status
  if (variation.status !== 'instructed') {
    const error: ContractError = {
      code: 'INVALID_TRANSITION',
      message: `Cannot value a variation in '${variation.status}' status. Variation must be in 'instructed' status.`,
      details: {
        currentStatus: variation.status,
        attemptedStatus: 'valued',
        permittedTransitions: VARIATION_TRANSITIONS[variation.status],
      },
    };
    throw error;
  }

  // Persist valuation and transition to 'valued'
  const now = nowIso();
  await variationRef.update({
    costImpact,
    timeImpactDays,
    status: 'valued',
    updatedAt: now,
  });

  // Create audit record via integration service
  const auditId = generateId();
  const auditRecord: ContractAuditRecord = {
    id: auditId,
    projectId,
    entityType: 'variation',
    entityId: variationId,
    action: 'variation_valued',
    previousValue: {
      status: 'instructed',
      costImpact: variation.costImpact ?? null,
      timeImpactDays: variation.timeImpactDays ?? null,
    },
    newValue: {
      status: 'valued',
      costImpact,
      timeImpactDays,
    },
    actorId: valuedBy,
    timestamp: now,
  };

  await writeToAuditTrail(projectId, auditRecord);

  return { auditRecord };
}

/**
 * Compute cumulative variation summary for a project.
 *
 * Queries all variations and computes:
 * - Total number of variations
 * - Total additions (sum of addition amounts)
 * - Total omissions (sum of omission amounts)
 * - Net cost delta (additions - omissions)
 * - Total time impact in working days
 *
 * @param projectId - The project identifier
 * @returns The cumulative variation summary
 */
export async function getCumulativeSummary(
  projectId: string
): Promise<VariationCumulativeSummary> {
  const snapshot = await adminDb
    .collection(`projects/${projectId}/contractVariations`)
    .get();

  let totalAdditions = 0;
  let totalOmissions = 0;
  let totalTimeImpactDays = 0;

  for (const doc of snapshot.docs) {
    const variation = doc.data() as VariationRecord;

    if (variation.costImpact) {
      if (variation.costImpact.type === 'addition') {
        totalAdditions += variation.costImpact.amount;
      } else if (variation.costImpact.type === 'omission') {
        totalOmissions += variation.costImpact.amount;
      }
    }

    if (variation.timeImpactDays) {
      totalTimeImpactDays += variation.timeImpactDays;
    }
  }

  return {
    totalVariations: snapshot.size,
    totalAdditions,
    totalOmissions,
    netCostDelta: totalAdditions - totalOmissions,
    totalTimeImpactDays,
  };
}

/**
 * Link a variation to a SpecForge specification item.
 *
 * Creates a SpecForgeChangeRecord associating the variation with
 * the specified spec item.
 *
 * @param projectId - The project identifier
 * @param variationId - The variation identifier
 * @param specItemId - The SpecForge specification item identifier
 * @param projectAssignment - The actor's project assignment (for RBAC)
 * @returns Object containing the SpecForge change record
 */
export async function linkToSpecForge(
  projectId: string,
  variationId: string,
  specItemId: string,
  projectAssignment: ContractProjectAssignment
): Promise<{ changeRecord: SpecForgeChangeRecord }> {
  // RBAC check
  assertAccess(
    projectAssignment.roles,
    'variations',
    'write',
    projectAssignment
  );

  // Validate inputs
  if (!specItemId || specItemId.trim().length === 0) {
    const error: ContractError = {
      code: 'VALIDATION_ERROR',
      message: 'SpecForge item ID is required.',
      details: { invalidFields: ['specItemId'] },
    };
    throw error;
  }

  // Read variation to get variation number and cost impact
  const variationRef = adminDb
    .collection(`projects/${projectId}/contractVariations`)
    .doc(variationId);
  const doc = await variationRef.get();

  if (!doc.exists) {
    const error: ContractError = {
      code: 'VALIDATION_ERROR',
      message: `Variation ${variationId} not found.`,
      details: { invalidFields: ['variationId'] },
    };
    throw error;
  }

  const variation = doc.data() as VariationRecord;
  const now = nowIso();

  // Build the SpecForge change record (Requirement 5.6)
  const changeRecord: SpecForgeChangeRecord = {
    variationId,
    variationNumber: variation.variationNumber,
    specItemId,
    approvalDate: now.split('T')[0],
    costImpact: variation.costImpact
      ? (variation.costImpact.type === 'addition'
          ? variation.costImpact.amount
          : -variation.costImpact.amount)
      : 0,
  };

  // Update the variation record with the linked spec item
  await variationRef.update({
    linkedSpecForgeItemId: specItemId,
    updatedAt: now,
  });

  // Persist the SpecForge change record in Firestore
  const changeRecordId = generateId();
  await adminDb
    .collection(`projects/${projectId}/specForgeChanges`)
    .doc(changeRecordId)
    .set(changeRecord);

  // Create audit record via integration service
  const auditId = generateId();
  const auditRecord: ContractAuditRecord = {
    id: auditId,
    projectId,
    entityType: 'variation',
    entityId: variationId,
    action: 'variation_linked_to_specforge',
    newValue: { specItemId, variationNumber: variation.variationNumber },
    actorId: projectAssignment.userId,
    timestamp: now,
  };

  await writeToAuditTrail(projectId, auditRecord);

  return { changeRecord };
}
