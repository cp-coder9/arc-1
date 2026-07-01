/**
 * Project Command Centre — RFI & Site Instruction Service
 *
 * Manages Requests for Information (RFIs) and Site Instructions within the
 * Command Centre context. Integrates with the existing siteExecution RFI
 * functions (constructionService) and siteInstructionService for persistence.
 *
 * RFIs persist at `projects/{projectId}/rfis/` (shared with constructionService).
 * Site Instructions persist at `projects/{projectId}/site_instructions/` (shared with siteInstructionService).
 *
 * On RFI creation: generates sequential RFI number and creates Action Centre event for addressee.
 * On escalation: changes status to 'critical' and notifies principal agent.
 *
 * @module commandCentre/rfiService
 */

import {
  addDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  orderBy,
  runTransaction,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import { getDemoDoc, getDemoCol } from '@/demo-seed/demoFirestore';
import { createRFISchema, type CreateRFIInput } from '@/services/commandCentre/schemas';
import { recordAudit } from '@/services/commandCentre/commandCentreService';
import type { RFIEntity } from '@/services/commandCentre/deadlineDetectionService';
import type { CommandCentreAction, Priority } from '@/services/commandCentre/types';

// ── Constants ────────────────────────────────────────────────────────────────

const PROJECTS_COL = 'projects';
const RFIS_COL = 'rfis';
const SITE_INSTRUCTIONS_COL = 'site_instructions';

/** Default contractual response period in days */
export const DEFAULT_RESPONSE_PERIOD_DAYS = 7;

// ── Types ────────────────────────────────────────────────────────────────────

export type RFIStatus = 'pending' | 'critical' | 'closed';

export interface CommandCentreRFI extends RFIEntity {
  description: string;
  originatorId: string;
  priority: Priority;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRFIData extends CreateRFIInput {
  originatorId: string;
  responsePeriodDays?: number;
}

export interface SiteInstructionItem {
  id: string;
  projectId: string;
  title: string;
  instruction: string;
  issuerId: string;
  recipientId: string;
  status: 'draft' | 'issued' | 'acknowledged' | 'superseded';
  complianceConfirmed: boolean;
  linkedRfiId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSiteInstructionData {
  title: string;
  instruction: string;
  issuerId: string;
  recipientId: string;
  linkedRfiId?: string;
}

// ── Firestore Path Helpers ───────────────────────────────────────────────────

function rfisCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return getDemoCol(PROJECTS_COL, projectId, RFIS_COL);
}

function rfiDocument(projectId: string, rfiId: string) {
  if (!projectId) throw new Error('projectId is required');
  if (!rfiId) throw new Error('rfiId is required');
  return getDemoDoc(PROJECTS_COL, projectId, RFIS_COL, rfiId);
}

function rfiCounterDocument(projectId: string) {
  return getDemoDoc(PROJECTS_COL, projectId, '_meta', 'rfi_counter');
}

function siteInstructionsCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return getDemoCol(PROJECTS_COL, projectId, SITE_INSTRUCTIONS_COL);
}

function siteInstructionDocument(projectId: string, instructionId: string) {
  if (!projectId) throw new Error('projectId is required');
  if (!instructionId) throw new Error('instructionId is required');
  return getDemoDoc(PROJECTS_COL, projectId, SITE_INSTRUCTIONS_COL, instructionId);
}

// ── ID Generation ────────────────────────────────────────────────────────────

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

// ── Action Centre Event Generation ───────────────────────────────────────────

/**
 * Creates an Action Centre event for the RFI addressee on RFI creation.
 */
export function createRFIActionEvent(
  rfi: CommandCentreRFI,
): CommandCentreAction {
  return {
    id: generateId(),
    projectId: rfi.projectId,
    type: 'technical',
    title: `RFI #${rfi.rfiNumber}: ${rfi.subject}`,
    description: `New RFI requires your response by ${rfi.responseDueDate}`,
    assigneeId: rfi.addresseeId,
    dueDate: rfi.responseDueDate,
    priority: rfi.priority,
    sourceSubsystem: 'rfis',
    sourceEntityId: rfi.id,
    status: 'pending',
    createdAt: rfi.createdAt,
  };
}

/**
 * Creates an escalation Action Centre event for the principal agent.
 */
export function createEscalationActionEvent(
  rfi: CommandCentreRFI,
  principalAgentId: string = 'principal_agent',
): CommandCentreAction {
  return {
    id: generateId(),
    projectId: rfi.projectId,
    type: 'technical',
    title: `RFI #${rfi.rfiNumber} CRITICAL — past response deadline`,
    description: `RFI "${rfi.subject}" has not been responded to within the contractual response period. Escalated to Critical.`,
    assigneeId: principalAgentId,
    dueDate: rfi.responseDueDate,
    priority: 'critical',
    sourceSubsystem: 'rfis',
    sourceEntityId: rfi.id,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
}

// ── RFI CRUD Operations ──────────────────────────────────────────────────────

/**
 * Creates a new RFI with sequential number generation.
 * Generates an Action Centre event for the addressee.
 *
 * Uses a Firestore transaction to atomically increment the RFI counter.
 */
export async function createRFI(
  projectId: string,
  data: CreateRFIData,
  actorId: string = 'system',
): Promise<{ rfi: CommandCentreRFI; action: CommandCentreAction }> {
  // Validate input
  const parsed = createRFISchema.parse({
    subject: data.subject,
    description: data.description,
    addresseeId: data.addresseeId,
    priority: data.priority,
  });

  const now = new Date().toISOString();
  const responsePeriodDays = data.responsePeriodDays ?? DEFAULT_RESPONSE_PERIOD_DAYS;
  const responseDueDate = computeResponseDueDate(now, responsePeriodDays);

  try {
    const rfiRef = doc(rfisCollection(projectId));
    const counterRef = rfiCounterDocument(projectId);

    let rfiNumber = 1;

    await runTransaction(db, async (transaction) => {
      const counterSnap = await transaction.get(counterRef);
      rfiNumber = ((counterSnap.exists() ? Number(counterSnap.data().lastNumber) : 0) || 0) + 1;

      const rfiData: Omit<CommandCentreRFI, 'id'> = {
        projectId,
        rfiNumber,
        subject: parsed.subject,
        description: parsed.description,
        addresseeId: parsed.addresseeId,
        dateRaised: now,
        responseDueDate,
        status: 'pending',
        originatorId: data.originatorId,
        priority: parsed.priority,
        createdBy: actorId,
        createdAt: now,
        updatedAt: now,
      };

      transaction.set(rfiRef, rfiData);
      transaction.set(counterRef, { lastNumber: rfiNumber, updatedAt: now }, { merge: true });
    });

    const rfi: CommandCentreRFI = {
      id: rfiRef.id,
      projectId,
      rfiNumber,
      subject: parsed.subject,
      description: parsed.description,
      addresseeId: parsed.addresseeId,
      dateRaised: now,
      responseDueDate,
      status: 'pending',
      originatorId: data.originatorId,
      priority: parsed.priority,
      createdBy: actorId,
      createdAt: now,
      updatedAt: now,
    };

    // Generate Action Centre event for the addressee
    const action = createRFIActionEvent(rfi);

    // Fire-and-forget audit
    recordAudit({
      projectId,
      actorId,
      actorName: actorId,
      actionType: 'create',
      entityType: 'rfi',
      entityId: rfi.id,
      after: rfi as unknown as Record<string, unknown>,
      timestamp: now,
    });

    return { rfi, action };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${projectId}/${RFIS_COL}`);
  }
}

/**
 * Retrieves all RFIs for a project, ordered by RFI number descending.
 */
export async function getRFIs(projectId: string): Promise<CommandCentreRFI[]> {
  try {
    const q = query(rfisCollection(projectId), orderBy('rfiNumber', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CommandCentreRFI));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${PROJECTS_COL}/${projectId}/${RFIS_COL}`);
  }
}

/**
 * Updates an existing RFI's fields (subject, description, priority, status).
 */
export async function updateRFI(
  projectId: string,
  rfiId: string,
  data: Partial<Pick<CommandCentreRFI, 'subject' | 'description' | 'priority' | 'status'>>,
  actorId: string = 'system',
): Promise<CommandCentreRFI> {
  try {
    const docRef = rfiDocument(projectId, rfiId);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      throw new Error(`RFI '${rfiId}' not found`);
    }

    const current = { id: snap.id, ...snap.data() } as CommandCentreRFI;
    const now = new Date().toISOString();

    const updates: Record<string, unknown> = {
      ...data,
      updatedAt: now,
    };

    await updateDoc(docRef, updates);

    // Fire-and-forget audit
    recordAudit({
      projectId,
      actorId,
      actorName: actorId,
      actionType: 'update',
      entityType: 'rfi',
      entityId: rfiId,
      before: current as unknown as Record<string, unknown>,
      after: updates,
      timestamp: now,
    });

    return { ...current, ...data, updatedAt: now };
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${RFIS_COL}/${rfiId}`);
  }
}

/**
 * Escalates an RFI to Critical status. Called when the RFI is past the
 * contractual response period.
 *
 * Changes status to 'critical' and generates an escalation Action Centre
 * event for the principal agent.
 */
export async function escalateRFI(
  projectId: string,
  rfiId: string,
  principalAgentId: string = 'principal_agent',
  actorId: string = 'system',
): Promise<{ rfi: CommandCentreRFI; action: CommandCentreAction }> {
  try {
    const docRef = rfiDocument(projectId, rfiId);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      throw new Error(`RFI '${rfiId}' not found`);
    }

    const current = { id: snap.id, ...snap.data() } as CommandCentreRFI;

    if (current.status === 'closed') {
      throw new Error(`RFI '${rfiId}' is already closed and cannot be escalated`);
    }

    if (current.status === 'critical') {
      throw new Error(`RFI '${rfiId}' is already at Critical status`);
    }

    const now = new Date().toISOString();

    await updateDoc(docRef, {
      status: 'critical',
      updatedAt: now,
    });

    const escalatedRfi: CommandCentreRFI = {
      ...current,
      status: 'critical',
      updatedAt: now,
    };

    // Generate escalation Action Centre event
    const action = createEscalationActionEvent(escalatedRfi, principalAgentId);

    // Fire-and-forget audit
    recordAudit({
      projectId,
      actorId,
      actorName: actorId,
      actionType: 'escalation',
      entityType: 'rfi',
      entityId: rfiId,
      before: { status: current.status },
      after: { status: 'critical' },
      timestamp: now,
    });

    return { rfi: escalatedRfi, action };
  } catch (error) {
    if (error instanceof Error && (error.message.includes('not found') || error.message.includes('already'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${RFIS_COL}/${rfiId}`);
  }
}

// ── Site Instruction Operations ──────────────────────────────────────────────

/**
 * Creates a new Site Instruction in the Command Centre.
 * Integrates with the existing siteInstructionService collection.
 */
export async function createSiteInstruction(
  projectId: string,
  data: CreateSiteInstructionData,
  actorId: string = 'system',
): Promise<SiteInstructionItem> {
  if (!data.title || !data.title.trim()) {
    throw new Error('Site instruction title is required');
  }
  if (!data.instruction || !data.instruction.trim()) {
    throw new Error('Site instruction content is required');
  }
  if (!data.recipientId || !data.recipientId.trim()) {
    throw new Error('Site instruction recipient is required');
  }

  const now = new Date().toISOString();
  const instructionRecord: Omit<SiteInstructionItem, 'id'> = {
    projectId,
    title: data.title,
    instruction: data.instruction,
    issuerId: data.issuerId,
    recipientId: data.recipientId,
    status: 'issued',
    complianceConfirmed: false,
    linkedRfiId: data.linkedRfiId,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const docRef = await addDoc(siteInstructionsCollection(projectId), instructionRecord);

    // Fire-and-forget audit
    recordAudit({
      projectId,
      actorId,
      actorName: actorId,
      actionType: 'create',
      entityType: 'site_instruction',
      entityId: docRef.id,
      after: instructionRecord as unknown as Record<string, unknown>,
      timestamp: now,
    });

    return { id: docRef.id, ...instructionRecord };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${projectId}/${SITE_INSTRUCTIONS_COL}`);
  }
}

/**
 * Retrieves all Site Instructions for a project, ordered by creation date descending.
 */
export async function getSiteInstructions(projectId: string): Promise<SiteInstructionItem[]> {
  try {
    const q = query(siteInstructionsCollection(projectId), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SiteInstructionItem));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${PROJECTS_COL}/${projectId}/${SITE_INSTRUCTIONS_COL}`);
  }
}

// ── Pure Utility Functions ───────────────────────────────────────────────────

/**
 * Computes the response due date given a start date and response period in days.
 */
export function computeResponseDueDate(dateRaised: string, responsePeriodDays: number): string {
  const start = new Date(dateRaised);
  start.setDate(start.getDate() + responsePeriodDays);
  return start.toISOString().split('T')[0];
}

/**
 * Determines if an RFI should be escalated based on the current date
 * and its response due date.
 */
export function shouldEscalate(rfi: Pick<RFIEntity, 'status' | 'responseDueDate'>, currentDate: Date): boolean {
  if (rfi.status === 'closed' || rfi.status === 'critical') return false;
  const dueDate = new Date(rfi.responseDueDate + 'T00:00:00.000Z');
  const current = new Date(currentDate.toISOString().split('T')[0] + 'T00:00:00.000Z');
  return current.getTime() > dueDate.getTime();
}

// ── Service Export ───────────────────────────────────────────────────────────

export const rfiService = {
  createRFI,
  getRFIs,
  updateRFI,
  escalateRFI,
  createSiteInstruction,
  getSiteInstructions,
  // Pure helpers
  computeResponseDueDate,
  shouldEscalate,
  createRFIActionEvent,
  createEscalationActionEvent,
  // Constants
  DEFAULT_RESPONSE_PERIOD_DAYS,
};

export default rfiService;
