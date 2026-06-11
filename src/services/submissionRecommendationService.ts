/**
 * Submission Agent Recommendation Service
 * Recommends next actions with approval gates for municipal submission readiness.
 *
 * Part of Pack 6: Municipal Submission Readiness
 */
import type {
  ProfessionalRoutingDecision,
  ReadinessAssessment,
  SubmissionAgentRecommendation,
} from '@/types/municipalSubmissionReadiness';

/**
 * Generate agent recommendations based on readiness assessment and routing.
 * Recommendations include approval gates — some can execute automatically,
 * others require human professional approval.
 */
export function recommendSubmissionActions(
  readiness: ReadinessAssessment,
  routes: ProfessionalRoutingDecision[]
): SubmissionAgentRecommendation[] {
  const required = routes
    .filter((r) => r.status === 'required')
    .map((r) => r.discipline)
    .join(', ');

  const recs: SubmissionAgentRecommendation[] = [];

  // Blockers take priority
  if (readiness.blockers.length > 0) {
    recs.push({
      id: 'rec-clear-blockers',
      title: 'Clear readiness blockers before submission review',
      rationale: readiness.blockers.slice(0, 5).join(' | '),
      requiresHumanApproval: false,
    });
  }

  // Routing-based recommendations
  recs.push({
    id: 'rec-route-team',
    title: 'Route only triggered BEPs into municipal readiness workflow',
    rationale: `Required disciplines: ${required}. Excluded disciplines remain out until triggers appear.`,
    requiresHumanApproval: false,
  });

  recs.push({
    id: 'rec-professional-review',
    title:
      'Require appointed professional review before formal municipal submission',
    rationale:
      'Readiness output is advisory and cannot self-certify statutory compliance.',
    requiresHumanApproval: true,
  });

  recs.push({
    id: 'rec-update-matrix',
    title:
      'Verify municipality-specific checklist before relying on submission pack',
    rationale:
      'Municipal requirements vary and must be editable/versioned.',
    requiresHumanApproval: true,
  });

  // Drawing-related recommendations
  if (
    readiness.checks.some(
      (c) =>
        c.category === 'drawing_register' &&
        c.status === 'requires_professional_review'
    )
  ) {
    recs.push({
      id: 'rec-drawings',
      title: 'Progress drawing register items to signed-off status',
      rationale:
        'Drawings at draft stage must be checked and signed off by the responsible professional.',
      requiresHumanApproval: false,
    });
  }

  // Supporting documents
  if (
    readiness.checks.some(
      (c) =>
        c.category === 'supporting_documents' && c.status === 'missing'
    )
  ) {
    recs.push({
      id: 'rec-supporting-docs',
      title: 'Request missing supporting documents from client and authorities',
      rationale:
        'Title deed, SG diagram, zoning certificate and other supporting documents are required for lodgment.',
      requiresHumanApproval: false,
    });
  }

  return recs;
}
