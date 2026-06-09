import { collection, doc, addDoc, getDocs, onSnapshot, query, orderBy, updateDoc, runTransaction } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import type { SiteInstruction, SiteInstructionStatus, UserRole } from '@/types';

const PROJECTS_COL = 'projects';
const SITE_INSTRUCTIONS_COL = 'site_instructions';

type FirestoreUnsubscribe = () => void;

/** Roles authorised to issue formal site instructions per the pack guardrails */
const AUTHORISED_ROLES: UserRole[] = ['architect', 'admin'];

function instructionsCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return collection(db, PROJECTS_COL, projectId, SITE_INSTRUCTIONS_COL);
}

function instructionDocument(projectId: string, instructionId: string) {
  if (!instructionId) throw new Error('instructionId is required');
  return doc(db, PROJECTS_COL, projectId, SITE_INSTRUCTIONS_COL, instructionId);
}

function withId<T extends { id: string }>(snap: { id: string; data: () => Record<string, unknown> }): T {
  return { id: snap.id, ...snap.data() } as T;
}

/** Site instruction state machine */
const INSTRUCTION_TRANSITIONS: Record<SiteInstructionStatus, SiteInstructionStatus[]> = {
  draft: ['issued', 'superseded'],
  issued: ['acknowledged', 'superseded'],
  acknowledged: ['superseded'],
  superseded: [],
};

export function isValidInstructionTransition(from: SiteInstructionStatus, to: SiteInstructionStatus): boolean {
  return INSTRUCTION_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isAuthorisedRole(role: UserRole): boolean {
  return AUTHORISED_ROLES.includes(role);
}

export async function issueSiteInstruction(input: {
  projectId: string;
  title: string;
  instruction: string;
  issuedBy: string;
  issuedByRole: UserRole;
  costImpact?: 'none' | 'possible' | 'confirmed';
  timeImpact?: 'none' | 'possible' | 'confirmed';
  linkedRfiId?: string;
  linkedDocumentIds?: string[];
}): Promise<string> {
  try {
    const now = new Date().toISOString();
    const authorised = isAuthorisedRole(input.issuedByRole);
    const instruction_: Omit<SiteInstruction, 'id'> = {
      projectId: input.projectId,
      title: input.title,
      instruction: input.instruction,
      issuedBy: input.issuedBy,
      issuedByRole: input.issuedByRole,
      authorised,
      costImpact: input.costImpact ?? 'none',
      timeImpact: input.timeImpact ?? 'none',
      linkedRfiId: input.linkedRfiId,
      linkedDocumentIds: input.linkedDocumentIds ?? [],
      status: authorised ? 'issued' : 'draft',
      createdAt: now,
      updatedAt: now,
    };
    const ref = await addDoc(instructionsCollection(input.projectId), instruction_);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${input.projectId}/${SITE_INSTRUCTIONS_COL}`);
  }
}

export async function authoriseInstruction(
  projectId: string,
  instructionId: string,
  authorisedBy: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(instructionDocument(projectId, instructionId));
      if (!snap.exists()) throw new Error(`Instruction ${instructionId} not found`);
      const current = snap.data() as SiteInstruction;
      if (current.authorised) throw new Error('Instruction is already authorised');
      if (!isValidInstructionTransition(current.status, 'issued')) {
        throw new Error(`Invalid transition from ${current.status} to issued`);
      }
      transaction.update(instructionDocument(projectId, instructionId), {
        authorised: true,
        authorisedBy,
        authorisedAt: now,
        status: 'issued',
        updatedAt: now,
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${SITE_INSTRUCTIONS_COL}/${instructionId}`);
  }
}

export async function acknowledgeInstruction(
  projectId: string,
  instructionId: string,
  acknowledgedBy: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(instructionDocument(projectId, instructionId));
      if (!snap.exists()) throw new Error(`Instruction ${instructionId} not found`);
      const current = snap.data() as SiteInstruction;
      if (!current.authorised) throw new Error('Cannot acknowledge an unauthorised instruction');
      if (!isValidInstructionTransition(current.status, 'acknowledged')) {
        throw new Error(`Invalid transition from ${current.status} to acknowledged`);
      }
      transaction.update(instructionDocument(projectId, instructionId), {
        status: 'acknowledged',
        acknowledgedBy,
        acknowledgedAt: now,
        updatedAt: now,
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${SITE_INSTRUCTIONS_COL}/${instructionId}`);
  }
}

export async function supersedeInstruction(
  projectId: string,
  instructionId: string,
  supersededById: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await updateDoc(instructionDocument(projectId, instructionId), {
      status: 'superseded',
      supersededById,
      updatedAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${SITE_INSTRUCTIONS_COL}/${instructionId}`);
  }
}

export async function getSiteInstructions(projectId: string): Promise<SiteInstruction[]> {
  try {
    const snap = await getDocs(query(instructionsCollection(projectId), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => withId<SiteInstruction>(d));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}/${SITE_INSTRUCTIONS_COL}`);
  }
}

export function subscribeToSiteInstructions(
  projectId: string,
  cb: (instructions: SiteInstruction[]) => void,
): FirestoreUnsubscribe {
  const q = query(instructionsCollection(projectId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => withId<SiteInstruction>(d))), (error) => {
    console.error('Failed to subscribe to site instructions:', error);
    cb([]);
  });
}

export const siteInstructionService = {
  issueSiteInstruction,
  authoriseInstruction,
  acknowledgeInstruction,
  supersedeInstruction,
  getSiteInstructions,
  subscribeToSiteInstructions,
  isValidInstructionTransition,
  isAuthorisedRole,
};

export default siteInstructionService;
