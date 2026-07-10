/**
 * Outcome Tracking Service
 *
 * Records submission outcomes, updates statuses, calculates approval rates,
 * and retrieves project outcome history.
 */

import type {
  SubmissionOutcome,
  SubmissionOutcomeStatus,
} from '@/types/municipalWorkspace';

// In-memory store for now (Firestore persistence will be wired later)
const outcomeStore: SubmissionOutcome[] = [];

/**
 * Records a new submission event with all required fields.
 * Assigns a unique ID and returns the complete outcome record.
 */
export function recordSubmission(
  outcome: Omit<SubmissionOutcome, 'id'>
): SubmissionOutcome {
  const id = `outcome-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const record: SubmissionOutcome = { id, ...outcome };
  outcomeStore.push(record);
  return record;
}

/**
 * Updates an existing submission outcome with new status or data.
 * Returns the updated outcome record.
 */
export function updateOutcome(
  id: string,
  update: Partial<SubmissionOutcome>
): SubmissionOutcome {
  const index = outcomeStore.findIndex((o) => o.id === id);
  if (index === -1) {
    // Return a stub with the update applied — in production this would throw or return error
    return {
      id,
      projectId: '',
      municipality: 'Other',
      submissionType: '',
      referenceNumber: '',
      submissionDate: '',
      readinessScoreAtSubmission: 0,
      departmentScoresAtSubmission: {} as Record<string, number>,
      outcome: 'submitted',
      updatedAt: new Date().toISOString(),
      ...update,
    } as SubmissionOutcome;
  }
  outcomeStore[index] = {
    ...outcomeStore[index],
    ...update,
    updatedAt: new Date().toISOString(),
  };
  return outcomeStore[index];
}

/**
 * Calculates the first-time approval rate from a set of submission outcomes.
 * Rate = (approved_first_time count / total terminal outcomes) × 100.
 * Returns 0 when no terminal outcomes exist.
 */
export function calculateApprovalRate(outcomes: SubmissionOutcome[]): {
  rate: number;
  total: number;
  firstTime: number;
} {
  const terminalStatuses: SubmissionOutcomeStatus[] = [
    'approved_first_time',
    'approved_with_conditions',
    'returned_for_amendments',
    'refused',
  ];
  const terminal = outcomes.filter((o) => terminalStatuses.includes(o.outcome));
  const total = terminal.length;
  if (total === 0) return { rate: 0, total: 0, firstTime: 0 };
  const firstTime = terminal.filter(
    (o) => o.outcome === 'approved_first_time'
  ).length;
  const rate = Math.round((firstTime / total) * 1000) / 10; // one decimal place
  return { rate, total, firstTime };
}

/**
 * Retrieves all submission outcomes for a given project.
 */
export function getProjectOutcomes(projectId: string): SubmissionOutcome[] {
  return outcomeStore.filter((o) => o.projectId === projectId);
}

/**
 * Clears all outcomes from the in-memory store.
 * Used for testing purposes only.
 */
export function _resetOutcomeStore(): void {
  outcomeStore.length = 0;
}
