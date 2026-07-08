/**
 * Income Forecast Service
 *
 * Pure business logic for monthly income forecasting. Provides:
 * - Month-by-month forecast based on stage completion dates and fee milestones
 * - Confidence level categorisation: confirmed (invoice raised), probable (stage nearing completion), pipeline (CRM entries)
 * - Transition from probable to confirmed when stage marked complete and ready for invoicing
 * - Rolling 12-month forecast aggregated across all active and pipeline projects
 * - Auto-update as timelines change, invoices raised, or pipeline projects won/lost
 *
 * This service operates on typed data objects (dependency injection pattern)
 * with no Firestore dependencies.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
 * @module practiceManagement/incomeForecastService
 */

import type {
  ForecastConfidence,
  MonthlyForecastEntry,
  IncomeForecast,
  ForecastTriggerEvent,
  SacapWorkStage,
} from './types';

// ─── Input Types ─────────────────────────────────────────────────────────────

/**
 * Represents an active project with stage-level fee milestones and expected completion dates.
 * Used as input to generate forecast entries.
 */
export interface ForecastProjectInput {
  projectId: string;
  projectName: string;
  stages: ForecastStageInput[];
}

/**
 * A single stage milestone within a project forecast.
 */
export interface ForecastStageInput {
  stage: SacapWorkStage;
  /** Fee amount for this stage in cents */
  feeCents: number;
  /** Expected completion month in 'YYYY-MM' format */
  expectedCompletionMonth: string;
  /** Whether an invoice has already been raised for this stage */
  invoiceRaised: boolean;
  /** Whether the stage is nearing completion (e.g. >75% through) */
  nearingCompletion: boolean;
}

/**
 * A pipeline opportunity providing pipeline-confidence forecast entries.
 */
export interface ForecastPipelineInput {
  projectId: string;
  projectName: string;
  /** Weighted pipeline value (fee × probability) in cents */
  weightedValueCents: number;
  /** Expected month when income would materialise, in 'YYYY-MM' format */
  expectedMonth: string;
}

/**
 * The current state of the forecast — used for update operations.
 */
export interface ForecastState {
  firmId: string;
  entries: ForecastEntryState[];
}

/**
 * An individual entry in the forecast state (denormalised for mutation).
 */
export interface ForecastEntryState {
  projectId: string;
  projectName: string;
  amountCents: number;
  confidence: ForecastConfidence;
  month: string;
  stage?: SacapWorkStage;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Default number of months for a rolling forecast */
export const DEFAULT_FORECAST_MONTHS = 12;

// ─── Confidence Determination ────────────────────────────────────────────────

/**
 * Determines the confidence level for a project stage forecast entry.
 *
 * Validates: Requirement 11.2
 * THE Income_Forecaster SHALL categorise forecast income by confidence level:
 * - confirmed: invoice raised
 * - probable: stage nearing completion
 * - pipeline: from CRM_Pipeline entries
 *
 * @param stage - The stage input data
 * @returns The appropriate confidence level
 */
export function determineConfidence(stage: ForecastStageInput): ForecastConfidence {
  if (stage.invoiceRaised) return 'confirmed';
  if (stage.nearingCompletion) return 'probable';
  return 'pipeline';
}

// ─── Monthly Breakdown ───────────────────────────────────────────────────────

/**
 * Generates a monthly breakdown of forecast entries for a firm.
 *
 * Validates: Requirement 11.1
 * THE Income_Forecaster SHALL generate a month-by-month forecast showing expected
 * income per project based on stage completion dates and fee milestones.
 *
 * @param projects - Active projects with stage milestones
 * @param pipelineEntries - Pipeline opportunities
 * @param months - Number of months to forecast (defaults to 12)
 * @param startMonth - The starting month in 'YYYY-MM' format (defaults to current month)
 * @returns Array of MonthlyForecastEntry ordered chronologically
 */
export function getMonthlyBreakdown(
  projects: ForecastProjectInput[],
  pipelineEntries: ForecastPipelineInput[],
  months: number = DEFAULT_FORECAST_MONTHS,
  startMonth?: string,
): MonthlyForecastEntry[] {
  const start = startMonth ?? getCurrentMonth();
  const monthRange = generateMonthRange(start, months);

  // Build entries from project stages
  const allEntries: ForecastEntryState[] = [];

  for (const project of projects) {
    for (const stage of project.stages) {
      const confidence = determineConfidence(stage);
      allEntries.push({
        projectId: project.projectId,
        projectName: project.projectName,
        amountCents: stage.feeCents,
        confidence,
        month: stage.expectedCompletionMonth,
        stage: stage.stage,
      });
    }
  }

  // Add pipeline entries
  for (const pipeline of pipelineEntries) {
    allEntries.push({
      projectId: pipeline.projectId,
      projectName: pipeline.projectName,
      amountCents: pipeline.weightedValueCents,
      confidence: 'pipeline',
      month: pipeline.expectedMonth,
    });
  }

  // Group entries by month and build MonthlyForecastEntry for each month in range
  const monthlyEntries: MonthlyForecastEntry[] = monthRange.map((month) => {
    const entriesForMonth = allEntries.filter((e) => e.month === month);
    return buildMonthlyEntry(month, entriesForMonth);
  });

  return monthlyEntries;
}

// ─── Generate Forecast ───────────────────────────────────────────────────────

/**
 * Generates a complete income forecast for the firm.
 *
 * Validates: Requirements 11.1, 11.2, 11.4
 * THE Income_Forecaster SHALL generate a month-by-month forecast.
 * THE Income_Forecaster SHALL provide a rolling 12-month forecast view
 * aggregated across all active and pipeline projects.
 *
 * @param firmId - The firm identifier
 * @param projects - Active projects with stage milestones
 * @param pipelineEntries - Pipeline opportunities
 * @param months - Number of months to forecast (defaults to 12)
 * @param startMonth - The starting month (defaults to current month)
 * @returns Complete IncomeForecast with monthly breakdown and totals
 */
export function generateForecast(
  firmId: string,
  projects: ForecastProjectInput[],
  pipelineEntries: ForecastPipelineInput[],
  months: number = DEFAULT_FORECAST_MONTHS,
  startMonth?: string,
): IncomeForecast {
  const monthlyBreakdown = getMonthlyBreakdown(projects, pipelineEntries, months, startMonth);

  const totalConfirmedCents = monthlyBreakdown.reduce((sum, m) => sum + m.confirmedCents, 0);
  const totalProbableCents = monthlyBreakdown.reduce((sum, m) => sum + m.probableCents, 0);
  const totalPipelineCents = monthlyBreakdown.reduce((sum, m) => sum + m.pipelineCents, 0);

  return {
    firmId,
    generatedAt: new Date().toISOString(),
    months: monthlyBreakdown,
    totalConfirmedCents,
    totalProbableCents,
    totalPipelineCents,
  };
}

// ─── Event-Driven Updates ────────────────────────────────────────────────────

/**
 * Updates a forecast state based on a trigger event.
 *
 * Validates: Requirements 11.3, 11.5
 * WHEN a project stage is marked complete and ready for invoicing, THE Income_Forecaster
 * SHALL move the associated fee amount from probable to confirmed only if the fee is
 * currently categorised as probable.
 * THE Income_Forecaster SHALL update forecast values automatically as project timelines
 * change, invoices are raised, or pipeline projects are won or lost.
 *
 * @param state - The current forecast state
 * @param event - The trigger event that causes the update
 * @returns Updated forecast state (new array, does not mutate original)
 */
export function updateForecastOnEvent(
  state: ForecastState,
  event: ForecastTriggerEvent,
): ForecastState {
  const entries = [...state.entries];

  switch (event.type) {
    case 'invoice_raised':
      return handleInvoiceRaised(state, entries, event);

    case 'stage_completed':
      return handleStageCompleted(state, entries, event);

    case 'pipeline_won':
      return handlePipelineWon(state, entries, event);

    case 'pipeline_lost':
      return handlePipelineLost(state, entries, event);

    case 'timeline_changed':
      // Timeline changes are handled by re-generating the forecast with updated
      // stage data. This event signals the need for regeneration but does not
      // directly mutate entries — callers should regenerate the full forecast.
      return { ...state, entries };

    default:
      return { ...state, entries };
  }
}

// ─── Event Handlers ──────────────────────────────────────────────────────────

/**
 * Handles 'invoice_raised' event: moves matching probable/pipeline entries to confirmed.
 *
 * Validates: Requirement 11.2
 * Confirmed = invoice raised
 */
function handleInvoiceRaised(
  state: ForecastState,
  entries: ForecastEntryState[],
  event: Extract<ForecastTriggerEvent, { type: 'invoice_raised' }>,
): ForecastState {
  const updatedEntries = entries.map((entry) => {
    if (entry.projectId === event.projectId && entry.confidence !== 'confirmed') {
      return { ...entry, confidence: 'confirmed' as ForecastConfidence };
    }
    return entry;
  });

  return { ...state, entries: updatedEntries };
}

/**
 * Handles 'stage_completed' event: moves probable entries for the stage to confirmed.
 *
 * Validates: Requirement 11.3
 * WHEN a project stage is marked complete and ready for invoicing, THE Income_Forecaster
 * SHALL move the associated fee amount from probable to confirmed only if the fee is
 * currently categorised as probable.
 */
function handleStageCompleted(
  state: ForecastState,
  entries: ForecastEntryState[],
  event: Extract<ForecastTriggerEvent, { type: 'stage_completed' }>,
): ForecastState {
  const updatedEntries = entries.map((entry) => {
    if (
      entry.projectId === event.projectId &&
      entry.stage === event.stage &&
      entry.confidence === 'probable'
    ) {
      return { ...entry, confidence: 'confirmed' as ForecastConfidence };
    }
    return entry;
  });

  return { ...state, entries: updatedEntries };
}

/**
 * Handles 'pipeline_won' event: moves pipeline entries to probable for the won project.
 *
 * Validates: Requirement 11.5
 * When a pipeline opportunity is won, it becomes an active project with probable income.
 */
function handlePipelineWon(
  state: ForecastState,
  entries: ForecastEntryState[],
  event: Extract<ForecastTriggerEvent, { type: 'pipeline_won' }>,
): ForecastState {
  const updatedEntries = entries.map((entry) => {
    if (entry.projectId === event.projectId && entry.confidence === 'pipeline') {
      return { ...entry, confidence: 'probable' as ForecastConfidence };
    }
    return entry;
  });

  return { ...state, entries: updatedEntries };
}

/**
 * Handles 'pipeline_lost' event: removes pipeline entries for the lost opportunity.
 *
 * Validates: Requirement 11.5
 * When a pipeline opportunity is lost, its forecast entries are removed.
 */
function handlePipelineLost(
  state: ForecastState,
  entries: ForecastEntryState[],
  event: Extract<ForecastTriggerEvent, { type: 'pipeline_lost' }>,
): ForecastState {
  // Remove entries that match the lost opportunity's project ID with pipeline confidence
  // Since ForecastTriggerEvent for pipeline_lost only has opportunityId,
  // we filter out any pipeline entries whose projectId matches opportunityId
  const updatedEntries = entries.filter((entry) => {
    if (entry.projectId === event.opportunityId && entry.confidence === 'pipeline') {
      return false;
    }
    return true;
  });

  return { ...state, entries: updatedEntries };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Builds a MonthlyForecastEntry from a collection of entries for a specific month.
 */
function buildMonthlyEntry(
  month: string,
  entries: ForecastEntryState[],
): MonthlyForecastEntry {
  const confirmedCents = entries
    .filter((e) => e.confidence === 'confirmed')
    .reduce((sum, e) => sum + e.amountCents, 0);

  const probableCents = entries
    .filter((e) => e.confidence === 'probable')
    .reduce((sum, e) => sum + e.amountCents, 0);

  const pipelineCents = entries
    .filter((e) => e.confidence === 'pipeline')
    .reduce((sum, e) => sum + e.amountCents, 0);

  const totalCents = confirmedCents + probableCents + pipelineCents;

  const projects = entries.map((e) => ({
    projectId: e.projectId,
    projectName: e.projectName,
    amountCents: e.amountCents,
    confidence: e.confidence,
    stage: e.stage,
  }));

  return {
    month,
    confirmedCents,
    probableCents,
    pipelineCents,
    totalCents,
    projects,
  };
}

/**
 * Gets the current month in 'YYYY-MM' format.
 */
function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Generates an array of month strings starting from startMonth for the given count.
 *
 * @param startMonth - Starting month in 'YYYY-MM' format
 * @param count - Number of months to generate
 * @returns Array of month strings in 'YYYY-MM' format
 */
export function generateMonthRange(startMonth: string, count: number): string[] {
  const [startYear, startMon] = startMonth.split('-').map(Number);
  const months: string[] = [];

  for (let i = 0; i < count; i++) {
    const totalMonths = (startYear * 12 + (startMon - 1)) + i;
    const year = Math.floor(totalMonths / 12);
    const month = (totalMonths % 12) + 1;
    months.push(`${year}-${String(month).padStart(2, '0')}`);
  }

  return months;
}
