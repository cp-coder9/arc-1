import type { Bid, GanttTask, RFI, SiteInspection, SiteLog, TenderPackage } from '../../types';
import { assessContractorWorkflow } from '../contractorWorkflowService';
import type { DeliveryEvidenceItem } from '../packageReadinessService';

const tender: TenderPackage = {
  id: 'pkg-1',
  projectId: 'project-1',
  jobId: 'job-1',
  title: 'Electrical Works Package',
  description: 'Electrical subcontractor package',
  scope: ['First fix', 'Second fix'],
  documents: [],
  deadline: '2026-06-30',
  estimatedBudget: 250000,
  requiredDisciplines: ['electrical'],
  status: 'awarded',
  createdBy: 'contractor-1',
  awardedBidId: 'bid-1',
  awardedContractorId: 'subcontractor-1',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const awardedBid: Bid = {
  id: 'bid-1',
  tenderPackageId: 'pkg-1',
  contractorId: 'subcontractor-1',
  contractorName: 'Spark Works',
  totalAmount: 240000,
  lineItems: [],
  proposedTimeline: '4 weeks',
  proposedStartDate: '2026-07-01',
  methodology: 'Staged installation',
  qualifications: 'Registered electrician',
  attachments: [],
  verificationId: 'verification-1',
  status: 'awarded',
  createdAt: '2026-01-02T00:00:00.000Z',
};

const completedTask: GanttTask = {
  id: 'task-1',
  projectId: 'project-1',
  title: 'Second fix complete',
  startDate: '2026-07-01',
  endDate: '2026-07-28',
  progress: 100,
  phase: 'Electrical',
  status: 'completed',
  createdAt: '2026-07-01T00:00:00.000Z',
};

const closedRfi: RFI = {
  id: 'rfi-1',
  projectId: 'project-1',
  number: 1,
  subject: 'DB location',
  question: 'Confirm DB location',
  attachments: [],
  requestedBy: 'subcontractor-1',
  assignedTo: 'bep-1',
  priority: 'medium',
  status: 'closed',
  dueDate: '2026-07-10',
  createdAt: '2026-07-01T00:00:00.000Z',
};

const siteLog: SiteLog = {
  id: 'log-1',
  projectId: 'project-1',
  date: '2026-07-28',
  weather: 'sunny',
  workDescription: 'Electrical second fix completed',
  photos: [],
  createdBy: 'contractor-1',
  createdAt: '2026-07-28T00:00:00.000Z',
};

const passedInspection: SiteInspection = {
  id: 'inspection-1',
  projectId: 'project-1',
  inspectionType: 'final',
  date: '2026-07-29',
  inspector: 'bep-1',
  checklist: [],
  overallResult: 'pass',
  photos: [],
  createdAt: '2026-07-29T00:00:00.000Z',
};

const approvedEvidence: DeliveryEvidenceItem[] = [
  { id: 'ev-1', type: 'site_log', title: 'Final site diary', status: 'approved', createdAt: '2026-07-28T00:00:00.000Z' },
  { id: 'ev-2', type: 'inspection', title: 'Final inspection', status: 'approved', createdAt: '2026-07-29T00:00:00.000Z' },
  { id: 'ev-3', type: 'closeout_document', title: 'Electrical COC', status: 'approved', createdAt: '2026-07-30T00:00:00.000Z' },
];

const baseInput = {
  tender,
  awardedBid,
  programmeTasks: [completedTask],
  rfis: [closedRfi],
  siteLogs: [siteLog],
  inspections: [passedInspection],
  evidence: approvedEvidence,
  asOf: '2026-08-01T00:00:00.000Z',
};

describe('contractorWorkflowService', () => {
  it('marks a fully evidenced package as ready for procurement approval and closeout review', () => {
    const result = assessContractorWorkflow(baseInput);

    expect(result.readiness.status).toBe('ready_for_closeout');
    expect(result.gates.map((gate) => gate.status)).toEqual(['pass', 'pass', 'pass', 'pass']);
    expect(result.nextActions).toEqual([]);
    expect(result.canRequestProcurementApproval).toBe(true);
    expect(result.canRequestCloseoutReview).toBe(true);
  });

  it('blocks approval readiness when programme dependencies are invalid and RFIs are overdue', () => {
    const blockedTask: GanttTask = {
      ...completedTask,
      id: 'task-blocked',
      title: 'Commission installation',
      dependsOn: ['task-predecessor'],
    };
    const predecessor: GanttTask = {
      ...completedTask,
      id: 'task-predecessor',
      title: 'Complete containment',
      status: 'in_progress',
      progress: 80,
    };

    const result = assessContractorWorkflow({
      ...baseInput,
      programmeTasks: [predecessor, blockedTask],
      rfis: [{ ...closedRfi, status: 'overdue', dueDate: '2026-07-20' }],
    });

    expect(result.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'programme_dependencies', status: 'blocked' }),
      expect.objectContaining({ id: 'rfi_status', status: 'blocked' }),
    ]));
    expect(result.canRequestProcurementApproval).toBe(false);
    expect(result.canRequestCloseoutReview).toBe(false);
    expect(result.nextActions).toEqual(expect.arrayContaining([
      'Programme task "Commission installation" is complete before predecessor "Complete containment" is complete.',
      '1 overdue RFI require response before approval readiness.',
    ]));
  });

  it('requires human confirmation for issued purchase orders without recorded approval', () => {
    const result = assessContractorWorkflow({
      ...baseInput,
      procurementCommitments: [
        {
          id: 'po-1',
          packageId: tender.id,
          type: 'purchase_order',
          title: 'Main cable purchase order',
          status: 'issued',
          amount: 42000,
        },
      ],
    });

    expect(result.gates).toContainEqual(expect.objectContaining({
      id: 'procurement_approval',
      status: 'blocked',
      humanConfirmationRequired: true,
    }));
    expect(result.canRequestProcurementApproval).toBe(false);
  });

  it('surfaces snag and missing evidence closeout actions', () => {
    const result = assessContractorWorkflow({
      ...baseInput,
      evidence: approvedEvidence.filter((item) => item.type !== 'closeout_document'),
      snags: [{ id: 'snag-1', packageId: tender.id, title: 'Exposed conduit', severity: 'high', status: 'open' }],
    });

    expect(result.gates).toContainEqual(expect.objectContaining({
      id: 'closeout_evidence',
      status: 'blocked',
      detail: 'Missing approved evidence: closeout_document.',
    }));
    expect(result.canRequestCloseoutReview).toBe(false);
  });
});
