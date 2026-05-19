import { describe, expect, it } from 'vitest';
import type { Bid, GanttTask, TenderPackage, UserProfile } from '../../types';
import {
  buildMaterialSchedule,
  draftPurchaseOrderForHumanApproval,
  extractBoQBoMItems,
  matchSupplierCatalogue,
  validatePurchaseOrderIssue,
} from '../procurementWorkflowService';

const tender: TenderPackage = {
  id: 'pkg-1',
  projectId: 'project-1',
  jobId: 'job-1',
  title: 'Electrical first fix',
  description: 'Supply conduits, boards, cabling and electrical accessories.',
  scope: ['DB board supply', 'Conduit installation'],
  documents: [
    { name: 'Electrical material schedule.pdf', url: 'https://example.test/schedule.pdf' },
    { name: 'Site photo.jpg', url: 'https://example.test/photo.jpg' },
  ],
  deadline: '2026-07-01',
  requiredDisciplines: ['electrical'],
  status: 'published',
  createdBy: 'bep-1',
  createdAt: '2026-05-01T00:00:00.000Z',
};

const awardedBid: Bid = {
  id: 'bid-1',
  tenderPackageId: 'pkg-1',
  contractorId: 'contractor-1',
  contractorName: 'Main Contractor',
  totalAmount: 12500,
  lineItems: [{ description: 'DB board', quantity: 2, unitPrice: 3000, total: 6000 }],
  proposedTimeline: '2 weeks',
  proposedStartDate: '2026-06-10',
  methodology: 'Install to approved shop drawings.',
  qualifications: 'CIDB and electrical licence verified.',
  attachments: [],
  verificationId: 'verification-1',
  status: 'awarded',
  createdAt: '2026-05-02T00:00:00.000Z',
};

const programmeTask: GanttTask & { packageId: string } = {
  id: 'task-1',
  packageId: 'pkg-1',
  projectId: 'project-1',
  title: 'Electrical first fix',
  startDate: '2026-06-15',
  endDate: '2026-06-30',
  progress: 0,
  phase: 'construction',
  status: 'not_started',
  createdAt: '2026-05-03T00:00:00.000Z',
};

const requester: UserProfile = {
  uid: 'contractor-1',
  email: 'contractor@example.test',
  displayName: 'Main Contractor',
  role: 'contractor',
  createdAt: '2026-05-01T00:00:00.000Z',
};

describe('procurementWorkflowService', () => {
  it('extracts BoQ/BoM items from bid lines, tender scope and source documents with human review flags', () => {
    const items = extractBoQBoMItems({ tender, awardedBid, programmeTasks: [programmeTask] });

    expect(items.map((item) => item.sourceType)).toEqual(['bid_line_item', 'tender_scope', 'tender_scope', 'drawing_or_specification']);
    expect(items[0]).toMatchObject({ description: 'DB board', quantity: 2, total: 6000, requiredBy: '2026-06-15', humanReviewRequired: true });
    expect(items.every((item) => item.confidence > 0 && item.confidence <= 1)).toBe(true);
  });

  it('matches supplier catalogue profiles by package terms, rating and lead time without creating orders', () => {
    const matches = matchSupplierCatalogue(`${tender.title} ${tender.description} ${tender.scope.join(' ')}`, [
      { uid: 'supplier-1', displayName: 'Electrical Supplier', professionalLabels: ['Electrical cabling'], catalogueKeywords: ['boards', 'conduit'], averageRating: 4.8, leadTimeDays: 7 },
      { uid: 'supplier-2', displayName: 'Tiles Supplier', professionalLabels: ['Tiles'], averageRating: 5 },
    ]);

    expect(matches[0].supplier.uid).toBe('supplier-1');
    expect(matches[0].matchTerms).toContain('electrical');
    expect(matches[0].score).toBeGreaterThan(matches[1].score);
  });

  it('drafts purchase orders as pending human approval and never as AI-issued records', () => {
    const sourceItems = extractBoQBoMItems({ tender, awardedBid });
    const draft = draftPurchaseOrderForHumanApproval({
      packageId: tender.id,
      projectId: tender.projectId,
      jobId: tender.jobId,
      title: 'PO for DB boards',
      amount: 6000,
      requestedBy: requester,
      supplierId: 'supplier-1',
      sourceItems: sourceItems.slice(0, 1),
      createdAt: '2026-05-10T00:00:00.000Z',
    });

    expect(draft).toMatchObject({ type: 'purchase_order', status: 'pending_approval', humanReviewRequired: true, aiMayIssue: false });
    expect(draft.sourceItemIds).toEqual([sourceItems[0].id]);
    expect(draft.governanceNote).toMatch(/cannot be issued/i);
  });

  it('blocks purchase order issue without recorded human approval', () => {
    expect(validatePurchaseOrderIssue({ type: 'purchase_order', title: 'AI-generated PO', status: 'issued' })).toMatchObject({ status: 'blocked' });
    expect(validatePurchaseOrderIssue({ type: 'purchase_order', title: 'Approved PO', status: 'approved', humanApprovedBy: 'contractor-1', humanApprovedAt: '2026-05-10T10:00:00.000Z' })).toEqual({ status: 'ready_for_issue', reasons: [] });
  });

  it('orders material schedule items by programme required date before description', () => {
    const late = { ...extractBoQBoMItems({ tender })[0], id: 'late', requiredBy: '2026-07-01', description: 'B item' };
    const early = { ...late, id: 'early', requiredBy: '2026-06-01', description: 'Z item' };

    expect(buildMaterialSchedule([late, early]).map((item) => item.id)).toEqual(['early', 'late']);
  });
});
