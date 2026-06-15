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


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
// ─── Stage Transition Rules ─────────────────────────────────────────────────

export type StageGateEvidenceKey =
  | 'clientBriefCompleted'
  | 'technicalBriefApproved'
  | 'verifiedProfessionalAppointed'
  | 'appointmentAgreementSigned'
  | 'escrowPlanInitialized'
  | 'designPackageApproved'
  | 'drawingRegisterReady'
  | 'complianceFindingsResolved'
  | 'municipalSubmissionReady'
  | 'procurementPackageApproved'
  | 'contractorInstructionIssued'
  | 'constructionEvidenceSubmitted'
  | 'paymentClaimCertified'
  | 'escrowReleaseApproved'
  | 'snagsResolved'
  | 'certificatesUploaded'
  | 'finalAccountApproved'
  | 'handoverPackGenerated';

export type StageGateEvidence = Partial<Record<StageGateEvidenceKey, boolean>>;

export interface StageGateRequirement {
  key: StageGateEvidenceKey;
  label: string;
  reason: string;
}

export interface StageGateEvaluation {
  currentStage: ProjectStage;
  targetStage: ProjectStage;
  transitionAllowed: boolean;
  transitionRulePassed: boolean;
  missingRequirements: StageGateRequirement[];
}

export const STAGE_GATE_REQUIREMENTS: Record<Exclude<ProjectStage, 'intake' | 'scoping'>, StageGateRequirement[]> = {
  appointment: [
    { key: 'clientBriefCompleted', label: 'Client brief completed', reason: 'A client brief is required before marketplace/proposal routing.' },
    { key: 'technicalBriefApproved', label: 'Technical brief approved', reason: 'A BEP-reviewed technical scope is required before appointment.' },
  ],
  coordination: [
    { key: 'verifiedProfessionalAppointed', label: 'Verified professional appointed', reason: 'Design coordination requires an appointed verified lead professional.' },
    { key: 'appointmentAgreementSigned', label: 'Appointment agreement signed', reason: 'Professional work cannot proceed without appointment acceptance/signature.' },
    { key: 'escrowPlanInitialized', label: 'Escrow/payment plan initialized', reason: 'Commercial terms must be recorded before coordinated delivery.' },
  ],
  compliance: [
    { key: 'designPackageApproved', label: 'Design package approved', reason: 'Compliance review requires an approved design package.' },
    { key: 'drawingRegisterReady', label: 'Drawing register ready', reason: 'Compliance findings must reference controlled drawing revisions.' },
  ],
  tender: [
    { key: 'complianceFindingsResolved', label: 'Compliance findings resolved or accepted', reason: 'Tender/procurement cannot rely on unresolved compliance blockers.' },
    { key: 'municipalSubmissionReady', label: 'Municipal submission package ready', reason: 'Procurement must understand approval and submission constraints.' },
  ],
  delivery: [
    { key: 'procurementPackageApproved', label: 'Procurement/tender package approved', reason: 'Construction delivery requires approved package scope and procurement basis.' },
    { key: 'contractorInstructionIssued', label: 'Contractor instruction issued', reason: 'A contractor cannot start regulated work without appointment or instruction.' },
  ],
  payments: [
    { key: 'constructionEvidenceSubmitted', label: 'Construction/progress evidence submitted', reason: 'Milestone payments require linked deliverable or site evidence.' },
    { key: 'paymentClaimCertified', label: 'Payment claim certified', reason: 'Funds cannot be released before the required certifier/approver gate.' },
    { key: 'escrowReleaseApproved', label: 'Escrow release approved', reason: 'Payment release requires human approval under the escrow state model.' },
  ],
  closeout: [
    { key: 'snagsResolved', label: 'Snags resolved', reason: 'Close-out cannot complete while snags remain unresolved.' },
    { key: 'certificatesUploaded', label: 'Certificates and warranties uploaded', reason: 'Close-out requires compliance certificates, warranties, and handover evidence.' },
    { key: 'finalAccountApproved', label: 'Final account approved', reason: 'Commercial close-out requires a final account decision.' },
    { key: 'handoverPackGenerated', label: 'Handover pack generated', reason: 'The long-term project record must be assembled before archive.' },
  ],
};

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

export function getStageGateRequirements(targetStage: ProjectStage): StageGateRequirement[] {
  if (targetStage === 'intake' || targetStage === 'scoping') return [];
  return STAGE_GATE_REQUIREMENTS[targetStage] || [];
}

export function getMissingStageGateRequirements(
  targetStage: ProjectStage,
  evidence: StageGateEvidence = {},
): StageGateRequirement[] {
  return getStageGateRequirements(targetStage).filter(requirement => evidence[requirement.key] !== true);
}

export function evaluateStageGateTransition(
  currentStage: ProjectStage,
  targetStage: ProjectStage,
  evidence: StageGateEvidence = {},
  isAdminOverride = false,
): StageGateEvaluation {
  const transitionRulePassed = canTransition(currentStage, targetStage, isAdminOverride);
  const missingRequirements = getMissingStageGateRequirements(targetStage, evidence);

  return {
    currentStage,
    targetStage,
    transitionAllowed: transitionRulePassed && missingRequirements.length === 0,
    transitionRulePassed,
    missingRequirements,
  };
}

export function assertStageGateTransitionAllowed(evaluation: StageGateEvaluation): void {
  if (!evaluation.transitionRulePassed) {
    throw new Error(`Invalid transition: ${evaluation.currentStage} → ${evaluation.targetStage}`);
  }

  if (evaluation.missingRequirements.length > 0) {
    const labels = evaluation.missingRequirements.map(requirement => requirement.label).join(', ');
    const error = new Error(`Stage gate blocked: ${labels}`);
    (error as Error & { status?: number; missingRequirements?: StageGateRequirement[] }).status = 409;
    (error as Error & { status?: number; missingRequirements?: StageGateRequirement[] }).missingRequirements = evaluation.missingRequirements;
    throw error;
  }
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
  enforceStageGates?: boolean;
  stageGateEvidence?: StageGateEvidence;
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

  const projectRef = getDemoDoc( PROJECTS_COL, jobId);
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
  const projectRef = getDemoDoc( PROJECTS_COL, projectId);
  const projectSnap = await getDoc(projectRef);

  if (!projectSnap.exists()) {
    throw new Error(`Project ${projectId} not found`);
  }

  const project = { id: projectSnap.id, ...projectSnap.data() } as Project;

  const isAdminOverride = typeof optionsOrOverride === 'boolean'
    ? optionsOrOverride
    : optionsOrOverride.isAdminOverride === true;

  const enforceStageGates = typeof optionsOrOverride === 'boolean'
    ? true
    : optionsOrOverride.enforceStageGates !== false;

  const stageGateEvidence = {
    ...(project.stageGateEvidence || {}),
    ...(typeof optionsOrOverride === 'boolean' ? {} : optionsOrOverride.stageGateEvidence || {}),
  } as StageGateEvidence;

  if (enforceStageGates) {
    assertStageGateTransitionAllowed(evaluateStageGateTransition(
      project.currentStage,
      targetStage,
      stageGateEvidence,
      isAdminOverride,
    ));
  } else if (!canTransition(project.currentStage, targetStage, isAdminOverride)) {
    throw new Error(`Invalid transition: ${project.currentStage} → ${targetStage}`);
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
  const jobRef = getDemoDoc( 'jobs', project.jobId);
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
  const q = query(getDemoCol( PROJECTS_COL), where('jobId', '==', jobId));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const docSnap = snap.docs[0];
  return { id: docSnap.id, ...docSnap.data() } as Project;
}

/**
 * Get a project by its ID.
 */
export async function getProject(projectId: string): Promise<Project | null> {
  const projectRef = getDemoDoc( PROJECTS_COL, projectId);
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
  const projectRef = getDemoDoc( PROJECTS_COL, projectId);
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
  const q = query(getDemoCol( PROJECTS_COL), where('jobId', '==', jobId));
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
    getDemoCol( PROJECTS_COL),
    where('clientId', '==', userId)
  );
  const clientSnap = await getDocs(clientQ);

  // Query by leadArchitectId
  const archQ = query(
    getDemoCol( PROJECTS_COL),
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
