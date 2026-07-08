/**
 * Role-Based Access Service
 *
 * Pure business logic for role-based access control within the Practice Management module.
 * Determines data visibility scoping per user role and logs access violations to audit trail.
 *
 * Role scoping:
 * - Staff/Freelancer: own timesheets, own expenses, own leave, project time summaries only
 * - Architect/BEP: project-level fee tracking, WIP, profitability for own projects, team timesheets/expense approvals
 * - Firm_admin: all views including billing rates, firm-wide reporting, invoicing, resource planning, pipeline
 * - Client: read-only project fee summary and invoice history only
 *
 * This service operates on typed data objects (dependency injection pattern)
 * with no Firestore dependencies.
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
 * @module practiceManagement/roleAccessService
 */

import type { PracticeAuditEvent } from './types';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Roles relevant to practice management access control. */
export type PracticeRole =
  | 'staff'
  | 'freelancer'
  | 'architect'
  | 'bep'
  | 'firm_admin'
  | 'client';

/** Resources within the practice management module that can be accessed. */
export type PracticeResource =
  | 'own_timesheets'
  | 'own_expenses'
  | 'own_leave'
  | 'project_time_summaries'
  | 'team_timesheets'
  | 'team_expense_approvals'
  | 'project_fee_tracking'
  | 'project_wip'
  | 'project_profitability'
  | 'billing_rates'
  | 'firm_reporting'
  | 'invoicing'
  | 'resource_planning'
  | 'pipeline'
  | 'project_fee_summary_readonly'
  | 'invoice_history_readonly'
  | 'write_offs'
  | 'income_forecast'
  | 'leave_management'
  | 'firm_dashboard';

/** Context for an access check — who is requesting what. */
export interface AccessCheckContext {
  userId: string;
  userRole: PracticeRole;
  firmId: string;
  /** The resource being accessed */
  resource: PracticeResource;
  /** The target entity's owner userId (for ownership checks) */
  targetUserId?: string;
  /** The project ID being accessed (for project-scoping checks) */
  projectId?: string;
  /** Project IDs that the user is assigned to (for architect/bep scoping) */
  userProjectIds?: string[];
}

/** Result of an access check. */
export interface AccessCheckResult {
  allowed: boolean;
  reason?: string;
}

/** Access violation event for audit trail logging. */
export interface AccessViolation {
  userId: string;
  userRole: PracticeRole;
  firmId: string;
  resource: PracticeResource;
  projectId?: string;
  targetUserId?: string;
  timestamp: string;
  reason: string;
}

/** Describes the full scope of visible data for a given role. */
export interface RoleDataScope {
  role: PracticeRole;
  allowedResources: PracticeResource[];
  description: string;
}

// ─── Role Permission Matrix ──────────────────────────────────────────────────

/**
 * Permission matrix defining which resources each role can access.
 * Validates: Requirements 14.1, 14.2, 14.3, 14.4
 */
const ROLE_PERMISSIONS: Record<PracticeRole, PracticeResource[]> = {
  staff: [
    'own_timesheets',
    'own_expenses',
    'own_leave',
    'project_time_summaries',
  ],
  freelancer: [
    'own_timesheets',
    'own_expenses',
    'own_leave',
    'project_time_summaries',
  ],
  architect: [
    'own_timesheets',
    'own_expenses',
    'own_leave',
    'project_time_summaries',
    'team_timesheets',
    'team_expense_approvals',
    'project_fee_tracking',
    'project_wip',
    'project_profitability',
    'write_offs',
  ],
  bep: [
    'own_timesheets',
    'own_expenses',
    'own_leave',
    'project_time_summaries',
    'team_timesheets',
    'team_expense_approvals',
    'project_fee_tracking',
    'project_wip',
    'project_profitability',
    'write_offs',
  ],
  firm_admin: [
    'own_timesheets',
    'own_expenses',
    'own_leave',
    'project_time_summaries',
    'team_timesheets',
    'team_expense_approvals',
    'project_fee_tracking',
    'project_wip',
    'project_profitability',
    'billing_rates',
    'firm_reporting',
    'invoicing',
    'resource_planning',
    'pipeline',
    'write_offs',
    'income_forecast',
    'leave_management',
    'firm_dashboard',
    'project_fee_summary_readonly',
    'invoice_history_readonly',
  ],
  client: [
    'project_fee_summary_readonly',
    'invoice_history_readonly',
  ],
};

/** Resources that require ownership verification (user can only access their own data). */
const OWNERSHIP_RESOURCES: PracticeResource[] = [
  'own_timesheets',
  'own_expenses',
  'own_leave',
];

/** Resources that require project-scoping (architect/bep can only access their own projects). */
const PROJECT_SCOPED_RESOURCES: PracticeResource[] = [
  'project_fee_tracking',
  'project_wip',
  'project_profitability',
  'team_timesheets',
  'team_expense_approvals',
  'write_offs',
  'project_fee_summary_readonly',
  'invoice_history_readonly',
  'project_time_summaries',
];

// ─── Access Check Functions ──────────────────────────────────────────────────

/**
 * Check if a user has access to a specific resource.
 * Returns an AccessCheckResult indicating whether access is allowed and why not if denied.
 *
 * Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5
 */
export function checkAccess(context: AccessCheckContext): AccessCheckResult {
  const { userRole, resource, userId, targetUserId, projectId, userProjectIds } = context;

  // Step 1: Check if the role has base permission for the resource
  const allowedResources = ROLE_PERMISSIONS[userRole];
  if (!allowedResources) {
    return {
      allowed: false,
      reason: `Unknown role: ${userRole}`,
    };
  }

  if (!allowedResources.includes(resource)) {
    return {
      allowed: false,
      reason: `Role '${userRole}' does not have access to resource '${resource}'`,
    };
  }

  // Step 2: For ownership-scoped resources, verify the user is accessing their own data
  if (OWNERSHIP_RESOURCES.includes(resource)) {
    if (targetUserId && targetUserId !== userId) {
      // firm_admin can access all ownership resources regardless
      if (userRole === 'firm_admin') {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: `User '${userId}' cannot access ${resource} belonging to user '${targetUserId}'`,
      };
    }
  }

  // Step 3: For project-scoped resources, verify architect/bep project assignment
  if (PROJECT_SCOPED_RESOURCES.includes(resource) && projectId) {
    if ((userRole === 'architect' || userRole === 'bep') && userProjectIds) {
      if (!userProjectIds.includes(projectId)) {
        return {
          allowed: false,
          reason: `User '${userId}' with role '${userRole}' is not assigned to project '${projectId}'`,
        };
      }
    }
    // client can only access projects they are associated with
    if (userRole === 'client' && userProjectIds) {
      if (!userProjectIds.includes(projectId)) {
        return {
          allowed: false,
          reason: `Client '${userId}' is not associated with project '${projectId}'`,
        };
      }
    }
  }

  return { allowed: true };
}

/**
 * Get the full data scope description for a given role.
 * Returns the list of resources the role can access.
 *
 * Validates: Requirements 14.1, 14.2, 14.3, 14.4
 */
export function getRoleDataScope(role: PracticeRole): RoleDataScope {
  const descriptions: Record<PracticeRole, string> = {
    staff: 'Own timesheets, own expense claims, own leave requests, and project-level time summaries only',
    freelancer: 'Own timesheets, own expense claims, own leave requests, and project-level time summaries only',
    architect: 'Project-level fee tracking, WIP, profitability for own projects, team timesheets and expense approvals',
    bep: 'Project-level fee tracking, WIP, profitability for own projects, team timesheets and expense approvals',
    firm_admin: 'All practice management views including billing rates, firm-wide reporting, invoicing, resource planning, and CRM pipeline',
    client: 'Read-only project fee summary and invoice history only',
  };

  return {
    role,
    allowedResources: ROLE_PERMISSIONS[role] || [],
    description: descriptions[role] || 'No access',
  };
}

/**
 * Get all allowed resources for a role.
 * Used for building UI visibility rules.
 */
export function getAllowedResources(role: PracticeRole): PracticeResource[] {
  return ROLE_PERMISSIONS[role] || [];
}

/**
 * Check if a role can access a specific resource (simple boolean check without context).
 * Useful for UI conditional rendering.
 */
export function canAccessResource(role: PracticeRole, resource: PracticeResource): boolean {
  const allowed = ROLE_PERMISSIONS[role];
  return allowed ? allowed.includes(resource) : false;
}

/**
 * Create an access violation audit event for logging.
 * This generates the PracticeAuditEvent structure that the audit adapter will persist.
 *
 * Validates: Requirement 14.5
 */
export function createAccessViolationEvent(
  violation: AccessViolation,
): PracticeAuditEvent {
  return {
    id: `av_${violation.userId}_${Date.now()}`,
    firmId: violation.firmId,
    projectId: violation.projectId,
    userId: violation.userId,
    action: 'access_violation',
    entityType: 'practice_resource',
    entityId: violation.resource,
    details: {
      userRole: violation.userRole,
      resource: violation.resource,
      targetUserId: violation.targetUserId,
      reason: violation.reason,
    },
    timestamp: violation.timestamp,
  };
}

/**
 * Perform an access check and create a violation event if denied.
 * Returns the check result and optionally the violation event for audit logging.
 *
 * Validates: Requirements 14.5
 */
export function checkAccessWithAudit(
  context: AccessCheckContext,
): { result: AccessCheckResult; violation?: PracticeAuditEvent } {
  const result = checkAccess(context);

  if (!result.allowed) {
    const violation = createAccessViolationEvent({
      userId: context.userId,
      userRole: context.userRole,
      firmId: context.firmId,
      resource: context.resource,
      projectId: context.projectId,
      targetUserId: context.targetUserId,
      timestamp: new Date().toISOString(),
      reason: result.reason || 'Access denied',
    });

    return { result, violation };
  }

  return { result };
}

/**
 * Get the permissions matrix for all roles.
 * Useful for documentation and admin configuration views.
 */
export function getPermissionsMatrix(): Record<PracticeRole, PracticeResource[]> {
  return { ...ROLE_PERMISSIONS };
}

/**
 * Validate whether a user can perform an approval action (timesheet/expense).
 * Only architect, bep, and firm_admin can approve.
 */
export function canApprove(role: PracticeRole): boolean {
  return role === 'architect' || role === 'bep' || role === 'firm_admin';
}

/**
 * Validate whether a user can manage billing rates.
 * Only firm_admin can create/update billing rates.
 */
export function canManageBillingRates(role: PracticeRole): boolean {
  return role === 'firm_admin';
}

/**
 * Validate whether a user can access firm-wide views (dashboard, reporting, pipeline).
 * Only firm_admin has access to firm-wide data.
 */
export function canAccessFirmWideViews(role: PracticeRole): boolean {
  return role === 'firm_admin';
}

/**
 * Validate whether a user can create/manage invoices.
 * Only firm_admin can create and manage practice invoices.
 */
export function canManageInvoices(role: PracticeRole): boolean {
  return role === 'firm_admin';
}

/**
 * Filter a list of project IDs to only those the user can access.
 * - firm_admin: all projects
 * - architect/bep: only assigned projects
 * - staff/freelancer: only assigned projects (for time summaries)
 * - client: only associated projects
 */
export function filterAccessibleProjects(
  role: PracticeRole,
  allProjectIds: string[],
  userProjectIds: string[],
): string[] {
  if (role === 'firm_admin') {
    return allProjectIds;
  }
  return allProjectIds.filter((id) => userProjectIds.includes(id));
}
