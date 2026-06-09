/**
 * Inbox Event Adapter Service
 * Routes action items to only the required parties based on readiness assessment.
 *
 * Part of Pack 6: Municipal Submission Readiness
 */
import type {
  ProfessionalRoutingDecision,
  ReadinessAssessment,
  SubmissionInboxEvent,
} from '@/types/municipalSubmissionReadiness';

/**
 * Create inbox events from readiness assessment and professional routing.
 * Events are routed only to required disciplines — not blast-messaged.
 */
export function createInboxEvents(
  readiness: ReadinessAssessment,
  routes: ProfessionalRoutingDecision[]
): SubmissionInboxEvent[] {
  const events: SubmissionInboxEvent[] = [];

  // ── Required disciplines get "action required" events ──
  const required = routes.filter((r) => r.status === 'required');
  for (let i = 0; i < required.length; i++) {
    const r = required[i];
    events.push({
      id: `evt-route-${r.discipline}`,
      recipient: r.discipline,
      title: `Municipal readiness input required: ${r.reason}`,
      severity: 'action_required',
    });
  }

  // ── Blockers → lead professional ──
  for (let i = 0; i < readiness.blockers.length; i++) {
    const blocker = readiness.blockers[i];
    events.push({
      id: `evt-blocker-${String(i + 1).padStart(3, '0')}`,
      recipient: 'lead_professional',
      title: `Readiness blocker: ${blocker}`,
      severity: 'blocked',
    });
  }

  // ── Ready notification if applicable ──
  if (readiness.readyForProfessionalSubmissionReview) {
    events.push({
      id: 'evt-ready',
      recipient: 'lead_professional',
      title:
        'Submission readiness assessment complete — ready for professional review',
      severity: 'info',
    });
  } else {
    events.push({
      id: 'evt-not-ready',
      recipient: 'lead_professional',
      title: `Submission not ready: ${readiness.score}% score — ${readiness.blockers.length} items need attention`,
      severity: readiness.blockers.length > 5 ? 'blocked' : 'action_required',
    });
  }

  return events;
}

/**
 * Get events filtered for a specific recipient discipline.
 */
export function getEventsForDiscipline(
  events: SubmissionInboxEvent[],
  discipline: string
): SubmissionInboxEvent[] {
  return events.filter((e) => e.recipient === discipline);
}
