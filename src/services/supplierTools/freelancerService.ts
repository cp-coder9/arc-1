import type { FileRef, FreelancerDeliverable, FreelancerEngagement, FreelancerTimesheet, PackageScope } from './types';
import { id, money } from './utils';

export class FreelancerService {
  createEngagement(scope: PackageScope, data: { freelancerId: string; discipline: string; supervisorId: string; supervisorRole: FreelancerEngagement['supervisorRole'] }): FreelancerEngagement {
    return { id: id('eng'), packageId: scope.id, freelancerId: data.freelancerId, discipline: data.discipline, supervisorId: data.supervisorId, supervisorRole: data.supervisorRole, supervisorRequired: true };
  }
  submitDeliverable(engagement: FreelancerEngagement, title: string, fileRefs: FileRef[]): FreelancerDeliverable {
    return { id: id('deliv'), engagementId: engagement.id, title, fileRefs, status: 'supervisor_review_required', externalIssueBlocked: true };
  }
  supervisorSignoff(deliv: FreelancerDeliverable, supervisorId: string): FreelancerDeliverable {
    return { ...deliv, status: 'signed_off', supervisorSignoffBy: supervisorId, externalIssueBlocked: false };
  }
  submitTimesheet(engagement: FreelancerEngagement, data: { date: string; hours: number; activity: string; deliverableRefs: string[]; hourlyRate: number }): FreelancerTimesheet {
    return { id: id('time'), engagementId: engagement.id, date: data.date, hours: data.hours, activity: data.activity, deliverableRefs: data.deliverableRefs, hourlyRate: data.hourlyRate, claimAmount: money(data.hours * data.hourlyRate), supervisorApproved: false };
  }
  approveTimesheet(ts: FreelancerTimesheet): FreelancerTimesheet { return { ...ts, supervisorApproved: true }; }
}
