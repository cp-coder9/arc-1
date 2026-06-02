import type { Agent, Firm, UserProfile } from '../types';
import type { ContractorWorkflowReadiness } from './contractorWorkflowService';
import type { CPDCertificateRecord } from './cpdService';

export type DashboardReadinessStatus = 'ready' | 'watch' | 'blocked';
export type Phase5AdminCoverageArea = 'firms' | 'subscriptions' | 'cpd' | 'procurement' | 'agent_maintenance';

export interface ProcurementReadinessLike {
  id: string;
  status: 'draft' | 'pending_review' | 'shortlisted' | 'awarded' | 'blocked' | 'cancelled' | 'complete';
  missingDocuments?: string[];
  supplierCount?: number;
  humanApprovalRequired?: boolean;
  approvedBy?: string;
}

export interface Phase5DashboardReadinessInput {
  generatedAt?: string;
  users?: UserProfile[];
  firms?: Firm[];
  agents?: Agent[];
  cpdCertificates?: CPDCertificateRecord[];
  procurementWorkflows?: ProcurementReadinessLike[];
  contractorWorkflows?: ContractorWorkflowReadiness[];
}

export interface Phase5CoverageProjection {
  area: Phase5AdminCoverageArea | 'contractor_dashboard';
  status: DashboardReadinessStatus;
  label: string;
  summary: string;
  counts: Record<string, number>;
  actions: string[];
  sourceCollections: string[];
}

export interface Phase5DashboardReadinessProjection {
  generatedAt: string;
  overallStatus: DashboardReadinessStatus;
  adminOperationsCoverage: Record<Phase5AdminCoverageArea, Phase5CoverageProjection>;
  contractorDashboardReadiness: Phase5CoverageProjection;
  requiredAdminAreas: Phase5AdminCoverageArea[];
  audit: {
    reusedSurfaces: string[];
    noDuplicateUiComponents: true;
    sourceCollections: string[];
  };
}

const REQUIRED_ADMIN_AREAS: Phase5AdminCoverageArea[] = ['firms', 'subscriptions', 'cpd', 'procurement', 'agent_maintenance'];

export function projectPhase5DashboardReadiness(input: Phase5DashboardReadinessInput): Phase5DashboardReadinessProjection {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const adminOperationsCoverage = {
    firms: projectFirmCoverage(input.firms ?? [], input.users ?? []),
    subscriptions: projectSubscriptionCoverage(input.firms ?? [], input.users ?? []),
    cpd: projectCpdCoverage(input.cpdCertificates ?? []),
    procurement: projectProcurementCoverage(input.procurementWorkflows ?? [], input.contractorWorkflows ?? []),
    agent_maintenance: projectAgentMaintenanceCoverage(input.agents ?? []),
  } satisfies Record<Phase5AdminCoverageArea, Phase5CoverageProjection>;
  const contractorDashboardReadiness = projectContractorDashboardCoverage(input.contractorWorkflows ?? []);
  const all = [...Object.values(adminOperationsCoverage), contractorDashboardReadiness];

  return {
    generatedAt,
    overallStatus: combineStatuses(all.map((item) => item.status)),
    adminOperationsCoverage,
    contractorDashboardReadiness,
    requiredAdminAreas: REQUIRED_ADMIN_AREAS,
    audit: {
      reusedSurfaces: [
        'AdminDashboard existing firms/governance/financial/compliance surfaces',
        'ContractorDashboard existing tender/programme/RFI/site-log/payment surfaces',
        'contractorWorkflowService delivery readiness projection',
        'firmService, cpdService, procurementWorkflowService, agent roster records',
      ],
      noDuplicateUiComponents: true,
      sourceCollections: unique(all.flatMap((item) => item.sourceCollections)),
    },
  };
}

function projectFirmCoverage(firms: Firm[], users: UserProfile[]): Phase5CoverageProjection {
  const orphanedFirms = firms.filter((firm) => !users.some((user) => user.uid === firm.ownerId));
  return coverage('firms', 'Firm workspace oversight', orphanedFirms.length > 0 ? 'watch' : 'ready', {
    firms: firms.length,
    usersLinkedToFirms: users.filter((user) => Boolean(user.primaryFirmId || user.firmMembershipIds?.length)).length,
    orphanedOwners: orphanedFirms.length,
  }, orphanedFirms.length > 0 ? ['Review firm owner records that no longer map to a user profile.'] : [], ['firms', 'users']);
}

function projectSubscriptionCoverage(firms: Firm[], users: UserProfile[]): Phase5CoverageProjection {
  const atRiskFirms = firms.filter((firm) => firm.subscriptionStatus === 'past_due' || firm.subscriptionStatus === 'cancelled' || firm.subscriptionStatus === 'none');
  const atRiskUsers = users.filter((user) => user.subscriptionStatus === 'past_due' || user.subscriptionStatus === 'cancelled');
  return coverage('subscriptions', 'Subscription/access operations', atRiskFirms.length + atRiskUsers.length > 0 ? 'watch' : 'ready', {
    activeOrTrialFirms: firms.filter((firm) => firm.subscriptionStatus === 'active' || firm.subscriptionStatus === 'trial').length,
    atRiskFirms: atRiskFirms.length,
    atRiskUsers: atRiskUsers.length,
  }, atRiskFirms.length + atRiskUsers.length > 0 ? ['Review past-due, cancelled, or unassigned subscription access before broad dashboard rollout.'] : [], ['firms', 'users', 'billing_events']);
}

function projectCpdCoverage(certificates: CPDCertificateRecord[]): Phase5CoverageProjection {
  const blocked = certificates.filter((certificate) => certificate.status === 'revoked' || certificate.status === 'expired');
  return coverage('cpd', 'CPD certificate operations', blocked.length > 0 ? 'watch' : 'ready', {
    certificates: certificates.length,
    issued: certificates.filter((certificate) => certificate.status === 'issued').length,
    expiredOrRevoked: blocked.length,
  }, blocked.length > 0 ? ['Surface expired/revoked CPD certificates in admin review queues.'] : [], ['cpd_certificates', 'cpd_attempts']);
}

function projectProcurementCoverage(procurements: ProcurementReadinessLike[], contractorWorkflows: ContractorWorkflowReadiness[]): Phase5CoverageProjection {
  const blockedProcurements = procurements.filter((workflow) => workflow.status === 'blocked' || (workflow.humanApprovalRequired && !workflow.approvedBy) || Boolean(workflow.missingDocuments?.length));
  const blockedContractorPackages = contractorWorkflows.filter((workflow) => !workflow.canRequestProcurementApproval);
  const blocked = blockedProcurements.length + blockedContractorPackages.length;
  return coverage('procurement', 'Supplier/procurement operations', blocked > 0 ? 'blocked' : 'ready', {
    procurementWorkflows: procurements.length,
    blockedProcurements: blockedProcurements.length,
    contractorPackagesBlockedForApproval: blockedContractorPackages.length,
  }, blocked > 0 ? ['Resolve procurement blockers or record human approvals before admin marks packages ready.'] : [], ['procurement_workflows', 'supplier_quotes', 'tender_packages', 'delivery_evidence']);
}

function projectAgentMaintenanceCoverage(agents: Agent[]): Phase5CoverageProjection {
  const maintenance = agents.filter((agent) => agent.status === 'maintenance' || !agent.systemPrompt?.trim());
  const offline = agents.filter((agent) => agent.status === 'offline');
  return coverage('agent_maintenance', 'Agent roster maintenance', maintenance.length > 0 ? 'blocked' : offline.length > 0 ? 'watch' : 'ready', {
    agents: agents.length,
    online: agents.filter((agent) => agent.status === 'online').length,
    offline: offline.length,
    maintenance: maintenance.length,
  }, maintenance.length > 0 ? ['Complete maintenance or missing prompt configuration for agents used in governed workflows.'] : offline.length > 0 ? ['Review offline agents before relying on automated dashboard notifications.'] : [], ['agents', 'system_logs', 'ai_review_queue']);
}

function projectContractorDashboardCoverage(workflows: ContractorWorkflowReadiness[]): Phase5CoverageProjection {
  const blocked = workflows.filter((workflow) => workflow.readiness.status === 'blocked' || workflow.deliveryReadinessProjection.roleNextActions.some((action) => action.priority === 'high'));
  return coverage('contractor_dashboard', 'Contractor dashboard readiness', blocked.length > 0 ? 'blocked' : workflows.length === 0 ? 'watch' : 'ready', {
    packages: workflows.length,
    readyForCloseout: workflows.filter((workflow) => workflow.canRequestCloseoutReview).length,
    blockedPackages: blocked.length,
  }, workflows.length === 0 ? ['Connect contractor dashboard projections to live tender, programme, RFI, site log, procurement, and payment claim data.'] : blocked.length > 0 ? ['Use existing contractor workflow gates to clear high-priority delivery actions.'] : [], ['tender_packages', 'programme_tasks', 'rfis', 'site_logs', 'payment_claims']);
}

function coverage(area: Phase5CoverageProjection['area'], label: string, status: DashboardReadinessStatus, counts: Record<string, number>, actions: string[], sourceCollections: string[]): Phase5CoverageProjection {
  return {
    area,
    label,
    status,
    summary: actions.length === 0 ? `${label} has enough source coverage for dashboard projection.` : actions[0],
    counts,
    actions,
    sourceCollections,
  };
}

function combineStatuses(statuses: DashboardReadinessStatus[]): DashboardReadinessStatus {
  if (statuses.includes('blocked')) return 'blocked';
  if (statuses.includes('watch')) return 'watch';
  return 'ready';
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
