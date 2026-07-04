/**
 * Freelancer Hub Service
 *
 * Manages freelancer profile lifecycle: creation with validation, retrieval,
 * profile view assembly with analytics data (tool usage, AI audit pass rate,
 * dispute history). Integrates with CPD module for compliance status and
 * blocks new task applications when CPD is non-compliant.
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 10.5
 */

import type {
  FreelancerProfile,
  FreelancerSkill,
  FreelancerProfileView,
  DisputeEntry,
  MarketplaceError,
} from '../types';

import { logMarketplaceAction } from './marketplaceAuditService';

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_SKILLS = 1;
const MAX_SKILLS = 20;
const MIN_YEARS_EXPERIENCE = 0;
const MAX_YEARS_EXPERIENCE = 60;
const VALID_AVAILABILITY_VALUES = ['available', 'partially_available', 'unavailable'] as const;
const MAX_DISPUTE_HISTORY = 10;

// ─── Input Types ──────────────────────────────────────────────────────────────

export interface CreateFreelancerProfileInput {
  skills: FreelancerSkill[];
  availability: string;
  yearsExperience: number;
}

export interface FreelancerProfileValidationResult {
  valid: boolean;
  errors?: Array<{ field: string; message: string }>;
}

// ─── External Dependency Stubs ────────────────────────────────────────────────

/**
 * Fetches the current CPD compliance status for a user from the CPD module.
 * Returns 'compliant' or 'non_compliant'.
 *
 * Stub: In production, queries the CPD module's compliance records.
 */
export async function fetchCpdStatus(
  userId: string
): Promise<'compliant' | 'non_compliant'> {
  void userId;
  return 'compliant';
}

/**
 * Fetches the Trust Score for a user from the Trust Score Engine.
 *
 * Stub: In production, queries marketplace_trust_scores/{userId}.
 */
export async function fetchTrustScore(
  userId: string
): Promise<{ overallScore: number; badges: string[] }> {
  void userId;
  return { overallScore: 0, badges: [] };
}

/**
 * Fetches completed task count and average rating for a user.
 *
 * Stub: In production, queries task completion records from Firestore.
 */
export async function fetchTaskStats(
  userId: string
): Promise<{ completedTaskCount: number; averageRating: number }> {
  void userId;
  return { completedTaskCount: 0, averageRating: 0 };
}

/**
 * Fetches tool usage frequency per CalculatorDefinition for the last 12 months.
 *
 * Stub: In production, queries task deliverable records grouped by tool ID.
 */
export async function fetchToolUsageFrequency(
  userId: string
): Promise<Record<string, number>> {
  void userId;
  return {};
}

/**
 * Fetches AI audit pass rate as a percentage for deliverables within the last 12 months.
 *
 * Stub: In production, queries AI Review Queue results.
 */
export async function fetchAiAuditPassRate(userId: string): Promise<number> {
  void userId;
  return 0;
}

/**
 * Fetches dispute history for a user, limited to the most recent entries.
 *
 * Stub: In production, queries marketplace_disputes collection.
 */
export async function fetchDisputeHistory(
  userId: string,
  limit: number
): Promise<DisputeEntry[]> {
  void userId;
  void limit;
  return [];
}

/**
 * Validates that all referenced CalculatorDefinition tool IDs exist in the Toolbox registry.
 *
 * Stub: In production, queries the Toolbox registry Firestore collection.
 */
export async function validateToolIds(
  toolIds: string[]
): Promise<{ valid: boolean; invalidIds: string[] }> {
  void toolIds;
  return { valid: true, invalidIds: [] };
}

// ─── Pure Validation ──────────────────────────────────────────────────────────

/**
 * Pure validation function for freelancer profile input.
 * Returns { valid: true } or { valid: false, errors: [...] }.
 * No side effects — this is the core validation logic exported for testability.
 *
 * Validates: Requirements 7.1, 7.5
 */
export function validateFreelancerProfile(
  input: CreateFreelancerProfileInput
): FreelancerProfileValidationResult {
  const errors: Array<{ field: string; message: string }> = [];

  // Skills: 1–20 items, each must have a toolId
  if (!input.skills || !Array.isArray(input.skills)) {
    errors.push({ field: 'skills', message: 'Skills are required' });
  } else if (input.skills.length < MIN_SKILLS) {
    errors.push({ field: 'skills', message: `At least ${MIN_SKILLS} skill is required` });
  } else if (input.skills.length > MAX_SKILLS) {
    errors.push({ field: 'skills', message: `Maximum ${MAX_SKILLS} skills allowed` });
  } else {
    // Validate each skill has a toolId and label
    for (let i = 0; i < input.skills.length; i++) {
      const skill = input.skills[i];
      if (!skill.toolId || skill.toolId.trim().length === 0) {
        errors.push({ field: 'skills', message: `Skill at index ${i} must have a valid toolId` });
        break;
      }
      if (!skill.label || skill.label.trim().length === 0) {
        errors.push({ field: 'skills', message: `Skill at index ${i} must have a label` });
        break;
      }
    }
  }

  // Availability: one of the valid values
  if (!input.availability) {
    errors.push({ field: 'availability', message: 'Availability status is required' });
  } else if (!VALID_AVAILABILITY_VALUES.includes(input.availability as typeof VALID_AVAILABILITY_VALUES[number])) {
    errors.push({
      field: 'availability',
      message: `Availability must be one of: ${VALID_AVAILABILITY_VALUES.join(', ')}`,
    });
  }

  // Years of experience: integer 0–60
  if (input.yearsExperience === undefined || input.yearsExperience === null) {
    errors.push({ field: 'yearsExperience', message: 'Years of experience is required' });
  } else if (typeof input.yearsExperience !== 'number' || isNaN(input.yearsExperience)) {
    errors.push({ field: 'yearsExperience', message: 'Years of experience must be a number' });
  } else if (!Number.isInteger(input.yearsExperience)) {
    errors.push({ field: 'yearsExperience', message: 'Years of experience must be an integer' });
  } else if (input.yearsExperience < MIN_YEARS_EXPERIENCE) {
    errors.push({ field: 'yearsExperience', message: `Years of experience must be at least ${MIN_YEARS_EXPERIENCE}` });
  } else if (input.yearsExperience > MAX_YEARS_EXPERIENCE) {
    errors.push({ field: 'yearsExperience', message: `Years of experience must not exceed ${MAX_YEARS_EXPERIENCE}` });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}

/**
 * Pure function to determine if a freelancer can apply to new tasks
 * based on their CPD compliance status.
 *
 * Returns true if compliant (can apply), false if non-compliant (blocked).
 * In-progress assignments are NOT affected — only new applications are blocked.
 *
 * Validates: Requirements 7.2, 10.5
 */
export function canApplyToTasks(
  cpdStatus: 'compliant' | 'non_compliant'
): boolean {
  return cpdStatus === 'compliant';
}

// ─── ID Generation ────────────────────────────────────────────────────────────

let profileCounter = 0;

function generateTimestamp(): string {
  return new Date().toISOString();
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Creates a new freelancer profile.
 *
 * Validates input fields, checks tool ID validity in the Toolbox registry,
 * sources CPD status from the CPD module, fetches Trust Score and task stats,
 * persists to Firestore, and logs the action to the audit trail.
 *
 * Validates: Requirements 7.1, 7.2, 7.5, 10.5
 */
export async function createProfile(
  userId: string,
  input: CreateFreelancerProfileInput
): Promise<FreelancerProfile | MarketplaceError> {
  // 1. Input validation
  const validation = validateFreelancerProfile(input);
  if (!validation.valid) {
    return {
      code: 'VALIDATION_ERROR',
      message: 'Freelancer profile validation failed',
      details: {
        field: validation.errors![0].field,
        reason: validation.errors!.map((e) => `${e.field}: ${e.message}`).join('; '),
        missingItems: validation.errors!.map((e) => e.field),
      },
    };
  }

  // 2. Validate all skill tool IDs exist in Toolbox registry
  const toolIds = input.skills.map((s) => s.toolId);
  const toolValidation = await validateToolIds(toolIds);
  if (!toolValidation.valid) {
    return {
      code: 'INVALID_TOOL_IDS',
      message: 'One or more skill tool IDs do not exist in the Toolbox registry',
      details: {
        reason: `Invalid tool IDs: ${toolValidation.invalidIds.join(', ')}`,
        missingItems: toolValidation.invalidIds,
      },
    };
  }

  // 3. Source CPD status from CPD module
  const cpdStatus = await fetchCpdStatus(userId);

  // 4. Fetch Trust Score and task stats
  const trustScoreData = await fetchTrustScore(userId);
  const taskStats = await fetchTaskStats(userId);

  // 5. Build the profile record
  const now = generateTimestamp();
  const profile: FreelancerProfile = {
    userId,
    skills: input.skills.map((s) => ({ toolId: s.toolId, label: s.label })),
    cpdStatus,
    taskHistory: [],
    availability: input.availability as FreelancerProfile['availability'],
    yearsExperience: input.yearsExperience,
    trustScore: trustScoreData.overallScore,
    completedTaskCount: taskStats.completedTaskCount,
    averageRating: taskStats.averageRating,
    badges: [...trustScoreData.badges],
    createdAt: now,
    updatedAt: now,
  };

  // 6. Persist to Firestore marketplace_freelancer_profiles/{userId}
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb
      .collection('marketplace_freelancer_profiles')
      .doc(userId)
      .set({
        skills: profile.skills,
        cpdStatus: profile.cpdStatus,
        taskHistory: profile.taskHistory,
        availability: profile.availability,
        yearsExperience: profile.yearsExperience,
        trustScore: profile.trustScore,
        completedTaskCount: profile.completedTaskCount,
        averageRating: profile.averageRating,
        badges: profile.badges,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      });
  } catch (error) {
    console.error('[FreelancerHub] Failed to persist freelancer profile:', error);
    return {
      code: 'PERSISTENCE_ERROR',
      message: 'Failed to save freelancer profile',
      details: { reason: 'Firestore write failed' },
    };
  }

  // 7. Log action to audit trail
  await logMarketplaceAction({
    actorId: userId,
    actionType: 'freelancer_profile_created',
    entityId: userId,
    entityType: 'freelancer_profile',
    afterStatus: cpdStatus === 'compliant' ? 'active' : 'cpd_non_compliant',
    metadata: {
      skillCount: profile.skills.length,
      availability: profile.availability,
      yearsExperience: profile.yearsExperience,
      cpdStatus: profile.cpdStatus,
    },
  });

  return profile;
}

/**
 * Retrieves a freelancer profile from Firestore.
 *
 * Validates: Requirement 7.3
 */
export async function getProfile(
  userId: string
): Promise<FreelancerProfile | null> {
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const doc = await adminDb
      .collection('marketplace_freelancer_profiles')
      .doc(userId)
      .get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data()!;
    return {
      userId: doc.id,
      skills: data.skills || [],
      cpdStatus: data.cpdStatus,
      taskHistory: data.taskHistory || [],
      availability: data.availability,
      yearsExperience: data.yearsExperience,
      trustScore: data.trustScore,
      completedTaskCount: data.completedTaskCount,
      averageRating: data.averageRating,
      badges: data.badges || [],
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  } catch (error) {
    console.error('[FreelancerHub] Failed to fetch freelancer profile:', error);
    return null;
  }
}

/**
 * Retrieves a full freelancer profile view including analytics data.
 *
 * Returns the profile along with:
 * - Tool usage frequency per CalculatorDefinition for the last 12 months
 * - AI audit pass rate percentage for the last 12 months
 * - Dispute history (max 10 most recent)
 *
 * Validates: Requirements 7.3, 7.4
 */
export async function getProfileView(
  userId: string
): Promise<FreelancerProfileView | null> {
  // 1. Fetch the base profile
  const profile = await getProfile(userId);
  if (!profile) {
    return null;
  }

  // 2. Fetch analytics data in parallel
  const [toolUsageFrequency, aiAuditPassRate, disputeHistory] = await Promise.all([
    fetchToolUsageFrequency(userId),
    fetchAiAuditPassRate(userId),
    fetchDisputeHistory(userId, MAX_DISPUTE_HISTORY),
  ]);

  // 3. Assemble the profile view
  const profileView: FreelancerProfileView = {
    profile,
    toolUsageFrequency,
    aiAuditPassRate,
    disputeHistory: disputeHistory.slice(0, MAX_DISPUTE_HISTORY),
  };

  return profileView;
}
