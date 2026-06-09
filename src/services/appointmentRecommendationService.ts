// Pack 5: Appointment Recommendation Service
// Agent-driven recommendations for next actions after appointment creation.
// All recommendations are advisory — human approval is always required for
// formal issuance, legal documents, and compliance-critical decisions.

import type {
  KickoffAppointmentRecord,
  AgentRecommendation,
  KickoffPackage,
} from '../types/appointmentKickoff';
import { validateKickoffReadiness } from './appointmentKickoffService';

export function recommendNextActions(
  appointment: KickoffAppointmentRecord,
  kickoff: KickoffPackage,
): AgentRecommendation[] {
  const recommendations: AgentRecommendation[] = [];

  // If there are missing facts, that's the highest priority
  if (appointment.missingFacts.length > 0) {
    recommendations.push({
      id: 'rec-request-missing-facts',
      title: 'Request missing project facts from client',
      rationale: appointment.missingFacts.join(' '),
      requiresHumanApproval: false,
    });
  }

  // Always recommend human review of appointment letter before issue
  recommendations.push({
    id: 'rec-human-approve-appointment-letter',
    title: 'Review and approve appointment letter before issue',
    rationale:
      'Formal appointment documents should not be issued automatically from an agent-generated draft.',
    requiresHumanApproval: true,
  });

  // Generate project brief from accepted scope
  recommendations.push({
    id: 'rec-generate-project-brief',
    title: 'Generate first project brief from accepted scope and client facts',
    rationale:
      'The project brief becomes the first operational baseline for inception work.',
    requiresHumanApproval: false,
  });

  // Assign initial inception tasks
  recommendations.push({
    id: 'rec-assign-inception-tasks',
    title: 'Assign initial inception and municipal-readiness tasks',
    rationale: `${kickoff.initialTasks.length} starter tasks are available from the kickoff package.`,
    requiresHumanApproval: false,
  });

  // Zoning check for South African submission readiness
  if (!appointment.projectFacts.landUseOrZoningKnown) {
    recommendations.push({
      id: 'rec-check-zoning',
      title:
        'Check land-use/zoning before municipal submission path is confirmed',
      rationale:
        'South African submission readiness depends on verified municipal and land-use context.',
      requiresHumanApproval: true,
    });
  }

  // If kickoff is blocked, recommend resolution path
  if (kickoff.readiness === 'blocked') {
    const gates = validateKickoffReadiness(appointment);
    if (gates.blockers.length > 0) {
      recommendations.push({
        id: 'rec-resolve-kickoff-blockers',
        title: `Resolve ${gates.blockers.length} kickoff blocker(s)`,
        rationale: gates.blockers.join(' | '),
        requiresHumanApproval: true,
      });
    }
  }

  return recommendations;
}
