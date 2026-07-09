/**
 * Unit tests for RoleAccessService
 *
 * Tests role-based data visibility scoping, access denial for out-of-scope requests,
 * and audit trail logging on access violations.
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
 */
import {
  checkAccess,
  checkAccessWithAudit,
  getRoleDataScope,
  getAllowedResources,
  canAccessResource,
  createAccessViolationEvent,
  canApprove,
  canManageBillingRates,
  canAccessFirmWideViews,
  canManageInvoices,
  filterAccessibleProjects,
  getPermissionsMatrix,
} from '../roleAccessService';
import type {
  PracticeRole,
  PracticeResource,
  AccessCheckContext,
} from '../roleAccessService';

// ─── Test Fixtures ──────────────────────────────────────────────────────

const FIRM_ID = 'firm_001';
const USER_ID = 'user_001';
const OTHER_USER_ID = 'user_002';
const PROJECT_A = 'proj_001';
const PROJECT_B = 'proj_002';
const PROJECT_C = 'proj_003';

function makeContext(overrides: Partial<AccessCheckContext> = {}): AccessCheckContext {
  return {
    userId: USER_ID,
    userRole: 'staff',
    firmId: FIRM_ID,
    resource: 'own_timesheets',
    ...overrides,
  };
}

// ─── Staff/Freelancer Role (Req 14.1) ────────────────────────────────────────

describe('Staff/Freelancer role access (Requirement 14.1)', () => {
  const staffResources: PracticeResource[] = [
    'own_timesheets',
    'own_expenses',
    'own_leave',
    'project_time_summaries',
  ];

  const deniedResources: PracticeResource[] = [
    'project_fee_tracking',
    'project_wip',
    'project_profitability',
    'billing_rates',
    'firm_reporting',
    'invoicing',
    'resource_planning',
    'pipeline',
    'firm_dashboard',
    'income_forecast',
    'write_offs',
    'team_timesheets',
    'team_expense_approvals',
  ];

  it.each(['staff', 'freelancer'] as PracticeRole[])('%s can access own timesheets, expenses, leave, and time summaries', (role) => {
    for (const resource of staffResources) {
      const result = checkAccess(makeContext({ userRole: role, resource }));
      expect(result.allowed).toBe(true);
    }
  });

  it.each(['staff', 'freelancer'] as PracticeRole[])('%s cannot access fee, WIP, profitability, billing rates, or firm views', (role) => {
    for (const resource of deniedResources) {
      const result = checkAccess(makeContext({ userRole: role, resource }));
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain(role);
      expect(result.reason).toContain(resource);
    }
  });

  it('staff cannot access another user\'s timesheets', () => {
    const result = checkAccess(makeContext({
      userRole: 'staff',
      resource: 'own_timesheets',
      targetUserId: OTHER_USER_ID,
    }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain(OTHER_USER_ID);
  });

  it('staff can access their own timesheets (targetUserId matches)', () => {
    const result = checkAccess(makeContext({
      userRole: 'staff',
      resource: 'own_timesheets',
      targetUserId: USER_ID,
    }));
    expect(result.allowed).toBe(true);
  });
});

// ─── Architect/BEP Role (Req 14.2) ──────────────────────────────────────────

describe('Architect/BEP role access (Requirement 14.2)', () => {
  const architectResources: PracticeResource[] = [
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
  ];

  const deniedResources: PracticeResource[] = [
    'billing_rates',
    'firm_reporting',
    'invoicing',
    'resource_planning',
    'pipeline',
    'firm_dashboard',
    'income_forecast',
  ];

  it.each(['architect', 'bep'] as PracticeRole[])('%s can access project-level financial views for their projects', (role) => {
    for (const resource of architectResources) {
      const result = checkAccess(makeContext({
        userRole: role,
        resource,
        projectId: PROJECT_A,
        userProjectIds: [PROJECT_A, PROJECT_B],
      }));
      expect(result.allowed).toBe(true);
    }
  });

  it.each(['architect', 'bep'] as PracticeRole[])('%s cannot access firm-wide admin views', (role) => {
    for (const resource of deniedResources) {
      const result = checkAccess(makeContext({ userRole: role, resource }));
      expect(result.allowed).toBe(false);
    }
  });

  it('architect cannot access project-scoped data for unassigned projects', () => {
    const result = checkAccess(makeContext({
      userRole: 'architect',
      resource: 'project_fee_tracking',
      projectId: PROJECT_C,
      userProjectIds: [PROJECT_A, PROJECT_B],
    }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not assigned');
    expect(result.reason).toContain(PROJECT_C);
  });

  it('bep can access team timesheets for their own projects', () => {
    const result = checkAccess(makeContext({
      userRole: 'bep',
      resource: 'team_timesheets',
      projectId: PROJECT_A,
      userProjectIds: [PROJECT_A],
    }));
    expect(result.allowed).toBe(true);
  });

  it('architect cannot access team timesheets for projects they are not assigned to', () => {
    const result = checkAccess(makeContext({
      userRole: 'architect',
      resource: 'team_timesheets',
      projectId: PROJECT_C,
      userProjectIds: [PROJECT_A],
    }));
    expect(result.allowed).toBe(false);
  });
});

// ─── Firm Admin Role (Req 14.3) ─────────────────────────────────────────────

describe('Firm Admin role access (Requirement 14.3)', () => {
  const allResources: PracticeResource[] = [
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
  ];

  it('firm_admin can access all practice management views', () => {
    for (const resource of allResources) {
      const result = checkAccess(makeContext({
        userRole: 'firm_admin',
        resource,
      }));
      expect(result.allowed).toBe(true);
    }
  });

  it('firm_admin can access other users\' ownership-scoped data', () => {
    const result = checkAccess(makeContext({
      userRole: 'firm_admin',
      resource: 'own_timesheets',
      targetUserId: OTHER_USER_ID,
    }));
    expect(result.allowed).toBe(true);
  });
});

// ─── Client Role (Req 14.4) ─────────────────────────────────────────────────

describe('Client role access (Requirement 14.4)', () => {
  it('client can access read-only project fee summary', () => {
    const result = checkAccess(makeContext({
      userRole: 'client',
      resource: 'project_fee_summary_readonly',
      projectId: PROJECT_A,
      userProjectIds: [PROJECT_A],
    }));
    expect(result.allowed).toBe(true);
  });

  it('client can access invoice history (read-only)', () => {
    const result = checkAccess(makeContext({
      userRole: 'client',
      resource: 'invoice_history_readonly',
      projectId: PROJECT_A,
      userProjectIds: [PROJECT_A],
    }));
    expect(result.allowed).toBe(true);
  });

  it('client cannot access internal cost, margin, or utilisation data', () => {
    const deniedResources: PracticeResource[] = [
      'own_timesheets',
      'own_expenses',
      'project_wip',
      'project_profitability',
      'billing_rates',
      'firm_reporting',
      'resource_planning',
      'pipeline',
      'team_timesheets',
    ];
    for (const resource of deniedResources) {
      const result = checkAccess(makeContext({ userRole: 'client', resource }));
      expect(result.allowed).toBe(false);
    }
  });

  it('client cannot access project data for unassociated projects', () => {
    const result = checkAccess(makeContext({
      userRole: 'client',
      resource: 'project_fee_summary_readonly',
      projectId: PROJECT_C,
      userProjectIds: [PROJECT_A],
    }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not associated');
  });
});

// ─── Access Violation Audit Trail (Req 14.5) ─────────────────────────────────

describe('Access violation audit trail (Requirement 14.5)', () => {
  it('creates an access violation audit event when access is denied', () => {
    const { result, violation } = checkAccessWithAudit(makeContext({
      userRole: 'staff',
      resource: 'billing_rates',
    }));

    expect(result.allowed).toBe(false);
    expect(violation).toBeDefined();
    expect(violation!.action).toBe('access_violation');
    expect(violation!.userId).toBe(USER_ID);
    expect(violation!.firmId).toBe(FIRM_ID);
    expect(violation!.entityType).toBe('practice_resource');
    expect(violation!.entityId).toBe('billing_rates');
    expect(violation!.details).toMatchObject({
      userRole: 'staff',
      resource: 'billing_rates',
      reason: expect.any(String),
    });
  });

  it('does not create a violation event when access is allowed', () => {
    const { result, violation } = checkAccessWithAudit(makeContext({
      userRole: 'staff',
      resource: 'own_timesheets',
    }));

    expect(result.allowed).toBe(true);
    expect(violation).toBeUndefined();
  });

  it('violation event includes project context when available', () => {
    const { violation } = checkAccessWithAudit(makeContext({
      userRole: 'client',
      resource: 'project_profitability',
      projectId: PROJECT_A,
    }));

    expect(violation).toBeDefined();
    expect(violation!.projectId).toBe(PROJECT_A);
  });

  it('createAccessViolationEvent generates a properly formatted audit event', () => {
    const event = createAccessViolationEvent({
      userId: USER_ID,
      userRole: 'freelancer',
      firmId: FIRM_ID,
      resource: 'firm_reporting',
      projectId: PROJECT_A,
      targetUserId: OTHER_USER_ID,
      timestamp: '2025-01-15T10:30:00.000Z',
      reason: 'Access denied: role does not permit this resource',
    });

    expect(event.id).toMatch(/^av_user_001_/);
    expect(event.firmId).toBe(FIRM_ID);
    expect(event.projectId).toBe(PROJECT_A);
    expect(event.userId).toBe(USER_ID);
    expect(event.action).toBe('access_violation');
    expect(event.entityType).toBe('practice_resource');
    expect(event.entityId).toBe('firm_reporting');
    expect(event.timestamp).toBe('2025-01-15T10:30:00.000Z');
    expect(event.details).toMatchObject({
      userRole: 'freelancer',
      resource: 'firm_reporting',
      targetUserId: OTHER_USER_ID,
      reason: 'Access denied: role does not permit this resource',
    });
  });
});

// ─── Helper Functions ────────────────────────────────────────────────────────

describe('getRoleDataScope', () => {
  it('returns correct scope for staff', () => {
    const scope = getRoleDataScope('staff');
    expect(scope.role).toBe('staff');
    expect(scope.allowedResources).toContain('own_timesheets');
    expect(scope.allowedResources).toContain('own_expenses');
    expect(scope.allowedResources).toContain('own_leave');
    expect(scope.allowedResources).toContain('project_time_summaries');
    expect(scope.allowedResources).not.toContain('billing_rates');
    expect(scope.description).toContain('Own timesheets');
  });

  it('returns correct scope for firm_admin', () => {
    const scope = getRoleDataScope('firm_admin');
    expect(scope.role).toBe('firm_admin');
    expect(scope.allowedResources).toContain('billing_rates');
    expect(scope.allowedResources).toContain('firm_reporting');
    expect(scope.allowedResources).toContain('invoicing');
    expect(scope.allowedResources).toContain('pipeline');
    expect(scope.description).toContain('All practice management views');
  });

  it('returns correct scope for client', () => {
    const scope = getRoleDataScope('client');
    expect(scope.role).toBe('client');
    expect(scope.allowedResources).toHaveLength(2);
    expect(scope.allowedResources).toContain('project_fee_summary_readonly');
    expect(scope.allowedResources).toContain('invoice_history_readonly');
    expect(scope.description).toContain('Read-only');
  });
});

describe('canAccessResource', () => {
  it('returns true for allowed resource', () => {
    expect(canAccessResource('staff', 'own_timesheets')).toBe(true);
    expect(canAccessResource('firm_admin', 'billing_rates')).toBe(true);
  });

  it('returns false for denied resource', () => {
    expect(canAccessResource('staff', 'billing_rates')).toBe(false);
    expect(canAccessResource('client', 'project_profitability')).toBe(false);
  });
});

describe('canApprove', () => {
  it('architect, bep, and firm_admin can approve', () => {
    expect(canApprove('architect')).toBe(true);
    expect(canApprove('bep')).toBe(true);
    expect(canApprove('firm_admin')).toBe(true);
  });

  it('staff, freelancer, and client cannot approve', () => {
    expect(canApprove('staff')).toBe(false);
    expect(canApprove('freelancer')).toBe(false);
    expect(canApprove('client')).toBe(false);
  });
});

describe('canManageBillingRates', () => {
  it('only firm_admin can manage billing rates', () => {
    expect(canManageBillingRates('firm_admin')).toBe(true);
    expect(canManageBillingRates('architect')).toBe(false);
    expect(canManageBillingRates('staff')).toBe(false);
    expect(canManageBillingRates('client')).toBe(false);
  });
});

describe('canAccessFirmWideViews', () => {
  it('only firm_admin can access firm-wide views', () => {
    expect(canAccessFirmWideViews('firm_admin')).toBe(true);
    expect(canAccessFirmWideViews('architect')).toBe(false);
    expect(canAccessFirmWideViews('bep')).toBe(false);
    expect(canAccessFirmWideViews('staff')).toBe(false);
  });
});

describe('canManageInvoices', () => {
  it('only firm_admin can manage invoices', () => {
    expect(canManageInvoices('firm_admin')).toBe(true);
    expect(canManageInvoices('architect')).toBe(false);
    expect(canManageInvoices('bep')).toBe(false);
    expect(canManageInvoices('client')).toBe(false);
  });
});

describe('filterAccessibleProjects', () => {
  const allProjects = [PROJECT_A, PROJECT_B, PROJECT_C];
  const userProjects = [PROJECT_A, PROJECT_B];

  it('firm_admin can access all projects', () => {
    const result = filterAccessibleProjects('firm_admin', allProjects, userProjects);
    expect(result).toEqual(allProjects);
  });

  it('architect can only access assigned projects', () => {
    const result = filterAccessibleProjects('architect', allProjects, userProjects);
    expect(result).toEqual([PROJECT_A, PROJECT_B]);
    expect(result).not.toContain(PROJECT_C);
  });

  it('staff can only access assigned projects', () => {
    const result = filterAccessibleProjects('staff', allProjects, userProjects);
    expect(result).toEqual([PROJECT_A, PROJECT_B]);
  });

  it('client can only access associated projects', () => {
    const result = filterAccessibleProjects('client', allProjects, [PROJECT_A]);
    expect(result).toEqual([PROJECT_A]);
  });
});

describe('getPermissionsMatrix', () => {
  it('returns permissions for all roles', () => {
    const matrix = getPermissionsMatrix();
    expect(Object.keys(matrix)).toHaveLength(6);
    expect(matrix.staff).toBeDefined();
    expect(matrix.freelancer).toBeDefined();
    expect(matrix.architect).toBeDefined();
    expect(matrix.bep).toBeDefined();
    expect(matrix.firm_admin).toBeDefined();
    expect(matrix.client).toBeDefined();
  });

  it('firm_admin has the most permissions', () => {
    const matrix = getPermissionsMatrix();
    const adminCount = matrix.firm_admin.length;
    expect(adminCount).toBeGreaterThan(matrix.staff.length);
    expect(adminCount).toBeGreaterThan(matrix.architect.length);
    expect(adminCount).toBeGreaterThan(matrix.client.length);
  });
});

describe('getAllowedResources', () => {
  it('returns empty array for unknown role', () => {
    const result = getAllowedResources('unknown_role' as PracticeRole);
    expect(result).toEqual([]);
  });

  it('returns correct resources for each role', () => {
    expect(getAllowedResources('staff')).toHaveLength(4);
    expect(getAllowedResources('client')).toHaveLength(2);
    expect(getAllowedResources('firm_admin').length).toBeGreaterThan(10);
  });
});
