import type { MobileFieldCommand, Severity, Snag, UserRole } from './types';
import { daysFromNow, id } from './utils';
import { canAssignSnagTo, canCreateSnag, defaultSnagVerifier } from './roleRoutingService';

export class SnagService {
  create(command: MobileFieldCommand, data: { title: string; description: string; location: string; assignedToRole: UserRole; severity: Severity; dueDays?: number }): Snag {
    if (!canCreateSnag(command.actorRole)) throw new Error(`Role ${command.actorRole} cannot create snags`);
    if (!canAssignSnagTo(data.assignedToRole)) throw new Error(`Role ${data.assignedToRole} cannot receive snag assignment`);
    const snag: Snag = {
      id: id('snag'), projectRef: command.projectRef, title: data.title, description: data.description,
      location: data.location, createdByRole: command.actorRole, assignedToRole: data.assignedToRole,
      severity: data.severity, status: 'assigned', dueDate: daysFromNow(data.dueDays ?? 7),
      evidenceRefs: command.evidenceRefs,
    };
    snag.verifierRole = defaultSnagVerifier(snag);
    return snag;
  }
  markReady(snag: Snag): Snag { return { ...snag, status: 'ready_for_reinspection' }; }
  verifyClosed(snag: Snag, verifierRole: UserRole): Snag {
    if (snag.verifierRole && snag.verifierRole !== verifierRole && verifierRole !== 'project_manager') throw new Error(`Verifier role ${verifierRole} not authorised`);
    return { ...snag, status: 'verified_closed' };
  }
}
