/**
 * Professional Team Router Service
 * Trigger-based professional team routing for municipal submission readiness.
 *
 * Key rule: Routing must be trigger-based, NOT role-default-based.
 * The system must say:
 *   "Required: structural engineer, because load-bearing changes are indicated."
 *   "Not currently required: environmental practitioner, because no environmental trigger exists."
 *
 * Part of Pack 6: Municipal Submission Readiness
 */
import type {
  ComplexityAssessment,
  ProfessionalRoutingDecision,
  ProjectScopeFacts,
  SubmissionDiscipline,
  RoutingStatus,
} from '@/types/municipalSubmissionReadiness';

function decision(
  discipline: SubmissionDiscipline,
  status: RoutingStatus,
  reason: string,
  approvalRequired: boolean = true
): ProfessionalRoutingDecision {
  return { discipline, status, reason, approvalRequired };
}

/**
 * Route professional team members based on project scope facts and complexity.
 * Returns routing decisions for all 14 disciplines, each with a trigger-based
 * status (required/optional/not_currently_required) and an explicit reason.
 */
export function routeProfessionalTeam(
  project: ProjectScopeFacts,
  complexity: ComplexityAssessment
): ProfessionalRoutingDecision[] {
  return [
    // ── Always required ──
    decision(
      'client',
      'required',
      'Client/developer must provide authority, property documents and confirm project intent.',
      false
    ),
    decision(
      'lead_professional',
      'required',
      'Lead appointed professional coordinates submission readiness and approves formal outputs.'
    ),
    decision(
      'architect',
      'required',
      'Architect/lead designer owns architectural drawing package where building work is proposed.'
    ),
    decision(
      'municipal_coordinator',
      'required',
      'Submission pack tracking and municipal requirement coordination is needed.',
      false
    ),

    // ── Trigger-based ──
    project.changesLoadBearing
      ? decision(
          'structural_engineer',
          'required',
          'Structural trigger: load-bearing changes or structural drawings required.'
        )
      : decision(
          'structural_engineer',
          'not_currently_required',
          'No structural/load-bearing trigger currently captured.',
          false
        ),

    project.changesDrainageOrStormwater
      ? decision(
          'civil_engineer',
          'required',
          'Civil trigger: stormwater, sewer, levels or services impact indicated.'
        )
      : decision(
          'civil_engineer',
          'not_currently_required',
          'No civil services/stormwater trigger currently captured.',
          false
        ),

    project.publicAccessOrAssembly ||
    project.occupancyType === 'public_assembly'
      ? decision(
          'fire_consultant',
          'required',
          'Fire-life-safety trigger: public assembly/access or elevated occupancy risk.'
        )
      : decision(
          'fire_consultant',
          'optional',
          'Fire review may still be requested by professional or municipality; no hard trigger captured.',
          false
        ),

    project.envelopeEnergyImpact
      ? decision(
          'energy_consultant',
          'required',
          'SANS 10400-XA/energy trigger: envelope or fenestration impact indicated.'
        )
      : decision(
          'energy_consultant',
          'not_currently_required',
          'No energy-envelope trigger currently captured.',
          false
        ),

    !project.zoningKnown || project.coverageOrParkingRisk
      ? decision(
          'town_planner',
          'required',
          'Land-use trigger: zoning unknown or coverage/parking risk indicated.'
        )
      : decision(
          'town_planner',
          'not_currently_required',
          'No land-use/parking/coverage trigger currently captured.',
          false
        ),

    project.boundaryOrServitudeUnclear
      ? decision(
          'land_surveyor',
          'required',
          'Geomatics trigger: boundary, SG diagram, servitude or site verification issue.'
        )
      : decision(
          'land_surveyor',
          'not_currently_required',
          'No boundary/servitude trigger currently captured.',
          false
        ),

    complexity.complexity !== 'low'
      ? decision(
          'quantity_surveyor',
          'optional',
          'Medium/high complexity suggests cost-control input may be useful but not always mandatory.',
          false
        )
      : decision(
          'quantity_surveyor',
          'not_currently_required',
          'Low-complexity project does not currently require QS routing.',
          false
        ),

    project.heritagePotential
      ? decision(
          'heritage_practitioner',
          'required',
          'Heritage trigger indicated.'
        )
      : decision(
          'heritage_practitioner',
          'not_currently_required',
          'No heritage trigger currently captured.',
          false
        ),

    project.environmentalSensitivity
      ? decision(
          'environmental_practitioner',
          'required',
          'Environmental sensitivity trigger indicated.'
        )
      : decision(
          'environmental_practitioner',
          'not_currently_required',
          'No environmental trigger currently captured.',
          false
        ),

    project.trafficImpact
      ? decision(
          'traffic_engineer',
          'required',
          'Traffic/access trigger indicated.'
        )
      : decision(
          'traffic_engineer',
          'not_currently_required',
          'No traffic/access trigger currently captured.',
          false
        ),
  ];
}

/**
 * Get a human-readable summary of the routing decision.
 */
export function formatRoutingDecision(
  r: ProfessionalRoutingDecision
): string {
  const statusLabel =
    r.status === 'required'
      ? 'Required'
      : r.status === 'optional'
        ? 'Optional'
        : 'Not currently required';
  return `${statusLabel}: ${r.discipline.replace(/_/g, ' ')} — ${r.reason}`;
}

/**
 * Get all required disciplines from routing decisions.
 */
export function getRequiredDisciplines(
  routes: ProfessionalRoutingDecision[]
): SubmissionDiscipline[] {
  return routes.filter((r) => r.status === 'required').map((r) => r.discipline);
}
