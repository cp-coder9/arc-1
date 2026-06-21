import type { AdminActor, VerificationCase, VerificationStatus } from './types';
import { assertPermission, daysFromNow, id } from './utils';

export class VerificationService {
  create(subjectId: string, subjectType: VerificationCase['subjectType'], evidenceRefs: string[]): VerificationCase {
    return { id: id('verify'), subjectId, subjectType, evidenceRefs, status: evidenceRefs.length ? 'uploaded' : 'self_declared', badgeLabel: evidenceRefs.length ? 'Uploaded - pending review' : 'Self declared', notes: [] };
  }
  review(actor: AdminActor, c: VerificationCase, status: Extract<VerificationStatus, 'manually_verified' | 'externally_verified' | 'rejected'>, note: string, providerRef?: string): VerificationCase {
    assertPermission(['verification_reviewer', 'platform_admin', 'super_admin'].includes(actor.role), 'Not allowed to review verification');
    const badge = status === 'externally_verified' ? 'Externally verified' : status === 'manually_verified' ? 'Manually verified' : 'Rejected';
    return { ...c, status, badgeLabel: badge, reviewerId: actor.id, providerRef, expiryDate: status === 'rejected' ? undefined : daysFromNow(365), notes: [...c.notes, note] };
  }
  expire(c: VerificationCase): VerificationCase { return { ...c, status: 'expired', badgeLabel: 'Expired verification', notes: [...c.notes, 'Expired by scheduled governance check'] }; }
}
