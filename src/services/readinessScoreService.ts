/**
 * Readiness Score Service
 * Calculates submission readiness score across 8 categories.
 *
 * Eight readiness categories:
 * 1. property_and_municipal_facts
 * 2. land_use_and_zoning
 * 3. professional_team
 * 4. nbr_sans_advisory_precheck
 * 5. drawing_register
 * 6. supporting_documents
 * 7. professional_signoffs
 * 8. client_authority
 *
 * Part of Pack 6: Municipal Submission Readiness
 */
import type {
  ReadinessAssessment,
  ReadinessCategory,
  ReadinessCheck,
  CheckStatus,
} from '@/types/municipalSubmissionReadiness';

const ALL_CATEGORIES: ReadinessCategory[] = [
  'property_and_municipal_facts',
  'land_use_and_zoning',
  'professional_team',
  'nbr_sans_advisory_precheck',
  'drawing_register',
  'supporting_documents',
  'professional_signoffs',
  'client_authority',
];

/**
 * Assess readiness from a set of checks.
 * Returns overall score, per-category scores, blockers, and ready/not-ready determination.
 */
export function assessReadiness(checks: ReadinessCheck[]): ReadinessAssessment {
  const applicable = checks.filter((c) => c.status !== 'not_applicable');
  const complete = applicable.filter(
    (c) => c.status === 'complete'
  ).length;
  const blockers = applicable
    .filter((c) => c.status === 'missing')
    .map((c) => `${c.label} (${c.owner.replace(/_/g, ' ')})`);

  const reviewItems = applicable
    .filter((c) => c.status === 'requires_professional_review')
    .map(
      (c) =>
        `${c.label} requires ${c.owner.replace(/_/g, ' ')} review`
    );

  const overallScore =
    applicable.length === 0
      ? 100
      : Math.round((complete / applicable.length) * 100);

  // Per-category scores
  const categoryScores = {} as ReadinessAssessment['categoryScores'];

  for (const category of ALL_CATEGORIES) {
    const catChecks = applicable.filter((c) => c.category === category);
    const catComplete = catChecks.filter(
      (c) => c.status === 'complete'
    ).length;
    categoryScores[category] = {
      total: catChecks.length,
      complete: catComplete,
      score: catChecks.length === 0 ? 100 : Math.round((catComplete / catChecks.length) * 100),
    };
  }

  // Ready if no blockers AND 3 or fewer items require professional review
  const readyForProfessionalSubmissionReview =
    blockers.length === 0 && reviewItems.length <= 3;

  return {
    score: overallScore,
    readyForProfessionalSubmissionReview,
    blockers: [...blockers, ...reviewItems],
    checks,
    categoryScores,
  };
}

/**
 * Get a category score breakdown for display.
 */
export function getCategoryScoreBreakdown(
  assessment: ReadinessAssessment
): Array<{
  category: ReadinessCategory;
  label: string;
  score: number;
  total: number;
  complete: number;
}> {
  const categoryLabels: Record<ReadinessCategory, string> = {
    property_and_municipal_facts: 'Property & Municipal Facts',
    land_use_and_zoning: 'Land Use & Zoning',
    professional_team: 'Professional Team',
    nbr_sans_advisory_precheck: 'NBR/SANS Pre-check',
    drawing_register: 'Drawing Register',
    supporting_documents: 'Supporting Documents',
    professional_signoffs: 'Professional Signoffs',
    client_authority: 'Client Authority',
  };

  return ALL_CATEGORIES.map((category) => {
    const cs = assessment.categoryScores[category];
    return {
      category,
      label: categoryLabels[category],
      score: cs.score,
      total: cs.total,
      complete: cs.complete,
    };
  });
}

/**
 * Build professional team checks from routing decisions.
 */
export function buildProfessionalTeamChecks(
  routes: Array<{ discipline: string; status: string }>
): ReadinessCheck[] {
  return routes.map((r, i) => ({
    id: `team-${String(i + 1).padStart(3, '0')}`,
    category: 'professional_team' as ReadinessCategory,
    label: `${r.discipline.replace(/_/g, ' ')}`,
    status:
      r.status === 'required'
        ? ('requires_professional_review' as CheckStatus)
        : r.status === 'not_currently_required'
          ? ('not_applicable' as CheckStatus)
          : ('requires_professional_review' as CheckStatus),
    owner: r.discipline as any,
  }));
}
