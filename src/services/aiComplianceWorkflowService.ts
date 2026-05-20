import { buildAiActionLog, buildAiReviewQueueItem, type AiActionLog, type AiPromptMetadata, type AiSourceReference } from './aiGovernanceService';

export type ComplianceFindingSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type ComplianceFindingStatus = 'open' | 'accepted_risk' | 'resolved' | 'false_positive';

export interface ComplianceFindingInput {
  code: string;
  title: string;
  description: string;
  severity: ComplianceFindingSeverity;
  sourceReferences: AiSourceReference[];
  recommendation?: string;
  confidence: number;
}

export interface ComplianceFindingRecord extends ComplianceFindingInput {
  status: ComplianceFindingStatus;
  humanReviewRequired: boolean;
  aiAdvisoryOnly: true;
  createdAt: string;
}

export interface ComplianceRunInput {
  projectId: string;
  actorUid: string;
  drawingPackageId: string;
  prompt: AiPromptMetadata;
  findings: ComplianceFindingInput[];
  summary: string;
}

export interface ComplianceRunRecord {
  projectId: string;
  actorUid: string;
  drawingPackageId: string;
  findings: ComplianceFindingRecord[];
  aiActionLog: AiActionLog;
  reviewQueueItem: ReturnType<typeof buildAiReviewQueueItem>;
  overallStatus: 'clear_advisory' | 'review_required' | 'critical_review_required';
  humanReviewRequired: boolean;
  aiMayNotCertify: true;
  createdAt: string;
}

export interface ComplianceReviewInput {
  runId: string;
  projectId: string;
  reviewerId: string;
  reviewerRole: string;
  reviewerVerificationStatus?: string;
  findingDecisions: Array<{ code: string; status: Exclude<ComplianceFindingStatus, 'open'>; note: string }>;
}

export interface ComplianceReviewRecord extends ComplianceReviewInput {
  humanReviewed: true;
  aiMayNotCertify: true;
  createdAt: string;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw Object.assign(new Error(`${field} is required`), { status: 400 });
  return value.trim();
}

function severityRequiresReview(severity: ComplianceFindingSeverity): boolean {
  return ['medium', 'high', 'critical'].includes(severity);
}

function normalizeFinding(input: ComplianceFindingInput): ComplianceFindingRecord {
  requireString(input.code, 'finding.code');
  requireString(input.title, 'finding.title');
  requireString(input.description, 'finding.description');
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) throw Object.assign(new Error('finding confidence must be between 0 and 1'), { status: 400 });
  if (!input.sourceReferences.length) throw Object.assign(new Error('finding sourceReferences are required'), { status: 400 });
  return {
    ...input,
    code: input.code.trim(),
    title: input.title.trim(),
    description: input.description.trim(),
    recommendation: input.recommendation?.trim(),
    status: 'open',
    humanReviewRequired: severityRequiresReview(input.severity) || input.confidence < 0.72,
    aiAdvisoryOnly: true,
    createdAt: new Date().toISOString(),
  };
}

export function buildComplianceRun(input: ComplianceRunInput): ComplianceRunRecord {
  if (!input.findings.length) throw Object.assign(new Error('at least one compliance finding or clear advisory finding is required'), { status: 400 });
  const findings = input.findings.map(normalizeFinding);
  const flags = findings.flatMap((finding) => finding.severity === 'critical'
    ? ['legal_or_compliance_risk', `critical:${finding.code}`]
    : finding.humanReviewRequired
      ? [`review:${finding.code}`]
      : []);
  const confidence = Math.min(...findings.map(finding => finding.confidence));
  const aiActionLog = buildAiActionLog({
    projectId: requireString(input.projectId, 'projectId'),
    actionKind: 'drawing_check',
    actorUid: requireString(input.actorUid, 'actorUid'),
    target: { type: 'drawing_package', id: requireString(input.drawingPackageId, 'drawingPackageId') },
    prompt: input.prompt,
    sourceReferences: findings.flatMap(finding => finding.sourceReferences),
    confidence,
    outputSummary: requireString(input.summary, 'summary'),
    flags,
  });
  const critical = findings.some(finding => finding.severity === 'critical');
  const humanReviewRequired = findings.some(finding => finding.humanReviewRequired) || aiActionLog.requiresHumanConfirmation;
  return {
    projectId: input.projectId.trim(),
    actorUid: input.actorUid.trim(),
    drawingPackageId: input.drawingPackageId.trim(),
    findings,
    aiActionLog,
    reviewQueueItem: buildAiReviewQueueItem(aiActionLog),
    overallStatus: critical ? 'critical_review_required' : humanReviewRequired ? 'review_required' : 'clear_advisory',
    humanReviewRequired,
    aiMayNotCertify: true,
    createdAt: aiActionLog.createdAt,
  };
}

export function buildComplianceReviewRecord(input: ComplianceReviewInput): ComplianceReviewRecord {
  requireString(input.reviewerId, 'reviewerId');
  const role = requireString(input.reviewerRole, 'reviewerRole').toLowerCase();
  if (!['bep', 'architect', 'admin'].includes(role)) throw Object.assign(new Error('Compliance review requires BEP, architect, or admin reviewer'), { status: 403 });
  if (role !== 'admin' && input.reviewerVerificationStatus !== 'verified') throw Object.assign(new Error('Compliance review requires verified professional status'), { status: 403 });
  if (!input.findingDecisions.length) throw Object.assign(new Error('finding decisions are required'), { status: 400 });
  input.findingDecisions.forEach((decision) => {
    requireString(decision.code, 'decision.code');
    requireString(decision.note, 'decision.note');
  });
  return {
    ...input,
    runId: requireString(input.runId, 'runId'),
    projectId: requireString(input.projectId, 'projectId'),
    humanReviewed: true,
    aiMayNotCertify: true,
    createdAt: new Date().toISOString(),
  };
}

export function buildComplianceAuditInput(input: { actorId: string; action: string; projectId: string; runId: string; status: ComplianceRunRecord['overallStatus']; findingCount: number }) {
  return {
    actorId: requireString(input.actorId, 'actorId'),
    action: requireString(input.action, 'action'),
    resourceType: 'ai_compliance_run',
    resourceId: requireString(input.runId, 'runId'),
    projectId: requireString(input.projectId, 'projectId'),
    metadata: {
      status: input.status,
      findingCount: input.findingCount,
      aiAdvisoryOnly: true,
      aiMayNotCertify: true,
    },
  };
}
