/**
 * Submission Evidence Pack Service
 * Assembles the evidence pack for municipal submission lodgment.
 *
 * Part of Pack 6: Municipal Submission Readiness
 */
import type {
  EvidencePackItem,
  ProfessionalRoutingDecision,
  ReadinessAssessment,
} from '@/types/municipalSubmissionReadiness';

/**
 * Assemble an evidence pack based on readiness assessment and professional routing.
 * The evidence pack collects drawings, forms, reports, approvals, and appointments
 * into a checklist ready for council lodgment.
 */
export function assembleEvidencePack(
  readiness: ReadinessAssessment,
  routes: ProfessionalRoutingDecision[]
): EvidencePackItem[] {
  const requiredRoutes = routes.filter((r) => r.status === 'required');

  const items: EvidencePackItem[] = [
    {
      id: 'ev-001',
      title: 'Project Passport baseline',
      source: 'Project Passport',
      status: 'included',
    },
    {
      id: 'ev-002',
      title: 'Appointment record and client authority',
      source: 'Appointment + Documents',
      status: readiness.blockers.some((b) =>
        b.toLowerCase().includes('client authority')
      )
        ? 'blocked'
        : 'included',
    },
    {
      id: 'ev-003',
      title: 'Municipal readiness checklist',
      source: 'Municipal Matrix',
      status: 'included',
    },
    {
      id: 'ev-004',
      title: 'Drawing register package',
      source: 'Documents + Drawing Intelligence',
      status: readiness.blockers.some(
        (b) =>
          b.toLowerCase().includes('draw') ||
          b.toLowerCase().includes('plan') ||
          b.toLowerCase().includes('elevation') ||
          b.toLowerCase().includes('section')
      )
        ? 'placeholder'
        : 'included',
    },
    {
      id: 'ev-005',
      title: `Professional routing table (${requiredRoutes.length} required disciplines)`,
      source: 'BEP Router',
      status: 'included',
    },
    {
      id: 'ev-006',
      title: 'Professional sign-off bundle',
      source: 'Required BEPs',
      status: readiness.checks.some(
        (c) =>
          c.category === 'professional_signoffs' && c.status !== 'complete'
      )
        ? 'placeholder'
        : 'included',
    },
    {
      id: 'ev-007',
      title: 'NBR/SANS 10400 advisory pre-check report',
      source: 'NBR/SANS Pre-check Service',
      status: 'included',
    },
    {
      id: 'ev-008',
      title: 'Supporting documents bundle',
      source: 'Documents',
      status: readiness.blockers.some((b) =>
        b.toLowerCase().includes('title deed') ||
        b.toLowerCase().includes('sg diagram') ||
        b.toLowerCase().includes('zoning certificate')
      )
        ? 'blocked'
        : 'included',
    },
    {
      id: 'ev-009',
      title: 'Submission cover letter (auto-generated)',
      source: 'Submission Readiness Engine',
      status: 'placeholder',
    },
    {
      id: 'ev-010',
      title: 'Digital lodgment receipt (post-submission)',
      source: 'Municipal Portal',
      status: 'placeholder',
    },
  ];

  return items;
}

/**
 * Get a summary of evidence pack completeness.
 */
export function evidencePackSummary(items: EvidencePackItem[]): {
  included: number;
  placeholder: number;
  blocked: number;
  ready: boolean;
} {
  const included = items.filter((i) => i.status === 'included').length;
  const placeholder = items.filter((i) => i.status === 'placeholder').length;
  const blocked = items.filter((i) => i.status === 'blocked').length;

  return {
    included,
    placeholder,
    blocked,
    ready: blocked === 0,
  };
}
