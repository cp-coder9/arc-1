/**
 * Site Execution + Field Control Workflow Orchestrator
 *
 * Runs a connected field-control demo scenario:
 *   daily log → evidence → RFI → response → site instruction →
 *   NCR → snag → inspection → delay early warning → programme impact →
 *   payment blockers → ProjectRecords → inbox events → audit trail → agent recommendations
 */
import type { UserRole } from '@/types';
import { captureEvidence } from './fieldEvidenceService';
import { assessProgrammeImpact } from './programmeImpactService';
import { createProjectRecord } from './projectRecordAdapter';
import { createInboxEvent } from './inboxEventAdapter';
import { recordAudit } from './siteAuditTrailService';
import { generateFieldRecommendations } from './agentRecommendationService';

export interface SiteExecutionDemoInput {
  projectId: string;
  tenantId: string;
  actorId: string;
  actorRole: UserRole;
  /** Additional IDs for parties involved */
  contractorId: string;
  subcontractorId?: string;
  drawingRevisionId?: string;
}

export interface SiteExecutionDemoResult {
  // Evidence
  slabPhotoEvidenceId: string;
  deliveryNoteEvidenceId: string;
  // Daily log (handled by constructionService)
  // RFI (handled by constructionService)
  // Site instruction — tracked via siteInstructionService
  // NCR — tracked via ncrService
  // Snag — tracked via snagService
  // Delay warning — tracked via delayWarningService
  // Programme impact
  impactId: string;
  // Payment blockers
  blockerIds: string[];
  // Project records
  recordIds: string[];
  // Inbox events
  inboxEventIds: string[];
  // Audit records
  auditRecordIds: string[];
  // Agent recommendations
  recommendationIds: string[];
  // Summary
  summary: {
    evidenceCount: number;
    impactNeedsReview: boolean;
    activeBlockerCount: number;
    recordCount: number;
    inboxCount: number;
    auditCount: number;
    recommendationCount: number;
  };
}

export async function runSiteExecutionDemo(
  input: SiteExecutionDemoInput & {
    dailyLogId?: string;
    rfiId?: string;
    instructionId?: string;
    ncrId?: string;
    snagId?: string;
    inspectionId?: string;
    warningId?: string;
    hasBlockingNcr: boolean;
    hasBlockingSnag: boolean;
    rfiNeedsInstruction: boolean;
  },
): Promise<SiteExecutionDemoResult> {
  const { projectId, tenantId, actorId, actorRole } = input;

  // 1. Field Evidence
  const slabPhotoEvidenceId = await captureEvidence({
    projectId,
    type: 'photo',
    title: 'Slab penetration conflict photo',
    uri: 'architex://files/site/slab-conflict.jpg',
    location: 'Level 1 grid B3',
    capturedBy: actorId,
  });

  const deliveryNoteEvidenceId = await captureEvidence({
    projectId,
    type: 'delivery_note',
    title: 'Brick delivery note',
    uri: 'architex://files/site/brick-delivery.pdf',
    location: 'Site gate',
    capturedBy: actorId,
  });

  // 2. Programme Impact (from delay warning if available)
  let impactId = '';
  if (input.warningId) {
    impactId = await assessProgrammeImpact({
      projectId,
      sourceObjectId: input.warningId,
      sourceType: 'delay_warning',
      estimatedDays: 2,
      createdBy: actorId,
    });
  }

  // 3. Payment Blockers (placeholder IDs from NCRs/snags)
  const blockerIds: string[] = [];

  // 4. Project Records
  const recordIds: string[] = [];
  const addRecord = async (recordType: string, title: string, status: string, payload: unknown, linkedIds: string[] = []) => {
    const id = await createProjectRecord({
      projectId,
      tenantId,
      phase: 'construction_execution',
      recordType,
      title,
      status,
      payload,
      linkedRecordIds: linkedIds,
      createdBy: actorId,
    });
    recordIds.push(id);
    return id;
  };

  if (input.dailyLogId) {
    await addRecord('daily_log', 'Daily log', 'submitted', { dailyLogId: input.dailyLogId });
  }
  if (input.rfiId) {
    await addRecord('rfi', 'RFI record', input.rfiNeedsInstruction ? 'responded' : 'closed', { rfiId: input.rfiId }, input.instructionId ? [input.instructionId] : []);
  }
  if (input.instructionId) {
    await addRecord('site_instruction', 'Site instruction', 'issued', { instructionId: input.instructionId }, input.rfiId ? [input.rfiId] : []);
  }
  if (input.ncrId) {
    await addRecord('non_conformance_report', 'NCR record', 'open', { ncrId: input.ncrId });
  }
  if (input.snagId) {
    await addRecord('snag_item', 'Snag item', 'allocated', { snagId: input.snagId });
  }
  if (input.inspectionId) {
    await addRecord('inspection_record', 'Inspection', 'issued', { inspectionId: input.inspectionId });
  }
  if (input.warningId) {
    await addRecord('delay_early_warning', 'Delay warning', 'notice_required', { warningId: input.warningId });
  }
  if (impactId) {
    await addRecord('programme_impact', 'Programme impact', 'planner_review_required', { impactId });
  }

  // 5. Inbox Events
  const inboxEventIds: string[] = [];

  if (input.ncrId) {
    inboxEventIds.push(await createInboxEvent({
      projectId,
      recipientRole: 'contractor',
      title: 'Submit method statement for beam chase corrective action',
      description: 'NCR corrective action pending',
      sourceObjectId: input.ncrId,
      sourceObjectType: 'ncr',
      priority: 'high',
      dueDate: new Date(Date.now() + 2 * 86400000).toISOString(),
    }));
  }

  if (input.rfiNeedsInstruction && input.rfiId) {
    inboxEventIds.push(await createInboxEvent({
      projectId,
      recipientRole: 'architect',
      title: 'Issue formal instruction linked to RFI response',
      sourceObjectId: input.rfiId,
      sourceObjectType: 'rfi',
      priority: 'medium',
      dueDate: new Date(Date.now() + 86400000).toISOString(),
    }));
  }

  if (input.instructionId) {
    inboxEventIds.push(await createInboxEvent({
      projectId,
      recipientRole: 'contractor',
      title: 'Review possible cost/time impact from site instruction',
      sourceObjectId: input.instructionId,
      sourceObjectType: 'site_instruction',
      priority: 'medium',
    }));
  }

  // 6. Audit Trail
  const auditObjects: Array<{ sourceObjectId: string; sourceObjectType: string }> = [];
  if (input.dailyLogId) auditObjects.push({ sourceObjectId: input.dailyLogId, sourceObjectType: 'daily_log' });
  if (input.rfiId) auditObjects.push({ sourceObjectId: input.rfiId, sourceObjectType: 'rfi' });
  if (input.instructionId) auditObjects.push({ sourceObjectId: input.instructionId, sourceObjectType: 'site_instruction' });
  if (input.ncrId) auditObjects.push({ sourceObjectId: input.ncrId, sourceObjectType: 'ncr' });
  if (input.snagId) auditObjects.push({ sourceObjectId: input.snagId, sourceObjectType: 'snag' });
  if (input.inspectionId) auditObjects.push({ sourceObjectId: input.inspectionId, sourceObjectType: 'inspection' });
  if (input.warningId) auditObjects.push({ sourceObjectId: input.warningId, sourceObjectType: 'delay_warning' });

  const auditRecordIds: string[] = [];
  for (const obj of auditObjects) {
    auditRecordIds.push(await recordAudit({
      projectId,
      actorId,
      actorRole,
      action: 'site_execution_record_created',
      sourceObjectId: obj.sourceObjectId,
      sourceObjectType: obj.sourceObjectType,
    }));
  }

  // 7. Agent Recommendations
  const recommendationIds = await generateFieldRecommendations(projectId, {
    hasRespondedRfiNeedingInstruction: input.rfiNeedsInstruction,
    rfiId: input.rfiId,
    hasBlockingNcr: input.hasBlockingNcr,
    ncrId: input.ncrId,
    ncrSeverity: 'high',
    hasBlockingSnag: input.hasBlockingSnag,
    snagId: input.snagId,
    snagSeverity: 'medium',
    hasNoticeRequiredWarning: !!input.warningId,
    warningId: input.warningId,
    activeBlockerCount: blockerIds.length,
    firstBlockerId: blockerIds[0],
  });

  const summary = {
    evidenceCount: 2,
    impactNeedsReview: !!impactId,
    activeBlockerCount: blockerIds.filter(Boolean).length,
    recordCount: recordIds.length,
    inboxCount: inboxEventIds.length,
    auditCount: auditRecordIds.length,
    recommendationCount: recommendationIds.length,
  };

  return {
    slabPhotoEvidenceId,
    deliveryNoteEvidenceId,
    impactId,
    blockerIds,
    recordIds,
    inboxEventIds,
    auditRecordIds,
    recommendationIds,
    summary,
  };
}

export const siteExecutionWorkflowService = {
  runSiteExecutionDemo,
};

export default siteExecutionWorkflowService;
