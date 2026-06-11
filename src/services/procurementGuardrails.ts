/**
 * Procurement Guardrails Enforcement System
 *
 * Enforces the six procurement guardrails:
 *   1. Equal-information for addenda — verify all bidders receive
 *   2. No automatic appointment — human gate required
 *   3. Quote exclusions/qualifications must be visible
 *   4. Conflict of interest detection
 *   5. Candidate professional supervision flagging
 *   6. Marketplace match is advisory, not deterministic
 *
 * Every guardrail produces a pass/fail with evidence.
 * Guardrail violations block downstream actions.
 */

import type { AddendumRecord } from './clarificationAddendumService';
import type { BidderInvitationRecord } from './bidderInvitationService';
import type { QuoteValidationResult } from './quoteReturnableValidator';
import type { AwardRecommendationRecord, ConflictOfInterestCheck } from './awardRecommendationService';

export type GuardrailStatus = 'passed' | 'warning' | 'blocked';

export interface GuardrailCheck {
  id: string;
  name: string;
  status: GuardrailStatus;
  detail: string;
  evidence: string[];
  blockingAction: string;
}

export interface GuardrailReport {
  checks: GuardrailCheck[];
  allPassed: boolean;
  blockedActions: string[];
  warnings: string[];
  governanceNote: string;
}

// ─── Guardrail 1: Equal-Information for Addenda ───────────────────────────

export function guardrailEqualInformation(
  invitedBidderIds: string[],
  addenda: AddendumRecord[],
): GuardrailCheck {
  if (addenda.length === 0) {
    return {
      id: 'GR-1',
      name: 'Equal-Information for Addenda',
      status: 'passed',
      detail: 'No addenda issued — equal-information check not applicable.',
      evidence: [],
      blockingAction: 'issue_addendum',
    };
  }

  const evidence: string[] = [];
  let allCovered = true;

  for (const addendum of addenda) {
    const missing = invitedBidderIds.filter(
      (id) => !addendum.distributedToBidderIds.includes(id),
    );
    if (missing.length > 0) {
      allCovered = false;
      evidence.push(
        `Addendum ${addendum.addendumId} not distributed to: ${missing.join(', ')}`,
      );
    } else {
      evidence.push(
        `Addendum ${addendum.addendumId} distributed to all ${invitedBidderIds.length} bidders`,
      );
    }
  }

  return {
    id: 'GR-1',
    name: 'Equal-Information for Addenda',
    status: allCovered ? 'passed' : 'blocked',
    detail: allCovered
      ? 'All addenda distributed to all invited bidders.'
      : `${addenda.length} addendum(s) not distributed to all ${invitedBidderIds.length} bidders.`,
    evidence,
    blockingAction: 'issue_addendum',
  };
}

// ─── Guardrail 2: No Automatic Appointment ────────────────────────────────

export function guardrailNoAutoAppointment(
  recommendation: AwardRecommendationRecord | null,
): GuardrailCheck {
  if (!recommendation) {
    return {
      id: 'GR-2',
      name: 'No Automatic Appointment',
      status: 'passed',
      detail: 'No award recommendation exists — no automatic appointment risk.',
      evidence: [],
      blockingAction: 'auto_appoint',
    };
  }

  const hasClientApproval = !!recommendation.clientApprovedBy;
  const hasProfessionalApproval = !!recommendation.professionalApprovedBy;

  if (!hasClientApproval && !hasProfessionalApproval) {
    return {
      id: 'GR-2',
      name: 'No Automatic Appointment',
      status: 'blocked',
      detail: 'Award recommendation exists but neither client nor professional approval recorded — appointment blocked.',
      evidence: ['Client approval: not recorded', 'Professional approval: not recorded'],
      blockingAction: 'auto_appoint',
    };
  }

  if (!hasClientApproval) {
    return {
      id: 'GR-2',
      name: 'No Automatic Appointment',
      status: 'blocked',
      detail: 'Professional approval recorded but client approval missing — appointment blocked.',
      evidence: ['Client approval: missing', `Professional approval: ${recommendation.professionalApprovedBy} at ${recommendation.professionalApprovedAt}`],
      blockingAction: 'auto_appoint',
    };
  }

  if (!hasProfessionalApproval) {
    return {
      id: 'GR-2',
      name: 'No Automatic Appointment',
      status: 'warning',
      detail: 'Client approval recorded but professional approval pending.',
      evidence: [`Client approval: ${recommendation.clientApprovedBy} at ${recommendation.clientApprovedAt}`, 'Professional approval: pending'],
      blockingAction: 'auto_appoint',
    };
  }

  return {
    id: 'GR-2',
    name: 'No Automatic Appointment',
    status: 'passed',
    detail: 'Both client and professional approval recorded. Appointment may proceed.',
    evidence: [
      `Client approval: ${recommendation.clientApprovedBy} at ${recommendation.clientApprovedAt}`,
      `Professional approval: ${recommendation.professionalApprovedBy} at ${recommendation.professionalApprovedAt}`,
    ],
    blockingAction: 'auto_appoint',
  };
}

// ─── Guardrail 3: Quote Exclusions/Qualifications Visible ─────────────────

export function guardrailExclusionsVisible(
  validations: QuoteValidationResult[],
): GuardrailCheck {
  if (validations.length === 0) {
    return {
      id: 'GR-3',
      name: 'Quote Exclusions/Qualifications Visible',
      status: 'passed',
      detail: 'No quotes to validate.',
      evidence: [],
      blockingAction: 'compare_quotes',
    };
  }

  const evidence: string[] = [];
  let hideRisk = false;

  for (const v of validations) {
    if (v.exclusionFlags.length > 0) {
      evidence.push(`Quote ${v.quoteId}: ${v.exclusionFlags.length} exclusion(s) flagged — visible`);
    }
    if (v.qualificationWarnings.length > 0) {
      evidence.push(
        `Quote ${v.quoteId}: ${v.qualificationWarnings.length} qualification(s) flagged — visible`,
      );
    }
    if (v.exclusionFlags.length === 0 && v.qualificationWarnings.length === 0) {
      evidence.push(`Quote ${v.quoteId}: No exclusions or qualifications`);
    }
  }

  const allVisible = validations.every(
    (v) => v.exclusionFlags.length === 0 || evidence.some((e) => e.includes(v.quoteId)),
  );

  return {
    id: 'GR-3',
    name: 'Quote Exclusions/Qualifications Visible',
    status: allVisible ? 'passed' : 'warning',
    detail: 'All quote exclusions and qualifications are documented and visible for comparison.',
    evidence,
    blockingAction: 'compare_quotes',
  };
}

// ─── Guardrail 4: Conflict of Interest Detection ──────────────────────────

export function guardrailConflictOfInterest(
  conflictChecks: ConflictOfInterestCheck[],
): GuardrailCheck {
  const flagged = conflictChecks.filter((c) => c.flagged);

  return {
    id: 'GR-4',
    name: 'Conflict of Interest Detection',
    status: flagged.length > 0 ? 'blocked' : 'passed',
    detail:
      flagged.length > 0
        ? `${flagged.length} conflict(s) of interest flagged — must be resolved before award.`
        : 'No conflicts of interest detected.',
    evidence: conflictChecks.map((c) => c.detail),
    blockingAction: 'approve_award',
  };
}

// ─── Guardrail 5: Candidate Professional Supervision ──────────────────────

export function guardrailCandidateSupervision(
  supervisionRequired: boolean,
  bidderName: string,
): GuardrailCheck {
  return {
    id: 'GR-5',
    name: 'Candidate Professional Supervision',
    status: supervisionRequired ? 'warning' : 'passed',
    detail: supervisionRequired
      ? `${bidderName} requires registered professional supervision. Verify supervision arrangement before appointment.`
      : `${bidderName} does not require candidate professional supervision.`,
    evidence: [
      supervisionRequired
        ? 'Supervision arrangement must be confirmed by a registered professional'
        : 'No candidate professional supervision required',
    ],
    blockingAction: 'appoint_without_supervision',
  };
}

// ─── Guardrail 6: Marketplace Match Advisory (Not Deterministic) ──────────

export function guardrailAdvisoryMatching(
  matchCount: number,
  autoSelected: boolean,
): GuardrailCheck {
  return {
    id: 'GR-6',
    name: 'Marketplace Match is Advisory',
    status: autoSelected ? 'blocked' : 'passed',
    detail: autoSelected
      ? 'CRITICAL: Marketplace match was treated as deterministic award — matches are advisory only.'
      : `${matchCount} marketplace match(es) identified — advisory ranking only, human selection required.`,
    evidence: [
      `Match count: ${matchCount}`,
      `Auto-selected: ${autoSelected ? 'YES — VIOLATION' : 'No — compliant'}`,
      'All marketplace matches are advisory. Human selection and approval required.',
    ],
    blockingAction: 'auto_award_from_match',
  };
}

// ─── Aggregator ───────────────────────────────────────────────────────────

export interface GuardrailInputs {
  invitedBidderIds: string[];
  addenda: AddendumRecord[];
  awardRecommendation: AwardRecommendationRecord | null;
  quoteValidations: QuoteValidationResult[];
  conflictChecks: ConflictOfInterestCheck[];
  supervisionRequired: boolean;
  supervisionBidderName: string;
  marketplaceMatchCount: number;
  marketplaceAutoSelected: boolean;
}

/**
 * Runs all six procurement guardrails and produces a unified report.
 * Blocked guardrails prevent downstream procurement actions.
 */
export function runAllGuardrails(inputs: GuardrailInputs): GuardrailReport {
  const checks: GuardrailCheck[] = [
    guardrailEqualInformation(inputs.invitedBidderIds, inputs.addenda),
    guardrailNoAutoAppointment(inputs.awardRecommendation),
    guardrailExclusionsVisible(inputs.quoteValidations),
    guardrailConflictOfInterest(inputs.conflictChecks),
    guardrailCandidateSupervision(inputs.supervisionRequired, inputs.supervisionBidderName),
    guardrailAdvisoryMatching(inputs.marketplaceMatchCount, inputs.marketplaceAutoSelected),
  ];

  const blockedActions = checks
    .filter((c) => c.status === 'blocked')
    .map((c) => c.blockingAction);

  const warnings = checks
    .filter((c) => c.status === 'warning')
    .map((c) => c.detail);

  const allPassed = checks.every((c) => c.status === 'passed');

  return {
    checks,
    allPassed,
    blockedActions,
    warnings,
    governanceNote:
      'All procurement actions are advisory. Awards, appointments, purchase orders, and payments require recorded human approval. AI may compare, recommend, and flag — but cannot appoint or pay.',
  };
}
