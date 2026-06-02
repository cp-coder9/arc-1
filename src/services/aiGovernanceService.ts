export type AiActionKind =
  | 'draft_technical_brief'
  | 'autofill_compliance_form'
  | 'drawing_check'
  | 'municipal_status_summary'
  | 'checklist_recommendation'
  | 'other_advisory';

export type AiActionStatus = 'advisory' | 'requires_review' | 'human_confirmed' | 'rejected';

export type AiReviewPriority = 'low' | 'medium' | 'high' | 'critical';

export type HumanSignOffDomain =
  | 'compliance_declaration'
  | 'professional_certificate'
  | 'municipal_submission'
  | 'escrow_release'
  | 'appointment_acceptance';

export interface AiSourceReference {
  type: 'document' | 'drawing' | 'brief' | 'municipal_record' | 'checklist' | 'user_input' | 'external_reference';
  id: string;
  label?: string;
  url?: string;
  excerptHash?: string;
}

export interface AiPromptMetadata {
  provider: string;
  model: string;
  promptVersion: string;
  temperature?: number;
  requestId?: string;
  tokenUsage?: {
    input?: number;
    output?: number;
    total?: number;
  };
}

export interface AiActionLogInput {
  projectId: string;
  actionKind: AiActionKind;
  actorUid: string;
  target: {
    type: string;
    id: string;
  };
  prompt: AiPromptMetadata;
  sourceReferences: AiSourceReference[];
  confidence: number;
  outputSummary: string;
  flags?: string[];
  createdAt?: string;
}

export interface AiActionLog extends AiActionLogInput {
  status: AiActionStatus;
  createdAt: string;
  requiresHumanConfirmation: boolean;
  immutable: true;
}

export interface AiReviewQueueItem {
  projectId: string;
  actionLogId?: string;
  target: AiActionLogInput['target'];
  priority: AiReviewPriority;
  reason: string;
  flags: string[];
  status: 'open' | 'resolved' | 'dismissed';
  assignedRole: 'admin' | 'bep' | 'compliance_reviewer';
  createdAt: string;
}

export interface HumanSignOffInput {
  domain: HumanSignOffDomain;
  actorUid: string;
  actorRole: string;
  actorVerificationStatus?: string;
  target: {
    type: string;
    id: string;
    projectId?: string;
  };
  declaration: string;
  aiActionLogIds?: string[];
  createdAt?: string;
}

export interface HumanSignOffRecord extends HumanSignOffInput {
  createdAt: string;
  humanConfirmed: true;
  aiMayNotSign: true;
  immutable: true;
}

const REVIEW_THRESHOLD = 0.72;
const PROFESSIONAL_SIGN_OFF_ROLES = new Set(['bep', 'architect', 'admin']);
const PAYMENT_SIGN_OFF_ROLES = new Set(['client', 'admin']);

function assertNonEmpty(value: string | undefined, field: string): asserts value is string {
  if (!value?.trim()) throw new Error(`${field} is required`);
}

function normalizeFlags(flags: string[] = []): string[] {
  return Array.from(new Set(flags.map((flag) => flag.trim()).filter(Boolean))).sort();
}

export function buildAiActionLog(input: AiActionLogInput): AiActionLog {
  assertNonEmpty(input.projectId, 'projectId');
  assertNonEmpty(input.actorUid, 'actorUid');
  assertNonEmpty(input.target?.type, 'target.type');
  assertNonEmpty(input.target?.id, 'target.id');
  assertNonEmpty(input.prompt?.provider, 'prompt.provider');
  assertNonEmpty(input.prompt?.model, 'prompt.model');
  assertNonEmpty(input.prompt?.promptVersion, 'prompt.promptVersion');
  assertNonEmpty(input.outputSummary, 'outputSummary');

  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) {
    throw new Error('confidence must be a number between 0 and 1');
  }

  if (!input.sourceReferences.length) {
    throw new Error('at least one source reference is required');
  }

  const flags = normalizeFlags(input.flags);
  const requiresHumanConfirmation = input.confidence < REVIEW_THRESHOLD || flags.length > 0;

  return {
    ...input,
    flags,
    status: requiresHumanConfirmation ? 'requires_review' : 'advisory',
    createdAt: input.createdAt || new Date().toISOString(),
    requiresHumanConfirmation,
    immutable: true,
  };
}

export function buildAiReviewQueueItem(actionLog: AiActionLog, actionLogId?: string): AiReviewQueueItem | null {
  if (!actionLog.requiresHumanConfirmation) return null;

  const priority: AiReviewPriority = actionLog.flags?.includes('legal_or_compliance_risk')
    ? 'critical'
    : actionLog.confidence < 0.45
      ? 'high'
      : actionLog.confidence < REVIEW_THRESHOLD
        ? 'medium'
        : 'low';

  return {
    projectId: actionLog.projectId,
    actionLogId,
    target: actionLog.target,
    priority,
    reason: actionLog.flags?.length
      ? `AI output flagged for review: ${actionLog.flags.join(', ')}`
      : `AI confidence ${actionLog.confidence.toFixed(2)} is below ${REVIEW_THRESHOLD}`,
    flags: actionLog.flags || [],
    status: 'open',
    assignedRole: priority === 'critical' ? 'admin' : 'bep',
    createdAt: actionLog.createdAt,
  };
}

export function assertHumanSignOffAllowed(input: HumanSignOffInput): void {
  assertNonEmpty(input.actorUid, 'actorUid');
  assertNonEmpty(input.actorRole, 'actorRole');
  assertNonEmpty(input.declaration, 'declaration');

  if (input.actorUid === 'ai' || input.actorRole === 'ai' || input.actorRole === 'system') {
    throw new Error('AI/system actors cannot complete human sign-off');
  }

  const role = input.actorRole.toLowerCase();
  if (['compliance_declaration', 'professional_certificate', 'municipal_submission'].includes(input.domain)) {
    if (!PROFESSIONAL_SIGN_OFF_ROLES.has(role)) {
      throw new Error(`${input.domain} requires a verified BEP, architect, or admin human signer`);
    }
    if (role !== 'admin' && input.actorVerificationStatus !== 'verified') {
      throw new Error(`${input.domain} requires verified professional status`);
    }
  }

  if (input.domain === 'escrow_release' && !PAYMENT_SIGN_OFF_ROLES.has(role)) {
    throw new Error('escrow_release requires a client or admin human signer');
  }
}

export function buildHumanSignOffRecord(input: HumanSignOffInput): HumanSignOffRecord {
  assertHumanSignOffAllowed(input);

  return {
    ...input,
    aiActionLogIds: input.aiActionLogIds || [],
    createdAt: input.createdAt || new Date().toISOString(),
    humanConfirmed: true,
    aiMayNotSign: true,
    immutable: true,
  };
}
