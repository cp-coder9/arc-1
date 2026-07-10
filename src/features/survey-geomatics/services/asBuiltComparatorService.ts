/**
 * As-Built Comparator Service
 *
 * Manages as-built survey comparisons: measurement pairs,
 * tolerance calculations, deviation analysis, and compliance reporting.
 *
 * Auto-calculates per measurement:
 *   deviation = asBuiltDimension - approvedDimension
 *   absoluteDeviation = Math.abs(deviation)
 *   isWithinTolerance = absoluteDeviation <= toleranceThreshold
 *
 * Summary recalculation on every add/remove:
 *   totalMeasurements = measurements.length
 *   withinTolerance = measurements.filter(m => m.isWithinTolerance).length
 *   outsideTolerance = totalMeasurements - withinTolerance
 *   maxDeviation = Math.max(...measurements.map(m => m.absoluteDeviation), 0)
 *   compliancePercentage = totalMeasurements > 0
 *     ? Math.round((withinTolerance / totalMeasurements) * 1000) / 10
 *     : 0.0
 *
 * Requirements: 19.1–19.9
 */

import { measurementPairSchema } from '../schemas';
import type { MeasurementPairInput } from '../schemas';
import type { AsBuiltComparison, MeasurementPair } from '../types';

// ─── Input Types ──────────────────────────────────────────────────────────────

/** Input for creating a new as-built comparison. */
export interface CreateComparisonInput {
  linkedSurveyInstructionId: string;
  linkedApprovedPlanRef: string;
  surveyDate: string;
  surveyorId: string;
}

/** Input for adding a measurement pair (validated by measurementPairSchema). */
export type CreateMeasurementInput = MeasurementPairInput;

// ─── Service Interface ────────────────────────────────────────────────────────

export interface AsBuiltComparatorService {
  /** Create a new as-built comparison with empty measurements. */
  createComparison(projectId: string, input: CreateComparisonInput, actorId: string): AsBuiltComparison;
  /** Add a measurement pair, auto-calculate deviation, recalculate summary. */
  addMeasurement(comparisonId: string, input: CreateMeasurementInput): AsBuiltComparison;
  /** Remove a measurement pair, recalculate summary. */
  removeMeasurement(comparisonId: string, measurementId: string): AsBuiltComparison;
  /** Mark comparison as completed (requires >= 1 measurement). */
  markCompleted(comparisonId: string, actorId: string): AsBuiltComparison;
  /** Get comparison by ID or null if not found. */
  getComparison(comparisonId: string): AsBuiltComparison | null;
}

// ─── Service Options ──────────────────────────────────────────────────────────

export interface AsBuiltComparatorServiceOptions {
  /** Injectable clock for deterministic testing. Returns ISO date-time string. */
  now?: () => string;
}

// ─── Implementation ───────────────────────────────────────────────────────────

class AsBuiltComparatorServiceImpl implements AsBuiltComparatorService {
  private comparisons: Map<string, AsBuiltComparison> = new Map();
  private sequenceCounter = 0;
  private readonly now: () => string;

  constructor(options: AsBuiltComparatorServiceOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  createComparison(projectId: string, input: CreateComparisonInput, actorId: string): AsBuiltComparison {
    if (!input.linkedSurveyInstructionId) {
      throw new Error('linkedSurveyInstructionId is required');
    }
    if (!input.linkedApprovedPlanRef) {
      throw new Error('linkedApprovedPlanRef is required');
    }
    if (!input.surveyDate) {
      throw new Error('surveyDate is required');
    }
    if (!input.surveyorId) {
      throw new Error('surveyorId is required');
    }

    const id = this.generateId();
    const referenceNumber = this.generateReferenceNumber();
    const timestamp = this.now();

    const comparison: AsBuiltComparison = {
      id,
      projectId,
      referenceNumber,
      linkedSurveyInstructionId: input.linkedSurveyInstructionId,
      linkedApprovedPlanRef: input.linkedApprovedPlanRef,
      surveyDate: input.surveyDate,
      surveyorId: input.surveyorId,
      measurements: [],
      totalMeasurements: 0,
      withinTolerance: 0,
      outsideTolerance: 0,
      maxDeviation: 0,
      compliancePercentage: 0.0,
      isCompleted: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.comparisons.set(id, comparison);
    return { ...comparison };
  }

  addMeasurement(comparisonId: string, input: CreateMeasurementInput): AsBuiltComparison {
    const comparison = this.comparisons.get(comparisonId);
    if (!comparison) {
      throw new Error(`As-built comparison not found: ${comparisonId}`);
    }

    if (comparison.isCompleted) {
      throw new Error('Cannot add measurements to a completed comparison');
    }

    // Validate input with Zod schema
    const parsed = measurementPairSchema.parse(input);

    // Auto-calculate deviation fields
    const deviation = parsed.asBuiltDimension - parsed.approvedDimension;
    const absoluteDeviation = Math.abs(deviation);
    const isWithinTolerance = absoluteDeviation <= parsed.toleranceThreshold;

    const measurementId = this.generateMeasurementId();
    const measurement: MeasurementPair = {
      id: measurementId,
      comparisonId,
      dimensionDescription: parsed.dimensionDescription,
      approvedDimension: parsed.approvedDimension,
      asBuiltDimension: parsed.asBuiltDimension,
      toleranceThreshold: parsed.toleranceThreshold,
      deviation,
      absoluteDeviation,
      isWithinTolerance,
    };

    const updatedMeasurements = [...comparison.measurements, measurement];
    const updated = this.recalculateSummary(comparison, updatedMeasurements);

    this.comparisons.set(comparisonId, updated);
    return { ...updated, measurements: [...updated.measurements] };
  }

  removeMeasurement(comparisonId: string, measurementId: string): AsBuiltComparison {
    const comparison = this.comparisons.get(comparisonId);
    if (!comparison) {
      throw new Error(`As-built comparison not found: ${comparisonId}`);
    }

    if (comparison.isCompleted) {
      throw new Error('Cannot remove measurements from a completed comparison');
    }

    const measurementIndex = comparison.measurements.findIndex(m => m.id === measurementId);
    if (measurementIndex === -1) {
      throw new Error(`Measurement not found: ${measurementId}`);
    }

    const updatedMeasurements = comparison.measurements.filter(m => m.id !== measurementId);
    const updated = this.recalculateSummary(comparison, updatedMeasurements);

    this.comparisons.set(comparisonId, updated);
    return { ...updated, measurements: [...updated.measurements] };
  }

  markCompleted(comparisonId: string, actorId: string): AsBuiltComparison {
    const comparison = this.comparisons.get(comparisonId);
    if (!comparison) {
      throw new Error(`As-built comparison not found: ${comparisonId}`);
    }

    if (comparison.isCompleted) {
      throw new Error('Comparison is already completed');
    }

    if (comparison.measurements.length < 1) {
      throw new Error('Cannot mark comparison as completed: at least 1 measurement pair is required');
    }

    const timestamp = this.now();
    const updated: AsBuiltComparison = {
      ...comparison,
      isCompleted: true,
      updatedAt: timestamp,
    };

    this.comparisons.set(comparisonId, updated);
    return { ...updated, measurements: [...updated.measurements] };
  }

  getComparison(comparisonId: string): AsBuiltComparison | null {
    const comparison = this.comparisons.get(comparisonId);
    if (!comparison) {
      return null;
    }
    return { ...comparison, measurements: [...comparison.measurements] };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Recalculate comparison summary fields from measurements array.
   * Called on every add/remove operation.
   */
  private recalculateSummary(
    comparison: AsBuiltComparison,
    measurements: MeasurementPair[],
  ): AsBuiltComparison {
    const totalMeasurements = measurements.length;
    const withinTolerance = measurements.filter(m => m.isWithinTolerance).length;
    const outsideTolerance = totalMeasurements - withinTolerance;
    const maxDeviation = Math.max(...measurements.map(m => m.absoluteDeviation), 0);
    const compliancePercentage = totalMeasurements > 0
      ? Math.round((withinTolerance / totalMeasurements) * 1000) / 10
      : 0.0;

    const timestamp = this.now();

    return {
      ...comparison,
      measurements,
      totalMeasurements,
      withinTolerance,
      outsideTolerance,
      maxDeviation,
      compliancePercentage,
      updatedAt: timestamp,
    };
  }

  private generateId(): string {
    return `abc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private generateMeasurementId(): string {
    return `mp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private generateReferenceNumber(): string {
    this.sequenceCounter++;
    return `ABC-${String(this.sequenceCounter).padStart(3, '0')}`;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a new AsBuiltComparatorService instance.
 * Uses in-memory Map storage. Injectable clock for deterministic tests.
 */
export function createAsBuiltComparatorService(
  options: AsBuiltComparatorServiceOptions = {},
): AsBuiltComparatorService {
  return new AsBuiltComparatorServiceImpl(options);
}
