/**
 * ITP Service — Inspection Test Plans
 *
 * Core service for creating, managing, and evaluating Inspection Test Plans
 * and their associated inspection items within Module 7 (Site Execution).
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  orderBy,
  where,
  runTransaction,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import { getDemoDoc, getDemoCol } from '@/demo-seed/demoFirestore';
import {
  createITPSchema,
  createInspectionItemSchema,
  specificationReferenceSchema,
  holdPointRequestSchema,
  inspectionSignOffSchema,
  witnessPointOutcomeSchema,
  createTestingScheduleSchema,
  updateTestingScheduleSchema,
  recordLabResultSchema,
} from '@/lib/schemas';
import { createNcr, getNcrs } from '@/services/ncrService';
import {
  createHoldPointRequestEvent,
  createWitnessNotificationEvent,
  createHoldPointBreachEvent,
  createTestFailureEvent,
  mapInspectorRoleToAssignedRoles,
  buildBreachAssignedRoles,
  buildTestAssignedRoles,
  persistActionCentreEvent,
} from '@/services/itpActionCentreAdapter';
import { persistITPProjectRecord, refreshITPPassportContribution } from '@/services/itpPassportAdapter';
import type { Severity } from '@/types';
import type {
  ITP,
  ITPStatus,
  ITPInspectionItem,
  InspectionItemStatus,
  ConstructionStage,
  ITPAuditRecord,
  ITPAuditAction,
  InspectionRequest,
  SignOffRecord,
  SelfInspectionRecord,
  WitnessAttendanceRecord,
  ConditionalFollowUp,
  InspectorRole,
  TestingSchedule,
  MaterialTest,
  MaterialTestStatus,
  MaterialType,
  SANSTestCategory,
  LabResult,
} from '@/types';

// ── Constants ────────────────────────────────────────────────────────────────

const PROJECTS_COL = 'projects';
const ITPS_COL = 'itps';
const ITEMS_COL = 'items';
const AUDIT_COL = 'itp_audit';
const INSPECTION_REQUESTS_COL = 'inspection_requests';
const TESTING_SCHEDULES_COL = 'testing_schedules';
const MATERIAL_TESTS_COL = 'material_tests';
const MAX_ITEMS_PER_ITP = 200;
const HOLD_POINT_MIN_NOTICE_HOURS = 24;
const MAX_CONDITIONS_LENGTH = 2000;
const MIN_DEADLINE_DAYS = 1;
const MAX_DEADLINE_DAYS = 30;

// ── Error Types ──────────────────────────────────────────────────────────────

export type ITPErrorCode =
  | 'validation_error'
  | 'invalid_state_transition'
  | 'max_items_exceeded'
  | 'not_found'
  | 'invalid_reorder'
  | 'unit_mismatch'
  | 'lab_not_accredited'
  | 'duplicate_lab_report'
  | 'permission_denied';

export interface ITPError {
  code: ITPErrorCode;
  message: string;
  fields?: Record<string, string>;
}

export class ITPServiceError extends Error {
  code: ITPErrorCode;
  fields?: Record<string, string>;

  constructor(code: ITPErrorCode, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'ITPServiceError';
    this.code = code;
    this.fields = fields;
  }
}

// ── Permission Enforcement ────────────────────────────────────────────────────

/**
 * ITP permission identifiers.
 * Maps each action to the platform roles that are allowed to perform it.
 */
export type ITPPermission =
  | 'itp:create'
  | 'itp:approve'
  | 'itp:read'
  | 'inspection:request'
  | 'inspection:sign_off'
  | 'test:record_result';

/**
 * Permission matrix: maps each ITP permission to the platform roles that grant it.
 */
const ITP_PERMISSION_MATRIX: Record<ITPPermission, string[]> = {
  'itp:create': ['engineer', 'architect'],
  'itp:approve': ['engineer', 'architect'],
  'itp:read': [
    'site_manager', 'contractor', 'subcontractor', 'engineer', 'architect',
    'quantity_surveyor', 'client', 'developer',
  ],
  'inspection:request': ['site_manager', 'contractor', 'subcontractor', 'quantity_surveyor'],
  'inspection:sign_off': ['engineer', 'architect'],
  'test:record_result': ['engineer', 'site_manager'],
};

/**
 * Represents a user's project membership for permission checks.
 */
export interface ITPProjectMembership {
  userId: string;
  projectId: string;
  role: string;
  status: 'active' | 'inactive' | 'removed';
}

/**
 * Checks whether a user has the required ITP permission for a given project.
 *
 * Validation flow:
 * 1. Validates user holds a qualifying platform role for the permission
 * 2. Validates user has active project membership
 *
 * @returns `{ allowed: true }` if permission is granted
 * @throws `ITPServiceError` with code 'permission_denied' if denied
 */
export function checkITPPermission(
  userId: string,
  projectId: string,
  permission: ITPPermission,
  userRole: string,
  projectMemberships: ITPProjectMembership[],
): { allowed: true } {
  // 1. Check if user has active membership on the target project
  const activeMembership = projectMemberships.find(
    (m) => m.userId === userId && m.projectId === projectId && m.status === 'active',
  );

  if (!activeMembership) {
    throw new ITPServiceError(
      'permission_denied',
      'User is not a member of the target project',
    );
  }

  // 2. Check if the user's role qualifies for the requested permission
  const allowedRoles = ITP_PERMISSION_MATRIX[permission];
  if (!allowedRoles || !allowedRoles.includes(userRole)) {
    throw new ITPServiceError(
      'permission_denied',
      `Missing required permission: ${permission}`,
      { permission },
    );
  }

  return { allowed: true };
}

/**
 * Permission context to pass to ITP service operations.
 * When provided, the service enforces role-based access control.
 * When omitted (e.g., system-triggered operations), permission checks are skipped.
 */
export interface ITPPermissionContext {
  userId: string;
  userRole: string;
  projectMemberships: ITPProjectMembership[];
}

/**
 * Internal helper: enforces permission if context is provided.
 */
function enforcePermission(
  projectId: string,
  permission: ITPPermission,
  permCtx?: ITPPermissionContext,
): void {
  if (!permCtx) return; // Skip for system/internal calls
  checkITPPermission(permCtx.userId, projectId, permission, permCtx.userRole, permCtx.projectMemberships);
}

// ── Firestore Helpers ────────────────────────────────────────────────────────

function itpCollection(projectId: string) {
  return getDemoCol(PROJECTS_COL, projectId, ITPS_COL);
}

function itpDocument(projectId: string, itpId: string) {
  return getDemoDoc(PROJECTS_COL, projectId, ITPS_COL, itpId);
}

function itemsCollection(projectId: string, itpId: string) {
  return getDemoCol(PROJECTS_COL, projectId, ITPS_COL, itpId, ITEMS_COL);
}

function itemDocument(projectId: string, itpId: string, itemId: string) {
  return getDemoDoc(PROJECTS_COL, projectId, ITPS_COL, itpId, ITEMS_COL, itemId);
}

function auditCollection(projectId: string) {
  return getDemoCol(PROJECTS_COL, projectId, AUDIT_COL);
}

function inspectionRequestsCollection(projectId: string) {
  return getDemoCol(PROJECTS_COL, projectId, INSPECTION_REQUESTS_COL);
}

function testingSchedulesCollection(projectId: string) {
  return getDemoCol(PROJECTS_COL, projectId, TESTING_SCHEDULES_COL);
}

function testingScheduleDocument(projectId: string, scheduleId: string) {
  return getDemoDoc(PROJECTS_COL, projectId, TESTING_SCHEDULES_COL, scheduleId);
}

function materialTestsCollection(projectId: string) {
  return getDemoCol(PROJECTS_COL, projectId, MATERIAL_TESTS_COL);
}

function materialTestDocument(projectId: string, testId: string) {
  return getDemoDoc(PROJECTS_COL, projectId, MATERIAL_TESTS_COL, testId);
}

function labResultsCollection(projectId: string, testId: string) {
  return getDemoCol(PROJECTS_COL, projectId, MATERIAL_TESTS_COL, testId, 'results');
}

// ── Audit Helper ─────────────────────────────────────────────────────────────

async function writeAuditRecord(
  projectId: string,
  entityType: ITPAuditRecord['entityType'],
  entityId: string,
  action: ITPAuditAction,
  actorUserId: string,
  previousState: Record<string, unknown>,
  newState: Record<string, unknown>,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const record: Omit<ITPAuditRecord, 'id'> = {
    projectId,
    entityType,
    entityId,
    action,
    actorUserId,
    timestamp: new Date().toISOString(),
    previousState,
    newState,
    metadata,
  };
  // Regulated mutations must not report success without durable audit evidence.
  await addDoc(auditCollection(projectId), record);
}

// ── Internal Helpers ─────────────────────────────────────────────────────────

async function getITPOrThrow(projectId: string, itpId: string): Promise<ITP> {
  try {
    const snap = await getDoc(itpDocument(projectId, itpId));
    if (!snap.exists()) {
      throw new ITPServiceError('not_found', `ITP ${itpId} not found in project ${projectId}`);
    }
    return { id: snap.id, ...snap.data() } as ITP;
  } catch (error) {
    if (error instanceof ITPServiceError) throw error;
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${ITPS_COL}/${itpId}`);
    throw error; // unreachable but satisfies TS
  }
}

function assertDraftStatus(itp: ITP): void {
  if (itp.status !== 'draft') {
    throw new ITPServiceError(
      'invalid_state_transition',
      `ITP must be in draft status to modify inspection items. Current status: ${itp.status}`,
    );
  }
}

async function getItemCount(projectId: string, itpId: string): Promise<number> {
  const snap = await getDocs(itemsCollection(projectId, itpId));
  return snap.size;
}

export async function getAllItems(projectId: string, itpId: string): Promise<ITPInspectionItem[]> {
  const snap = await getDocs(
    query(itemsCollection(projectId, itpId), orderBy('sequenceNumber', 'asc')),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ITPInspectionItem));
}

// ── ITP CRUD Operations ──────────────────────────────────────────────────────

export interface CreateITPInput {
  projectId: string;
  title: string;
  description?: string;
  constructionStage: ConstructionStage;
  createdBy: string;
}

/**
 * Creates a new ITP in draft status with revisionNumber=1.
 * Validates input via createITPSchema.
 */
export async function createITP(input: CreateITPInput, permCtx?: ITPPermissionContext): Promise<string> {
  // Permission enforcement: itp:create → engineer, architect
  enforcePermission(input.projectId, 'itp:create', permCtx);

  const parsed = createITPSchema.safeParse({
    projectId: input.projectId,
    title: input.title,
    description: input.description ?? '',
    constructionStage: input.constructionStage,
  });

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    parsed.error.errors.forEach((e) => {
      fields[e.path.join('.')] = e.message;
    });
    throw new ITPServiceError('validation_error', 'Invalid ITP input', fields);
  }

  const now = new Date().toISOString();
  const itpData: Omit<ITP, 'id'> = {
    projectId: parsed.data.projectId,
    title: parsed.data.title,
    description: parsed.data.description,
    constructionStage: parsed.data.constructionStage,
    revisionNumber: 1,
    status: 'draft',
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
  };

  try {
    const ref = await addDoc(itpCollection(input.projectId), itpData);
    await writeAuditRecord(
      input.projectId, 'itp', ref.id, 'itp_created',
      input.createdBy, {}, itpData as unknown as Record<string, unknown>,
    );
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${input.projectId}/${ITPS_COL}`);
    throw error;
  }
}

/**
 * Retrieves a single ITP by ID.
 */
export async function getITP(projectId: string, itpId: string, permCtx?: ITPPermissionContext): Promise<ITP> {
  // Permission enforcement: itp:read → all project members
  enforcePermission(projectId, 'itp:read', permCtx);

  return getITPOrThrow(projectId, itpId);
}

export interface ITPFilters {
  status?: ITPStatus;
  constructionStage?: ConstructionStage;
}

/**
 * Retrieves all ITPs for a project with optional filters.
 */
export async function getITPs(projectId: string, filters?: ITPFilters, permCtx?: ITPPermissionContext): Promise<ITP[]> {
  // Permission enforcement: itp:read → all project members
  enforcePermission(projectId, 'itp:read', permCtx);

  try {
    let q = query(itpCollection(projectId), orderBy('createdAt', 'desc'));

    if (filters?.status) {
      q = query(itpCollection(projectId), where('status', '==', filters.status), orderBy('createdAt', 'desc'));
    }

    const snap = await getDocs(q);
    let results = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ITP));

    if (filters?.constructionStage) {
      results = results.filter((itp) => itp.constructionStage === filters.constructionStage);
    }

    // Exclude soft-deleted
    results = results.filter((itp) => !itp.isDeleted);

    return results;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${PROJECTS_COL}/${projectId}/${ITPS_COL}`);
    throw error;
  }
}

/**
 * Updates an ITP (draft only).
 */
export async function updateITP(
  projectId: string,
  itpId: string,
  updates: { title?: string; description?: string },
  actorUserId: string,
  permCtx?: ITPPermissionContext,
): Promise<void> {
  // Permission enforcement: itp:create → engineer, architect (same as create for write access)
  enforcePermission(projectId, 'itp:create', permCtx);

  const itp = await getITPOrThrow(projectId, itpId);
  assertDraftStatus(itp);

  if (updates.title !== undefined && (updates.title.length < 1 || updates.title.length > 200)) {
    throw new ITPServiceError('validation_error', 'Title must be 1-200 characters', { title: 'Must be 1-200 characters' });
  }
  if (updates.description !== undefined && updates.description.length > 2000) {
    throw new ITPServiceError('validation_error', 'Description must be at most 2000 characters', { description: 'Max 2000 characters' });
  }

  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = { updatedAt: now };
  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.description !== undefined) updateData.description = updates.description;

  try {
    await updateDoc(itpDocument(projectId, itpId), updateData);
    await writeAuditRecord(
      projectId, 'itp', itpId, 'itp_updated',
      actorUserId,
      { title: itp.title, description: itp.description },
      updateData,
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${ITPS_COL}/${itpId}`);
  }
}

/**
 * Soft-deletes an ITP (draft only). Approved/in_progress ITPs cannot be deleted.
 */
export async function deleteITP(projectId: string, itpId: string, actorUserId: string, permCtx?: ITPPermissionContext): Promise<void> {
  // Permission enforcement: itp:create → engineer, architect (same as create for write access)
  enforcePermission(projectId, 'itp:create', permCtx);

  const itp = await getITPOrThrow(projectId, itpId);

  if (itp.status === 'approved' || itp.status === 'in_progress') {
    throw new ITPServiceError(
      'invalid_state_transition',
      `Cannot delete an ITP with status '${itp.status}'. Only draft ITPs can be deleted.`,
    );
  }

  assertDraftStatus(itp);

  const now = new Date().toISOString();
  try {
    await updateDoc(itpDocument(projectId, itpId), {
      isDeleted: true,
      status: 'deleted',
      updatedAt: now,
    });
    await writeAuditRecord(
      projectId, 'itp', itpId, 'itp_deleted',
      actorUserId,
      { status: itp.status, isDeleted: false },
      { status: 'deleted', isDeleted: true },
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${ITPS_COL}/${itpId}`);
  }
}

// ── Approve ITP Operation ─────────────────────────────────────────────────────

export interface ApproveITPInput {
  projectId: string;
  itpId: string;
  approverUserId: string;
  approverRole: 'engineer' | 'architect';
  professionalRegistration?: string;
}

/**
 * Approves an ITP — transitions from draft to approved.
 * - ITP must be in 'draft' status
 * - Requires sign-off from a user holding the engineer or architect role
 * - Records approval sign-off record and updates ITP status
 */
export async function approveITP(
  input: ApproveITPInput,
  permCtx?: ITPPermissionContext,
): Promise<void> {
  // Permission enforcement: itp:approve → engineer, architect
  enforcePermission(input.projectId, 'itp:approve', permCtx);

  const itp = await getITPOrThrow(input.projectId, input.itpId);

  if (itp.status !== 'draft') {
    throw new ITPServiceError(
      'invalid_state_transition',
      `Cannot approve ITP with status '${itp.status}'. ITP must be in draft status.`,
    );
  }

  const now = new Date().toISOString();
  const signOffRecord: SignOffRecord = {
    inspectorUserId: input.approverUserId,
    inspectorRole: input.approverRole,
    professionalRegistration: input.professionalRegistration || 'not_available',
    outcome: 'pass',
    timestamp: now,
    inspectionItemId: '',
    itpRevisionNumber: itp.revisionNumber,
  };

  try {
    await updateDoc(itpDocument(input.projectId, input.itpId), {
      status: 'approved',
      approvedBy: input.approverUserId,
      approvedAt: now,
      approvalSignOff: signOffRecord,
      updatedAt: now,
    });
    await writeAuditRecord(
      input.projectId, 'itp', input.itpId, 'itp_approved',
      input.approverUserId,
      { status: 'draft' },
      { status: 'approved', approvedBy: input.approverUserId, approvedAt: now },
      { revisionNumber: itp.revisionNumber },
    );
  } catch (error) {
    if (error instanceof ITPServiceError) throw error;
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${input.projectId}/${ITPS_COL}/${input.itpId}`);
  }
}

// ── Revision Operations ──────────────────────────────────────────────────────

/**
 * Creates a new revision of an approved ITP.
 * - Original ITP must be in 'approved' or 'in_progress' status
 * - New ITP gets revisionNumber = original + 1, status = 'draft'
 * - All inspection items are copied to the new revision
 * - Original ITP status is set to 'superseded'
 * - Bidirectional links are established between revisions
 */
export async function createRevision(
  projectId: string,
  itpId: string,
  userId: string,
  permCtx?: ITPPermissionContext,
): Promise<string> {
  // Permission enforcement: itp:create → engineer, architect
  enforcePermission(projectId, 'itp:create', permCtx);

  const itp = await getITPOrThrow(projectId, itpId);

  if (itp.status !== 'approved' && itp.status !== 'in_progress') {
    throw new ITPServiceError(
      'invalid_state_transition',
      `Cannot create revision from ITP with status '${itp.status}'. ITP must be approved or in_progress.`,
    );
  }

  const now = new Date().toISOString();

  // Create new ITP with incremented revision number
  const newItpData: Omit<ITP, 'id'> = {
    projectId: itp.projectId,
    title: itp.title,
    description: itp.description,
    constructionStage: itp.constructionStage,
    revisionNumber: itp.revisionNumber + 1,
    status: 'draft',
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
    previousRevisionId: itpId,
  };

  try {
    // Create the new ITP document
    const newItpRef = await addDoc(itpCollection(projectId), newItpData);
    const newItpId = newItpRef.id;

    // Copy all inspection items to the new ITP
    const items = await getAllItems(projectId, itpId);
    for (const item of items) {
      const { id: _itemId, ...itemData } = item;
      const copiedItemData: Omit<ITPInspectionItem, 'id'> = {
        ...itemData,
        itpId: newItpId,
        status: 'pending' as InspectionItemStatus,
        createdAt: now,
        updatedAt: now,
      };
      await addDoc(itemsCollection(projectId, newItpId), copiedItemData);
    }

    // Supersede the original ITP
    await updateDoc(itpDocument(projectId, itpId), {
      status: 'superseded',
      nextRevisionId: newItpId,
      updatedAt: now,
    });

    // Write audit records
    await writeAuditRecord(
      projectId, 'itp', itpId, 'itp_revised',
      userId,
      { status: itp.status, revisionNumber: itp.revisionNumber },
      { status: 'superseded', nextRevisionId: newItpId },
    );

    await writeAuditRecord(
      projectId, 'itp', newItpId, 'itp_created',
      userId, {},
      { ...newItpData, revisionNumber: newItpData.revisionNumber } as unknown as Record<string, unknown>,
      { sourceRevisionId: itpId, action: 'revision' },
    );

    return newItpId;
  } catch (error) {
    if (error instanceof ITPServiceError) throw error;
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${projectId}/${ITPS_COL}`);
    throw error;
  }
}

// ── Inspection Item Operations (Task 3.1) ────────────────────────────────────

export interface CreateInspectionItemInput {
  title: string;
  description: string;
  inspectionType: 'hold_point' | 'witness_point' | 'surveillance';
  acceptanceCriteria: string;
  responsibleInspectorRole: 'engineer' | 'architect' | 'site_manager';
  specificationReference: string;
  specificationCategory?: string;
  linkedMaterialTestIds?: string[];
  linkedSpecItemId?: string;
}

/**
 * Adds an inspection item to an ITP.
 * - Validates all fields via createInspectionItemSchema
 * - Validates specificationReference format via specificationReferenceSchema
 * - Enforces 200-item max per ITP
 * - Assigns next sequential sequence number
 * - Stores in Firestore subcollection projects/{pid}/itps/{itpId}/items
 * - ITP must be in draft status
 */
export async function addInspectionItem(
  projectId: string,
  itpId: string,
  input: CreateInspectionItemInput,
  actorUserId: string,
  permCtx?: ITPPermissionContext,
): Promise<string> {
  // Permission enforcement: itp:create → engineer, architect (write access to ITP)
  enforcePermission(projectId, 'itp:create', permCtx);

  // 1. Verify ITP exists and is in draft status
  const itp = await getITPOrThrow(projectId, itpId);
  assertDraftStatus(itp);

  // 2. Validate input via Zod schema
  const parsed = createInspectionItemSchema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    parsed.error.errors.forEach((e) => {
      fields[e.path.join('.')] = e.message;
    });
    throw new ITPServiceError('validation_error', 'Invalid inspection item input', fields);
  }

  // 3. Additional specificationReference format validation
  const specRefResult = specificationReferenceSchema.safeParse(parsed.data.specificationReference);
  if (!specRefResult.success) {
    throw new ITPServiceError('validation_error', 'Invalid specification reference format', {
      specificationReference: specRefResult.error.errors[0]?.message ?? 'Invalid format',
    });
  }

  // 4. Validate linkedMaterialTestIds max 20 (also done by schema, but explicit)
  if (parsed.data.linkedMaterialTestIds && parsed.data.linkedMaterialTestIds.length > 20) {
    throw new ITPServiceError('validation_error', 'Maximum 20 linked material test IDs allowed', {
      linkedMaterialTestIds: 'Maximum 20 entries allowed',
    });
  }

  // 5. Check 200-item limit
  const currentCount = await getItemCount(projectId, itpId);
  if (currentCount >= MAX_ITEMS_PER_ITP) {
    throw new ITPServiceError(
      'max_items_exceeded',
      `ITP already has ${currentCount} items. Maximum is ${MAX_ITEMS_PER_ITP}.`,
    );
  }

  // 6. Determine next sequence number
  const nextSequence = currentCount + 1;

  // 7. Build item record
  const now = new Date().toISOString();
  const itemData: Omit<ITPInspectionItem, 'id'> = {
    itpId,
    projectId,
    sequenceNumber: nextSequence,
    title: parsed.data.title,
    description: parsed.data.description,
    inspectionType: parsed.data.inspectionType,
    acceptanceCriteria: parsed.data.acceptanceCriteria,
    responsibleInspectorRole: parsed.data.responsibleInspectorRole,
    specificationReference: parsed.data.specificationReference,
    specificationCategory: parsed.data.specificationCategory,
    linkedMaterialTestIds: parsed.data.linkedMaterialTestIds ?? [],
    linkedSpecItemId: parsed.data.linkedSpecItemId,
    status: 'pending' as InspectionItemStatus,
    createdAt: now,
    updatedAt: now,
  };

  // 8. Persist to Firestore
  try {
    const ref = await addDoc(itemsCollection(projectId, itpId), itemData);
    await writeAuditRecord(
      projectId, 'inspection_item', ref.id, 'item_added',
      actorUserId, {}, itemData as unknown as Record<string, unknown>,
      { itpId, sequenceNumber: nextSequence },
    );
    return ref.id;
  } catch (error) {
    handleFirestoreError(
      error, OperationType.CREATE,
      `${PROJECTS_COL}/${projectId}/${ITPS_COL}/${itpId}/${ITEMS_COL}`,
    );
    throw error;
  }
}

export interface UpdateInspectionItemInput {
  title?: string;
  description?: string;
  inspectionType?: 'hold_point' | 'witness_point' | 'surveillance';
  acceptanceCriteria?: string;
  responsibleInspectorRole?: 'engineer' | 'architect' | 'site_manager';
  specificationReference?: string;
  specificationCategory?: string;
  linkedMaterialTestIds?: string[];
  linkedSpecItemId?: string;
}

/**
 * Updates an existing inspection item.
 * - ITP must be in draft status
 * - Validates updated fields
 */
export async function updateInspectionItem(
  projectId: string,
  itpId: string,
  itemId: string,
  updates: UpdateInspectionItemInput,
  actorUserId: string,
  permCtx?: ITPPermissionContext,
): Promise<void> {
  // Permission enforcement: itp:create → engineer, architect (write access to ITP)
  enforcePermission(projectId, 'itp:create', permCtx);

  // 1. Verify ITP exists and is in draft status
  const itp = await getITPOrThrow(projectId, itpId);
  assertDraftStatus(itp);

  // 2. Verify item exists
  let existingItem: ITPInspectionItem;
  try {
    const itemSnap = await getDoc(itemDocument(projectId, itpId, itemId));
    if (!itemSnap.exists()) {
      throw new ITPServiceError('not_found', `Inspection item ${itemId} not found`);
    }
    existingItem = { id: itemSnap.id, ...itemSnap.data() } as ITPInspectionItem;
  } catch (error) {
    if (error instanceof ITPServiceError) throw error;
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${ITPS_COL}/${itpId}/${ITEMS_COL}/${itemId}`);
    throw error;
  }

  // 3. Validate fields
  const validationErrors: Record<string, string> = {};

  if (updates.title !== undefined) {
    if (updates.title.length < 1 || updates.title.length > 200) {
      validationErrors.title = 'Must be 1-200 characters';
    }
  }
  if (updates.description !== undefined) {
    if (updates.description.length < 1 || updates.description.length > 2000) {
      validationErrors.description = 'Must be 1-2000 characters';
    }
  }
  if (updates.acceptanceCriteria !== undefined) {
    if (updates.acceptanceCriteria.length < 1 || updates.acceptanceCriteria.length > 2000) {
      validationErrors.acceptanceCriteria = 'Must be 1-2000 characters';
    }
  }
  if (updates.inspectionType !== undefined) {
    const validTypes = ['hold_point', 'witness_point', 'surveillance'];
    if (!validTypes.includes(updates.inspectionType)) {
      validationErrors.inspectionType = 'Must be hold_point, witness_point, or surveillance';
    }
  }
  if (updates.responsibleInspectorRole !== undefined) {
    const validRoles = ['engineer', 'architect', 'site_manager'];
    if (!validRoles.includes(updates.responsibleInspectorRole)) {
      validationErrors.responsibleInspectorRole = 'Must be engineer, architect, or site_manager';
    }
  }
  if (updates.specificationReference !== undefined) {
    const specRefResult = specificationReferenceSchema.safeParse(updates.specificationReference);
    if (!specRefResult.success) {
      validationErrors.specificationReference = specRefResult.error.errors[0]?.message ?? 'Invalid format';
    }
  }
  if (updates.linkedMaterialTestIds !== undefined) {
    if (updates.linkedMaterialTestIds.length > 20) {
      validationErrors.linkedMaterialTestIds = 'Maximum 20 entries allowed';
    }
  }

  if (Object.keys(validationErrors).length > 0) {
    throw new ITPServiceError('validation_error', 'Invalid inspection item update', validationErrors);
  }

  // 4. Build update payload
  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = { updatedAt: now };

  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.inspectionType !== undefined) updateData.inspectionType = updates.inspectionType;
  if (updates.acceptanceCriteria !== undefined) updateData.acceptanceCriteria = updates.acceptanceCriteria;
  if (updates.responsibleInspectorRole !== undefined) updateData.responsibleInspectorRole = updates.responsibleInspectorRole;
  if (updates.specificationReference !== undefined) updateData.specificationReference = updates.specificationReference;
  if (updates.specificationCategory !== undefined) updateData.specificationCategory = updates.specificationCategory;
  if (updates.linkedMaterialTestIds !== undefined) updateData.linkedMaterialTestIds = updates.linkedMaterialTestIds;
  if (updates.linkedSpecItemId !== undefined) updateData.linkedSpecItemId = updates.linkedSpecItemId;

  // 5. Persist
  try {
    await updateDoc(itemDocument(projectId, itpId, itemId), updateData);
    await writeAuditRecord(
      projectId, 'inspection_item', itemId, 'item_updated',
      actorUserId,
      { title: existingItem.title, description: existingItem.description, inspectionType: existingItem.inspectionType },
      updateData,
      { itpId },
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${ITPS_COL}/${itpId}/${ITEMS_COL}/${itemId}`);
  }
}

/**
 * Removes an inspection item from an ITP.
 * - ITP must be in draft status
 * - Re-sequences remaining items to maintain contiguous integers starting at 1
 */
export async function removeInspectionItem(
  projectId: string,
  itpId: string,
  itemId: string,
  actorUserId: string,
  permCtx?: ITPPermissionContext,
): Promise<void> {
  // Permission enforcement: itp:create → engineer, architect (write access to ITP)
  enforcePermission(projectId, 'itp:create', permCtx);

  // 1. Verify ITP exists and is in draft status
  const itp = await getITPOrThrow(projectId, itpId);
  assertDraftStatus(itp);

  // 2. Verify item exists
  let existingItem: ITPInspectionItem;
  try {
    const itemSnap = await getDoc(itemDocument(projectId, itpId, itemId));
    if (!itemSnap.exists()) {
      throw new ITPServiceError('not_found', `Inspection item ${itemId} not found`);
    }
    existingItem = { id: itemSnap.id, ...itemSnap.data() } as ITPInspectionItem;
  } catch (error) {
    if (error instanceof ITPServiceError) throw error;
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${ITPS_COL}/${itpId}/${ITEMS_COL}/${itemId}`);
    throw error;
  }

  // 3. Get all items to re-sequence after removal
  const allItems = await getAllItems(projectId, itpId);
  const remainingItems = allItems.filter((item) => item.id !== itemId);

  // 4. Use a batch to delete item + re-sequence remaining
  try {
    const batch = writeBatch(db);
    const now = new Date().toISOString();

    // Delete the item
    batch.delete(itemDocument(projectId, itpId, itemId));

    // Re-sequence remaining items
    remainingItems.forEach((item, index) => {
      const newSeq = index + 1;
      if (item.sequenceNumber !== newSeq) {
        batch.update(itemDocument(projectId, itpId, item.id), {
          sequenceNumber: newSeq,
          updatedAt: now,
        });
      }
    });

    await batch.commit();

    await writeAuditRecord(
      projectId, 'inspection_item', itemId, 'item_removed',
      actorUserId,
      { sequenceNumber: existingItem.sequenceNumber, title: existingItem.title },
      { removed: true },
      { itpId, remainingCount: remainingItems.length },
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${PROJECTS_COL}/${projectId}/${ITPS_COL}/${itpId}/${ITEMS_COL}/${itemId}`);
  }
}

/**
 * Reorders inspection items within an ITP.
 * - Accepts new order array (item IDs in desired order)
 * - Validates it covers all existing items (no gaps/duplicates/extras)
 * - Re-assigns contiguous sequence numbers starting at 1
 * - ITP must be in draft status
 */
export async function reorderInspectionItems(
  projectId: string,
  itpId: string,
  newOrder: string[],
  actorUserId: string,
  permCtx?: ITPPermissionContext,
): Promise<void> {
  // Permission enforcement: itp:create → engineer, architect (write access to ITP)
  enforcePermission(projectId, 'itp:create', permCtx);

  // 1. Verify ITP exists and is in draft status
  const itp = await getITPOrThrow(projectId, itpId);
  assertDraftStatus(itp);

  // 2. Get all current items
  const allItems = await getAllItems(projectId, itpId);
  const existingIds = allItems.map((item) => item.id);

  // 3. Validate new order covers all items exactly
  if (newOrder.length !== existingIds.length) {
    throw new ITPServiceError(
      'invalid_reorder',
      `New order contains ${newOrder.length} items but ITP has ${existingIds.length} items. Must match exactly.`,
    );
  }

  const newOrderSet = new Set(newOrder);
  if (newOrderSet.size !== newOrder.length) {
    throw new ITPServiceError(
      'invalid_reorder',
      'New order contains duplicate item IDs.',
    );
  }

  const missingIds = existingIds.filter((id) => !newOrderSet.has(id));
  if (missingIds.length > 0) {
    throw new ITPServiceError(
      'invalid_reorder',
      `New order is missing items: ${missingIds.join(', ')}`,
    );
  }

  const extraIds = newOrder.filter((id) => !existingIds.includes(id));
  if (extraIds.length > 0) {
    throw new ITPServiceError(
      'invalid_reorder',
      `New order contains unknown items: ${extraIds.join(', ')}`,
    );
  }

  // 4. Apply new sequence numbers via batch
  try {
    const batch = writeBatch(db);
    const now = new Date().toISOString();
    const previousOrder = allItems.map((item) => ({ id: item.id, sequenceNumber: item.sequenceNumber }));

    newOrder.forEach((itemId, index) => {
      const newSeq = index + 1;
      batch.update(itemDocument(projectId, itpId, itemId), {
        sequenceNumber: newSeq,
        updatedAt: now,
      });
    });

    await batch.commit();

    await writeAuditRecord(
      projectId, 'itp', itpId, 'items_reordered',
      actorUserId,
      { order: previousOrder },
      { order: newOrder.map((id, i) => ({ id, sequenceNumber: i + 1 })) },
      { itpId },
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${ITPS_COL}/${itpId}/${ITEMS_COL}`);
  }
}

// ── Hold Point Execution Operations (Task 4.1) ───────────────────────────────

export interface HoldPointRequestInput {
  projectId: string;
  itpId: string;
  inspectionItemId: string;
  requestedBy: string;
  requestedInspectionDate: string;
}

/**
 * Requests a hold point inspection.
 * - Validates requested date is ≥24h in the future
 * - Creates InspectionRequest record in Firestore `projects/{pid}/inspection_requests`
 * - Updates item status to 'in_progress'
 */
export async function requestHoldPointInspection(input: HoldPointRequestInput, permCtx?: ITPPermissionContext): Promise<string> {
  // Permission enforcement: inspection:request → site_manager, contractor, subcontractor, quantity_surveyor
  enforcePermission(input.projectId, 'inspection:request', permCtx);

  // 1. Validate input via Zod
  const parsed = holdPointRequestSchema.safeParse({
    inspectionItemId: input.inspectionItemId,
    requestedInspectionDate: input.requestedInspectionDate,
  });

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    parsed.error.errors.forEach((e) => {
      fields[e.path.join('.')] = e.message;
    });
    throw new ITPServiceError('validation_error', 'Invalid hold point request input', fields);
  }

  // 2. Validate requested date is at least 24 hours in the future
  const requestedDate = new Date(input.requestedInspectionDate);
  const now = new Date();
  const minDate = new Date(now.getTime() + HOLD_POINT_MIN_NOTICE_HOURS * 60 * 60 * 1000);

  if (requestedDate.getTime() < minDate.getTime()) {
    throw new ITPServiceError(
      'validation_error',
      'Requested inspection date must be at least 24 hours from the current time',
      { requestedInspectionDate: 'Must be at least 24 hours in the future' },
    );
  }

  // 3. Verify the inspection item exists and is a hold_point
  const itemSnap = await getDoc(itemDocument(input.projectId, input.itpId, input.inspectionItemId));
  if (!itemSnap.exists()) {
    throw new ITPServiceError('not_found', `Inspection item ${input.inspectionItemId} not found`);
  }
  const item = { id: itemSnap.id, ...itemSnap.data() } as ITPInspectionItem;

  if (item.inspectionType !== 'hold_point') {
    throw new ITPServiceError(
      'validation_error',
      'Only hold point items can have inspection requests',
      { inspectionItemId: 'Item is not a hold_point type' },
    );
  }

  // 4. Create InspectionRequest record
  const requestData: Omit<InspectionRequest, 'id'> = {
    projectId: input.projectId,
    inspectionItemId: input.inspectionItemId,
    itpId: input.itpId,
    requestedBy: input.requestedBy,
    requestedInspectionDate: input.requestedInspectionDate,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  try {
    const ref = await addDoc(inspectionRequestsCollection(input.projectId), requestData);

    // 5. Update item status to 'in_progress'
    const nowIso = new Date().toISOString();
    await updateDoc(itemDocument(input.projectId, input.itpId, input.inspectionItemId), {
      status: 'in_progress',
      updatedAt: nowIso,
    });

    // 6. Write audit record
    await writeAuditRecord(
      input.projectId, 'inspection_item', input.inspectionItemId, 'inspection_requested',
      input.requestedBy,
      { status: item.status },
      { status: 'in_progress', inspectionRequestId: ref.id },
      { itpId: input.itpId, requestedInspectionDate: input.requestedInspectionDate },
    );

    // 7. Notify Action Centre — create hold point request event (Requirement 11.1)
    const itp = await getITPOrThrow(input.projectId, input.itpId);
    await persistActionCentreEvent(createHoldPointRequestEvent({
      projectId: input.projectId,
      itpTitle: itp.title,
      itemTitle: item.title,
      itemId: input.inspectionItemId,
      requestedDate: input.requestedInspectionDate,
      assignedRoles: mapInspectorRoleToAssignedRoles(item.responsibleInspectorRole),
    }));

    return ref.id;
  } catch (error) {
    if (error instanceof ITPServiceError) throw error;
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${input.projectId}/${INSPECTION_REQUESTS_COL}`);
    throw error;
  }
}

export interface InspectionSignOffInput {
  projectId: string;
  itpId: string;
  inspectionItemId: string;
  inspectorUserId: string;
  inspectorRole: InspectorRole;
  outcome: 'pass' | 'fail' | 'conditional_pass';
  conditions?: string;
  conditionsDeadlineDays?: number;
  observations?: string;
  professionalRegistration?: string;
}

/**
 * Signs off an inspection (hold point).
 * - Records SignOffRecord on the item
 * - On pass: updates item to 'passed', unblocks subsequent items
 * - On fail: updates item to 'failed', triggers NCR creation (stub)
 * - On conditional_pass: records conditions + deadline, unblocks subsequent items, creates follow-up action
 */
export async function signOffInspection(input: InspectionSignOffInput, permCtx?: ITPPermissionContext): Promise<void> {
  // Permission enforcement: inspection:sign_off → engineer, architect
  enforcePermission(input.projectId, 'inspection:sign_off', permCtx);

  // 1. Validate input via Zod
  const parsed = inspectionSignOffSchema.safeParse({
    inspectionItemId: input.inspectionItemId,
    outcome: input.outcome,
    conditions: input.conditions,
    conditionsDeadlineDays: input.conditionsDeadlineDays,
    observations: input.observations,
  });

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    parsed.error.errors.forEach((e) => {
      fields[e.path.join('.')] = e.message;
    });
    throw new ITPServiceError('validation_error', 'Invalid sign-off input', fields);
  }

  // 2. Additional validation for conditional_pass
  if (input.outcome === 'conditional_pass') {
    if (!input.conditions || input.conditions.trim().length === 0) {
      throw new ITPServiceError(
        'validation_error',
        'Conditions text is required for conditional_pass outcome',
        { conditions: 'Required for conditional_pass' },
      );
    }
    if (input.conditions.length > MAX_CONDITIONS_LENGTH) {
      throw new ITPServiceError(
        'validation_error',
        `Conditions text must be at most ${MAX_CONDITIONS_LENGTH} characters`,
        { conditions: `Maximum ${MAX_CONDITIONS_LENGTH} characters` },
      );
    }
    if (!input.conditionsDeadlineDays || input.conditionsDeadlineDays < MIN_DEADLINE_DAYS || input.conditionsDeadlineDays > MAX_DEADLINE_DAYS) {
      throw new ITPServiceError(
        'validation_error',
        `Conditions deadline must be between ${MIN_DEADLINE_DAYS} and ${MAX_DEADLINE_DAYS} days`,
        { conditionsDeadlineDays: `Must be ${MIN_DEADLINE_DAYS}-${MAX_DEADLINE_DAYS} days` },
      );
    }
  }

  // 3. Verify the inspection item exists
  const itemSnap = await getDoc(itemDocument(input.projectId, input.itpId, input.inspectionItemId));
  if (!itemSnap.exists()) {
    throw new ITPServiceError('not_found', `Inspection item ${input.inspectionItemId} not found`);
  }
  const item = { id: itemSnap.id, ...itemSnap.data() } as ITPInspectionItem;

  // 4. Verify the ITP exists to get revision number
  const itp = await getITPOrThrow(input.projectId, input.itpId);

  // 5. Build SignOffRecord
  const now = new Date().toISOString();
  const signOffRecord: SignOffRecord = {
    inspectorUserId: input.inspectorUserId,
    inspectorRole: input.inspectorRole,
    professionalRegistration: input.professionalRegistration || 'not_available',
    outcome: input.outcome,
    conditions: input.conditions,
    conditionsDeadlineDays: input.conditionsDeadlineDays,
    observations: input.observations,
    timestamp: now,
    inspectionItemId: input.inspectionItemId,
    itpRevisionNumber: itp.revisionNumber,
  };

  // 6. Handle outcomes
  const updateData: Record<string, unknown> = {
    signOffRecord,
    updatedAt: now,
  };

  let ncrData: Record<string, unknown> | null = null;

  switch (input.outcome) {
    case 'pass': {
      updateData.status = 'passed';
      break;
    }
    case 'fail': {
      updateData.status = 'failed';
      // Create linked NCR for hold point failure
      ncrData = {
        projectId: input.projectId,
        title: `Hold Point Failure: ${item.title}`,
        description: `Failed inspection at ITP revision ${itp.revisionNumber}, item #${item.sequenceNumber}. Spec: ${item.specificationReference}. Source inspection item: ${input.inspectionItemId}. Source ITP: ${input.itpId}.`,
        severity: determineHoldPointNCRSeverity(item.specificationCategory),
        sourceInspectionItemId: input.inspectionItemId,
        sourceItpId: input.itpId,
        createdBy: 'system:itp_service',
      };
      break;
    }
    case 'conditional_pass': {
      updateData.status = 'conditional';
      // Calculate deadline date
      const deadlineDate = new Date();
      deadlineDate.setDate(deadlineDate.getDate() + (input.conditionsDeadlineDays ?? MIN_DEADLINE_DAYS));
      const conditionalFollowUp: ConditionalFollowUp = {
        actionId: `followup-${input.inspectionItemId}-${Date.now()}`,
        deadlineDate: deadlineDate.toISOString(),
        deadlineDays: input.conditionsDeadlineDays ?? MIN_DEADLINE_DAYS,
        status: 'open',
      };
      updateData.conditionalFollowUp = conditionalFollowUp;
      break;
    }
  }

  // 7. Persist the sign-off
  try {
    await updateDoc(itemDocument(input.projectId, input.itpId, input.inspectionItemId), updateData);

    // 8. Write audit record (includes professional registration per Requirement 10.3)
    await writeAuditRecord(
      input.projectId, 'inspection_item', input.inspectionItemId, 'inspection_signed_off',
      input.inspectorUserId,
      { status: item.status },
      { status: updateData.status, outcome: input.outcome },
      {
        itpId: input.itpId,
        professionalRegistration: input.professionalRegistration || 'not_available',
        ncrData,
      },
    );

    // 9. Create linked NCR if inspection failed
    if (input.outcome === 'fail' && ncrData) {
      await createLinkedNCR({
        projectId: input.projectId,
        itpId: input.itpId,
        inspectionItemId: input.inspectionItemId,
        title: ncrData.title as string,
        description: ncrData.description as string,
        severity: ncrData.severity as Severity,
      });
    }
  } catch (error) {
    if (error instanceof ITPServiceError) throw error;
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${input.projectId}/${ITPS_COL}/${input.itpId}/${ITEMS_COL}/${input.inspectionItemId}`);
  }
}

/**
 * Determines NCR severity for a hold point failure based on specification category.
 * - structural/fire_safety/geotechnical → 'critical'
 * - All other categories → 'high'
 */
export function determineHoldPointNCRSeverity(specificationCategory?: string): 'critical' | 'high' {
  const criticalCategories = ['structural', 'fire_safety', 'geotechnical'];
  if (specificationCategory && criticalCategories.includes(specificationCategory)) {
    return 'critical';
  }
  return 'high';
}

/**
 * Checks if an inspection item is blocked by a preceding hold point.
 * Items after a pending/in_progress hold point (without a sign-off) cannot transition to 'in_progress'.
 *
 * @returns true if the item is blocked by a preceding hold point
 */
export async function isBlockedByHoldPoint(
  projectId: string,
  itpId: string,
  sequenceNumber: number,
): Promise<boolean> {
  // Get all items in the ITP
  const allItems = await getAllItems(projectId, itpId);

  // Find any hold_point items with sequenceNumber < target that are pending/in_progress without a sign-off
  const blockingItems = allItems.filter((item) =>
    item.sequenceNumber < sequenceNumber &&
    item.inspectionType === 'hold_point' &&
    (item.status === 'pending' || item.status === 'in_progress') &&
    !item.signOffRecord,
  );

  return blockingItems.length > 0;
}

/**
 * Checks conditional expiration for an inspection item.
 * When the deadline passes without resolution, transitions the item from 'conditional' to 'failed'
 * and re-blocks subsequent items.
 *
 * @returns true if the item was expired (transitioned to 'failed'), false otherwise
 */
export async function checkConditionalExpiration(
  projectId: string,
  itpId: string,
  itemId: string,
): Promise<boolean> {
  // 1. Get the item
  const itemSnap = await getDoc(itemDocument(projectId, itpId, itemId));
  if (!itemSnap.exists()) {
    throw new ITPServiceError('not_found', `Inspection item ${itemId} not found`);
  }
  const item = { id: itemSnap.id, ...itemSnap.data() } as ITPInspectionItem;

  // 2. Check if item is in 'conditional' status with a follow-up
  if (item.status !== 'conditional' || !item.conditionalFollowUp) {
    return false;
  }

  // 3. Check if the deadline has passed
  const now = new Date();
  const deadlineDate = new Date(item.conditionalFollowUp.deadlineDate);

  if (now.getTime() < deadlineDate.getTime()) {
    return false; // Deadline not yet passed
  }

  // 4. Check that follow-up is still open (not already resolved)
  if (item.conditionalFollowUp.status !== 'open') {
    return false;
  }

  // 5. Transition item to 'failed' and mark follow-up as expired
  const nowIso = now.toISOString();
  const updatedFollowUp: ConditionalFollowUp = {
    ...item.conditionalFollowUp,
    status: 'expired',
    expiredAt: nowIso,
  };

  try {
    await updateDoc(itemDocument(projectId, itpId, itemId), {
      status: 'failed',
      conditionalFollowUp: updatedFollowUp,
      updatedAt: nowIso,
    });

    // 6. Write audit record
    await writeAuditRecord(
      projectId, 'inspection_item', itemId, 'conditional_expired',
      'system:itp_service',
      { status: 'conditional', conditionalFollowUp: item.conditionalFollowUp },
      { status: 'failed', conditionalFollowUp: updatedFollowUp },
      { itpId, deadlineDate: item.conditionalFollowUp.deadlineDate },
    );

    return true;
  } catch (error) {
    if (error instanceof ITPServiceError) throw error;
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${ITPS_COL}/${itpId}/${ITEMS_COL}/${itemId}`);
    throw error;
  }
}

/**
 * Detects a hold point breach — flags when work proceeds past an unsigned hold point.
 * A breach occurs when a subsequent item (after the target hold point) is in 'in_progress' or later status,
 * but the hold point has no sign-off record.
 *
 * @returns An object with `breached` flag and breach details if detected
 */
export async function detectHoldPointBreach(
  projectId: string,
  itpId: string,
  itemId: string,
): Promise<{ breached: boolean; ncrData?: Record<string, unknown> }> {
  // 1. Get the item
  const itemSnap = await getDoc(itemDocument(projectId, itpId, itemId));
  if (!itemSnap.exists()) {
    throw new ITPServiceError('not_found', `Inspection item ${itemId} not found`);
  }
  const item = { id: itemSnap.id, ...itemSnap.data() } as ITPInspectionItem;

  // 2. Verify this is a hold point
  if (item.inspectionType !== 'hold_point') {
    return { breached: false };
  }

  // 3. Check if there's already a sign-off (pass or conditional_pass)
  if (item.signOffRecord && (item.signOffRecord.outcome === 'pass' || item.signOffRecord.outcome === 'conditional_pass')) {
    return { breached: false };
  }

  // 4. Check if any subsequent items have progressed beyond 'pending'
  const allItems = await getAllItems(projectId, itpId);
  const subsequentItems = allItems.filter((i) => i.sequenceNumber > item.sequenceNumber);
  const progressedStatuses: InspectionItemStatus[] = ['in_progress', 'passed', 'failed', 'conditional', 'conditional_accepted', 'ncr_resolved'];
  const breachingItems = subsequentItems.filter((i) => progressedStatuses.includes(i.status));

  if (breachingItems.length === 0) {
    return { breached: false };
  }

  // 5. Breach detected — prepare NCR data (always critical severity for hold point breach)
  const itp = await getITPOrThrow(projectId, itpId);
  const ncrData: Record<string, unknown> = {
    projectId,
    title: `Hold Point Breach: ${item.title}`,
    description: `Work proceeded past unsigned hold point #${item.sequenceNumber} in ITP "${itp.title}" (revision ${itp.revisionNumber}). Spec: ${item.specificationReference}. ${breachingItems.length} subsequent item(s) have progressed without hold point sign-off.`,
    severity: 'critical',
    sourceInspectionItemId: itemId,
    sourceItpId: itpId,
    createdBy: 'system:itp_service',
  };

  // 6. Log the breach and create NCR (always critical severity for hold point breach)
  const ncrId = await createLinkedNCR({
    projectId,
    itpId,
    inspectionItemId: itemId,
    title: ncrData.title as string,
    description: ncrData.description as string,
    severity: 'critical',
  });

  if (ncrId) {
    ncrData.ncrId = ncrId;
  }

  // 7. Write audit record
  const nowIso = new Date().toISOString();
  await writeAuditRecord(
    projectId, 'inspection_item', itemId, 'hold_point_breached',
    'system:itp_service',
    { status: item.status, signOffRecord: item.signOffRecord },
    { breached: true, breachingItemCount: breachingItems.length },
    { itpId, ncrData },
  );

  // 7b. Notify Action Centre — create hold point breach event (Requirement 11.4)
  await persistActionCentreEvent(createHoldPointBreachEvent({
    projectId,
    itpTitle: itp.title,
    itemTitle: item.title,
    itemId,
    ncrReference: ncrData.ncrId ? String(ncrData.ncrId) : 'pending',
    assignedRoles: buildBreachAssignedRoles(),
  }));

  // 8. Update the inspection request status to 'breached' if one exists
  try {
    const requestsSnap = await getDocs(
      query(
        inspectionRequestsCollection(projectId),
        where('inspectionItemId', '==', itemId),
        where('status', '==', 'pending'),
      ),
    );
    const batch = writeBatch(db);
    requestsSnap.docs.forEach((reqDoc) => {
      batch.update(reqDoc.ref, { status: 'breached', updatedAt: nowIso });
    });
    if (!requestsSnap.empty) {
      await batch.commit();
    }
  } catch (error) {
    // Non-critical: log but don't fail the breach detection
    console.error('[ITP] Failed to update inspection request status on breach:', error);
  }

  return { breached: true, ncrData };
}

// ── Witness Point Execution Operations (Task 5.1) ────────────────────────────

export interface WitnessPointOutcomeInput {
  projectId: string;
  itpId: string;
  inspectionItemId: string;
  outcome: 'pass' | 'fail' | 'conditional_pass';
  observations?: string;
  inspectorAttended: boolean;
  /** Required when inspectorAttended is true */
  inspectorUserId?: string;
  /** Required when inspectorAttended is true */
  inspectorRole?: InspectorRole;
  /** Professional registration number (ECSA/SACAP/NHBRC) from inspector's profile. Recorded in audit trail per Requirement 10.3 */
  professionalRegistration?: string;
  /** Required when inspectorAttended is false */
  recordedByUserId?: string;
  /** Notification sent timestamp (ISO string) for attendance tracking */
  notificationSentAt: string;
  /** Inspector response status for this witness point */
  inspectorResponse: 'acknowledged' | 'no_response';
  /** When the inspector responded (ISO string), if applicable */
  responseTimestamp?: string;
}

/**
 * Records the outcome of a witness point inspection.
 * Handles both inspector-witnessed and contractor-recorded scenarios:
 * - Inspector attended: records SignOffRecord, marks item as 'inspector_witnessed'
 * - No inspector: records SelfInspectionRecord, marks item as 'contractor_recorded'
 * On fail: prepares NCR data with severity based on spec category
 * Records complete attendance record and writes audit records.
 */
export async function recordWitnessPointOutcome(input: WitnessPointOutcomeInput, permCtx?: ITPPermissionContext): Promise<void> {
  // Permission enforcement: inspection:sign_off → engineer, architect (for witness point recording)
  enforcePermission(input.projectId, 'inspection:sign_off', permCtx);

  // 1. Validate input via Zod
  const parsed = witnessPointOutcomeSchema.safeParse({
    inspectionItemId: input.inspectionItemId,
    outcome: input.outcome,
    observations: input.observations,
  });

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    parsed.error.errors.forEach((e) => {
      fields[e.path.join('.')] = e.message;
    });
    throw new ITPServiceError('validation_error', 'Invalid witness point outcome input', fields);
  }

  // 2. Additional validation based on attendance scenario
  if (input.inspectorAttended) {
    if (!input.inspectorUserId) {
      throw new ITPServiceError('validation_error', 'Inspector user ID is required when inspector attends', {
        inspectorUserId: 'Required when inspector attends',
      });
    }
    if (!input.inspectorRole) {
      throw new ITPServiceError('validation_error', 'Inspector role is required when inspector attends', {
        inspectorRole: 'Required when inspector attends',
      });
    }
  } else {
    if (!input.recordedByUserId) {
      throw new ITPServiceError('validation_error', 'Recorded-by user ID is required when inspector does not attend', {
        recordedByUserId: 'Required when inspector does not attend',
      });
    }
  }

  // 3. Verify the inspection item exists and is a witness_point
  const itemSnap = await getDoc(itemDocument(input.projectId, input.itpId, input.inspectionItemId));
  if (!itemSnap.exists()) {
    throw new ITPServiceError('not_found', `Inspection item ${input.inspectionItemId} not found`);
  }
  const item = { id: itemSnap.id, ...itemSnap.data() } as ITPInspectionItem;

  if (item.inspectionType !== 'witness_point') {
    throw new ITPServiceError(
      'validation_error',
      'Only witness point items can have witness point outcomes recorded',
      { inspectionItemId: 'Item is not a witness_point type' },
    );
  }

  // 4. Verify ITP exists (for revision number in sign-off record)
  const itp = await getITPOrThrow(input.projectId, input.itpId);

  // 5. Build attendance record
  const now = new Date().toISOString();
  const witnessAttendance: WitnessAttendanceRecord = {
    notificationSentAt: input.notificationSentAt,
    inspectorResponse: input.inspectorResponse,
    responseTimestamp: input.responseTimestamp,
    attendance: input.inspectorAttended ? 'attended' : 'not_attended',
    finalSignOffBy: input.inspectorAttended ? 'inspector_witnessed' : 'contractor_recorded',
  };

  // 6. Build update data based on attendance scenario
  const updateData: Record<string, unknown> = {
    witnessAttendance,
    updatedAt: now,
  };

  let ncrData: Record<string, unknown> | null = null;
  let actorUserId: string;

  if (input.inspectorAttended) {
    // Inspector attended — record SignOffRecord
    const signOffRecord: SignOffRecord = {
      inspectorUserId: input.inspectorUserId!,
      inspectorRole: input.inspectorRole!,
      professionalRegistration: input.professionalRegistration || 'not_available',
      outcome: input.outcome,
      observations: input.observations,
      timestamp: now,
      inspectionItemId: input.inspectionItemId,
      itpRevisionNumber: itp.revisionNumber,
    };
    updateData.signOffRecord = signOffRecord;
    actorUserId = input.inspectorUserId!;
  } else {
    // No inspector — record SelfInspectionRecord
    const selfInspectionRecord: SelfInspectionRecord = {
      recordedByUserId: input.recordedByUserId!,
      outcome: input.outcome,
      observations: input.observations,
      timestamp: now,
    };
    updateData.selfInspectionRecord = selfInspectionRecord;
    actorUserId = input.recordedByUserId!;
  }

  // 7. Determine item status based on outcome
  switch (input.outcome) {
    case 'pass': {
      updateData.status = 'passed';
      break;
    }
    case 'fail': {
      updateData.status = 'failed';
      // Create linked NCR with severity based on spec category
      ncrData = {
        projectId: input.projectId,
        title: `Witness Point Failure: ${item.title}`,
        description: `Failed witness point inspection at ITP "${itp.title}" (revision ${itp.revisionNumber}), item #${item.sequenceNumber}. Spec: ${item.specificationReference}. Recorded by: ${input.inspectorAttended ? 'inspector' : 'contractor (self-inspection)'}. Source inspection item: ${input.inspectionItemId}. Source ITP: ${input.itpId}.`,
        severity: determineWitnessPointNCRSeverity(item.specificationCategory),
        sourceInspectionItemId: input.inspectionItemId,
        sourceItpId: input.itpId,
        createdBy: 'system:itp_service',
      };
      break;
    }
    case 'conditional_pass': {
      updateData.status = 'conditional';
      break;
    }
  }

  // 8. Persist the witness point outcome
  try {
    await updateDoc(itemDocument(input.projectId, input.itpId, input.inspectionItemId), updateData);

    // 9. Write audit record (includes professional registration per Requirement 10.3)
    const auditAction: ITPAuditAction = input.inspectorAttended
      ? 'inspection_signed_off'
      : 'inspection_self_recorded';

    await writeAuditRecord(
      input.projectId, 'inspection_item', input.inspectionItemId, auditAction,
      actorUserId,
      { status: item.status },
      { status: updateData.status, outcome: input.outcome, finalSignOffBy: witnessAttendance.finalSignOffBy },
      {
        itpId: input.itpId,
        inspectorAttended: input.inspectorAttended,
        professionalRegistration: input.inspectorAttended
          ? (input.professionalRegistration || 'not_available')
          : undefined,
        ncrData,
      },
    );

    // 10. Create linked NCR if witness point failed
    if (input.outcome === 'fail' && ncrData) {
      await createLinkedNCR({
        projectId: input.projectId,
        itpId: input.itpId,
        inspectionItemId: input.inspectionItemId,
        title: ncrData.title as string,
        description: ncrData.description as string,
        severity: ncrData.severity as Severity,
      });
    }

    // 11. Notify Action Centre — witness notification event (Requirement 11.2)
    // This fires when the witness point outcome is recorded, confirming the notification was triggered.
    await persistActionCentreEvent(createWitnessNotificationEvent({
      projectId: input.projectId,
      itpTitle: itp.title,
      itemTitle: item.title,
      itemId: input.inspectionItemId,
      scheduledDateTime: input.notificationSentAt,
      location: item.specificationReference,
      assignedRoles: mapInspectorRoleToAssignedRoles(item.responsibleInspectorRole),
    }));
  } catch (error) {
    if (error instanceof ITPServiceError) throw error;
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${input.projectId}/${ITPS_COL}/${input.itpId}/${ITEMS_COL}/${input.inspectionItemId}`);
  }
}

export interface AcknowledgeWitnessNotificationInput {
  projectId: string;
  itpId: string;
  inspectionItemId: string;
  inspectorUserId: string;
  response: 'acknowledged' | 'no_response';
}

/**
 * Records acknowledgement (or lack thereof) of a witness point notification.
 * Updates the witnessAttendance record on the inspection item with response and timestamp.
 */
export async function acknowledgeWitnessNotification(input: AcknowledgeWitnessNotificationInput, permCtx?: ITPPermissionContext): Promise<void> {
  // Permission enforcement: itp:read → all project members (acknowledging is a read-level action)
  enforcePermission(input.projectId, 'itp:read', permCtx);

  // 1. Verify the inspection item exists and is a witness_point
  const itemSnap = await getDoc(itemDocument(input.projectId, input.itpId, input.inspectionItemId));
  if (!itemSnap.exists()) {
    throw new ITPServiceError('not_found', `Inspection item ${input.inspectionItemId} not found`);
  }
  const item = { id: itemSnap.id, ...itemSnap.data() } as ITPInspectionItem;

  if (item.inspectionType !== 'witness_point') {
    throw new ITPServiceError(
      'validation_error',
      'Only witness point items can have notifications acknowledged',
      { inspectionItemId: 'Item is not a witness_point type' },
    );
  }

  // 2. Build or update the witness attendance record
  const now = new Date().toISOString();
  const existingAttendance = item.witnessAttendance;

  const witnessAttendance: WitnessAttendanceRecord = {
    notificationSentAt: existingAttendance?.notificationSentAt ?? now,
    inspectorResponse: input.response,
    responseTimestamp: now,
    attendance: existingAttendance?.attendance ?? 'not_attended',
    finalSignOffBy: existingAttendance?.finalSignOffBy ?? 'contractor_recorded',
  };

  // 3. Persist the acknowledgement
  try {
    await updateDoc(itemDocument(input.projectId, input.itpId, input.inspectionItemId), {
      witnessAttendance,
      updatedAt: now,
    });

    // 4. Write audit record
    const auditAction: ITPAuditAction = input.response === 'acknowledged'
      ? 'witness_acknowledged'
      : 'witness_no_response';

    await writeAuditRecord(
      input.projectId, 'inspection_item', input.inspectionItemId, auditAction,
      input.inspectorUserId,
      { witnessAttendance: existingAttendance ?? null },
      { witnessAttendance, response: input.response, responseTimestamp: now },
      { itpId: input.itpId },
    );
  } catch (error) {
    if (error instanceof ITPServiceError) throw error;
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${input.projectId}/${ITPS_COL}/${input.itpId}/${ITEMS_COL}/${input.inspectionItemId}`);
  }
}

/**
 * Determines NCR severity for a witness point failure based on specification category.
 * - structural/fire_safety (safety-critical) → 'high'
 * - All other categories → 'medium'
 */
export function determineWitnessPointNCRSeverity(specificationCategory?: string): 'high' | 'medium' {
  const highSeverityCategories = ['structural', 'fire_safety'];
  if (specificationCategory && highSeverityCategories.includes(specificationCategory)) {
    return 'high';
  }
  return 'medium';
}

// ── Material Testing Operations (Task 7.1) ───────────────────────────────────

/** Valid state machine transitions for MaterialTestStatus */
const MATERIAL_TEST_TRANSITIONS: Record<MaterialTestStatus, MaterialTestStatus[]> = {
  scheduled: ['sampled'],
  sampled: ['submitted_to_lab'],
  submitted_to_lab: ['results_received'],
  results_received: ['passed', 'failed'],
  passed: [],
  failed: ['ncr_resolved'],
  ncr_resolved: [],
};

/** Default turnaround days by test category */
const DEFAULT_TURNAROUND_DAYS: Partial<Record<SANSTestCategory, number>> = {
  concrete_7day: 7,
  concrete_28day: 28,
};

const MAX_TURNAROUND_DAYS = 90;

export interface CreateTestingScheduleInput {
  projectId: string;
  materialType: MaterialType;
  sansTestMethodReference: string;
  testCategory: SANSTestCategory;
  testFrequencyRatio: number;
  testFrequencyQuantity: number;
  unitOfMeasure: string;
  minSamplesPerTest: number;
  acceptanceThreshold: number;
  thresholdUnit: string;
  thresholdDirection: 'gte' | 'lte';
  expectedTurnaroundDays: number;
  constructionStage: ConstructionStage;
  approvedLaboratories: Array<{
    name: string;
    sanasAccreditationNumber: string;
    accreditedTestMethods: string[];
    isActive: boolean;
  }>;
  createdBy: string;
}

/**
 * Creates a new testing schedule for a project.
 * Validates input via createTestingScheduleSchema and persists to `projects/{pid}/testing_schedules`.
 */
export async function createTestingSchedule(input: CreateTestingScheduleInput, permCtx?: ITPPermissionContext): Promise<string> {
  // Permission enforcement: itp:create → engineer, architect (creating test schedules is an ITP write operation)
  enforcePermission(input.projectId, 'itp:create', permCtx);

  // 1. Validate input via Zod
  const parsed = createTestingScheduleSchema.safeParse({
    projectId: input.projectId,
    materialType: input.materialType,
    sansTestMethodReference: input.sansTestMethodReference,
    testCategory: input.testCategory,
    testFrequencyRatio: input.testFrequencyRatio,
    testFrequencyQuantity: input.testFrequencyQuantity,
    unitOfMeasure: input.unitOfMeasure,
    minSamplesPerTest: input.minSamplesPerTest,
    acceptanceThreshold: input.acceptanceThreshold,
    thresholdUnit: input.thresholdUnit,
    thresholdDirection: input.thresholdDirection,
    expectedTurnaroundDays: input.expectedTurnaroundDays,
    constructionStage: input.constructionStage,
    approvedLaboratories: input.approvedLaboratories,
  });

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    parsed.error.errors.forEach((e) => {
      fields[e.path.join('.')] = e.message;
    });
    throw new ITPServiceError('validation_error', 'Invalid testing schedule input', fields);
  }

  // 2. Build schedule record
  const now = new Date().toISOString();
  const scheduleData: Omit<TestingSchedule, 'id'> = {
    projectId: parsed.data.projectId,
    materialType: parsed.data.materialType,
    sansTestMethodReference: parsed.data.sansTestMethodReference,
    testCategory: parsed.data.testCategory as SANSTestCategory,
    testFrequencyRatio: parsed.data.testFrequencyRatio,
    testFrequencyQuantity: parsed.data.testFrequencyQuantity,
    unitOfMeasure: parsed.data.unitOfMeasure,
    minSamplesPerTest: parsed.data.minSamplesPerTest,
    acceptanceThreshold: parsed.data.acceptanceThreshold,
    thresholdUnit: parsed.data.thresholdUnit,
    thresholdDirection: parsed.data.thresholdDirection as 'gte' | 'lte',
    expectedTurnaroundDays: parsed.data.expectedTurnaroundDays,
    constructionStage: parsed.data.constructionStage as ConstructionStage,
    approvedLaboratories: parsed.data.approvedLaboratories as TestingSchedule['approvedLaboratories'],
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  // 3. Persist to Firestore
  try {
    const ref = await addDoc(testingSchedulesCollection(input.projectId), scheduleData);
    await writeAuditRecord(
      input.projectId, 'testing_schedule', ref.id, 'test_schedule_created',
      input.createdBy, {}, scheduleData as unknown as Record<string, unknown>,
    );
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${input.projectId}/${TESTING_SCHEDULES_COL}`);
    throw error;
  }
}

export interface UpdateTestingScheduleInput {
  materialType?: MaterialType;
  sansTestMethodReference?: string;
  testCategory?: SANSTestCategory;
  testFrequencyRatio?: number;
  testFrequencyQuantity?: number;
  unitOfMeasure?: string;
  minSamplesPerTest?: number;
  acceptanceThreshold?: number;
  thresholdUnit?: string;
  thresholdDirection?: 'gte' | 'lte';
  expectedTurnaroundDays?: number;
  constructionStage?: ConstructionStage;
  approvedLaboratories?: Array<{
    name: string;
    sanasAccreditationNumber: string;
    accreditedTestMethods: string[];
    isActive: boolean;
  }>;
  actorUserId: string;
}

/**
 * Updates an existing testing schedule.
 * Changes only apply to future tests — tests created AFTER the modification retain original params.
 * Previously created Material_Tests keep the original parameters from the schedule at their creation time.
 */
export async function updateTestingSchedule(
  projectId: string,
  scheduleId: string,
  updates: UpdateTestingScheduleInput,
  permCtx?: ITPPermissionContext,
): Promise<void> {
  // Permission enforcement: itp:create → engineer, architect (modifying test schedules is an ITP write operation)
  enforcePermission(projectId, 'itp:create', permCtx);

  // 1. Verify schedule exists
  let existingSchedule: TestingSchedule;
  try {
    const snap = await getDoc(testingScheduleDocument(projectId, scheduleId));
    if (!snap.exists()) {
      throw new ITPServiceError('not_found', `Testing schedule ${scheduleId} not found in project ${projectId}`);
    }
    existingSchedule = { id: snap.id, ...snap.data() } as TestingSchedule;
  } catch (error) {
    if (error instanceof ITPServiceError) throw error;
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${TESTING_SCHEDULES_COL}/${scheduleId}`);
    throw error;
  }

  // 2. Validate updates via Zod partial schema
  const { actorUserId, ...updateFields } = updates;
  const parsed = updateTestingScheduleSchema.safeParse(updateFields);

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    parsed.error.errors.forEach((e) => {
      fields[e.path.join('.')] = e.message;
    });
    throw new ITPServiceError('validation_error', 'Invalid testing schedule update', fields);
  }

  // 3. Build update payload
  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = { updatedAt: now };

  if (parsed.data.materialType !== undefined) updateData.materialType = parsed.data.materialType;
  if (parsed.data.sansTestMethodReference !== undefined) updateData.sansTestMethodReference = parsed.data.sansTestMethodReference;
  if (parsed.data.testCategory !== undefined) updateData.testCategory = parsed.data.testCategory;
  if (parsed.data.testFrequencyRatio !== undefined) updateData.testFrequencyRatio = parsed.data.testFrequencyRatio;
  if (parsed.data.testFrequencyQuantity !== undefined) updateData.testFrequencyQuantity = parsed.data.testFrequencyQuantity;
  if (parsed.data.unitOfMeasure !== undefined) updateData.unitOfMeasure = parsed.data.unitOfMeasure;
  if (parsed.data.minSamplesPerTest !== undefined) updateData.minSamplesPerTest = parsed.data.minSamplesPerTest;
  if (parsed.data.acceptanceThreshold !== undefined) updateData.acceptanceThreshold = parsed.data.acceptanceThreshold;
  if (parsed.data.thresholdUnit !== undefined) updateData.thresholdUnit = parsed.data.thresholdUnit;
  if (parsed.data.thresholdDirection !== undefined) updateData.thresholdDirection = parsed.data.thresholdDirection;
  if (parsed.data.expectedTurnaroundDays !== undefined) updateData.expectedTurnaroundDays = parsed.data.expectedTurnaroundDays;
  if (parsed.data.constructionStage !== undefined) updateData.constructionStage = parsed.data.constructionStage;
  if (parsed.data.approvedLaboratories !== undefined) updateData.approvedLaboratories = parsed.data.approvedLaboratories;

  // 4. Persist update (only affects the schedule record — existing Material_Tests retain their original params)
  try {
    await updateDoc(testingScheduleDocument(projectId, scheduleId), updateData);
    await writeAuditRecord(
      projectId, 'testing_schedule', scheduleId, 'test_schedule_updated',
      actorUserId,
      {
        materialType: existingSchedule.materialType,
        testFrequencyRatio: existingSchedule.testFrequencyRatio,
        testFrequencyQuantity: existingSchedule.testFrequencyQuantity,
        acceptanceThreshold: existingSchedule.acceptanceThreshold,
        expectedTurnaroundDays: existingSchedule.expectedTurnaroundDays,
      },
      updateData,
      { note: 'Changes apply only to material tests created after this modification' },
    );
  } catch (error) {
    if (error instanceof ITPServiceError) throw error;
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${TESTING_SCHEDULES_COL}/${scheduleId}`);
  }
}

export interface GetTestingSchedulesFilters {
  materialType?: MaterialType;
}

/**
 * Lists testing schedules for a project with optional material type filter.
 */
export async function getTestingSchedules(
  projectId: string,
  filters?: GetTestingSchedulesFilters,
  permCtx?: ITPPermissionContext,
): Promise<TestingSchedule[]> {
  // Permission enforcement: itp:read → all project members
  enforcePermission(projectId, 'itp:read', permCtx);

  try {
    let q;
    if (filters?.materialType) {
      q = query(
        testingSchedulesCollection(projectId),
        where('materialType', '==', filters.materialType),
        orderBy('createdAt', 'desc'),
      );
    } else {
      q = query(testingSchedulesCollection(projectId), orderBy('createdAt', 'desc'));
    }

    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TestingSchedule, 'id'>) }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${PROJECTS_COL}/${projectId}/${TESTING_SCHEDULES_COL}`);
    throw error;
  }
}

export interface CreateMaterialTestInput {
  projectId: string;
  testingScheduleId: string;
  sampleId: string;
  materialType: MaterialType;
  testCategory: SANSTestCategory;
  sansTestMethodReference: string;
  dateSampled: string;
  testingLaboratoryName: string;
  linkedInspectionItemIds?: string[];
  createdBy: string;
  /** Optional override for expectedTurnaroundDays; if not provided, uses schedule default or category default */
  expectedTurnaroundDaysOverride?: number;
}

/**
 * Creates a new material test record.
 * Calculates `dateTestDue = dateSampled + expectedTurnaroundDays`:
 * - Defaults: 7 days for concrete_7day, 28 days for concrete_28day
 * - Other categories: uses the expectedTurnaroundDays from the testing schedule
 * - Max: 90 days
 * Persists to `projects/{pid}/material_tests`.
 */
export async function createMaterialTest(input: CreateMaterialTestInput, permCtx?: ITPPermissionContext): Promise<string> {
  // Permission enforcement: test:record_result → engineer, site_manager
  enforcePermission(input.projectId, 'test:record_result', permCtx);

  // 1. Validate required fields
  if (!input.projectId || !input.testingScheduleId || !input.sampleId || !input.dateSampled || !input.testingLaboratoryName) {
    throw new ITPServiceError('validation_error', 'Missing required fields for material test creation', {
      projectId: !input.projectId ? 'Required' : '',
      testingScheduleId: !input.testingScheduleId ? 'Required' : '',
      sampleId: !input.sampleId ? 'Required' : '',
      dateSampled: !input.dateSampled ? 'Required' : '',
      testingLaboratoryName: !input.testingLaboratoryName ? 'Required' : '',
    });
  }

  // 2. Determine turnaround days
  let turnaroundDays: number;
  if (input.expectedTurnaroundDaysOverride !== undefined) {
    turnaroundDays = Math.min(input.expectedTurnaroundDaysOverride, MAX_TURNAROUND_DAYS);
  } else if (DEFAULT_TURNAROUND_DAYS[input.testCategory] !== undefined) {
    turnaroundDays = DEFAULT_TURNAROUND_DAYS[input.testCategory]!;
  } else {
    // Fetch from testing schedule
    try {
      const schedSnap = await getDoc(testingScheduleDocument(input.projectId, input.testingScheduleId));
      if (schedSnap.exists()) {
        const sched = schedSnap.data() as Omit<TestingSchedule, 'id'>;
        turnaroundDays = Math.min(sched.expectedTurnaroundDays, MAX_TURNAROUND_DAYS);
      } else {
        // Fallback to 7 days if schedule not found
        turnaroundDays = 7;
      }
    } catch {
      turnaroundDays = 7;
    }
  }

  // 3. Calculate dateTestDue = dateSampled + turnaroundDays
  const sampledDate = new Date(input.dateSampled);
  const dueDate = new Date(sampledDate);
  dueDate.setDate(dueDate.getDate() + turnaroundDays);
  const dateTestDue = dueDate.toISOString();

  // 4. Build material test record
  const now = new Date().toISOString();
  const testData: Omit<MaterialTest, 'id'> = {
    projectId: input.projectId,
    testingScheduleId: input.testingScheduleId,
    sampleId: input.sampleId,
    materialType: input.materialType,
    testCategory: input.testCategory,
    sansTestMethodReference: input.sansTestMethodReference,
    dateSampled: input.dateSampled,
    dateTestDue,
    testingLaboratoryName: input.testingLaboratoryName,
    status: 'scheduled',
    linkedInspectionItemIds: input.linkedInspectionItemIds ?? [],
    isPriority: false,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  // 5. Persist to Firestore
  try {
    const ref = await addDoc(materialTestsCollection(input.projectId), testData);
    await writeAuditRecord(
      input.projectId, 'material_test', ref.id, 'material_test_created',
      input.createdBy, {}, testData as unknown as Record<string, unknown>,
      { turnaroundDays, dateTestDue },
    );
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${input.projectId}/${MATERIAL_TESTS_COL}`);
    throw error;
  }
}

// ── Material Test Listing ────────────────────────────────────────────────────

export interface GetMaterialTestsFilters {
  status?: MaterialTestStatus;
  materialType?: MaterialType;
}

/**
 * Lists material tests for a project with optional status and materialType filters.
 */
export async function getMaterialTests(
  projectId: string,
  filters?: GetMaterialTestsFilters,
  permCtx?: ITPPermissionContext,
): Promise<MaterialTest[]> {
  // Permission enforcement: itp:read → all project members
  enforcePermission(projectId, 'itp:read', permCtx);

  try {
    let q;
    if (filters?.status && filters?.materialType) {
      q = query(
        materialTestsCollection(projectId),
        where('status', '==', filters.status),
        where('materialType', '==', filters.materialType),
        orderBy('createdAt', 'desc'),
      );
    } else if (filters?.status) {
      q = query(
        materialTestsCollection(projectId),
        where('status', '==', filters.status),
        orderBy('createdAt', 'desc'),
      );
    } else if (filters?.materialType) {
      q = query(
        materialTestsCollection(projectId),
        where('materialType', '==', filters.materialType),
        orderBy('createdAt', 'desc'),
      );
    } else {
      q = query(materialTestsCollection(projectId), orderBy('createdAt', 'desc'));
    }

    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MaterialTest, 'id'>) }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${PROJECTS_COL}/${projectId}/${MATERIAL_TESTS_COL}`);
    throw error;
  }
}

/**
 * Updates the status of a material test, enforcing the state machine transitions:
 * scheduled → sampled → submitted_to_lab → results_received → passed/failed
 */
export async function updateMaterialTestStatus(
  projectId: string,
  testId: string,
  newStatus: MaterialTestStatus,
  actorUserId: string,
  permCtx?: ITPPermissionContext,
): Promise<void> {
  // Permission enforcement: test:record_result → engineer, site_manager
  enforcePermission(projectId, 'test:record_result', permCtx);

  // 1. Fetch current test record
  let existingTest: MaterialTest;
  try {
    const snap = await getDoc(materialTestDocument(projectId, testId));
    if (!snap.exists()) {
      throw new ITPServiceError('not_found', `Material test ${testId} not found in project ${projectId}`);
    }
    existingTest = { id: snap.id, ...snap.data() } as MaterialTest;
  } catch (error) {
    if (error instanceof ITPServiceError) throw error;
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${MATERIAL_TESTS_COL}/${testId}`);
    throw error;
  }

  // 2. Enforce state machine transitions
  const allowedTransitions = MATERIAL_TEST_TRANSITIONS[existingTest.status];
  if (!allowedTransitions || !allowedTransitions.includes(newStatus)) {
    throw new ITPServiceError(
      'invalid_state_transition',
      `Cannot transition material test from '${existingTest.status}' to '${newStatus}'. Allowed transitions: ${allowedTransitions?.join(', ') || 'none'}`,
    );
  }

  // 3. Persist status update
  const now = new Date().toISOString();
  try {
    await updateDoc(materialTestDocument(projectId, testId), {
      status: newStatus,
      updatedAt: now,
    });
    await writeAuditRecord(
      projectId, 'material_test', testId, 'material_test_status_changed',
      actorUserId,
      { status: existingTest.status },
      { status: newStatus },
    );
  } catch (error) {
    if (error instanceof ITPServiceError) throw error;
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${MATERIAL_TESTS_COL}/${testId}`);
  }
}

export interface OverdueTest {
  id: string;
  sampleId: string;
  materialType: MaterialType;
  testCategory: SANSTestCategory;
  sansTestMethodReference: string;
  dateTestDue: string;
  daysOverdue: number;
  status: MaterialTestStatus;
}

/**
 * Returns tests where dateTestDue has passed and status is not results_received/passed/failed.
 * These are tests that haven't completed by their due date — pure query function (no side effects).
 */
export async function checkOverdueTests(projectId: string): Promise<OverdueTest[]> {
  try {
    const snap = await getDocs(materialTestsCollection(projectId));
    const now = new Date();
    const overdueTests: OverdueTest[] = [];

    // Terminal/completed statuses that are NOT overdue
    const completedStatuses: MaterialTestStatus[] = ['results_received', 'passed', 'failed', 'ncr_resolved'];

    snap.docs.forEach((d) => {
      const test = { id: d.id, ...d.data() } as MaterialTest;

      // Skip tests that have reached a completed state
      if (completedStatuses.includes(test.status)) {
        return;
      }

      // Check if dateTestDue has passed
      const dueDate = new Date(test.dateTestDue);
      if (now.getTime() > dueDate.getTime()) {
        const diffMs = now.getTime() - dueDate.getTime();
        const daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        overdueTests.push({
          id: test.id,
          sampleId: test.sampleId,
          materialType: test.materialType,
          testCategory: test.testCategory,
          sansTestMethodReference: test.sansTestMethodReference,
          dateTestDue: test.dateTestDue,
          daysOverdue,
          status: test.status,
        });
      }
    });

    return overdueTests;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${PROJECTS_COL}/${projectId}/${MATERIAL_TESTS_COL}`);
    throw error;
  }
}

export interface TestingComplianceGap {
  testingScheduleId: string;
  materialType: MaterialType;
  testCategory: SANSTestCategory;
  cumulativeQuantity: number;
  frequencyQuantity: number;
  requiredTests: number;
  completedTests: number;
  gapCount: number;
}

/**
 * Checks for testing compliance gaps.
 * A gap exists when: `floor(cumulativeQuantity / frequencyQuantity) - completedTests >= 1`
 * This is a pure calculation function — it doesn't trigger side effects.
 *
 * @param projectId - The project ID
 * @param cumulativeQuantities - Map of testingScheduleId → cumulative quantity placed
 */
export async function checkTestingComplianceGap(
  projectId: string,
  cumulativeQuantities: Record<string, number>,
): Promise<TestingComplianceGap[]> {
  const gaps: TestingComplianceGap[] = [];

  // 1. Fetch all testing schedules for the project
  const schedules = await getTestingSchedules(projectId);

  // 2. Fetch all material tests for the project
  let allTests: MaterialTest[];
  try {
    const snap = await getDocs(materialTestsCollection(projectId));
    allTests = snap.docs.map((d) => ({ id: d.id, ...d.data() } as MaterialTest));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${PROJECTS_COL}/${projectId}/${MATERIAL_TESTS_COL}`);
    throw error;
  }

  // 3. For each schedule that has a cumulative quantity entry, calculate the gap
  for (const schedule of schedules) {
    const cumulativeQuantity = cumulativeQuantities[schedule.id];
    if (cumulativeQuantity === undefined || cumulativeQuantity <= 0) {
      continue;
    }

    // Count completed tests for this schedule (passed or failed — results have been received)
    const completedStatuses: MaterialTestStatus[] = ['results_received', 'passed', 'failed', 'ncr_resolved'];
    const completedTests = allTests.filter(
      (t) => t.testingScheduleId === schedule.id && completedStatuses.includes(t.status),
    ).length;

    // Calculate required tests = floor(cumulativeQuantity / frequencyQuantity)
    const requiredTests = Math.floor(cumulativeQuantity / schedule.testFrequencyQuantity);

    // Gap exists when requiredTests - completedTests >= 1
    const gapCount = requiredTests - completedTests;
    if (gapCount >= 1) {
      gaps.push({
        testingScheduleId: schedule.id,
        materialType: schedule.materialType,
        testCategory: schedule.testCategory,
        cumulativeQuantity,
        frequencyQuantity: schedule.testFrequencyQuantity,
        requiredTests,
        completedTests,
        gapCount,
      });
    }
  }

  return gaps;
}

// ── Lab Result Recording (Task 7.2) ──────────────────────────────────────────

export interface RecordLabResultInput {
  projectId: string;
  materialTestId: string;
  testDate: string;
  resultValue: number;
  resultUnit: string;
  testingLaboratoryName: string;
  labReportReference: string;
  recordedBy: string;
  attachmentUrl?: string;
  attachmentFileName?: string;
}

/**
 * Evaluates whether a result value passes or fails the acceptance threshold.
 * - 'gte': pass if resultValue >= threshold (minimum threshold)
 * - 'lte': pass if resultValue <= threshold (maximum threshold)
 */
export function evaluateThreshold(resultValue: number, threshold: number, direction: 'gte' | 'lte'): 'pass' | 'fail' {
  if (direction === 'gte') return resultValue >= threshold ? 'pass' : 'fail';
  return resultValue <= threshold ? 'pass' : 'fail';
}

/**
 * Determines NCR severity for a material test failure based on material type.
 * - concrete, steel → 'critical'
 * - soil → 'high'
 * - aggregate, bituminous → 'medium'
 * - default (unknown) → 'medium'
 */
export function determineMaterialTestNCRSeverity(materialType: MaterialType): 'critical' | 'high' | 'medium' {
  switch (materialType) {
    case 'concrete':
    case 'steel':
      return 'critical';
    case 'soil':
      return 'high';
    case 'aggregate':
    case 'bituminous':
      return 'medium';
    default:
      return 'medium';
  }
}

export interface MaterialPassRate {
  materialType: MaterialType;
  passedTests: number;
  completedTests: number;
  passRate: number; // percentage to one decimal place
}

/**
 * Records a lab result for a material test.
 *
 * Steps:
 * 1. Validate input via recordLabResultSchema
 * 2. Validate result unit matches the testing schedule's threshold unit
 * 3. Validate testing laboratory is SANAS-accredited for the test method
 * 4. Reject duplicate lab report references for the same material test
 * 5. Evaluate threshold (gte/lte comparison)
 * 6. On pass: update MaterialTest status to 'passed'
 * 7. On fail: update MaterialTest status to 'failed', prepare NCR data with material-based severity
 * 8. For concrete 7-day failures: flag matching 28-day test as isPriority=true
 * 9. Recalculate material pass rate for the project
 * 10. Store result in subcollection AND update parent test status
 * 11. Write audit record
 */
export async function recordLabResult(input: RecordLabResultInput, permCtx?: ITPPermissionContext): Promise<void> {
  // Permission enforcement: test:record_result → engineer, site_manager
  enforcePermission(input.projectId, 'test:record_result', permCtx);

  // 1. Validate input via recordLabResultSchema
  const parsed = recordLabResultSchema.safeParse({
    materialTestId: input.materialTestId,
    testDate: input.testDate,
    resultValue: input.resultValue,
    resultUnit: input.resultUnit,
    testingLaboratoryName: input.testingLaboratoryName,
    labReportReference: input.labReportReference,
  });

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    parsed.error.errors.forEach((e) => {
      fields[e.path.join('.')] = e.message;
    });
    throw new ITPServiceError('validation_error', 'Invalid lab result input', fields);
  }

  // Fetch the material test
  let materialTest: MaterialTest;
  try {
    const testSnap = await getDoc(materialTestDocument(input.projectId, input.materialTestId));
    if (!testSnap.exists()) {
      throw new ITPServiceError('not_found', `Material test ${input.materialTestId} not found in project ${input.projectId}`);
    }
    materialTest = { id: testSnap.id, ...testSnap.data() } as MaterialTest;
  } catch (error) {
    if (error instanceof ITPServiceError) throw error;
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${input.projectId}/${MATERIAL_TESTS_COL}/${input.materialTestId}`);
    throw error;
  }

  // Fetch the testing schedule for threshold and unit info
  let testingSchedule: TestingSchedule;
  try {
    const schedSnap = await getDoc(testingScheduleDocument(input.projectId, materialTest.testingScheduleId));
    if (!schedSnap.exists()) {
      throw new ITPServiceError('not_found', `Testing schedule ${materialTest.testingScheduleId} not found`);
    }
    testingSchedule = { id: schedSnap.id, ...schedSnap.data() } as TestingSchedule;
  } catch (error) {
    if (error instanceof ITPServiceError) throw error;
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${input.projectId}/${TESTING_SCHEDULES_COL}/${materialTest.testingScheduleId}`);
    throw error;
  }

  // 2. Validate result unit matches the testing schedule's threshold unit
  if (input.resultUnit !== testingSchedule.thresholdUnit) {
    throw new ITPServiceError(
      'unit_mismatch',
      `Result unit '${input.resultUnit}' does not match the expected unit '${testingSchedule.thresholdUnit}' defined in the testing schedule`,
      { resultUnit: `Expected '${testingSchedule.thresholdUnit}'` },
    );
  }

  // 3. Validate testing laboratory is SANAS-accredited for the test method
  const activeLabs = testingSchedule.approvedLaboratories.filter((lab) => lab.isActive);
  const accreditedLab = activeLabs.find(
    (lab) =>
      lab.name === input.testingLaboratoryName &&
      lab.accreditedTestMethods.includes(testingSchedule.sansTestMethodReference),
  );

  if (!accreditedLab) {
    throw new ITPServiceError(
      'lab_not_accredited',
      `Laboratory '${input.testingLaboratoryName}' is not SANAS-accredited for test method '${testingSchedule.sansTestMethodReference}' in the project's approved laboratory register`,
      { testingLaboratoryName: `Not accredited for ${testingSchedule.sansTestMethodReference}` },
    );
  }

  // 4. Reject duplicate lab report references for the same material test
  try {
    const existingResultsSnap = await getDocs(labResultsCollection(input.projectId, input.materialTestId));
    const hasDuplicate = existingResultsSnap.docs.some((d) => {
      const data = d.data() as Omit<LabResult, 'id'>;
      return data.labReportReference === input.labReportReference;
    });

    if (hasDuplicate) {
      throw new ITPServiceError(
        'duplicate_lab_report',
        `Lab report reference '${input.labReportReference}' has already been recorded for this material test`,
        { labReportReference: 'Duplicate report reference' },
      );
    }
  } catch (error) {
    if (error instanceof ITPServiceError) throw error;
    handleFirestoreError(error, OperationType.LIST, `${PROJECTS_COL}/${input.projectId}/${MATERIAL_TESTS_COL}/${input.materialTestId}/results`);
    throw error;
  }

  // 5. Evaluate threshold
  const passFail = evaluateThreshold(
    input.resultValue,
    testingSchedule.acceptanceThreshold,
    testingSchedule.thresholdDirection,
  );

  // 6 & 7. Determine new material test status and prepare NCR data if failed
  const newTestStatus: MaterialTestStatus = passFail === 'pass' ? 'passed' : 'failed';
  let ncrData: Record<string, unknown> | null = null;

  if (passFail === 'fail') {
    const severity = determineMaterialTestNCRSeverity(materialTest.materialType);
    ncrData = {
      projectId: input.projectId,
      title: `Material Test Failure: ${materialTest.sansTestMethodReference} - ${materialTest.sampleId}`,
      description: `Failed material test (${materialTest.materialType}). Test method: ${materialTest.sansTestMethodReference}. Result: ${input.resultValue} ${input.resultUnit}. Acceptance threshold: ${testingSchedule.acceptanceThreshold} ${testingSchedule.thresholdUnit} (direction: ${testingSchedule.thresholdDirection}). Source material test: ${input.materialTestId}.`,
      severity,
      sourceMaterialTestId: input.materialTestId,
      createdBy: 'system:itp_service',
    };
  }

  // 8. For concrete 7-day failures: flag matching 28-day test as isPriority=true
  if (passFail === 'fail' && materialTest.testCategory === 'concrete_7day') {
    try {
      const testsSnap = await getDocs(
        query(
          materialTestsCollection(input.projectId),
          where('sampleId', '==', materialTest.sampleId),
          where('testCategory', '==', 'concrete_28day'),
        ),
      );
      const now28 = new Date().toISOString();
      for (const testDoc of testsSnap.docs) {
        await updateDoc(testDoc.ref, { isPriority: true, updatedAt: now28 });
      }
      if (!testsSnap.empty) {
        console.info(`[ITP] Flagged ${testsSnap.size} matching 28-day test(s) as priority for sample ${materialTest.sampleId}`);
      }
    } catch (error) {
      // Non-critical: log but don't fail the result recording
      console.error('[ITP] Failed to flag 28-day priority test:', error);
    }
  }

  // 10. Store result in subcollection AND update parent test status
  const now = new Date().toISOString();
  const labResultData: Omit<LabResult, 'id'> = {
    materialTestId: input.materialTestId,
    projectId: input.projectId,
    testDate: input.testDate,
    resultValue: input.resultValue,
    resultUnit: input.resultUnit,
    testingLaboratoryName: input.testingLaboratoryName,
    labReportReference: input.labReportReference,
    passFail,
    recordedBy: input.recordedBy,
    attachmentUrl: input.attachmentUrl,
    attachmentFileName: input.attachmentFileName,
    createdAt: now,
  };

  try {
    // Store lab result in subcollection
    await addDoc(labResultsCollection(input.projectId, input.materialTestId), labResultData);

    // Update parent material test status
    await updateDoc(materialTestDocument(input.projectId, input.materialTestId), {
      status: newTestStatus,
      updatedAt: now,
    });
  } catch (error) {
    if (error instanceof ITPServiceError) throw error;
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${input.projectId}/${MATERIAL_TESTS_COL}/${input.materialTestId}/results`);
    throw error;
  }

  // 9. Recalculate material pass rate (best-effort, non-blocking)
  try {
    await calculateMaterialPassRate(input.projectId, materialTest.materialType);
  } catch (error) {
    console.error('[ITP] Failed to recalculate material pass rate:', error);
  }

  // 11. Write audit record
  await writeAuditRecord(
    input.projectId, 'lab_result', input.materialTestId, 'lab_result_recorded',
    input.recordedBy,
    { status: materialTest.status },
    { status: newTestStatus, passFail, resultValue: input.resultValue, resultUnit: input.resultUnit },
    { labReportReference: input.labReportReference, ncrData },
  );

  // 12. Create linked NCR if material test failed
  if (passFail === 'fail' && ncrData) {
    await createLinkedNCR({
      projectId: input.projectId,
      materialTestId: input.materialTestId,
      title: ncrData.title as string,
      description: ncrData.description as string,
      severity: ncrData.severity as Severity,
    });

    // 13. Notify Action Centre — test failure event (Requirement 11.5)
    await persistActionCentreEvent(createTestFailureEvent({
      projectId: input.projectId,
      materialTestId: input.materialTestId,
      materialType: materialTest.materialType,
      testMethod: materialTest.sansTestMethodReference,
      resultValue: input.resultValue,
      acceptanceThreshold: testingSchedule.acceptanceThreshold,
      resultUnit: input.resultUnit,
      assignedRoles: buildTestAssignedRoles(),
    }));
  }
}

/**
 * Calculates the material pass rate for a specific material type on a project.
 * Pass rate = (passed tests / completed tests) expressed as a percentage to one decimal place.
 * Completed tests = tests with status 'passed' or 'failed'.
 */
export async function calculateMaterialPassRate(
  projectId: string,
  materialType: MaterialType,
): Promise<MaterialPassRate> {
  try {
    const snap = await getDocs(
      query(
        materialTestsCollection(projectId),
        where('materialType', '==', materialType),
      ),
    );

    const allTests = snap.docs.map((d) => ({ id: d.id, ...d.data() } as MaterialTest));
    const completedTests = allTests.filter((t) => t.status === 'passed' || t.status === 'failed');
    const passedTests = completedTests.filter((t) => t.status === 'passed');

    const passRate = completedTests.length > 0
      ? Math.round((passedTests.length / completedTests.length) * 1000) / 10
      : 100.0;

    return {
      materialType,
      passedTests: passedTests.length,
      completedTests: completedTests.length,
      passRate,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${PROJECTS_COL}/${projectId}/${MATERIAL_TESTS_COL}`);
    throw error;
  }
}

// ── NCR Integration (Task 8.1) ───────────────────────────────────────────────

/**
 * Creates a linked NCR from an inspection failure or material test failure.
 * - Calls ncrService.createNcr() with appropriate title, description, and severity
 * - Stores source reference in NCR description (bidirectional link)
 * - Stores returned ncrId back on the source item/test
 * - If NCR creation fails: logs error, does NOT block status transition, writes audit noting failure
 */
export async function createLinkedNCR(params: {
  projectId: string;
  itpId?: string;
  inspectionItemId?: string;
  materialTestId?: string;
  title: string;
  description: string;
  severity: Severity;
  responsiblePartyId?: string;
}): Promise<string | null> {
  try {
    const ncrId = await createNcr({
      projectId: params.projectId,
      title: params.title,
      description: params.description,
      severity: params.severity,
      responsiblePartyId: params.responsiblePartyId || 'system:itp_service',
      createdBy: 'system:itp_service',
    });

    // Store ncrId back on the source item or test
    if (params.inspectionItemId && params.itpId) {
      try {
        await updateDoc(itemDocument(params.projectId, params.itpId, params.inspectionItemId), {
          ncrId,
          updatedAt: new Date().toISOString(),
        });
      } catch (linkError) {
        console.error('[ITP] Failed to store ncrId on inspection item:', linkError);
      }
    }

    if (params.materialTestId) {
      try {
        await updateDoc(materialTestDocument(params.projectId, params.materialTestId), {
          ncrId,
          updatedAt: new Date().toISOString(),
        });
      } catch (linkError) {
        console.error('[ITP] Failed to store ncrId on material test:', linkError);
      }
    }

    // Write audit record for NCR creation
    const entityId = params.inspectionItemId || params.materialTestId || 'unknown';
    const entityType = params.inspectionItemId ? 'inspection_item' : 'material_test';
    await writeAuditRecord(
      params.projectId, entityType as 'inspection_item' | 'material_test', entityId, 'ncr_created',
      'system:itp_service',
      {},
      { ncrId, severity: params.severity, title: params.title },
      {
        sourceItpId: params.itpId,
        sourceInspectionItemId: params.inspectionItemId,
        sourceMaterialTestId: params.materialTestId,
      },
    );

    return ncrId;
  } catch (error) {
    // NCR creation failed — log error but do NOT block the calling operation
    console.error('[ITP] Failed to create linked NCR:', error);

    // Write audit record noting the failure
    const entityId = params.inspectionItemId || params.materialTestId || 'unknown';
    const entityType = params.inspectionItemId ? 'inspection_item' : 'material_test';
    await writeAuditRecord(
      params.projectId, entityType as 'inspection_item' | 'material_test', entityId, 'ncr_created',
      'system:itp_service',
      {},
      { ncrCreationFailed: true, error: String(error) },
      {
        sourceItpId: params.itpId,
        sourceInspectionItemId: params.inspectionItemId,
        sourceMaterialTestId: params.materialTestId,
        title: params.title,
        severity: params.severity,
      },
    );

    return null;
  }
}

/**
 * Handles NCR closure — called by the NCR_Manager when a linked NCR transitions to 'verified_closed'.
 *
 * This function is the callback entry point for the NCR lifecycle event. The NCR service
 * should invoke this function when an NCR transitions to 'verified_closed' status, enabling
 * the ITP system to resolve the originating inspection item or material test.
 *
 * Updates the originating InspectionItem or MaterialTest status to 'ncr_resolved'.
 *
 * @param projectId - The project containing the NCR
 * @param ncrId - The NCR that has transitioned to 'verified_closed'
 *
 * Validates: Requirements 7.4
 */
export async function handleNCRClosed(projectId: string, ncrId: string): Promise<void> {
  // Search for inspection items with this ncrId across all ITPs
  const itps = await getITPs(projectId);

  for (const itp of itps) {
    const items = await getAllItems(projectId, itp.id);
    const linkedItem = items.find((item) => item.ncrId === ncrId);

    if (linkedItem) {
      const now = new Date().toISOString();
      await updateDoc(itemDocument(projectId, itp.id, linkedItem.id), {
        status: 'ncr_resolved',
        updatedAt: now,
      });

      await writeAuditRecord(
        projectId, 'inspection_item', linkedItem.id, 'ncr_resolved',
        'system:itp_service',
        { status: linkedItem.status, ncrId },
        { status: 'ncr_resolved' },
        { itpId: itp.id, ncrId },
      );
      return;
    }
  }

  // Search for material tests with this ncrId
  try {
    const testsSnap = await getDocs(materialTestsCollection(projectId));
    for (const testDoc of testsSnap.docs) {
      const test = { id: testDoc.id, ...testDoc.data() } as MaterialTest;
      if (test.ncrId === ncrId) {
        const now = new Date().toISOString();
        await updateDoc(materialTestDocument(projectId, test.id), {
          status: 'ncr_resolved',
          updatedAt: now,
        });

        await writeAuditRecord(
          projectId, 'material_test', test.id, 'ncr_resolved',
          'system:itp_service',
          { status: test.status, ncrId },
          { status: 'ncr_resolved' },
          { ncrId },
        );
        return;
      }
    }
  } catch (error) {
    console.error('[ITP] Failed to search material tests for NCR closure:', error);
  }
}

/**
 * Checks if an inspection item is blocked by an open NCR.
 * While a linked NCR remains open ('open' or 'corrective_action_submitted'),
 * the item cannot be marked 'passed'.
 *
 * @returns Object with `blocked` flag and the NCR status for display purposes
 */
export async function isBlockedByOpenNCR(
  projectId: string,
  itpId: string,
  itemId: string,
): Promise<{ blocked: boolean; ncrStatus?: string; ncrId?: string }> {
  // Get the inspection item
  const itemSnap = await getDoc(itemDocument(projectId, itpId, itemId));
  if (!itemSnap.exists()) {
    return { blocked: false };
  }
  const item = { id: itemSnap.id, ...itemSnap.data() } as ITPInspectionItem;

  if (!item.ncrId) {
    return { blocked: false };
  }

  // Check the NCR status
  try {
    const ncrs = await getNcrs(projectId);
    const linkedNcr = ncrs.find((ncr) => ncr.id === item.ncrId);

    if (!linkedNcr) {
      return { blocked: false };
    }

    const openStatuses = ['open', 'corrective_action_submitted'];
    const isBlocked = openStatuses.includes(linkedNcr.status);

    return {
      blocked: isBlocked,
      ncrStatus: linkedNcr.status,
      ncrId: linkedNcr.id,
    };
  } catch (error) {
    console.error('[ITP] Failed to check NCR blocking status:', error);
    return { blocked: false };
  }
}

/**
 * Counts open NCRs linked to items in an ITP.
 * Used for Project Passport risk indicators.
 */
export async function getOpenNCRCount(projectId: string, itpId?: string): Promise<number> {
  try {
    const ncrs = await getNcrs(projectId);
    const openStatuses = ['open', 'corrective_action_submitted'];
    const openNcrs = ncrs.filter((ncr) => openStatuses.includes(ncr.status));

    if (!itpId) {
      // Count all open NCRs created by ITP service across the project
      const itpCreatedNcrs = openNcrs.filter(
        (ncr) => ncr.createdBy === 'system:itp_service',
      );
      return itpCreatedNcrs.length;
    }

    // Get all items in the specific ITP and check which have linked open NCRs
    const items = await getAllItems(projectId, itpId);
    const itemNcrIds = items
      .map((item) => item.ncrId)
      .filter((ncrId): ncrId is string => !!ncrId);

    const openLinkedNcrs = openNcrs.filter((ncr) => itemNcrIds.includes(ncr.id));
    return openLinkedNcrs.length;
  } catch (error) {
    console.error('[ITP] Failed to get open NCR count:', error);
    return 0;
  }
}

// ── Service Export ───────────────────────────────────────────────────────────

// ── ITP Completion Evaluation ─────────────────────────────────────────────────

/**
 * Evaluates whether an ITP should transition to 'completed' status.
 *
 * An ITP is eligible for completion when:
 * - The ITP has status 'approved' or 'in_progress'
 * - Every inspection item has status 'passed' OR 'conditional_accepted'
 *   (conditional_accepted = item has a non-empty conditionsClosedAt timestamp)
 *
 * This is a pure function for testability — it operates on provided data.
 *
 * @returns { shouldComplete: true, completedAt: string } if all items are in terminal pass state
 * @returns { shouldComplete: false } otherwise
 */
export function evaluateITPCompletion(
  itp: ITP,
  items: ITPInspectionItem[],
): { shouldComplete: boolean; completedAt?: string } {
  // ITP must be in an eligible status
  if (itp.status !== 'approved' && itp.status !== 'in_progress') {
    return { shouldComplete: false };
  }

  // Must have at least one item to complete
  if (items.length === 0) {
    return { shouldComplete: false };
  }

  // Check that every item is in a terminal pass state
  const allPassed = items.every((item) => {
    if (item.status === 'passed') return true;
    // conditional_accepted: status is 'conditional_accepted' OR
    // item has conditionsClosedAt set (indicating conditions were met)
    if (item.status === 'conditional_accepted') return true;
    if (item.status === 'conditional' && item.conditionsClosedAt) return true;
    return false;
  });

  if (allPassed) {
    return { shouldComplete: true, completedAt: new Date().toISOString() };
  }

  return { shouldComplete: false };
}

/**
 * Calculates the compliance score from raw counts (pure function for testability).
 *
 * Formula: if (RI + RT) = 0 then 100; else ((P + T) / (RI + RT)) × 100 rounded to 1 decimal place.
 */
export function computeComplianceScore(
  passedInspections: number,
  passedMaterialTests: number,
  totalRequiredInspections: number,
  totalRequiredMaterialTests: number,
): number {
  const denominator = totalRequiredInspections + totalRequiredMaterialTests;
  if (denominator === 0) return 100;
  return Math.round(((passedInspections + passedMaterialTests) / denominator) * 1000) / 10;
}

export const itpService = {
  // ITP CRUD
  createITP,
  getITP,
  getITPs,
  updateITP,
  deleteITP,
  approveITP,
  createRevision,
  // Inspection Items
  addInspectionItem,
  updateInspectionItem,
  removeInspectionItem,
  reorderInspectionItems,
  // Hold Point Execution
  requestHoldPointInspection,
  signOffInspection,
  isBlockedByHoldPoint,
  checkConditionalExpiration,
  detectHoldPointBreach,
  // Witness Point Execution
  recordWitnessPointOutcome,
  acknowledgeWitnessNotification,
  // Material Testing
  createTestingSchedule,
  updateTestingSchedule,
  getTestingSchedules,
  createMaterialTest,
  updateMaterialTestStatus,
  checkOverdueTests,
  checkTestingComplianceGap,
  // Lab Result Recording
  recordLabResult,
  calculateMaterialPassRate,
  evaluateThreshold,
  // NCR Integration
  createLinkedNCR,
  handleNCRClosed,
  isBlockedByOpenNCR,
  getOpenNCRCount,
  // Compliance & Completion
  evaluateITPCompletion,
  computeComplianceScore,
  // Permission Enforcement
  checkITPPermission,
};

export default itpService;
