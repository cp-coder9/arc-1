import { createAuditEntry } from '@/services/auditTrailService';
import { calculators as toolboxCalculators } from '@/services/toolboxRegistry';
import { logMarketplaceAction } from './marketplaceAuditService';
import type { LogMarketplaceActionParams, MarketplaceAuditEntry } from './marketplaceAuditService';

/**
 * Platform Integration Service
 *
 * Centralises all marketplace ↔ platform spine connections.
 * Each integration function wraps an existing platform service or provides
 * a stub interface for services not yet fully implemented, clearly defining
 * the contract and logging intended behaviour.
 *
 * Integrations:
 * 1. Project Passport — write project records (within 5s)
 * 2. Audit Trail — log marketplace actions (within 5s)
 * 3. Toolbox Registry — validate tool IDs
 * 4. CPD Module — check CPD compliance
 * 5. Action Centre — surface pending actions (within 60s)
 * 6. Documents Service — store deliverables with retry
 * 7. AI Review Queue — route deliverables for compliance
 * 8. Verification Badge Service — source Trust Score badges
 *
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProjectPassportWriteParams {
  projectId: string;
  postingId: string;
  toolIds: string[];
  sansReferences: string[];
  teamMembers: Array<{ userId: string; role: string }>;
  milestones: Array<{ title: string; targetDate: string; amount?: number }>;
  createdBy: string;
}

export interface AuditTrailLogParams extends LogMarketplaceActionParams {}

export interface ActionCentreParams {
  recipientUserId: string;
  recipientRole: string;
  title: string;
  description: string;
  actionType: 'application_review' | 'deliverable_signoff' | 'payment_approval' | 'dispute_resolution' | 'posting_expired' | 'posting_withdrawn' | 'quote_received' | 'quote_expired' | 'cpd_blocked' | 'certificate_ready' | 'general';
  sourceEntityId: string;
  sourceEntityType: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  projectId?: string;
}

export interface StoreDeliverableParams {
  deliverableId: string;
  taskId: string;
  projectId: string;
  files: Array<{ fileId: string; fileName: string; format: string; sizeBytes: number }>;
  submittedBy: string;
}

export interface StoreDeliverableResult {
  stored: boolean;
  documentVaultFileId?: string;
  pendingRetry: boolean;
  retryExpiresAt?: string;
}

export interface VerificationStatusResult {
  userId: string;
  isVerified: boolean;
  badges: string[];
  registrationStatus: 'active' | 'inactive' | 'suspended' | 'unknown';
  provenanceLevel: 'self_declared' | 'document_uploaded' | 'manually_reviewed' | 'externally_verified';
}

export interface CpdComplianceResult {
  compliant: boolean;
  blockedReason?: string;
}

export interface ToolValidationResult {
  valid: boolean;
  invalidIds: string[];
}

// ─── Pending Queue for Documents Service ──────────────────────────────────────

interface PendingDeliverable {
  params: StoreDeliverableParams;
  queuedAt: string;
  retryCount: number;
  maxRetryUntil: string;
}

const pendingDeliverableQueue: PendingDeliverable[] = [];

// ─── 1. Project Passport Integration ─────────────────────────────────────────

/**
 * Writes a marketplace project record into Project Passport within 5 seconds
 * of creation. Writes to `projects/{projectId}/passport/health` to match the
 * existing Command Centre passport writeback pattern, AND to a marketplace-specific
 * collection for direct marketplace queries.
 *
 * CONTRACT: Completes within 5 seconds.
 *
 * Validates: Requirement 10.1
 */
export async function writeToProjectPassport(params: ProjectPassportWriteParams): Promise<void> {
  const startTime = Date.now();

  try {
    const { adminDb } = await import('@/lib/firebase-admin');

    const projectRecord = {
      projectId: params.projectId,
      postingId: params.postingId,
      source: 'marketplace',
      toolIds: params.toolIds,
      sansReferences: params.sansReferences,
      teamMembers: params.teamMembers,
      milestones: params.milestones,
      createdBy: params.createdBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Write to the existing Command Centre passport pattern:
    // projects/{projectId}/passport/health
    await adminDb
      .doc(`projects/${params.projectId}/passport/health`)
      .set(projectRecord, { merge: true });

    // Also write to marketplace-specific subcollection for marketplace queries
    await adminDb
      .collection('marketplace_project_passport_records')
      .doc(params.projectId)
      .set(projectRecord, { merge: true });

    // Also write the platform audit entry for traceability
    createAuditEntry({
      actorId: params.createdBy,
      action: 'marketplace:project_passport_write',
      sourceObjectId: params.projectId,
    });

    const elapsed = Date.now() - startTime;
    if (elapsed > 5000) {
      console.warn(
        `[PlatformIntegration] Project Passport write exceeded 5s SLA: ${elapsed}ms for project ${params.projectId}`
      );
    }
  } catch (error) {
    console.error('[PlatformIntegration] Failed to write to Project Passport:', error);
    throw error;
  }
}

// ─── 2. Audit Trail Integration ──────────────────────────────────────────────

/**
 * Logs every marketplace action to the platform audit trail within 5 seconds.
 * Wraps the marketplaceAuditService for a unified integration interface.
 *
 * CONTRACT: Completes within 5 seconds.
 *
 * Validates: Requirement 10.2
 */
export async function logToAuditTrail(params: AuditTrailLogParams): Promise<MarketplaceAuditEntry> {
  return logMarketplaceAction(params);
}

// ─── 3. Toolbox Registry Integration ─────────────────────────────────────────

/**
 * Validates that all referenced CalculatorDefinition tool IDs exist in the
 * Toolbox registry before publishing any posting.
 *
 * Validates: Requirements 10.3, 10.4
 */
export function validateToolIds(toolIds: string[]): ToolValidationResult {
  const registeredIds = new Set(toolboxCalculators.map((c) => c.calculatorId));
  const invalidIds = toolIds.filter((id) => !registeredIds.has(id));

  return {
    valid: invalidIds.length === 0,
    invalidIds,
  };
}

// ─── 4. CPD Module Integration ───────────────────────────────────────────────

/**
 * Checks CPD compliance status for a user. Blocks non-compliant users from
 * new marketplace applications within 5 seconds of status change.
 *
 * FAIL-CLOSED: When CPD data is unavailable or the service errors, the user is
 * treated as non-compliant. Regulated marketplace actions require confirmed CPD
 * compliance — absence of proof is treated as non-compliance.
 *
 * CONTRACT: Returns within 5 seconds.
 *
 * Validates: Requirement 10.5
 */
export async function checkCpdCompliance(userId: string): Promise<CpdComplianceResult> {
  try {
    const { adminDb } = await import('@/lib/firebase-admin');

    // Query CPD module data for the user
    const cpdDoc = await adminDb
      .collection('cpd_user_status')
      .doc(userId)
      .get();

    if (!cpdDoc.exists) {
      // Fail-closed: No CPD record means compliance cannot be verified
      console.info(`[PlatformIntegration] No CPD record for user ${userId}, treating as non-compliant (fail-closed)`);
      return {
        compliant: false,
        blockedReason: 'CPD status could not be verified. Marketplace actions require confirmed CPD compliance.',
      };
    }

    const data = cpdDoc.data() as {
      status?: string;
      hoursCompleted?: number;
      hoursRequired?: number;
      lastUpdated?: string;
    } | undefined;

    if (!data) {
      return {
        compliant: false,
        blockedReason: 'CPD status could not be verified. Marketplace actions require confirmed CPD compliance.',
      };
    }

    if (data.status === 'non_compliant' || data.status === 'expired' || data.status === 'revoked') {
      return {
        compliant: false,
        blockedReason: `CPD status is "${data.status}". Marketplace applications are blocked until CPD compliance is restored. Hours completed: ${data.hoursCompleted ?? 0}/${data.hoursRequired ?? 'unknown'}.`,
      };
    }

    return { compliant: true };
  } catch (error) {
    // Fail-closed: if CPD service is unavailable, block the user
    // Regulated actions must not proceed without confirmed compliance
    console.error('[PlatformIntegration] Failed to check CPD compliance (fail-closed):', error);
    return {
      compliant: false,
      blockedReason: 'CPD status could not be verified. Marketplace actions require confirmed CPD compliance.',
    };
  }
}

// ─── 5. Action Centre Integration ────────────────────────────────────────────

/**
 * Surfaces pending marketplace actions to the user's Action Centre within
 * 60 seconds of the action being created.
 *
 * Actions include: applications to review, deliverables to sign off,
 * payments to approve, disputes to resolve.
 *
 * CONTRACT: Event surfaced within 60 seconds.
 *
 * Validates: Requirement 10.6
 */
export async function surfaceToActionCentre(params: ActionCentreParams): Promise<string> {
  try {
    const { adminDb } = await import('@/lib/firebase-admin');

    const eventId = `mkt-action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const actionEvent = {
      id: eventId,
      recipientUserId: params.recipientUserId,
      recipientRole: params.recipientRole,
      title: params.title,
      description: params.description,
      actionType: params.actionType,
      sourceEntityId: params.sourceEntityId,
      sourceEntityType: params.sourceEntityType,
      priority: params.priority,
      projectId: params.projectId ?? null,
      source: 'marketplace',
      status: 'pending',
      createdAt: new Date().toISOString(),
      readAt: null,
      resolvedAt: null,
    };

    // Write to the Action Centre Firestore collection
    await adminDb
      .collection('action_centre_events')
      .doc(eventId)
      .set(actionEvent);

    return eventId;
  } catch (error) {
    console.error('[PlatformIntegration] Failed to surface action to Action Centre:', error);
    throw error;
  }
}

// ─── 6. Documents Service Integration ────────────────────────────────────────

/**
 * Stores marketplace deliverables in the project document vault.
 * Handles Documents service unavailability with a pending queue and retry
 * mechanism up to 24 hours.
 *
 * CONTRACT: If service unavailable, queues with retry up to 24 hours.
 *
 * Validates: Requirements 10.7, 10.8
 */
export async function storeDeliverable(params: StoreDeliverableParams): Promise<StoreDeliverableResult> {
  try {
    const { adminDb } = await import('@/lib/firebase-admin');

    const documentVaultFileId = `mkt-doc-${params.deliverableId}-${Date.now()}`;

    const documentRecord = {
      fileId: documentVaultFileId,
      deliverableId: params.deliverableId,
      taskId: params.taskId,
      projectId: params.projectId,
      files: params.files,
      submittedBy: params.submittedBy,
      source: 'marketplace_deliverable',
      storedAt: new Date().toISOString(),
    };

    await adminDb
      .collection('project_document_vault')
      .doc(documentVaultFileId)
      .set(documentRecord);

    return {
      stored: true,
      documentVaultFileId,
      pendingRetry: false,
    };
  } catch (error) {
    console.error('[PlatformIntegration] Documents service unavailable, queuing deliverable:', error);

    // Queue for retry — up to 24 hours
    const now = new Date();
    const maxRetryUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    pendingDeliverableQueue.push({
      params,
      queuedAt: now.toISOString(),
      retryCount: 0,
      maxRetryUntil,
    });

    return {
      stored: false,
      pendingRetry: true,
      retryExpiresAt: maxRetryUntil,
    };
  }
}

/**
 * Processes the pending deliverable queue. Should be called periodically
 * (e.g., via a background task or cron) to retry failed document storage.
 */
export async function processPendingDeliverables(): Promise<{
  processed: number;
  succeeded: number;
  expired: number;
}> {
  const now = new Date();
  let processed = 0;
  let succeeded = 0;
  let expired = 0;

  const remaining: PendingDeliverable[] = [];

  for (const item of pendingDeliverableQueue) {
    processed++;

    if (now.toISOString() > item.maxRetryUntil) {
      // 24-hour window expired — log and discard
      expired++;
      console.error(
        `[PlatformIntegration] Deliverable ${item.params.deliverableId} expired after 24h retry window`
      );
      continue;
    }

    try {
      const result = await storeDeliverable(item.params);
      if (result.stored) {
        succeeded++;
      } else {
        // Still failing — keep in queue
        remaining.push({ ...item, retryCount: item.retryCount + 1 });
      }
    } catch {
      remaining.push({ ...item, retryCount: item.retryCount + 1 });
    }
  }

  // Replace queue with remaining items
  pendingDeliverableQueue.length = 0;
  pendingDeliverableQueue.push(...remaining);

  return { processed, succeeded, expired };
}

/**
 * Returns the current pending deliverable queue length (for monitoring).
 */
export function getPendingDeliverableCount(): number {
  return pendingDeliverableQueue.length;
}

// ─── 7. AI Review Queue Integration ──────────────────────────────────────────

/**
 * Routes a marketplace deliverable to the AI Review Queue for compliance
 * checking before payment release / professional sign-off.
 *
 * Validates: Requirement 10.7
 */
export async function routeToAiReview(deliverableId: string, taskId: string): Promise<void> {
  try {
    const { adminDb } = await import('@/lib/firebase-admin');

    const reviewEntry = {
      deliverableId,
      taskId,
      source: 'marketplace_task_deliverable',
      status: 'pending',
      submittedAt: new Date().toISOString(),
      reviewedAt: null,
      result: null,
      reasons: [],
    };

    await adminDb
      .collection('ai_review_queue')
      .doc(`mkt-review-${deliverableId}`)
      .set(reviewEntry);

    // Log the routing action
    createAuditEntry({
      actorId: 'system',
      action: 'marketplace:deliverable_routed_to_ai_review',
      sourceObjectId: deliverableId,
    });
  } catch (error) {
    console.error('[PlatformIntegration] Failed to route deliverable to AI Review Queue:', error);
    throw error;
  }
}

// ─── 8. Verification Badge Service Integration ───────────────────────────────

/**
 * Sources Trust Score badges and verification status for a marketplace user
 * from the Verification Badge Service.
 *
 * Validates: Requirement 10.8
 */
export async function getVerificationStatus(userId: string): Promise<VerificationStatusResult> {
  try {
    const { adminDb } = await import('@/lib/firebase-admin');

    // Query verification badges for this user
    const badgesSnapshot = await adminDb
      .collection('verification_badges')
      .where('entityId', '==', userId)
      .get();

    const badges: string[] = [];
    let registrationStatus: VerificationStatusResult['registrationStatus'] = 'unknown';
    let provenanceLevel: VerificationStatusResult['provenanceLevel'] = 'self_declared';
    let isVerified = false;

    if (!badgesSnapshot.empty) {
      for (const doc of badgesSnapshot.docs) {
        const data = doc.data() as {
          badgeType?: string;
          provenance?: string;
          expiresAt?: string;
        };

        // Check expiry
        if (data.expiresAt && new Date(data.expiresAt) < new Date()) {
          continue; // Skip expired badges
        }

        badges.push(data.badgeType ?? 'unknown');

        // Determine registration status from professional_registration badge
        if (data.badgeType === 'professional_registration_verified') {
          if (data.provenance === 'externally_verified' || data.provenance === 'manually_reviewed') {
            registrationStatus = 'active';
            isVerified = true;
          } else if (data.provenance === 'document_uploaded') {
            registrationStatus = 'active';
          }
        }

        // Track highest provenance level
        const provenanceOrder = ['self_declared', 'document_uploaded', 'manually_reviewed', 'externally_verified'] as const;
        const currentIdx = provenanceOrder.indexOf(provenanceLevel);
        const badgeIdx = provenanceOrder.indexOf(
          (data.provenance as typeof provenanceLevel) ?? 'self_declared'
        );
        if (badgeIdx > currentIdx) {
          provenanceLevel = provenanceOrder[badgeIdx];
        }
      }
    }

    // If identity_verified badge exists with high provenance, mark as verified
    if (badges.includes('identity_verified') && (provenanceLevel === 'manually_reviewed' || provenanceLevel === 'externally_verified')) {
      isVerified = true;
    }

    return {
      userId,
      isVerified,
      badges,
      registrationStatus,
      provenanceLevel,
    };
  } catch (error) {
    console.error('[PlatformIntegration] Failed to get verification status:', error);
    // Return safe default — not verified
    return {
      userId,
      isVerified: false,
      badges: [],
      registrationStatus: 'unknown',
      provenanceLevel: 'self_declared',
    };
  }
}
