import type { ProjectStage, UserRole } from '../types';
import { PROJECT_STAGE_LABELS, PROJECT_STAGE_ORDER } from '../types';
import { normalizeUserRole } from './permissionService';

export type PrdStakeholderKey =
  | 'client'
  | 'bep_design_team'
  | 'main_contractor'
  | 'subcontractor_supplier'
  | 'freelancer'
  | 'admin_governance';

export type CanonicalPrdStage = Exclude<ProjectStage, 'scoping'>;

export interface PrdLifecycleStageDefinition {
  stage: CanonicalPrdStage;
  prdNumber: number;
  label: string;
  commandCentreFocus: string;
}

export interface PrdMarketplaceAccess {
  canBidOnRawClientProjects: boolean;
  canReceiveBepAssignedPackages: boolean;
  canAccessProcurementPackages: boolean;
}

export interface PrdStakeholderProfile {
  key: PrdStakeholderKey;
  label: string;
  appRoles: UserRole[];
  objective: string;
  responsibilities: string[];
  baseTools: string[];
  marketplaceAccess: PrdMarketplaceAccess;
}

export interface PrdRoleStageToolset {
  profile: PrdStakeholderProfile;
  stage: PrdLifecycleStageDefinition;
  primaryTools: string[];
  hiddenTools: string[];
  nextBestAction: string;
  requiresHumanConfirmation: true;
  automationLevel: 'advisory';
}

const LIFECYCLE_FOCUS: Record<CanonicalPrdStage, string> = {
  intake: 'Guided brief, diagnostic prediction, and technical scope confirmation',
  appointment: 'Verified professional selection, proposal comparison, contract signing, and escrow plan setup',
  coordination: 'Design team matrix, consultant dependencies, freelancer work packages, and CDE submissions',
  compliance: 'AI drawing checks, SANS forms, statutory evidence, and municipal tracker readiness',
  tender: 'Drawing-to-BoM extraction, QS review, supplier pricing, B-BBEE checks, and PO approval',
  delivery: 'Construction OS, daily site logs, RFIs, subcontractor submissions, programme, plant, and labour tracking',
  payments: 'Invoice builder, escrow holds, platform fee calculation, release approvals, and governance audit trails',
  closeout: 'Snagging, warranties, compliance certificates, final accounts, handover packs, and archival closure',
};

const STAKEHOLDER_PROFILES: PrdStakeholderProfile[] = [
  {
    key: 'client',
    label: 'Client',
    appRoles: ['client'],
    objective: 'Initiate, fund, track, and approve project progress without needing technical construction expertise.',
    responsibilities: ['Define plain-language baseline requirements', 'Compare and appoint verified BEPs', 'Approve milestones and change orders', 'Fund escrow and review payment releases'],
    baseTools: ['Guided Brief Wizard', 'BEP Proposals', 'Client Progress Reports', 'Contracts & Digital Signing', 'Payments & Escrow'],
    marketplaceAccess: { canBidOnRawClientProjects: false, canReceiveBepAssignedPackages: false, canAccessProcurementPackages: false },
  },
  {
    key: 'bep_design_team',
    label: 'BEP / Design Team',
    appRoles: ['bep', 'architect'],
    objective: 'Lead technical design delivery, consultant coordination, statutory compliance, and municipal submissions.',
    responsibilities: ['Convert client needs into technical briefs', 'Generate fee proposals', 'Manage drawing registers and design team matrix', 'Assess compliance and close-out quality'],
    baseTools: ['Technical Brief Editor', 'Fee Proposal Builder', 'Design Team Matrix', 'AI Drawing Checker & SANS Form Autofill', 'Freelancer Jobs', 'Remote Workstations'],
    marketplaceAccess: { canBidOnRawClientProjects: true, canReceiveBepAssignedPackages: false, canAccessProcurementPackages: true },
  },
  {
    key: 'main_contractor',
    label: 'Main Contractor',
    appRoles: ['contractor'],
    objective: 'Deliver physical execution, programme, site resources, procurement, RFIs, and progress claims.',
    responsibilities: ['Build the master programme', 'Log daily site operations', 'Source materials from BoQ/BoM', 'Issue RFIs and administer subcontractors'],
    baseTools: ['Construction OS', 'Staff, Wages & Plant', 'BoQ/BoM Procurement', 'Subcontractor Packages', 'Programme / Gantt'],
    marketplaceAccess: { canBidOnRawClientProjects: false, canReceiveBepAssignedPackages: false, canAccessProcurementPackages: true },
  },
  {
    key: 'subcontractor_supplier',
    label: 'Subcontractor / Supplier',
    appRoles: ['subcontractor', 'supplier'],
    objective: 'Execute specialist packages or supply products in alignment with the master construction programme.',
    responsibilities: ['Submit shop drawings and samples', 'Coordinate material orders and delivery documents', 'Submit claims against approved package progress', 'Upload compliance certificates and warranties'],
    baseTools: ['BoQ/BoM Procurement', 'Subcontractor Packages', 'Payments & Governance'],
    marketplaceAccess: { canBidOnRawClientProjects: false, canReceiveBepAssignedPackages: false, canAccessProcurementPackages: true },
  },
  {
    key: 'freelancer',
    label: 'Freelancer',
    appRoles: ['freelancer'],
    objective: 'Provide remote drafting, BIM, rendering, and pre-check support to appointed BEPs on assigned tasks only.',
    responsibilities: ['Execute assigned work packages', 'Perform preliminary drawing checks', 'Submit outputs and revisions through BEP feedback cycles'],
    baseTools: ['Assigned Work', 'Submissions & Feedback', 'Remote Desktop / Resource Sharing', 'Freelancer Invoicing'],
    marketplaceAccess: { canBidOnRawClientProjects: false, canReceiveBepAssignedPackages: true, canAccessProcurementPackages: false },
  },
  {
    key: 'admin_governance',
    label: 'Admin / Governance',
    appRoles: ['admin', 'platform_admin'],
    objective: 'Verify credentials, arbitrate disputes, manage monetisation, and audit automated AI actions.',
    responsibilities: ['Process verification queues', 'Resolve disputes', 'Curate marketplace opportunities', 'Set platform fees and audit AI orchestration'],
    baseTools: ['Admin Whole-System Governance Console', 'Payment Rate Settings', 'AI Orchestration'],
    marketplaceAccess: { canBidOnRawClientProjects: false, canReceiveBepAssignedPackages: false, canAccessProcurementPackages: true },
  },
];

const ROLE_STAGE_TOOL_OVERRIDES: Partial<Record<PrdStakeholderKey, Partial<Record<CanonicalPrdStage, { primaryTools?: string[]; hiddenTools?: string[]; nextBestAction: string }>>>> = {
  client: {
    intake: { primaryTools: ['Guided Brief Wizard'], nextBestAction: 'Complete guided brief and upload property context' },
    appointment: { primaryTools: ['BEP Proposals', 'Contracts & Digital Signing'], nextBestAction: 'Compare verified BEP proposals and approve appointment contract' },
    payments: { primaryTools: ['Payments & Escrow', 'Contracts & Digital Signing'], nextBestAction: 'Review invoice, escrow status, and approval gate before payment release' },
  },
  bep_design_team: {
    intake: { primaryTools: ['Technical Brief Editor', 'Fee Proposal Builder'], nextBestAction: 'Convert client brief into formal technical scope' },
    coordination: { primaryTools: ['Design Team Matrix', 'Freelancer Jobs', 'Remote Workstations'], nextBestAction: 'Resolve design-team dependencies and package freelancer tasks' },
    compliance: { primaryTools: ['AI Drawing Checker & SANS Form Autofill'], nextBestAction: 'Resolve compliance warnings and prepare municipal evidence pack' },
  },
  main_contractor: {
    tender: { primaryTools: ['BoQ/BoM Procurement', 'Programme / Gantt'], nextBestAction: 'Review tender scope, programme risk, and procurement assumptions before bid' },
    delivery: { primaryTools: ['Construction OS', 'Staff, Wages & Plant', 'Programme / Gantt', 'Subcontractor Packages'], nextBestAction: 'Update daily site log, RFIs, programme, labour, plant, and package evidence' },
    payments: { primaryTools: ['Payments & Governance', 'Construction OS'], nextBestAction: 'Submit progress claim only against verified site evidence' },
  },
  subcontractor_supplier: {
    tender: { primaryTools: ['BoQ/BoM Procurement', 'Subcontractor Packages'], nextBestAction: 'Confirm package scope, lead times, exclusions, and warranty obligations before acceptance' },
    delivery: { primaryTools: ['Subcontractor Packages', 'BoQ/BoM Procurement'], nextBestAction: 'Upload shop drawings, delivery notes, samples, and compliance evidence for approval' },
    closeout: { primaryTools: ['Subcontractor Packages', 'Payments & Governance'], nextBestAction: 'Submit warranties, certificates, and rectification evidence before final claim' },
  },
  freelancer: {
    coordination: { primaryTools: ['Assigned Work', 'Submissions & Feedback', 'Remote Desktop / Resource Sharing'], hiddenTools: ['BEP Proposal Comparison', 'Client Raw Project Bidding'], nextBestAction: 'Submit assigned deliverable or respond to BEP feedback' },
    compliance: { primaryTools: ['Assigned Work', 'Submissions & Feedback'], hiddenTools: ['BEP Proposal Comparison', 'Client Raw Project Bidding'], nextBestAction: 'Upload checked drawing deliverable and pre-check notes for BEP review' },
    payments: { primaryTools: ['Freelancer Invoicing', 'Assigned Work'], hiddenTools: ['BEP Proposal Comparison', 'Client Raw Project Bidding'], nextBestAction: 'Invoice only after BEP approval of assigned deliverables' },
  },
  admin_governance: {
    intake: { primaryTools: ['Admin Whole-System Governance Console', 'AI Orchestration'], nextBestAction: 'Review onboarding, verification queues, and AI intake audit trails' },
    payments: { primaryTools: ['Admin Whole-System Governance Console', 'Payment Rate Settings', 'AI Orchestration'], nextBestAction: 'Review disputes, escrow holds, STR/CTR flags, and approval-gate audit trails' },
    closeout: { primaryTools: ['Admin Whole-System Governance Console'], nextBestAction: 'Audit unresolved disputes, final escrow closure, and archival readiness' },
  },
};

function canonicalStage(stage: ProjectStage): CanonicalPrdStage {
  return stage === 'scoping' ? 'intake' : stage;
}

export function getPrdLifecycleStages(): PrdLifecycleStageDefinition[] {
  return PROJECT_STAGE_ORDER.filter((stage): stage is CanonicalPrdStage => stage !== 'scoping').map((stage, index) => ({
    stage,
    prdNumber: index + 1,
    label: PROJECT_STAGE_LABELS[stage],
    commandCentreFocus: LIFECYCLE_FOCUS[stage],
  }));
}

export function listPrdStakeholderProfiles(): PrdStakeholderProfile[] {
  return STAKEHOLDER_PROFILES.map(profile => ({
    ...profile,
    appRoles: [...profile.appRoles],
    responsibilities: [...profile.responsibilities],
    baseTools: [...profile.baseTools],
    marketplaceAccess: { ...profile.marketplaceAccess },
  }));
}

export function getPrdStakeholderProfile(role: UserRole | string): PrdStakeholderProfile {
  const normalizedRole = normalizeUserRole(role);
  const profile = STAKEHOLDER_PROFILES.find(item => normalizedRole && item.appRoles.includes(normalizedRole));
  if (!profile) throw new Error(`Unsupported PRD stakeholder role: ${role}`);
  return listPrdStakeholderProfiles().find(item => item.key === profile.key) as PrdStakeholderProfile;
}

export function getPrdRoleStageToolset(role: UserRole | string, stage: ProjectStage): PrdRoleStageToolset {
  const profile = getPrdStakeholderProfile(role);
  const stageDefinition = getPrdLifecycleStages().find(item => item.stage === canonicalStage(stage));
  if (!stageDefinition) throw new Error(`Unsupported PRD lifecycle stage: ${stage}`);

  const override = ROLE_STAGE_TOOL_OVERRIDES[profile.key]?.[stageDefinition.stage];
  const primaryTools = override?.primaryTools ?? profile.baseTools;

  return {
    profile,
    stage: stageDefinition,
    primaryTools: [...primaryTools],
    hiddenTools: [...(override?.hiddenTools ?? [])],
    nextBestAction: override?.nextBestAction ?? `Review ${stageDefinition.label.toLowerCase()} records in the ${profile.label} workspace`,
    requiresHumanConfirmation: true,
    automationLevel: 'advisory',
  };
}
