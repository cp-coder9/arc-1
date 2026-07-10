import {
  PROJECT_STAGE_LABELS,
  PROJECT_STAGE_ORDER,
  type DelegatedTask,
  type Job,
  type Project,
  type ProjectStage,
  type TenderPackage,
  type UserRole,
} from '../types';
import { getMissingStageGateRequirements } from './projectLifecycleService';

export type CanonicalProjectStage = Exclude<ProjectStage, 'scoping'>;

export interface CommandCentreProfileCompletion {
  isComplete: boolean;
  completionRatio: number;
  missingFields: string[];
  blockers: string[];
}

export interface CommandCentrePackage extends TenderPackage {
  source?: 'marketplace' | 'awarded' | 'admin';
}

export interface CommandCentreDelegatedTask extends DelegatedTask {
  source?: 'delegated';
}

export interface ProjectCommandCentreInput {
  activeRole: UserRole;
  activeProject?: Project;
  activeJob?: Job;
  activePackage?: CommandCentrePackage;
  activeTask?: CommandCentreDelegatedTask;
  profileCompletion?: CommandCentreProfileCompletion;
}

export type CommandCentrePriority = 'high' | 'medium' | 'low';

export interface ProjectNextBestAction {
  label: string;
  target: string;
  detail: string;
  priority: CommandCentrePriority;
  requiresHumanConfirmation: true;
  automationLevel: 'advisory';
}

export interface ProjectCommandCentreGuidance {
  activeStage: CanonicalProjectStage;
  stageLabel: string;
  nextAction: ProjectNextBestAction;
  aiSummary: string;
}

export interface CommandCentreMilestone {
  stage: CanonicalProjectStage;
  label: string;
  status: 'completed' | 'active' | 'blocked' | 'upcoming';
  enteredAt?: string;
  exitedAt?: string;
  blockers: string[];
}

export interface CommandCentreReadinessSummary {
  score: number;
  status: 'ready' | 'attention_required' | 'blocked';
  blockers: string[];
  warnings: string[];
}

export interface CommandCentreTimelineSummary {
  currentStageStartedAt?: string;
  nextDeadline?: string;
  overdue: boolean;
  dueInDays?: number;
  label: string;
}

export interface CommandCentreCostSummary {
  budget?: number;
  packageBudget?: number;
  estimatedExposure: number;
  currency: 'ZAR';
  label: string;
}

export interface ProjectCommandCentreProjection extends ProjectCommandCentreGuidance {
  milestones: CommandCentreMilestone[];
  readiness: CommandCentreReadinessSummary;
  timeline: CommandCentreTimelineSummary;
  cost: CommandCentreCostSummary;
}

type ActionSeed = {
  label: string;
  target: string;
  detail: string;
  priority?: CommandCentrePriority;
};

const HUMAN_CONFIRMATION_NOTE = 'AI guidance is advisory only; the accountable user must review and confirm before approvals, payments, signatures, submissions, or contract actions.';

const ROLE_STAGE_ACTIONS: Record<UserRole, Partial<Record<CanonicalProjectStage, ActionSeed>>> = {
  client: {
    intake: {
      label: 'Complete the guided project brief',
      target: 'client-intake',
      detail: 'Use the plain-language brief workflow so the BEP can confirm scope, risks, budget, and approval route with you.',
    },
    appointment: {
      label: 'Compare BEP proposals',
      target: 'client-proposals',
      detail: 'Review fit, fee, exclusions, risk notes, and verification before appointing the professional team.',
    },
    coordination: {
      label: 'Review project progress and approvals',
      target: 'client-progress',
      detail: 'Review available progress records, approval requests, payments, and municipal status before confirming any next step.',
      priority: 'high',
    },
    compliance: {
      label: 'Review municipal status and action requests',
      target: 'municipal-tracker',
      detail: 'Review visible municipal status, comment, and document request records before providing any owner confirmations or documents.',
      priority: 'high',
    },
    payments: {
      label: 'Review payment approval readiness',
      target: 'payments',
      detail: 'Check visible invoice, approval gate, and escrow status before authorising any payment release.',
      priority: 'high',
    },
    closeout: {
      label: 'Confirm handover and close-out records',
      target: 'journey',
      detail: 'Review certificates, warranties, final drawings, and the project audit trail before accepting close-out.',
    },
  },
  architect: {
    intake: {
      label: 'Review technical scope readiness',
      target: 'technical-brief',
      detail: 'Confirm the brief, exclusions, required consultants, and owner inputs before progressing the appointment route.',
    },
    appointment: {
      label: 'Confirm appointment documents',
      target: 'contracts',
      detail: 'Review professional appointment records and signature readiness before coordinated work proceeds.',
      priority: 'high',
    },
    coordination: {
      label: 'Resolve design coordination blockers',
      target: 'tasks',
      detail: 'Prioritise open consultant inputs, drawing revisions, and client approvals before municipal documentation.',
      priority: 'high',
    },
    compliance: {
      label: 'Confirm compliance pack readiness',
      target: 'design',
      detail: 'Review drawing checks, SANS forms, municipal evidence, and professional confirmations before submission.',
      priority: 'high',
    },
    tender: {
      label: 'Prepare tender issue pack',
      target: 'procurement',
      detail: 'Check drawings, scope, addenda, and tender package readiness before issuing work packages.',
    },
  },
  bep: {
    intake: {
      label: 'Convert client brief into technical scope',
      target: 'technical-brief',
      detail: 'Review the client inputs and AI draft, then human-confirm scope, deliverables, risks, exclusions, and approval route.',
      priority: 'high',
    },
    appointment: {
      label: 'Confirm design team appointments',
      target: 'bep-team',
      detail: 'Assign responsible professionals, freelancer packages, and deliverable ownership before coordination work proceeds.',
      priority: 'high',
    },
    coordination: {
      label: 'Review design coordination blockers',
      target: 'tasks',
      detail: 'Review drawing, consultant, transmittal, and client-decision records before issuing or confirming any coordinated next step.',
      priority: 'high',
    },
    compliance: {
      label: 'Resolve compliance and municipal blockers',
      target: 'municipal-tracker',
      detail: 'Coordinate SANS checks, municipal comments, and consultant evidence before formal submission or resubmission.',
      priority: 'high',
    },
    tender: {
      label: 'Publish tender package for human-approved scope',
      target: 'procurement',
      detail: 'Review BoQ, drawings, scope exclusions, and tender conditions before publishing package opportunities.',
    },
    delivery: {
      label: 'Review site evidence and RFIs',
      target: 'snagging',
      detail: 'Confirm RFIs, site evidence, defects, and close-out blockers before professional sign-off.',
    },
  },
  contractor: {
    coordination: {
      label: 'Review delivery readiness and package constraints',
      target: 'packages',
      detail: "Review pending appointments, programme constraints, RFIs, procurement dependencies, and package records before accepting site or commercial actions.",
      priority: 'high',
    },
    tender: {
      label: 'Prepare tender response',
      target: 'packages',
      detail: 'Review package scope, drawings, risks, programme, and commercial assumptions before submitting a bid.',
      priority: 'high',
    },
    delivery: {
      label: 'Review package procurement approval',
      target: 'packages',
      detail: 'Review package scope, lead-time risk, evidence, and programme impact. AI can compare options, but purchase orders require human approval.',
      priority: 'high',
    },
    payments: {
      label: 'Submit or review progress claim',
      target: 'payments',
      detail: 'Check certified progress, evidence, invoice details, and escrow conditions before claim submission or approval.',
      priority: 'high',
    },
    closeout: {
      label: 'Upload close-out evidence',
      target: 'snagging',
      detail: 'Submit warranties, as-built evidence, completion records, and defects status for professional review.',
    },
  },
  subcontractor: {
    coordination: {
      label: 'Review assigned package readiness',
      target: 'packages',
      detail: "Check assigned scope, required approvals, RFIs, and evidence obligations before committing labour, material, or claim actions.",
      priority: 'high',
    },
    tender: {
      label: 'Confirm package scope response',
      target: 'packages',
      detail: 'Review scope, drawings, lead times, exclusions, and commercial assumptions before package acceptance.',
    },
    delivery: {
      label: 'Upload package drawing or evidence for approval',
      target: 'packages',
      detail: 'Your package cannot move to manufacturing or completion until the assigned drawing or evidence is reviewed by the responsible professional.',
      priority: 'high',
    },
    closeout: {
      label: 'Submit package close-out records',
      target: 'snagging',
      detail: 'Upload commissioning evidence, warranties, as-built records, and final defects status for review.',
    },
  },
  supplier: {
    coordination: {
      label: 'Review supply package readiness',
      target: 'procurement',
      detail: "Check quote status, product data, lead times, substitutions, delivery notes, and warranty obligations before committing supply actions.",
      priority: 'high',
    },
    tender: {
      label: 'Review procurement opportunity',
      target: 'procurement',
      detail: 'Confirm product availability, lead times, warranty terms, and delivery constraints before quoting.',
    },
    delivery: {
      label: 'Confirm delivery and warranty records',
      target: 'procurement',
      detail: 'Keep delivery notes, product data, warranty records, and substitutions traceable for human review.',
      priority: 'high',
    },
    closeout: {
      label: 'Complete product handover records',
      target: 'procurement',
      detail: 'Upload final warranty, maintenance, and product documentation before close-out acceptance.',
    },
  },
  freelancer: {
    coordination: {
      label: 'Review freelancer submission status',
      target: 'freelancer-submissions',
      detail: 'Open assigned deliverable records, feedback, and submission status before uploading work or responding to review notes.',
      priority: 'high',
    },
    compliance: {
      label: 'Submit checked drawing deliverable',
      target: 'freelancer-submissions',
      detail: 'Upload the assigned deliverable and any drawing-check notes for BEP review before it enters the project record.',
      priority: 'high',
    },
    payments: {
      label: 'Track approval and invoice readiness',
      target: 'freelancer-work',
      detail: 'Confirm BEP approval status and invoice readiness before any payment workflow is started.',
    },
  },
  admin: {
    intake: {
      label: 'Review verification and onboarding queues',
      target: 'admin-console',
      detail: 'Check visible identity, role, and profile readiness records before users enter governed project workflows.',
    },
    compliance: {
      label: 'Review compliance governance queue',
      target: 'design',
      detail: 'Inspect escalated compliance warnings, audit records, and professional confirmations before admin intervention.',
      priority: 'high',
    },
    payments: {
      label: 'Review payment and dispute governance queue',
      target: 'disputes',
      detail: 'Review visible contract, invoice, approval trail, site evidence, and dispute records before any admin governance decision.',
      priority: 'high',
    },
    closeout: {
      label: 'Audit close-out exceptions',
      target: 'admin-console',
      detail: 'Review unresolved disputes, missing documents, payment holds, and governance exceptions before closure.',
    },
  },
  engineer: {},
  quantity_surveyor: {},
  town_planner: {},
  energy_professional: {},
  fire_engineer: {},
  site_manager: {},
  developer: {},
  firm_admin: {},
  platform_admin: {},
  land_surveyor: {},
  cpm: {},
  health_safety: {},
};

function canonicalStage(input: ProjectCommandCentreInput): CanonicalProjectStage {
  const projectStage = input.activeProject?.currentStage;
  if (projectStage === 'scoping') return 'intake';
  if (projectStage) return projectStage;
  if (input.activePackage?.status === 'published') return 'tender';
  if (input.activePackage?.status === 'awarded' || input.activePackage?.source === 'awarded') return 'delivery';
  if (input.activeTask?.paymentStatus === 'ready_for_invoice' || input.activeTask?.paymentStatus === 'invoice_created' || input.activeTask?.paymentStatus === 'paid') return 'payments';
  if (input.activeTask) return 'coordination';
  if (input.activeJob?.status === 'open' && input.activeRole === 'client') return 'appointment';
  if (input.activeJob?.status === 'open') return 'intake';
  if (input.activeJob?.status === 'completed') return 'closeout';
  if (!input.activeJob) return 'intake';
  return 'coordination';
}

function withHumanConfirmation(seed: ActionSeed): ProjectNextBestAction {
  return {
    label: seed.label,
    target: seed.target,
    detail: `${seed.detail} ${HUMAN_CONFIRMATION_NOTE}`,
    priority: seed.priority ?? 'medium',
    requiresHumanConfirmation: true,
    automationLevel: 'advisory',
  };
}

function fallbackAction(input: ProjectCommandCentreInput, stage: CanonicalProjectStage): ActionSeed {
  const { activeRole, activeJob, activePackage, activeTask } = input;

  if (activeRole === 'freelancer' && activeTask) {
    const revisionNeeded = activeTask.submissionStatus === 'changes_requested';
    return {
      label: revisionNeeded ? 'Upload revised freelancer deliverable' : activeTask.status === 'completed' ? 'Track approval and invoice readiness' : 'Submit assigned freelancer work',
      target: revisionNeeded ? 'freelancer-submissions' : 'freelancer-work',
      detail: `${activeTask.notes || activeTask.assigneeRole || 'Your delegated task'} is due ${activeTask.deadline || 'without a recorded deadline'} with submission status ${(activeTask.submissionStatus || 'not_submitted').replaceAll('_', ' ')}.`,
      priority: activeTask.submissionStatus === 'changes_requested' || activeTask.status !== 'completed' ? 'high' : 'medium',
    };
  }

  const roleAction = ROLE_STAGE_ACTIONS[activeRole][stage];
  if (roleAction) return roleAction;

  if ((activeRole === 'contractor' || activeRole === 'subcontractor') && activePackage) {
    return {
      label: activePackage.source === 'awarded' || activePackage.status === 'awarded' ? 'Update package delivery evidence' : 'Review available package scope',
      target: 'packages',
      detail: `${activePackage.title} is visible in your package workspace. Use it to manage tenders, RFIs, evidence, claims, and close-out readiness.`,
    };
  }

  if (activeRole === 'supplier' && activePackage) {
    return {
      label: activePackage.source === 'awarded' || activePackage.status === 'awarded' ? 'Confirm delivery and warranty records' : 'Review procurement opportunity',
      target: 'procurement',
      detail: `${activePackage.title} is visible in your procurement workspace. Keep quotes, delivery notes, product data, and warranties traceable.`,
    };
  }


  if (!activeJob) {
    if (activeRole === 'client') {
      return {
        label: 'Create a guided project brief',
        target: 'client-intake',
        detail: 'Start with the client intake workflow so professionals can price and scope real requirements.',
      };
    }
    if (activeRole === 'contractor') {
      return {
        label: 'Review tender marketplace',
        target: 'packages',
        detail: 'No active delivery project is linked yet. Review available package or tender work.',
      };
    }
  }

  return {
    label: 'Review tasks and compliance blockers',
    target: 'tasks',
    detail: 'Resolve open approvals, missing information, drawing checks, and project-team dependencies for the current stage.',
  };
}

function nextCanonicalStage(stage: CanonicalProjectStage): CanonicalProjectStage | null {
  const currentIndex = PROJECT_STAGE_ORDER.indexOf(stage);
  const nextStage = currentIndex >= 0 ? PROJECT_STAGE_ORDER[currentIndex + 1] : undefined;
  return nextStage && nextStage !== 'scoping' ? nextStage : null;
}

function stageGateAction(input: ProjectCommandCentreInput, stage: CanonicalProjectStage): ActionSeed | null {
  const nextStage = nextCanonicalStage(stage);
  if (!input.activeProject || !nextStage || !('stageGateEvidence' in input.activeProject)) return null;

  const missingRequirements = getMissingStageGateRequirements(nextStage, input.activeProject.stageGateEvidence || {});
  if (missingRequirements.length === 0) return null;

  const firstRequirement = missingRequirements[0];
  return {
    label: `Clear ${firstRequirement.label.toLowerCase()} gate`,
    target: 'tasks',
    detail: `Before the project can advance to ${PROJECT_STAGE_LABELS[nextStage]}, ${firstRequirement.reason} Missing gate evidence: ${missingRequirements.map(requirement => requirement.label).join(', ')}.`,
    priority: 'high',
  };
}

function stageGateBlockersForStage(input: ProjectCommandCentreInput, stage: CanonicalProjectStage): string[] {
  if (!input.activeProject || !('stageGateEvidence' in input.activeProject)) return [];
  return getMissingStageGateRequirements(stage, input.activeProject.stageGateEvidence || {}).map(requirement => requirement.label);
}

function buildMilestones(input: ProjectCommandCentreInput, activeStage: CanonicalProjectStage): CommandCentreMilestone[] {
  const activeIndex = PROJECT_STAGE_ORDER.indexOf(activeStage);
  return PROJECT_STAGE_ORDER.filter((stage): stage is CanonicalProjectStage => stage !== 'scoping').map((stage) => {
    const stageIndex = PROJECT_STAGE_ORDER.indexOf(stage);
    const history = input.activeProject?.stageHistory?.find(entry => (entry.stage === 'scoping' ? 'intake' : entry.stage) === stage);
    const blockers = stageIndex >= activeIndex ? stageGateBlockersForStage(input, stage) : [];
    return {
      stage,
      label: PROJECT_STAGE_LABELS[stage],
      status: stage === activeStage ? (blockers.length ? 'blocked' : 'active') : stageIndex < activeIndex ? 'completed' : 'upcoming',
      enteredAt: history?.enteredAt,
      exitedAt: history?.exitedAt,
      blockers,
    };
  });
}

function daysUntil(date?: string): number | undefined {
  if (!date) return undefined;
  const timestamp = Date.parse(date);
  if (!Number.isFinite(timestamp)) return undefined;
  return Math.ceil((timestamp - Date.now()) / 86_400_000);
}

function buildTimelineSummary(input: ProjectCommandCentreInput, activeStage: CanonicalProjectStage): CommandCentreTimelineSummary {
  const currentHistory = input.activeProject?.stageHistory?.find(entry => (entry.stage === 'scoping' ? 'intake' : entry.stage) === activeStage);
  const nextDeadline = input.activeTask?.deadline || input.activePackage?.deadline || input.activeJob?.deadline;
  const dueInDays = daysUntil(nextDeadline);
  const overdue = typeof dueInDays === 'number' ? dueInDays < 0 : false;
  return {
    currentStageStartedAt: currentHistory?.enteredAt,
    nextDeadline,
    overdue,
    dueInDays,
    label: nextDeadline ? `${overdue ? 'Overdue' : 'Next deadline'}: ${nextDeadline}` : 'No deadline recorded',
  };
}

function buildCostSummary(input: ProjectCommandCentreInput): CommandCentreCostSummary {
  const budget = typeof input.activeJob?.budget === 'number' ? input.activeJob.budget : undefined;
  const packageBudget = typeof input.activePackage?.estimatedBudget === 'number' ? input.activePackage.estimatedBudget : undefined;
  const estimatedExposure = [budget, packageBudget].filter((value): value is number => typeof value === 'number' && Number.isFinite(value)).reduce((sum, value) => sum + value, 0);
  return {
    budget,
    packageBudget,
    estimatedExposure,
    currency: 'ZAR',
    label: estimatedExposure > 0 ? `Visible exposure ZAR ${estimatedExposure.toLocaleString('en-ZA')}` : 'No visible cost records',
  };
}

function buildReadinessSummary(input: ProjectCommandCentreInput, milestones: CommandCentreMilestone[], nextAction: ProjectNextBestAction): CommandCentreReadinessSummary {
  const blockers = [
    ...(input.profileCompletion?.blockers || []),
    ...milestones.find(milestone => milestone.status === 'blocked')?.blockers.map(blocker => `Stage gate missing: ${blocker}`) || [],
  ];
  const warnings = [
    ...(!input.activeProject ? ['No active project record is selected.'] : []),
    ...(nextAction.priority === 'high' ? [`High priority action: ${nextAction.label}`] : []),
  ];
  const score = Math.max(0, Math.round(100 - blockers.length * 25 - warnings.length * 10));
  return {
    score,
    status: blockers.length ? 'blocked' : warnings.length ? 'attention_required' : 'ready',
    blockers,
    warnings,
  };
}

function buildAiSummary(input: ProjectCommandCentreInput, stage: CanonicalProjectStage, action: ProjectNextBestAction): string {
  const { activeRole, activeJob, activePackage, activeTask } = input;
  const subject = activeJob?.title || activePackage?.title || activeTask?.assigneeRole || 'No active project record';
  const budget = typeof activeJob?.budget === 'number'
    ? ` Recorded budget is ZAR ${activeJob.budget.toLocaleString('en-ZA')}.`
    : typeof activePackage?.estimatedBudget === 'number'
      ? ` Estimated package budget is ZAR ${activePackage.estimatedBudget.toLocaleString('en-ZA')}.`
      : '';
  const requirements = activeJob?.requirements?.length ? ` Open requirements include ${activeJob.requirements.slice(0, 3).join(', ')}.` : '';
  const taskStatus = activeTask ? ` Freelancer task status is ${activeTask.status} with submission status ${(activeTask.submissionStatus || 'not_submitted').replaceAll('_', ' ')}.` : '';

  return `${subject} is shown for the ${activeRole} role at ${PROJECT_STAGE_LABELS[stage]}.${budget}${requirements}${taskStatus} Next best action: ${action.label}. ${HUMAN_CONFIRMATION_NOTE}`;
}

export function getProjectCommandCentreGuidance(input: ProjectCommandCentreInput): ProjectCommandCentreGuidance {
  const activeStage = canonicalStage(input);
  const profileCompletion = input.profileCompletion;

  const gatedAction = stageGateAction(input, activeStage);

  const actionSeed = profileCompletion && !profileCompletion.isComplete
    ? {
        label: 'Complete profile readiness',
        target: 'profile',
        detail: `${profileCompletion.blockers[0] || 'Profile completion is required'} before routed approvals, payments, signatures, project matching, or submissions can proceed.`,
        priority: 'high' as const,
      }
    : gatedAction
      ? gatedAction
    : fallbackAction(input, activeStage);

  const nextAction = withHumanConfirmation(actionSeed);

  return {
    activeStage,
    stageLabel: PROJECT_STAGE_LABELS[activeStage],
    nextAction,
    aiSummary: buildAiSummary(input, activeStage, nextAction),
  };
}

export function buildProjectCommandCentreProjection(input: ProjectCommandCentreInput): ProjectCommandCentreProjection {
  const guidance = getProjectCommandCentreGuidance(input);
  const milestones = buildMilestones(input, guidance.activeStage);
  return {
    ...guidance,
    milestones,
    readiness: buildReadinessSummary(input, milestones, guidance.nextAction),
    timeline: buildTimelineSummary(input, guidance.activeStage),
    cost: buildCostSummary(input),
  };
}
