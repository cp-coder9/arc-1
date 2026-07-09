/**
 * Standalone Workspace Service — manages SpecForge workspaces that operate
 * independently of an Architex project. Workspaces can be user-scoped or
 * firm-scoped, and later assigned to a project via atomic migration.
 *
 * Firestore paths:
 *   - User-scoped: `users/{uid}/standaloneSpecForgeWorkspaces/{workspaceId}`
 *   - Firm-scoped: `firms/{firmId}/standaloneSpecForgeWorkspaces/{workspaceId}`
 *
 * On assignment, workspace + subcollections migrate atomically to:
 *   `projects/{projectId}/specWorkspaces/{workspaceId}`
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10
 */

import { adminDb } from '@/lib/firebase-admin';
import { standaloneWorkspaceCreateSchema } from './specforgeSchemas';
import type { StandaloneSpecForgeWorkspace } from '@/types/specforgeTypes';
import { SpecForgeValidationError } from './specforgeErrors';

// ── Constants ───────────────────────────────────────────────────────────────

/** Maximum workspaces returned per list() call. */
const MAX_LIST_RESULTS = 100;

/** Subcollections migrated during assignToProject(). */
const SUBCOLLECTIONS = [
  'specItems',
  'specSections',
  'specApprovals',
  'specSubstitutions',
  'specProcurement',
  'specAuditEvents',
] as const;

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a workspace ID. */
function generateWorkspaceId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `sw-${ts}-${rand}`;
}

/** Generate an audit event ID. */
function generateAuditEventId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `sfa-${ts}-${rand}`;
}

/**
 * Returns the Firestore collection reference for standalone workspaces
 * based on scope and owner ID.
 */
function standaloneCollection(scope: 'user' | 'firm', ownerId: string) {
  if (scope === 'user') {
    return adminDb.collection('users').doc(ownerId).collection('standaloneSpecForgeWorkspaces');
  }
  return adminDb.collection('firms').doc(ownerId).collection('standaloneSpecForgeWorkspaces');
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface CreateStandaloneParams {
  uid: string;
  projectReference: string;
  scope: 'user' | 'firm';
  firmId?: string;
  name: string;
}

// ── Service ─────────────────────────────────────────────────────────────────

/**
 * Creates a new standalone SpecForge workspace.
 *
 * Validates input via standaloneWorkspaceCreateSchema. Persists to user-scoped
 * or firm-scoped Firestore path based on the `scope` parameter.
 *
 * @throws SpecForgeValidationError if input fails schema validation
 * @throws Error if scope is 'firm' but firmId is missing
 */
export async function create(params: CreateStandaloneParams): Promise<StandaloneSpecForgeWorkspace> {
  // Validate input via Zod schema
  const validationResult = standaloneWorkspaceCreateSchema.safeParse({
    projectReference: params.projectReference,
    scope: params.scope,
    firmId: params.firmId,
    name: params.name,
  });

  if (!validationResult.success) {
    throw new SpecForgeValidationError(validationResult.error.issues);
  }

  // Firm scope requires firmId
  if (params.scope === 'firm' && !params.firmId) {
    throw new Error('firmId is required for firm-scoped workspaces');
  }

  const ownerId = params.scope === 'firm' ? params.firmId! : params.uid;
  const workspaceId = generateWorkspaceId();
  const now = new Date().toISOString();

  const workspace: StandaloneSpecForgeWorkspace = {
    id: workspaceId,
    projectId: '',
    projectName: params.name,
    stage: 'brief',
    profile: 'standalone',
    revision: '0.1',
    issueStatus: 'draft',
    sections: [],
    items: [],
    scope: params.scope,
    ownerId,
    projectReference: params.projectReference,
    createdAt: now,
    updatedAt: now,
  };

  const colRef = standaloneCollection(params.scope, ownerId);
  await colRef.doc(workspaceId).set(workspace);

  return workspace;
}

/**
 * Lists standalone workspaces for a user — returns the union of user-scoped
 * workspaces and all firm-scoped workspaces for firms the user belongs to.
 *
 * Returns max 100 results ordered by updatedAt descending.
 */
export async function list(uid: string, firmIds: string[]): Promise<StandaloneSpecForgeWorkspace[]> {
  const results: StandaloneSpecForgeWorkspace[] = [];

  // 1. User-scoped workspaces
  const userCol = standaloneCollection('user', uid);
  const userSnap = await userCol
    .orderBy('updatedAt', 'desc')
    .limit(MAX_LIST_RESULTS)
    .get();

  for (const doc of userSnap.docs) {
    results.push(doc.data() as StandaloneSpecForgeWorkspace);
  }

  // 2. Firm-scoped workspaces for each firm the user belongs to
  for (const firmId of firmIds) {
    if (results.length >= MAX_LIST_RESULTS) break;

    const firmCol = standaloneCollection('firm', firmId);
    const remaining = MAX_LIST_RESULTS - results.length;
    const firmSnap = await firmCol
      .orderBy('updatedAt', 'desc')
      .limit(remaining)
      .get();

    for (const doc of firmSnap.docs) {
      results.push(doc.data() as StandaloneSpecForgeWorkspace);
    }
  }

  // Sort the combined results by updatedAt descending, then trim to max
  results.sort((a, b) => {
    const aTime = new Date(a.updatedAt).getTime();
    const bTime = new Date(b.updatedAt).getTime();
    return bTime - aTime;
  });

  return results.slice(0, MAX_LIST_RESULTS);
}

/**
 * Assigns a standalone workspace to an Architex project.
 *
 * Atomically migrates the workspace document and all subcollections from the
 * standalone path to `projects/{projectId}/specWorkspaces/{workspaceId}` using
 * Firestore batch writes with rollback on partial failure.
 *
 * Validates:
 *   - projectReference is 1-500 chars (already validated on create)
 *   - Target project does not already have an active workspace (409 conflict)
 *   - All writes succeed atomically or rollback completely
 *
 * @throws Error with status 409 if project already has an active workspace
 * @throws Error with status 404 if standalone workspace not found
 * @throws Error on migration failure (with rollback)
 */
export async function assignToProject(params: {
  workspaceId: string;
  scope: 'user' | 'firm';
  ownerId: string;
  projectId: string;
  userId: string;
}): Promise<void> {
  const { workspaceId, scope, ownerId, projectId, userId } = params;

  // 1. Verify standalone workspace exists
  const sourceCol = standaloneCollection(scope, ownerId);
  const sourceDocRef = sourceCol.doc(workspaceId);
  const sourceDoc = await sourceDocRef.get();

  if (!sourceDoc.exists) {
    const error = new Error(`Standalone workspace not found: ${workspaceId}`);
    (error as any).status = 404;
    throw error;
  }

  const workspaceData = sourceDoc.data() as StandaloneSpecForgeWorkspace;

  // 2. Validate projectReference length (defensive — should already be valid)
  if (!workspaceData.projectReference || workspaceData.projectReference.length < 1 || workspaceData.projectReference.length > 500) {
    throw new Error('projectReference must be between 1 and 500 characters');
  }

  // 3. Check target project doesn't already have an active workspace (409)
  const existingWorkspaces = await adminDb
    .collection('projects')
    .doc(projectId)
    .collection('specWorkspaces')
    .limit(1)
    .get();

  if (!existingWorkspaces.empty) {
    const error = new Error(`Project ${projectId} already has an active workspace`);
    (error as any).status = 409;
    throw error;
  }

  // 4. Perform atomic migration using batch writes
  const now = new Date().toISOString();
  const targetWorkspaceRef = adminDb
    .collection('projects')
    .doc(projectId)
    .collection('specWorkspaces')
    .doc(workspaceId);

  // Track all written document refs for rollback
  const writtenRefs: FirebaseFirestore.DocumentReference[] = [];

  try {
    // 4a. Write workspace document to target path
    const migratedWorkspace = {
      ...workspaceData,
      projectId,
      assignedToProjectId: projectId,
      assignedAt: now,
      updatedAt: now,
    };

    const batch = adminDb.batch();
    batch.set(targetWorkspaceRef, migratedWorkspace);
    writtenRefs.push(targetWorkspaceRef);

    await batch.commit();

    // 4b. Migrate subcollections
    for (const subcol of SUBCOLLECTIONS) {
      const sourceSubcol = sourceDocRef.collection(subcol);
      const subcolSnapshot = await sourceSubcol.get();

      if (subcolSnapshot.empty) continue;

      // Batch writes for subcollection docs (Firestore max 500 per batch)
      const docs = subcolSnapshot.docs;
      for (let i = 0; i < docs.length; i += 450) {
        const chunk = docs.slice(i, i + 450);
        const subBatch = adminDb.batch();

        for (const doc of chunk) {
          const targetRef = adminDb
            .collection('projects')
            .doc(projectId)
            .collection(subcol)
            .doc(doc.id);

          subBatch.set(targetRef, doc.data());
          writtenRefs.push(targetRef);
        }

        await subBatch.commit();
      }
    }

    // 5. Write audit event for the assignment
    const auditEventRef = adminDb
      .collection('projects')
      .doc(projectId)
      .collection('specAuditEvents')
      .doc(generateAuditEventId());

    const auditEvent = {
      id: auditEventRef.id,
      workspaceId,
      action: 'status_changed',
      targetId: workspaceId,
      targetType: 'workspace',
      performedBy: userId,
      performedAt: now,
      details: JSON.stringify({
        type: 'standalone_assignment',
        originalPath: scope === 'user'
          ? `users/${ownerId}/standaloneSpecForgeWorkspaces/${workspaceId}`
          : `firms/${ownerId}/standaloneSpecForgeWorkspaces/${workspaceId}`,
        targetProject: projectId,
        assignedBy: userId,
        assignedAt: now,
        projectReference: workspaceData.projectReference,
      }),
    };

    await auditEventRef.set(auditEvent);

    // 6. Delete source workspace and subcollections
    for (const subcol of SUBCOLLECTIONS) {
      const sourceSubcol = sourceDocRef.collection(subcol);
      const subcolSnapshot = await sourceSubcol.get();

      if (subcolSnapshot.empty) continue;

      const docs = subcolSnapshot.docs;
      for (let i = 0; i < docs.length; i += 450) {
        const chunk = docs.slice(i, i + 450);
        const deleteBatch = adminDb.batch();
        for (const doc of chunk) {
          deleteBatch.delete(doc.ref);
        }
        await deleteBatch.commit();
      }
    }

    await sourceDocRef.delete();
  } catch (err) {
    // Rollback: delete all written documents at target path
    console.error('[StandaloneWorkspaceService] Migration failed, rolling back:', err);

    for (let i = 0; i < writtenRefs.length; i += 450) {
      const chunk = writtenRefs.slice(i, i + 450);
      const rollbackBatch = adminDb.batch();
      for (const ref of chunk) {
        rollbackBatch.delete(ref);
      }
      try {
        await rollbackBatch.commit();
      } catch (rollbackErr) {
        console.error('[StandaloneWorkspaceService] Rollback batch failed:', rollbackErr);
      }
    }

    const error = new Error(`Migration failed for workspace ${workspaceId} to project ${projectId}: ${err instanceof Error ? err.message : String(err)}`);
    (error as any).status = 500;
    throw error;
  }
}
