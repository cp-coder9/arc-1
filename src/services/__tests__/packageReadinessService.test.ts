import type { Bid, GanttTask, RFI, SiteInspection, SiteLog, TenderPackage } from '../../types';
import { evaluatePackageReadiness, type DeliveryEvidenceItem } from '../packageReadinessService';

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
});
