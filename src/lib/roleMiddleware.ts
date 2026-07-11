import type { Request, Response, NextFunction, RequestHandler } from 'express';
import crypto from 'crypto';
import { adminDb, auth } from './firebase-admin';
import {
  normalizeUserRole,
  normalizeUserForAuthz,
  isAdminUser,
  canUserPerform,
  type AuthzUser,
  type PermissionAction,
  type NormalizedUserRole,
  type ProjectAccessContext,
  type ProjectAccessRole,
} from '../services/permissionService';
import type { UserRole } from '../types';

// Re-export type for consumers
export type { AuthzUser, PermissionAction, NormalizedUserRole };

// ── Rejection Audit Trail Types ───────────────────────────────────────────────

/**
 * Internal denial reasons recorded in audit trail for security analysis.
 * These are NEVER exposed to external callers.
 */
export type DenialReason =
  | 'token_missing'
  | 'token_expired'
  | 'token_invalid'
  | 'role_mismatch'
  | 'permission_denied'
  | 'project_membership_missing'
  | 'commercial_gate_closed'
  | 'separation_of_duty_violation'
  | 'project_not_found'
  | 'unexpected_error';

/**
 * Audit record written on every API guard rejection.
 * Per Requirement 6.5: actor UID, attempted action, target resource, internal denial reason.
 */
export interface RejectionAuditRecord {
  eventId: string;
  actorUid: string;
  attemptedAction: string;
  targetResource: string;
  denialReason: DenialReason;
  requestId: string;
  timestampIso: string;
  httpStatus: 401 | 403;
  metadata?: Record<string, string>;
}

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
  const rawRole = (userData?.role || decodedClaims.role) as UserRole | string | undefined;
  const rawAdmin = userData?.admin === true || decodedClaims.admin === true;

  // Normalize user for authorization — maps legacy role:'admin' → 'platform_admin'
  // and handles admin:true flag. This ensures API-layer behavior matches client-layer.
  const rawAuthzUser: AuthzUser = {
    uid: decoded.uid as string,
    role: rawRole,
    admin: rawAdmin,
  };
  const normalized = normalizeUserForAuthz(rawAuthzUser)!;

  const effectiveRole = normalized.role as UserRole | string | undefined;

  return {
    decoded,
    userData,
    uid: decoded.uid as string,
    role: effectiveRole,
    normalizedRole: normalizeUserRole(effectiveRole),
    isAdmin: isAdminUser(normalized),
  };
}

// ── Middleware factories ───────────────────────────────────────────────────────

/**
 * Base middleware: verifies auth and attaches authContext to req.
 * Per Requirement 6.7: returns opaque 401 without revealing specific failure reason.
 */
export const requireAuth: RequestHandler = (req, res, next) => {
  middlewareGetAuthContext(req.headers)
    .then((ctx) => {
      req.authContext = ctx;
      next();
    })
    .catch((err: any) => {
      res.status(err.status || 401).json({ error: 'Authentication required' });
    });
};

/**
 * Middleware: verifies auth AND requires admin role.
 * Per Requirement 6.7: returns opaque 401 without revealing specific failure reason.
 */
export const requireAdmin: RequestHandler = (req, res, next) => {
  middlewareGetAuthContext(req.headers)
    .then((ctx) => {
      if (!ctx.isAdmin) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
      req.authContext = ctx;
      next();
    })
    .catch((err: any) => {
      res.status(err.status || 401).json({ error: 'Authentication required' });
    });
};

/**
 * Middleware: verifies auth AND requires one of the specified roles.
 * Per Requirements 6.4, 6.7: returns opaque errors without revealing specific failure reason.
 */
export function requireRole(...allowedRoles: NormalizedUserRole[]): RequestHandler {
  return (req, res, next) => {
    middlewareGetAuthContext(req.headers)
      .then((ctx) => {
        if (!ctx.normalizedRole || !allowedRoles.includes(ctx.normalizedRole)) {
          res.status(403).json({ error: 'Access denied' });
          return;
        }
        req.authContext = ctx;
        next();
      })
      .catch((err: any) => {
        res.status(err.status || 401).json({ error: 'Authentication required' });
      });
  };
}

/**
 * Middleware: verifies auth AND requires a specific permission action.
 * Per Requirements 6.4, 6.7: returns opaque errors without revealing specific failure reason.
 */
export function requirePermission(
  action: PermissionAction,
  getProjectId?: (req: Request) => string | undefined,
): RequestHandler {
  return (req, res, next) => {
    middlewareGetAuthContext(req.headers)
      .then(async (ctx) => {
        const rawUser: AuthzUser = {
          uid: ctx.uid,
          role: ctx.role,
          admin: ctx.isAdmin,
        };
        // Normalize before permission evaluation to handle legacy admin records
        const user = normalizeUserForAuthz(rawUser)!;

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
          res.status(403).json({ error: 'Access denied' });
          return;
        }
        req.authContext = ctx;
        next();
      })
      .catch((err: any) => {
        res.status(err.status || 401).json({ error: 'Authentication required' });
      });
  };
}

/**
 * Convenience: single middleware that combines role and permission checks.
 * Per Requirements 6.4, 6.7: returns opaque errors without revealing specific failure reason.
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
          res.status(403).json({ error: 'Access denied' });
          return;
        }

        if (opts.roles?.length && (!ctx.normalizedRole || !opts.roles.includes(ctx.normalizedRole))) {
          res.status(403).json({ error: 'Access denied' });
          return;
        }

        if (opts.permission) {
          const rawUser: AuthzUser = {
            uid: ctx.uid,
            role: ctx.role,
            admin: ctx.isAdmin,
          };
          // Normalize before permission evaluation to handle legacy admin records
          const user = normalizeUserForAuthz(rawUser)!;
          try {
            const { assertCanUserPerform } = await import('../services/permissionService');
            assertCanUserPerform(user, opts.permission);
          } catch {
            res.status(403).json({ error: 'Access denied' });
            return;
          }
        }

        req.authContext = ctx;
        next();
      })
      .catch((err: any) => {
        res.status(err.status || 401).json({ error: 'Authentication required' });
      });
  };
}

// ── API Guard with Permission Guards ──────────────────────────────────────────

/**
 * Configuration for the permission guard factory.
 * Defines the action, membership requirements, separation-of-duty checks,
 * and commercial gate requirements for a guarded endpoint.
 */
export interface APIGuardConfig {
  /** The permission action to evaluate against ROLE_PERMISSIONS and PROJECT_ACCESS_PERMISSIONS. */
  action: PermissionAction;
  /** Whether to verify active project membership on the target project. */
  requireProjectMembership: boolean;
  /** Optional separation-of-duty check configuration. */
  separationOfDutyCheck?: {
    /** The request body or resource field that identifies the actor to check against. */
    claimField: string;
    /** Roles that the requesting user must NOT hold on the target claim/resource. */
    forbiddenActors: ('submitter' | 'certifier' | 'releaser')[];
  };
  /** Whether the project's commercial gate must be open for this action to proceed. */
  commercialGateRequired?: boolean;
}

/**
 * Generate a unique request ID for opaque error responses.
 */
function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
}

/**
 * Resolve the project ID from the request (params, body, or query).
 */
function resolveProjectId(req: Request): string | undefined {
  return (
    (req.params?.projectId as string) ||
    (req.body?.projectId as string) ||
    (req.query?.projectId as string) ||
    undefined
  );
}

/**
 * Writes a rejection audit trail record on every auth/authz denial.
 *
 * Per Requirement 6.5: writes to `projects/{projectId}/auditTrail/{eventId}`
 * for project-scoped requests, or `auditTrail/{eventId}` for non-project-scoped.
 *
 * Contains: actor UID, attempted PermissionAction, target resource identifier,
 * and internal denial reason. Written within 5 seconds of rejection.
 *
 * Fire-and-forget: does not block the response. Logs errors but does not throw.
 */
function writeRejectionAuditRecord(params: {
  actorUid: string;
  attemptedAction: string;
  targetResource: string;
  denialReason: DenialReason;
  requestId: string;
  httpStatus: 401 | 403;
  projectId?: string;
  metadata?: Record<string, string>;
}): void {
  const eventId = `rej_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
  const record: RejectionAuditRecord = {
    eventId,
    actorUid: params.actorUid,
    attemptedAction: params.attemptedAction,
    targetResource: params.targetResource,
    denialReason: params.denialReason,
    requestId: params.requestId,
    timestampIso: new Date().toISOString(),
    httpStatus: params.httpStatus,
    metadata: params.metadata,
  };

  // Determine Firestore path based on project scope
  const collectionPath = params.projectId
    ? `projects/${params.projectId}/auditTrail`
    : 'auditTrail';

  // Fire-and-forget write — do not block the HTTP response
  adminDb
    .collection(collectionPath)
    .doc(eventId)
    .create(record)
    .catch((err: any) => {
      console.error('[API Guard] Failed to write rejection audit record:', err?.message || err);
    });
}

/**
 * Build a ProjectAccessContext from a Firestore project document.
 */
function buildProjectAccessContext(projectId: string, projectData: Record<string, any>): ProjectAccessContext {
  return {
    projectId,
    clientId: projectData.clientId,
    leadProfessionalId: projectData.leadProfessionalId || projectData.leadBepId,
    leadBepId: projectData.leadBepId,
    leadArchitectId: projectData.leadArchitectId,
    memberships: projectData.memberships || [],
  };
}

/**
 * Factory that creates Express middleware enforcing the full API guard chain:
 *
 * 1. Verify Firebase Auth token via `verifyIdToken`
 * 2. Extract user role from Firestore users collection
 * 3. `normalizeUserForAuthz` to prepare user object
 * 4. Evaluate `canUserPerform(user, action)` against permission matrices
 * 5. If `requireProjectMembership`: verify active membership on target project
 * 6. On failure: return 401/403 with opaque error + write audit trail record
 * 7. On success: attach user context to req and call next()
 *
 * Per Requirements 6.4, 6.5, 6.7:
 * - 401 responses use opaque messaging (do not reveal specific token failure reason)
 * - 403 responses are generic (do not reveal which check failed)
 * - Every rejection writes an audit trail record with actor UID, attempted action,
 *   target resource, and internal denial reason
 *
 * Validates: Requirements 6.1, 6.2, 6.4, 6.5, 6.7
 */
export function requirePermissionWithGuards(config: APIGuardConfig): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = generateRequestId();

    (async () => {
      const targetResource = req.originalUrl || req.url || 'unknown';

      // Step 1: Verify Firebase Auth token and extract auth context
      let authCtx: AuthContext;
      try {
        authCtx = await middlewareGetAuthContext(req.headers);
      } catch (err: any) {
        // Auth failure — return 401 with opaque error (Requirement 6.7)
        // Do not reveal whether token was missing, expired, or invalid
        const projectId = resolveProjectId(req);
        const denialReason: DenialReason = !req.headers.authorization
          ? 'token_missing'
          : 'token_invalid';
        writeRejectionAuditRecord({
          actorUid: 'anonymous',
          attemptedAction: config.action,
          targetResource,
          denialReason,
          requestId,
          httpStatus: 401,
          projectId,
        });
        res.status(401).json({
          error: 'Authentication required',
          requestId,
        });
        return;
      }

      // Step 2 & 3: Build AuthzUser and normalize for authorization
      const rawUser: AuthzUser = {
        uid: authCtx.uid,
        role: authCtx.role,
        admin: authCtx.isAdmin,
      };
      const normalizedUser = normalizeUserForAuthz(rawUser)!;

      // Step 4: Resolve project context if needed
      let projectCtx: ProjectAccessContext | undefined;
      const projectId = resolveProjectId(req);

      if (projectId) {
        try {
          const projectDoc = await adminDb.collection('projects').doc(projectId).get();
          if (projectDoc.exists) {
            projectCtx = buildProjectAccessContext(projectId, projectDoc.data()!);
          }
        } catch {
          // Project lookup failure — will be handled by permission check below
        }
      }

      // Step 5: Evaluate permission using canUserPerform
      const hasPermission = canUserPerform(normalizedUser, config.action, projectCtx || null);
      if (!hasPermission) {
        writeRejectionAuditRecord({
          actorUid: authCtx.uid,
          attemptedAction: config.action,
          targetResource,
          denialReason: 'permission_denied',
          requestId,
          httpStatus: 403,
          projectId,
        });
        res.status(403).json({
          error: 'Access denied',
          requestId,
        });
        return;
      }

      // Step 6: If requireProjectMembership, verify active membership on the target project
      if (config.requireProjectMembership) {
        if (!projectId || !projectCtx) {
          writeRejectionAuditRecord({
            actorUid: authCtx.uid,
            attemptedAction: config.action,
            targetResource,
            denialReason: projectId ? 'project_not_found' : 'project_membership_missing',
            requestId,
            httpStatus: 403,
            projectId,
          });
          res.status(403).json({
            error: 'Access denied',
            requestId,
          });
          return;
        }

        // Check if user has any active membership on the project
        const isClient = projectCtx.clientId === normalizedUser.uid;
        const isLeadProfessional =
          projectCtx.leadProfessionalId === normalizedUser.uid ||
          projectCtx.leadBepId === normalizedUser.uid;
        const hasActiveMembership = (projectCtx.memberships || []).some(
          (m) => m.userId === normalizedUser.uid && m.status === 'active',
        );

        if (!isClient && !isLeadProfessional && !hasActiveMembership) {
          writeRejectionAuditRecord({
            actorUid: authCtx.uid,
            attemptedAction: config.action,
            targetResource,
            denialReason: 'project_membership_missing',
            requestId,
            httpStatus: 403,
            projectId,
          });
          res.status(403).json({
            error: 'Access denied',
            requestId,
          });
          return;
        }
      }

      // Step 7: Commercial gate check
      // Per Requirement 6.3: verify project.commercialGateOpen is true before allowing payment writes
      if (config.commercialGateRequired) {
        if (!projectId) {
          writeRejectionAuditRecord({
            actorUid: authCtx.uid,
            attemptedAction: config.action,
            targetResource,
            denialReason: 'commercial_gate_closed',
            requestId,
            httpStatus: 403,
          });
          res.status(403).json({ error: 'Access denied', requestId });
          return;
        }

        // Fetch the project document to check commercialGateOpen field
        let projectData: Record<string, any> | undefined;
        try {
          const projectDoc = await adminDb.collection('projects').doc(projectId).get();
          projectData = projectDoc.exists ? projectDoc.data() : undefined;
        } catch {
          // Project lookup failure
        }

        if (!projectData || projectData.commercialGateOpen !== true) {
          writeRejectionAuditRecord({
            actorUid: authCtx.uid,
            attemptedAction: config.action,
            targetResource,
            denialReason: 'commercial_gate_closed',
            requestId,
            httpStatus: 403,
            projectId,
          });
          res.status(403).json({ error: 'Access denied', requestId });
          return;
        }
      }

      // Step 8: Separation-of-duty check
      // Per Requirement 6.3: for payment:manage and escrow:release, validate requesting user
      // is not the claim initiator or certifier
      if (config.separationOfDutyCheck) {
        const claimRef = req.body?.[config.separationOfDutyCheck.claimField] as string | undefined;

        if (claimRef) {
          try {
            // Look up the claim in payment_claims collection
            const claimDoc = await adminDb
              .collection('payment_claims')
              .doc(claimRef)
              .get();

            let submitterUid: string | undefined;
            let certifierUid: string | undefined;

            if (claimDoc.exists) {
              const claimData = claimDoc.data()!;
              submitterUid = claimData.claimantUid || claimData.createdBy || claimData.submittedBy;
              certifierUid = claimData.certifierUid || claimData.certifiedBy;
            } else {
              // Fallback: try milestones collection for milestone-linked claims
              const milestoneDoc = await adminDb
                .collection('milestones')
                .doc(claimRef)
                .get();
              if (milestoneDoc.exists) {
                const milestoneData = milestoneDoc.data()!;
                submitterUid =
                  milestoneData.claimantUid ||
                  milestoneData.createdBy ||
                  milestoneData.submittedBy;
                certifierUid = milestoneData.certifierUid || milestoneData.certifiedBy;
              }
            }

            // Check if requesting user is the submitter or certifier
            const requestingUid = authCtx.uid;
            const forbidden = config.separationOfDutyCheck.forbiddenActors;

            if (
              forbidden.includes('submitter') &&
              submitterUid &&
              requestingUid === submitterUid
            ) {
              writeRejectionAuditRecord({
                actorUid: requestingUid,
                attemptedAction: config.action,
                targetResource: claimRef,
                denialReason: 'separation_of_duty_violation',
                requestId,
                httpStatus: 403,
                projectId,
                metadata: { constraint: 'submitter_is_releaser', claimRef },
              });
              res.status(403).json({ error: 'Access denied', requestId });
              return;
            }

            if (
              forbidden.includes('certifier') &&
              certifierUid &&
              requestingUid === certifierUid
            ) {
              writeRejectionAuditRecord({
                actorUid: requestingUid,
                attemptedAction: config.action,
                targetResource: claimRef,
                denialReason: 'separation_of_duty_violation',
                requestId,
                httpStatus: 403,
                projectId,
                metadata: { constraint: 'certifier_is_releaser', claimRef },
              });
              res.status(403).json({ error: 'Access denied', requestId });
              return;
            }
          } catch {
            // Claim lookup failure — do not block (claim may not exist yet for new operations)
          }
        }
      }

      // Success — attach auth context and normalized user to request
      req.authContext = authCtx;
      // Attach the normalized user for downstream handlers
      (req as any).guardedUser = normalizedUser;
      (req as any).projectAccessContext = projectCtx;
      next();
    })().catch(() => {
      // Unexpected error — return opaque 403 + write audit trail
      const projectId = resolveProjectId(req);
      const targetResource = req.originalUrl || req.url || 'unknown';
      writeRejectionAuditRecord({
        actorUid: req.authContext?.uid || 'anonymous',
        attemptedAction: config.action,
        targetResource,
        denialReason: 'unexpected_error',
        requestId,
        httpStatus: 403,
        projectId,
      });
      res.status(403).json({
        error: 'Access denied',
        requestId,
      });
    });
  };
}
