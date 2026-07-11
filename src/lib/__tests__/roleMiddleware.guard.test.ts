import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock firebase-admin ─────────────────────────────────────────────────────────
// Use vi.hoisted to declare mocks that can be referenced inside vi.mock factory
const { mockVerifyIdToken, mockCollectionDoc, mockDocGet, mockDocCreate } = vi.hoisted(() => ({
  mockVerifyIdToken: vi.fn(),
  mockCollectionDoc: vi.fn(),
  mockDocGet: vi.fn(),
  mockDocCreate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: (path: string) => ({
      doc: (id: string) => {
        mockCollectionDoc(path, id);
        return {
          get: mockDocGet,
          create: mockDocCreate,
        };
      },
    }),
  },
  auth: {
    verifyIdToken: mockVerifyIdToken,
  },
}));

import type { Request, Response, NextFunction } from 'express';
import { requirePermissionWithGuards, type APIGuardConfig } from '../roleMiddleware';

// ── Test helpers ────────────────────────────────────────────────────────────────

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: { authorization: 'Bearer valid-token' },
    params: {},
    body: {},
    query: {},
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): Response & { _status: number; _json: any } {
  const res = {
    _status: 0,
    _json: null,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: any) {
      res._json = data;
      return res;
    },
  };
  return res as any;
}

// ── Fixtures ────────────────────────────────────────────────────────────────────

const validDecodedToken = { uid: 'user-1', email: 'test@example.com' };

const userDocData = {
  role: 'quantity_surveyor',
  admin: false,
};

const projectDocData = {
  clientId: 'client-1',
  leadProfessionalId: 'lead-1',
  leadBepId: 'lead-1',
  memberships: [
    { userId: 'user-1', accessRole: 'project_administrator', status: 'active' },
  ],
};

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('requirePermissionWithGuards', () => {
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    next = vi.fn();

    // Default: token verifies successfully
    mockVerifyIdToken.mockResolvedValue(validDecodedToken);

    // Default: user doc exists with QS role
    mockDocGet.mockImplementation(() => {
      // We need to track which collection was queried
      const lastCall = mockCollectionDoc.mock.calls[mockCollectionDoc.mock.calls.length - 1];
      if (lastCall && lastCall[0] === 'users') {
        return Promise.resolve({ exists: true, data: () => userDocData });
      }
      if (lastCall && lastCall[0] === 'agents') {
        return Promise.resolve({ exists: false });
      }
      if (lastCall && lastCall[0] === 'projects') {
        return Promise.resolve({ exists: true, data: () => projectDocData });
      }
      return Promise.resolve({ exists: false });
    });
  });

  describe('authentication', () => {
    it('returns 401 when authorization header is missing', async () => {
      const config: APIGuardConfig = {
        action: 'payment:manage',
        requireProjectMembership: false,
      };
      const middleware = requirePermissionWithGuards(config);
      const req = createMockReq({ headers: {} });
      const res = createMockRes();

      await new Promise<void>((resolve) => {
        middleware(req, res as any, () => resolve());
        // Give the async handler time to complete
        setTimeout(resolve, 50);
      });

      expect(res._status).toBe(401);
      expect(res._json).toHaveProperty('error');
      expect(res._json).toHaveProperty('requestId');
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when token verification fails', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('Token expired'));

      const config: APIGuardConfig = {
        action: 'payment:manage',
        requireProjectMembership: false,
      };
      const middleware = requirePermissionWithGuards(config);
      const req = createMockReq();
      const res = createMockRes();

      await new Promise<void>((resolve) => {
        middleware(req, res as any, () => resolve());
        setTimeout(resolve, 50);
      });

      expect(res._status).toBe(401);
      expect(res._json).toHaveProperty('error', 'Authentication required');
      expect(res._json).toHaveProperty('requestId');
    });
  });

  describe('permission evaluation', () => {
    it('calls next() when user has required permission', async () => {
      // QS has payment:manage permission — needs project context for project-scoped actions
      const config: APIGuardConfig = {
        action: 'payment:manage',
        requireProjectMembership: false,
      };
      const middleware = requirePermissionWithGuards(config);
      const req = createMockReq({ params: { projectId: 'proj-1' } as any });
      const res = createMockRes();

      await new Promise<void>((resolve) => {
        middleware(req, res as any, () => {
          next();
          resolve();
        });
        setTimeout(resolve, 100);
      });

      expect(next).toHaveBeenCalled();
    });

    it('returns 403 when user lacks required permission', async () => {
      // Set user to freelancer role which doesn't have payment:manage
      mockDocGet.mockImplementation(() => {
        const lastCall = mockCollectionDoc.mock.calls[mockCollectionDoc.mock.calls.length - 1];
        if (lastCall && lastCall[0] === 'users') {
          return Promise.resolve({ exists: true, data: () => ({ role: 'freelancer', admin: false }) });
        }
        if (lastCall && lastCall[0] === 'agents') {
          return Promise.resolve({ exists: false });
        }
        return Promise.resolve({ exists: false });
      });

      const config: APIGuardConfig = {
        action: 'payment:manage',
        requireProjectMembership: false,
      };
      const middleware = requirePermissionWithGuards(config);
      const req = createMockReq();
      const res = createMockRes();

      await new Promise<void>((resolve) => {
        middleware(req, res as any, () => resolve());
        setTimeout(resolve, 100);
      });

      expect(res._status).toBe(403);
      expect(res._json).toHaveProperty('error', 'Access denied');
      expect(res._json).toHaveProperty('requestId');
    });

    it('evaluates project-scoped permissions with project context', async () => {
      const config: APIGuardConfig = {
        action: 'payment:manage',
        requireProjectMembership: true,
      };
      const middleware = requirePermissionWithGuards(config);
      const req = createMockReq({ params: { projectId: 'proj-1' } as any });
      const res = createMockRes();

      await new Promise<void>((resolve) => {
        middleware(req, res as any, () => {
          next();
          resolve();
        });
        setTimeout(resolve, 100);
      });

      // user-1 has active project_administrator membership which grants payment:manage
      expect(next).toHaveBeenCalled();
    });
  });

  describe('project membership verification', () => {
    it('returns 403 when requireProjectMembership is true but no projectId provided', async () => {
      const config: APIGuardConfig = {
        action: 'project:read',
        requireProjectMembership: true,
      };
      const middleware = requirePermissionWithGuards(config);
      // No projectId in params, body, or query
      const req = createMockReq();
      const res = createMockRes();

      // User has project:read from role, but no project context
      mockDocGet.mockImplementation(() => {
        const lastCall = mockCollectionDoc.mock.calls[mockCollectionDoc.mock.calls.length - 1];
        if (lastCall && lastCall[0] === 'users') {
          return Promise.resolve({ exists: true, data: () => userDocData });
        }
        if (lastCall && lastCall[0] === 'agents') {
          return Promise.resolve({ exists: false });
        }
        return Promise.resolve({ exists: false });
      });

      await new Promise<void>((resolve) => {
        middleware(req, res as any, () => resolve());
        setTimeout(resolve, 100);
      });

      expect(res._status).toBe(403);
      expect(res._json).toHaveProperty('error', 'Access denied');
    });

    it('returns 403 when user has no active membership on the project', async () => {
      const config: APIGuardConfig = {
        action: 'payment:manage',
        requireProjectMembership: true,
      };
      const middleware = requirePermissionWithGuards(config);
      const req = createMockReq({ params: { projectId: 'proj-1' } as any });
      const res = createMockRes();

      // Project exists but user-1 has no membership
      mockDocGet.mockImplementation(() => {
        const lastCall = mockCollectionDoc.mock.calls[mockCollectionDoc.mock.calls.length - 1];
        if (lastCall && lastCall[0] === 'users') {
          return Promise.resolve({ exists: true, data: () => userDocData });
        }
        if (lastCall && lastCall[0] === 'agents') {
          return Promise.resolve({ exists: false });
        }
        if (lastCall && lastCall[0] === 'projects') {
          return Promise.resolve({
            exists: true,
            data: () => ({
              clientId: 'other-user',
              leadProfessionalId: 'other-lead',
              memberships: [
                { userId: 'someone-else', accessRole: 'project_administrator', status: 'active' },
              ],
            }),
          });
        }
        return Promise.resolve({ exists: false });
      });

      await new Promise<void>((resolve) => {
        middleware(req, res as any, () => resolve());
        setTimeout(resolve, 100);
      });

      expect(res._status).toBe(403);
      expect(res._json).toHaveProperty('error', 'Access denied');
    });

    it('allows access when user is the project client', async () => {
      const config: APIGuardConfig = {
        action: 'project:read',
        requireProjectMembership: true,
      };
      const middleware = requirePermissionWithGuards(config);
      const req = createMockReq({ params: { projectId: 'proj-1' } as any });
      const res = createMockRes();

      // User is the project client
      mockDocGet.mockImplementation(() => {
        const lastCall = mockCollectionDoc.mock.calls[mockCollectionDoc.mock.calls.length - 1];
        if (lastCall && lastCall[0] === 'users') {
          return Promise.resolve({ exists: true, data: () => ({ role: 'client', admin: false }) });
        }
        if (lastCall && lastCall[0] === 'agents') {
          return Promise.resolve({ exists: false });
        }
        if (lastCall && lastCall[0] === 'projects') {
          return Promise.resolve({
            exists: true,
            data: () => ({
              clientId: 'user-1', // matches the decoded token uid
              leadProfessionalId: 'lead-1',
              memberships: [],
            }),
          });
        }
        return Promise.resolve({ exists: false });
      });

      await new Promise<void>((resolve) => {
        middleware(req, res as any, () => {
          next();
          resolve();
        });
        setTimeout(resolve, 100);
      });

      expect(next).toHaveBeenCalled();
    });

    it('allows access when user is the lead professional', async () => {
      const config: APIGuardConfig = {
        action: 'project:read',
        requireProjectMembership: true,
      };
      const middleware = requirePermissionWithGuards(config);
      const req = createMockReq({ params: { projectId: 'proj-1' } as any });
      const res = createMockRes();

      mockDocGet.mockImplementation(() => {
        const lastCall = mockCollectionDoc.mock.calls[mockCollectionDoc.mock.calls.length - 1];
        if (lastCall && lastCall[0] === 'users') {
          return Promise.resolve({ exists: true, data: () => ({ role: 'bep', admin: false }) });
        }
        if (lastCall && lastCall[0] === 'agents') {
          return Promise.resolve({ exists: false });
        }
        if (lastCall && lastCall[0] === 'projects') {
          return Promise.resolve({
            exists: true,
            data: () => ({
              clientId: 'client-1',
              leadProfessionalId: 'user-1', // matches the decoded token uid
              leadBepId: 'user-1',
              memberships: [],
            }),
          });
        }
        return Promise.resolve({ exists: false });
      });

      await new Promise<void>((resolve) => {
        middleware(req, res as any, () => {
          next();
          resolve();
        });
        setTimeout(resolve, 100);
      });

      expect(next).toHaveBeenCalled();
    });
  });

  describe('opaque error responses', () => {
    it('error response does not reveal which check failed', async () => {
      // Freelancer trying payment:manage — permission denied
      mockDocGet.mockImplementation(() => {
        const lastCall = mockCollectionDoc.mock.calls[mockCollectionDoc.mock.calls.length - 1];
        if (lastCall && lastCall[0] === 'users') {
          return Promise.resolve({ exists: true, data: () => ({ role: 'freelancer', admin: false }) });
        }
        if (lastCall && lastCall[0] === 'agents') {
          return Promise.resolve({ exists: false });
        }
        return Promise.resolve({ exists: false });
      });

      const config: APIGuardConfig = {
        action: 'payment:manage',
        requireProjectMembership: false,
      };
      const middleware = requirePermissionWithGuards(config);
      const req = createMockReq();
      const res = createMockRes();

      await new Promise<void>((resolve) => {
        middleware(req, res as any, () => resolve());
        setTimeout(resolve, 100);
      });

      // Error should be generic — not revealing role/permission/membership detail
      expect(res._json.error).toBe('Access denied');
      expect(res._json.error).not.toContain('permission');
      expect(res._json.error).not.toContain('role');
      expect(res._json.error).not.toContain('membership');
      expect(res._json).toHaveProperty('requestId');
      expect(res._json.requestId).toMatch(/^req_/);
    });

    it('401 error does not reveal token failure reason', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('Token has been revoked'));

      const config: APIGuardConfig = {
        action: 'payment:manage',
        requireProjectMembership: false,
      };
      const middleware = requirePermissionWithGuards(config);
      const req = createMockReq();
      const res = createMockRes();

      await new Promise<void>((resolve) => {
        middleware(req, res as any, () => resolve());
        setTimeout(resolve, 50);
      });

      expect(res._status).toBe(401);
      expect(res._json.error).toBe('Authentication required');
      expect(res._json.error).not.toContain('revoked');
      expect(res._json).toHaveProperty('requestId');
    });
  });

  describe('request context attachment', () => {
    it('attaches authContext and guardedUser on success', async () => {
      const config: APIGuardConfig = {
        action: 'payment:manage',
        requireProjectMembership: false,
      };
      const middleware = requirePermissionWithGuards(config);
      // Need projectId for project-scoped actions to pass canUserPerform
      const req = createMockReq({ params: { projectId: 'proj-1' } as any });
      const res = createMockRes();

      await new Promise<void>((resolve) => {
        middleware(req, res as any, () => {
          next();
          resolve();
        });
        setTimeout(resolve, 100);
      });

      expect(next).toHaveBeenCalled();
      expect(req.authContext).toBeDefined();
      expect(req.authContext!.uid).toBe('user-1');
      expect((req as any).guardedUser).toBeDefined();
      expect((req as any).guardedUser.uid).toBe('user-1');
    });

    it('attaches projectAccessContext when project is resolved', async () => {
      const config: APIGuardConfig = {
        action: 'payment:manage',
        requireProjectMembership: true,
      };
      const middleware = requirePermissionWithGuards(config);
      const req = createMockReq({ params: { projectId: 'proj-1' } as any });
      const res = createMockRes();

      await new Promise<void>((resolve) => {
        middleware(req, res as any, () => {
          next();
          resolve();
        });
        setTimeout(resolve, 100);
      });

      expect(next).toHaveBeenCalled();
      expect((req as any).projectAccessContext).toBeDefined();
      expect((req as any).projectAccessContext.projectId).toBe('proj-1');
    });
  });

  describe('APIGuardConfig interface', () => {
    it('accepts config with all optional fields', () => {
      const config: APIGuardConfig = {
        action: 'payment:manage',
        requireProjectMembership: true,
        separationOfDutyCheck: {
          claimField: 'createdBy',
          forbiddenActors: ['submitter', 'certifier'],
        },
        commercialGateRequired: true,
      };

      // Factory should not throw
      const middleware = requirePermissionWithGuards(config);
      expect(typeof middleware).toBe('function');
    });

    it('accepts minimal config', () => {
      const config: APIGuardConfig = {
        action: 'project:read',
        requireProjectMembership: false,
      };

      const middleware = requirePermissionWithGuards(config);
      expect(typeof middleware).toBe('function');
    });
  });

  describe('projectId resolution', () => {
    it('resolves projectId from request body', async () => {
      const config: APIGuardConfig = {
        action: 'payment:manage',
        requireProjectMembership: true,
      };
      const middleware = requirePermissionWithGuards(config);
      const req = createMockReq({ body: { projectId: 'proj-1' } });
      const res = createMockRes();

      await new Promise<void>((resolve) => {
        middleware(req, res as any, () => {
          next();
          resolve();
        });
        setTimeout(resolve, 100);
      });

      expect(next).toHaveBeenCalled();
    });

    it('resolves projectId from query params', async () => {
      const config: APIGuardConfig = {
        action: 'payment:manage',
        requireProjectMembership: true,
      };
      const middleware = requirePermissionWithGuards(config);
      const req = createMockReq({ query: { projectId: 'proj-1' } as any });
      const res = createMockRes();

      await new Promise<void>((resolve) => {
        middleware(req, res as any, () => {
          next();
          resolve();
        });
        setTimeout(resolve, 100);
      });

      expect(next).toHaveBeenCalled();
    });
  });

  describe('commercial gate check (Requirement 6.3)', () => {
    it('returns 403 when commercialGateRequired is true and project commercialGateOpen is false', async () => {
      mockDocGet.mockImplementation(() => {
        const lastCall = mockCollectionDoc.mock.calls[mockCollectionDoc.mock.calls.length - 1];
        if (lastCall && lastCall[0] === 'users') {
          return Promise.resolve({ exists: true, data: () => userDocData });
        }
        if (lastCall && lastCall[0] === 'agents') {
          return Promise.resolve({ exists: false });
        }
        if (lastCall && lastCall[0] === 'projects') {
          return Promise.resolve({
            exists: true,
            data: () => ({
              ...projectDocData,
              commercialGateOpen: false,
            }),
          });
        }
        return Promise.resolve({ exists: false });
      });

      const config: APIGuardConfig = {
        action: 'payment:manage',
        requireProjectMembership: true,
        commercialGateRequired: true,
      };
      const middleware = requirePermissionWithGuards(config);
      const req = createMockReq({ params: { projectId: 'proj-1' } as any });
      const res = createMockRes();

      await new Promise<void>((resolve) => {
        middleware(req, res as any, () => resolve());
        setTimeout(resolve, 100);
      });

      expect(res._status).toBe(403);
      expect(res._json).toHaveProperty('error', 'Access denied');
      expect(res._json).toHaveProperty('requestId');
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 403 when commercialGateRequired is true and commercialGateOpen field is missing', async () => {
      mockDocGet.mockImplementation(() => {
        const lastCall = mockCollectionDoc.mock.calls[mockCollectionDoc.mock.calls.length - 1];
        if (lastCall && lastCall[0] === 'users') {
          return Promise.resolve({ exists: true, data: () => userDocData });
        }
        if (lastCall && lastCall[0] === 'agents') {
          return Promise.resolve({ exists: false });
        }
        if (lastCall && lastCall[0] === 'projects') {
          // No commercialGateOpen field at all
          return Promise.resolve({
            exists: true,
            data: () => projectDocData,
          });
        }
        return Promise.resolve({ exists: false });
      });

      const config: APIGuardConfig = {
        action: 'payment:manage',
        requireProjectMembership: true,
        commercialGateRequired: true,
      };
      const middleware = requirePermissionWithGuards(config);
      const req = createMockReq({ params: { projectId: 'proj-1' } as any });
      const res = createMockRes();

      await new Promise<void>((resolve) => {
        middleware(req, res as any, () => resolve());
        setTimeout(resolve, 100);
      });

      expect(res._status).toBe(403);
      expect(res._json).toHaveProperty('error', 'Access denied');
      expect(next).not.toHaveBeenCalled();
    });

    it('allows request when commercialGateRequired is true and commercialGateOpen is true', async () => {
      mockDocGet.mockImplementation(() => {
        const lastCall = mockCollectionDoc.mock.calls[mockCollectionDoc.mock.calls.length - 1];
        if (lastCall && lastCall[0] === 'users') {
          return Promise.resolve({ exists: true, data: () => userDocData });
        }
        if (lastCall && lastCall[0] === 'agents') {
          return Promise.resolve({ exists: false });
        }
        if (lastCall && lastCall[0] === 'projects') {
          return Promise.resolve({
            exists: true,
            data: () => ({
              ...projectDocData,
              commercialGateOpen: true,
            }),
          });
        }
        return Promise.resolve({ exists: false });
      });

      const config: APIGuardConfig = {
        action: 'payment:manage',
        requireProjectMembership: true,
        commercialGateRequired: true,
      };
      const middleware = requirePermissionWithGuards(config);
      const req = createMockReq({ params: { projectId: 'proj-1' } as any });
      const res = createMockRes();

      await new Promise<void>((resolve) => {
        middleware(req, res as any, () => {
          next();
          resolve();
        });
        setTimeout(resolve, 100);
      });

      expect(next).toHaveBeenCalled();
    });

    it('returns 403 when commercialGateRequired is true but no projectId is provided', async () => {
      const config: APIGuardConfig = {
        action: 'payment:manage',
        requireProjectMembership: false,
        commercialGateRequired: true,
      };
      const middleware = requirePermissionWithGuards(config);
      const req = createMockReq(); // no projectId
      const res = createMockRes();

      await new Promise<void>((resolve) => {
        middleware(req, res as any, () => resolve());
        setTimeout(resolve, 100);
      });

      expect(res._status).toBe(403);
      expect(res._json).toHaveProperty('error', 'Access denied');
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('separation-of-duty check (Requirement 6.3)', () => {
    it('returns 403 when requesting user is the claim submitter', async () => {
      // Track which collection+doc is requested
      const docGetImpl = (path: string, id: string) => {
        if (path === 'users') {
          return Promise.resolve({ exists: true, data: () => userDocData });
        }
        if (path === 'agents') {
          return Promise.resolve({ exists: false });
        }
        if (path === 'projects') {
          return Promise.resolve({
            exists: true,
            data: () => ({
              ...projectDocData,
              commercialGateOpen: true,
            }),
          });
        }
        if (path === 'payment_claims') {
          // The claim was submitted by user-1 (the requesting user)
          return Promise.resolve({
            exists: true,
            data: () => ({
              claimantUid: 'user-1',
              certifierUid: 'certifier-2',
            }),
          });
        }
        return Promise.resolve({ exists: false });
      };

      mockDocGet.mockImplementation(() => {
        const lastCall = mockCollectionDoc.mock.calls[mockCollectionDoc.mock.calls.length - 1];
        return docGetImpl(lastCall[0], lastCall[1]);
      });

      const config: APIGuardConfig = {
        action: 'payment:manage',
        requireProjectMembership: true,
        commercialGateRequired: true,
        separationOfDutyCheck: {
          claimField: 'claimId',
          forbiddenActors: ['submitter', 'certifier'],
        },
      };
      const middleware = requirePermissionWithGuards(config);
      const req = createMockReq({
        params: { projectId: 'proj-1' } as any,
        body: { claimId: 'claim-123', projectId: 'proj-1' },
      });
      const res = createMockRes();

      await new Promise<void>((resolve) => {
        middleware(req, res as any, () => resolve());
        setTimeout(resolve, 150);
      });

      expect(res._status).toBe(403);
      expect(res._json).toHaveProperty('error', 'Access denied');
      expect(res._json).toHaveProperty('requestId');
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 403 when requesting user is the claim certifier', async () => {
      mockDocGet.mockImplementation(() => {
        const lastCall = mockCollectionDoc.mock.calls[mockCollectionDoc.mock.calls.length - 1];
        if (lastCall && lastCall[0] === 'users') {
          return Promise.resolve({ exists: true, data: () => userDocData });
        }
        if (lastCall && lastCall[0] === 'agents') {
          return Promise.resolve({ exists: false });
        }
        if (lastCall && lastCall[0] === 'projects') {
          return Promise.resolve({
            exists: true,
            data: () => ({
              ...projectDocData,
              commercialGateOpen: true,
            }),
          });
        }
        if (lastCall && lastCall[0] === 'payment_claims') {
          // The claim was certified by user-1 (the requesting user)
          return Promise.resolve({
            exists: true,
            data: () => ({
              claimantUid: 'submitter-other',
              certifierUid: 'user-1', // requesting user is the certifier
            }),
          });
        }
        return Promise.resolve({ exists: false });
      });

      const config: APIGuardConfig = {
        action: 'escrow:release',
        requireProjectMembership: true,
        commercialGateRequired: true,
        separationOfDutyCheck: {
          claimField: 'claimId',
          forbiddenActors: ['submitter', 'certifier'],
        },
      };
      const middleware = requirePermissionWithGuards(config);
      const req = createMockReq({
        params: { projectId: 'proj-1' } as any,
        body: { claimId: 'claim-456', projectId: 'proj-1' },
      });
      const res = createMockRes();

      // Ensure user has escrow:release permission — use admin role
      mockDocGet.mockImplementation(() => {
        const lastCall = mockCollectionDoc.mock.calls[mockCollectionDoc.mock.calls.length - 1];
        if (lastCall && lastCall[0] === 'users') {
          return Promise.resolve({ exists: true, data: () => ({ role: 'admin', admin: true }) });
        }
        if (lastCall && lastCall[0] === 'agents') {
          return Promise.resolve({ exists: false });
        }
        if (lastCall && lastCall[0] === 'projects') {
          return Promise.resolve({
            exists: true,
            data: () => ({
              ...projectDocData,
              commercialGateOpen: true,
            }),
          });
        }
        if (lastCall && lastCall[0] === 'payment_claims') {
          return Promise.resolve({
            exists: true,
            data: () => ({
              claimantUid: 'submitter-other',
              certifierUid: 'user-1',
            }),
          });
        }
        return Promise.resolve({ exists: false });
      });

      await new Promise<void>((resolve) => {
        middleware(req, res as any, () => resolve());
        setTimeout(resolve, 150);
      });

      expect(res._status).toBe(403);
      expect(res._json).toHaveProperty('error', 'Access denied');
      expect(next).not.toHaveBeenCalled();
    });

    it('allows request when user is neither submitter nor certifier', async () => {
      mockDocGet.mockImplementation(() => {
        const lastCall = mockCollectionDoc.mock.calls[mockCollectionDoc.mock.calls.length - 1];
        if (lastCall && lastCall[0] === 'users') {
          return Promise.resolve({ exists: true, data: () => userDocData });
        }
        if (lastCall && lastCall[0] === 'agents') {
          return Promise.resolve({ exists: false });
        }
        if (lastCall && lastCall[0] === 'projects') {
          return Promise.resolve({
            exists: true,
            data: () => ({
              ...projectDocData,
              commercialGateOpen: true,
            }),
          });
        }
        if (lastCall && lastCall[0] === 'payment_claims') {
          // Neither submitter nor certifier is user-1
          return Promise.resolve({
            exists: true,
            data: () => ({
              claimantUid: 'other-user-A',
              certifierUid: 'other-user-B',
            }),
          });
        }
        return Promise.resolve({ exists: false });
      });

      const config: APIGuardConfig = {
        action: 'payment:manage',
        requireProjectMembership: true,
        commercialGateRequired: true,
        separationOfDutyCheck: {
          claimField: 'claimId',
          forbiddenActors: ['submitter', 'certifier'],
        },
      };
      const middleware = requirePermissionWithGuards(config);
      const req = createMockReq({
        params: { projectId: 'proj-1' } as any,
        body: { claimId: 'claim-789', projectId: 'proj-1' },
      });
      const res = createMockRes();

      await new Promise<void>((resolve) => {
        middleware(req, res as any, () => {
          next();
          resolve();
        });
        setTimeout(resolve, 150);
      });

      expect(next).toHaveBeenCalled();
    });

    it('skips separation check when claimField is not in request body', async () => {
      mockDocGet.mockImplementation(() => {
        const lastCall = mockCollectionDoc.mock.calls[mockCollectionDoc.mock.calls.length - 1];
        if (lastCall && lastCall[0] === 'users') {
          return Promise.resolve({ exists: true, data: () => userDocData });
        }
        if (lastCall && lastCall[0] === 'agents') {
          return Promise.resolve({ exists: false });
        }
        if (lastCall && lastCall[0] === 'projects') {
          return Promise.resolve({
            exists: true,
            data: () => ({
              ...projectDocData,
              commercialGateOpen: true,
            }),
          });
        }
        return Promise.resolve({ exists: false });
      });

      const config: APIGuardConfig = {
        action: 'payment:manage',
        requireProjectMembership: true,
        commercialGateRequired: true,
        separationOfDutyCheck: {
          claimField: 'claimId',
          forbiddenActors: ['submitter', 'certifier'],
        },
      };
      const middleware = requirePermissionWithGuards(config);
      // No claimId in body — should skip the separation check
      const req = createMockReq({
        params: { projectId: 'proj-1' } as any,
        body: { projectId: 'proj-1' },
      });
      const res = createMockRes();

      await new Promise<void>((resolve) => {
        middleware(req, res as any, () => {
          next();
          resolve();
        });
        setTimeout(resolve, 150);
      });

      expect(next).toHaveBeenCalled();
    });
  });
});
