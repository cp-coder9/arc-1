import type { PackageScope, ParticipantRole } from './types';
import { daysFromNow, id } from './utils';

export class PackageScopeService {
  create(input: { projectRef: string; title: string; assignedRole: ParticipantRole; assignedUserId: string; scopeSummary: string; visibleDocumentRefs: string[]; boqLineRefs: string[]; returnables: string[] }): PackageScope {
    return {
      id: id('pkg'), projectRef: input.projectRef, title: input.title, assignedRole: input.assignedRole,
      assignedUserId: input.assignedUserId, scopeSummary: input.scopeSummary,
      visibleDocumentRefs: input.visibleDocumentRefs, boqLineRefs: input.boqLineRefs,
      dueDate: daysFromNow(14), returnables: input.returnables,
    };
  }
  visibleFor(scope: PackageScope, role: ParticipantRole, userId: string) { return scope.assignedRole === role && scope.assignedUserId === userId ? scope : null; }
}
