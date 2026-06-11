/**
 * Procurement Scope Classifier
 *
 * Determines the appropriate procurement type based on project attributes:
 *   - open_tender, invited_tender, rfq, direct_appointment
 *
 * Factors: project value, complexity, urgency, regulatory requirements,
 * public/private sector, risk profile, and trade count.
 *
 * All classifications are advisory only; human professional review is required.
 */

export type ProcurementClassification =
  | 'open_tender'
  | 'invited_tender'
  | 'rfq'
  | 'direct_appointment';

export type ProcurementUrgency = 'standard' | 'expedited' | 'emergency';

export interface ProcurementScopeInput {
  projectId: string;
  projectName: string;
  estimatedValueZar: number;
  complexity: 'low' | 'medium' | 'high' | 'very_high';
  urgency: ProcurementUrgency;
  publicSector: boolean;
  requiredTrades: string[];
  requiredSpecialists: string[];
  municipalReadinessScore: number; // 0-100
  regulatoryRequirements: string[];
  riskFlags: string[];
  location: string;
  municipality?: string;
  province?: string;
}

export interface ProcurementScopeResult {
  classification: ProcurementClassification;
  confidence: number; // 0-1
  rationale: string[];
  requiredParticipantCategories: string[];
  minimumBidders: number;
  recommendedBidders: number;
  publicAdvertisement: boolean;
  regulatoryTriggers: string[];
  riskFlags: string[];
  estimatedDurationDays: number;
  governanceNote: string;
}

const GOVERNANCE_NOTE =
  'Procurement classification is advisory only. Final procurement strategy must be confirmed by the lead professional and client. All appointments require recorded human approval.';

function estimateDurationDays(
  classification: ProcurementClassification,
  urgency: ProcurementUrgency,
): number {
  const baseline: Record<ProcurementClassification, number> = {
    open_tender: 60,
    invited_tender: 35,
    rfq: 21,
    direct_appointment: 7,
  };
  const multiplier: Record<ProcurementUrgency, number> = {
    standard: 1.0,
    expedited: 0.65,
    emergency: 0.35,
  };
  return Math.round(baseline[classification] * multiplier[urgency]);
}

function determineMinimumBidders(classification: ProcurementClassification): number {
  switch (classification) {
    case 'open_tender':
      return 3;
    case 'invited_tender':
      return 3;
    case 'rfq':
      return 2;
    case 'direct_appointment':
      return 1;
  }
}

function determineRecommendedBidders(classification: ProcurementClassification): number {
  switch (classification) {
    case 'open_tender':
      return 6;
    case 'invited_tender':
      return 5;
    case 'rfq':
      return 4;
    case 'direct_appointment':
      return 1;
  }
}

function requiresPublicAdvertisement(input: ProcurementScopeInput): boolean {
  if (input.publicSector) return true;
  if (input.estimatedValueZar >= 10_000_000) return true;
  if (input.regulatoryRequirements.some((r) => /public.*tender|open.*procurement/i.test(r)))
    return true;
  return false;
}

function collectRegulatoryTriggers(input: ProcurementScopeInput): string[] {
  const triggers: string[] = [];
  if (input.publicSector)
    triggers.push('Public sector procurement — MFMA/PFMA/PPPFA regulations may apply');
  if (input.estimatedValueZar >= 50_000_000)
    triggers.push('High-value procurement — additional CIDB/NHBRC scrutiny');
  if (input.requiredTrades.length >= 5)
    triggers.push('Multi-trade procurement — consider trade-package split');
  if (input.riskFlags.some((f) => /structural|fire|safety/i.test(f)))
    triggers.push('Safety-critical scope — enhanced qualification verification required');
  if (input.municipalReadinessScore < 40)
    triggers.push('Low municipal readiness — procurement may need staged/phased approach');
  return triggers;
}

function determineRequiredParticipants(input: ProcurementScopeInput): string[] {
  const participants = new Set<string>(['client', 'lead_professional']);
  if (input.estimatedValueZar >= 1_000_000) participants.add('quantity_surveyor');
  if (input.complexity === 'high' || input.complexity === 'very_high')
    participants.add('specialist_consultant');
  participants.add('contractor');
  if (input.requiredTrades.length >= 3) participants.add('subcontractor');
  if (input.requiredSpecialists.length > 0) participants.add('specialist_consultant');
  return Array.from(participants);
}

/**
 * Classifies a procurement scope based on project characteristics.
 *
 * Decision logic:
 * - emergency + low complexity → direct_appointment
 * - public sector + high value → open_tender
 * - high complexity + many trades → open_tender
 * - medium value + moderate complexity → invited_tender
 * - low value + few trades → rfq
 * - very small value + single trade → direct_appointment
 */
export function classifyProcurementScope(
  input: ProcurementScopeInput,
): ProcurementScopeResult {
  const rationale: string[] = [];
  let classification: ProcurementClassification = 'rfq';
  let confidence = 0.8;

  // Emergency override
  if (input.urgency === 'emergency') {
    classification = 'direct_appointment';
    confidence = 0.85;
    rationale.push(
      'Emergency procurement — direct appointment permitted with proper justification',
    );
  }
  // Public sector
  else if (input.publicSector && input.estimatedValueZar >= 200_000) {
    classification = 'open_tender';
    confidence = 0.95;
    rationale.push(
      `Public sector project valued at R${input.estimatedValueZar.toLocaleString()} — open tender required per PFMA/MFMA`,
    );
  }
  // High complexity
  else if (input.complexity === 'very_high' || input.complexity === 'high') {
    classification = input.estimatedValueZar >= 5_000_000 ? 'open_tender' : 'invited_tender';
    confidence = 0.8;
    rationale.push(
      `${input.complexity.replace('_', ' ')} complexity procurement — ${classification.replace('_', ' ')} recommended`,
    );
  }
  // High value
  else if (input.estimatedValueZar >= 10_000_000) {
    classification = 'open_tender';
    confidence = 0.9;
    rationale.push(
      `High-value procurement (R${input.estimatedValueZar.toLocaleString()}) — open tender recommended`,
    );
  }
  // Medium value
  else if (input.estimatedValueZar >= 1_000_000) {
    classification = 'invited_tender';
    confidence = 0.75;
    rationale.push(
      `Medium-value procurement (R${input.estimatedValueZar.toLocaleString()}) — invited tender recommended`,
    );
  }
  // Multi-trade
  else if (input.requiredTrades.length >= 3) {
    classification = 'rfq';
    confidence = 0.7;
    rationale.push(
      `Multi-trade procurement (${input.requiredTrades.length} trades) — RFQ process recommended`,
    );
  }
  // Small single-trade
  else if (
    input.estimatedValueZar < 200_000 &&
    input.requiredTrades.length <= 1 &&
    input.complexity === 'low'
  ) {
    classification = 'direct_appointment';
    confidence = 0.8;
    rationale.push(
      `Small, low-complexity procurement (R${input.estimatedValueZar.toLocaleString()}) — direct appointment may be appropriate`,
    );
  }
  // Default
  else {
    classification = 'rfq';
    confidence = 0.6;
    rationale.push(
      `Standard procurement — RFQ process recommended as default`,
    );
  }

  // Municipal readiness adjustment
  if (input.municipalReadinessScore < 30) {
    confidence -= 0.15;
    rationale.push(
      `Low municipal readiness score (${input.municipalReadinessScore}/100) — procurement classification may need revision after readiness improves`,
    );
  }

  // Cap confidence
  confidence = Math.max(0.3, Math.min(0.98, confidence));

  const regulatoryTriggers = collectRegulatoryTriggers(input);
  const publicAdvertisement = requiresPublicAdvertisement(input);

  // If open_tender but not public advertisement required, maybe invited_tender is enough
  if (classification === 'open_tender' && !publicAdvertisement && input.estimatedValueZar < 5_000_000) {
    classification = 'invited_tender';
    rationale.push('Value below public advertisement threshold — invited tender sufficient');
  }

  return {
    classification,
    confidence: Math.round(confidence * 100) / 100,
    rationale,
    requiredParticipantCategories: determineRequiredParticipants(input),
    minimumBidders: determineMinimumBidders(classification),
    recommendedBidders: determineRecommendedBidders(classification),
    publicAdvertisement,
    regulatoryTriggers,
    riskFlags: input.riskFlags,
    estimatedDurationDays: estimateDurationDays(classification, input.urgency),
    governanceNote: GOVERNANCE_NOTE,
  };
}
