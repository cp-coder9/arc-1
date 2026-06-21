import type { ReadinessReport } from '@/services/documentRegisterService';
import type { AgentRecommendation, WorkflowEvent } from '@/services/lifecycleTypes';

export function recommendationsFromDocumentState(projectId: string, reports: ReadinessReport[], events: WorkflowEvent[]): AgentRecommendation[] {
  const recommendations: AgentRecommendation[] = [];
  for (const report of reports) {
    if (!report.ready) {
      const highest = report.findings.sort((a, b) => rank(b.priority) - rank(a.priority))[0];
      recommendations.push({
        id: `rec-${report.checkName}`,
        scope: 'project',
        title: `Resolve ${report.checkName} blockers`,
        rationale: highest?.message ?? `${report.checkName} is not ready.`,
        priority: highest?.priority ?? 'medium',
        recommendedActionLabel: labelForReport(report.checkName),
        relatedRoute: `/projects/${projectId}/documents`,
        requiresHumanApproval: ['municipal_submission', 'construction_issue', 'closeout_pack'].includes(report.checkName)
      });
    }
  }
  const topEvent = events.sort((a, b) => rank(b.priority) - rank(a.priority))[0];
  if (topEvent) {
    recommendations.push({
      id: `rec-event-${topEvent.id}`,
      scope: 'user',
      title: 'Open highest priority document issue',
      rationale: topEvent.detail,
      priority: topEvent.priority,
      recommendedActionLabel: 'Open document inbox item',
      relatedRoute: `/inbox/${topEvent.id}`,
      requiresHumanApproval: topEvent.priority === 'critical'
    });
  }
  return recommendations.sort((a, b) => rank(b.priority) - rank(a.priority));
}

function labelForReport(checkName: ReadinessReport['checkName']): string {
  if (checkName === 'municipal_submission') return 'Complete municipal pack';
  if (checkName === 'tender_pack') return 'Complete tender pack';
  if (checkName === 'construction_issue') return 'Review current construction drawings';
  return 'Complete closeout documents';
}

function rank(priority: AgentRecommendation['priority']): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[priority];
}

// ── Backward-compatible stubs for existing site execution consumers ────────

export function subscribeToRecommendations(_projectId: string, _callback?: (recs: AgentRecommendation[]) => void): () => void {
  if (_callback) _callback([]);
  return () => {};
}

export function generateFieldRecommendations(_input: Record<string, unknown>): string[] {
  return [];
}

// ── Pack 5: Appointment/Project Kickoff Agent Recommendations ─────────────

import type { AppointmentRecord } from "@/services/appointmentService";
import type { KickoffPackage } from "@/services/kickoffService";

export function recommendNextActions(
  appointment: AppointmentRecord,
  kickoff: KickoffPackage
): AgentRecommendation[] {
  const recommendations: AgentRecommendation[] = [
    {
      id: "rec-human-approve-appointment-letter",
      scope: "project",
      title: "Review and approve appointment letter before issue",
      rationale: "Formal appointment documents should not be issued automatically from an agent-generated draft.",
      priority: "high",
      recommendedActionLabel: "Review appointment letter",
      relatedRoute: `/projects/${kickoff.workspace.projectId}/appointment`,
      requiresHumanApproval: true
    },
    {
      id: "rec-generate-project-brief",
      scope: "project",
      title: "Generate first project brief from accepted scope and client facts",
      rationale: "The project brief becomes the first operational baseline for inception work.",
      priority: "medium",
      recommendedActionLabel: "Generate project brief",
      relatedRoute: `/projects/${kickoff.workspace.projectId}/brief`,
      requiresHumanApproval: false
    },
    {
      id: "rec-assign-inception-tasks",
      scope: "project",
      title: "Assign initial inception and municipal-readiness tasks",
      rationale: `${kickoff.initialTasks.length} starter tasks are available from the kickoff package.`,
      priority: "medium",
      recommendedActionLabel: "Assign tasks",
      relatedRoute: `/projects/${kickoff.workspace.projectId}/tasks`,
      requiresHumanApproval: false
    }
  ];
  if (appointment.missingFacts.length > 0) {
    recommendations.unshift({
      id: "rec-request-missing-facts",
      scope: "project",
      title: "Request missing project facts from client",
      rationale: appointment.missingFacts.join(" "),
      priority: "high",
      recommendedActionLabel: "Request facts",
      relatedRoute: `/projects/${kickoff.workspace.projectId}/facts`,
      requiresHumanApproval: false
    });
  }
  if (!appointment.projectFacts.landUseOrZoningKnown) {
    recommendations.push({
      id: "rec-check-zoning",
      scope: "project",
      title: "Check land-use/zoning before municipal submission path is confirmed",
      rationale: "South African submission readiness depends on verified municipal and land-use context.",
      priority: "medium",
      recommendedActionLabel: "Check zoning",
      relatedRoute: `/projects/${kickoff.workspace.projectId}/zoning`,
      requiresHumanApproval: true
    });
  }
  return recommendations;
}

// ── Recommendation State ────────────────────────────────────────────────────

let recSeq = 0;

export function resetRecommendationState(): void {
  recSeq = 0;
}

export interface AgentRecommendationEnvelope {
  agentKey: string;
  title: string;
  rationale: string;
  sourceObjectId: string;
  severity: string;
  recommendedAction: string;
  urgency: string;
  category: string;
  moduleKey: string;
  recommendationId: string;
  createdAt: string;
}

export function buildAgentRecommendation(params: {
  agentKey: string;
  title: string;
  rationale: string;
  sourceObjectId: string;
  severity: string;
  recommendedAction: string;
  urgency: string;
  category: string;
}): AgentRecommendationEnvelope {
  recSeq++;
  return {
    agentKey: params.agentKey,
    title: params.title,
    rationale: params.rationale,
    sourceObjectId: params.sourceObjectId,
    severity: params.severity,
    recommendedAction: params.recommendedAction,
    urgency: params.urgency,
    category: params.category,
    moduleKey: 'trust_verification_compliance',
    recommendationId: `agent-rec-trust-${Date.now()}-${recSeq}`,
    createdAt: new Date().toISOString(),
  };
}

export function recommend(
  agentKey: string,
  fallbackTitle: string,
  records: Array<{ id: string; title: string; blockers: string[] }>,
): AgentRecommendationEnvelope[] {
  const blocked = records.filter((r) => r.blockers.length > 0);
  if (blocked.length > 0) {
    return blocked.map((r) =>
      buildAgentRecommendation({
        agentKey,
        title: `${r.title}: ${r.blockers.join(', ')}`,
        rationale: r.blockers.join('; '),
        sourceObjectId: r.id,
        severity: 'high',
        recommendedAction: 'Resolve blockers',
        urgency: 'this_week',
        category: 'compliance_fix',
      }),
    );
  }
  return [
    buildAgentRecommendation({
      agentKey,
      title: fallbackTitle,
      rationale: 'All records are compliant',
      sourceObjectId: 'all',
      severity: 'low',
      recommendedAction: 'None required',
      urgency: 'none',
      category: 'advisory',
    }),
  ];
}

export function generateComplianceRecommendations(params: {
  registrations?: Array<{ id?: string; userId?: string; status?: string; expiryDate?: string; professionalBody?: string }>;
  documents?: Array<{ id?: string; entityId?: string; expiresAt?: string; title?: string }>;
  insurance?: Array<{ id?: string; entityId?: string; coverageAmountCents?: number; expiresAt?: string; professionalBody?: string }>;
  compliance?: Array<{ id?: string; entityId?: string; checks?: Array<{ checkType: string; status: string }> }>;
  risks?: Array<{ id?: string; entityId?: string; triggers?: Array<{ triggerType: string; source: string; detail: string }> }>;
}): AgentRecommendationEnvelope[] {
  const recs: AgentRecommendationEnvelope[] = [];

  for (const reg of params.registrations ?? []) {
    if (reg.status === 'active' && reg.expiryDate && new Date(reg.expiryDate) > new Date()) continue;
    recs.push(
      buildAgentRecommendation({
        agentKey: 'compliance_agent',
        title: `${reg.professionalBody ?? 'Professional'} registration needs renewal`,
        rationale: `Registration ${reg.id ?? reg.userId ?? ''} is ${reg.status ?? 'expired'}`,
        sourceObjectId: reg.id ?? reg.userId ?? '',
        severity: 'high',
        recommendedAction: 'Renew registration',
        urgency: 'this_week',
        category: 'registration_renewal',
      }),
    );
  }

  for (const doc of params.documents ?? []) {
    if (doc.expiresAt && new Date(doc.expiresAt) > new Date()) continue;
    recs.push(
      buildAgentRecommendation({
        agentKey: 'compliance_agent',
        title: `${doc.title ?? 'Document'} needs renewal`,
        rationale: `Document ${doc.id ?? doc.entityId ?? ''} is expired or expiring`,
        sourceObjectId: doc.id ?? doc.entityId ?? '',
        severity: 'medium',
        recommendedAction: 'Upload renewed document',
        urgency: 'this_month',
        category: 'document_renewal',
      }),
    );
  }

  for (const ins of params.insurance ?? []) {
    if (ins.coverageAmountCents != null && ins.coverageAmountCents >= 5_000_000_00) continue;
    recs.push(
      buildAgentRecommendation({
        agentKey: 'compliance_agent',
        title: `Insurance coverage gap for ${ins.professionalBody ?? ins.entityId ?? ''}`,
        rationale: `Coverage of R${((ins.coverageAmountCents ?? 0) / 100).toLocaleString()} is below recommended minimum`,
        sourceObjectId: ins.id ?? ins.entityId ?? '',
        severity: 'high',
        recommendedAction: 'Increase coverage',
        urgency: 'this_week',
        category: 'coverage_gap',
      }),
    );
  }

  for (const comp of params.compliance ?? []) {
    const failedChecks = (comp.checks ?? []).filter((c) => c.status === 'non_compliant');
    for (const check of failedChecks) {
      recs.push(
        buildAgentRecommendation({
          agentKey: 'compliance_agent',
          title: `Compliance issue: ${check.checkType}`,
          rationale: `${check.checkType} is non-compliant for ${comp.entityId ?? comp.id ?? ''}`,
          sourceObjectId: comp.id ?? comp.entityId ?? '',
          severity: 'high',
          recommendedAction: `Resolve ${check.checkType}`,
          urgency: 'this_week',
          category: 'compliance_fix',
        }),
      );
    }
  }

  for (const risk of params.risks ?? []) {
    for (const trigger of risk.triggers ?? []) {
      recs.push(
        buildAgentRecommendation({
          agentKey: 'compliance_agent',
          title: `Risk: ${trigger.detail}`,
          rationale: `${trigger.triggerType} from ${trigger.source}`,
          sourceObjectId: risk.id ?? risk.entityId ?? '',
          severity: 'high',
          recommendedAction: 'Mitigate risk',
          urgency: 'this_week',
          category: 'risk_mitigation',
        }),
      );
    }
  }

  return recs;
}
