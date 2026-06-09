/**
 * Agent Recommendation Service — Trust, Verification & Compliance
 *
 * Generates compliance-focused agent recommendations for expired documents,
 * missing insurance, lapsed registrations, and other compliance issues.
 * Integrates with the Architex agent orchestration system.
 */

import type { ProfessionalRegistrationRecord, RegistrationLifecycleState } from './professionalRegistrationService';
import { getRegistrationLifecycle } from './professionalRegistrationService';
import type { CompanyDocumentRecord } from './companyDocumentService';
import { getDocumentLifecycle } from './companyDocumentService';
import type { InsuranceComplianceRecord } from './insuranceComplianceService';
import { getInsuranceLifecycle } from './insuranceComplianceService';
import type { ContractorComplianceRecord } from './contractorSupplierComplianceService';
import { getMissingComplianceChecks } from './contractorSupplierComplianceService';
import type { ComplianceRiskScore } from './complianceRiskService';

// ── Types ──────────────────────────────────────────────────────────────────────

export type AgentRecommendationSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AgentRecommendationUrgency = 'advisory' | 'this_week' | 'immediate';

export interface AgentRecommendation {
  recommendationId: string;
  agentKey: string;
  title: string;
  rationale: string;
  sourceObjectId: string;
  severity: AgentRecommendationSeverity;
  recommendedAction: string;
  urgency: AgentRecommendationUrgency;
  category: RecommendationCategory;
  createdAt: string;
  moduleKey: string;
}

export type RecommendationCategory =
  | 'registration_renewal'
  | 'document_renewal'
  | 'insurance_renewal'
  | 'coverage_gap'
  | 'compliance_fix'
  | 'risk_mitigation'
  | 'consent_required'
  | 'badge_renewal'
  | 'general_advisory';

// ── State ──────────────────────────────────────────────────────────────────────

let recSeq = 1;
const recommendations: AgentRecommendation[] = [];
const MODULE_KEY = 'trust_verification_compliance';

// ── Builder ────────────────────────────────────────────────────────────────────

export function buildAgentRecommendation(input: {
  agentKey: string;
  title: string;
  rationale: string;
  sourceObjectId: string;
  severity: AgentRecommendationSeverity;
  recommendedAction: string;
  urgency: AgentRecommendationUrgency;
  category: RecommendationCategory;
}): AgentRecommendation {
  const rec: AgentRecommendation = {
    recommendationId: `agent-rec-trust-${String(recSeq++).padStart(6, '0')}`,
    ...input,
    createdAt: new Date().toISOString(),
    moduleKey: MODULE_KEY,
  };
  recommendations.push(rec);
  return rec;
}

// ── Recommendation factory helpers ─────────────────────────────────────────────

export function recommendRegistrationRenewal(
  registration: ProfessionalRegistrationRecord,
  lifecycle: RegistrationLifecycleState,
): AgentRecommendation {
  const daysText = lifecycle.daysUntilExpiry !== undefined
    ? ` (${lifecycle.daysUntilExpiry} days remaining)`
    : '';

  return buildAgentRecommendation({
    agentKey: 'trust_verification_compliance_agent',
    title: `Renew ${registration.professionalBody} Registration${daysText}`,
    rationale: `${registration.professionalBody} registration ${registration.registrationNumber} is ${lifecycle.status}. Statutory sign-off requires active registration.`,
    sourceObjectId: registration.registrationNumber,
    severity: lifecycle.status === 'expired' || lifecycle.status === 'suspended' ? 'critical' : 'high',
    recommendedAction: lifecycle.actionLabel || `Renew ${registration.professionalBody} registration before expiry`,
    urgency: lifecycle.status === 'expired' || lifecycle.status === 'suspended' ? 'immediate' : 'this_week',
    category: 'registration_renewal',
  });
}

export function recommendDocumentRenewal(
  document: CompanyDocumentRecord,
  daysUntilExpiry?: number,
): AgentRecommendation {
  const isExpired = daysUntilExpiry !== undefined && daysUntilExpiry < 0;
  const severity: AgentRecommendationSeverity = isExpired ? 'critical' : daysUntilExpiry && daysUntilExpiry <= 7 ? 'high' : 'medium';

  return buildAgentRecommendation({
    agentKey: 'trust_verification_compliance_agent',
    title: isExpired
      ? `Expired Document: ${document.title}`
      : `Renew Document: ${document.title}`,
    rationale: isExpired
      ? `"${document.title}" has expired. Valid document required for compliance.`
      : `"${document.title}" expires${daysUntilExpiry !== undefined ? ` in ${daysUntilExpiry} days` : ' soon'}. Renew before expiry to maintain compliance.`,
    sourceObjectId: document.referenceNumber || document.entityId,
    severity,
    recommendedAction: `Upload renewed ${document.title} with current evidence`,
    urgency: isExpired ? 'immediate' : 'this_week',
    category: 'document_renewal',
  });
}

export function recommendInsuranceAction(
  insurance: InsuranceComplianceRecord,
): AgentRecommendation {
  const isGap = insurance.coverageGapCents > 0;
  const isExpired = insurance.status === 'expired' || insurance.status === 'lapsed';

  let title: string;
  let severity: AgentRecommendationSeverity;
  let recommendedAction: string;
  let urgency: AgentRecommendationUrgency;

  if (isExpired) {
    title = `PI Insurance ${insurance.status === 'lapsed' ? 'Lapsed' : 'Expired'}: ${insurance.provider}`;
    severity = 'critical';
    recommendedAction = 'Reinstate or obtain new PI insurance immediately — professional services cannot proceed without active cover';
    urgency = 'immediate';
  } else if (isGap) {
    const gap = (insurance.coverageGapCents / 100).toLocaleString();
    const required = (insurance.minimumRequiredCoverageCents / 100).toLocaleString();
    title = `PI Insurance Coverage Gap: ${insurance.provider}`;
    severity = 'high';
    recommendedAction = `Increase PI coverage by R${gap} to meet the R${required} minimum requirement`;
    urgency = 'this_week';
  } else {
    title = `PI Insurance Renewal Reminder: ${insurance.provider}`;
    severity = 'medium';
    recommendedAction = `Renew PI insurance policy ${insurance.policyNumber} before expiry`;
    urgency = 'this_week';
  }

  return buildAgentRecommendation({
    agentKey: 'trust_verification_compliance_agent',
    title,
    rationale: `PI insurance policy ${insurance.policyNumber} with ${insurance.provider} (cover: R${(insurance.coverageAmountCents / 100).toLocaleString()}). ${isGap ? `Coverage gap of R${(insurance.coverageGapCents / 100).toLocaleString()}.` : ''}`,
    sourceObjectId: insurance.policyNumber,
    severity,
    recommendedAction,
    urgency,
    category: isGap ? 'coverage_gap' : 'insurance_renewal',
  });
}

export function recommendComplianceFix(
  compliance: ContractorComplianceRecord,
  checkType: string,
  reason: string,
): AgentRecommendation {
  return buildAgentRecommendation({
    agentKey: 'trust_verification_compliance_agent',
    title: `Compliance Fix Required: ${checkType}`,
    rationale: `${checkType} compliance check requires action: ${reason}`,
    sourceObjectId: compliance.entityId,
    severity: 'high',
    recommendedAction: `Resolve ${checkType} compliance issue: ${reason}`,
    urgency: 'immediate',
    category: 'compliance_fix',
  });
}

export function recommendRiskMitigation(
  risk: ComplianceRiskScore,
): AgentRecommendation[] {
  const recs: AgentRecommendation[] = [];

  for (const trigger of risk.triggers) {
    recs.push(buildAgentRecommendation({
      agentKey: 'trust_verification_compliance_agent',
      title: `Risk Mitigation: ${trigger.description}`,
      rationale: `${trigger.type} risk trigger detected at ${trigger.severity} severity. Source: ${trigger.source}`,
      sourceObjectId: risk.entityId,
      severity: trigger.severity === 'critical' ? 'critical' : trigger.severity === 'high' ? 'high' : 'medium',
      recommendedAction: trigger.recommendedAction || `Address ${trigger.type} for entity ${risk.entityId}`,
      urgency: trigger.severity === 'critical' ? 'immediate' : 'this_week',
      category: 'risk_mitigation',
    }));
  }

  // If no specific triggers, add a general overview
  if (recs.length === 0 && risk.overallScore > 0) {
    recs.push(buildAgentRecommendation({
      agentKey: 'trust_verification_compliance_agent',
      title: `Compliance Review: ${risk.entityId}`,
      rationale: `Entity ${risk.entityId} has a risk score of ${risk.overallScore}/100 (${risk.riskLevel}). Review compliance status.`,
      sourceObjectId: risk.entityId,
      severity: risk.riskLevel === 'critical' ? 'critical' : risk.riskLevel === 'high' ? 'high' : 'medium',
      recommendedAction: 'Review compliance status and address outstanding items',
      urgency: risk.riskLevel === 'critical' ? 'immediate' : 'this_week',
      category: 'risk_mitigation',
    }));
  }

  return recs;
}

export function recommendConsentAction(
  userId: string,
  purpose: string,
  missing: boolean = true,
): AgentRecommendation {
  return buildAgentRecommendation({
    agentKey: 'trust_verification_compliance_agent',
    title: missing
      ? `POPIA Consent Required: ${purpose}`
      : `POPIA Consent Renewal: ${purpose}`,
    rationale: missing
      ? `User ${userId} has not granted consent for ${purpose}. Data processing is blocked.`
      : `Consent for ${purpose} requires renewal.`,
    sourceObjectId: userId,
    severity: 'high',
    recommendedAction: missing
      ? `Obtain explicit POPIA consent from user for ${purpose}`
      : `Prompt user to renew POPIA consent for ${purpose}`,
    urgency: 'immediate',
    category: 'consent_required',
  });
}

/**
 * Generate all compliance recommendations for a batch of records.
 * This is the main entry point for agent-orchestrated compliance checks.
 */
export function generateComplianceRecommendations(input: {
  registrations?: ProfessionalRegistrationRecord[];
  documents?: CompanyDocumentRecord[];
  insurance?: InsuranceComplianceRecord[];
  compliance?: ContractorComplianceRecord[];
  risks?: ComplianceRiskScore[];
  agentKey?: string;
}): AgentRecommendation[] {
  const allRecs: AgentRecommendation[] = [];

  // Registration renewal recommendations
  if (input.registrations) {
    for (const reg of input.registrations) {
      const lifecycle = getRegistrationLifecycle(reg);
      if (lifecycle.requiresAction) {
        allRecs.push(recommendRegistrationRenewal(reg, lifecycle));
      }
    }
  }

  // Document renewal recommendations
  if (input.documents) {
    for (const doc of input.documents) {
      const lifecycle = getDocumentLifecycle(doc);
      if (lifecycle.requiresAction) {
        allRecs.push(recommendDocumentRenewal(doc, lifecycle.daysUntilExpiry));
      }
    }
  }

  // Insurance recommendations
  if (input.insurance) {
    for (const ins of input.insurance) {
      const lifecycle = getInsuranceLifecycle(ins);
      if (lifecycle.requiresAction) {
        allRecs.push(recommendInsuranceAction(ins));
      }
    }
  }

  // Contractor compliance recommendations
  if (input.compliance) {
    for (const comp of input.compliance) {
      const missing = getMissingComplianceChecks(comp);
      for (const m of missing) {
        allRecs.push(recommendComplianceFix(comp, m.label, m.reason));
      }
    }
  }

  // Risk mitigation recommendations
  if (input.risks) {
    for (const risk of input.risks) {
      allRecs.push(...recommendRiskMitigation(risk));
    }
  }

  return allRecs;
}

// ── Queries ────────────────────────────────────────────────────────────────────

export function getRecommendations(options?: {
  severity?: AgentRecommendationSeverity;
  urgency?: AgentRecommendationUrgency;
  category?: RecommendationCategory;
  limit?: number;
}): AgentRecommendation[] {
  let filtered = [...recommendations];

  if (options?.severity) {
    filtered = filtered.filter((r) => r.severity === options.severity);
  }
  if (options?.urgency) {
    filtered = filtered.filter((r) => r.urgency === options.urgency);
  }
  if (options?.category) {
    filtered = filtered.filter((r) => r.category === options.category);
  }
  if (options?.limit) {
    filtered = filtered.slice(0, options.limit);
  }

  return filtered.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

// ── Reset (for testing) ────────────────────────────────────────────────────────

export function resetRecommendationState(): void {
  recommendations.length = 0;
  recSeq = 1;
}
