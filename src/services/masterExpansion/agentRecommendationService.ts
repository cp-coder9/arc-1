import {
  AgentRecommendation,
  Priority,
  ProjectPassportSummary,
  ProjectRecordType,
  WorkflowEvent,
} from '@/types/architexMasterTypes';

// ─── Agent Recommendation Service ───────────────────────────────────────────

/**
 * Generate agent-ready recommendations from a Project Passport and
 * its associated workflow events.
 *
 * Each recommendation includes:
 * - scope (user/project level)
 * - priority and rationale
 * - a human-readable action label
 * - the related route for navigation
 * - whether human approval is required
 */
export function recommendationsFromPassport(
  passport: ProjectPassportSummary,
  events: WorkflowEvent[],
): AgentRecommendation[] {
  const recommendations: AgentRecommendation[] = [];

  // ── Missing Record Recommendations ────────────────────────────────────

  const missingRecords = passport.missingRequiredRecords ?? [];
  for (const recordType of missingRecords) {
    recommendations.push({
      id: `rec-missing-${recordType}`,
      scope: 'project',
      title: `Resolve missing ${formatRecordType(recordType)}`,
      rationale: `Required record "${recordType}" is missing for phase ${passport.currentPhase}.`,
      priority: priorityForRecordType(recordType),
      recommendedActionLabel: actionLabelForRecordType(recordType),
      relatedRecordType: recordType,
      relatedRoute: `/projects/${passport.projectId}/records`,
      requiresHumanApproval: requiresApproval(recordType),
    });
  }

  // ── Lifecycle-Based Recommendations ───────────────────────────────────

  if (passport.lifecycle) {
    for (const blocker of passport.lifecycle.blockers) {
      // Extract priority from blocker string if present
      const blockerPriority: Priority = blocker.includes('CRITICAL')
        ? 'critical'
        : blocker.includes('HIGH')
          ? 'high'
          : 'medium';

      recommendations.push({
        id: `rec-blocker-${hashString(blocker)}`,
        scope: 'project',
        title: `Resolve blocker: ${truncateText(blocker, 80)}`,
        rationale: blocker,
        priority: blockerPriority,
        recommendedActionLabel: 'Open project passport to review blocker',
        relatedRoute: `/projects/${passport.projectId}/passport`,
        requiresHumanApproval: blockerPriority === 'critical',
      });
    }
  }

  // ── Event-Driven Recommendations ──────────────────────────────────────

  for (const event of events) {
    // Top-priority events get a dedicated recommendation
    if (event.priority === 'critical' || event.priority === 'high') {
      recommendations.push({
        id: `rec-event-${event.id}`,
        scope: 'user',
        title: `Handle: ${event.title}`,
        rationale: event.detail,
        priority: event.priority,
        recommendedActionLabel: event.type === 'payment_due'
          ? 'Review payment in Finance'
          : 'Open blocker in Inbox',
        relatedRoute:
          event.type === 'payment_due'
            ? `/projects/${passport.projectId}/finance`
            : `/inbox/${event.id}`,
        requiresHumanApproval:
          event.priority === 'critical' || event.type === 'payment_due',
      });
    }
  }

  // ── Status-Based Recommendations ──────────────────────────────────────

  if (passport.approvalStatus === 'missing') {
    recommendations.push({
      id: 'rec-approval-missing',
      scope: 'project',
      title: 'Address missing approvals',
      rationale:
        'No municipal or regulatory approval evidence found for this project.',
      priority: 'high',
      recommendedActionLabel: 'Upload approval evidence',
      relatedRoute: `/projects/${passport.projectId}/compliance`,
      requiresHumanApproval: true,
    });
  }

  if (passport.financialStatus === 'pending_review') {
    recommendations.push({
      id: 'rec-financial-pending',
      scope: 'project',
      title: 'Review pending payments',
      rationale:
        'Payment certificates require QS and client review before release.',
      priority: 'high',
      recommendedActionLabel: 'Review payments in Finance',
      relatedRoute: `/projects/${passport.projectId}/finance`,
      requiresHumanApproval: true,
    });
  }

  if (passport.documentStatus === 'incomplete') {
    recommendations.push({
      id: 'rec-docs-incomplete',
      scope: 'project',
      title: 'Complete project documentation',
      rationale:
        'Required documents are missing or incomplete for the current phase.',
      priority: 'medium',
      recommendedActionLabel: 'Upload missing documents',
      relatedRoute: `/projects/${passport.projectId}/documents`,
      requiresHumanApproval: false,
    });
  }

  // ── Sort by priority ──────────────────────────────────────────────────

  return recommendations.sort(
    (a, b) => rankPriority(b.priority) - rankPriority(a.priority),
  );
}

/**
 * Generate a single agent recommendation for a specific action.
 */
export function createRecommendation(params: {
  projectId: string;
  title: string;
  rationale: string;
  priority: Priority;
  actionLabel: string;
  route: string;
  requiresApproval?: boolean;
  relatedRecordType?: ProjectRecordType;
}): AgentRecommendation {
  return {
    id: `rec-${params.projectId}-${hashString(params.title)}`,
    scope: 'project',
    title: params.title,
    rationale: params.rationale,
    priority: params.priority,
    recommendedActionLabel: params.actionLabel,
    relatedRecordType: params.relatedRecordType,
    relatedRoute: params.route,
    requiresHumanApproval: params.requiresApproval ?? false,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function rankPriority(priority: Priority): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[priority];
}

function formatRecordType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function priorityForRecordType(recordType: string): Priority {
  const highPriorityTypes = [
    'municipal_submission_item',
    'payment_certificate',
    'verification_record',
    'snag',
    'drawing_revision',
  ];
  const criticalTypes = ['municipal_submission_item', 'verification_record'];

  if (criticalTypes.includes(recordType)) return 'critical';
  if (highPriorityTypes.includes(recordType)) return 'high';
  return 'medium';
}

function requiresApproval(recordType: string): boolean {
  return [
    'municipal_submission_item',
    'payment_certificate',
    'verification_record',
    'escrow_milestone',
    'closeout_item',
  ].includes(recordType);
}

function actionLabelForRecordType(recordType: string): string {
  switch (recordType) {
    case 'municipal_submission_item':
      return 'Upload municipal approval evidence';
    case 'payment_certificate':
      return 'Submit payment certificate for review';
    case 'verification_record':
      return 'Complete appointment verification';
    case 'snag':
      return 'Resolve outstanding snags';
    case 'drawing_revision':
      return 'Upload controlled drawing revision';
    case 'closeout_item':
      return 'Assemble closeout documentation';
    case 'knowledge_source':
      return 'Create knowledge source record';
    case 'escrow_milestone':
      return 'Define escrow milestone';
    case 'rfq':
      return 'Create RFQ package';
    case 'quote_comparison':
      return 'Complete quote comparison';
    case 'site_diary':
      return 'Start site diary entries';
    default:
      return `Create "${formatRecordType(recordType)}" record`;
  }
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < Math.min(str.length, 50); i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36).slice(0, 6);
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}
