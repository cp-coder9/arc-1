/**
 * Project Membership Check
 *
 * Verifies that a user is a member of the project team before allowing
 * access to project-scoped town planning resources.
 */
import type { FirestoreDB } from './accessControl';

export interface ProjectMembershipResult {
  isMember: boolean;
  reason?: string;
}

/**
 * Check if a user is a member of a project's team.
 * Queries the project document's teamMembers array.
 */
export async function checkProjectMembership(
  db: FirestoreDB,
  userId: string,
  projectId: string,
): Promise<ProjectMembershipResult> {
  try {
    const projectDoc = await db.collection('projects').doc(projectId).get();

    if (!projectDoc.exists) {
      return { isMember: false, reason: 'Project not found' };
    }

    const data = projectDoc.data();
    if (!data) {
      return { isMember: false, reason: 'Project data unavailable' };
    }

    // Check teamMembers array
    const teamMembers = data.teamMembers as Array<{ userId: string; status: string }> | undefined;
    if (!teamMembers) {
      return { isMember: false, reason: 'No team members defined' };
    }

    const membership = teamMembers.find(
      (m) => m.userId === userId && m.status === 'active',
    );

    if (!membership) {
      return { isMember: false, reason: 'User is not an active team member' };
    }

    return { isMember: true };
  } catch (error) {
    // Fail closed — deny access if we can't verify
    return { isMember: false, reason: 'Unable to verify project membership' };
  }
}
