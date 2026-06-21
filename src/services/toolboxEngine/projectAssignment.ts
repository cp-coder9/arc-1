import type { ProjectAssignment } from './types';

export class ProjectAssignmentService {
  none(): ProjectAssignment {
    return { mode: 'none' };
  }

  internal(projectId: string, projectName: string): ProjectAssignment {
    if (!projectId.trim()) throw new Error('Internal project assignment needs a projectId');
    return { mode: 'internal-project', projectId, projectName };
  }

  external(projectName: string, externalReference?: string, notes?: string): ProjectAssignment {
    if (!projectName.trim() && !externalReference?.trim()) {
      throw new Error('External assignment needs a typed project name or reference');
    }
    return { mode: 'external-reference', projectName, externalReference, notes };
  }
}
