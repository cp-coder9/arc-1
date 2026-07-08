/**
 * CRM Pipeline Service
 *
 * Pure business logic for CRM pipeline opportunity management. Extends the existing
 * pipelineService with practice management features:
 * - Create/update opportunities with required disciplines and probability
 * - Calculate weighted pipeline value: estimated_fee × (probability / 100)
 * - Flag high-confidence opportunities when probability > 75%
 * - Transition won opportunities to active projects
 * - Feed weighted values into Income Forecaster for pipeline-category entries
 * - Include high-confidence opportunities in Resource Planner capacity view
 *
 * This service operates on arrays of typed objects (dependency injection pattern)
 * with no Firestore dependencies.
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5
 * @module practiceManagement/crmPipelineService
 */

import type {
  PipelineOpportunity,
  CreatePipelineOpportunityInput,
  BillingRateRole,
  ForecastTriggerEvent,
} from './types';

/** Threshold above which an opportunity is considered high-confidence */
export const HIGH_CONFIDENCE_THRESHOLD = 75;

/**
 * Calculates the weighted value of a pipeline opportunity.
 *
 * Validates: Requirement 13.2
 * THE CRM_Pipeline SHALL calculate weighted pipeline value as:
 * estimated fee multiplied by probability percentage.
 *
 * @param estimatedFeeCents - The estimated fee in ZAR cents
 * @param probability - The probability percentage (0–100)
 * @returns The weighted value in ZAR cents (rounded to nearest integer)
 */
export function calculateWeightedValue(estimatedFeeCents: number, probability: number): number {
  return Math.round(estimatedFeeCents * (probability / 100));
}

/**
 * Determines whether an opportunity is high-confidence based on probability.
 *
 * Validates: Requirement 13.3
 * WHEN pipeline probability exceeds 75%, THE CRM_Pipeline SHALL flag
 * the opportunity as high-confidence.
 *
 * @param probability - The probability percentage (0–100)
 * @returns true if probability > 75%
 */
export function isHighConfidence(probability: number): boolean {
  return probability > HIGH_CONFIDENCE_THRESHOLD;
}

/**
 * Creates a new pipeline opportunity.
 *
 * Validates: Requirement 13.1
 * WHEN a pipeline opportunity is created, THE CRM_Pipeline SHALL require
 * project name, estimated fee, probability percentage (0-100), expected start date,
 * and required disciplines/roles.
 *
 * @param input - The opportunity creation input
 * @returns The newly created PipelineOpportunity
 * @throws Error if probability is not between 0 and 100
 */
export function createOpportunity(input: CreatePipelineOpportunityInput): PipelineOpportunity {
  if (input.probability < 0 || input.probability > 100) {
    throw new Error('Probability must be between 0 and 100.');
  }
  if (!input.firmId || !input.projectId || !input.title) {
    throw new Error('firmId, projectId, and title are required.');
  }
  if (input.estimatedFeeCents < 0) {
    throw new Error('estimatedFeeCents must not be negative.');
  }
  if (!input.requiredDisciplines || input.requiredDisciplines.length === 0) {
    throw new Error('At least one required discipline must be specified.');
  }

  const now = new Date().toISOString();
  const weightedValueCents = calculateWeightedValue(input.estimatedFeeCents, input.probability);
  const highConfidence = isHighConfidence(input.probability);

  return {
    // Base PipelineProject fields
    id: generateOpportunityId(input.firmId, input.projectId),
    firmId: input.firmId,
    projectId: input.projectId,
    title: input.title,
    stage: 'stage_1_inception' as unknown as import('@/types').ProjectStage,
    status: 'active',
    estimatedValueCents: input.estimatedFeeCents,
    probability: input.probability,
    expectedCloseDate: input.expectedStartDate,
    createdBy: '', // Set by caller / persistence layer
    createdAt: now,
    updatedAt: now,

    // Extended PipelineOpportunity fields
    requiredDisciplines: input.requiredDisciplines,
    requiredHeadcount: input.requiredHeadcount,
    expectedStartDate: input.expectedStartDate,
    isHighConfidence: highConfidence,
    includedInCapacity: highConfidence, // Auto-include high-confidence in capacity
    weightedValueCents,
  };
}

/**
 * Updates an existing pipeline opportunity. Returns a new PipelineOpportunity
 * with the updates applied (immutable pattern).
 *
 * Recalculates weighted value and high-confidence flag when probability or
 * estimated fee changes.
 *
 * @param existing - The current opportunity
 * @param updates - Partial updates to apply
 * @returns The updated PipelineOpportunity
 */
export function updateOpportunity(
  existing: PipelineOpportunity,
  updates: Partial<Omit<PipelineOpportunity, 'id' | 'firmId' | 'createdAt' | 'createdBy'>>,
): PipelineOpportunity {
  if (updates.probability !== undefined && (updates.probability < 0 || updates.probability > 100)) {
    throw new Error('Probability must be between 0 and 100.');
  }

  const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };

  // Recalculate derived fields
  const estimatedFee = merged.estimatedValueCents;
  const probability = merged.probability;
  merged.weightedValueCents = calculateWeightedValue(estimatedFee, probability);
  merged.isHighConfidence = isHighConfidence(probability);

  // Auto-include high-confidence opportunities in capacity view
  if (merged.isHighConfidence && !existing.includedInCapacity) {
    merged.includedInCapacity = true;
  }

  return merged;
}

/**
 * Transitions a pipeline opportunity to "won" status.
 *
 * Validates: Requirement 13.4
 * WHEN a pipeline opportunity is won, THE CRM_Pipeline SHALL transition
 * the opportunity to an active project and trigger project setup.
 *
 * @param existing - The current opportunity
 * @returns Object with updated opportunity and a ForecastTriggerEvent for downstream consumers
 */
export function winOpportunity(existing: PipelineOpportunity): {
  opportunity: PipelineOpportunity;
  triggerEvent: ForecastTriggerEvent;
} {
  if (existing.status === 'won') {
    throw new Error('Opportunity is already won.');
  }
  if (existing.status === 'lost' || existing.status === 'abandoned') {
    throw new Error('Cannot win an opportunity that has been lost or abandoned.');
  }

  const now = new Date().toISOString();
  const opportunity: PipelineOpportunity = {
    ...existing,
    status: 'won',
    probability: 100,
    weightedValueCents: existing.estimatedValueCents, // 100% probability
    isHighConfidence: true,
    includedInCapacity: true,
    closedAt: now,
    updatedAt: now,
  };

  const triggerEvent: ForecastTriggerEvent = {
    type: 'pipeline_won',
    opportunityId: existing.id,
    projectId: existing.projectId,
  };

  return { opportunity, triggerEvent };
}

/**
 * Transitions a pipeline opportunity to "lost" status.
 *
 * @param existing - The current opportunity
 * @param reason - The reason the opportunity was lost
 * @returns Object with updated opportunity and a ForecastTriggerEvent for downstream consumers
 */
export function loseOpportunity(
  existing: PipelineOpportunity,
  reason: string,
): {
  opportunity: PipelineOpportunity;
  triggerEvent: ForecastTriggerEvent;
} {
  if (existing.status === 'lost') {
    throw new Error('Opportunity is already lost.');
  }
  if (existing.status === 'won') {
    throw new Error('Cannot lose an opportunity that has already been won.');
  }

  const now = new Date().toISOString();
  const opportunity: PipelineOpportunity = {
    ...existing,
    status: 'lost',
    probability: 0,
    weightedValueCents: 0,
    isHighConfidence: false,
    includedInCapacity: false,
    closedAt: now,
    closedReason: reason,
    updatedAt: now,
  };

  const triggerEvent: ForecastTriggerEvent = {
    type: 'pipeline_lost',
    opportunityId: existing.id,
  };

  return { opportunity, triggerEvent };
}

/**
 * Calculates the total weighted pipeline value across all active opportunities for a firm.
 *
 * Validates: Requirement 13.2
 * THE CRM_Pipeline SHALL calculate weighted pipeline value as:
 * estimated fee multiplied by probability percentage.
 *
 * Validates: Requirement 13.5
 * THE CRM_Pipeline SHALL feed weighted pipeline values into the Income_Forecaster
 * for pipeline-category forecast entries.
 *
 * @param opportunities - All pipeline opportunities
 * @param firmId - The firm to calculate for
 * @returns Total weighted pipeline value in ZAR cents
 */
export function getWeightedPipelineValue(
  opportunities: PipelineOpportunity[],
  firmId: string,
): number {
  return opportunities
    .filter((o) => o.firmId === firmId && o.status === 'active')
    .reduce((sum, o) => sum + o.weightedValueCents, 0);
}

/**
 * Gets all high-confidence opportunities for a firm (probability > 75%).
 *
 * Validates: Requirement 13.3
 * WHEN pipeline probability exceeds 75%, THE CRM_Pipeline SHALL flag
 * the opportunity as high-confidence; THE Resource_Planner SHALL include
 * opportunities in the forward capacity view.
 *
 * @param opportunities - All pipeline opportunities
 * @param firmId - The firm to filter for
 * @returns Array of high-confidence PipelineOpportunity objects (active only)
 */
export function getHighConfidenceOpportunities(
  opportunities: PipelineOpportunity[],
  firmId: string,
): PipelineOpportunity[] {
  return opportunities.filter(
    (o) => o.firmId === firmId && o.status === 'active' && o.isHighConfidence,
  );
}

/**
 * Gets pipeline opportunities included in capacity view for the Resource Planner.
 * Includes high-confidence opportunities and any manually included ones.
 *
 * @param opportunities - All pipeline opportunities
 * @param firmId - The firm to filter for
 * @returns Array of opportunities included in capacity planning
 */
export function getCapacityImpactOpportunities(
  opportunities: PipelineOpportunity[],
  firmId: string,
): PipelineOpportunity[] {
  return opportunities.filter(
    (o) => o.firmId === firmId && o.status === 'active' && o.includedInCapacity,
  );
}

/**
 * Generates pipeline forecast entries for the Income Forecaster.
 *
 * Validates: Requirement 13.5
 * THE CRM_Pipeline SHALL feed weighted pipeline values into the Income_Forecaster
 * for pipeline-category forecast entries.
 *
 * @param opportunities - All pipeline opportunities
 * @param firmId - The firm to generate forecast entries for
 * @returns Array of pipeline forecast entries with month, weighted value, and project reference
 */
export function getPipelineForecastEntries(
  opportunities: PipelineOpportunity[],
  firmId: string,
): Array<{
  projectId: string;
  projectName: string;
  amountCents: number;
  expectedStartDate?: string;
}> {
  return opportunities
    .filter((o) => o.firmId === firmId && o.status === 'active')
    .map((o) => ({
      projectId: o.projectId,
      projectName: o.title,
      amountCents: o.weightedValueCents,
      expectedStartDate: o.expectedStartDate,
    }));
}

/**
 * Generates a deterministic opportunity ID.
 */
function generateOpportunityId(firmId: string, projectId: string): string {
  return `opp_${firmId}_${projectId}_${Date.now()}`;
}
