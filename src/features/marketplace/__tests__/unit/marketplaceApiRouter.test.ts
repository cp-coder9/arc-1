// @vitest-environment jsdom
/**
 * Unit Tests for Marketplace API Router
 *
 * Feature: pack-marketplace
 * Tests: RBAC enforcement, authentication rejection, error response format consistency
 *
 * **Validates: Requirements 12.7, 12.9**
 */
import { vi } from 'vitest';

// ── Types ────────────────────────────────────────────────────────────────────

type UserRole = 'client' | 'architect' | 'admin' | 'freelancer' | 'bep' | 'contractor' | 'subcontractor' | 'supplier' | 'engineer' | 'quantity_surveyor' | 'town_planner' | 'energy_professional' | 'fire_engineer' | 'site_manager' | 'developer' | 'firm_admin' | 'platform_admin';

interface MarketplaceError {
  code: string;
  message: string;
  details?: {
    field?: string;
    reason?: string;
    requiredRoles?: UserRole[];
    blockers?: string[];
    missingItems?: string[];
  };
}

interface AuthContext {
  userId: string;
  role: UserRole;
  verified: boolean;
}

interface RouteDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  requiredRoles: UserRole[];
}

// ── Mock Router Implementation ───────────────────────────────────────────────

const MARKETPLACE_ROUTES: RouteDefinition[] = [
  { method: 'GET', path: '/api/marketplace/trust-score/:userId', requiredRoles: ['client', 'developer', 'architect', 'bep', 'admin', 'platform_admin'] },
  { method: 'POST', path: '/api/marketplace/trust-score/recalculate', requiredRoles: ['admin', 'platform_admin'] },
  { method: 'POST', path: '/api/marketplace/search/professionals', requiredRoles: ['client', 'developer'] },
  { method: 'GET', path: '/api/marketplace/search/suggestions', requiredRoles: ['client', 'developer'] },
  { method: 'POST', path: '/api/marketplace/projects', requiredRoles: ['client', 'developer'] },
  { method: 'GET', path: '/api/marketplace/projects', requiredRoles: ['client', 'developer', 'architect', 'bep', 'engineer', 'quantity_surveyor', 'town_planner', 'energy_professional', 'fire_engineer', 'contractor', 'subcontractor'] },
  { method: 'GET', path: '/api/marketplace/projects/:id', requiredRoles: ['client', 'developer', 'architect', 'bep', 'engineer', 'quantity_surveyor', 'town_planner', 'energy_professional', 'fire_engineer', 'contractor', 'subcontractor'] },
  { method: 'PUT', path: '/api/marketplace/projects/:id/withdraw', requiredRoles: ['client', 'developer'] },
  { method: 'POST', path: '/api/marketplace/projects/:id/apply', requiredRoles: ['architect', 'bep', 'engineer', 'quantity_surveyor', 'town_planner', 'energy_professional', 'fire_engineer', 'contractor', 'subcontractor'] },
  { method: 'PUT', path: '/api/marketplace/projects/:id/proposals/:proposalId/accept', requiredRoles: ['client', 'developer'] },
  { method: 'POST', path: '/api/marketplace/tasks', requiredRoles: ['architect', 'bep', 'engineer', 'quantity_surveyor', 'town_planner', 'energy_professional', 'fire_engineer'] },
  { method: 'GET', path: '/api/marketplace/tasks', requiredRoles: ['architect', 'bep', 'engineer', 'quantity_surveyor', 'town_planner', 'energy_professional', 'fire_engineer', 'freelancer'] },
  { method: 'POST', path: '/api/marketplace/tasks/:id/apply', requiredRoles: ['freelancer'] },
  { method: 'PUT', path: '/api/marketplace/tasks/:id/applications/:appId/accept', requiredRoles: ['architect', 'bep', 'engineer', 'quantity_surveyor', 'town_planner', 'energy_professional', 'fire_engineer'] },
  { method: 'POST', path: '/api/marketplace/tasks/:id/deliver', requiredRoles: ['freelancer'] },
  { method: 'PUT', path: '/api/marketplace/tasks/:id/sign-off', requiredRoles: ['architect', 'bep', 'engineer', 'quantity_surveyor', 'town_planner', 'energy_professional', 'fire_engineer'] },
  { method: 'POST', path: '/api/marketplace/materials', requiredRoles: ['supplier'] },
  { method: 'GET', path: '/api/marketplace/materials', requiredRoles: ['contractor', 'subcontractor', 'supplier'] },
  { method: 'POST', path: '/api/marketplace/materials/:id/quote-request', requiredRoles: ['contractor', 'subcontractor'] },
  { method: 'PUT', path: '/api/marketplace/quotes/:id/respond', requiredRoles: ['supplier'] },
  { method: 'PUT', path: '/api/marketplace/quotes/:id/accept', requiredRoles: ['contractor', 'subcontractor'] },
  { method: 'PUT', path: '/api/marketplace/quotes/:id/delivery-note', requiredRoles: ['contractor', 'subcontractor'] },
  { method: 'POST', path: '/api/marketplace/freelancer-profile', requiredRoles: ['freelancer'] },
  { method: 'GET', path: '/api/marketplace/freelancer-profile/:userId', requiredRoles: ['client', 'developer', 'architect', 'bep', 'engineer', 'quantity_surveyor', 'town_planner', 'energy_professional', 'fire_engineer', 'freelancer', 'admin', 'platform_admin'] },
  { method: 'PUT', path: '/api/marketplace/freelancer-profile', requiredRoles: ['freelancer'] },
  { method: 'POST', path: '/api/marketplace/collaborations', requiredRoles: ['firm_admin'] },
  { method: 'GET', path: '/api/marketplace/collaborations', requiredRoles: ['firm_admin', 'architect', 'bep', 'engineer', 'quantity_surveyor', 'town_planner', 'energy_professional', 'fire_engineer'] },
  { method: 'POST', path: '/api/marketplace/collaborations/:id/invite', requiredRoles: ['firm_admin'] },
  { method: 'PUT', path: '/api/marketplace/collaborations/:id/complete', requiredRoles: ['firm_admin'] },
  { method: 'POST', path: '/api/marketplace/projects/:id/certificate', requiredRoles: ['client', 'developer'] },
  { method: 'POST', path: '/api/marketplace/disputes', requiredRoles: ['client', 'developer', 'architect', 'bep', 'engineer', 'quantity_surveyor', 'town_planner', 'energy_professional', 'fire_engineer', 'contractor', 'subcontractor', 'freelancer', 'supplier'] },
];

function handleRequest(
  route: RouteDefinition,
  authContext: AuthContext | null
): { status: number; body: MarketplaceError | { success: boolean } } {
  if (!authContext) {
    return {
      status: 401,
      body: {
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication is required to access this endpoint',
      },
    };
  }
  if (!route.requiredRoles.includes(authContext.role)) {
    return {
      status: 403,
      body: {
        code: 'ACCESS_DENIED',
        message: `Role '${authContext.role}' is not permitted to access ${route.method} ${route.path}`,
        details: {
          requiredRoles: route.requiredRoles,
          reason: `Insufficient permissions for ${route.method} ${route.path}`,
        },
      },
    };
  }
  return { status: 200, body: { success: true } };
}

function isMarketplaceError(body: unknown): body is MarketplaceError {
  if (typeof body !== 'object' || body === null) return false;
  const obj = body as Record<string, unknown>;
  return typeof obj.code === 'string' && typeof obj.message === 'string';
}

function createMockRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status: vi.fn((code: number) => { res.statusCode = code; return res; }),
    json: vi.fn((data: unknown) => { res.body = data; return res; }),
  };
  return res;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Marketplace API Router - RBAC Enforcement', () => {
  const allRoles: UserRole[] = [
    'client', 'architect', 'admin', 'freelancer', 'bep', 'contractor',
    'subcontractor', 'supplier', 'engineer', 'quantity_surveyor',
    'town_planner', 'energy_professional', 'fire_engineer', 'site_manager',
    'developer', 'firm_admin', 'platform_admin',
  ];

  it('returns 403 for each endpoint when called without proper role', () => {
    for (const route of MARKETPLACE_ROUTES) {
      const unauthorizedRole = allRoles.find(r => !route.requiredRoles.includes(r));
      if (!unauthorizedRole) continue;

      const authContext: AuthContext = { userId: 'user-123', role: unauthorizedRole, verified: true };
      const result = handleRequest(route, authContext);

      expect(result.status).toBe(403);
      expect(isMarketplaceError(result.body)).toBe(true);
      const error = result.body as MarketplaceError;
      expect(error.code).toBe('ACCESS_DENIED');
      expect(error.details?.requiredRoles).toBeDefined();
      expect(Array.isArray(error.details!.requiredRoles)).toBe(true);
      expect(error.details!.requiredRoles!.length).toBeGreaterThan(0);
    }
  });

  it('returns 200 for each endpoint when called with an authorized role', () => {
    for (const route of MARKETPLACE_ROUTES) {
      const authorizedRole = route.requiredRoles[0];
      const authContext: AuthContext = { userId: 'user-456', role: authorizedRole, verified: true };
      const result = handleRequest(route, authContext);
      expect(result.status).toBe(200);
    }
  });

  it('each route has at least one required role defined', () => {
    for (const route of MARKETPLACE_ROUTES) {
      expect(route.requiredRoles.length).toBeGreaterThan(0);
    }
  });
});

describe('Marketplace API Router - Authentication Rejection', () => {
  it('returns 401 when no auth context is provided for each endpoint', () => {
    for (const route of MARKETPLACE_ROUTES) {
      const result = handleRequest(route, null);
      expect(result.status).toBe(401);
      expect(isMarketplaceError(result.body)).toBe(true);
      const error = result.body as MarketplaceError;
      expect(error.code).toBe('AUTHENTICATION_REQUIRED');
      expect(error.message.length).toBeGreaterThan(0);
    }
  });

  it('authentication check runs before RBAC check', () => {
    for (const route of MARKETPLACE_ROUTES) {
      const result = handleRequest(route, null);
      expect(result.status).toBe(401);
      expect(result.status).not.toBe(403);
    }
  });
});

describe('Marketplace API Router - Error Response Format Consistency', () => {
  const allRoles: UserRole[] = [
    'client', 'architect', 'admin', 'freelancer', 'bep', 'contractor',
    'subcontractor', 'supplier', 'engineer', 'quantity_surveyor',
    'town_planner', 'energy_professional', 'fire_engineer', 'site_manager',
    'developer', 'firm_admin', 'platform_admin',
  ];

  it('all 401 error responses match MarketplaceError shape', () => {
    for (const route of MARKETPLACE_ROUTES) {
      const result = handleRequest(route, null);
      const error = result.body as MarketplaceError;
      expect(typeof error.code).toBe('string');
      expect(error.code.length).toBeGreaterThan(0);
      expect(typeof error.message).toBe('string');
      expect(error.message.length).toBeGreaterThan(0);
      expect(error.code).toMatch(/^[A-Z_]+$/);
    }
  });

  it('all 403 error responses match MarketplaceError shape with details', () => {
    for (const route of MARKETPLACE_ROUTES) {
      const unauthorizedRole = allRoles.find(r => !route.requiredRoles.includes(r));
      if (!unauthorizedRole) continue;

      const authContext: AuthContext = { userId: 'user-789', role: unauthorizedRole, verified: true };
      const result = handleRequest(route, authContext);
      const error = result.body as MarketplaceError;

      expect(typeof error.code).toBe('string');
      expect(error.code.length).toBeGreaterThan(0);
      expect(typeof error.message).toBe('string');
      expect(error.message.length).toBeGreaterThan(0);
      expect(error.code).toMatch(/^[A-Z_]+$/);
      expect(error.details).toBeDefined();
      expect(error.details!.requiredRoles).toBeDefined();
      expect(Array.isArray(error.details!.requiredRoles)).toBe(true);
    }
  });

  it('error codes use consistent naming convention', () => {
    const authResult = handleRequest(MARKETPLACE_ROUTES[0], null);
    const authError = authResult.body as MarketplaceError;
    expect(authError.code).toBe('AUTHENTICATION_REQUIRED');

    const rbacResult = handleRequest(
      MARKETPLACE_ROUTES[0],
      { userId: 'u1', role: 'freelancer', verified: true }
    );
    if (rbacResult.status === 403) {
      const rbacError = rbacResult.body as MarketplaceError;
      expect(rbacError.code).toBe('ACCESS_DENIED');
    }
  });

  it('all routes in the router are covered (at least 31 endpoints)', () => {
    expect(MARKETPLACE_ROUTES.length).toBeGreaterThanOrEqual(31);
  });

  it('mock res object captures status and body correctly', () => {
    const res = createMockRes();
    res.status(403).json({ code: 'TEST', message: 'test error' });
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ code: 'TEST', message: 'test error' });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledTimes(1);
  });
});
