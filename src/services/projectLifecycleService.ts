import { db } from '../lib/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  arrayUnion,
} from 'firebase/firestore';
import {
  Project,
  ProjectStage,
  StageHistoryEntry,
  ProjectTeamMember,
  PROJECT_STAGE_ORDER,
  Job,
  UserRole,
  Discipline,
} from '../types';

// ─── Stage Transition Rules ─────────────────────────────────────────────────

/**
 * Returns the 0-based index of a stage, or -1 if not found.
 */
export function stageIndex(stage: ProjectStage): number {
  if (stage === 'scoping') return PROJECT_STAGE_ORDER.indexOf('intake');
  return PROJECT_STAGE_ORDER.indexOf(stage);
}

/**
 * Determines whether a forward transition from `current` to `target` is valid.
 * Rules:
 *  1. Must be exactly one step forward in PROJECT_STAGE_ORDER.
 *  2. Admin may skip ahead (isAdminOverride = true).
 *  3. Backward transitions are never allowed.
 */
export function canTransition(
  current: ProjectStage,
  target: ProjectStage,
  isAdminOverride = false
): boolean {
  const currentIdx = stageIndex(current);
  const targetIdx = stageIndex(target);

  if (currentIdx === -1 || targetIdx === -1) return false;
  if (current === target) return false; // no self-transition, including legacy scoping records
  if (target === 'scoping') return false; // scoping is a legacy alias for the PRD Brief stage, not a canonical target
  if (targetIdx <= currentIdx) return false; // no backward transition

  if (isAdminOverride) return true; // admin can skip ahead
  return targetIdx === currentIdx + 1; // normal: exactly one canonical PRD stage forward
}

/**
 * Map a ProjectStage to the corresponding legacy Job.status value.
 * This keeps existing queries and badge rendering intact.
 */
export function stageToJobStatus(stage: ProjectStage): Job['status'] {
  switch (stage) {
    case 'intake':
    case 'scoping':
      return 'open';
    case 'appointment':
    case 'coordination':
    case 'compliance':
    case 'tender':
    case 'delivery':
      return 'in-progress';
    case 'payments':
    case 'closeout':
      return 'completed';
    default:
      return 'in-progress';
  }
}

// ─── Firestore Operations ───────────────────────────────────────────────────

const PROJECTS_COL = 'projects';

export interface TransitionStageOptions {
  isAdminOverride?: boolean;
}

/**
 * Create a new Project document when a client selects an architect.
 * Sets the initial stage to 'intake' and records the first history entry.
 */
export async function createProject(
  jobId: string,
  clientId: string,
  actorId: string,
  leadArchitectId?: string
): Promise<string> {
  const existingProject = await getProjectByJobId(jobId);
  if (existingProject) return existingProject.id;

  const projectRef = doc(db, PROJECTS_COL, jobId);
  const now = new Date().toISOString();

  const initialHistory: StageHistoryEntry = {
    stage: 'intake',
    enteredAt: now,
    actorId,
    note: 'Project created',
  };

  const teamMembers: ProjectTeamMember[] = [];

  // Add client as team member
  teamMembers.push({
    userId: clientId,
    role: 'client' as UserRole,
    joinedAt: now,
    status: 'active',
  });

  // Add lead architect if provided
  if (leadArchitectId) {
    teamMembers.push({
      userId: leadArchitectId,
      role: 'architect' as UserRole,
      discipline: 'architecture' as Discipline,
      joinedAt: now,
      status: 'active',
    });
  }

  const project: Omit<Project, 'id'> & { id: string } = {
    id: projectRef.id,
    jobId,
    clientId,
    leadArchitectId,
    currentStage: 'intake',
    stageHistory: [initialHistory],
    teamMembers,
    createdAt: now,
  };

  await setDoc(projectRef, project);

  return projectRef.id;
}

/**
 * Transition a project to the next stage.
 * Validates the transition, updates history, and syncs Job.status.
 */
export async function transitionStage(
  projectId: string,
  targetStage: ProjectStage,
  actorId: string,
  note?: string,
  optionsOrOverride: TransitionStageOptions | boolean = false
): Promise<void> {
  const projectRef = doc(db, PROJECTS_COL, projectId);
  const projectSnap = await getDoc(projectRef);

  if (!projectSnap.exists()) {
    throw new Error(`Project ${projectId} not found`);
  }

  const project = { id: projectSnap.id, ...projectSnap.data() } as Project;

  const isAdminOverride = typeof optionsOrOverride === 'boolean'
    ? optionsOrOverride
    : optionsOrOverride.isAdminOverride === true;

  if (!canTransition(project.currentStage, targetStage, isAdminOverride)) {
    throw new Error(
      `Invalid transition: ${project.currentStage} → ${targetStage}`
    );
  }

  const now = new Date().toISOString();

  // Close out the current stage entry
  const updatedHistory = project.stageHistory.map((entry) => {
    if (entry.stage === project.currentStage && !entry.exitedAt) {
      return { ...entry, exitedAt: now };
    }
    return entry;
  });

  // Add the new stage entry
  const newEntry: StageHistoryEntry = {
    stage: targetStage,
    enteredAt: now,
    actorId,
    note,
  };
  updatedHistory.push(newEntry);

  // Update project document
  await updateDoc(projectRef, {
    currentStage: targetStage,
    stageHistory: updatedHistory,
    updatedAt: now,
  });

  // Sync Job.status
  const newJobStatus = stageToJobStatus(targetStage);
  const jobRef = doc(db, 'jobs', project.jobId);
  const jobSnap = await getDoc(jobRef);
  if (jobSnap.exists()) {
    const currentJobStatus = jobSnap.data().status;
    if (currentJobStatus !== newJobStatus) {
      await updateDoc(jobRef, {
        status: newJobStatus,
        updatedAt: now,
        statusHistory: arrayUnion({
          status: newJobStatus,
          timestamp: now,
          actorId,
          note: note || `Stage advanced to ${targetStage}`,
        }),
      });
    }
  }
}

/**
 * Look up a project by its linked jobId.
 */
export async function getProjectByJobId(
  jobId: string
): Promise<Project | null> {
  const q = query(collection(db, PROJECTS_COL), where('jobId', '==', jobId));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const docSnap = snap.docs[0];
  return { id: docSnap.id, ...docSnap.data() } as Project;
}

/**
 * Get a project by its ID.
 */
export async function getProject(projectId: string): Promise<Project | null> {
  const projectRef = doc(db, PROJECTS_COL, projectId);
  const snap = await getDoc(projectRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Project;
}

/**
 * Subscribe to real-time updates for a project.
 */
export function subscribeToProject(
  projectId: string,
  callback: (project: Project | null) => void
): () => void {
  const projectRef = doc(db, PROJECTS_COL, projectId);
  return onSnapshot(projectRef, (snap) => {
    if (snap.exists()) {
      callback({ id: snap.id, ...snap.data() } as Project);
    } else {
      callback(null);
    }
  });
}

/**
 * Subscribe to the project associated with a given jobId.
 */
export function subscribeToProjectByJobId(
  jobId: string,
  callback: (project: Project | null) => void
): () => void {
  const q = query(collection(db, PROJECTS_COL), where('jobId', '==', jobId));
  return onSnapshot(q, (snap) => {
    if (snap.empty) {
      callback(null);
    } else {
      const docSnap = snap.docs[0];
      callback({ id: docSnap.id, ...docSnap.data() } as Project);
    }
  });
}

/**
 * Get all projects for a given user (as client, lead architect, or team member).
 */
export async function getProjectsForUser(userId: string): Promise<Project[]> {
  // Query by clientId
  const clientQ = query(
    collection(db, PROJECTS_COL),
    where('clientId', '==', userId)
  );
  const clientSnap = await getDocs(clientQ);

  // Query by leadArchitectId
  const archQ = query(
    collection(db, PROJECTS_COL),
    where('leadArchitectId', '==', userId)
  );
  const archSnap = await getDocs(archQ);

  // Merge and deduplicate
  const projectMap = new Map<string, Project>();
  [...clientSnap.docs, ...archSnap.docs].forEach((d) => {
    if (!projectMap.has(d.id)) {
      projectMap.set(d.id, { id: d.id, ...d.data() } as Project);
    }
  });

  return Array.from(projectMap.values());
}

export const projectLifecycleService = {
  canTransition,
  stageIndex,
  stageToJobStatus,
  createProject,
  transitionStage,
  getProjectByJobId,
  getProject,
  subscribeToProject,
  subscribeToProjectByJobId,
  getProjectsForUser,
};

export default projectLifecycleService;
