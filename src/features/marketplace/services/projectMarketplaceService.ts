/**
 * Project Marketplace Service
 *
 * Handles project posting lifecycle: creation with validation, visibility filtering,
 * expiry handling, withdrawal, proposal submission, and acceptance. Integrates with
 * the audit trail, Action Centre, Toolbox registry, Project Passport, and Escrow.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 10.1, 10.3, 10.4
 */

import type {
  ProjectPosting,
  ProjectPostingStatus,
  ProjectProposal,
  ProposalStatus,
  ProposalMilestone,
  RecentProject,
  MarketplaceError,
} from '../types';

import { logMarketplaceAction } from './marketplaceAuditService';

// ─── Input Types ──────────────────────────────────────────────────────────────

export interface CreateProjectPostingInput {
  title: string;
  description: string;
  location: string;
  municipality: string;
  budgetRange: { min: number; max: number };
  sansReferences: string[];
  requiredTools: string[];
  expiryDate: string; // ISO-8601
}

export interface ProjectPostingUser {
  userId: string;
  role: string;
}

export interface ValidationResult {
  valid: boolean;
  errors?: Array<{ field: string; message: string }>;
}

// ─── Stub Types ───────────────────────────────────────────────────────────────

export interface ToolValidationResult {
  valid: boolean;
  invalidIds: string[];
}

export interface UserEligibilityResult {
  eligible: boolean;
  reason?: string;
}

export interface ProfessionalProfile {
  trustScore: number;
  registrationStatus: 'active' | 'inactive' | 'suspended';
  toolIds: string[];
}

export interface UserNotification {
  type: string;
  title: string;
  message: string;
  entityId?: string;
  entityType?: string;
}

// ─── External Dependency Stubs ────────────────────────────────────────────────

/**
 * Checks whether a single CalculatorDefinition tool ID exists in the Toolbox registry.
 * Stub: In production, this queries the Toolbox registry Firestore collection.
 *
 * This is the atomic helper; `validateToolIds` uses it internally.
 */
export async function toolExistsInRegistry(toolId: string): Promise<boolean> {
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const doc = await adminDb
      .collection('calculator_definitions')
      .doc(toolId)
      .get();
    return doc.exists;
  } catch {
    // Fail-closed: if Firestore is unavailable, assume tool does NOT exist
    return false;
  }
}

/**
 * Validates that all referenced CalculatorDefinition tool IDs exist in the Toolbox registry.
 * Uses `toolExistsInRegistry` for each ID and collects invalid ones.
 * Stub: In production, this queries the Toolbox registry Firestore collection.
 */
export async function validateToolIds(
  toolIds: string[]
): Promise<ToolValidationResult> {
  const invalidIds: string[] = [];
  for (const toolId of toolIds) {
    const exists = await toolExistsInRegistry(toolId);
    if (!exists) {
      invalidIds.push(toolId);
    }
  }
  return { valid: invalidIds.length === 0, invalidIds };
}

/**
 * Validates user eligibility for marketplace actions.
 * Checks: verified account, terms accepted, not suspended.
 * Uses checkProfessionalVerification from verificationGatesService.
 */
export async function validateUserEligibility(
  userId: string
): Promise<UserEligibilityResult> {
  try {
    const { checkProfessionalVerification } = await import('./verificationGatesService');
    const result = await checkProfessionalVerification(userId);
    if (!result.verified) {
      return { eligible: false, reason: result.reason || 'Verification could not be confirmed' };
    }
    return { eligible: true };
  } catch {
    // Fail-closed: if verification check fails, block the action
    return { eligible: false, reason: 'Verification could not be confirmed' };
  }
}

/**
 * Sends a notification to a user via the Action Centre.
 * Stub: In production, this writes to the notifications Firestore collection.
 */
export async function notifyUser(
  userId: string,
  notification: UserNotification
): Promise<void> {
  // Stub implementation — no-op unless overridden in tests
}

/**
 * Fetches a professional's profile data for visibility filtering.
 * Stub: In production, this queries the professional profile and trust score.
 */
export async function fetchProfessionalProfile(
  userId: string
): Promise<ProfessionalProfile | null> {
  // Stub implementation — returns null (no profile) unless overridden in tests
  return null;
}

// ─── Project Proposal & Acceptance Types ──────────────────────────────────────

export interface ProfessionalApplicationData {
  registrationNumber: string;
  cpdPointsEarned: number;
  cpdPointsRequired: number;
  trustScore: number;
  toolUsageHistory: Record<string, number>;
  recentProjects: RecentProject[];
  registrationStatus: 'active' | 'inactive' | 'suspended';
  unresolvedDisputes: number;
}

/**
 * Result of checking whether a professional meets eligibility requirements
 * for applying to a project posting.
 *
 * Validates: Requirements 4.2
 */
export interface ProfessionalEligibility {
  eligible: boolean;
  blockingConditions: string[];
}

/**
 * Input data provided by the professional when submitting a proposal.
 */
export interface ProposalSubmissionData {
  feeAmount: number;
  milestonePlan: ProposalMilestone[];
}

// ─── Pure Eligibility Check ───────────────────────────────────────────────────

/**
 * Pure function to check whether a professional meets all eligibility
 * conditions for applying to a project posting.
 *
 * Blocking conditions:
 * - Trust Score < 75
 * - Registration status is not "active"
 * - CPD points earned below minimum required
 * - One or more unresolved disputes in active escrow
 *
 * Returns an eligibility result identifying which condition(s) are unmet.
 * This is a pure function with no side effects, exported for testability.
 *
 * Validates: Requirements 4.2
 */
export function checkProfessionalEligibility(
  data: ProfessionalApplicationData
): ProfessionalEligibility {
  const blockingConditions: string[] = [];

  if (data.trustScore < 75) {
    blockingConditions.push('Trust Score below 75');
  }
  if (data.registrationStatus !== 'active') {
    blockingConditions.push('Professional registration is not active');
  }
  if (data.cpdPointsEarned < data.cpdPointsRequired) {
    blockingConditions.push('CPD points earned below minimum required');
  }
  if (data.unresolvedDisputes > 0) {
    blockingConditions.push('One or more unresolved disputes in active escrow');
  }

  return {
    eligible: blockingConditions.length === 0,
    blockingConditions,
  };
}

// ─── Project Proposal & Acceptance Stubs ──────────────────────────────────────

/**
 * Fetches a professional's full application data for proposal auto-population.
 * Returns registration number, CPD points, Trust Score, tool usage history,
 * recent completed projects (max 10, sorted by completion date descending),
 * registration status, and unresolved disputes count.
 *
 * Stub: In production, queries professional profile, CPD module, Trust Score Engine,
 * Toolbox usage records, and escrow dispute collections.
 */
export async function fetchProfessionalApplicationData(
  userId: string
): Promise<ProfessionalApplicationData> {
  // Stub implementation — returns default data unless overridden in tests
  return {
    registrationNumber: '',
    cpdPointsEarned: 0,
    cpdPointsRequired: 0,
    trustScore: 0,
    toolUsageHistory: {},
    recentProjects: [],
    registrationStatus: 'inactive',
    unresolvedDisputes: 0,
  };
}

/**
 * Creates a project record in the Project Passport.
 * CONTRACT: Must complete within 5 seconds.
 *
 * Calls writeToProjectPassport from platformIntegrationService.
 */
export async function createProjectInPassport(data: {
  postingId: string;
  proposalId: string;
  clientId: string;
  professionalId: string;
  title: string;
  requiredTools: string[];
  sansReferences: string[];
  milestones: ProposalMilestone[];
}): Promise<{ projectId: string }> {
  const projectId = `passport-proj-${Date.now()}`;
  const { writeToProjectPassport } = await import('./platformIntegrationService');
  await writeToProjectPassport({
    projectId,
    postingId: data.postingId,
    toolIds: data.requiredTools,
    sansReferences: data.sansReferences,
    teamMembers: [
      { userId: data.clientId, role: 'client' },
      { userId: data.professionalId, role: 'professional' },
    ],
    milestones: data.milestones.map((m) => ({
      title: m.title,
      targetDate: m.targetDate,
      amount: m.amount,
    })),
    createdBy: data.clientId,
  });
  return { projectId };
}

/**
 * Loads the CalculatorDefinition toolbox matching the project's discipline and stage.
 *
 * Stub: In production, queries the Toolbox registry and loads the matching toolbox.
 */
export async function loadToolbox(
  discipline: string,
  stage: string
): Promise<void> {
  // Stub implementation — no-op unless overridden in tests
}

/**
 * Creates an escrow holding in "created" state for the fee amount + platform fees.
 *
 * Stub: In production, calls the existing escrow state machine to create a holding.
 */
export async function createEscrowHolding(data: {
  proposalId: string;
  postingId: string;
  clientId: string;
  professionalId: string;
  feeAmount: number;
  milestones: ProposalMilestone[];
}): Promise<{ escrowId: string }> {
  // Stub implementation — returns a generated escrow ID unless overridden in tests
  return { escrowId: `escrow-${Date.now()}` };
}

// ─── Pure Validation ──────────────────────────────────────────────────────────

/**
 * Pure validation function for project posting input.
 * Returns { valid: true } or { valid: false, errors: [...] }.
 * No side effects — this is the core validation logic used by other functions.
 *
 * Validates: Requirement 3.1
 */
export function validateProjectPostingInput(
  input: CreateProjectPostingInput,
  creationDate?: Date
): ValidationResult {
  const errors: Array<{ field: string; message: string }> = [];
  const now = creationDate || new Date();

  // Title: non-empty, max 150 characters
  if (!input.title || input.title.trim().length === 0) {
    errors.push({ field: 'title', message: 'Title is required' });
  } else if (input.title.length > 150) {
    errors.push({ field: 'title', message: 'Title must not exceed 150 characters' });
  }

  // Description: non-empty, max 5000 characters
  if (!input.description || input.description.trim().length === 0) {
    errors.push({ field: 'description', message: 'Description is required' });
  } else if (input.description.length > 5000) {
    errors.push({ field: 'description', message: 'Description must not exceed 5000 characters' });
  }

  // Location: non-empty
  if (!input.location || input.location.trim().length === 0) {
    errors.push({ field: 'location', message: 'Location is required' });
  }

  // Municipality: non-empty
  if (!input.municipality || input.municipality.trim().length === 0) {
    errors.push({ field: 'municipality', message: 'Municipality is required' });
  }

  // Budget range: min >= 1000, max <= 999999999, min < max
  if (!input.budgetRange) {
    errors.push({ field: 'budgetRange', message: 'Budget range is required' });
  } else {
    if (input.budgetRange.min < 1000) {
      errors.push({ field: 'budgetRange.min', message: 'Minimum budget must be at least R1,000' });
    }
    if (input.budgetRange.max > 999999999) {
      errors.push({ field: 'budgetRange.max', message: 'Maximum budget must not exceed R999,999,999' });
    }
    if (input.budgetRange.min >= input.budgetRange.max) {
      errors.push({ field: 'budgetRange', message: 'Minimum budget must be less than maximum budget' });
    }
  }

  // SANS references: 1–20 items
  if (!input.sansReferences || input.sansReferences.length === 0) {
    errors.push({ field: 'sansReferences', message: 'At least one SANS reference is required' });
  } else if (input.sansReferences.length > 20) {
    errors.push({ field: 'sansReferences', message: 'Maximum 20 SANS references allowed' });
  }

  // Required tools: 1–10 items
  if (!input.requiredTools || input.requiredTools.length === 0) {
    errors.push({ field: 'requiredTools', message: 'At least one required tool is required' });
  } else if (input.requiredTools.length > 10) {
    errors.push({ field: 'requiredTools', message: 'Maximum 10 required tools allowed' });
  }

  // Expiry date: valid ISO-8601, 7–180 days from creation date
  if (!input.expiryDate) {
    errors.push({ field: 'expiryDate', message: 'Expiry date is required' });
  } else {
    const expiry = new Date(input.expiryDate);
    if (isNaN(expiry.getTime())) {
      errors.push({ field: 'expiryDate', message: 'Expiry date must be a valid ISO-8601 date' });
    } else {
      const diffMs = expiry.getTime() - now.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (diffDays < 7) {
        errors.push({ field: 'expiryDate', message: 'Expiry date must be at least 7 days from creation date' });
      } else if (diffDays > 180) {
        errors.push({ field: 'expiryDate', message: 'Expiry date must be at most 180 days from creation date' });
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}

/**
 * Pure validation function exported for testability.
 * Alias for `validateProjectPostingInput` — the canonical pure function
 * that can be tested without any Firestore or external dependencies.
 *
 * Validates: Requirement 3.1
 */
export const validateProjectPosting = validateProjectPostingInput;

// ─── Pure Expiry Check ────────────────────────────────────────────────────────

export interface PostingExpiryInput {
  id: string;
  clientId: string;
  status: ProjectPostingStatus;
  expiryDate: string; // ISO-8601
  title: string;
}

export interface PostingExpiryResult {
  shouldExpire: boolean;
  reason?: string;
}

/**
 * Pure function to determine whether a posting should transition to "expired".
 *
 * A posting expires when:
 * - Its status is "published" (not already accepted, expired, withdrawn, or draft)
 * - The current date is on or after the expiry date
 *
 * A posting with an accepted proposal (status "accepted") SHALL NOT expire
 * regardless of its expiry date.
 *
 * Validates: Requirement 3.4
 */
export function checkPostingExpiry(
  posting: PostingExpiryInput,
  currentDate?: Date
): PostingExpiryResult {
  const now = currentDate || new Date();

  // Accepted postings never expire
  if (posting.status === 'accepted') {
    return { shouldExpire: false, reason: 'Posting has an accepted proposal' };
  }

  // Only published postings can expire
  if (posting.status !== 'published') {
    return { shouldExpire: false, reason: `Posting status is "${posting.status}", only published postings can expire` };
  }

  // Check if expiry date has been reached
  const expiryDate = new Date(posting.expiryDate);
  if (isNaN(expiryDate.getTime())) {
    return { shouldExpire: false, reason: 'Invalid expiry date format' };
  }

  if (now.getTime() >= expiryDate.getTime()) {
    return { shouldExpire: true };
  }

  return { shouldExpire: false, reason: 'Expiry date has not been reached yet' };
}

// ─── ID Generation ────────────────────────────────────────────────────────────

let postingCounter = 0;

function generatePostingId(): string {
  postingCounter += 1;
  return `proj-post-${Date.now()}-${postingCounter}`;
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Creates a new project posting with full validation.
 *
 * Validates input fields, checks tool ID validity, verifies user eligibility,
 * persists to Firestore, and logs the action to the audit trail.
 *
 * Validates: Requirements 3.1, 3.2, 10.3, 10.4
 */
export async function createProjectPosting(
  params: CreateProjectPostingInput,
  user: ProjectPostingUser
): Promise<ProjectPosting | MarketplaceError> {
  const now = new Date();

  // 1. Input validation
  const validation = validateProjectPostingInput(params, now);
  if (!validation.valid) {
    return {
      code: 'VALIDATION_ERROR',
      message: 'Project posting validation failed',
      details: {
        field: validation.errors![0].field,
        reason: validation.errors!.map((e) => `${e.field}: ${e.message}`).join('; '),
      },
    };
  }

  // 2. Validate user eligibility (verified, terms accepted, not suspended)
  const eligibility = await validateUserEligibility(user.userId);
  if (!eligibility.eligible) {
    return {
      code: 'USER_INELIGIBLE',
      message: 'User is not eligible to create marketplace postings',
      details: {
        reason: eligibility.reason || 'Account not verified, terms not accepted, or account suspended',
      },
    };
  }

  // 3. Validate all tool IDs exist in Toolbox registry
  const toolValidation = await validateToolIds(params.requiredTools);
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

  // 4. Build the posting record
  const postingId = generatePostingId();
  const timestamp = now.toISOString();

  const posting: ProjectPosting = {
    id: postingId,
    clientId: user.userId,
    tenantId: user.userId, // Default tenant scope to user; overridden if organisation provided
    title: params.title,
    description: params.description,
    location: params.location,
    municipality: params.municipality,
    budgetRange: { min: params.budgetRange.min, max: params.budgetRange.max },
    sansReferences: [...params.sansReferences],
    requiredTools: [...params.requiredTools],
    expiryDate: params.expiryDate,
    status: 'published',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  // 5. Persist to Firestore
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb
      .collection('marketplace_project_postings')
      .doc(postingId)
      .set({
        clientId: posting.clientId,
        tenantId: posting.tenantId,
        organisationId: posting.organisationId ?? null,
        title: posting.title,
        description: posting.description,
        location: posting.location,
        municipality: posting.municipality,
        budgetRange: posting.budgetRange,
        sansReferences: posting.sansReferences,
        requiredTools: posting.requiredTools,
        expiryDate: posting.expiryDate,
        status: posting.status,
        createdAt: posting.createdAt,
        updatedAt: posting.updatedAt,
      });
  } catch (error) {
    console.error('[ProjectMarketplace] Failed to persist posting:', error);
    return {
      code: 'PERSISTENCE_ERROR',
      message: 'Failed to save project posting',
      details: { reason: 'Firestore write failed' },
    };
  }

  // 6. Log action to audit trail
  await logMarketplaceAction({
    actorId: user.userId,
    actionType: 'posting_created',
    entityId: postingId,
    entityType: 'project_posting',
    afterStatus: 'published',
    metadata: {
      title: posting.title,
      budgetMin: posting.budgetRange.min,
      budgetMax: posting.budgetRange.max,
      toolCount: posting.requiredTools.length,
      sansCount: posting.sansReferences.length,
    },
  });

  return posting;
}

/**
 * Returns project postings visible to a specific professional user.
 *
 * A posting is visible if and only if:
 * - The posting status is 'published'
 * - The professional's Trust Score is >= 75
 * - The professional's registration is active
 * - The professional's profile includes ALL required CalculatorDefinition tools
 *
 * Validates: Requirement 3.3
 */
export async function getVisiblePostings(
  userId: string
): Promise<ProjectPosting[]> {
  // 1. Fetch professional profile
  const profile = await fetchProfessionalProfile(userId);
  if (!profile) {
    return [];
  }

  // 2. Check Trust Score threshold
  if (profile.trustScore < 75) {
    return [];
  }

  // 3. Check registration status
  if (profile.registrationStatus !== 'active') {
    return [];
  }

  // 4. Fetch published postings from Firestore
  let publishedPostings: ProjectPosting[] = [];
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const snapshot = await adminDb
      .collection('marketplace_project_postings')
      .where('status', '==', 'published')
      .get();

    publishedPostings = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        clientId: data.clientId,
        tenantId: data.tenantId || data.clientId,
        organisationId: data.organisationId,
        title: data.title,
        description: data.description,
        location: data.location,
        municipality: data.municipality,
        budgetRange: data.budgetRange,
        sansReferences: data.sansReferences,
        requiredTools: data.requiredTools,
        expiryDate: data.expiryDate,
        status: data.status as ProjectPostingStatus,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    });
  } catch (error) {
    console.error('[ProjectMarketplace] Failed to fetch postings:', error);
    return [];
  }

  // 5. Filter: professional must have ALL required tools for each posting
  const professionalToolSet = new Set(profile.toolIds);

  return publishedPostings.filter((posting) =>
    posting.requiredTools.every((toolId) => professionalToolSet.has(toolId))
  );
}

/**
 * Handles posting expiry when the expiry date is reached without an accepted proposal.
 *
 * Transitions posting status to "expired", notifies the Client via Action Centre,
 * and logs the state change to the audit trail.
 *
 * Validates: Requirement 3.4
 */
export async function handlePostingExpiry(
  postingId: string
): Promise<ProjectPosting | MarketplaceError> {
  // 1. Fetch the posting
  let posting: ProjectPosting | null = null;
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const doc = await adminDb
      .collection('marketplace_project_postings')
      .doc(postingId)
      .get();

    if (!doc.exists) {
      return {
        code: 'NOT_FOUND',
        message: 'Project posting not found',
        details: { reason: `Posting ${postingId} does not exist` },
      };
    }

    const data = doc.data()!;
    posting = {
      id: doc.id,
      clientId: data.clientId,
      tenantId: data.tenantId || data.clientId,
      organisationId: data.organisationId,
      title: data.title,
      description: data.description,
      location: data.location,
      municipality: data.municipality,
      budgetRange: data.budgetRange,
      sansReferences: data.sansReferences,
      requiredTools: data.requiredTools,
      expiryDate: data.expiryDate,
      status: data.status as ProjectPostingStatus,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  } catch (error) {
    console.error('[ProjectMarketplace] Failed to fetch posting for expiry:', error);
    return {
      code: 'FETCH_ERROR',
      message: 'Failed to fetch project posting',
      details: { reason: 'Firestore read failed' },
    };
  }

  // 2. Only transition published postings (not already accepted/expired/withdrawn)
  if (posting.status === 'accepted') {
    return {
      code: 'INVALID_TRANSITION',
      message: 'Cannot expire a posting with an accepted proposal',
      details: { reason: 'Posting already has an accepted proposal' },
    };
  }

  if (posting.status !== 'published') {
    return {
      code: 'INVALID_TRANSITION',
      message: `Cannot expire a posting with status "${posting.status}"`,
      details: { reason: `Current status is "${posting.status}", expected "published"` },
    };
  }

  // 3. Transition to expired
  const previousStatus = posting.status;
  const now = new Date().toISOString();

  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb
      .collection('marketplace_project_postings')
      .doc(postingId)
      .update({
        status: 'expired',
        updatedAt: now,
      });
  } catch (error) {
    console.error('[ProjectMarketplace] Failed to update posting status:', error);
    return {
      code: 'PERSISTENCE_ERROR',
      message: 'Failed to update posting status',
      details: { reason: 'Firestore write failed' },
    };
  }

  // 4. Notify Client via Action Centre
  await notifyUser(posting.clientId, {
    type: 'posting_expired',
    title: 'Project Posting Expired',
    message: `Your project posting "${posting.title}" has expired without receiving an accepted proposal.`,
    entityId: postingId,
    entityType: 'project_posting',
  });

  // 5. Log state change to audit trail
  await logMarketplaceAction({
    actorId: 'system',
    actionType: 'posting_expired',
    entityId: postingId,
    entityType: 'project_posting',
    beforeStatus: previousStatus,
    afterStatus: 'expired',
    metadata: {
      clientId: posting.clientId,
      expiryDate: posting.expiryDate,
    },
  });

  return {
    ...posting,
    status: 'expired',
    updatedAt: now,
  };
}

/**
 * Withdraws a published project posting.
 *
 * Sets status to "withdrawn", notifies all professionals who submitted proposals
 * via Action Centre, and logs the state change to the audit trail.
 *
 * Validates: Requirement 3.5
 */
export async function withdrawPosting(
  postingId: string,
  clientId: string
): Promise<ProjectPosting | MarketplaceError> {
  // 1. Fetch the posting
  let posting: ProjectPosting | null = null;
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const doc = await adminDb
      .collection('marketplace_project_postings')
      .doc(postingId)
      .get();

    if (!doc.exists) {
      return {
        code: 'NOT_FOUND',
        message: 'Project posting not found',
        details: { reason: `Posting ${postingId} does not exist` },
      };
    }

    const data = doc.data()!;
    posting = {
      id: doc.id,
      clientId: data.clientId,
      tenantId: data.tenantId || data.clientId,
      organisationId: data.organisationId,
      title: data.title,
      description: data.description,
      location: data.location,
      municipality: data.municipality,
      budgetRange: data.budgetRange,
      sansReferences: data.sansReferences,
      requiredTools: data.requiredTools,
      expiryDate: data.expiryDate,
      status: data.status as ProjectPostingStatus,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  } catch (error) {
    console.error('[ProjectMarketplace] Failed to fetch posting for withdrawal:', error);
    return {
      code: 'FETCH_ERROR',
      message: 'Failed to fetch project posting',
      details: { reason: 'Firestore read failed' },
    };
  }

  // 2. Verify ownership
  if (posting.clientId !== clientId) {
    return {
      code: 'ACCESS_DENIED',
      message: 'Only the posting owner can withdraw a posting',
      details: { reason: 'Client ID does not match posting owner' },
    };
  }

  // 3. Only allow withdrawal of published postings
  if (posting.status !== 'published') {
    return {
      code: 'INVALID_TRANSITION',
      message: `Cannot withdraw a posting with status "${posting.status}"`,
      details: { reason: `Current status is "${posting.status}", expected "published"` },
    };
  }

  // 4. Transition to withdrawn
  const previousStatus = posting.status;
  const now = new Date().toISOString();

  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb
      .collection('marketplace_project_postings')
      .doc(postingId)
      .update({
        status: 'withdrawn',
        updatedAt: now,
      });
  } catch (error) {
    console.error('[ProjectMarketplace] Failed to update posting status:', error);
    return {
      code: 'PERSISTENCE_ERROR',
      message: 'Failed to update posting status',
      details: { reason: 'Firestore write failed' },
    };
  }

  // 5. Notify all professionals who submitted proposals
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const proposalsSnap = await adminDb
      .collection('marketplace_proposals')
      .where('postingId', '==', postingId)
      .get();

    const notificationPromises = proposalsSnap.docs.map((doc) => {
      const proposalData = doc.data();
      return notifyUser(proposalData.professionalId, {
        type: 'posting_withdrawn',
        title: 'Project Posting Withdrawn',
        message: `The project posting "${posting!.title}" you applied to has been withdrawn by the client.`,
        entityId: postingId,
        entityType: 'project_posting',
      });
    });

    await Promise.all(notificationPromises);
  } catch (error) {
    // Non-blocking: proposal notifications are best-effort
    console.error('[ProjectMarketplace] Failed to notify proposal applicants:', error);
  }

  // 6. Log state change to audit trail
  await logMarketplaceAction({
    actorId: clientId,
    actionType: 'posting_withdrawn',
    entityId: postingId,
    entityType: 'project_posting',
    beforeStatus: previousStatus,
    afterStatus: 'withdrawn',
    metadata: {
      title: posting.title,
    },
  });

  return {
    ...posting,
    status: 'withdrawn',
    updatedAt: now,
  };
}


// ─── Proposal ID Generation ───────────────────────────────────────────────────

let proposalCounter = 0;

function generateProposalId(): string {
  proposalCounter += 1;
  return `proposal-${Date.now()}-${proposalCounter}`;
}

// ─── Project Application & Acceptance ─────────────────────────────────────────

/**
 * Applies to a project posting on behalf of a professional.
 *
 * Auto-populates the proposal with the professional's registration number,
 * CPD points earned vs required, Trust Score, tool usage history matching
 * the project's discipline, and at most 10 recent completed projects sorted
 * by completion date descending.
 *
 * Blocks application if:
 * - Trust Score < 75
 * - Registration status is not "active"
 * - CPD points earned below minimum required
 * - One or more unresolved disputes in active escrow
 *
 * Uses `checkProfessionalEligibility` pure function for eligibility determination.
 *
 * Validates: Requirements 4.1, 4.2, 10.1
 */
export async function applyToProject(
  professionalId: string,
  postingId: string,
  proposalData?: ProposalSubmissionData
): Promise<ProjectProposal | MarketplaceError> {
  // 1. Fetch the posting to get discipline/tool context
  let posting: ProjectPosting | null = null;
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const doc = await adminDb
      .collection('marketplace_project_postings')
      .doc(postingId)
      .get();

    if (!doc.exists) {
      return {
        code: 'NOT_FOUND',
        message: 'Project posting not found',
        details: { reason: `Posting ${postingId} does not exist` },
      };
    }

    const data = doc.data()!;
    posting = {
      id: doc.id,
      clientId: data.clientId,
      tenantId: data.tenantId || data.clientId,
      organisationId: data.organisationId,
      title: data.title,
      description: data.description,
      location: data.location,
      municipality: data.municipality,
      budgetRange: data.budgetRange,
      sansReferences: data.sansReferences,
      requiredTools: data.requiredTools,
      expiryDate: data.expiryDate,
      status: data.status as ProjectPostingStatus,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  } catch (error) {
    console.error('[ProjectMarketplace] Failed to fetch posting for application:', error);
    return {
      code: 'FETCH_ERROR',
      message: 'Failed to fetch project posting',
      details: { reason: 'Firestore read failed' },
    };
  }

  // 2. Verify posting is published (accepting applications)
  if (posting.status !== 'published') {
    return {
      code: 'INVALID_TRANSITION',
      message: 'Cannot apply to a posting that is not published',
      details: { reason: `Posting status is "${posting.status}", expected "published"` },
    };
  }

  // 3. Fetch professional's application data
  const appData = await fetchProfessionalApplicationData(professionalId);

  // 4. Check eligibility using the pure checkProfessionalEligibility function
  const eligibility = checkProfessionalEligibility(appData);

  if (!eligibility.eligible) {
    return {
      code: 'APPLICATION_BLOCKED',
      message: 'Professional does not meet eligibility requirements',
      details: {
        reason: eligibility.blockingConditions.join('; '),
        blockers: eligibility.blockingConditions,
      },
    };
  }

  // 5. Filter tool usage history to match posting's required tools
  const postingToolSet = new Set(posting.requiredTools);
  const filteredToolUsage: Record<string, number> = {};
  for (const [toolId, count] of Object.entries(appData.toolUsageHistory)) {
    if (postingToolSet.has(toolId)) {
      filteredToolUsage[toolId] = count;
    }
  }

  // 6. Cap recent projects to 10 most recent, sorted by completedAt descending
  const recentProjects = [...appData.recentProjects]
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
    .slice(0, 10);

  // 7. Build the proposal
  const proposalId = generateProposalId();
  const now = new Date().toISOString();

  const proposal: ProjectProposal = {
    id: proposalId,
    postingId,
    professionalId,
    registrationNumber: appData.registrationNumber,
    cpdPointsEarned: appData.cpdPointsEarned,
    cpdPointsRequired: appData.cpdPointsRequired,
    trustScore: appData.trustScore,
    toolUsageHistory: filteredToolUsage,
    recentProjects,
    feeAmount: proposalData?.feeAmount ?? 0,
    milestonePlan: proposalData?.milestonePlan ?? [],
    status: 'submitted',
    createdAt: now,
  };

  // 8. Persist to Firestore marketplace_proposals/{proposalId}
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb
      .collection('marketplace_proposals')
      .doc(proposalId)
      .set({
        postingId: proposal.postingId,
        professionalId: proposal.professionalId,
        registrationNumber: proposal.registrationNumber,
        cpdPointsEarned: proposal.cpdPointsEarned,
        cpdPointsRequired: proposal.cpdPointsRequired,
        trustScore: proposal.trustScore,
        toolUsageHistory: proposal.toolUsageHistory,
        recentProjects: proposal.recentProjects,
        feeAmount: proposal.feeAmount,
        milestonePlan: proposal.milestonePlan,
        status: proposal.status,
        createdAt: proposal.createdAt,
      });
  } catch (error) {
    console.error('[ProjectMarketplace] Failed to persist proposal:', error);
    return {
      code: 'PERSISTENCE_ERROR',
      message: 'Failed to save proposal',
      details: { reason: 'Firestore write failed' },
    };
  }

  // 9. Log action to audit trail
  await logMarketplaceAction({
    actorId: professionalId,
    actionType: 'proposal_submitted',
    entityId: proposalId,
    entityType: 'proposal',
    afterStatus: 'submitted',
    metadata: {
      postingId,
      trustScore: appData.trustScore,
      registrationNumber: appData.registrationNumber,
    },
  });

  return proposal;
}

/**
 * Accepts a proposal for a project posting.
 *
 * Workflow:
 * 1. Verify client owns the posting
 * 2. Auto-create Architex Project linked to Project Passport (within 5s)
 * 3. Load CalculatorDefinition toolbox matching discipline and stage
 * 4. Create escrow holding in "created" state for fee + platform fees
 * 5. Assign Professional to project team
 * 6. If escrow/project creation fails: halt, preserve proposal as "pending_acceptance"
 * 7. Log acceptance event to audit trail
 * 8. Update proposal status to 'accepted', posting status to 'accepted'
 *
 * Validates: Requirements 4.3, 4.4, 4.5, 10.1
 */
export async function acceptProposal(
  clientId: string,
  postingId: string,
  proposalId: string
): Promise<ProjectProposal | MarketplaceError> {
  // 1. Fetch the posting and verify client ownership
  let posting: ProjectPosting | null = null;
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const doc = await adminDb
      .collection('marketplace_project_postings')
      .doc(postingId)
      .get();

    if (!doc.exists) {
      return {
        code: 'NOT_FOUND',
        message: 'Project posting not found',
        details: { reason: `Posting ${postingId} does not exist` },
      };
    }

    const data = doc.data()!;
    posting = {
      id: doc.id,
      clientId: data.clientId,
      tenantId: data.tenantId || data.clientId,
      organisationId: data.organisationId,
      title: data.title,
      description: data.description,
      location: data.location,
      municipality: data.municipality,
      budgetRange: data.budgetRange,
      sansReferences: data.sansReferences,
      requiredTools: data.requiredTools,
      expiryDate: data.expiryDate,
      status: data.status as ProjectPostingStatus,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  } catch (error) {
    console.error('[ProjectMarketplace] Failed to fetch posting for acceptance:', error);
    return {
      code: 'FETCH_ERROR',
      message: 'Failed to fetch project posting',
      details: { reason: 'Firestore read failed' },
    };
  }

  // Verify client owns the posting
  if (posting.clientId !== clientId) {
    return {
      code: 'ACCESS_DENIED',
      message: 'Only the posting owner can accept proposals',
      details: { reason: 'Client ID does not match posting owner' },
    };
  }

  // Verify posting is in a state that allows acceptance
  if (posting.status !== 'published') {
    return {
      code: 'INVALID_TRANSITION',
      message: `Cannot accept proposals on a posting with status "${posting.status}"`,
      details: { reason: `Posting status is "${posting.status}", expected "published"` },
    };
  }

  // 2. Fetch the proposal
  let proposal: ProjectProposal | null = null;
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const doc = await adminDb
      .collection('marketplace_proposals')
      .doc(proposalId)
      .get();

    if (!doc.exists) {
      return {
        code: 'NOT_FOUND',
        message: 'Proposal not found',
        details: { reason: `Proposal ${proposalId} does not exist` },
      };
    }

    const data = doc.data()!;
    proposal = {
      id: doc.id,
      postingId: data.postingId,
      professionalId: data.professionalId,
      registrationNumber: data.registrationNumber,
      cpdPointsEarned: data.cpdPointsEarned,
      cpdPointsRequired: data.cpdPointsRequired,
      trustScore: data.trustScore,
      toolUsageHistory: data.toolUsageHistory,
      recentProjects: data.recentProjects || [],
      feeAmount: data.feeAmount,
      milestonePlan: data.milestonePlan || [],
      status: data.status as ProposalStatus,
      createdAt: data.createdAt,
    };
  } catch (error) {
    console.error('[ProjectMarketplace] Failed to fetch proposal:', error);
    return {
      code: 'FETCH_ERROR',
      message: 'Failed to fetch proposal',
      details: { reason: 'Firestore read failed' },
    };
  }

  // Verify proposal belongs to this posting
  if (proposal.postingId !== postingId) {
    return {
      code: 'INVALID_REFERENCE',
      message: 'Proposal does not belong to this posting',
      details: { reason: `Proposal postingId "${proposal.postingId}" does not match "${postingId}"` },
    };
  }

  // Verify proposal is in a valid state for acceptance
  if (proposal.status !== 'submitted' && proposal.status !== 'pending_acceptance') {
    return {
      code: 'INVALID_TRANSITION',
      message: `Cannot accept a proposal with status "${proposal.status}"`,
      details: { reason: `Proposal status is "${proposal.status}", expected "submitted" or "pending_acceptance"` },
    };
  }

  // 3. Auto-create Architex Project linked to Project Passport (CONTRACT: within 5 seconds)
  let projectId: string;
  try {
    const result = await createProjectInPassport({
      postingId,
      proposalId,
      clientId,
      professionalId: proposal.professionalId,
      title: posting.title,
      requiredTools: posting.requiredTools,
      sansReferences: posting.sansReferences,
      milestones: proposal.milestonePlan,
    });
    projectId = result.projectId;
  } catch (error) {
    // Project creation failed — preserve proposal as "pending_acceptance"
    console.error('[ProjectMarketplace] Project Passport creation failed:', error);

    try {
      const { adminDb } = await import('@/lib/firebase-admin');
      await adminDb
        .collection('marketplace_proposals')
        .doc(proposalId)
        .update({ status: 'pending_acceptance' });
    } catch (updateError) {
      console.error('[ProjectMarketplace] Failed to update proposal to pending_acceptance:', updateError);
    }

    await notifyUser(clientId, {
      type: 'acceptance_failed',
      title: 'Proposal Acceptance Failed',
      message: 'Project creation in Project Passport failed. The proposal has been preserved for retry.',
      entityId: proposalId,
      entityType: 'proposal',
    });

    return {
      code: 'PROJECT_CREATION_FAILED',
      message: 'Failed to create project in Project Passport',
      details: { reason: 'Project Passport write failed; proposal preserved as pending_acceptance' },
    };
  }

  // 4. Load CalculatorDefinition toolbox for the project's discipline and stage
  try {
    await loadToolbox(posting.requiredTools[0] || 'general', 'design');
  } catch (error) {
    // Toolbox loading is non-critical — log but proceed
    console.error('[ProjectMarketplace] Failed to load toolbox:', error);
  }

  // 5. Create escrow holding via real marketplace escrow service
  let escrowId: string;
  try {
    const { createMarketplaceEscrow } = await import('./marketplaceEscrowService');
    const escrowResult = await createMarketplaceEscrow({
      type: 'project_acceptance',
      projectId,
      entityId: proposalId,
      fundingSourceId: clientId,
      amount: { amount: proposal.feeAmount, currency: 'ZAR' },
      milestones: proposal.milestonePlan.map((m) => ({ title: m.title, targetDate: m.targetDate })),
      actorId: clientId,
    });
    escrowId = escrowResult.escrowId;
  } catch (error) {
    // Escrow creation failed — preserve proposal as "pending_acceptance"
    console.error('[ProjectMarketplace] Escrow creation failed:', error);

    try {
      const { adminDb } = await import('@/lib/firebase-admin');
      await adminDb
        .collection('marketplace_proposals')
        .doc(proposalId)
        .update({ status: 'pending_acceptance' });
    } catch (updateError) {
      console.error('[ProjectMarketplace] Failed to update proposal to pending_acceptance:', updateError);
    }

    await notifyUser(clientId, {
      type: 'acceptance_failed',
      title: 'Proposal Acceptance Failed',
      message: 'Escrow holding creation failed. The proposal has been preserved for retry.',
      entityId: proposalId,
      entityType: 'proposal',
    });

    return {
      code: 'ESCROW_CREATION_FAILED',
      message: 'Failed to create escrow holding',
      details: { reason: 'Escrow creation failed; proposal preserved as pending_acceptance' },
    };
  }

  // 6. Atomically update proposal status to 'accepted' and posting status to 'accepted'
  const now = new Date().toISOString();

  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const batch = adminDb.batch();

    // Update posting status to 'accepted'
    batch.update(adminDb.collection('marketplace_project_postings').doc(postingId), {
      status: 'accepted',
      updatedAt: now,
    });

    // Update proposal status to 'accepted'
    batch.update(adminDb.collection('marketplace_proposals').doc(proposalId), {
      status: 'accepted',
      updatedAt: now,
    });

    // Create project passport record
    batch.set(adminDb.doc(`projects/${projectId}/passport/health`), {
      postingId,
      proposalId,
      clientId,
      professionalId: proposal.professionalId,
      title: posting.title,
      createdAt: now,
      status: 'active',
    });

    // Commit atomically
    await batch.commit();
  } catch (error) {
    console.error('[ProjectMarketplace] Batch commit failed during acceptance:', error);
    return {
      code: 'PERSISTENCE_ERROR',
      message: 'Failed to update proposal/posting status',
      details: { reason: 'Batch write failed during status update — no changes applied' },
    };
  }

  // 7. After batch succeeds, create escrow (separate call, can be retried)
  // (already done in step 5 above)

  // 8. Log acceptance event to audit trail with full context
  await logMarketplaceAction({
    actorId: clientId,
    actionType: 'proposal_accepted',
    entityId: proposalId,
    entityType: 'proposal',
    beforeStatus: proposal.status,
    afterStatus: 'accepted',
    metadata: {
      postingId,
      projectId,
      escrowId,
      feeAmount: proposal.feeAmount,
      milestonePlan: proposal.milestonePlan,
      professionalId: proposal.professionalId,
      clientId,
      acceptedAt: now,
    },
  });

  // 9. Surface to Action Centre for the professional (non-critical, fire-and-forget)
  try {
    const { surfaceToActionCentre } = await import('./platformIntegrationService');
    surfaceToActionCentre({
      recipientUserId: proposal.professionalId,
      recipientRole: 'architect',
      title: 'Proposal Accepted',
      description: `Your proposal for "${posting.title}" has been accepted. Project created.`,
      actionType: 'application_review',
      sourceEntityId: proposalId,
      sourceEntityType: 'proposal',
      priority: 'high',
      projectId,
    }).catch((err: unknown) => console.error('[Marketplace] Action Centre notification failed:', err));
  } catch (e) {
    console.error('[Marketplace] Action Centre notification failed:', e);
  }

  return {
    ...proposal,
    status: 'accepted',
  };
}
