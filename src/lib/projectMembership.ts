/**
 * Canonical project membership check.
 * Used by Contract Admin, SpecForge, and other project-scoped routers.
 */
import { adminDb } from './firebase-admin';

export interface ProjectMembershipResult {
  isMember: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  teamRole?: string;
}

export async function checkProjectMembership(uid: string, role: string, projectId: string): Promise<ProjectMembershipResult> {
  const isAdmin = role === 'admin' || role === 'platform_admin';
  if (isAdmin) return { isMember: true, isOwner: false, isAdmin: true };

  const [teamDoc, projectDoc] = await Promise.all([
    adminDb.collection(`projects/${projectId}/team`).doc(uid).get(),
    adminDb.collection('projects').doc(projectId).get(),
  ]);

  const isTeamMember = teamDoc.exists;
  const projectData = projectDoc.exists ? projectDoc.data() : null;
  const isOwner = projectData?.clientId === uid ||
    projectData?.ownerId === uid ||
    projectData?.leadProfessionalId === uid ||
    projectData?.leadBepId === uid ||
    projectData?.leadArchitectId === uid;

  // Also check teamMembers array for SpecForge-style membership
  const teamMembers: Array<{ userId?: string; uid?: string }> = projectData?.teamMembers ?? [];
  const isArrayMember = teamMembers.some((m) => m.userId === uid || m.uid === uid);

  const teamRole = isTeamMember ? (teamDoc.data()?.role || role) : undefined;

  return {
    isMember: isTeamMember || isArrayMember || isOwner,
    isOwner: !!isOwner,
    isAdmin: false,
    teamRole,
  };
}
