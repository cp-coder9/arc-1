/**
 * Agent Recommendation Service — Trust, Verification & Compliance
 *
 * Generates compliance-focused agent recommendations for expired documents,
 * missing insurance, lapsed registrations, and other compliance issues.
 *
 * @module trust_verification_compliance
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

export type AgentRecommendationSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AgentRecommendationUrgency = 'advisory' | 'this_week' | 'immediate';

export interface AgentRecommendation {
  recommendationId: string; agentKey: string; title: string; rationale: string;
  sourceObjectId: string; severity: AgentRecommendationSeverity;
  recommendedAction: string; urgency: AgentRecommendationUrgency;
  category: RecommendationCategory; createdAt: string; moduleKey: string;
}

export type RecommendationCategory =
  | 'registration_renewal' | 'document_renewal' | 'insurance_renewal'
  | 'coverage_gap' | 'compliance_fix' | 'risk_mitigation'
  | 'consent_required' | 'badge_renewal' | 'general_advisory'
  | 'compliance_checklist';

let recSeq = 1;
const recommendations: AgentRecommendation[] = [];
const MODULE_KEY = 'trust_verification_compliance';

// ── Builder ────────────────────────────────────────────────────────────────────

export function buildAgentRecommendation(input: {
  agentKey: string; title: string; rationale: string; sourceObjectId: string;
  severity: AgentRecommendationSeverity; recommendedAction: string;
  urgency: AgentRecommendationUrgency; category: RecommendationCategory;
}): AgentRecommendation {
  const rec: AgentRecommendation = {
    recommendationId: `agent-rec-trust-${String(recSeq++).padStart(6, '0')}`,
    ...input, createdAt: new Date().toISOString(), moduleKey: MODULE_KEY,
  };
  recommendations.push(rec);
  return rec;
}

// ── Recommendation factories ──────────────────────────────────────────────────

export function recommendRegistrationRenewal(
  registration: ProfessionalRegistrationRecord, lifecycle: RegistrationLifecycleState,
): AgentRecommendation {
  const daysText = lifecycle.daysUntilExpiry !== undefined
    ? ` (${lifecycle.daysUntilExpiry} days remaining)` : '';
  return buildAgentRecommendation({
    agentKey: 'trust_verification_compliance_agent',
    title: `Renew ${registration.professionalBody} Registration${daysText}`,
    rationale: `${registration.professionalBody} registration ${registration.registrationNumber} is ${lifecycle.status}.`,
    sourceObjectId: registration.registrationNumber,
    severity: lifecycle.status === 'expired' || lifecycle.status === 'suspended' ? 'critical' : 'high',
    recommendedAction: lifecycle.actionLabel || `Renew ${registration.professionalBody} registration`,
    urgency: lifecycle.status === 'expired' || lifecycle.status === 'suspended' ? 'immediate' : 'this_week',
    category: 'registration_renewal',
  });
}

export function recommendDocumentRenewal(
  document: CompanyDocumentRecord, daysUntilExpiry?: number,
): AgentRecommendation {
  const isExpired = daysUntilExpiry !== undefined && daysUntilExpiry < 0;
  return buildAgentRecommendation({
    agentKey: 'trust_verification_compliance_agent',
    title: isExpired ? `Expired Document: ${document.title}` : `Renew Document: ${document.title}`,
    rationale: isExpired
      ? `"${document.title}" has expired.` : `"${document.title}" expires soon.`,
    sourceObjectId: document.referenceNumber || document.entityId,
    severity: isExpired ? 'critical' : 'medium',
    recommendedAction: `Upload renewed ${document.title}`,
    urgency: isExpired ? 'immediate' : 'this_week',
    category: 'document_renewal',
  });
}

export function recommendInsuranceAction(insurance: InsuranceComplianceRecord): AgentRecommendation {
  const isGap = insurance.coverageGapCents > 0;
  const isExpired = insurance.status === 'expired' || insurance.status === 'lapsed';
  return buildAgentRecommendation({
    agentKey: 'trust_verification_compliance_agent',
    title: isExpired
      ? `PI Insurance ${insurance.status === 'lapsed' ? 'Lapsed' : 'Expired'}: ${insurance.provider}`
      : isGap ? `PI Insurance Coverage Gap: ${insurance.provider}`
      : `PI Insurance Renewal: ${insurance.provider}`,
    rationale: `PI policy ${insurance.policyNumber} (cover: R${(insurance.coverageAmountCents / 100).toLocaleString()})`,
    sourceObjectId: insurance.policyNumber,
    severity: isExpired ? 'critical' : isGap ? 'high' : 'medium',
    recommendedAction: isExpired ? 'Reinstate PI insurance immediately'
      : isGap ? `Increase cover by R${(insurance.coverageGapCents / 100).toLocaleString()}`
      : 'Renew before expiry',
    urgency: isExpired ? 'immediate' : 'this_week',
    category: isGap ? 'coverage_gap' : 'insurance_renewal',
  });
}

export function recommendComplianceFix(
  compliance: ContractorComplianceRecord, checkType: string, reason: string,
): AgentRecommendation {
  return buildAgentRecommendation({
    agentKey: 'trust_verification_compliance_agent',
    title: `Compliance Fix Required: ${checkType}`,
    rationale: `${checkType}: ${reason}`,
    sourceObjectId: compliance.entityId, severity: 'high',
    recommendedAction: `Resolve ${checkType}: ${reason}`,
    urgency: 'immediate', category: 'compliance_fix',
  });
}

export function recommendRiskMitigation(risk: ComplianceRiskScore): AgentRecommendation[] {
  return risk.triggers.map((trigger) =>
    buildAgentRecommendation({
      agentKey: 'trust_verification_compliance_agent',
      title: `Risk Mitigation: ${trigger.description}`,
      rationale: `${trigger.type} at ${trigger.severity} severity`,
      sourceObjectId: risk.entityId,
      severity: trigger.severity === 'critical' ? 'critical' : trigger.severity === 'high' ? 'high' : 'medium',
      recommendedAction: trigger.recommendedAction || `Address ${trigger.type}`,
      urgency: trigger.severity === 'critical' ? 'immediate' : 'this_week',
      category: 'risk_mitigation',
    })
  );
}

export function recommendConsentAction(userId: string, purpose: string, missing = true): AgentRecommendation {
  return buildAgentRecommendation({
    agentKey: 'trust_verification_compliance_agent',
    title: missing ? `POPIA Consent Required: ${purpose}` : `POPIA Consent Renewal: ${purpose}`,
    rationale: missing ? `No consent for ${purpose}` : `Consent for ${purpose} needs renewal`,
    sourceObjectId: userId, severity: 'high',
    recommendedAction: missing ? `Obtain consent for ${purpose}` : `Renew consent for ${purpose}`,
    urgency: 'immediate', category: 'consent_required',
  });
}

// ── Batch generator ───────────────────────────────────────────────────────────

export function generateComplianceRecommendations(input: {
  registrations?: ProfessionalRegistrationRecord[];
  documents?: CompanyDocumentRecord[];
  insurance?: InsuranceComplianceRecord[];
  compliance?: ContractorComplianceRecord[];
  risks?: ComplianceRiskScore[];
}): AgentRecommendation[] {
  const all: AgentRecommendation[] = [];
  if (input.registrations) for (const reg of input.registrations) {
    const lc = getRegistrationLifecycle(reg);
    if (lc.requiresAction) all.push(recommendRegistrationRenewal(reg, lc));
  }
  if (input.documents) for (const doc of input.documents) {
    const lc = getDocumentLifecycle(doc);
    if (lc.requiresAction) all.push(recommendDocumentRenewal(doc, lc.daysUntilExpiry));
  }
  if (input.insurance) for (const ins of input.insurance) {
    const lc = getInsuranceLifecycle(ins);
    if (lc.requiresAction) all.push(recommendInsuranceAction(ins));
  }
  if (input.compliance) for (const comp of input.compliance) {
    for (const m of getMissingComplianceChecks(comp)) all.push(recommendComplianceFix(comp, m.label, m.reason));
  }
  if (input.risks) for (const risk of input.risks) all.push(...recommendRiskMitigation(risk));
  return all;
}

// ── Backwards-compatible exports ───────────────────────────────────────────────

export function recommend(
  agentKey: string, title: string,
  records: Array<{ id: string; title?: string; status?: string; blockers?: string[] }>,
): AgentRecommendation[] {
  const outputs: AgentRecommendation[] = [];
  for (const r of records) {
    if (r.blockers && r.blockers.length > 0) {
      outputs.push(buildAgentRecommendation({
        agentKey, title: `Resolve blocker on ${r.title || r.id}`,
        rationale: `Blockers: ${r.blockers.join('; ')}`, sourceObjectId: r.id || 'unknown',
        severity: 'high', recommendedAction: `Resolve: ${r.blockers.join(', ')}`,
        urgency: 'this_week', category: 'compliance_fix',
      }));
    }
  }
  if (outputs.length === 0) {
    outputs.push(buildAgentRecommendation({
      agentKey, title, rationale: 'All compliance records within expected ranges.',
      sourceObjectId: records[0]?.id || 'none', severity: 'low',
      recommendedAction: 'Continue monitoring.', urgency: 'advisory', category: 'general_advisory',
    }));
  }
  return outputs;
}

// ── Queries ────────────────────────────────────────────────────────────────────

export function getRecommendations(options?: {
  severity?: AgentRecommendationSeverity; urgency?: AgentRecommendationUrgency;
  category?: RecommendationCategory; limit?: number;
}): AgentRecommendation[] {
  let filtered = [...recommendations];
  if (options?.severity) filtered = filtered.filter((r) => r.severity === options.severity);
  if (options?.urgency) filtered = filtered.filter((r) => r.urgency === options.urgency);
  if (options?.category) filtered = filtered.filter((r) => r.category === options.category);
  if (options?.limit) filtered = filtered.slice(0, options.limit);
  return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function recommendationsFromDocumentState(
  projectId: string,
  readinessReports: Array<{ checkName: string; ready: boolean; findings: Array<{ code: string; message: string; priority: string }> }>,
  inboxEvents: Array<{ eventId: string; priority: string; type?: string; assignedRoles?: string[] }>,
): AgentRecommendation[] {
  const recs: AgentRecommendation[] = [];
  for (const report of readinessReports) {
    if (!report.ready) {
      const severity: AgentRecommendationSeverity = report.findings.some((f) => f.priority === 'critical') ? 'critical' :
        report.findings.some((f) => f.priority === 'high') ? 'high' : 'medium';
      recs.push({
        recommendationId: `rec-${recSeq++}`,
        agentKey: 'document_agent',
        title: `Review ${report.checkName}`,
        rationale: `Readiness check "${report.checkName}" is not ready with ${report.findings.length} findings.`,
        sourceObjectId: projectId,
        severity,
        recommendedAction: `Review and resolve ${report.findings.length} findings in ${report.checkName}`,
        urgency: 'this_week',
        category: 'compliance_checklist',
        createdAt: new Date().toISOString(),
        moduleKey: MODULE_KEY,
      });
    }
  }
  if (inboxEvents.length > 0) {
    recs.push({
      recommendationId: `rec-${recSeq++}`,
      agentKey: 'inbox_agent',
      title: 'Address pending inbox events',
      rationale: `${inboxEvents.length} inbox events require attention.`,
      sourceObjectId: projectId,
      severity: 'high',
      recommendedAction: `Review ${inboxEvents.length} pending inbox events`,
      urgency: 'immediate',
      category: 'compliance_checklist',
      createdAt: new Date().toISOString(),
      moduleKey: MODULE_KEY,
    });
  }
  recommendations.push(...recs);
  return recs;
}

export function subscribeToRecommendations(_projectId: string, _callback?: (recs: AgentRecommendation[]) => void): () => void {
  if (_callback) _callback(getRecommendations());
  return () => {};
}

export function generateFieldRecommendations(input: Record<string, unknown>): string[] {
  const recs = generateComplianceRecommendations(input as unknown as Parameters<typeof generateComplianceRecommendations>[0]);
  return recs.map((r) => r.recommendationId);
}

export function resetRecommendationState(): void { recommendations.length = 0; recSeq = 1; }
