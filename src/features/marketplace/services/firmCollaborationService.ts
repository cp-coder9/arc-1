/**
 * Firm Collaboration Service
 *
 * Handles firm collaboration posting lifecycle: creation with validation,
 * role-based access control, member invitation with trust score and registration
 * verification, project completion with ratings and trust score recalculation,
 * and template access revocation.
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

import type {
  FirmCollaborationPosting,
  CollaborationMember,
  CollaborationInvite,
  MarketplaceError,
} from '../types';

import type { UserRole } from '@/types';

import { logMarketplaceAction } from './marketplaceAuditService';

// ─── Input Types ──────────────────────────────────────────────────────────────

export interface CreateCollaborationInput {
  title: string;
  description: string;
  requiredDisciplines: string[];
  teamSize: number;
  budgetPerRole: Record<string, number>;
  timeline: { startDate: string; endDate: string };
  linkedTools: string[];
}

export interface CollaborationUser {
  userId: string;
  role: UserRole;
  firmId: string;
}

export interface ValidationResult {
  valid: boolean;
  errors?: Array<{ field: string; message: string }>;
}

export interface ParticipantRating {
  userId: string;
  rating: number; // 1–5
}

export interface InviteeEligibilityResult {
  eligible: boolean;
  failedConditions: string[];
}

// ─── Stub Types ───────────────────────────────────────────────────────────────

export type FirmRoleLevel = 'owner' | 'admin' | 'coordinator' | 'staff' | null;

// ─── External Dependency Stubs ────────────────────────────────────────────────

/**
 * Fetches the invitee's Trust Score overall value.
 * Stub: In production, queries the marketplace_trust_scores Firestore collection.
 */
export async function fetchInviteeTrustScore(userId: string): Promise<number> {
  void userId;
  return 80;
}

/**
 * Fetches the invitee's professional registration status.
 * Stub: In production, queries the professional_registrations collection.
 */
export async function fetchInviteeRegistration(
  userId: string
): Promise<'active' | 'inactive' | 'suspended'> {
  void userId;
  return 'active';
}

/**
 * Triggers Trust Score recalculation for a user after project completion.
 * Stub: In production, emits a 'project_completed' event to the Trust Score Engine.
 */
export async function triggerTrustScoreRecalculation(userId: string): Promise<void> {
  void userId;
}

/**
 * Grants template/checklist access to a team member on invitation acceptance.
 * Stub: In production, writes access grants to Firestore subcollection.
 */
export async function grantTemplateAccess(
  collaborationId: string,
  userId: string
): Promise<void> {
  void collaborationId;
  void userId;
}

/**
 * Revokes template/checklist access for all team members of a collaboration.
 * Called within 24 hours of the project reaching 'completed' or 'cancelled' status.
 * Stub: In production, removes access grants from Firestore.
 */
export async function revokeTemplateAccess(
  collaborationId: string,
  userId: string
): Promise<void> {
  void collaborationId;
  void userId;
}

/**
 * Fetches the user's firm-level role for a given firm.
 * Stub: In production, queries the firm_members Firestore collection.
 */
export async function fetchFirmRole(
  userId: string,
  firmId: string
): Promise<FirmRoleLevel> {
  void userId;
  void firmId;
  return null;
}

// ─── ID Generation ────────────────────────────────────────────────────────────

let collaborationCounter = 0;
let inviteCounter = 0;

function generateCollaborationId(): string {
  collaborationCounter += 1;
  return `collab-${Date.now()}-${collaborationCounter}`;
}

function generateInviteId(): string {
  inviteCounter += 1;
  return `invite-${Date.now()}-${inviteCounter}`;
}

// ─── Pure Validation Functions (Exported for Testability) ─────────────────────

/**
 * Pure validation function for collaboration posting input.
 *
 * Validates:
 * - title: 1–150 characters
 * - description: 1–5000 characters
 * - requiredDisciplines: at least 1
 * - teamSize: 1–50
 * - budgetPerRole: each value ZAR 0.01–999,999,999.99
 * - timeline: valid start and end dates (start before end)
 * - linkedTools: 0 or more (optional, no constraint beyond being an array)
 *
 * Validates: Requirements 8.1
 */
export function validateCollaborationPosting(
  input: CreateCollaborationInput
): ValidationResult {
  const errors: Array<{ field: string; message: string }> = [];

  // Title: 1–150 characters
  if (!input.title || input.title.length < 1 || input.title.length > 150) {
    errors.push({
      field: 'title',
      message: 'Title must be between 1 and 150 characters',
    });
  }

  // Description: 1–5000 characters
  if (
    !input.description ||
    input.description.length < 1 ||
    input.description.length > 5000
  ) {
    errors.push({
      field: 'description',
      message: 'Description must be between 1 and 5000 characters',
    });
  }

  // Required disciplines: at least 1
  if (!input.requiredDisciplines || input.requiredDisciplines.length < 1) {
    errors.push({
      field: 'requiredDisciplines',
      message: 'At least one required discipline must be specified',
    });
  }

  // Team size: 1–50
  if (
    input.teamSize === undefined ||
    input.teamSize === null ||
    !Number.isInteger(input.teamSize) ||
    input.teamSize < 1 ||
    input.teamSize > 50
  ) {
    errors.push({
      field: 'teamSize',
      message: 'Team size must be an integer between 1 and 50',
    });
  }

  // Budget per role: each value ZAR 0.01–999,999,999.99
  if (!input.budgetPerRole || typeof input.budgetPerRole !== 'object') {
    errors.push({
      field: 'budgetPerRole',
      message: 'Budget per role must be provided as a role-to-amount mapping',
    });
  } else {
    const entries = Object.entries(input.budgetPerRole);
    for (const [role, amount] of entries) {
      if (
        typeof amount !== 'number' ||
        amount < 0.01 ||
        amount > 999_999_999.99
      ) {
        errors.push({
          field: `budgetPerRole.${role}`,
          message: `Budget for role "${role}" must be between ZAR 0.01 and ZAR 999,999,999.99`,
        });
      }
    }
  }

  // Timeline: valid start and end dates, start before end
  if (!input.timeline || !input.timeline.startDate || !input.timeline.endDate) {
    errors.push({
      field: 'timeline',
      message: 'Timeline must include both startDate and endDate',
    });
  } else {
    const start = new Date(input.timeline.startDate);
    const end = new Date(input.timeline.endDate);

    if (isNaN(start.getTime())) {
      errors.push({
        field: 'timeline.startDate',
        message: 'Start date must be a valid ISO-8601 date',
      });
    }
    if (isNaN(end.getTime())) {
      errors.push({
        field: 'timeline.endDate',
        message: 'End date must be a valid ISO-8601 date',
      });
    }
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start >= end) {
      errors.push({
        field: 'timeline',
        message: 'Start date must be before end date',
      });
    }
  }

  // linkedTools: optional, just ensure it's an array if provided
  if (input.linkedTools && !Array.isArray(input.linkedTools)) {
    errors.push({
      field: 'linkedTools',
      message: 'Linked tools must be an array of CalculatorDefinition IDs',
    });
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

/**
 * Pure eligibility check for collaboration invitees.
 *
 * Verifies:
 * - Trust Score overallScore >= 75
 * - Registration status is 'active'
 *
 * Returns eligibility result with specific failed conditions.
 *
 * Validates: Requirements 8.3, 8.4
 */
export function checkInviteeEligibility(
  trustScore: number,
  registrationStatus: 'active' | 'inactive' | 'suspended'
): InviteeEligibilityResult {
  const failedConditions: string[] = [];

  if (trustScore < 75) {
    failedConditions.push(
      `Trust Score is ${trustScore} (minimum 75 required)`
    );
  }

  if (registrationStatus !== 'active') {
    failedConditions.push(
      `Registration status is "${registrationStatus}" (must be "active")`
    );
  }

  return {
    eligible: failedConditions.length === 0,
    failedConditions,
  };
}

// ─── Access Control ───────────────────────────────────────────────────────────

/**
 * Checks whether a user has posting access for a given firm.
 *
 * Returns true if the user has the `firm_admin` UserRole OR holds the
 * firm-level `owner` or `admin` FirmRole for the specified firm.
 *
 * Validates: Requirement 8.2
 */
export async function checkPostingAccess(
  userId: string,
  firmId: string,
  userRole: UserRole
): Promise<boolean> {
  // Check platform-level firm_admin role
  if (userRole === 'firm_admin') {
    return true;
  }

  // Check firm-level owner or admin role
  const firmRole = await fetchFirmRole(userId, firmId);
  return firmRole === 'owner' || firmRole === 'admin';
}

// ─── Core Service Functions ───────────────────────────────────────────────────

/**
 * Creates a new firm collaboration posting.
 *
 * Validates input, checks role-based access, persists to Firestore, and logs
 * to the audit trail.
 *
 * Validates: Requirements 8.1, 8.2
 */
export async function createCollaboration(
  params: CreateCollaborationInput,
  user: CollaborationUser
): Promise<{ collaboration: FirmCollaborationPosting } | { error: MarketplaceError }> {
  // 1. Validate access: firm_admin UserRole or firm-level owner/admin
  const hasAccess = await checkPostingAccess(user.userId, user.firmId, user.role);
  if (!hasAccess) {
    return {
      error: {
        code: 'ACCESS_DENIED',
        message: 'Only firm administrators or firm-level owners/admins can create collaboration postings',
        details: {
          reason: 'insufficient_permissions',
          requiredRoles: ['firm_admin'] as UserRole[],
        },
      },
    };
  }

  // 2. Validate input
  const validation = validateCollaborationPosting(params);
  if (!validation.valid) {
    return {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Collaboration input validation failed',
        details: {
          field: validation.errors![0].field,
          reason: validation.errors!.map((e) => `${e.field}: ${e.message}`).join('; '),
        },
      },
    };
  }

  // 3. Create the collaboration posting
  const collaborationId = generateCollaborationId();
  const now = new Date().toISOString();

  const collaboration: FirmCollaborationPosting = {
    id: collaborationId,
    firmId: user.firmId,
    createdByUserId: user.userId,
    title: params.title,
    description: params.description,
    requiredDisciplines: params.requiredDisciplines,
    teamSize: params.teamSize,
    budgetPerRole: params.budgetPerRole,
    timeline: params.timeline,
    linkedTools: params.linkedTools || [],
    status: 'draft',
    teamMembers: [],
    createdAt: now,
  };

  // 4. Persist to Firestore
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb
      .collection('marketplace_firm_collaborations')
      .doc(collaborationId)
      .set({
        firmId: collaboration.firmId,
        createdByUserId: collaboration.createdByUserId,
        title: collaboration.title,
        description: collaboration.description,
        requiredDisciplines: collaboration.requiredDisciplines,
        teamSize: collaboration.teamSize,
        budgetPerRole: collaboration.budgetPerRole,
        timeline: collaboration.timeline,
        linkedTools: collaboration.linkedTools,
        status: collaboration.status,
        teamMembers: collaboration.teamMembers,
        createdAt: collaboration.createdAt,
      });
  } catch (error) {
    console.error('[FirmCollaborationService] Failed to persist:', error);
    return {
      error: {
        code: 'PERSISTENCE_FAILED',
        message: 'Failed to save collaboration posting to database',
        details: { reason: 'firestore_write_failed' },
      },
    };
  }

  // 5. Log to audit trail
  await logMarketplaceAction({
    actorId: user.userId,
    actionType: 'collaboration_created',
    entityId: collaborationId,
    entityType: 'firm_collaboration',
    afterStatus: 'draft',
    metadata: {
      firmId: user.firmId,
      title: collaboration.title,
      teamSize: collaboration.teamSize,
    },
  });

  return { collaboration };
}

/**
 * Invites a member to a firm collaboration.
 *
 * Verifies the invitee's Trust Score is >= 75 and registration status is 'active'.
 * Rejects with specific condition indication if either fails.
 *
 * Validates: Requirements 8.3, 8.4
 */
export async function inviteMember(
  collaborationId: string,
  inviteeUserId: string,
  firmAdminId: string
): Promise<{ invite: CollaborationInvite } | { error: MarketplaceError }> {
  // 1. Fetch invitee's trust score and registration status
  const trustScore = await fetchInviteeTrustScore(inviteeUserId);
  const registrationStatus = await fetchInviteeRegistration(inviteeUserId);

  // 2. Verify eligibility conditions
  const eligibility = checkInviteeEligibility(trustScore, registrationStatus);
  if (!eligibility.eligible) {
    return {
      error: {
        code: 'INVITATION_REJECTED',
        message: 'Invitee does not meet verification requirements',
        details: {
          reason: eligibility.failedConditions.join('; '),
          blockers: eligibility.failedConditions,
        },
      },
    };
  }

  // 3. Create the invitation record
  const inviteId = generateInviteId();
  const now = new Date().toISOString();

  const invite: CollaborationInvite = {
    id: inviteId,
    collaborationId,
    inviteeUserId,
    trustScore,
    registrationStatus,
    status: 'pending',
  };

  // 4. Add to team members array and persist invite
  const newMember: CollaborationMember = {
    userId: inviteeUserId,
    role: 'invited',
    invitedAt: now,
  };

  try {
    const { adminDb } = await import('@/lib/firebase-admin');

    // Persist invite subcollection document
    await adminDb
      .collection('marketplace_firm_collaborations')
      .doc(collaborationId)
      .collection('invites')
      .doc(inviteId)
      .set({
        inviteeUserId: invite.inviteeUserId,
        trustScore: invite.trustScore,
        registrationStatus: invite.registrationStatus,
        status: invite.status,
        createdAt: now,
      });

    // Add member to teamMembers array
    const { FieldValue } = await import('firebase-admin/firestore');
    await adminDb
      .collection('marketplace_firm_collaborations')
      .doc(collaborationId)
      .update({
        teamMembers: FieldValue.arrayUnion(newMember),
      });
  } catch (error) {
    console.error('[FirmCollaborationService] Failed to persist invite:', error);
    return {
      error: {
        code: 'PERSISTENCE_FAILED',
        message: 'Failed to save invitation to database',
        details: { reason: 'firestore_write_failed' },
      },
    };
  }

  // 5. Log to audit trail
  await logMarketplaceAction({
    actorId: firmAdminId,
    actionType: 'collaboration_member_invited',
    entityId: collaborationId,
    entityType: 'firm_collaboration',
    metadata: {
      inviteId,
      inviteeUserId,
      trustScore,
      registrationStatus,
    },
  });

  return { invite };
}

/**
 * Marks a firm collaboration as completed.
 *
 * Triggers Trust Score recalculation for all participants, stores participant
 * ratings (1–5), updates status to 'completed', and revokes template access
 * within 24 hours.
 *
 * Validates: Requirements 8.5, 8.6
 */
export async function markComplete(
  collaborationId: string,
  adminId: string,
  ratings: ParticipantRating[]
): Promise<{ success: boolean } | { error: MarketplaceError }> {
  // 1. Validate ratings (each must be integer 1–5)
  for (const rating of ratings) {
    if (
      !Number.isInteger(rating.rating) ||
      rating.rating < 1 ||
      rating.rating > 5
    ) {
      return {
        error: {
          code: 'VALIDATION_FAILED',
          message: `Rating for user ${rating.userId} must be an integer between 1 and 5`,
          details: {
            field: 'ratings',
            reason: `Invalid rating value: ${rating.rating}`,
          },
        },
      };
    }
  }

  // 2. Fetch collaboration and update in Firestore
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const collaborationRef = adminDb
      .collection('marketplace_firm_collaborations')
      .doc(collaborationId);

    const doc = await collaborationRef.get();
    if (!doc.exists) {
      return {
        error: {
          code: 'NOT_FOUND',
          message: `Collaboration ${collaborationId} not found`,
          details: { reason: 'entity_not_found' },
        },
      };
    }

    const data = doc.data()!;
    const teamMembers: CollaborationMember[] = data.teamMembers || [];

    // Apply ratings to team members
    const ratingMap = new Map(ratings.map((r) => [r.userId, r.rating]));
    const updatedMembers = teamMembers.map((member) => ({
      ...member,
      rating: ratingMap.get(member.userId) ?? member.rating,
    }));

    // Update status and team members
    await collaborationRef.update({
      status: 'completed',
      teamMembers: updatedMembers,
      completedAt: new Date().toISOString(),
      completedByUserId: adminId,
    });
  } catch (error) {
    console.error('[FirmCollaborationService] Failed to mark complete:', error);
    return {
      error: {
        code: 'PERSISTENCE_FAILED',
        message: 'Failed to update collaboration status',
        details: { reason: 'firestore_write_failed' },
      },
    };
  }

  // 3. Trigger Trust Score recalculation for all participants
  for (const rating of ratings) {
    await triggerTrustScoreRecalculation(rating.userId);
  }

  // 4. Revoke template/checklist access (within 24 hours of completion)
  for (const rating of ratings) {
    await revokeTemplateAccess(collaborationId, rating.userId);
  }

  // 5. Log to audit trail
  await logMarketplaceAction({
    actorId: adminId,
    actionType: 'collaboration_completed',
    entityId: collaborationId,
    entityType: 'firm_collaboration',
    beforeStatus: 'in_progress',
    afterStatus: 'completed',
    metadata: {
      participantCount: ratings.length,
      ratings: ratings.map((r) => ({ userId: r.userId, rating: r.rating })),
    },
  });

  return { success: true };
}
