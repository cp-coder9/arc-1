import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
} from 'firebase/firestore';
import {
  DISCIPLINE_REGISTRY,
  Discipline,
  JobCategory,
  Project,
  ProjectTeamMember,
  UserProfile,
} from '../types';
import { notificationService } from './notificationService';

const PROJECTS_COL = 'projects';

export type TeamMemberRecord = ProjectTeamMember & {
  invitedBy?: string;
  invitedAt?: string;
  removedBy?: string;
  removedAt?: string;
  acceptedAt?: string;
};

export interface DisciplineCoverage {
  filled: Discipline[];
  missing: Discipline[];
}

type ProjectWithCategory = Project & { category?: JobCategory; job?: { category?: JobCategory } };

function getProjectCategory(project: ProjectWithCategory): JobCategory | undefined {
  return project.category ?? project.job?.category;
}

export function getRequiredDisciplines(category?: JobCategory): Discipline[] {
  if (!category) return DISCIPLINE_REGISTRY.map((discipline) => discipline.key);
  return DISCIPLINE_REGISTRY
    .filter((discipline) => discipline.requiredFor.includes(category))
    .map((discipline) => discipline.key);
}

function teamFromProject(project: Project): TeamMemberRecord[] {
  return (project.teamMembers ?? []) as TeamMemberRecord[];
}

function activeOrInvited(member: ProjectTeamMember): boolean {
  return member.status === 'active' || member.status === 'invited';
}

async function getProjectOrThrow(projectId: string): Promise<Project> {
  const projectRef = doc(db, PROJECTS_COL, projectId);
  const projectSnap = await getDoc(projectRef);

  if (!projectSnap.exists()) {
    throw new Error(`Project ${projectId} not found`);
  }

  return { id: projectSnap.id, ...projectSnap.data() } as Project;
}

async function getUserRole(userId: string): Promise<string> {
  const userSnap = await getDoc(doc(db, 'users', userId));
  if (!userSnap.exists()) return 'freelancer';
  const profile = userSnap.data() as Partial<UserProfile>;
  return profile.role ?? 'freelancer';
}

export async function inviteTeamMember(
  projectId: string,
  userId: string,
  discipline: Discipline,
  invitedBy: string
): Promise<void> {
  try {
    if (!projectId || !userId || !discipline || !invitedBy) {
      throw new Error('Project, user, discipline, and inviter are required');
    }

    const project = await getProjectOrThrow(projectId);
    const teamMembers = teamFromProject(project);
    const now = new Date().toISOString();
    const role = await getUserRole(userId);

    const existingIndex = teamMembers.findIndex(
      (member) => member.userId === userId && member.discipline === discipline && activeOrInvited(member)
    );

    const invitation: TeamMemberRecord = {
      userId,
      role,
      discipline,
      joinedAt: now,
      status: 'invited',
      invitedBy,
      invitedAt: now,
    };

    const updatedTeam = existingIndex >= 0
      ? teamMembers.map((member, index) => index === existingIndex ? { ...member, ...invitation } : member)
      : [...teamMembers, invitation];

    await updateDoc(doc(db, PROJECTS_COL, projectId), {
      teamMembers: updatedTeam,
      updatedAt: now,
    });

    await notificationService.sendNotification(
      userId,
      'message',
      `You have been invited to join project ${project.jobId} as ${discipline}.`,
      { jobId: project.jobId, senderId: invitedBy }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}`);
  }
}

export async function acceptInvitation(projectId: string, userId: string): Promise<void> {
  try {
    const project = await getProjectOrThrow(projectId);
    const now = new Date().toISOString();
    let accepted = false;

    const updatedTeam = teamFromProject(project).map((member) => {
      if (member.userId !== userId || member.status !== 'invited') return member;
      accepted = true;
      return {
        ...member,
        status: 'active' as const,
        acceptedAt: now,
        joinedAt: member.joinedAt || now,
      };
    });

    if (!accepted) throw new Error(`No pending invitation found for user ${userId}`);

    await updateDoc(doc(db, PROJECTS_COL, projectId), {
      teamMembers: updatedTeam,
      updatedAt: now,
    });

    if (project.leadArchitectId) {
      await notificationService.sendNotification(
        project.leadArchitectId,
        'message',
        `${userId} accepted the project team invitation.`,
        { jobId: project.jobId, senderId: userId }
      );
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}`);
  }
}

export async function removeTeamMember(projectId: string, userId: string, removedBy: string): Promise<void> {
  try {
    const project = await getProjectOrThrow(projectId);
    const now = new Date().toISOString();

    const updatedTeam = teamFromProject(project).map((member) => {
      if (member.userId !== userId || member.status === 'removed') return member;
      return {
        ...member,
        status: 'removed' as const,
        removedBy,
        removedAt: now,
      };
    });

    await updateDoc(doc(db, PROJECTS_COL, projectId), {
      teamMembers: updatedTeam,
      updatedAt: now,
    });

    await notificationService.sendNotification(
      userId,
      'message',
      `You have been removed from project ${project.jobId}.`,
      { jobId: project.jobId, senderId: removedBy }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}`);
  }
}

export async function getTeamForProject(projectId: string): Promise<ProjectTeamMember[]> {
  try {
    const project = await getProjectOrThrow(projectId);
    return teamFromProject(project).filter((member) => member.status !== 'removed');
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROJECTS_COL}/${projectId}`);
  }
}

export function subscribeToTeam(projectId: string, cb: (members: ProjectTeamMember[]) => void): () => void {
  return onSnapshot(doc(db, PROJECTS_COL, projectId), (snapshot) => {
    if (!snapshot.exists()) {
      cb([]);
      return;
    }

    const project = { id: snapshot.id, ...snapshot.data() } as Project;
    cb(teamFromProject(project).filter((member) => member.status !== 'removed'));
  }, (error) => {
    console.error('Failed to subscribe to project team:', error);
    cb([]);
  });
}

export function getDisciplineCoverage(project: ProjectWithCategory): DisciplineCoverage {
  const required = getRequiredDisciplines(getProjectCategory(project));
  const filled = required.filter((discipline) =>
    teamFromProject(project).some(
      (member) => member.discipline === discipline && member.status === 'active'
    )
  );

  return {
    filled,
    missing: required.filter((discipline) => !filled.includes(discipline)),
  };
}

export const teamService = {
  inviteTeamMember,
  acceptInvitation,
  removeTeamMember,
  getTeamForProject,
  subscribeToTeam,
  getDisciplineCoverage,
};

export default teamService;
