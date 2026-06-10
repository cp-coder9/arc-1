import type { Request, Response, NextFunction, RequestHandler } from 'express';
import crypto from 'crypto';
import { adminDb, auth } from './firebase-admin';
import {
  normalizeUserRole,
  type AuthzUser,
  type PermissionAction,
  type NormalizedUserRole,
} from '../services/permissionService';
import type { UserRole } from '../types';

// Re-export type for consumers
export type { AuthzUser, PermissionAction, NormalizedUserRole };

/**
 * Auth context attached to request by middleware.
 */
export interface AuthContext {
  decoded: Record<string, any>;
  userData: Record<string, any> | null;
  uid: string;
  role?: UserRole | string;
  normalizedRole: NormalizedUserRole | null;
  isAdmin: boolean;
}

// Extend Express Request to include authContext
declare global {
  namespace Express {
    interface Request {
      authContext?: AuthContext;
    }
  }
}

// ── Auth helpers (mirrors api-router.ts patterns) ─────────────────────────────

function validateAgentApiKey(providedKey: string): boolean {
  const expectedKey = process.env.AGENT_API_KEY;
  if (!expectedKey) {
    throw Object.assign(new Error("Server configuration error: AGENT_API_KEY not set"), { status: 500 });
  }
  const expectedBuf = Buffer.from(expectedKey);
  const providedBuf = Buffer.from(providedKey);
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

async function middlewareVerifyAuth(headers: Record<string, any>) {
  const authHeader = headers.authorization as string | undefined;
  const directApiKey = headers['api-key'] || headers['x-agent-key'];

  if (directApiKey) {
    if (!validateAgentApiKey(directApiKey)) {
      throw Object.assign(new Error("Invalid API key"), { status: 401 });
    }
    return {
      uid: `agent_${crypto.randomBytes(8).toString('hex')}`,
      email: 'agent@architex.co.za',
      displayName: 'Agent Service',
      role: 'admin' as UserRole,
      authorizationType: 'api_key',
      authorizationValue: directApiKey
    };
  }

  if (!authHeader) {
    throw Object.assign(new Error("Missing authorization header"), { status: 401 });
  }

  if (authHeader.startsWith("Bearer ")) {
    try {
      const token = authHeader.split("Bearer ")[1];
      const decoded = await auth.verifyIdToken(token);
      const agentDoc = await adminDb.collection("agents").doc(decoded.uid).get();
      if (agentDoc.exists) {
        const agentData = agentDoc.data();
        return {
          ...decoded,
          authorizationType: agentData?.authorizationType,
          authorizationValue: agentData?.authorizationValue
        };
      }
      return decoded;
    } catch (err: any) {
      console.error("Firebase Auth Verification Failed:", err);
      throw Object.assign(new Error(`Auth failed: ${err.message}`), { status: 401 });
    }
  }

  if (authHeader.startsWith("Api-Key ")) {
    const apiKey = authHeader.split("Api-Key ")[1];
    if (!apiKey) {
      throw Object.assign(new Error("Missing API key value"), { status: 401 });
    }
    if (!validateAgentApiKey(apiKey)) {
      throw Object.assign(new Error("Invalid API key"), { status: 401 });
    }
    return {
      uid: `agent_${crypto.randomBytes(8).toString('hex')}`,
      email: 'agent@architex.co.za',
      displayName: 'Agent Service',
      role: 'admin' as UserRole,
      authorizationType: 'api_key',
      authorizationValue: apiKey
    };
  }

  if (authHeader.startsWith("Custom-Auth ")) {
    const customAuth = authHeader.split("Custom-Auth ")[1];
    if (!customAuth) {
      throw Object.assign(new Error("Missing custom auth value"), { status: 401 });
    }
    if (!validateAgentApiKey(customAuth)) {
      throw Object.assign(new Error("Invalid custom auth token"), { status: 401 });
    }
    return {
      uid: `agent_${crypto.randomBytes(8).toString('hex')}`,
      email: 'agent@architex.co.za',
      displayName: 'Agent Service',
      role: 'admin' as UserRole,
      authorizationType: 'custom',
      authorizationValue: customAuth
    };
  }

  throw Object.assign(new Error("Unsupported authorization type"), { status: 401 });
}

async function middlewareGetAuthContext(headers: Record<string, any>): Promise<AuthContext> {
  const decoded = await middlewareVerifyAuth(headers);
  const decodedClaims = decoded as typeof decoded & { admin?: boolean };
  const userDoc = await adminDb.collection("users").doc(decoded.uid).get();
  const userData = userDoc.exists ? userDoc.data() : null;
  const role = (userData?.role || decodedClaims.role) as UserRole | string | undefined;
  return {
    decoded,
    userData,
    uid: decoded.uid as string,
    role,
    normalizedRole: normalizeUserRole(role),
    isAdmin: role === "admin" || decodedClaims.admin === true,
  };
}

// ── Middleware factories ───────────────────────────────────────────────────────

/**
 * Base middleware: verifies auth and attaches authContext to req.
 */
export const requireAuth: RequestHandler = (req, res, next) => {
  middlewareGetAuthContext(req.headers)
    .then((ctx) => {
      req.authContext = ctx;
      next();
    })
    .catch((err: any) => {
      res.status(err.status || 401).json({ error: err.message || 'Authentication required' });
    });
};

/**
 * Middleware: verifies auth AND requires admin role.
 */
export const requireAdmin: RequestHandler = (req, res, next) => {
  middlewareGetAuthContext(req.headers)
    .then((ctx) => {
      if (!ctx.isAdmin) {
        res.status(403).json({ error: 'Admin access required' });
        return;
      }
      req.authContext = ctx;
      next();
    })
    .catch((err: any) => {
      res.status(err.status || 401).json({ error: err.message || 'Authentication required' });
    });
};

/**
 * Middleware: verifies auth AND requires one of the specified roles.
 */
export function requireRole(...allowedRoles: NormalizedUserRole[]): RequestHandler {
  return (req, res, next) => {
    middlewareGetAuthContext(req.headers)
      .then((ctx) => {
        if (!ctx.normalizedRole || !allowedRoles.includes(ctx.normalizedRole)) {
          res.status(403).json({
            error: `Access denied. Required role(s): ${allowedRoles.join(', ')}`,
          });
          return;
        }
        req.authContext = ctx;
        next();
      })
      .catch((err: any) => {
        res.status(err.status || 401).json({ error: err.message || 'Authentication required' });
      });
  };
}

/**
 * Middleware: verifies auth AND requires a specific permission action.
 */
export function requirePermission(
  action: PermissionAction,
  getProjectId?: (req: Request) => string | undefined,
): RequestHandler {
  return (req, res, next) => {
    middlewareGetAuthContext(req.headers)
      .then(async (ctx) => {
        const user: AuthzUser = {
          uid: ctx.uid,
          role: ctx.role,
          admin: ctx.isAdmin,
        };

        let projectCtx: any = undefined;
        const projectId = getProjectId ? getProjectId(req) : undefined;
        if (projectId) {
          try {
            const projectDoc = await adminDb.collection('projects').doc(projectId).get();
            if (projectDoc.exists) {
              const project = projectDoc.data()!;
              projectCtx = {
                projectId,
                clientId: project.clientId,
                leadProfessionalId: project.leadProfessionalId || project.leadBepId,
                leadBepId: project.leadBepId,
                leadArchitectId: project.leadArchitectId,
                memberships: project.memberships || [],
              };
            }
          } catch {
            // Project lookup failure — permission denied below
          }
        }

        const { assertCanUserPerform } = await import('../services/permissionService');
        try {
          assertCanUserPerform(user, action, projectCtx || undefined);
        } catch {
          res.status(403).json({
            error: `Permission denied for action: ${action}`,
          });
          return;
        }
        req.authContext = ctx;
        next();
      })
      .catch((err: any) => {
        res.status(err.status || 401).json({ error: err.message || 'Authentication required' });
      });
  };
}

/**
 * Convenience: single middleware that combines role and permission checks.
 */
export function roleGuard(opts: {
  roles?: NormalizedUserRole[];
  permission?: PermissionAction;
  adminOnly?: boolean;
}): RequestHandler {
  return (req, res, next) => {
    middlewareGetAuthContext(req.headers)
      .then(async (ctx) => {
        if (opts.adminOnly && !ctx.isAdmin) {
          res.status(403).json({ error: 'Admin access required' });
          return;
        }

        if (opts.roles?.length && (!ctx.normalizedRole || !opts.roles.includes(ctx.normalizedRole))) {
          res.status(403).json({
            error: `Access denied. Required role(s): ${opts.roles.join(', ')}`,
          });
          return;
        }

        if (opts.permission) {
          const user: AuthzUser = {
            uid: ctx.uid,
            role: ctx.role,
            admin: ctx.isAdmin,
          };
          try {
            const { assertCanUserPerform } = await import('../services/permissionService');
            assertCanUserPerform(user, opts.permission);
          } catch {
            res.status(403).json({
              error: `Permission denied for action: ${opts.permission}`,
            });
            return;
          }
        }

        req.authContext = ctx;
        next();
      })
      .catch((err: any) => {
        res.status(err.status || 401).json({ error: err.message || 'Authentication required' });
      });
  };
}
