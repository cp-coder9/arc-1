export type DemolitionWasteReadinessStatus = 'not_required' | 'blocked' | 'ready_for_human_review';

export interface DemolitionWasteReadinessInput {
  scopeTags?: string[];
  structureYearBuilt?: number;
  demolitionPlanned?: boolean;
  asbestosSuspected?: boolean;
  acmDetected?: boolean;
  evidence?: { demolitionPermitRef?: string; asbestosAuditRef?: string; aiaContractorRef?: string; safeWorkProcedureRef?: string; wasteManagementPlanRef?: string; hazardousDisposalCertificateRef?: string; generalWasteDisposalCertificateRef?: string; recyclingLogRef?: string };
  checks?: { councilPermitReady?: boolean; asbestosAuditComplete?: boolean; aiaAppointed?: boolean; siteAccessRestrictedForAcm?: boolean; wastePlanApproved?: boolean; disposalEvidenceComplete?: boolean };
}

export interface DemolitionWasteReadinessResult {
  status: DemolitionWasteReadinessStatus;
  required: boolean;
  asbestosAuditRequired: boolean;
  aiaGateRequired: boolean;
  missingEvidence: string[];
  blockers: string[];
  nextAction: { label: string; priority: 'low' | 'high'; target: 'construction-os'; requiresHumanConfirmation: true; automationLevel: 'advisory' };
  audit: { prdSection: 'Section 53: Demolition Permits, Waste Management Plans, & Asbestos Abatement'; noAutomaticPermitSubmission: true; noAutomaticSiteAccessApproval: true; humanReviewRequired: true };
}

const NOTE = 'AI may prepare demolition, asbestos, and waste readiness only; council, AIA/competent person, contractor, and admin confirmation remain required.';

function text(input: DemolitionWasteReadinessInput) { return (input.scopeTags ?? []).join(' ').toLowerCase(); }
function required(input: DemolitionWasteReadinessInput) { return Boolean(input.demolitionPlanned || /demolition|site clearance|waste|asbestos|hazardous|rubble/.test(text(input))); }
function asbestosRequired(input: DemolitionWasteReadinessInput) { return Boolean(input.asbestosSuspected || input.acmDetected || (input.structureYearBuilt !== undefined && input.structureYearBuilt < 2008) || /asbestos|acm|hazardous/.test(text(input))); }

export function evaluateDemolitionWasteReadiness(input: DemolitionWasteReadinessInput): DemolitionWasteReadinessResult {
  const isRequired = required(input);
  const asbestosAuditRequired = isRequired && asbestosRequired(input);
  const aiaGateRequired = asbestosAuditRequired && Boolean(input.acmDetected);
  const e = input.evidence ?? {};
  const c = input.checks ?? {};
  const missing: string[] = [];
  if (isRequired && !e.demolitionPermitRef) missing.push('demolition permit pack / council reference');
  if (asbestosAuditRequired && !e.asbestosAuditRef) missing.push('asbestos audit reference');
  if (aiaGateRequired && !e.aiaContractorRef) missing.push('registered AIA asbestos contractor reference');
  if (aiaGateRequired && !e.safeWorkProcedureRef) missing.push('asbestos safe work procedure reference');
  if (isRequired && !e.wasteManagementPlanRef) missing.push('construction waste management plan reference');
  if (aiaGateRequired && !e.hazardousDisposalCertificateRef) missing.push('hazardous landfill disposal certificate');
  if (isRequired && !e.generalWasteDisposalCertificateRef) missing.push('general waste disposal certificate');
  if (isRequired && !e.recyclingLogRef) missing.push('recycling quantity log reference');

  const blockers = isRequired ? missing.map((item) => `Missing ${item}.`) : [];
  if (isRequired && !c.councilPermitReady) blockers.push('Council demolition/site-clearance permit readiness must be confirmed.');
  if (asbestosAuditRequired && !c.asbestosAuditComplete) blockers.push('Mandatory asbestos audit must be complete before site establishment.');
  if (aiaGateRequired && !c.aiaAppointed) blockers.push('Registered AIA asbestos contractor must be appointed for detected ACM.');
  if (aiaGateRequired && !c.siteAccessRestrictedForAcm) blockers.push('Site access must be restricted while ACM abatement is unresolved.');
  if (isRequired && !c.wastePlanApproved) blockers.push('Construction waste management plan must be approved.');
  if (isRequired && !c.disposalEvidenceComplete) blockers.push('Waste disposal and recycling evidence must be complete before compliant close-out.');

  const status: DemolitionWasteReadinessStatus = !isRequired ? 'not_required' : blockers.length ? 'blocked' : 'ready_for_human_review';
  const result: DemolitionWasteReadinessResult = { status, required: isRequired, asbestosAuditRequired, aiaGateRequired, missingEvidence: missing, blockers, nextAction: { label: !isRequired ? 'Confirm demolition workflow not required' : blockers.length ? 'Resolve demolition/asbestos/waste blockers' : 'Approve demolition and waste readiness pack', priority: blockers.length ? 'high' : 'low', target: 'construction-os', requiresHumanConfirmation: true, automationLevel: 'advisory' }, audit: { prdSection: 'Section 53: Demolition Permits, Waste Management Plans, & Asbestos Abatement', noAutomaticPermitSubmission: true, noAutomaticSiteAccessApproval: true, humanReviewRequired: true } };
  return Object.freeze(result);
}
