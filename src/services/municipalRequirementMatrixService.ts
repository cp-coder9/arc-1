/**
 * Municipal Requirement Matrix Service
 * Municipality-specific requirement checks for submission readiness.
 *
 * Part of Pack 6: Municipal Submission Readiness
 */
import type {
  ProjectScopeFacts,
  ReadinessCheck,
} from '@/types/municipalSubmissionReadiness';

function hasDoc(project: ProjectScopeFacts, kind: string): boolean {
  return project.supportingDocuments.some(
    (d) => d.kind === kind && d.status === 'available'
  );
}

/**
 * Build municipality-specific readiness checks from project scope facts.
 * These cover property facts, land-use/zoning, supporting documents,
 * and client authority.
 */
export function buildMunicipalRequirementChecks(
  project: ProjectScopeFacts
): ReadinessCheck[] {
  const checks: ReadinessCheck[] = [
    // ── Property & Municipal Facts ──
    {
      id: 'mun-001',
      category: 'property_and_municipal_facts',
      label: 'Municipality captured',
      status: project.municipality ? 'complete' : 'missing',
      owner: 'municipal_coordinator',
    },
    {
      id: 'mun-002',
      category: 'property_and_municipal_facts',
      label: 'Erf/property reference captured',
      status:
        project.erfNumber || project.propertyDescription
          ? 'complete'
          : 'missing',
      owner: 'client',
    },
    {
      id: 'mun-003',
      category: 'property_and_municipal_facts',
      label: 'Province captured',
      status: project.province ? 'complete' : 'missing',
      owner: 'municipal_coordinator',
    },

    // ── Land Use & Zoning ──
    {
      id: 'mun-010',
      category: 'land_use_and_zoning',
      label: 'Zoning/land-use confirmed',
      status: project.zoningKnown ? 'complete' : 'missing',
      owner: 'town_planner',
    },
    {
      id: 'mun-011',
      category: 'land_use_and_zoning',
      label: 'Coverage and parking within limits',
      status: project.coverageOrParkingRisk
        ? 'requires_professional_review'
        : 'complete',
      owner: 'town_planner',
    },
    {
      id: 'mun-012',
      category: 'land_use_and_zoning',
      label: 'Occupancy classification verified',
      status: 'requires_professional_review',
      owner: 'lead_professional',
    },

    // ── Supporting Documents ──
    {
      id: 'mun-020',
      category: 'supporting_documents',
      label: 'Title deed available',
      status: hasDoc(project, 'title_deed') ? 'complete' : 'missing',
      owner: 'client',
    },
    {
      id: 'mun-021',
      category: 'supporting_documents',
      label: 'SG diagram / site boundary evidence available',
      status: hasDoc(project, 'sg_diagram') ? 'complete' : 'missing',
      owner: 'land_surveyor',
    },
    {
      id: 'mun-022',
      category: 'supporting_documents',
      label: 'Zoning certificate available',
      status: hasDoc(project, 'zoning_certificate')
        ? 'complete'
        : project.zoningKnown
          ? 'missing'
          : 'requires_professional_review',
      owner: 'town_planner',
    },
    {
      id: 'mun-023',
      category: 'supporting_documents',
      label: 'Heritage comment obtained (if applicable)',
      status: project.heritagePotential
        ? hasDoc(project, 'heritage_comment')
          ? 'complete'
          : 'missing'
        : 'not_applicable',
      owner: 'heritage_practitioner',
    },
    {
      id: 'mun-024',
      category: 'supporting_documents',
      label: 'Environmental comment obtained (if applicable)',
      status: project.environmentalSensitivity
        ? hasDoc(project, 'environmental_comment')
          ? 'complete'
          : 'missing'
        : 'not_applicable',
      owner: 'environmental_practitioner',
    },
    {
      id: 'mun-025',
      category: 'supporting_documents',
      label: 'Traffic comment obtained (if applicable)',
      status: project.trafficImpact
        ? hasDoc(project, 'traffic_comment')
          ? 'complete'
          : 'missing'
        : 'not_applicable',
      owner: 'traffic_engineer',
    },

    // ── Client Authority ──
    {
      id: 'mun-030',
      category: 'client_authority',
      label: 'Client authority / owner consent available',
      status: hasDoc(project, 'client_authority') ? 'complete' : 'missing',
      owner: 'client',
    },
    {
      id: 'mun-031',
      category: 'client_authority',
      label: 'Appointment record available',
      status: hasDoc(project, 'appointment_record')
        ? 'complete'
        : 'missing',
      owner: 'lead_professional',
    },
  ];

  return checks;
}
