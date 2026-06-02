import type { ProjectStage } from '../types';

export const PROJECT_COMMUNICATION_CAPTURE_TYPES = [
  'chat',
  'voice_note',
  'document_upload',
  'drawing_comment',
  'approval_request',
  'site_photo',
  'site_voice_note',
  'rfi',
  'site_instruction',
  'payment_note',
  'closeout_evidence',
] as const;

export type ProjectCommunicationCaptureType = typeof PROJECT_COMMUNICATION_CAPTURE_TYPES[number];

export type ProjectCommunicationConversionRoute =
  | 'brief_item'
  | 'appointment_query'
  | 'design_coordination_issue'
  | 'municipal_submission'
  | 'compliance_issue'
  | 'tender_query'
  | 'procurement_record'
  | 'site_log'
  | 'rfi'
  | 'snag_item'
  | 'payment_claim'
  | 'closeout_record';

export interface PhaseCommunicationConfig {
  stage: ProjectStage;
  captureTools: ProjectCommunicationCaptureType[];
  suggestedPrompts: string[];
  fileFocus: string[];
  nextActions: string[];
  conversionRoutes: ProjectCommunicationConversionRoute[];
}

export const PHASE_COMMUNICATION_CONFIG: Record<Exclude<ProjectStage, 'scoping'>, PhaseCommunicationConfig> = {
  intake: {
    stage: 'intake',
    captureTools: ['chat', 'voice_note', 'document_upload', 'approval_request'],
    suggestedPrompts: ['Capture the client brief', 'Request missing property documents', 'Clarify budget and constraints'],
    fileFocus: ['title deeds', 'photos', 'site information', 'client brief attachments'],
    nextActions: ['complete brief', 'assign BEP review', 'prepare appointment route'],
    conversionRoutes: ['brief_item', 'appointment_query'],
  },
  appointment: {
    stage: 'appointment',
    captureTools: ['chat', 'document_upload', 'approval_request', 'voice_note'],
    suggestedPrompts: ['Confirm appointment scope', 'Request proposal approval', 'Record contract queries'],
    fileFocus: ['fee proposals', 'appointment letters', 'contracts', 'scope schedules'],
    nextActions: ['confirm BEP appointment', 'request client approval', 'prepare design coordination'],
    conversionRoutes: ['appointment_query', 'brief_item'],
  },
  coordination: {
    stage: 'coordination',
    captureTools: ['chat', 'drawing_comment', 'document_upload', 'approval_request'],
    suggestedPrompts: ['Log a design coordination issue', 'Request consultant input', 'Record drawing comments'],
    fileFocus: ['drawings', 'consultant markups', 'technical briefs', 'coordination notes'],
    nextActions: ['assign design issue', 'request consultant response', 'prepare compliance evidence'],
    conversionRoutes: ['design_coordination_issue', 'brief_item'],
  },
  compliance: {
    stage: 'compliance',
    captureTools: ['chat', 'drawing_comment', 'document_upload', 'approval_request'],
    suggestedPrompts: ['Capture municipal submission status', 'Record SANS compliance issue', 'Request professional sign-off'],
    fileFocus: ['municipal forms', 'SANS evidence', 'drawings', 'submission receipts'],
    nextActions: ['prepare human sign-off', 'link authority evidence', 'resolve compliance blockers'],
    conversionRoutes: ['municipal_submission', 'compliance_issue'],
  },
  tender: {
    stage: 'tender',
    captureTools: ['chat', 'document_upload', 'approval_request', 'drawing_comment'],
    suggestedPrompts: ['Capture tender query', 'Request supplier clarification', 'Record procurement decision'],
    fileFocus: ['BoQ', 'BoM', 'tender returns', 'supplier quotes'],
    nextActions: ['assign tender query', 'compare bid evidence', 'prepare award approval'],
    conversionRoutes: ['tender_query', 'procurement_record'],
  },
  delivery: {
    stage: 'delivery',
    captureTools: ['chat', 'site_photo', 'site_voice_note', 'rfi', 'site_instruction', 'document_upload'],
    suggestedPrompts: ['Capture site progress', 'Raise an RFI', 'Record instruction or delay evidence'],
    fileFocus: ['site photos', 'delivery notes', 'inspection evidence', 'programme updates'],
    nextActions: ['create site log', 'assign RFI', 'link evidence to package'],
    conversionRoutes: ['site_log', 'rfi', 'snag_item'],
  },
  payments: {
    stage: 'payments',
    captureTools: ['chat', 'document_upload', 'approval_request', 'payment_note'],
    suggestedPrompts: ['Capture payment claim evidence', 'Request milestone approval', 'Record dispute context'],
    fileFocus: ['invoices', 'claims', 'payment certificates', 'escrow records'],
    nextActions: ['request human approval', 'link claim evidence', 'prepare ledger review'],
    conversionRoutes: ['payment_claim', 'procurement_record'],
  },
  closeout: {
    stage: 'closeout',
    captureTools: ['chat', 'site_photo', 'document_upload', 'approval_request', 'closeout_evidence'],
    suggestedPrompts: ['Capture snag item', 'Upload warranty or certificate', 'Request close-out acceptance'],
    fileFocus: ['snag lists', 'warranties', 'certificates', 'as-built records'],
    nextActions: ['create close-out record', 'request acceptance', 'archive approved evidence'],
    conversionRoutes: ['snag_item', 'closeout_record'],
  },
};

export function getPhaseCommunicationConfig(stage: ProjectStage): PhaseCommunicationConfig {
  return PHASE_COMMUNICATION_CONFIG[stage === 'scoping' ? 'intake' : stage];
}
