/**
 * Site Execution & Field Control Integration Orchestrator (Pack 9)
 *
 * Implements the full acceptance-test scenario per the architex-site-execution-field-control-pack:
 *   daily log → evidence → RFI → response → site instruction → variation flag
 *   → NCR → snag → inspection → delay early warning → payment blocker
 *   → ProjectRecords → inbox events → audit trail → agent recommendations
 *
 * This orchestrator ties together all field-control services into a single connected workflow.
 */

import { createRichSiteLog } from './dailyLogService';
import { createRFI, respondToRFI, closeRFI } from './constructionService';
import { createNcr, submitCorrectiveAction, verifyNcrClosed } from './ncrService';
import { createSnag, markSnagReadyForReinspection, closeSnagAfterReinspection } from './snagService';
import { issueSiteInstruction, acknowledgeInstruction } from './siteInstructionService';
import { createDelayEarlyWarning } from './delayWarningService';
import { assessProgrammeImpact } from './programmeImpactService';
import { captureEvidence } from './fieldEvidenceService';
import { createPaymentBlocker, blockersFromFieldItems } from './paymentBlockerService';
import type {
  SiteLog, RFI, NonConformanceReport, SnagItem, SiteInstruction,
  DelayEarlyWarning, ProgrammeImpact, FieldEvidence, PaymentBlocker,
  SiteProjectRecord, SiteInboxEvent, SiteAgentRecommendation,
  SiteExecutionPhase, Severity, UserRole, EvidenceType,
} from '@/types';

// ── Orchestration input -------------------------------------------------------

export interface SiteExecutionContext {
  tenantId: string;
  projectId: string;
  jobId?: string;
  actorId: string;
  actorRole: UserRole;
  now?: string;
}

export interface SiteExecutionScenarioInput {
  ctx: SiteExecutionContext;
  /** Evidence capture inputs */
  evidenceItems: Array<{
    type: EvidenceType;
    title: string;
    uri: string;
    location?: string;
  }>;
  /** Daily log data */
  dailyLog: {
    date: string;
    weather: SiteLog['weather'];
    weatherDetail?: string;
    workDescription: string;
    labourOnSite?: Record<string, number>;
    plantOnSite?: string[];
    deliveries?: string[];
    visitors?: string[];
    safetyNotes?: string[];
    delayNotes?: string[];
  };
  /** RFI data */
  rfi: {
    subject: string;
    question: string;
    requestedBy: string;
    assignedTo: string;
    discipline?: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
  };
  /** RFI response data */
  rfiResponse: {
    answer: string;
    responderId: string;
    requiresInstruction: boolean;
  };
  /** Site instruction data */
  siteInstruction: {
    title: string;
    instruction: string;
    issuedByRole: UserRole;
    costImpact?: 'none' | 'possible' | 'confirmed';
    timeImpact?: 'none' | 'possible' | 'confirmed';
  };
  /** NCR data */
  ncr: {
    title: string;
    description?: string;
    severity: Severity;
    responsiblePartyId: string;
    correctiveAction?: string;
  };
  /** Snag data */
  snag: {
    location: string;
    description: string;
    priority: Severity;
    responsiblePartyId: string;
  };
  /** Inspection data */
  inspection: {
    inspectionType: string;
    findings: string[];
    followUps: string[];
    signOffRequired?: boolean;
  };
  /** Delay warning data */
  delayWarning: {
    cause: 'weather' | 'materials' | 'labour' | 'client' | 'professional' | 'contractor' | 'unknown';
    description: string;
    likelyProgrammeImpactDays: number;
  };
}

// ── Orchestration result ------------------------------------------------------

export interface SiteExecutionScenarioResult {
  dailyLogId: string;
  evidenceIds: string[];
  rfiId: string;
  rfiStatus: string;
  siteInstructionId: string;
  instructionStatus: string;
  ncrId: string;
  ncrStatus: string;
  ncrBlocksPayment: boolean;
  snagId: string;
  snagStatus: string;
  snagBlocksPayment: boolean;
  inspectionId: string;
  inspectionStatus: string;
  warningId: string;
  warningStatus: string;
  programmeImpactId: string;
  requiresPlannerReview: boolean;
  paymentBlockers: Array<{ id: string; reason: string }>;
  projectRecords: SiteProjectRecord[];
  inboxEvents: SiteInboxEvent[];
  agentRecommendations: SiteAgentRecommendation[];
  summary: {
    projectId: string;
    evidenceCount: number;
    dailyLogStatus: string;
    rfiStatus: string;
    instructionStatus: string;
    ncrStatus: string;
    snagStatus: string;
    inspectionStatus: string;
    warningStatus: string;
    activeBlockers: number;
    projectRecords: number;
    inboxEvents: number;
    recommendations: number;
  };
}

// ── In-memory adapters (for record tracking without dedicated Firestore collections) ──

let recordSeq = 1;
function makeRecord(
  projectId: string,
  tenantId: string,
  createdBy: string,
  createdAt: string,
  input: {
    phase?: SiteExecutionPhase;
    recordType: string;
    title: string;
    status: string;
    payload: unknown;
    linkedRecordIds?: string[];
  },
): SiteProjectRecord {
  return {
    id: `project-record-site-${recordSeq++}`,
    projectId,
    tenantId,
    phase: input.phase ?? 'construction_execution',
    moduleKey: 'site_execution_field_control',
    recordType: input.recordType,
    title: input.title,
    status: input.status,
    payload: input.payload,
    linkedRecordIds: input.linkedRecordIds ?? [],
    createdBy,
    createdAt,
  };
}

let inboxSeq = 1;
function makeInboxEvent(
  projectId: string,
  createdAt: string,
  input: {
    recipientRole: UserRole;
    title: string;
    sourceObjectId: string;
    sourceObjectType: string;
    priority: Severity;
    dueDate?: string;
  },
): SiteInboxEvent {
  return {
    id: `inbox-site-${inboxSeq++}`,
    projectId,
    recipientRole: input.recipientRole,
    title: input.title,
    sourceObjectId: input.sourceObjectId,
    sourceObjectType: input.sourceObjectType,
    priority: input.priority,
    dueDate: input.dueDate,
    isRead: false,
    createdAt,
  };
}

let recSeq = 1;
function makeRecommendation(
  projectId: string,
  createdAt: string,
  input: {
    agentKey: string;
    title: string;
    rationale: string;
    sourceObjectId: string;
    severity: Severity;
  },
): SiteAgentRecommendation {
  return {
    id: `agent-rec-site-${recSeq++}`,
    projectId,
    agentKey: input.agentKey,
    title: input.title,
    rationale: input.rationale,
    sourceObjectId: input.sourceObjectId,
    severity: input.severity,
    status: 'suggested',
    createdAt,
  };
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

export async function executeSiteExecutionScenario(
  input: SiteExecutionScenarioInput,
): Promise<SiteExecutionScenarioResult> {
  const { ctx } = input;
  const now = ctx.now ?? new Date().toISOString();
  const actorId = ctx.actorId;
  const projectId = ctx.projectId;

  // ── 1. Capture field evidence ──────────────────────────────────────────────
  const evidenceIds: string[] = [];
  for (const ev of input.evidenceItems) {
    const id = await captureEvidence({
      projectId,
      type: ev.type,
      title: ev.title,
      uri: ev.uri,
      location: ev.location,
      capturedBy: actorId,
    });
    evidenceIds.push(id);
  }

  // ── 2. Create daily site log ───────────────────────────────────────────────
  const dailyLogId = await createRichSiteLog({
    projectId,
    date: input.dailyLog.date,
    weather: input.dailyLog.weather,
    weatherDetail: input.dailyLog.weatherDetail,
    workDescription: input.dailyLog.workDescription,
    labourOnSite: input.dailyLog.labourOnSite,
    plantOnSite: input.dailyLog.plantOnSite,
    deliveries: input.dailyLog.deliveries,
    visitors: input.dailyLog.visitors,
    safetyNotes: input.dailyLog.safetyNotes,
    delayNotes: input.dailyLog.delayNotes,
    evidenceIds,
    createdBy: actorId,
  });

  // ── 3. Create and respond to RFI ───────────────────────────────────────────
  const dueDate = new Date(new Date(now).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const rfiId = await createRFI({
    projectId,
    subject: input.rfi.subject,
    question: input.rfi.question,
    attachments: [],
    requestedBy: input.rfi.requestedBy,
    assignedTo: input.rfi.assignedTo,
    priority: input.rfi.priority ?? 'medium',
    dueDate,
  });

  await respondToRFI(
    projectId,
    rfiId,
    input.rfiResponse.answer,
    input.rfiResponse.responderId,
  );

  const rfiRequiresInstruction = input.rfiResponse.requiresInstruction;

  // ── 4. Issue and acknowledge site instruction ───────────────────────────────
  const instructionId = await issueSiteInstruction({
    projectId,
    title: input.siteInstruction.title,
    instruction: input.siteInstruction.instruction,
    issuedBy: actorId,
    issuedByRole: input.siteInstruction.issuedByRole,
    costImpact: input.siteInstruction.costImpact ?? 'none',
    timeImpact: input.siteInstruction.timeImpact ?? 'none',
    linkedRfiId: rfiId,
  });

  await acknowledgeInstruction(projectId, instructionId, input.rfi.requestedBy);

  // ── 5. Create NCR ──────────────────────────────────────────────────────────
  const ncrId = await createNcr({
    projectId,
    title: input.ncr.title,
    description: input.ncr.description,
    severity: input.ncr.severity,
    responsiblePartyId: input.ncr.responsiblePartyId,
    correctiveAction: input.ncr.correctiveAction,
    evidenceIds: evidenceIds.slice(0, 1),
    createdBy: actorId,
  });

  // ── 6. Create snag ─────────────────────────────────────────────────────────
  const snagDueDate = new Date(new Date(now).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const snagId = await createSnag({
    projectId,
    location: input.snag.location,
    description: input.snag.description,
    priority: input.snag.priority,
    responsiblePartyId: input.snag.responsiblePartyId,
    dueDate: snagDueDate,
    evidenceIds: evidenceIds.slice(0, 1),
    createdBy: actorId,
  });

  await markSnagReadyForReinspection(projectId, snagId);

  // ── 7. Create inspection record (via constructionService) ──────────────────
  const { createInspection } = await import('./constructionService');
  const inspectionId = await createInspection({
    projectId,
    inspectionType: 'custom' as any,
    date: now.slice(0, 10),
    inspector: actorId,
    checklist: [
      ...input.inspection.findings.map((f) => ({ item: f, standard: '', result: 'pass' as const })),
      ...input.inspection.followUps.map((f) => ({ item: f, standard: '', result: 'fail' as const })),
    ],
    overallResult: input.inspection.followUps.length > 0 ? 'conditional' : 'pass',
    notes: `Inspection: ${input.inspection.inspectionType}`,
    photos: [],
  });
  const inspectionStatus = input.inspection.followUps.length > 0 ? 'requires_follow_up' : 'closed';

  // ── 8. Create delay early warning ──────────────────────────────────────────
  const noticeDeadline = new Date(new Date(now).getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const warningId = await createDelayEarlyWarning({
    projectId,
    cause: input.delayWarning.cause,
    description: input.delayWarning.description,
    noticeDeadline,
    likelyProgrammeImpactDays: input.delayWarning.likelyProgrammeImpactDays,
    createdBy: actorId,
  });

  // ── 9. Assess programme impact ─────────────────────────────────────────────
  const impactId = await assessProgrammeImpact({
    projectId,
    sourceObjectId: warningId,
    sourceType: 'delay_warning',
    estimatedDays: input.delayWarning.likelyProgrammeImpactDays,
    createdBy: actorId,
  });

  const requiresPlannerReview = input.delayWarning.likelyProgrammeImpactDays > 0;

  // ── 10. Generate payment blockers from field-control state ─────────────────
  const paymentBlockers: Array<{ id: string; reason: string }> = [];
  const ncrSeverity = input.ncr.severity;
  const snagPriority = input.snag.priority;

  if (ncrSeverity === 'high' || ncrSeverity === 'critical') {
    const bId = await createPaymentBlocker({
      projectId,
      sourceObjectId: ncrId,
      sourceType: 'ncr',
      reason: `Unresolved NCR: ${input.ncr.title}`,
      severity: ncrSeverity,
      createdBy: actorId,
    });
    paymentBlockers.push({ id: bId, reason: `Unresolved NCR: ${input.ncr.title}` });
  }

  if (snagPriority === 'high' || snagPriority === 'critical') {
    const bId = await createPaymentBlocker({
      projectId,
      sourceObjectId: snagId,
      sourceType: 'snag',
      reason: `Unresolved snag: ${input.snag.description}`,
      severity: snagPriority,
      createdBy: actorId,
    });
    paymentBlockers.push({ id: bId, reason: `Unresolved snag: ${input.snag.description}` });
  }

  // ── 11. Emit ProjectRecords ────────────────────────────────────────────────
  const projectRecords: SiteProjectRecord[] = [
    makeRecord(projectId, ctx.tenantId, actorId, now, {
      recordType: 'daily_log',
      title: `Daily log ${input.dailyLog.date}`,
      status: 'submitted',
      payload: { dailyLogId, date: input.dailyLog.date },
    }),
    makeRecord(projectId, ctx.tenantId, actorId, now, {
      recordType: 'rfi',
      title: input.rfi.subject,
      status: 'responded',
      payload: { rfiId },
      linkedRecordIds: [rfiId],
    }),
    makeRecord(projectId, ctx.tenantId, actorId, now, {
      recordType: 'site_instruction',
      title: input.siteInstruction.title,
      status: 'acknowledged',
      payload: { instructionId },
      linkedRecordIds: [rfiId, instructionId],
    }),
    makeRecord(projectId, ctx.tenantId, actorId, now, {
      recordType: 'non_conformance_report',
      title: input.ncr.title,
      status: 'open',
      payload: { ncrId },
    }),
    makeRecord(projectId, ctx.tenantId, actorId, now, {
      recordType: 'snag_item',
      title: input.snag.description,
      status: 'ready_for_reinspection',
      payload: { snagId },
    }),
    makeRecord(projectId, ctx.tenantId, actorId, now, {
      recordType: 'inspection_record',
      title: `Inspection: ${input.inspection.inspectionType}`,
      status: inspectionStatus,
      payload: { inspectionId },
    }),
    makeRecord(projectId, ctx.tenantId, actorId, now, {
      recordType: 'delay_early_warning',
      title: 'Delay early warning',
      status: 'notice_required',
      payload: { warningId },
    }),
    makeRecord(projectId, ctx.tenantId, actorId, now, {
      recordType: 'programme_impact',
      title: 'Programme impact assessment',
      status: requiresPlannerReview ? 'planner_review_required' : 'no_review_required',
      payload: { impactId },
    }),
  ];

  // ── 12. Emit inbox events ──────────────────────────────────────────────────
  const inboxEvents: SiteInboxEvent[] = [
    makeInboxEvent(projectId, now, {
      recipientRole: 'contractor',
      title: `Respond to RFI: ${input.rfi.subject}`,
      sourceObjectId: rfiId,
      sourceObjectType: 'rfi',
      priority: 'high',
      dueDate,
    }),
    makeInboxEvent(projectId, now, {
      recipientRole: 'architect',
      title: `Issue formal instruction linked to RFI response`,
      sourceObjectId: rfiId,
      sourceObjectType: 'rfi',
      priority: 'medium',
    }),
    makeInboxEvent(projectId, now, {
      recipientRole: 'bep' as UserRole,
      title: `Review possible cost/time impact from site instruction`,
      sourceObjectId: instructionId,
      sourceObjectType: 'site_instruction',
      priority: 'medium',
    }),
  ];

  // ── 13. Generate agent recommendations ─────────────────────────────────────
  const agentRecommendations: SiteAgentRecommendation[] = [];

  if (rfiRequiresInstruction) {
    agentRecommendations.push(makeRecommendation(projectId, now, {
      agentKey: 'site_execution_agent',
      title: 'Convert RFI response into authorised site instruction',
      rationale: 'The professional response requires a formal instruction before work proceeds.',
      sourceObjectId: rfiId,
      severity: 'medium',
    }));
  }

  if (ncrSeverity === 'high' || ncrSeverity === 'critical') {
    agentRecommendations.push(makeRecommendation(projectId, now, {
      agentKey: 'quality_control_agent',
      title: 'Resolve NCR before recommending payment release',
      rationale: 'High/critical NCR remains open and is configured as a payment blocker.',
      sourceObjectId: ncrId,
      severity: ncrSeverity,
    }));
  }

  if (snagPriority === 'high' || snagPriority === 'critical') {
    agentRecommendations.push(makeRecommendation(projectId, now, {
      agentKey: 'snag_agent',
      title: 'Reinspect priority snag before closeout/payment',
      rationale: 'Priority snag remains unresolved.',
      sourceObjectId: snagId,
      severity: snagPriority,
    }));
  }

  if (input.delayWarning.likelyProgrammeImpactDays > 0) {
    agentRecommendations.push(makeRecommendation(projectId, now, {
      agentKey: 'risk_early_warning_agent',
      title: 'Review delay notice and programme impact',
      rationale: 'Delay early warning indicates likely programme impact and requires human contract review.',
      sourceObjectId: warningId,
      severity: 'high',
    }));
  }

  if (paymentBlockers.length > 0) {
    agentRecommendations.push(makeRecommendation(projectId, now, {
      agentKey: 'finance_control_agent',
      title: 'Hold payment/release recommendation until field blockers clear',
      rationale: `${paymentBlockers.length} active field-control blocker(s) exist.`,
      sourceObjectId: paymentBlockers[0].id,
      severity: 'high',
    }));
  }

  // ── 14. Build summary ──────────────────────────────────────────────────────
  const result: SiteExecutionScenarioResult = {
    dailyLogId,
    evidenceIds,
    rfiId,
    rfiStatus: 'responded',
    siteInstructionId: instructionId,
    instructionStatus: 'acknowledged',
    ncrId,
    ncrStatus: 'open',
    ncrBlocksPayment: ncrSeverity === 'high' || ncrSeverity === 'critical',
    snagId,
    snagStatus: 'ready_for_reinspection',
    snagBlocksPayment: snagPriority === 'high' || snagPriority === 'critical',
    inspectionId,
    inspectionStatus,
    warningId,
    warningStatus: input.delayWarning.likelyProgrammeImpactDays > 0 ? 'notice_required' : 'recorded',
    programmeImpactId: impactId,
    requiresPlannerReview,
    paymentBlockers,
    projectRecords,
    inboxEvents,
    agentRecommendations,
    summary: {
      projectId,
      evidenceCount: evidenceIds.length,
      dailyLogStatus: 'submitted',
      rfiStatus: 'responded',
      instructionStatus: 'acknowledged',
      ncrStatus: 'open',
      snagStatus: 'ready_for_reinspection',
      inspectionStatus,
      warningStatus: input.delayWarning.likelyProgrammeImpactDays > 0 ? 'notice_required' : 'recorded',
      activeBlockers: paymentBlockers.length,
      projectRecords: projectRecords.length,
      inboxEvents: inboxEvents.length,
      recommendations: agentRecommendations.length,
    },
  };

  return result;
}

export const siteExecutionOrchestrator = {
  executeSiteExecutionScenario,
};

export default siteExecutionOrchestrator;
