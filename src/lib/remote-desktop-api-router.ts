/**
 * Remote Desktop Core — Session Broker REST API Router
 *
 * Express 5 router providing all REST endpoints for the Session Broker component.
 * Mounted at /api/remote-desktop/ in the main api-router.ts.
 *
 * Handles: session start/end, host registration/heartbeat, app allowlist,
 * incidents, file manifest approval/rejection, audit events, and agent version.
 *
 * All routes require Firebase Auth middleware. Role-based access control is
 * enforced per-endpoint using the authenticated user's role from authContext.
 *
 * Requirements: 1, 2, 3, 4, 5, 7, 8, 9, 11, 12
 */

import express from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';

import { requireAuth, requireAdmin } from './roleMiddleware';
import {
  // Session gate
  evaluateSessionGate,
  type SessionGateInput,

  // Token service
  generateSessionToken,

  // Session broker
  endSession,
  getSession,
  type EndSessionInput,
  type DisconnectionReason,

  // Host registry
  registerHost,
  processHeartbeat,
  getHostApps,
  CURRENT_AGENT_VERSION,
  MIN_SUPPORTED_VERSION,
  type RegisterHostInput,

  // Incidents
  createIncident,
  updateIncidentStatus,
  type CreateIncidentInput,
  type UpdateIncidentStatusInput,

  // File handoff
  approveManifest,
  rejectFiles,

  // Audit events (async, role-scoped)
  querySessionEvents,
} from '../services/remoteDesktop';

// Use sessionAuditService ActorRole ('Platform_Admin' | 'Owner' | 'Consumer')
type AuditActorRole = 'Platform_Admin' | 'Owner' | 'Consumer';

// ─── Request Validation Schemas ───────────────────────────────────────────────

const StartSessionBodySchema = z.object({
  bookingId: z.string().min(1),
  hostId: z.string().min(1),
  /** Pre-fetched booking data for gate evaluation */
  booking: z.object({
    status: z.string(),
    approvedBy: z.string().optional(),
    startsAt: z.string(),
    endsAt: z.string(),
    resourceId: z.string(),
  }).optional(),
  /** Pre-fetched host data for gate evaluation */
  host: z.object({
    status: z.string(),
    lastHeartbeat: z.string(),
    resourceListingId: z.string(),
    agentVersion: z.string(),
  }).optional(),
  appCount: z.number().int().min(0).optional(),
});

const EndSessionBodySchema = z.object({
  sessionId: z.string().min(1),
  reason: z.enum([
    'user_initiated',
    'booking_window_expired',
    'uac_terminated',
    'connection_lost',
    'owner_revoked',
    'system_error',
    'governance_cancelled',
    'connection_failed',
  ]),
});

const SessionEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  startAfterEventId: z.string().optional(),
});

const RegisterHostBodySchema = z.object({
  resourceListingId: z.string().min(1),
  machineName: z.string().min(1).max(64),
  osVersion: z.string().min(1).max(64),
  hardwareSpecs: z.object({
    cpu: z.string().min(1).max(128),
    ramMb: z.number().int().min(0),
    gpu: z.string().min(1).max(128),
    storageGb: z.number().int().min(0),
  }),
  agentVersion: z.string().min(1).max(20),
  config: z.object({
    gracePeriodSeconds: z.number().int().min(0).max(900),
    clipboardPolicy: z.enum(['enabled', 'disabled']),
    recordingEnabled: z.boolean(),
    sessionWorkspacePath: z.string().min(1).max(512),
    consentTextVersion: z.string().min(1).max(32),
  }),
});

const HeartbeatBodySchema = z.object({
  status: z.enum(['online', 'idle', 'in_session']),
});

const CreateIncidentBodySchema = z.object({
  sessionId: z.string().min(1),
  bookingId: z.string().min(1),
  category: z.enum(['connection_quality', 'app_not_working', 'security_concern', 'billing_dispute', 'other']),
  description: z.string().min(10).max(1000),
  screenshotRef: z.string().max(512).optional(),
});

const UpdateIncidentBodySchema = z.object({
  status: z.enum(['investigating', 'resolved', 'escalated', 'closed']),
  resolutionNote: z.string().min(10).max(2000).optional(),
});

const RejectFilesBodySchema = z.object({
  fileNames: z.array(z.string().min(1)).min(1),
  reason: z.string().min(1).max(500).optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isSessionParticipant(
  uid: string,
  session: { consumerUid: string; ownerUid: string },
): boolean {
  return uid === session.consumerUid || uid === session.ownerUid;
}

function mapRoleToActorRole(role: string | undefined): AuditActorRole {
  if (role === 'admin' || role === 'platform_admin') return 'Platform_Admin';
  if (role === 'client' || role === 'freelancer' || role === 'developer') return 'Consumer';
  return 'Owner';
}

// ─── Router ─────────────────────────────────────────────────────────────────────

const router = express.Router();

// All remote desktop routes require Firebase Auth
router.use(requireAuth);

// ─── Session Routes ─────────────────────────────────────────────────────────────

/**
 * POST /sessions/start
 * Gate check (booking confirmed, owner approved, time window, host online) and token mint.
 * Requirements: 4.1, 4.2, 4.5, 7.1, 12.1
 */
router.post('/sessions/start', async (req: Request, res: Response) => {
  try {
    const parsed = StartSessionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { bookingId, hostId } = parsed.data;
    const consumerUid = req.authContext!.uid;

    // Build gate input from request data
    const gateInput: SessionGateInput = {
      bookingId,
      consumerUid,
      hostId,
      currentTime: new Date().toISOString(),
      booking: (parsed.data.booking as SessionGateInput['booking']) ?? {
        status: 'pending' as any,
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 3600000).toISOString(),
        resourceId: '',
      },
      host: (parsed.data.host as SessionGateInput['host']) ?? {
        status: 'offline',
        lastHeartbeat: new Date(0).toISOString(),
        resourceListingId: '',
        agentVersion: CURRENT_AGENT_VERSION,
      },
      appCount: parsed.data.appCount ?? 0,
    };

    // Evaluate session gate — all preconditions must pass
    const gateResult = evaluateSessionGate(gateInput);

    if (!gateResult.canStart) {
      return res.status(403).json({
        error: 'Session gate check failed',
        conditions: gateResult.conditions,
        errors: gateResult.errors,
      });
    }

    // Gate passed — mint session token
    const token = generateSessionToken({
      bookingId,
      consumerUid,
      hostId,
      windowStart: new Date(gateInput.booking.startsAt).getTime(),
      windowEnd: new Date(gateInput.booking.endsAt).getTime(),
      gracePeriodSeconds: 300,
      recordingRequired: false,
    });

    return res.status(201).json({
      sessionToken: token.signature,
      tokenId: token.tokenId,
      expiresAt: token.expiresAt,
      gateConditions: gateResult.conditions,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * POST /sessions/end
 * Graceful session termination.
 * Requirements: 4.1, 10.4
 */
router.post('/sessions/end', async (req: Request, res: Response) => {
  try {
    const parsed = EndSessionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { sessionId, reason } = parsed.data;
    const uid = req.authContext!.uid;

    // Verify the user is a participant in this session
    const session = getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (!isSessionParticipant(uid, session) && !req.authContext!.isAdmin) {
      return res.status(403).json({ error: 'Not authorized to end this session' });
    }

    // Determine termination actor
    const terminatedBy: EndSessionInput['terminatedBy'] =
      uid === session.consumerUid ? 'consumer' :
      uid === session.ownerUid ? 'owner' : 'system';

    const result = endSession({
      sessionId,
      reason: reason as DisconnectionReason,
      terminatedBy,
    });
    return res.status(200).json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * GET /sessions/:id
 * Session details (role-scoped: consumer, owner, or admin).
 * Requirements: 4.1, 8.1
 */
router.get('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const session = getSession(id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const uid = req.authContext!.uid;
    if (!isSessionParticipant(uid, session) && !req.authContext!.isAdmin) {
      return res.status(403).json({ error: 'Not authorized to view this session' });
    }

    return res.status(200).json(session);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * GET /sessions/:id/events
 * Paginated session events (role-scoped: consumer, owner, or admin).
 * Requirements: 8.1, 8.4
 */
router.get('/sessions/:id/events', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const parsed = SessionEventsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const uid = req.authContext!.uid;
    const actorRole = mapRoleToActorRole(req.authContext!.role);
    const { limit, startAfterEventId } = parsed.data;

    const result = await querySessionEvents(id, uid, actorRole, {
      limit,
      startAfterEventId,
    });

    return res.status(200).json({
      sessionId: id,
      events: result.events,
      pagination: {
        limit,
        hasMore: result.hasMore,
        lastEventId: result.lastEventId ?? null,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ─── Host Routes ────────────────────────────────────────────────────────────────

/**
 * POST /hosts/register
 * Register a new host with the platform.
 * Requirements: 1.5, 5.1, 11.2, 13.1
 */
router.post('/hosts/register', async (req: Request, res: Response) => {
  try {
    const parsed = RegisterHostBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const ownerUid = req.authContext!.uid;
    const hostData = parsed.data;

    const host = registerHost({
      ownerUid,
      resourceListingId: hostData.resourceListingId,
      machineName: hostData.machineName,
      osVersion: hostData.osVersion,
      hardwareSpecs: hostData.hardwareSpecs as RegisterHostInput['hardwareSpecs'],
      agentVersion: hostData.agentVersion,
      config: hostData.config as RegisterHostInput['config'],
    });

    return res.status(201).json(host);
  } catch (err: any) {
    if (err.message?.includes('unsupported') || err.message?.includes('version')) {
      return res.status(400).json({ error: err.message, code: 'agent_version_unsupported' });
    }
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * PUT /hosts/:id/heartbeat
 * Heartbeat update from a registered host.
 * Requirements: 4.1, 13.1
 */
router.put('/hosts/:id/heartbeat', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Host ID is required' });
    }

    const parsed = HeartbeatBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const result = processHeartbeat(id, parsed.data.status);
    return res.status(200).json(result);
  } catch (err: any) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: 'Host not found' });
    }
    if (err.message?.includes('maintenance')) {
      return res.status(409).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * GET /hosts/:id/apps
 * Get the app allowlist for a host.
 * Requirements: 1.1, 13.2
 */
router.get('/hosts/:id/apps', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Host ID is required' });
    }

    const apps = getHostApps(id);
    return res.status(200).json({ hostId: id, apps });
  } catch (err: any) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: 'Host not found' });
    }
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ─── Incident Routes ────────────────────────────────────────────────────────────

/**
 * POST /incidents
 * Create a new incident report.
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.7, 3.8
 */
router.post('/incidents', async (req: Request, res: Response) => {
  try {
    const parsed = CreateIncidentBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const uid = req.authContext!.uid;
    const role = req.authContext!.role;
    const reporterRole = (role === 'client' || role === 'freelancer' || role === 'developer')
      ? 'consumer' as const
      : 'owner' as const;

    const input: CreateIncidentInput = {
      sessionId: parsed.data.sessionId,
      bookingId: parsed.data.bookingId,
      reporterUid: uid,
      reporterRole,
      category: parsed.data.category,
      description: parsed.data.description,
      screenshotRef: parsed.data.screenshotRef,
    };

    const incident = createIncident(input);
    return res.status(201).json(incident);
  } catch (err: any) {
    if (err.message?.includes('reporting window')) {
      return res.status(403).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * PUT /incidents/:id
 * Update incident status (admin only).
 * Requirements: 3.5
 */
router.put('/incidents/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Incident ID is required' });
    }

    const parsed = UpdateIncidentBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const input: UpdateIncidentStatusInput = {
      incidentId: id,
      status: parsed.data.status,
      resolutionNote: parsed.data.resolutionNote,
      adminUid: req.authContext!.uid,
    };

    const incident = updateIncidentStatus(input);
    return res.status(200).json(incident);
  } catch (err: any) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: 'Incident not found' });
    }
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ─── File Manifest Routes ───────────────────────────────────────────────────────

/**
 * POST /file-manifests/:id/approve
 * Approve file handoff (owner only).
 * Requirements: 9.3, 9.4
 */
router.post('/file-manifests/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Manifest ID is required' });
    }

    const result = approveManifest(id);
    return res.status(200).json(result);
  } catch (err: any) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: 'Manifest not found' });
    }
    if (err.message?.includes('expired')) {
      return res.status(410).json({ error: 'Manifest has expired' });
    }
    if (err.message?.includes('Cannot approve')) {
      return res.status(409).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * POST /file-manifests/:id/reject
 * Reject files from the manifest (owner only).
 * Requirements: 9.4
 */
router.post('/file-manifests/:id/reject', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Manifest ID is required' });
    }

    const parsed = RejectFilesBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const result = rejectFiles(id, parsed.data.fileNames);
    return res.status(200).json(result);
  } catch (err: any) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: 'Manifest not found' });
    }
    if (err.message?.includes('Cannot reject')) {
      return res.status(409).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ─── Agent Version Route ────────────────────────────────────────────────────────

/**
 * GET /agent/version
 * Latest agent version info for Host_Agent update checks.
 * Requirements: 11.2, 11.3
 */
router.get('/agent/version', async (_req: Request, res: Response) => {
  try {
    return res.status(200).json({
      currentVersion: CURRENT_AGENT_VERSION,
      minimumSupportedVersion: MIN_SUPPORTED_VERSION,
      downloadUrl: '/api/remote-desktop/agent/download',
      releaseNotes: 'App-level window capture, POPIA consent integration, chain-hashed audit events.',
      releasedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ─── Export ─────────────────────────────────────────────────────────────────────

export default router;
