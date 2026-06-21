import type { AdminActor, ReviewQueueItem, ReviewStatus } from './types';
import { assertPermission, id } from './utils';

export class ReviewQueueService {
  create(input: Omit<ReviewQueueItem, 'id' | 'status'>): ReviewQueueItem { return { id: id('review'), status: 'queued', ...input }; }
  start(actor: AdminActor, item: ReviewQueueItem): ReviewQueueItem { assertPermission(actor.role === item.reviewerRole || actor.role === 'super_admin', 'Wrong reviewer role'); return { ...item, status: 'in_review' }; }
  decide(actor: AdminActor, item: ReviewQueueItem, status: Extract<ReviewStatus, 'approved' | 'rejected' | 'needs_more_info'>, note: string): ReviewQueueItem {
    assertPermission(actor.role === item.reviewerRole || actor.role === 'super_admin', 'Wrong reviewer role');
    if (item.status !== 'in_review') throw new Error('Item must be in review before decision');
    return { ...item, status, decisionBy: actor.id, decisionNote: note };
  }
}
