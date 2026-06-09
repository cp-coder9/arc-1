/**
 * Proposal Agent Recommendations
 *
 * Generates priority-sorted agent recommendations from proposal state.
 * These are actionable suggestions for the user to move the proposal forward.
 */

import type { ProposalBuilderResult, ProposalStatus } from '../types/proposalBuilder';

export interface ProposalAgentRecommendation {
  id: string;
  scope: 'user' | 'project';
  title: string;
  rationale: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  recommendedActionLabel: string;
  relatedRoute: string;
  requiresHumanApproval: boolean;
  /** Optional metadata for the UI to use */
  metadata?: Record<string, unknown>;
}

interface RecommendationContext {
  projectId?: string;
  proposalId: string;
  status: ProposalStatus;
  discountReasonMissing: boolean;
  scopeEmpty: boolean;
  termsAttached: boolean;
  warningsCount: number;
}

const PRIORITY_WEIGHT: Record<ProposalAgentRecommendation['priority'], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Generate agent recommendations based on proposal context.
 */
export function generateProposalRecommendations(
  context: RecommendationContext,
): ProposalAgentRecommendation[] {
  const recommendations: ProposalAgentRecommendation[] = [];
  const baseRoute = context.projectId
    ? `/projects/${context.projectId}/toolboxes/proposals/${context.proposalId}`
    : `/proposals/${context.proposalId}`;

  // 1. Scope completion check
  if (context.scopeEmpty) {
    recommendations.push({
      id: `rec-${context.proposalId}-scope-missing`,
      scope: 'project',
      title: 'Complete scope of services before issuing',
      rationale: 'A proposal should not be issued without a defined scope of services. This protects both parties.',
      priority: 'high',
      recommendedActionLabel: 'Add scope of services',
      relatedRoute: `${baseRoute}/scope`,
      requiresHumanApproval: true,
    });
  }

  // 2. Terms attachment check
  if (!context.termsAttached) {
    recommendations.push({
      id: `rec-${context.proposalId}-terms-missing`,
      scope: 'project',
      title: 'Attach terms and conditions',
      rationale: 'Terms and conditions must be attached before the proposal can be issued to the client.',
      priority: 'high',
      recommendedActionLabel: 'Select terms template',
      relatedRoute: `${baseRoute}/terms`,
      requiresHumanApproval: true,
    });
  }

  // 3. Discount reason check
  if (context.discountReasonMissing) {
    recommendations.push({
      id: `rec-${context.proposalId}-discount-reason`,
      scope: 'project',
      title: 'Provide a reason for the professional discount',
      rationale: 'Architex requires a reason for any discount applied to the professional fee. This maintains transparency.',
      priority: 'medium',
      recommendedActionLabel: 'Add discount reason',
      relatedRoute: `${baseRoute}/discount`,
      requiresHumanApproval: true,
    });
  }

  // 4. Warnings check
  if (context.warningsCount > 0) {
    recommendations.push({
      id: `rec-${context.proposalId}-warnings`,
      scope: 'project',
      title: `Resolve ${context.warningsCount} proposal warning(s)`,
      rationale: 'Warnings indicate potential issues that should be addressed before issuing.',
      priority: 'high',
      recommendedActionLabel: 'Review warnings',
      relatedRoute: `${baseRoute}/review`,
      requiresHumanApproval: true,
    });
  }

  // 5. Ready for professional approval
  if (context.status === 'terms_attached' && context.termsAttached && !context.scopeEmpty) {
    recommendations.push({
      id: `rec-${context.proposalId}-professional-approve`,
      scope: 'project',
      title: 'Professionally approve the proposal',
      rationale: 'The proposal has all required components and is ready for your professional review and approval.',
      priority: 'high',
      recommendedActionLabel: 'Approve proposal',
      relatedRoute: `${baseRoute}/approve`,
      requiresHumanApproval: true,
    });
  }

  // 6. Issued — request acceptance
  if (context.status === 'issued') {
    recommendations.push({
      id: `rec-${context.proposalId}-request-acceptance`,
      scope: 'user',
      title: 'Request client acceptance',
      rationale: 'The issued proposal is awaiting client acceptance. Send a reminder if needed.',
      priority: 'high',
      recommendedActionLabel: 'Send acceptance request',
      relatedRoute: `${baseRoute}/acceptance`,
      requiresHumanApproval: true,
    });
  }

  // 7. Accepted — convert to appointment
  if (context.status === 'accepted') {
    recommendations.push({
      id: `rec-${context.proposalId}-convert-appointment`,
      scope: 'project',
      title: 'Convert accepted proposal to professional appointment',
      rationale: 'The proposal has been accepted. Set up the formal professional appointment to begin work.',
      priority: 'critical',
      recommendedActionLabel: 'Create appointment',
      relatedRoute: context.projectId
        ? `/projects/${context.projectId}/appointments/new`
        : '/appointments/new',
      requiresHumanApproval: true,
    });
  }

  // Sort by priority (highest first)
  return recommendations.sort(
    (a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority],
  );
}

/**
 * Generate recommendations from a ProposalBuilderResult.
 * Convenience wrapper around generateProposalRecommendations.
 */
export function recommendationsFromProposal(
  proposal: ProposalBuilderResult,
  projectId?: string,
): ProposalAgentRecommendation[] {
  return generateProposalRecommendations({
    projectId,
    proposalId: proposal.idSeed,
    status: proposal.status,
    discountReasonMissing: proposal.discountAmount > 0 && !proposal.auditSnapshot?.discount,
    scopeEmpty: !(proposal.auditSnapshot as any)?.scopeSummary,
    termsAttached: !!proposal.terms?.termsTemplateId,
    warningsCount: 0,
  });
}
