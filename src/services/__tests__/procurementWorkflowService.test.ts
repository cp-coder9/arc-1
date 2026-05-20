import { describe, expect, it } from 'vitest';
import type { Bid, GanttTask, TenderPackage, UserProfile } from '../../types';
import {
  buildRFQShortlist,
  buildMaterialSchedule,
  draftPurchaseOrderForHumanApproval,
  evaluateSupplierPrequalification,
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

  it('prequalifies suppliers only when required statutory and commercial documents are verified', () => {
    const result = evaluateSupplierPrequalification({
      supplier: { uid: 'supplier-1', displayName: 'Electrical Supplier', averageRating: 4.8 },
      requiredDocumentTypes: ['tax_clearance', 'bbbee_certificate', 'cidb_registration'],
      documents: [
        { type: 'tax_clearance', status: 'verified', expiresAt: '2026-12-31', verifiedBy: 'admin-1', verifiedAt: '2026-05-01T00:00:00.000Z' },
        { type: 'bbbee_certificate', status: 'verified', expiresAt: '2027-01-31', verifiedBy: 'admin-1', verifiedAt: '2026-05-01T00:00:00.000Z' },
        { type: 'cidb_registration', status: 'verified', verifiedBy: 'admin-1', verifiedAt: '2026-05-01T00:00:00.000Z' },
      ],
      minimumRating: 4,
      asOf: '2026-05-20T00:00:00.000Z',
    });

    expect(result).toMatchObject({
      supplierId: 'supplier-1',
      status: 'prequalified',
      blockers: [],
      warnings: [],
      humanReviewRequired: false,
      aiMayAward: false,
    });
    expect(result.verifiedDocumentTypes).toEqual(['tax_clearance', 'bbbee_certificate', 'cidb_registration']);
    expect(result.governanceNote).toMatch(/require recorded human approval/i);
  });

  it('blocks supplier prequalification when required documents are missing, expired or rejected', () => {
    const result = evaluateSupplierPrequalification({
      supplier: { uid: 'supplier-2', displayName: 'Materials Supplier', averageRating: 3.2 },
      requiredDocumentTypes: ['tax_clearance', 'bbbee_certificate', 'insurance'],
      documents: [
        { type: 'tax_clearance', status: 'verified', expiresAt: '2026-01-01' },
        { type: 'bbbee_certificate', status: 'rejected' },
      ],
      minimumRating: 4,
      asOf: '2026-05-20T00:00:00.000Z',
    });

    expect(result.status).toBe('blocked');
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.stringContaining('tax_clearance has expired'),
      expect.stringContaining('bbbee_certificate is rejected'),
      expect.stringContaining('insurance is required'),
    ]));
    expect(result.warnings).toContain('Materials Supplier is below the preferred supplier rating threshold.');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('builds advisory RFQ shortlists ranked by prequalification status before catalogue score', () => {
    const shortlist = buildRFQShortlist({
      packageText: `${tender.title} ${tender.description} ${tender.scope.join(' ')}`,
      suppliers: [
        { uid: 'blocked-high-score', displayName: 'Electrical Boards Express', catalogueKeywords: ['electrical', 'boards', 'conduit'], averageRating: 5, leadTimeDays: 2 },
        { uid: 'prequalified', displayName: 'Compliant Electrical Supply', catalogueKeywords: ['electrical', 'conduit'], averageRating: 4.2, leadTimeDays: 14 },
      ],
      supplierDocuments: {
        prequalified: [
          { type: 'tax_clearance', status: 'verified', expiresAt: '2026-12-31' },
          { type: 'bbbee_certificate', status: 'verified', expiresAt: '2026-12-31' },
        ],
        'blocked-high-score': [
          { type: 'tax_clearance', status: 'verified', expiresAt: '2026-12-31' },
        ],
      },
      asOf: '2026-05-20T00:00:00.000Z',
      limit: 2,
    });

    expect(shortlist.map((entry) => entry.supplier.uid)).toEqual(['prequalified', 'blocked-high-score']);
    expect(shortlist[0]).toMatchObject({ rank: 1, prequalification: { status: 'prequalified', aiMayAward: false } });
    expect(shortlist[1].prequalification.status).toBe('blocked');
  });
});
