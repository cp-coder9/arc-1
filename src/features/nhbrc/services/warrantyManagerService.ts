/**
 * Warranty Manager Service
 *
 * Manages NHBRC 5-year structural warranty claims from initial reporting
 * through resolution, including warranty period validation, state machine
 * transitions, rectification deadline tracking, and claims summaries.
 *
 * State machine:
 *   reported → acknowledged → inspection_scheduled → inspected →
 *   liability_determined → rectification_ordered → rectification_in_progress →
 *   rectification_complete → claim_closed
 *
 * Exception: "no_liability" determination transitions directly to "claim_closed".
 *
 * Requirements: 13.1–13.10
 */

import { warrantyClaimSchema } from '../schemas';
import type {
  CreateWarrantyClaimInput,
  WarrantyClaim,
  WarrantyClaimStage,
  WarrantyClaimsSummary,
  WarrantyDefectCategory,
  WarrantyManagerService,
  WarrantyTransitionData,
} from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Warranty period in years from practical completion. */
const WARRANTY_PERIOD_YEARS = 5;

/** Sequential stage transitions in the warranty claim lifecycle. */
const STAGE_SEQUENCE: WarrantyClaimStage[] = [
  'reported',
  'acknowledged',
  'inspection_scheduled',
  'inspected',
  'liability_determined',
  'rectification_ordered',
  'rectification_in_progress',
  'rectification_complete',
  'claim_closed',
];

/** All valid defect categories for summary initialisation. */
const ALL_CATEGORIES: WarrantyDefectCategory[] = [
  'structural',
  'roof_waterproofing',
  'wall_waterproofing',
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WarrantyManagerServiceOptions {
  /** Injectable clock for deterministic testing. Returns ISO date-time string. */
  now?: () => string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `wc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Calculate warranty expiry date = practicalCompletionDate + 5 years.
 */
function calculateWarrantyExpiryDate(practicalCompletionDate: string): string {
  const date = new Date(practicalCompletionDate);
  date.setFullYear(date.getFullYear() + WARRANTY_PERIOD_YEARS);
  // Return date-only string (YYYY-MM-DD)
  return date.toISOString().split('T')[0];
}

/**
 * Determine if the defect was discovered outside the warranty period.
 */
function isOutsideWarrantyPeriod(defectDiscoveredDate: string, warrantyExpiryDate: string): boolean {
  return defectDiscoveredDate > warrantyExpiryDate;
}

/**
 * Get the next valid stage in the sequential flow.
 * Returns undefined if the current stage is the terminal stage.
 */
function getNextSequentialStage(current: WarrantyClaimStage): WarrantyClaimStage | undefined {
  const idx = STAGE_SEQUENCE.indexOf(current);
  if (idx < 0 || idx >= STAGE_SEQUENCE.length - 1) return undefined;
  return STAGE_SEQUENCE[idx + 1];
}

/**
 * Initialise a zero-count record for all stages.
 */
function initCountByStage(): Record<WarrantyClaimStage, number> {
  const counts = {} as Record<WarrantyClaimStage, number>;
  for (const stage of STAGE_SEQUENCE) {
    counts[stage] = 0;
  }
  return counts;
}

/**
 * Initialise a zero-count record for all categories.
 */
function initCountByCategory(): Record<WarrantyDefectCategory, number> {
  const counts = {} as Record<WarrantyDefectCategory, number>;
  for (const cat of ALL_CATEGORIES) {
    counts[cat] = 0;
  }
  return counts;
}

// ─── Implementation ───────────────────────────────────────────────────────────

class WarrantyManagerServiceImpl implements WarrantyManagerService {
  private claims: Map<string, WarrantyClaim> = new Map();
  private readonly now: () => string;

  constructor(options: WarrantyManagerServiceOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async registerClaim(
    projectId: string,
    claim: CreateWarrantyClaimInput,
    actorId: string,
  ): Promise<WarrantyClaim> {
    // Validate input with Zod schema
    const validated = warrantyClaimSchema.parse(claim);

    const warrantyExpiryDate = calculateWarrantyExpiryDate(validated.practicalCompletionDate);
    const outsideWarranty = isOutsideWarrantyPeriod(validated.defectDiscoveredDate, warrantyExpiryDate);

    const timestamp = this.now();
    const id = generateId();

    const warrantyClaim: WarrantyClaim = {
      id,
      projectId,
      unitId: validated.unitId,
      claimantName: validated.claimantName,
      claimantContact: validated.claimantContact,
      defectDescription: validated.defectDescription,
      defectCategory: validated.defectCategory,
      defectDiscoveredDate: validated.defectDiscoveredDate,
      practicalCompletionDate: validated.practicalCompletionDate,
      warrantyExpiryDate,
      isOutsideWarranty: outsideWarranty,
      evidenceRefs: validated.evidenceRefs,
      currentStage: 'reported',
      createdBy: actorId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.claims.set(id, warrantyClaim);
    return { ...warrantyClaim };
  }

  async transitionClaim(
    projectId: string,
    claimId: string,
    newStage: WarrantyClaimStage,
    data?: WarrantyTransitionData,
    actorId?: string,
  ): Promise<WarrantyClaim> {
    const claim = this.claims.get(claimId);

    if (!claim) {
      throw new Error(`Warranty claim not found: ${claimId}`);
    }

    if (claim.projectId !== projectId) {
      throw new Error(`Warranty claim '${claimId}' does not belong to project '${projectId}'`);
    }

    // Validate transition
    this.validateTransition(claim.currentStage, newStage, data);

    const timestamp = this.now();

    // Apply transition
    claim.currentStage = newStage;
    claim.updatedAt = timestamp;

    // Apply transition data at specific stages
    if (newStage === 'liability_determined' && data?.liabilityOutcome) {
      claim.liabilityOutcome = data.liabilityOutcome;
    }

    if (newStage === 'rectification_ordered') {
      claim.rectificationDescription = data!.rectificationDescription;
      claim.rectificationDeadline = data!.rectificationDeadline;
      claim.rectificationResponsibleParty = data!.rectificationResponsibleParty;
    }

    return { ...claim };
  }

  async getClaimsSummary(projectId: string): Promise<WarrantyClaimsSummary> {
    const projectClaims = this.getProjectClaims(projectId);

    const countByStage = initCountByStage();
    const countByCategory = initCountByCategory();

    for (const claim of projectClaims) {
      countByStage[claim.currentStage]++;
      countByCategory[claim.defectCategory]++;
    }

    const overdueRectifications = this.countOverdueRectifications(projectClaims);

    return {
      totalClaims: projectClaims.length,
      countByStage,
      countByCategory,
      overdueRectifications,
    };
  }

  async getOverdueRectifications(projectId: string): Promise<WarrantyClaim[]> {
    const projectClaims = this.getProjectClaims(projectId);
    const currentDate = this.now().split('T')[0];

    return projectClaims.filter((claim) => {
      const isInRectificationStage =
        claim.currentStage === 'rectification_ordered' ||
        claim.currentStage === 'rectification_in_progress';

      if (!isInRectificationStage || !claim.rectificationDeadline) {
        return false;
      }

      return currentDate > claim.rectificationDeadline;
    });
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Validate that a transition from currentStage to newStage is allowed.
   * Throws if the transition is invalid.
   */
  private validateTransition(
    currentStage: WarrantyClaimStage,
    newStage: WarrantyClaimStage,
    data?: WarrantyTransitionData,
  ): void {
    // Exception: "no_liability" at liability_determined → claim_closed
    if (
      currentStage === 'liability_determined' &&
      newStage === 'claim_closed' &&
      data?.liabilityOutcome === 'no_liability'
    ) {
      return;
    }

    // Also allow direct claim_closed from liability_determined if liabilityOutcome was previously set to no_liability
    // Check if the claim already has no_liability stored (handled when transitioning TO liability_determined)
    // For simplicity: if at liability_determined and targeting claim_closed, check the data
    if (currentStage === 'liability_determined' && newStage === 'claim_closed') {
      // This is only allowed via no_liability path. If data doesn't have no_liability, check normal path
      // The normal sequential next from liability_determined is rectification_ordered
      throw new Error(
        `Invalid transition from '${currentStage}' to '${newStage}'. ` +
        `Direct transition to 'claim_closed' from 'liability_determined' is only allowed with 'no_liability' outcome.`,
      );
    }

    // Standard sequential transition
    const expectedNext = getNextSequentialStage(currentStage);

    if (!expectedNext) {
      throw new Error(
        `Cannot transition from '${currentStage}': claim is already in terminal stage.`,
      );
    }

    if (newStage !== expectedNext) {
      throw new Error(
        `Invalid transition from '${currentStage}' to '${newStage}'. ` +
        `Expected next stage: '${expectedNext}'.`,
      );
    }

    // Validate required data at specific stages
    if (newStage === 'liability_determined') {
      if (!data?.liabilityOutcome) {
        throw new Error(
          `Transition to 'liability_determined' requires data.liabilityOutcome to be specified.`,
        );
      }
    }

    if (newStage === 'rectification_ordered') {
      if (!data?.rectificationDescription) {
        throw new Error(
          `Transition to 'rectification_ordered' requires data.rectificationDescription.`,
        );
      }
      if (!data?.rectificationDeadline) {
        throw new Error(
          `Transition to 'rectification_ordered' requires data.rectificationDeadline.`,
        );
      }
      if (!data?.rectificationResponsibleParty) {
        throw new Error(
          `Transition to 'rectification_ordered' requires data.rectificationResponsibleParty.`,
        );
      }
    }
  }

  /**
   * Get all claims for a given project.
   */
  private getProjectClaims(projectId: string): WarrantyClaim[] {
    const results: WarrantyClaim[] = [];
    for (const claim of this.claims.values()) {
      if (claim.projectId === projectId) {
        results.push(claim);
      }
    }
    return results;
  }

  /**
   * Count overdue rectifications among a set of claims.
   */
  private countOverdueRectifications(claims: WarrantyClaim[]): number {
    const currentDate = this.now().split('T')[0];

    return claims.filter((claim) => {
      const isInRectificationStage =
        claim.currentStage === 'rectification_ordered' ||
        claim.currentStage === 'rectification_in_progress';

      if (!isInRectificationStage || !claim.rectificationDeadline) {
        return false;
      }

      return currentDate > claim.rectificationDeadline;
    }).length;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a new WarrantyManagerService instance.
 * Uses in-memory Map storage. Injectable clock for deterministic tests.
 */
export function createWarrantyManagerService(
  options: WarrantyManagerServiceOptions = {},
): WarrantyManagerService {
  return new WarrantyManagerServiceImpl(options);
}
