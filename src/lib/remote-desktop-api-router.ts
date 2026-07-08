/**
 * Remote Desktop Core — Session Broker REST API Router
 *
 * Express 5 router providing all REST endpoints for the Session Broker component.
 * Mounted at /api/remote-desktop/ in the main api-router.ts.
 *
 * Handles: host registration/heartbeat, session token issuance, session lifecycle,
 * file manifest/approval, billing finalisation, and audit event queries.
 *
 * Requirements: 3.1, 4.1, 1.1, 2.4, 8.3, 11.3, 12.1
 */

import express from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';

import { requireAuth } from './roleMiddleware';
import {
  HardwareSpecsSchema,
  HostConfigurationSchema,
  RemoteDesktopAppSchema,
  SessionTokenPayloadSchema,
} from '../services/remoteDesktop/schemas';
import {
  generateSessionToken,
  validateSessionToken,
  revokeSessionToken,
  createSession,
  endSession,
  getSessionState,
  writeAuditEvent,
  queryAuditEvents,
  calculateBilling,
  getFileManifest,
  approveFileHandoff,
} from '../services/remoteDesktop/remoteDesktopService';

// ─── Request Validation Schemas ───────────────────────────────────────────────

const RegisterHostBodySchema = z.object({
  machineName: z.string().min(1).max(64),
  osVersion: z.string().min(1),
  hardwareSpecs: HardwareSpecsSchema,
  configuration: HostConfigurationSchema,
});

const HeartbeatBodySchema = z.object({
  status: z.enum(['online', 'offline', 'in_session']),
  cpuUtilisation: z.number().min(0).max(100),
  availableRamMb: z.number().min(0),
});

const UpdateAppsBodySchema = z.object({
  apps: z.array(
    z.object({
      displayName: z.string().min(1).max(128),
      executablePath: z.string().min(1).max(512),
      softwareCategory: z.string().min(1).max(64),
    }),
  ).min(1).max(20),
});

const GenerateTokenBodySchema = z.object({
  bookingId: z.string().min(1),
  consumerUid: z.string().min(1),
  hostId: z.string().min(1),
  windowStart: z.number().int(),
  windowEnd: z.number().int(),
  gracePeriodSeconds: z.number().int().min(60).max(1800),
});

const EndSessionBodySchema = z.object({
  reason: z.string().min(1).max(256),
});

const ApproveFilesBodySchema = z.object({
  approvedFileNames: z.array(z.string().min(1)).min(1),
});

const BillingBodySchema = z.object({
  billedDurationMinutes: z.number().int().min(1).max(1440),
  ownerApproved: z.boolean(),
});

const AuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// ─── Router ─────────────────────────────────────────────────────────────────────

const router = express.Router();

// All remote desktop routes require authentication
router.use(requireAuth);

// ─── Host Registration & Management ──────────────────────────────────────────

/**
 * POST /hosts/register
 * Register a new host machine with the platform.
 * Requirement: 1.1
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

    const { machineName, osVersion, hardwareSpecs, configuration } = parsed.data;
    const ownerUid = req.authContext!.uid;

    // TODO: Wire to Firestore write in remote_desktop_hosts collection
    const hostId = `host_${Date.now()}`;
    const host = {
      hostId,
      ownerUid,
      machineName,
      osVersion,
      hardwareSpecs,
      status: 'online' as const,
      lastHeartbeat: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
      registrationTimestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
      configuration,
    };

    return res.status(201).json(host);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * POST /hosts/:hostId/heartbeat
 * Receive heartbeat from a registered host.
 * Requirement: 1.2
 */
router.post('/hosts/:hostId/heartbeat', async (req: Request, res: Response) => {
  try {
    const { hostId } = req.params;
    if (!hostId) {
      return res.status(400).json({ error: 'Host ID is required' });
    }

    const parsed = HeartbeatBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { status, cpuUtilisation, availableRamMb } = parsed.data;

    // TODO: Update host record in Firestore, return latest config/allowlist
    const acknowledgement = {
      hostId,
      status,
      lastHeartbeat: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
      configVersion: 1,
      allowlistVersion: 1,
    };

    return res.status(200).json(acknowledgement);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * GET /hosts/:hostId/config
 * Get host configuration and current app allowlist.
 * Requirement: 1.4, 2.4
 */
router.get('/hosts/:hostId/config', async (req: Request, res: Response) => {
  try {
    const { hostId } = req.params;
    if (!hostId) {
      return res.status(400).json({ error: 'Host ID is required' });
    }

    // TODO: Fetch from Firestore remote_desktop_hosts + remote_desktop_apps
    const config = {
      hostId,
      configuration: {
        gracePeriodSeconds: 300,
        clipboardPolicy: 'disabled' as const,
        sessionWorkspacePath: `C:\\ArchitexSessions`,
        recordingEnabled: false,
      },
      apps: [] as Array<{ appId: string; displayName: string; executablePath: string; softwareCategory: string }>,
    };

    return res.status(200).json(config);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * PUT /hosts/:hostId/apps
 * Update the application allowlist for a host.
 * Requirement: 2.4
 */
router.put('/hosts/:hostId/apps', async (req: Request, res: Response) => {
  try {
    const { hostId } = req.params;
    if (!hostId) {
      return res.status(400).json({ error: 'Host ID is required' });
    }

    const parsed = UpdateAppsBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { apps } = parsed.data;
    const ownerUid = req.authContext!.uid;

    // TODO: Validate ownership, write to remote_desktop_apps collection
    const updatedApps = apps.map((app, idx) => ({
      appId: `app_${hostId}_${idx}`,
      hostId,
      ...app,
      validationStatus: 'valid' as const,
      lastValidatedTimestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    }));

    return res.status(200).json({ hostId, ownerUid, apps: updatedApps });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ─── Session Token ──────────────────────────────────────────────────────────────

/**
 * POST /sessions/token
 * Generate a session token for a confirmed booking.
 * Requirement: 3.1
 */
router.post('/sessions/token', async (req: Request, res: Response) => {
  try {
    const parsed = GenerateTokenBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { bookingId, consumerUid, hostId, windowStart, windowEnd, gracePeriodSeconds } = parsed.data;

    const tokenPayload = generateSessionToken(
      bookingId,
      consumerUid,
      hostId,
      windowStart,
      windowEnd,
      gracePeriodSeconds,
    );

    return res.status(201).json({
      sessionToken: tokenPayload,
      expiresAt: windowEnd + (gracePeriodSeconds * 1000),
    });
  } catch (err: any) {
    const statusCode = err.code === 'token_generation_failed' ? 500 :
                       err.code === 'awaiting_owner_confirmation' ? 403 :
                       err.code === 'booking_conflict' ? 409 :
                       err.code === 'booking_cancelled' ? 410 :
                       err.code === 'booking_expired' ? 410 : 500;
    return res.status(statusCode).json({
      error: err.message || 'Token generation failed',
      code: err.code || 'token_generation_failed',
      retryable: err.retryable ?? true,
    });
  }
});

// ─── Session Lifecycle ──────────────────────────────────────────────────────────

/**
 * GET /sessions/:sessionId
 * Get the current state of a session.
 * Requirement: 4.1
 */
router.get('/sessions/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const session = getSessionState(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    return res.status(200).json(session);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * POST /sessions/:sessionId/end
 * End an active session (voluntary disconnect or termination).
 * Requirement: 4.1
 */
router.post('/sessions/:sessionId/end', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const parsed = EndSessionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { reason } = parsed.data;
    const session = endSession(sessionId, reason);

    return res.status(200).json(session);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ─── File Manifest & Handoff ────────────────────────────────────────────────────

/**
 * GET /sessions/:sessionId/manifest
 * Get the file manifest for a session.
 * Requirement: 8.3
 */
router.get('/sessions/:sessionId/manifest', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const manifest = getFileManifest(sessionId);
    if (!manifest) {
      return res.status(404).json({ error: 'File manifest not found for this session' });
    }

    return res.status(200).json(manifest);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * POST /sessions/:sessionId/approve-files
 * Approve file handoff from the session workspace to FileManager.
 * Requirement: 8.3
 */
router.post('/sessions/:sessionId/approve-files', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const parsed = ApproveFilesBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { approvedFileNames } = parsed.data;
    const ownerUid = req.authContext!.uid;

    // TODO: Look up manifest by session, call approveFileHandoff service
    const manifest = approveFileHandoff(sessionId, approvedFileNames, ownerUid);

    return res.status(200).json(manifest);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ─── Billing ────────────────────────────────────────────────────────────────────

/**
 * POST /sessions/:sessionId/billing
 * Finalise billing for a completed session.
 * Requirement: 12.1
 */
router.post('/sessions/:sessionId/billing', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const parsed = BillingBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { billedDurationMinutes, ownerApproved } = parsed.data;

    // TODO: Wire to sessionBillingService
    const billingResult = calculateBilling(sessionId);

    return res.status(200).json({
      sessionId,
      billedDurationMinutes,
      ownerApproved,
      ...billingResult,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ─── Audit Events ───────────────────────────────────────────────────────────────

/**
 * GET /audit/:sessionId/events
 * Query audit events for a session (role-scoped access).
 * Requirement: 11.3
 */
router.get('/audit/:sessionId/events', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const parsed = AuditQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { limit, offset } = parsed.data;
    const actorUid = req.authContext!.uid;
    const actorRole = req.authContext!.role || 'unknown';

    const events = queryAuditEvents(sessionId, actorUid, actorRole, { limit, offset });

    return res.status(200).json({
      sessionId,
      events,
      pagination: { limit, offset, count: events.length },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ─── Export ─────────────────────────────────────────────────────────────────────

export default router;
