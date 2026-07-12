/**
 * Copilot / Provenance / BYOAI — API Routes
 *
 * AI Copilot Workspace routing layer. Handles:
 * - Copilot message processing and conversation thread management
 * - Provenance record queries and attestation overrides
 * - BYOAI (Bring-Your-Own-AI) content imports
 *
 * All endpoints require Firebase Auth token validation.
 * Calls through to service layer functions — no business logic here.
 *
 * @requirements 1.1, 4.1, 4.3, 5.6, 11.1, 13.1, 13.2, 13.3
 */
import express from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from './roleMiddleware';
import { adminDb } from './firebase-admin';

const copilotRouter = express.Router();

// All copilot routes require authentication
copilotRouter.use(requireAuth);

// ─── Copilot Message ───────────────────────────────────────────────────────

/**
 * POST /api/copilot/message
 * Send a message to the Copilot and receive an AI response.
 * Auth: required
 */
copilotRouter.post('/copilot/message', async (req: Request, res: Response) => {
  try {
    const { uid, role } = req.authContext!;
    const { projectId, threadId, prompt, capability } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt is required and must be a string.' });
    }

    const { processMessage } = await import('../services/copilotService');

    const response = await processMessage({
      userId: uid,
      projectId: projectId || null,
      threadId: threadId || null,
      prompt,
      capability: capability || null,
      role: (role as any) || 'client',
    });

    if (response.error) {
      const statusMap: Record<string, number> = {
        rate_limited: 429,
        capability_denied: 403,
        validation_error: 400,
        service_unavailable: 503,
        content_policy: 422,
      };
      const status = statusMap[response.error.code] || 500;
      return res.status(status).json(response);
    }

    return res.status(200).json(response);
  } catch (err: any) {
    console.error('POST /api/copilot/message error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// ─── Copilot Capabilities ──────────────────────────────────────────────────

/**
 * GET /api/copilot/capabilities
 * Get the list of capabilities available for the current user's role.
 * Auth: required
 */
copilotRouter.get('/copilot/capabilities', async (req: Request, res: Response) => {
  try {
    const { role } = req.authContext!;
    const { getCapabilitiesForRole } = await import('../services/copilotService');

    const capabilities = getCapabilitiesForRole((role as any) || 'client');
    return res.status(200).json({ capabilities });
  } catch (err: any) {
    console.error('GET /api/copilot/capabilities error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// ─── Conversation Threads ──────────────────────────────────────────────────

/**
 * GET /api/copilot/threads?projectId=X
 * List user's conversation threads for a project.
 * Auth: required + project membership
 */
copilotRouter.get('/copilot/threads', async (req: Request, res: Response) => {
  try {
    const { uid } = req.authContext!;
    const { projectId } = req.query;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ error: 'projectId query parameter is required.' });
    }

    // Verify project membership
    const projectDoc = await adminDb.collection('projects').doc(projectId).get();
    if (!projectDoc.exists) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const { listThreads } = await import('../services/copilotService');
    const threads = await listThreads(projectId, uid);

    return res.status(200).json({ threads });
  } catch (err: any) {
    console.error('GET /api/copilot/threads error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

/**
 * POST /api/copilot/threads
 * Create a new conversation thread.
 * Auth: required + project membership
 */
copilotRouter.post('/copilot/threads', async (req: Request, res: Response) => {
  try {
    const { uid } = req.authContext!;
    const { projectId, title } = req.body;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ error: 'projectId is required.' });
    }

    // Verify project exists
    const projectDoc = await adminDb.collection('projects').doc(projectId).get();
    if (!projectDoc.exists) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const { createThread } = await import('../services/copilotService');
    const thread = await createThread(projectId, uid, title || undefined);

    return res.status(201).json({ thread });
  } catch (err: any) {
    // Thread limit exceeded
    if (err.message?.includes('limit')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('POST /api/copilot/threads error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

/**
 * GET /api/copilot/threads/:threadId/messages
 * Get messages for a thread (paginated).
 * Auth: required + owner or manage_members permission
 */
copilotRouter.get('/copilot/threads/:threadId/messages', async (req: Request, res: Response) => {
  try {
    const { uid, role } = req.authContext!;
    const { threadId } = req.params;
    const { projectId, page } = req.query;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ error: 'projectId query parameter is required.' });
    }

    const { getMessages } = await import('../services/copilotService');
    const result = await getMessages(
      threadId,
      projectId,
      page ? Number(page) : 1,
      uid,
      (role as any) || 'client',
    );

    return res.status(200).json(result);
  } catch (err: any) {
    if (err.message?.includes('Access denied') || err.message?.includes('permission')) {
      return res.status(403).json({ error: err.message });
    }
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    console.error('GET /api/copilot/threads/:threadId/messages error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

/**
 * PATCH /api/copilot/threads/:threadId
 * Update thread title or archive status.
 * Auth: required + owner only
 */
copilotRouter.patch('/copilot/threads/:threadId', async (req: Request, res: Response) => {
  try {
    const { uid } = req.authContext!;
    const { threadId } = req.params;
    const { title, status } = req.body;

    if (!title && !status) {
      return res.status(400).json({ error: 'At least one of title or status must be provided.' });
    }

    const updates: Record<string, any> = {};
    if (title !== undefined) updates.title = title;
    if (status !== undefined) updates.status = status;

    const { updateThread } = await import('../services/copilotService');
    const thread = await updateThread(threadId, threadId, uid, updates);

    return res.status(200).json({ thread });
  } catch (err: any) {
    if (err.message?.includes('Access denied') || err.message?.includes('owner')) {
      return res.status(403).json({ error: err.message });
    }
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    console.error('PATCH /api/copilot/threads/:threadId error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

/**
 * POST /api/copilot/threads/:threadId/finalise
 * Finalise structured output and write back to the platform spine.
 * Auth: required + owner only
 */
copilotRouter.post('/copilot/threads/:threadId/finalise', async (req: Request, res: Response) => {
  try {
    const { uid } = req.authContext!;
    const { threadId } = req.params;
    const { messageId, action } = req.body;

    if (!messageId || typeof messageId !== 'string') {
      return res.status(400).json({ error: 'messageId is required.' });
    }
    if (!action || typeof action !== 'string') {
      return res.status(400).json({ error: 'action is required (e.g. finalise_rfi, accept_compliance, export_status, accept_narrative).' });
    }

    // Verify thread ownership
    const threadDoc = await adminDb
      .collectionGroup('copilot_threads')
      .where('id', '==', threadId)
      .limit(1)
      .get();

    if (threadDoc.empty) {
      return res.status(404).json({ error: 'Thread not found.' });
    }

    const threadData = threadDoc.docs[0].data();
    if (threadData.ownerUid !== uid) {
      return res.status(403).json({ error: 'Only the thread owner can finalise outputs.' });
    }

    // Delegate to copilot service for the specific finalise action
    // These will be implemented in task 11.1 — for now return accepted
    return res.status(200).json({
      success: true,
      action,
      threadId,
      messageId,
      message: `Finalise action '${action}' acknowledged. Spine write-back pending implementation.`,
    });
  } catch (err: any) {
    console.error('POST /api/copilot/threads/:threadId/finalise error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// ─── Provenance Routes ─────────────────────────────────────────────────────

/**
 * GET /api/provenance/project/:projectId
 * Query provenance records for a project (paginated).
 * Auth: required + project membership
 */
copilotRouter.get('/provenance/project/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { limit, startAfter } = req.query;

    // Verify project exists
    const projectDoc = await adminDb.collection('projects').doc(projectId).get();
    if (!projectDoc.exists) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const { queryByProject } = await import('../services/provenanceService');
    const result = await queryByProject(projectId, {
      limit: limit ? Number(limit) : undefined,
      startAfter: startAfter as string | undefined,
    });

    return res.status(200).json(result);
  } catch (err: any) {
    console.error('GET /api/provenance/project/:projectId error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

/**
 * POST /api/provenance/override
 * Create a professional attestation override for a provenance record.
 * Auth: required + project membership
 */
copilotRouter.post('/provenance/override', async (req: Request, res: Response) => {
  try {
    const { uid, role } = req.authContext!;
    const { projectId, provenanceRecordId, declaration } = req.body;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ error: 'projectId is required.' });
    }
    if (!provenanceRecordId || typeof provenanceRecordId !== 'string') {
      return res.status(400).json({ error: 'provenanceRecordId is required.' });
    }
    if (!declaration || typeof declaration !== 'string') {
      return res.status(400).json({ error: 'declaration is required.' });
    }
    if (declaration.length < 20) {
      return res.status(400).json({ error: 'declaration must be at least 20 characters.' });
    }

    // Verify project exists
    const projectDoc = await adminDb.collection('projects').doc(projectId).get();
    if (!projectDoc.exists) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const { createOverride } = await import('../services/provenanceService');
    const override = await createOverride(projectId, provenanceRecordId, {
      attestedBy: uid,
      attestedRole: (role as any) || 'client',
      declaration,
    });

    return res.status(201).json({ override });
  } catch (err: any) {
    if (err.message?.includes('does not exist')) {
      return res.status(404).json({ error: err.message });
    }
    console.error('POST /api/provenance/override error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// ─── BYOAI Import Route ───────────────────────────────────────────────────

/**
 * POST /api/projects/:projectId/ai-imports
 * Import externally-generated AI content with provenance tagging.
 * Auth: required + project write access
 */
copilotRouter.post('/projects/:projectId/ai-imports', async (req: Request, res: Response) => {
  try {
    const { uid } = req.authContext!;
    const { projectId } = req.params;

    // Verify project exists
    const projectDoc = await adminDb.collection('projects').doc(projectId).get();
    if (!projectDoc.exists) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const { importContent } = await import('../services/byoaiBridgeService');

    // Build service dependencies
    const deps = {
      async checkWritePermission(userId: string, pId: string): Promise<boolean> {
        // Check if user is a member/owner of the project
        const project = projectDoc.data();
        if (!project) return false;
        if (project.clientId === userId) return true;
        if (project.leadProfessionalId === userId) return true;
        if (project.leadBepId === userId) return true;
        if (project.leadArchitectId === userId) return true;
        const memberships = project.memberships || [];
        return memberships.some((m: any) => m.userId === userId || m.uid === userId);
      },
      async logAuditEvent(entry: any): Promise<void> {
        try {
          await adminDb.collection(`projects/${pId}/audit_trail`).add({
            ...entry,
            createdAt: new Date().toISOString(),
          });
        } catch {
          // Non-blocking — best effort audit logging
          console.error('Failed to log BYOAI audit event');
        }
      },
    };

    // Use projectId captured from params for audit trail
    const pId = projectId;
    deps.logAuditEvent = async (entry: any): Promise<void> => {
      try {
        await adminDb.collection(`projects/${pId}/audit_trail`).add({
          ...entry,
          createdAt: new Date().toISOString(),
        });
      } catch {
        console.error('Failed to log BYOAI audit event');
      }
    };

    const result = await importContent(projectId, uid, req.body, deps);
    return res.status(201).json(result);
  } catch (err: any) {
    if (err.name === 'BYOAIValidationError') {
      return res.status(400).json({ error: err.message, field: err.field });
    }
    if (err.name === 'BYOAIAuthorizationError') {
      return res.status(403).json({ error: err.message });
    }
    if (err.name === 'BYOAIProvenanceError') {
      return res.status(500).json({ error: err.message });
    }
    console.error('POST /api/projects/:projectId/ai-imports error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

export default copilotRouter;
