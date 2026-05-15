import type { Bid, GanttTask, RFI, SiteInspection, SiteLog, TenderPackage } from '../../types';
import { evaluatePackageReadiness, evaluateProgrammeDependencies, type DeliveryEvidenceItem } from '../packageReadinessService';

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
  { id: 'ev-4', type: 'wage_record', title: 'Wage register', status: 'approved', requiredForCloseout: true, createdAt: '2026-07-30T00:00:00.000Z' },
];

describe('packageReadinessService', () => {
  it('marks an awarded package with completed tasks and approved evidence as closeout-ready', () => {
    const result = evaluatePackageReadiness({
      tender,
      awardedBid,
      programmeTasks: [completedTask],
      rfis: [closedRfi],
      siteLogs: [siteLog],
      inspections: [passedInspection],
      evidence: approvedEvidence,
      asOf: '2026-08-01T00:00:00.000Z',
    });

    expect(result.status).toBe('ready_for_closeout');
    expect(result.score).toBe(100);
    expect(result.blockers).toEqual([]);
    expect(result.missingEvidence).toEqual([]);
    expect(result.requiredEvidence).toContain('wage_record');
  });

  it('blocks closeout when award, overdue RFI, inspection, and evidence gates are not satisfied', () => {
    const result = evaluatePackageReadiness({
      tender: { ...tender, status: 'closed', awardedBidId: undefined, awardedContractorId: undefined },
      programmeTasks: [{ ...completedTask, status: 'in_progress', progress: 75 }],
      rfis: [{ ...closedRfi, status: 'open', dueDate: '2026-07-05' }],
      siteLogs: [],
      inspections: [{ ...passedInspection, overallResult: 'fail' }],
      evidence: [{ id: 'ev-draft', type: 'closeout_document', title: 'Draft COC', status: 'submitted', createdAt: '2026-07-30T00:00:00.000Z' }],
      asOf: '2026-08-01T00:00:00.000Z',
    });

    expect(result.status).toBe('blocked');
    expect(result.score).toBeLessThan(50);
    expect(result.blockers).toEqual(expect.arrayContaining([
      'Package has not been awarded to a contractor or package assignee.',
      '1 RFI overdue.',
      '1 failed inspection must be resolved.',
    ]));
    expect(result.missingEvidence).toEqual(['site_log', 'inspection', 'closeout_document']);
    expect(result.warnings).toContain('1 programme task not complete.');
  });

  it('blocks closeout for programme dependency cycles and completed tasks with incomplete predecessors', () => {
    const foundationTask: GanttTask = {
      ...completedTask,
      id: 'task-foundation',
      title: 'Foundation complete',
      status: 'in_progress',
      progress: 80,
      dependsOn: ['task-coc'],
    };
    const cocTask: GanttTask = {
      ...completedTask,
      id: 'task-coc',
      title: 'Electrical COC issued',
      dependsOn: ['task-foundation'],
    };

    const dependencyIssues = evaluateProgrammeDependencies([foundationTask, cocTask]);
    expect(dependencyIssues).toEqual(expect.arrayContaining([
      'Programme task "Electrical COC issued" is complete before predecessor "Foundation complete" is complete.',
      'Programme dependency cycle detected: task-foundation -> task-coc -> task-foundation -> task-foundation.',
    ]));

    const result = evaluatePackageReadiness({
      tender,
      awardedBid,
      programmeTasks: [foundationTask, cocTask],
      rfis: [closedRfi],
      siteLogs: [siteLog],
      inspections: [passedInspection],
      evidence: approvedEvidence,
      asOf: '2026-08-01T00:00:00.000Z',
    });

    expect(result.status).toBe('blocked');
    expect(result.dependencyIssues).toHaveLength(2);
    expect(result.blockers).toEqual(expect.arrayContaining(result.dependencyIssues));
  });

  it('preserves human approval gates for procurement and payment effects and blocks high severity snags', () => {
    const result = evaluatePackageReadiness({
      tender,
      awardedBid,
      programmeTasks: [completedTask],
      rfis: [closedRfi],
      siteLogs: [siteLog],
      inspections: [passedInspection],
      evidence: approvedEvidence,
      procurementCommitments: [
        {
          id: 'po-1',
          packageId: tender.id,
          type: 'purchase_order',
          title: 'Main cable purchase order',
          status: 'issued',
          amount: 42000,
          dueDate: '2026-07-15',
        },
        {
          id: 'claim-1',
          packageId: tender.id,
          type: 'payment_claim',
          title: 'Electrical final payment claim',
          status: 'pending_approval',
          amount: 30000,
        },
      ],
      snags: [
        { id: 'snag-1', packageId: tender.id, title: 'Exposed conduit', severity: 'high', status: 'open', dueDate: '2026-07-31' },
        { id: 'snag-2', packageId: tender.id, title: 'Label DB board', severity: 'low', status: 'ready_for_inspection', dueDate: '2026-07-31' },
      ],
      asOf: '2026-08-01T00:00:00.000Z',
    });

    expect(result.status).toBe('blocked');
    expect(result.blockers).toEqual(expect.arrayContaining([
      'Main cable purchase order requires recorded human approval before procurement, subcontract, or payment effects are treated as valid.',
      '1 high/critical snag remain open.',
    ]));
    expect(result.warnings).toEqual(expect.arrayContaining([
      'Electrical final payment claim is waiting for human approval.',
      '2 snags overdue.',
      '1 low/medium snag remain open.',
    ]));
  });
});
