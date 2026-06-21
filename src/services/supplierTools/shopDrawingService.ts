import type { FileRef, PackageScope, ShopDrawingSubmission } from './types';
import { id } from './utils';

export class ShopDrawingService {
  submit(scope: PackageScope, data: { submittedBy: string; revision: string; title: string; fileRefs: FileRef[]; reviewerRole: ShopDrawingSubmission['reviewerRole'] }): ShopDrawingSubmission {
    return { id: id('shop'), packageId: scope.id, submittedBy: data.submittedBy, revision: data.revision, title: data.title, fileRefs: data.fileRefs, status: 'under_review', reviewerRole: data.reviewerRole };
  }
  review(sub: ShopDrawingSubmission, status: 'approved' | 'approved_with_comments' | 'rejected' | 'resubmit_required', comment: string): ShopDrawingSubmission {
    return { ...sub, status, reviewComment: comment };
  }
}
