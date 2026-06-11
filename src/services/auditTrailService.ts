/**
 * Audit Trail Service
 * Records advisory outputs and approvals required for municipal submission.
 *
 * Part of Pack 6: Municipal Submission Readiness
 */
import type {
  ComplexityAssessment,
  ReadinessAssessment,
  SubmissionAuditRecord,
} from '@/types/municipalSubmissionReadiness';

/**
 * Create audit trail records from the submission readiness process.
 * All records are advisory — formal submission and compliance claims
 * require appointed professional approval.
 */
export function createAuditTrail(
  complexity: ComplexityAssessment,
  readiness: ReadinessAssessment
): SubmissionAuditRecord[] {
  const now = new Date().toISOString();

  return [
    {
      id: 'audit-complexity',
      action: 'project_complexity_classified',
      actor: 'system',
      notes: `Complexity: ${complexity.complexity}; triggers: ${complexity.triggers.length} (${complexity.triggers.join('; ')})`,
      timestamp: now,
    },
    {
      id: 'audit-readiness',
      action: 'municipal_readiness_assessed',
      actor: 'agent',
      notes: `Score: ${readiness.score}%; blockers: ${readiness.blockers.length}. Advisory only — not a statutory compliance determination.`,
      timestamp: now,
    },
    {
      id: 'audit-guardrail',
      action: 'human_approval_required',
      actor: 'system',
      notes:
        'Formal submission and compliance claims require appointed professional approval. Automated readiness is advisory only.',
      timestamp: now,
    },
  ];
}
