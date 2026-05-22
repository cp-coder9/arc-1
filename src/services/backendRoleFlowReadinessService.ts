import type { UserRole } from '@/types';
import { evaluateApprovalGateReadiness, type ApprovalGateDomain, type ApprovalGateRecord, type ApprovalGateRisk } from './approvalGateService';

export type BackendRoleFlowStatus = 'ready' | 'partial' | 'blocked';
export type BackendRoleFlowMaturity = 'implemented' | 'workflow_shell' | 'provider_gated' | 'human_governed';

export interface BackendRoleFlowRequirement {
  id: string;
  label: string;
  roles: UserRole[];
  requiredPages: string[];
  requiredCapabilities: string[];
  humanGateRequired?: boolean;
  providerGate?: 'payment' | 'statutory' | 'supplier' | 'deployment';
}

export interface BackendRoleFlowApprovalGateEvidence {
  gateId: string;
  domain: ApprovalGateDomain;
  ready: boolean;
  blockers: string[];
  requiredApproverRoles: Array<UserRole | string>;
  risk: ApprovalGateRisk;
  requiresVerifiedProfessional: boolean;
  requiresAdminEscalation: boolean;
  aiMayNotApprove: true;
}

export interface BackendRoleFlowEvidence {
  pageIds?: string[];
  capabilityIds?: string[];
  providerApprovals?: string[];
  humanGovernanceQueues?: string[];
  approvalGates?: ApprovalGateRecord[];
}

export interface BackendRoleFlowReadinessItem extends BackendRoleFlowRequirement {
  status: BackendRoleFlowStatus;
  maturity: BackendRoleFlowMaturity;
  missingPages: string[];
  missingCapabilities: string[];
  approvalGateEvidence: BackendRoleFlowApprovalGateEvidence[];
  blockers: string[];
}

export interface BackendRoleFlowReadinessProjection {
  generatedAt: string;
  role: UserRole;
  overallStatus: BackendRoleFlowStatus;
  readyCount: number;
  partialCount: number;
  blockedCount: number;
  items: BackendRoleFlowReadinessItem[];
  nextActions: string[];
  audit: {
    source: 'backend.html';
    providerNeutral: true;
    noFakeIntegrations: true;
    humanApprovalPreserved: true;
  };
}

const COMMON_PROJECT_PAGES = ['command', 'profile', 'toolbox', 'journey', 'tasks', 'messages', 'programme', 'contracts', 'payments', 'escrow', 'ai'];

const APPROVAL_GATE_DOMAINS_BY_REQUIREMENT: Record<string, ApprovalGateDomain[]> = {
  'client-brief-to-appointment': ['contract_execution', 'payment_release'],
  'bep-design-compliance': ['ai_output', 'compliance_signoff', 'municipal_submission'],
  'contractor-construction-os': ['procurement_issue', 'programme_change', 'closeout_acceptance'],
  'package-participant-workspace': ['procurement_issue', 'closeout_acceptance'],
  'freelancer-delivery': ['ai_output', 'payment_release'],
  'admin-governance-console': ['ai_output', 'compliance_signoff', 'payment_release', 'contract_execution', 'procurement_issue', 'programme_change', 'municipal_submission', 'closeout_acceptance'],
};

export const BACKEND_ROLE_FLOW_REQUIREMENTS: BackendRoleFlowRequirement[] = [
  {
    id: 'client-brief-to-appointment',
    label: 'Client brief, proposal comparison, appointment, and progress decisions',
    roles: ['client'],
    requiredPages: [...COMMON_PROJECT_PAGES, 'client-intake', 'client-proposals', 'directory-search', 'client-progress', 'municipal-tracker'],
    requiredCapabilities: ['guided_brief_record', 'proposal_comparison', 'appointment_decision', 'plain_language_progress', 'payment_governance_warning'],
    humanGateRequired: true,
  },
  {
    id: 'bep-design-compliance',
    label: 'BEP design team technical brief, drawing, compliance, SANS, and team coordination',
    roles: ['bep', 'architect'],
    requiredPages: [...COMMON_PROJECT_PAGES, 'design', 'drawing-register', 'drawing-checker', 'sans-forms', 'technical-brief', 'bep-team', 'bep-freelancers', 'resource-centre', 'cpd-assessment'],
    requiredCapabilities: ['technical_brief_review', 'drawing_register', 'ai_compliance_review', 'sans_form_evidence', 'discipline_matrix', 'cpd_evidence'],
    humanGateRequired: true,
    providerGate: 'statutory',
  },
  {
    id: 'contractor-construction-os',
    label: 'Contractor construction OS, procurement, RFIs, staff/wages/plant, claims, and close-out',
    roles: ['contractor'],
    requiredPages: [...COMMON_PROJECT_PAGES, 'construction', 'procurement', 'packages', 'contractor-staff', 'snagging', 'directory-search'],
    requiredCapabilities: ['site_log', 'rfi_workflow', 'procurement_award_readiness', 'staff_wage_plant_records', 'package_closeout', 'claim_governance'],
    humanGateRequired: true,
    providerGate: 'supplier',
  },
  {
    id: 'package-participant-workspace',
    label: 'Subcontractor and supplier package workspace, evidence, deliveries, claims, and warranties',
    roles: ['subcontractor', 'supplier'],
    requiredPages: [...COMMON_PROJECT_PAGES, 'construction', 'procurement', 'packages', 'snagging', 'knowledge'],
    requiredCapabilities: ['package_scope', 'delivery_evidence', 'warranty_evidence', 'package_claims', 'closeout_handover'],
    humanGateRequired: true,
    providerGate: 'supplier',
  },
  {
    id: 'freelancer-delivery',
    label: 'Freelancer assigned work, submissions, feedback, resources, and payout readiness',
    roles: ['freelancer'],
    requiredPages: [...COMMON_PROJECT_PAGES, 'design', 'drawing-checker', 'freelancer-work', 'freelancer-submissions', 'resource-sharing', 'resource-centre', 'knowledge'],
    requiredCapabilities: ['assigned_work_package', 'submission_feedback', 'resource_booking', 'drawing_precheck', 'payout_governance'],
    humanGateRequired: true,
    providerGate: 'payment',
  },
  {
    id: 'admin-governance-console',
    label: 'Admin governance queue, disputes, payments, AI review, statutory sync, and release controls',
    roles: ['admin'],
    requiredPages: [...COMMON_PROJECT_PAGES, 'admin-console', 'design', 'drawing-register', 'sans-forms', 'construction', 'procurement', 'packages', 'snagging', 'knowledge'],
    requiredCapabilities: ['admin_queue_summary', 'dispute_queue', 'payment_hold_queue', 'ai_review_queue', 'statutory_sync_queue', 'release_no_go_gates'],
    humanGateRequired: true,
    providerGate: 'deployment',
  },
];

export function projectBackendRoleFlowReadiness(role: UserRole, evidence: BackendRoleFlowEvidence = {}, generatedAt = new Date().toISOString()): BackendRoleFlowReadinessProjection {
  const pageIds = new Set(evidence.pageIds ?? []);
  const capabilityIds = new Set(evidence.capabilityIds ?? []);
  const providerApprovals = new Set(evidence.providerApprovals ?? []);
  const humanGovernanceQueues = new Set(evidence.humanGovernanceQueues ?? []);
  const approvalGates = evidence.approvalGates ?? [];

  const items = BACKEND_ROLE_FLOW_REQUIREMENTS
    .filter((requirement) => requirement.roles.includes(role))
    .map((requirement): BackendRoleFlowReadinessItem => {
      const missingPages = requirement.requiredPages.filter((page) => !pageIds.has(page));
      const missingCapabilities = requirement.requiredCapabilities.filter((capability) => !capabilityIds.has(capability));
      const requiredGateDomains = APPROVAL_GATE_DOMAINS_BY_REQUIREMENT[requirement.id] ?? [];
      const matchingApprovalGates = approvalGates.filter((gate) => requiredGateDomains.includes(gate.domain));
      const approvalGateEvidence = matchingApprovalGates.map((gate): BackendRoleFlowApprovalGateEvidence => {
        const readiness = evaluateApprovalGateReadiness(gate);
        return {
          gateId: gate.id,
          domain: gate.domain,
          ready: readiness.ready,
          blockers: readiness.blockers,
          requiredApproverRoles: readiness.requiredApproverRoles,
          risk: readiness.risk,
          requiresVerifiedProfessional: readiness.requiresVerifiedProfessional,
          requiresAdminEscalation: readiness.requiresAdminEscalation,
          aiMayNotApprove: readiness.aiMayNotApprove,
        };
      });
      const hasHumanGateEvidence = humanGovernanceQueues.size > 0 || approvalGateEvidence.length > 0;
      const blockers = [
        ...missingPages.map((page) => `Missing backend.html page coverage: ${page}.`),
        ...missingCapabilities.map((capability) => `Missing workflow capability: ${capability}.`),
        ...approvalGateEvidence.flatMap((gate) => gate.blockers.map((blocker) => `Approval gate ${gate.gateId}: ${blocker}.`)),
      ];
      if (requirement.providerGate && !providerApprovals.has(requirement.providerGate)) blockers.push(`Provider/human approval gate not cleared: ${requirement.providerGate}.`);
      if (requirement.humanGateRequired && !hasHumanGateEvidence) blockers.push('Human governance queue evidence is required before automated completion or release.');

      const status = blockers.length === 0 ? 'ready' : missingPages.length === requirement.requiredPages.length || missingCapabilities.length === requirement.requiredCapabilities.length ? 'blocked' : 'partial';
      const maturity = requirement.providerGate && !providerApprovals.has(requirement.providerGate)
        ? 'provider_gated'
        : requirement.humanGateRequired && hasHumanGateEvidence && blockers.length === 0
          ? 'human_governed'
          : missingPages.length > 0 || missingCapabilities.length > 0
            ? 'workflow_shell'
            : 'implemented';

      return { ...requirement, status, maturity, missingPages, missingCapabilities, approvalGateEvidence, blockers };
    });

  const readyCount = items.filter((item) => item.status === 'ready').length;
  const partialCount = items.filter((item) => item.status === 'partial').length;
  const blockedCount = items.filter((item) => item.status === 'blocked').length;
  const nextActions = items.flatMap((item) => item.blockers);

  const audit = { source: 'backend.html', providerNeutral: true, noFakeIntegrations: true, humanApprovalPreserved: true } as const;

  return Object.freeze({
    generatedAt,
    role,
    overallStatus: blockedCount > 0 ? 'blocked' : partialCount > 0 ? 'partial' : 'ready',
    readyCount,
    partialCount,
    blockedCount,
    items,
    nextActions,
    audit,
  });
}
