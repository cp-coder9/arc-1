/**
 * Town Planning Workflow Tracker
 *
 * State machine for SPLUMA application stage transitions.
 * Enforces permitted transitions and maintains stage history.
 */

import type {
  ApplicationStage,
  LandUseApplication,
  StageHistoryEntry,
  ApplicationDeadline,
} from '../types';
import type { FirestoreDB } from './accessControl';
import { addWorkingDays, isWorkingDay } from './dateUtils';

// ─── Transition Error ─────────────────────────────────────────────────────────

export class TransitionError extends Error {
  public readonly currentStage: ApplicationStage;
  public readonly targetStage: ApplicationStage;
  public readonly code: string;

  constructor(
    currentStage: ApplicationStage,
    targetStage: ApplicationStage,
    message: string,
  ) {
    super(message);
    this.name = 'TransitionError';
    this.currentStage = currentStage;
    this.targetStage = targetStage;
    this.code = 'INVALID_TRANSITION';
  }
}

// ─── Permitted Transitions ────────────────────────────────────────────────────

/**
 * The SPLUMA application stage state machine.
 * Each key maps to an array of valid target stages.
 * 'withdrawn' is always reachable from any stage.
 */
export const PERMITTED_TRANSITIONS: Record<ApplicationStage, ApplicationStage[]> = {
  preparation: ['submission', 'withdrawn'],
  submission: ['acknowledgement', 'withdrawn'],
  acknowledgement: ['circulation', 'withdrawn'],
  circulation: ['advertising', 'withdrawn'],
  advertising: ['comment_period', 'withdrawn'],
  comment_period: ['hearing', 'decision', 'withdrawn'],
  hearing: ['decision', 'withdrawn'],
  decision: ['conditions_compliance', 'appeal', 'withdrawn'],
  conditions_compliance: ['withdrawn'],
  appeal: ['withdrawn'],
  withdrawn: [],
};

// ─── Stage Deadline Definitions (working days) ────────────────────────────────

const STAGE_DEADLINES: Partial<Record<ApplicationStage, { workingDays: number; description: string }>> = {
  acknowledgement: { workingDays: 14, description: 'Municipality must acknowledge receipt' },
  circulation: { workingDays: 21, description: 'Internal department circulation' },
  advertising: { workingDays: 5, description: 'Publication of notice' },
  comment_period: { workingDays: 30, description: 'Public comment period' },
  decision: { workingDays: 60, description: 'Tribunal/authority decision deadline' },
};

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Validate and execute a stage transition on an application.
 * Returns the updated application. Throws TransitionError if invalid.
 */
export function transitionStage(
  application: LandUseApplication,
  targetStage: ApplicationStage,
  triggeredBy: string,
  notes?: string,
): LandUseApplication {
  const { currentStage } = application;

  // Validate transition
  const permitted = PERMITTED_TRANSITIONS[currentStage];
  if (!permitted || !permitted.includes(targetStage)) {
    throw new TransitionError(
      currentStage,
      targetStage,
      `Cannot transition from '${currentStage}' to '${targetStage}'. Permitted: [${permitted?.join(', ') ?? 'none'}]`,
    );
  }

  const now = new Date().toISOString();

  // Close the current stage history entry
  const updatedHistory: StageHistoryEntry[] = application.stageHistory.map((entry) => {
    if (entry.stage === currentStage && !entry.exitedAt) {
      return { ...entry, exitedAt: now };
    }
    return entry;
  });

  // Add new stage entry
  updatedHistory.push({
    stage: targetStage,
    enteredAt: now,
    triggeredBy,
    notes,
  });

  return {
    ...application,
    currentStage: targetStage,
    stageHistory: updatedHistory,
    updatedAt: now,
  };
}

/**
 * Get the stage history for an application.
 */
export function getStageHistory(application: LandUseApplication): StageHistoryEntry[] {
  return application.stageHistory;
}

/**
 * Calculate deadlines for an application based on its current stage and municipality timelines.
 */
export function getDeadlines(
  application: LandUseApplication,
  municipalityOverrides?: Partial<Record<ApplicationStage, number>>,
): ApplicationDeadline[] {
  const deadlines: ApplicationDeadline[] = [];
  const now = new Date();

  // Find when the current stage was entered
  const currentEntry = application.stageHistory.find(
    (entry) => entry.stage === application.currentStage && !entry.exitedAt,
  );

  if (!currentEntry) return deadlines;

  const enteredAt = new Date(currentEntry.enteredAt);

  // Calculate deadline for current stage
  const stageConfig = STAGE_DEADLINES[application.currentStage];
  if (stageConfig) {
    const workingDays = municipalityOverrides?.[application.currentStage] ?? stageConfig.workingDays;
    const dueDate = addWorkingDays(enteredAt, workingDays);

    deadlines.push({
      stage: application.currentStage,
      dueDate: dueDate.toISOString(),
      workingDays,
      description: stageConfig.description,
      isOverdue: now > dueDate,
    });
  }

  // Calculate future stage deadlines (projected from current)
  const futureStages = getProjectedStages(application.currentStage);
  let projectedDate = enteredAt;

  for (const futureStage of futureStages) {
    const futureConfig = STAGE_DEADLINES[futureStage];
    if (futureConfig) {
      const workingDays = municipalityOverrides?.[futureStage] ?? futureConfig.workingDays;
      projectedDate = addWorkingDays(projectedDate, workingDays);

      deadlines.push({
        stage: futureStage,
        dueDate: projectedDate.toISOString(),
        workingDays,
        description: futureConfig.description,
        isOverdue: false,
      });
    }
  }

  return deadlines;
}

/**
 * Get the projected forward path from a given stage (linear happy path).
 */
function getProjectedStages(from: ApplicationStage): ApplicationStage[] {
  const linearPath: ApplicationStage[] = [
    'preparation',
    'submission',
    'acknowledgement',
    'circulation',
    'advertising',
    'comment_period',
    'hearing',
    'decision',
    'conditions_compliance',
  ];

  const currentIndex = linearPath.indexOf(from);
  if (currentIndex === -1) return [];
  return linearPath.slice(currentIndex + 1);
}

/**
 * Persist a stage transition to Firestore.
 */
export async function persistTransition(
  db: FirestoreDB,
  applicationId: string,
  updatedApplication: LandUseApplication,
): Promise<void> {
  const docRef = db.collection('town_planning_applications').doc(applicationId);
  await docRef.update({
    currentStage: updatedApplication.currentStage,
    stageHistory: updatedApplication.stageHistory as unknown as Record<string, unknown>[],
    updatedAt: updatedApplication.updatedAt,
  });

  // Update Project Passport
  const { updateProjectPassport } = await import('../adapters/passportAdapter');
  await updateProjectPassport(db, updatedApplication.projectId, {
    applicationId,
    applicationType: updatedApplication.applicationType,
    currentStage: updatedApplication.currentStage,
    referenceNumber: updatedApplication.referenceNumber,
    decision: updatedApplication.decision as any,
    lastUpdated: updatedApplication.updatedAt,
  });
}
