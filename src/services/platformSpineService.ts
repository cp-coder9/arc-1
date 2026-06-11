/**
 * Architex Platform Spine — Core Service
 *
 * Pure computation service that powers role-aware navigation, event-driven
 * inbox generation, agent recommendations, and platform spine snapshots.
 *
 * This service is intentionally free of database, network, or framework
 * dependencies. It operates on typed inputs and returns typed outputs,
 * making it testable in isolation and safe to call from any UI layer.
 *
 * @see platformSpineTypes.ts — type definitions
 * @see platformSpineNavigationConfig.ts — navigation zone/workspace data
 * @see ARCHITEX_PLATFORM_SPINE_BRIEF.md
 */

import { navigationZonesForRole, workspaceRoutesForContext } from './platformSpineNavigationConfig';
import type {
  ArchitexRole,
  InboxItem,
  PlatformAgentRecommendation,
  PlatformSpineSnapshot,
  Priority,
  ProjectPassport,
  UserContext,
  WorkflowEvent,
} from '@/types/platformSpine';

// ── Priority Ordering ───────────────────────────────────────────────────────

const PRIORITY_RANK: Record<Priority, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

// ── Event Filtering ─────────────────────────────────────────────────────────

/**
 * Filter and sort workflow events for a specific role.
 * Admins see all events; other roles see only their assigned events.
 * Results are sorted by priority (critical → high → medium → low).
 */
export function eventsForRole(
  events: WorkflowEvent[],
  role: ArchitexRole,
): WorkflowEvent[] {
  return events
    .filter((event) => event.assignedRoles.includes(role) || role === 'admin')
    .sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]);
}

// ── Inbox Generation ────────────────────────────────────────────────────────

/**
 * Convert workflow events into actionable inbox items for a given role.
 * Each event becomes an inbox item with a route determined by event type.
 */
export function inboxItemsFromEvents(
  events: WorkflowEvent[],
  role: ArchitexRole,
): InboxItem[] {
  return eventsForRole(events, role).map((event) => ({
    id: `inbox-${event.id}`,
    title: event.title,
    detail: event.detail,
    priority: event.priority,
    route: event.projectId
      ? `/projects/${event.projectId}/${routeForEvent(event)}`
      : `/${event.sourceModule.replace('_', '-')}`,
    assignedRoles: event.assignedRoles,
    sourceEventId: event.id,
  }));
}

/**
 * Map a workflow event type to its most relevant workspace route.
 */
export function routeForEvent(event: WorkflowEvent): string {
  switch (event.type) {
    case 'document_updated':
      return 'documents';
    case 'approval_required':
      return 'tasks';
    case 'quote_received':
      return 'procurement';
    case 'payment_due':
      return 'finance';
    case 'municipal_blocker':
      return 'municipal-readiness';
    case 'cpd_certificate_ready':
      return 'cpd';
    case 'task_overdue':
      return 'tasks';
    case 'risk_detected':
      return 'passport';
    case 'project_phase_changed':
      return 'lifecycle';
  }
}

// ── Agent Recommendations ───────────────────────────────────────────────────

/**
 * Build agent recommendations from user context, project passport state,
 * and the current inbox. Recommendations are pure computation — they don't
 * call AI models or databases. The future Agent Orchestration Runtime can
 * replace this with real model-driven recommendations using the same interface.
 */
export function buildAgentRecommendations(
  user: UserContext,
  passport: ProjectPassport,
  inboxItems: InboxItem[],
): PlatformAgentRecommendation[] {
  const recommendations: PlatformAgentRecommendation[] = [];

  // Risk-based recommendation: always surface passport blockers first
  if (passport.riskLevel === 'high' || passport.riskLevel === 'critical') {
    recommendations.push({
      id: `rec-risk-${passport.projectId}`,
      agentScope: 'project',
      title: 'Resolve project passport blockers first',
      rationale: `${passport.projectName} is marked ${passport.riskLevel} risk and has ${passport.missingRecords.length} missing records.`,
      recommendedActionLabel: 'Open Project Passport',
      priority: passport.riskLevel,
      requiresApproval: false,
      relatedRoute: `/projects/${passport.projectId}/passport`,
    });
  }

  // Inbox-based recommendation: surface the highest-priority inbox item
  const highestInbox = inboxItems[0];
  if (highestInbox) {
    recommendations.push({
      id: `rec-inbox-${highestInbox.sourceEventId}`,
      agentScope: 'user',
      title: `Next action for ${user.displayName}`,
      rationale: `Your highest priority inbox item is: ${highestInbox.title}.`,
      recommendedActionLabel: 'Open inbox item',
      priority: highestInbox.priority,
      requiresApproval: highestInbox.priority === 'critical',
      relatedRoute: highestInbox.route,
    });
  }

  // Role-specific recommendations
  if (user.role === 'supplier') {
    recommendations.push({
      id: `rec-supplier-${passport.projectId}`,
      agentScope: 'user',
      title: 'Keep supplier view focused',
      rationale:
        'Supplier users should see marketplace, procurement messages and finance items without unnecessary professional administration screens.',
      recommendedActionLabel: 'Open supplier project view',
      priority: 'medium',
      requiresApproval: false,
      relatedRoute: `/projects/${passport.projectId}/procurement`,
    });
  }

  // Sort by priority descending
  return recommendations.sort(
    (a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority],
  );
}

// ── Platform Snapshot ───────────────────────────────────────────────────────

/**
 * Build the complete platform spine snapshot for a user + project combination.
 * This is the primary output — the UI shell consumes this snapshot to render
 * navigation, workspace routes, inbox, and recommendations.
 */
export function buildPlatformSpineSnapshot(
  user: UserContext,
  passport: ProjectPassport,
  events: WorkflowEvent[],
): PlatformSpineSnapshot {
  const inboxItems = inboxItemsFromEvents(events, user.role);

  return {
    user,
    navigationZones: navigationZonesForRole(user.role),
    projectPassport: passport,
    workspaceRoutes: workspaceRoutesForContext(user.role, passport.phase),
    inboxItems,
    recommendations: buildAgentRecommendations(user, passport, inboxItems),
  };
}

// ── Convenience: Snapshot for Multiple Projects ─────────────────────────────

/**
 * Build snapshots for all of a user's projects.
 * Useful for dashboards that need cross-project awareness.
 */
export function buildMultiProjectSnapshots(
  user: UserContext,
  passports: ProjectPassport[],
  events: WorkflowEvent[],
): PlatformSpineSnapshot[] {
  return passports.map((passport) =>
    buildPlatformSpineSnapshot(user, passport, events),
  );
}
