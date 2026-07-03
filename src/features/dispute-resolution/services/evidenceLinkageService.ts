/**
 * Evidence Linkage Service
 *
 * Links/unlinks evidence items from platform source modules to formal claims.
 * Enforces max 100 items per claim, min 1 after adjudication submission,
 * generates evidence schedules sorted by date ascending, and detects
 * source unavailability.
 *
 * Source modules supported:
 *   - Site Execution (diary entries, site instructions)
 *   - Contract Administration (notices, variation orders)
 *   - Finance (payment certificates)
 *   - Documents (uploaded documents, correspondence)
 *   - Programme/schedule extracts
 *   - Weather records
 *
 * Requirements: 7.1–7.9
 */

import type { EvidenceLink, EvidenceRelevance, ClaimStage } from '../types';
import { evidenceLinkSchema } from '../schemas';
import type { EvidenceLinkInput } from '../schemas';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum number of evidence items per claim (Requirement 7.3) */
const MAX_EVIDENCE_PER_CLAIM = 100;

/** Stages at or after adjudication submission where min 1 evidence must remain */
const ADJUDICATION_STAGES: ClaimStage[] = [
  'referred_to_adjudication',
  'adjudication_decision_issued',
  'settled',
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EvidenceLinkageServiceOptions {
  /** Injectable clock for deterministic testing. Returns ISO date-time string. */
  now?: () => string;
}

/**
 * Minimal claim state required by the evidence linkage service.
 * Avoids tight coupling to the full FormalClaim interface.
 */
export interface ClaimState {
  id: string;
  currentStage: ClaimStage;
}

/** A scheduled evidence item with a sequential number for the evidence schedule. */
export interface EvidenceScheduleItem {
  itemNumber: number;
  id: string;
  evidenceType: string;
  dateOfEvidence: string;
  sourceModule: string;
  sourceReferenceId: string;
  description: string;
  relevanceCategory: EvidenceRelevance;
  sourceStatus: 'available' | 'source_unavailable';
}

/** Result of source availability check. */
export interface SourceAvailabilityResult {
  evidenceId: string;
  previousStatus: 'available' | 'source_unavailable';
  currentStatus: 'available' | 'source_unavailable';
  changed: boolean;
}

export interface EvidenceLinkageService {
  /** Link a new evidence item to a claim. Validates input, enforces max 100. */
  linkEvidence(claimId: string, input: EvidenceLinkInput, actorId: string): EvidenceLink;

  /** Unlink an evidence item. Blocks if claim is in adjudication and would drop below 1. */
  unlinkEvidence(claimId: string, evidenceId: string, actorId: string): void;

  /** Get all evidence items linked to a claim. */
  getEvidenceForClaim(claimId: string): EvidenceLink[];

  /** Generate evidence schedule: sorted by dateOfEvidence ascending with item numbers. */
  generateEvidenceSchedule(claimId: string): EvidenceScheduleItem[];

  /** Check source availability for all evidence items on a claim. Stubbed: always 'available'. */
  checkSourceAvailability(claimId: string): SourceAvailabilityResult[];

  /** Register claim state so the service can enforce adjudication rules. */
  registerClaimState(state: ClaimState): void;

  /** Update claim state (e.g. after a stage transition). */
  updateClaimState(claimId: string, stage: ClaimStage): void;
}

// ─── Implementation ───────────────────────────────────────────────────────────

class EvidenceLinkageServiceImpl implements EvidenceLinkageService {
  /** Evidence items keyed by claimId → evidenceId → EvidenceLink */
  private evidenceByClaimId: Map<string, Map<string, EvidenceLink>> = new Map();
  /** Tracked claim states for adjudication enforcement */
  private claimStates: Map<string, ClaimState> = new Map();
  private readonly now: () => string;
  private idCounter = 0;

  constructor(options: EvidenceLinkageServiceOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  linkEvidence(claimId: string, input: EvidenceLinkInput, actorId: string): EvidenceLink {
    // Validate input with Zod schema (Requirement 7.2)
    const parsed = evidenceLinkSchema.parse(input);

    // Get or create claim evidence map
    let claimEvidence = this.evidenceByClaimId.get(claimId);
    if (!claimEvidence) {
      claimEvidence = new Map();
      this.evidenceByClaimId.set(claimId, claimEvidence);
    }

    // Enforce max 100 items per claim (Requirements 7.3, 7.4)
    if (claimEvidence.size >= MAX_EVIDENCE_PER_CLAIM) {
      throw new Error(
        `Maximum evidence limit reached: cannot link more than ${MAX_EVIDENCE_PER_CLAIM} ` +
        `evidence items to a single claim.`
      );
    }

    const id = this.generateId();
    const timestamp = this.now();

    const evidenceLink: EvidenceLink = {
      id,
      claimId,
      evidenceType: parsed.evidenceType,
      sourceModule: parsed.sourceModule,
      sourceReferenceId: parsed.sourceReferenceId,
      dateOfEvidence: parsed.dateOfEvidence,
      description: parsed.description,
      relevanceCategory: parsed.relevanceCategory,
      sourceStatus: 'available',
      linkedAt: timestamp,
      linkedBy: actorId,
    };

    claimEvidence.set(id, evidenceLink);
    return { ...evidenceLink };
  }

  unlinkEvidence(claimId: string, evidenceId: string, actorId: string): void {
    const claimEvidence = this.evidenceByClaimId.get(claimId);
    if (!claimEvidence) {
      throw new Error(`No evidence found for claim: ${claimId}`);
    }

    const evidence = claimEvidence.get(evidenceId);
    if (!evidence) {
      throw new Error(`Evidence item not found: ${evidenceId}`);
    }

    // Check adjudication constraint (Requirement 7.8):
    // If claim has been submitted for adjudication, must retain at least 1 item
    const claimState = this.claimStates.get(claimId);
    if (claimState && ADJUDICATION_STAGES.includes(claimState.currentStage)) {
      if (claimEvidence.size <= 1) {
        throw new Error(
          `Cannot unlink evidence: claim '${claimId}' has been submitted for adjudication ` +
          `and must retain at least 1 evidence item.`
        );
      }
    }

    claimEvidence.delete(evidenceId);
  }

  getEvidenceForClaim(claimId: string): EvidenceLink[] {
    const claimEvidence = this.evidenceByClaimId.get(claimId);
    if (!claimEvidence) {
      return [];
    }

    return Array.from(claimEvidence.values()).map(e => ({ ...e }));
  }

  generateEvidenceSchedule(claimId: string): EvidenceScheduleItem[] {
    const items = this.getEvidenceForClaim(claimId);

    // Sort by dateOfEvidence ascending (Requirement 7.6)
    items.sort((a, b) => a.dateOfEvidence.localeCompare(b.dateOfEvidence));

    // Assign sequential item numbers
    return items.map((item, index) => ({
      itemNumber: index + 1,
      id: item.id,
      evidenceType: item.evidenceType,
      dateOfEvidence: item.dateOfEvidence,
      sourceModule: item.sourceModule,
      sourceReferenceId: item.sourceReferenceId,
      description: item.description,
      relevanceCategory: item.relevanceCategory,
      sourceStatus: item.sourceStatus,
    }));
  }

  checkSourceAvailability(claimId: string): SourceAvailabilityResult[] {
    const claimEvidence = this.evidenceByClaimId.get(claimId);
    if (!claimEvidence) {
      return [];
    }

    const results: SourceAvailabilityResult[] = [];

    for (const [evidenceId, evidence] of claimEvidence) {
      // Stubbed: always reports 'available' (Requirement 7.7).
      // In production, this would query each source module to verify
      // the referenced item still exists and is accessible.
      const previousStatus = evidence.sourceStatus;
      const currentStatus: 'available' | 'source_unavailable' = 'available';
      const changed = previousStatus !== currentStatus;

      if (changed) {
        // Update the stored evidence link status
        const updated: EvidenceLink = { ...evidence, sourceStatus: currentStatus };
        claimEvidence.set(evidenceId, updated);
      }

      results.push({
        evidenceId,
        previousStatus,
        currentStatus,
        changed,
      });
    }

    return results;
  }

  registerClaimState(state: ClaimState): void {
    this.claimStates.set(state.id, { ...state });
  }

  updateClaimState(claimId: string, stage: ClaimStage): void {
    const existing = this.claimStates.get(claimId);
    if (existing) {
      existing.currentStage = stage;
    } else {
      this.claimStates.set(claimId, { id: claimId, currentStage: stage });
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private generateId(): string {
    this.idCounter++;
    return `ev_${Date.now()}_${this.idCounter}_${Math.random().toString(36).substring(2, 7)}`;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a new EvidenceLinkageService instance.
 * Uses in-memory Map storage. Injectable clock for deterministic tests.
 */
export function createEvidenceLinkageService(
  options: EvidenceLinkageServiceOptions = {}
): EvidenceLinkageService {
  return new EvidenceLinkageServiceImpl(options);
}
