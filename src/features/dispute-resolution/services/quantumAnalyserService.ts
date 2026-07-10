/**
 * Quantum Analyser Service
 *
 * Provides structured support for quantum (cost) assessments and delay analyses
 * attached to formal claims. Auto-calculates line item amounts, category subtotals,
 * percentages, working days impacted, and net claimable delay.
 *
 * Key calculations:
 *   amount = Math.round(quantity * rate * 100) / 100
 *   subtotalByCategory[cat] = sum of amounts for that category
 *   totalQuantumAmount = sum of all subtotals
 *   percentageByCategory[cat] = round((subtotal / total) * 100, 1) or 0 if total is 0
 *   netClaimableDelay = employer critical_path days - shared concurrent days
 *   totalByParty[party] = sum of workingDaysImpacted for that party
 *
 * Requirements: 9.1–9.9
 */

import type {
  QuantumAssessment,
  QuantumLineItem,
  CostCategory,
  DelayAnalysis,
  DelayEvent,
  ResponsibleParty,
} from '../types';
import { quantumLineItemSchema, delayEventSchema } from '../schemas';
import type { QuantumLineItemInput, DelayEventInput } from '../schemas';
import type { WorkingDayCalculator } from '../../p1-shared/services/workingDayCalculator';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuantumAnalyserServiceOptions {
  /** Injectable working day calculator for delay analysis. */
  workingDayCalculator: WorkingDayCalculator;
  /** Injectable clock for deterministic testing. Returns ISO date-time string. */
  now?: () => string;
}

export interface QuantumAnalyserService {
  /** Create a new quantum assessment for a claim. */
  createAssessment(claimId: string, projectId: string): QuantumAssessment;
  /** Add a line item to an assessment. Validates input, auto-calculates amount. */
  addLineItem(assessmentId: string, input: QuantumLineItemInput): QuantumAssessment;
  /** Remove a line item from an assessment and recalculate totals. */
  removeLineItem(assessmentId: string, itemId: string): QuantumAssessment;
  /** Create a new delay analysis for a claim. */
  createDelayAnalysis(claimId: string, projectId: string): DelayAnalysis;
  /** Add a delay event to an analysis. Validates input, auto-calculates working days. */
  addDelayEvent(analysisId: string, input: DelayEventInput): DelayAnalysis;
  /** Remove a delay event from an analysis and recalculate totals. */
  removeDelayEvent(analysisId: string, eventId: string): DelayAnalysis;
  /** Mark an assessment or analysis as completed. */
  markCompleted(id: string, linkToClaim: boolean, actorId: string): void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_LINE_ITEMS = 500;
const MAX_DELAY_EVENTS = 200;

const ALL_COST_CATEGORIES: CostCategory[] = [
  'labour', 'materials', 'plant', 'preliminaries', 'overheads', 'profit', 'other',
];

const ALL_RESPONSIBLE_PARTIES: ResponsibleParty[] = [
  'employer', 'contractor', 'neutral', 'shared',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptySubtotalByCategory(): Record<CostCategory, number> {
  const record = {} as Record<CostCategory, number>;
  for (const cat of ALL_COST_CATEGORIES) {
    record[cat] = 0;
  }
  return record;
}

function emptyPercentageByCategory(): Record<CostCategory, number> {
  const record = {} as Record<CostCategory, number>;
  for (const cat of ALL_COST_CATEGORIES) {
    record[cat] = 0;
  }
  return record;
}

function emptyTotalByParty(): Record<ResponsibleParty, number> {
  const record = {} as Record<ResponsibleParty, number>;
  for (const party of ALL_RESPONSIBLE_PARTIES) {
    record[party] = 0;
  }
  return record;
}

/**
 * Recalculate subtotals, total, and percentages for a quantum assessment.
 */
function recalculateQuantumTotals(assessment: QuantumAssessment): void {
  const subtotals = emptySubtotalByCategory();

  for (const item of assessment.lineItems) {
    subtotals[item.costCategory] += item.amount;
  }

  // Round subtotals to 2dp to avoid floating-point drift
  for (const cat of ALL_COST_CATEGORIES) {
    subtotals[cat] = Math.round(subtotals[cat] * 100) / 100;
  }

  const total = Math.round(
    ALL_COST_CATEGORIES.reduce((sum, cat) => sum + subtotals[cat], 0) * 100
  ) / 100;

  const percentages = emptyPercentageByCategory();
  if (total > 0) {
    for (const cat of ALL_COST_CATEGORIES) {
      percentages[cat] = Math.round((subtotals[cat] / total) * 100 * 10) / 10;
    }
  }

  assessment.subtotalByCategory = subtotals;
  assessment.totalQuantumAmount = total;
  assessment.percentageByCategory = percentages;
}

/**
 * Recalculate totalByParty and netClaimableDelay for a delay analysis.
 *
 * netClaimableDelay = (employer critical_path days) - (shared concurrent days)
 */
function recalculateDelayTotals(analysis: DelayAnalysis): void {
  const byParty = emptyTotalByParty();

  let employerCriticalPathDays = 0;
  let sharedConcurrentDays = 0;

  for (const event of analysis.events) {
    byParty[event.responsibleParty] += event.workingDaysImpacted;

    if (event.responsibleParty === 'employer' && event.delayType === 'critical_path') {
      employerCriticalPathDays += event.workingDaysImpacted;
    }
    if (event.responsibleParty === 'shared' && event.delayType === 'concurrent') {
      sharedConcurrentDays += event.workingDaysImpacted;
    }
  }

  analysis.totalByParty = byParty;
  analysis.netClaimableDelay = employerCriticalPathDays - sharedConcurrentDays;
}

// ─── Implementation ───────────────────────────────────────────────────────────

class QuantumAnalyserServiceImpl implements QuantumAnalyserService {
  private assessments: Map<string, QuantumAssessment> = new Map();
  private delayAnalyses: Map<string, DelayAnalysis> = new Map();
  private readonly workingDayCalculator: WorkingDayCalculator;
  private readonly now: () => string;

  constructor(options: QuantumAnalyserServiceOptions) {
    this.workingDayCalculator = options.workingDayCalculator;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  // ─── Quantum Assessment ─────────────────────────────────────────────────

  createAssessment(claimId: string, projectId: string): QuantumAssessment {
    const id = this.generateId('qa');
    const timestamp = this.now();

    const assessment: QuantumAssessment = {
      id,
      claimId,
      projectId,
      lineItems: [],
      subtotalByCategory: emptySubtotalByCategory(),
      totalQuantumAmount: 0,
      percentageByCategory: emptyPercentageByCategory(),
      isCompleted: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.assessments.set(id, assessment);
    return this.cloneAssessment(assessment);
  }

  addLineItem(assessmentId: string, input: QuantumLineItemInput): QuantumAssessment {
    const assessment = this.assessments.get(assessmentId);
    if (!assessment) {
      throw new Error(`Quantum assessment not found: ${assessmentId}`);
    }

    if (assessment.lineItems.length >= MAX_LINE_ITEMS) {
      throw new Error(
        `Cannot add line item: maximum of ${MAX_LINE_ITEMS} items reached`
      );
    }

    // Validate input with Zod schema
    const parsed = quantumLineItemSchema.parse(input);

    // Auto-calculate amount = round(quantity * rate, 2)
    const amount = Math.round(parsed.quantity * parsed.rate * 100) / 100;

    const lineItem: QuantumLineItem = {
      id: this.generateId('qli'),
      assessmentId,
      description: parsed.description,
      costCategory: parsed.costCategory,
      unit: parsed.unit,
      quantity: parsed.quantity,
      rate: parsed.rate,
      amount,
    };

    assessment.lineItems.push(lineItem);
    recalculateQuantumTotals(assessment);
    assessment.updatedAt = this.now();

    return this.cloneAssessment(assessment);
  }

  removeLineItem(assessmentId: string, itemId: string): QuantumAssessment {
    const assessment = this.assessments.get(assessmentId);
    if (!assessment) {
      throw new Error(`Quantum assessment not found: ${assessmentId}`);
    }

    const index = assessment.lineItems.findIndex((item) => item.id === itemId);
    if (index === -1) {
      throw new Error(`Line item not found: ${itemId}`);
    }

    assessment.lineItems.splice(index, 1);
    recalculateQuantumTotals(assessment);
    assessment.updatedAt = this.now();

    return this.cloneAssessment(assessment);
  }

  // ─── Delay Analysis ─────────────────────────────────────────────────────

  createDelayAnalysis(claimId: string, projectId: string): DelayAnalysis {
    const id = this.generateId('da');
    const timestamp = this.now();

    const analysis: DelayAnalysis = {
      id,
      claimId,
      projectId,
      events: [],
      totalByParty: emptyTotalByParty(),
      netClaimableDelay: 0,
      isCompleted: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.delayAnalyses.set(id, analysis);
    return this.cloneDelayAnalysis(analysis);
  }

  addDelayEvent(analysisId: string, input: DelayEventInput): DelayAnalysis {
    const analysis = this.delayAnalyses.get(analysisId);
    if (!analysis) {
      throw new Error(`Delay analysis not found: ${analysisId}`);
    }

    if (analysis.events.length >= MAX_DELAY_EVENTS) {
      throw new Error(
        `Cannot add delay event: maximum of ${MAX_DELAY_EVENTS} events reached`
      );
    }

    // Validate input with Zod schema (includes endDate >= startDate refinement)
    const parsed = delayEventSchema.parse(input);

    // Auto-calculate working days impacted using the working day calculator
    const workingDaysImpacted = this.workingDayCalculator.countWorkingDays(
      parsed.startDate,
      parsed.endDate
    );

    const event: DelayEvent = {
      id: this.generateId('de'),
      analysisId,
      description: parsed.description,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      delayType: parsed.delayType,
      responsibleParty: parsed.responsibleParty,
      workingDaysImpacted,
    };

    analysis.events.push(event);
    recalculateDelayTotals(analysis);
    analysis.updatedAt = this.now();

    return this.cloneDelayAnalysis(analysis);
  }

  removeDelayEvent(analysisId: string, eventId: string): DelayAnalysis {
    const analysis = this.delayAnalyses.get(analysisId);
    if (!analysis) {
      throw new Error(`Delay analysis not found: ${analysisId}`);
    }

    const index = analysis.events.findIndex((e) => e.id === eventId);
    if (index === -1) {
      throw new Error(`Delay event not found: ${eventId}`);
    }

    analysis.events.splice(index, 1);
    recalculateDelayTotals(analysis);
    analysis.updatedAt = this.now();

    return this.cloneDelayAnalysis(analysis);
  }

  // ─── Completion ─────────────────────────────────────────────────────────

  markCompleted(id: string, linkToClaim: boolean, actorId: string): void {
    const assessment = this.assessments.get(id);
    if (assessment) {
      assessment.isCompleted = true;
      assessment.updatedAt = this.now();
      return;
    }

    const analysis = this.delayAnalyses.get(id);
    if (analysis) {
      analysis.isCompleted = true;
      analysis.updatedAt = this.now();
      return;
    }

    throw new Error(`Assessment or analysis not found: ${id}`);
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private cloneAssessment(assessment: QuantumAssessment): QuantumAssessment {
    return {
      ...assessment,
      lineItems: assessment.lineItems.map((item) => ({ ...item })),
      subtotalByCategory: { ...assessment.subtotalByCategory },
      percentageByCategory: { ...assessment.percentageByCategory },
    };
  }

  private cloneDelayAnalysis(analysis: DelayAnalysis): DelayAnalysis {
    return {
      ...analysis,
      events: analysis.events.map((e) => ({ ...e })),
      totalByParty: { ...analysis.totalByParty },
    };
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a new QuantumAnalyserService instance.
 * Uses in-memory storage. Requires a WorkingDayCalculator for delay analysis calculations.
 */
export function createQuantumAnalyserService(
  options: QuantumAnalyserServiceOptions
): QuantumAnalyserService {
  return new QuantumAnalyserServiceImpl(options);
}
