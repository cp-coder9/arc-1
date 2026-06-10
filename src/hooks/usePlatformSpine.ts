/**
 * Architex Platform Spine — React Hook
 *
 * Provides React components with role-aware navigation, workspace routes,
 * inbox items, and agent recommendations.  Components call this hook
 * instead of importing the raw services directly.
 *
 * Usage:
 *   const { navigationZones, workspaceRoutes, inboxItems, recommendations } = usePlatformSpine({
 *     userId, displayName, role, projectIds, passport, events
 *   });
 */

import { useMemo } from 'react';
import type { UserRole } from '@/types';
import type {
  PlatformSpineSnapshot,
  ProjectPassport,
  WorkflowEvent,
} from '@/types/platformSpine';
import { buildSnapshotForUserRole } from '@/services/platformSpineBridge';

export interface UsePlatformSpineParams {
  userId: string;
  displayName: string;
  role: UserRole;
  projectIds: string[];
  passport: ProjectPassport | null;
  events: WorkflowEvent[];
}

export interface UsePlatformSpineResult {
  /** The full platform spine snapshot. */
  snapshot: PlatformSpineSnapshot | null;
  /** Navigation zones visible to the current user. */
  navigationZones: PlatformSpineSnapshot['navigationZones'];
  /** Workspace routes available for the current user + phase. */
  workspaceRoutes: PlatformSpineSnapshot['workspaceRoutes'];
  /** Actionable inbox items derived from workflow events. */
  inboxItems: PlatformSpineSnapshot['inboxItems'];
  /** Computed agent recommendations. */
  recommendations: PlatformSpineSnapshot['recommendations'];
  /** Whether the spine could be built (passport was provided). */
  isReady: boolean;
}

/**
 * Hook that builds a platform spine snapshot from user + project context.
 * Memoized — only recomputes when inputs change.
 */
export function usePlatformSpine(params: UsePlatformSpineParams): UsePlatformSpineResult {
  const { userId, displayName, role, projectIds, passport, events } = params;

  const snapshot = useMemo<PlatformSpineSnapshot | null>(() => {
    if (!passport) return null;
    return buildSnapshotForUserRole({
      userId,
      displayName,
      role,
      projectIds,
      passport,
      events,
    });
  }, [userId, displayName, role, projectIds, passport, events]);

  return {
    snapshot,
    navigationZones: snapshot?.navigationZones ?? [],
    workspaceRoutes: snapshot?.workspaceRoutes ?? [],
    inboxItems: snapshot?.inboxItems ?? [],
    recommendations: snapshot?.recommendations ?? [],
    isReady: snapshot !== null,
  };
}

export default usePlatformSpine;
