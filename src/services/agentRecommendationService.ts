/**
 * Agent Recommendation Service
 *
 * Generates agent-ready recommendations from document state,
 * readiness reports, and workflow events. Includes human-approval
 * guardrails for municipal, construction, and closeout operations.
 *
 * @module documents_drawing_intelligence
 */

import type {
  AgentRecommendation,
  Priority,
  ReadinessReport,
  WorkflowEvent,
} from '@/types/documentTypes';

/** Generate agent recommendations from readiness reports and events. */
export function recommendationsFromDocumentState(
  projectId: string,
  reports: ReadinessReport[],
  events: WorkflowEvent[],
): AgentRecommendation[] {
  const recommendations: AgentRecommendation[] = [];

  // Generate per-report recommendations
  for (const report of reports) {
    if (!report.ready) {
      const highest = report.findings.sort(
        (a, b) => rankPriority(b.priority) - rankPriority(a.priority),
      )[0];
      recommendations.push({
        id: `rec-${report.checkName}`,
        scope: 'project',
        title: `Resolve ${report.checkName.replace(/_/g, ' ')} blockers`,
        rationale: highest?.message ?? `${report.checkName} is not ready.`,
        priority: highest?.priority ?? 'medium',
        recommendedActionLabel: labelForReport(report.checkName),
        relatedRoute: `/projects/${projectId}/documents`,
        requiresHumanApproval: requiresApproval(report.checkName),
      });
    }
  }

  // Top event recommendation
  const topEvent = events.sort(
    (a, b) => rankPriority(b.priority) - rankPriority(a.priority),
  )[0];
  if (topEvent) {
    recommendations.push({
      id: `rec-event-${topEvent.id}`,
      scope: 'user',
      title: 'Open highest-priority document issue',
      rationale: topEvent.detail,
      priority: topEvent.priority,
      recommendedActionLabel: 'Open document inbox item',
      relatedRoute: `/inbox/${topEvent.id}`,
      requiresHumanApproval: topEvent.priority === 'critical',
    });
  }

  return recommendations.sort(
    (a, b) => rankPriority(b.priority) - rankPriority(a.priority),
  );
}

/** Generate a recommendation for a specific finding. */
export function recommendationForFinding(
  projectId: string,
  finding: { code: string; priority: Priority; message: string },
  index: number,
): AgentRecommendation {
  return {
    id: `rec-finding-${projectId}-${index}`,
    scope: 'project',
    title: formatRecommendationTitle(finding.code),
    rationale: finding.message,
    priority: finding.priority,
    recommendedActionLabel: 'Review and resolve',
    relatedRoute: `/projects/${projectId}/documents`,
    requiresHumanApproval: ['critical', 'high'].includes(finding.priority),
  };
}

/** Generate a recommendation for superseded drawing alerts. */
export function supersededDrawingRecommendation(
  projectId: string,
  drawingCount: number,
): AgentRecommendation {
  return {
    id: `rec-superseded-${projectId}`,
    scope: 'project',
    title: `${drawingCount} construction drawing(s) have been superseded`,
    rationale:
      'Construction teams may be working from outdated drawings. Ensure the latest revisions are distributed.',
    priority: 'high',
    recommendedActionLabel: 'Review superseded drawings',
    relatedRoute: `/projects/${projectId}/documents/drawings`,
    requiresHumanApproval: true,
  };
}

/** Determine if a report check requires human approval. */
export function requiresApproval(
  checkName: ReadinessReport['checkName'],
): boolean {
  // Municipal submission, construction issue, and closeout always require human sign-off
  return ['municipal_submission', 'construction_issue', 'closeout_pack'].includes(
    checkName,
  );
}

/** Map report check-name to a user-facing action label. */
export function labelForReport(checkName: ReadinessReport['checkName']): string {
  switch (checkName) {
    case 'municipal_submission':
      return 'Complete municipal submission pack';
    case 'tender_pack':
      return 'Complete tender pack';
    case 'construction_issue':
      return 'Review current construction drawings';
    case 'closeout_pack':
      return 'Complete closeout documents';
    case 'approval_letter':
      return 'Obtain approval letter';
    case 'warranty':
      return 'Collect warranty documents';
  }
}

/** Format a finding code into a recommendation title. */
export function formatRecommendationTitle(code: string): string {
  return code
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}

/** Rank priorities numerically. */
export function rankPriority(priority: Priority): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[priority];
}
