// ─── EIA Commissioning / Post-Occupancy Integration Service ─────────────────
// Provides integration points for the Close-out lifecycle stage transition,
// EMPr operational phase handover, commissioning environmental items, and
// Facilities Management placeholder support.
//
// All functions are pure and exported. No side effects or persistence calls.
//
// Requirements: 13.1–13.5

import type {
  EMPrCommitment,
  EIAAuditEntry,
  EMPrPhase,
  MonitoringFrequency,
  EMPrComplianceStatus,
} from './eiaTypes';

// ─── ID Generation ───────────────────────────────────────────────────────────

let handoverCounter = 0;
let commissioningCounter = 0;
let auditCounter = 0;

function generateHandoverId(): string {
  handoverCounter += 1;
  return `empr-handover-${Date.now()}-${handoverCounter}`;
}

function generateCommissioningId(): string {
  commissioningCounter += 1;
  return `empr-commission-${Date.now()}-${commissioningCounter}`;
}

function generateAuditId(): string {
  auditCounter += 1;
  return `empr-commission-aud-${Date.now()}-${auditCounter}`;
}

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Input for creating commissioning-related environmental compliance items.
 */
export interface CommissioningItemInput {
  title: string;
  category: string;
  verificationMethod: string;
}

/**
 * Result of the EMPr handover operation.
 */
export interface EMPrHandoverResult {
  handoverItems: EMPrCommitment[];
  auditEntry: EIAAuditEntry;
}

// ─── performEMPrHandover ─────────────────────────────────────────────────────

/**
 * Transfers active/ongoing EMPr commitment items to a post-construction
 * monitoring context as part of the Close-out stage transition.
 *
 * Retains each item's title (description), category (applicablePhase),
 * responsible party, and compliance condition fields.
 *
 * If no applicable items exist (none with status 'compliant' being actively
 * monitored or 'non_compliant' requiring ongoing attention), returns an
 * empty set with an audit event noting "zero commitments applicable".
 *
 * Requirement 13.1, 13.5
 */
export function performEMPrHandover(
  commitments: EMPrCommitment[]
): EMPrHandoverResult {
  const applicableItems = commitments.filter(
    (c) => isEMPrHandoverApplicable(c)
  );

  if (applicableItems.length === 0) {
    // Requirement 13.5: Empty handover set with audit event
    const auditEntry: EIAAuditEntry = {
      id: generateAuditId(),
      action: 'empr_handover',
      actorId: 'system',
      projectId: commitments.length > 0 ? commitments[0].projectId : 'unknown',
      timestamp: new Date().toISOString(),
      outcome: 'zero commitments applicable for post-construction monitoring',
      metadata: {
        totalCommitments: commitments.length,
        applicableCount: 0,
        stage: 'closeout',
      },
    };

    return {
      handoverItems: [],
      auditEntry,
    };
  }

  // Transfer applicable items — retain title, category, responsible party,
  // and compliance status fields. Update phase to 'operation' for post-construction.
  const handoverItems: EMPrCommitment[] = applicableItems.map((item) => ({
    ...item,
    id: generateHandoverId(),
    applicablePhase: 'operation' as EMPrPhase,
  }));

  const projectId = applicableItems[0].projectId;

  const auditEntry: EIAAuditEntry = {
    id: generateAuditId(),
    action: 'empr_handover',
    actorId: 'system',
    projectId,
    timestamp: new Date().toISOString(),
    outcome: `${handoverItems.length} commitment(s) transferred to post-construction monitoring`,
    metadata: {
      totalCommitments: commitments.length,
      applicableCount: handoverItems.length,
      stage: 'closeout',
      transferredReferences: handoverItems.map((h) => h.reference),
    },
  };

  return {
    handoverItems,
    auditEntry,
  };
}

// ─── createCommissioningItems ────────────────────────────────────────────────

/**
 * Creates commissioning-related environmental compliance items as EMPr
 * commitments linked to the Close-out lifecycle stage.
 *
 * Typical commissioning items: noise testing, air quality verification,
 * stormwater management activation.
 *
 * Each item includes title, compliance category, verification method,
 * and is created with a default status of 'not_yet_applicable' pending
 * commissioning activation.
 *
 * Requirement 13.2
 */
export function createCommissioningItems(
  items: CommissioningItemInput[],
  projectId: string = 'unknown'
): EMPrCommitment[] {
  return items.map((item) => ({
    id: generateCommissioningId(),
    projectId,
    reference: `COMMISSION-${item.category.toUpperCase().replace(/\s+/g, '-')}`,
    description: item.title,
    applicablePhase: 'operation' as EMPrPhase,
    responsibleParty: 'Commissioning Agent',
    monitoringFrequency: 'event-triggered' as MonitoringFrequency,
    complianceStatus: 'not_yet_applicable' as EMPrComplianceStatus,
    specForgeItemId: undefined,
  }));
}

// ─── isEMPrHandoverRequired ─────────────────────────────────────────────────

/**
 * Checks if any commitments have status applicable for post-construction
 * monitoring. Returns true if at least one commitment qualifies for handover.
 *
 * A commitment is handover-applicable if its compliance status is 'compliant'
 * or 'non_compliant' (i.e., actively monitored items, not 'not_yet_applicable').
 *
 * Requirement 13.1
 */
export function isEMPrHandoverRequired(
  commitments: EMPrCommitment[]
): boolean {
  return commitments.some((c) => isEMPrHandoverApplicable(c));
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Determines if a single EMPr commitment is applicable for post-construction
 * handover. Items with status 'compliant' or 'non_compliant' are considered
 * active/ongoing and should be transferred.
 */
function isEMPrHandoverApplicable(commitment: EMPrCommitment): boolean {
  return (
    commitment.complianceStatus === 'compliant' ||
    commitment.complianceStatus === 'non_compliant'
  );
}
