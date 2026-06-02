import type { Agent, Firm, UserProfile } from '../../types';
import type { ContractorWorkflowReadiness } from '../contractorWorkflowService';
import type { CPDCertificateRecord } from '../cpdService';
import { projectPhase5DashboardReadiness } from '../phase5DashboardReadinessService';

const user: UserProfile = {
  uid: 'user-1',
  email: 'owner@example.com',
  displayName: 'Owner User',
  role: 'architect',
  primaryFirmId: 'firm-1',
  subscriptionStatus: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const firm: Firm = {
  id: 'firm-1',
  name: 'Arc Studio',
  ownerId: user.uid,
  subscriptionStatus: 'active',
  createdBy: user.uid,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const agent: Agent = {
  id: 'agent-1',
  name: 'Compliance Agent',
  role: 'compliance',
  description: 'Checks governed workflows',
  systemPrompt: 'Review governed workflows.',
  temperature: 0.1,
  status: 'online',
  lastActive: '2026-01-01T00:00:00.000Z',
};

const certificate: CPDCertificateRecord = {
  userId: user.uid,
  courseId: 'course-1',
  attemptId: 'attempt-1',
  issuedAt: '2026-01-01T00:00:00.000Z',
  issuerKey: 'issuer-key',
  verificationCode: 'CPD-COURSE-ABC',
  verificationHash: 'hash',
  verificationVersion: 'cpd-cert-v1',
  status: 'issued',
};

function contractorWorkflow(overrides: Partial<ContractorWorkflowReadiness> = {}): ContractorWorkflowReadiness {
  return {
    readiness: {
      status: 'ready_for_closeout',
      score: 100,
      blockers: [],
      warnings: [],
      missingEvidence: [],
      dependencyIssues: [],
    },
    gates: [],
    nextActions: [],
    canRequestProcurementApproval: true,
    canRequestCloseoutReview: true,
    deliveryReadinessProjection: {
      packageId: 'pkg-1',
      projectId: 'project-1',
      projectedStatus: 'ready_for_closeout',
      score: 100,
      siteLogCoverage: { expectedWorkingDays: 1, loggedDays: 1, missingDays: [], coveragePercent: 100, issueCount: 0 },
      rfiSummary: { open: 0, overdue: 0, respondedAwaitingClosure: 0, urgentOpen: 0 },
      inspectionSummary: { passed: 1, conditional: 0, failed: 0, latestInspectionDate: '2026-01-02' },
      programmeEvidence: { completedTasks: 1, incompleteTasks: 0, delayedCriticalTasks: 0, unapprovedBaselineChanges: 0, approvedEvidenceCount: 3, missingEvidence: [] },
      roleNextActions: [],
      audit: {
        generatedAt: '2026-01-03T00:00:00.000Z',
        asOf: '2026-01-03T00:00:00.000Z',
        sources: ['programme_tasks', 'site_logs', 'rfis', 'inspections', 'delivery_evidence'],
        counts: { programmeTasks: 1, siteLogs: 1, rfis: 0, inspections: 1, evidenceItems: 3 },
      },
    },
    ...overrides,
  };
}

describe('phase5DashboardReadinessService', () => {
  it('projects all required Phase 5 admin operations and contractor dashboard readiness from existing surfaces', () => {
    const projection = projectPhase5DashboardReadiness({
      generatedAt: '2026-05-20T00:00:00.000Z',
      users: [user],
      firms: [firm],
      agents: [agent],
      cpdCertificates: [certificate],
      procurementWorkflows: [{ id: 'proc-1', status: 'awarded', humanApprovalRequired: true, approvedBy: 'admin-1' }],
      contractorWorkflows: [contractorWorkflow()],
    });

    expect(projection.overallStatus).toBe('ready');
    expect(projection.requiredAdminAreas).toEqual(['firms', 'subscriptions', 'cpd', 'procurement', 'agent_maintenance']);
    expect(Object.keys(projection.adminOperationsCoverage).sort()).toEqual(['agent_maintenance', 'cpd', 'firms', 'procurement', 'subscriptions']);
    expect(projection.contractorDashboardReadiness.status).toBe('ready');
    expect(projection.audit.noDuplicateUiComponents).toBe(true);
    expect(projection.audit.reusedSurfaces).toEqual(expect.arrayContaining([
      expect.stringContaining('AdminDashboard existing'),
      expect.stringContaining('ContractorDashboard existing'),
      expect.stringContaining('contractorWorkflowService'),
    ]));
  });

  it('blocks rollout when procurement approvals, contractor gates, or agent maintenance need admin action', () => {
    const projection = projectPhase5DashboardReadiness({
      users: [{ ...user, subscriptionStatus: 'past_due' }],
      firms: [{ ...firm, subscriptionStatus: 'past_due' }],
      agents: [{ ...agent, status: 'maintenance', systemPrompt: '' }],
      cpdCertificates: [{ ...certificate, status: 'expired' }],
      procurementWorkflows: [{ id: 'proc-blocked', status: 'pending_review', missingDocuments: ['supplier_insurance'], humanApprovalRequired: true }],
      contractorWorkflows: [contractorWorkflow({
        canRequestProcurementApproval: false,
        readiness: { status: 'blocked', score: 30, blockers: ['Missing approval'], warnings: [], missingEvidence: ['site_log'], dependencyIssues: [] },
        deliveryReadinessProjection: {
          ...contractorWorkflow().deliveryReadinessProjection,
          projectedStatus: 'blocked',
          roleNextActions: [{ owner: 'contractor', priority: 'high', action: 'Backfill missing site logs.' }],
        },
      })],
    });

    expect(projection.overallStatus).toBe('blocked');
    expect(projection.adminOperationsCoverage.subscriptions.status).toBe('watch');
    expect(projection.adminOperationsCoverage.cpd.status).toBe('watch');
    expect(projection.adminOperationsCoverage.procurement.status).toBe('blocked');
    expect(projection.adminOperationsCoverage.agent_maintenance.status).toBe('blocked');
    expect(projection.contractorDashboardReadiness.status).toBe('blocked');
    expect(projection.adminOperationsCoverage.procurement.actions).toEqual(expect.arrayContaining([
      'Resolve procurement blockers or record human approvals before admin marks packages ready.',
    ]));
  });
});
