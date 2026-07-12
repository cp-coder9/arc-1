/**
 * P1 RBAC Access Control Service
 *
 * Defines permission matrices for all four P1 modules:
 * INSURANCE_REGISTER, DISPUTE_RESOLUTION, NHBRC, SURVEY_GEOMATICS.
 * Implements checkAccess, getPermittedActions, isAdminRole with union-of-roles logic.
 *
 * Design principles:
 * - admin and platform_admin always get full access regardless of project assignment
 * - Other roles require isProjectMember === true plus having the action in their permission matrix
 * - Default-deny: any role not in the matrix gets no access
 * - Denials record deniedAt timestamp for audit purposes
 */

import type { UserRole } from '@/types';

// ─── Types & Interfaces ───────────────────────────────────────────────────────

export type P1Module = 'insurance_register' | 'dispute_resolution' | 'nhbrc' | 'survey_geomatics';
export type P1Action = 'read' | 'write' | 'create' | 'manage' | 'admin';

export interface P1AccessContext {
  userId: string;
  role: UserRole;
  projectId: string;
  isProjectMember: boolean;
  projectRoleAssignment?: string;
}

export interface AccessCheckResult {
  granted: boolean;
  reason?: string;
  deniedAt?: string;
}

export interface P1AccessControlService {
  checkAccess(ctx: P1AccessContext, module: P1Module, action: P1Action): AccessCheckResult;
  getPermittedActions(ctx: P1AccessContext, module: P1Module): P1Action[];
  isAdminRole(role: UserRole): boolean;
}

// ─── Permission Matrix Constants ──────────────────────────────────────────────

const ALL_ACTIONS: P1Action[] = ['read', 'write', 'create', 'manage', 'admin'];

/**
 * Insurance Register permissions.
 * architect/bep/cpm/quantity_surveyor: read, write, create, manage
 * contractor: read, create
 * admin/platform_admin: all
 */
export const INSURANCE_REGISTER_PERMISSIONS: Partial<Record<UserRole, P1Action[]>> = {
  architect: ['read', 'write', 'create', 'manage'],
  bep: ['read', 'write', 'create', 'manage'],
  cpm: ['read', 'write', 'create', 'manage'],
  quantity_surveyor: ['read', 'write', 'create', 'manage'],
  contractor: ['read', 'create'],
  platform_admin: ALL_ACTIONS,
  admin: ALL_ACTIONS,
};

/**
 * Dispute Resolution permissions.
 * architect/bep/cpm/quantity_surveyor: read, write, create, manage
 * contractor: read, write, create
 * admin/platform_admin: all
 */
export const DISPUTE_RESOLUTION_PERMISSIONS: Partial<Record<UserRole, P1Action[]>> = {
  architect: ['read', 'write', 'create', 'manage'],
  bep: ['read', 'write', 'create', 'manage'],
  cpm: ['read', 'write', 'create', 'manage'],
  quantity_surveyor: ['read', 'write', 'create', 'manage'],
  contractor: ['read', 'write', 'create'],
  platform_admin: ALL_ACTIONS,
  admin: ALL_ACTIONS,
};

/**
 * NHBRC permissions.
 * contractor/developer: read, write, create, manage
 * site_manager: read, write
 * client: read
 * architect/engineer: read, write
 * admin/platform_admin: all
 */
export const NHBRC_PERMISSIONS: Partial<Record<UserRole, P1Action[]>> = {
  contractor: ['read', 'write', 'create', 'manage'],
  developer: ['read', 'write', 'create', 'manage'],
  site_manager: ['read', 'write'],
  client: ['read'],
  architect: ['read', 'write'],
  engineer: ['read', 'write'],
  platform_admin: ALL_ACTIONS,
  admin: ALL_ACTIONS,
};

/**
 * Survey & Geomatics permissions.
 * land_surveyor: read, write, create, manage
 * architect/bep/cpm/developer: read, write, create
 * admin/platform_admin: all
 */
export const SURVEY_GEOMATICS_PERMISSIONS: Partial<Record<UserRole, P1Action[]>> = {
  land_surveyor: ['read', 'write', 'create', 'manage'],
  architect: ['read', 'write', 'create'],
  bep: ['read', 'write', 'create'],
  cpm: ['read', 'write', 'create'],
  developer: ['read', 'write', 'create'],
  platform_admin: ALL_ACTIONS,
  admin: ALL_ACTIONS,
};

/**
 * Module-to-permission-matrix lookup.
 */
export const MODULE_PERMISSIONS: Record<P1Module, Partial<Record<UserRole, P1Action[]>>> = {
  insurance_register: INSURANCE_REGISTER_PERMISSIONS,
  dispute_resolution: DISPUTE_RESOLUTION_PERMISSIONS,
  nhbrc: NHBRC_PERMISSIONS,
  survey_geomatics: SURVEY_GEOMATICS_PERMISSIONS,
};

// ─── Admin Roles ──────────────────────────────────────────────────────────────

const ADMIN_ROLES: ReadonlySet<UserRole> = new Set(['admin', 'platform_admin']);

// ─── Service Implementation ───────────────────────────────────────────────────

function checkAccess(ctx: P1AccessContext, module: P1Module, action: P1Action): AccessCheckResult {
  // Admin and platform_admin always get full access regardless of project membership
  if (ADMIN_ROLES.has(ctx.role)) {
    return { granted: true, reason: 'Admin role grants full access' };
  }

  // Non-admin roles require project membership
  if (!ctx.isProjectMember) {
    return {
      granted: false,
      reason: 'User is not a member of the project',
      deniedAt: new Date().toISOString(),
    };
  }

  // Look up permissions for this role in the module's matrix
  const modulePermissions = MODULE_PERMISSIONS[module];
  const roleActions = modulePermissions[ctx.role];

  // Default-deny: role not in matrix
  if (!roleActions || roleActions.length === 0) {
    return {
      granted: false,
      reason: `Role "${ctx.role}" has no permissions for module "${module}"`,
      deniedAt: new Date().toISOString(),
    };
  }

  // Check if the requested action is in the role's permitted actions
  if (roleActions.includes(action)) {
    return { granted: true, reason: `Role "${ctx.role}" is permitted action "${action}" on module "${module}"` };
  }

  return {
    granted: false,
    reason: `Role "${ctx.role}" does not have "${action}" permission for module "${module}"`,
    deniedAt: new Date().toISOString(),
  };
}

function getPermittedActions(ctx: P1AccessContext, module: P1Module): P1Action[] {
  // Admin and platform_admin always get all actions
  if (ADMIN_ROLES.has(ctx.role)) {
    return [...ALL_ACTIONS];
  }

  // Non-admin roles require project membership
  if (!ctx.isProjectMember) {
    return [];
  }

  // Look up permissions for this role in the module's matrix
  const modulePermissions = MODULE_PERMISSIONS[module];
  const roleActions = modulePermissions[ctx.role];

  // Default-deny: role not in matrix
  if (!roleActions) {
    return [];
  }

  return [...roleActions];
}

function isAdminRole(role: UserRole): boolean {
  return ADMIN_ROLES.has(role);
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates and returns the P1 Access Control service instance.
 */
export function createP1AccessControlService(): P1AccessControlService {
  return {
    checkAccess,
    getPermittedActions,
    isAdminRole,
  };
}
