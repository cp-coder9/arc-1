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
