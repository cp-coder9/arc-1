/**
 * Architex Platform Spine — Integration Bridge
 *
 * Bridges the platform spine types and services with the existing codebase
 * type system (UserRole from @/types).  Provides role mapping, adapter
 * functions, and navigation helpers.
 *
 * The spine's ArchitexRole and the existing UserRole overlap but are not
 * identical.  This bridge handles safe mapping in both directions, using
 * the closest semantic match when an exact equivalent doesn't exist.
 */

import type { UserRole } from '@/types';
import type {
  ArchitexRole,
  PlatformSpineSnapshot,
  ProjectPassport,
  UserContext,
  WorkflowEvent,
} from '@/types/platformSpine';
import { buildPlatformSpineSnapshot } from './platformSpineService';

// ── Role Mapping ────────────────────────────────────────────────────────────

/**
 * Map an existing UserRole to the spine's ArchitexRole.
 * Falls back to 'contractor' for any role not explicitly mapped.
 */
export function userRoleToArchitexRole(role: UserRole): ArchitexRole {
  const mapping: Record<UserRole, ArchitexRole> = {
    client: 'client_developer',
    architect: 'architect',
    admin: 'admin',
    freelancer: 'candidate_professional',
    bep: 'architect',
    contractor: 'contractor',
    subcontractor: 'contractor',
    supplier: 'supplier',
    engineer: 'contractor',
    quantity_surveyor: 'contractor',
    town_planner: 'contractor',
    energy_professional: 'contractor',
    fire_engineer: 'contractor',
    site_manager: 'contractor',
    developer: 'client_developer',
    firm_admin: 'admin',
    platform_admin: 'admin',
    land_surveyor: 'candidate_professional',
    health_safety: 'contractor',
  };

  return mapping[role];
}

/**
 * Reverse-map a spine ArchitexRole to the closest existing UserRole.
 * Roles not directly representable in UserRole are mapped to their
 * nearest professional equivalent (e.g. engineer → bep).
 */
export function architexRoleToUserRole(role: ArchitexRole): UserRole {
  const mapping: Record<ArchitexRole, UserRole> = {
    client_developer: 'client',
    architect: 'architect',
    engineer: 'bep',
    quantity_surveyor: 'bep',
    contractor: 'contractor',
    supplier: 'supplier',
    candidate_professional: 'freelancer',
    admin: 'admin',
  };

  return mapping[role];
}

// ── Context Adapters ────────────────────────────────────────────────────────

/**
 * Build a spine UserContext from existing codebase user data.
 */
export function buildUserContext(params: {
  userId: string;
  displayName: string;
  role: UserRole;
  projectIds: string[];
}): UserContext {
  return {
    userId: params.userId,
    displayName: params.displayName,
    role: userRoleToArchitexRole(params.role),
    projectIds: params.projectIds,
  };
}

// ── Snapshot Builder (with role mapping) ────────────────────────────────────

/**
 * Build a platform spine snapshot using the existing UserRole type.
 * This is the primary entry point for existing components to consume
 * the spine without dealing with ArchitexRole directly.
 */
export function buildSnapshotForUserRole(params: {
  userId: string;
  displayName: string;
  role: UserRole;
  projectIds: string[];
  passport: ProjectPassport;
  events: WorkflowEvent[];
}): PlatformSpineSnapshot {
  const user = buildUserContext(params);
  return buildPlatformSpineSnapshot(user, params.passport, params.events);
}

// ── Navigation Helpers ──────────────────────────────────────────────────────

/**
 * Returns true if a given UserRole can see a navigation zone.
 */
export function canUserRoleSeeZone(role: UserRole, zoneRoles: ArchitexRole[]): boolean {
  const spineRole = userRoleToArchitexRole(role);
  return zoneRoles.includes(spineRole);
}

/**
 * Returns true if a given UserRole can access a workspace route in a phase.
 */
export function canUserRoleAccessWorkspace(
  role: UserRole,
  routeRoles: ArchitexRole[],
): boolean {
  const spineRole = userRoleToArchitexRole(role);
  return routeRoles.includes(spineRole);
}
