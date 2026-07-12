/**
 * Environmental & Heritage Module — Heritage Workflow Service
 *
 * Pure business logic for managing NHRA Section 38 heritage impact assessment
 * workflows. Handles stage transitions, practitioner recording when assessment
 * is required, and determination recording (permit issued / no further action).
 *
 * Stage transitions (Property 27):
 *   notification_submitted → interim_comment_received
 *   interim_comment_received → assessment_required OR no_further_action_required
 *   assessment_required → hia_undertaken
 *   hia_undertaken → hia_report_submitted
 *   hia_report_submitted → heritage_authority_review
 *   heritage_authority_review → permit_issued
 *
 * Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8
 */

import type { HeritageAssessment, HeritageStage } from '../types';

// ─── Service Result Pattern ───────────────────────────────────────────────────

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

// ─── Heritage Transition Parameters ───────────────────────────────────────────

export interface HeritageTransitionParams {
  actorId: string;
  practitioner?: {
    name: string;
    firmName: string;
    contactEmail: string;
  };
  permitReferenceNumber?: string;
  conditions?: string[];
}

// ─── Permitted Transitions Map ────────────────────────────────────────────────

/**
 * Valid transitions for the heritage workflow state machine.
 *
 * Key design decisions:
 * - notification_submitted can only advance to interim_comment_received
 * - interim_comment_received branches: assessment_required OR no_further_action_required
 * - assessment_required follows the full HIA path to permit_issued
 * - no_further_action_required and permit_issued are terminal states
 */
const HERITAGE_TRANSITIONS: Record<HeritageStage, HeritageStage[]> = {
  notification_submitted: ['interim_comment_received'],
  interim_comment_received: ['assessment_required', 'no_further_action_required'],
  assessment_required: ['hia_undertaken'],
  hia_undertaken: ['hia_report_submitted'],
  hia_report_submitted: ['heritage_authority_review'],
  heritage_authority_review: ['permit_issued'],
  permit_issued: [],
  no_further_action_required: [],
};

// ─── Public Functions ─────────────────────────────────────────────────────────

/**
 * Returns permitted next stages for a given heritage stage.
 *
 * Validates: Requirement 17.2
 */
export function getPermittedHeritageTransitions(
  currentStage: HeritageStage,
): ServiceResult<HeritageStage[]> {
  if (!currentStage) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Current stage is required.',
      },
    };
  }

  const permitted = HERITAGE_TRANSITIONS[currentStage];

  if (permitted === undefined) {
    return {
      success: false,
      error: {
        code: 'INVALID_STAGE',
        message: `Stage '${currentStage}' is not a valid heritage stage.`,
      },
    };
  }

  return { success: true, data: permitted };
}

/**
 * Transitions a heritage assessment to a target stage, validating that the
 * transition is permitted. Records practitioner details when transitioning to
 * assessment_required, and determination details when transitioning to
 * permit_issued or no_further_action_required.
 *
 * Validates: Requirements 17.2, 17.3, 17.4
 */
export function transitionHeritageAssessment(
  assessment: HeritageAssessment,
  targetStage: HeritageStage,
  params?: HeritageTransitionParams,
): ServiceResult<{ next: HeritageAssessment; valid: boolean; error?: string }> {
  if (!assessment) {
    return {
      success: false,
      error: {
        code: 'INVALID_ASSESSMENT',
        message: 'Heritage assessment record is required.',
      },
    };
  }

  if (!params?.actorId) {
    return {
      success: false,
      error: {
        code: 'ACTOR_REQUIRED',
        message: 'Actor ID is required for stage transitions.',
      },
    };
  }

  // Validate the target stage is in the permitted transitions
  const permitted = HERITAGE_TRANSITIONS[assessment.currentStage];

  if (permitted === undefined) {
    return {
      success: false,
      error: {
        code: 'INVALID_CURRENT_STAGE',
        message: `Current stage '${assessment.currentStage}' is not a valid heritage stage.`,
      },
    };
  }

  if (!permitted.includes(targetStage)) {
    return {
      success: true,
      data: {
        next: assessment,
        valid: false,
        error: `Cannot transition from '${assessment.currentStage}' to '${targetStage}'. Permitted transitions: ${permitted.length > 0 ? permitted.join(', ') : 'none (terminal state)'}.`,
      },
    };
  }

  // When transitioning to assessment_required, practitioner details should be recorded (Req 17.3)
  if (targetStage === 'assessment_required' && params.practitioner) {
    if (!params.practitioner.name || !params.practitioner.firmName || !params.practitioner.contactEmail) {
      return {
        success: true,
        data: {
          next: assessment,
          valid: false,
          error: 'Practitioner details (name, firmName, contactEmail) are required when transitioning to assessment_required.',
        },
      };
    }
  }

  const now = new Date().toISOString();

  // Build the updated assessment
  const next: HeritageAssessment = {
    ...assessment,
    currentStage: targetStage,
    stageHistory: [
      ...assessment.stageHistory,
      {
        stage: targetStage,
        date: now.split('T')[0],
        actor: params.actorId,
      },
    ],
    updatedAt: now,
  };

  // Record practitioner details when transitioning to assessment_required (Req 17.3)
  if (targetStage === 'assessment_required' && params.practitioner) {
    next.assessmentPractitioner = `${params.practitioner.name} | ${params.practitioner.firmName} | ${params.practitioner.contactEmail}`;
  }

  // Record determination details when transitioning to permit_issued (Req 17.4)
  if (targetStage === 'permit_issued') {
    next.determinationDate = now.split('T')[0];
    if (params.permitReferenceNumber) {
      next.permitReferenceNumber = params.permitReferenceNumber;
    }
    if (params.conditions && params.conditions.length > 0) {
      next.conditions = params.conditions;
    }
  }

  // Record determination details when transitioning to no_further_action_required (Req 17.4)
  if (targetStage === 'no_further_action_required') {
    next.determinationDate = now.split('T')[0];
    if (params.conditions && params.conditions.length > 0) {
      next.conditions = params.conditions;
    }
  }

  return {
    success: true,
    data: {
      next,
      valid: true,
    },
  };
}
