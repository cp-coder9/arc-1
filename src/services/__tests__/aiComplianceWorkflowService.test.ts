import { describe, expect, it } from 'vitest';
import { buildComplianceAuditInput, buildComplianceReviewRecord, buildComplianceRun, type ComplianceFindingInput } from '../aiComplianceWorkflowService';

const prompt = { provider: 'gemini', model: 'gemini-2.0-flash', promptVersion: 'sans-check-v1', temperature: 0.2 };
const source = { type: 'drawing' as const, id: 'drawing-1', label: 'A101', excerptHash: 'sha256:a101' };
const lowRiskFinding: ComplianceFindingInput = {
  code: 'SANS-XA-INFO',
  title: 'Energy note present',
  description: 'Energy notes appear present and legible.',
  severity: 'low',
  sourceReferences: [source],
  confidence: 0.91,
};

describe('aiComplianceWorkflowService', () => {
  it('builds clear advisory compliance runs when findings are low-risk and high-confidence', () => {
    const run = buildComplianceRun({ projectId: 'project-1', actorUid: 'bep-1', drawingPackageId: 'pkg-1', prompt, findings: [lowRiskFinding], summary: 'Low-risk advisory scan.' });

    expect(run).toMatchObject({
      overallStatus: 'clear_advisory',
      humanReviewRequired: false,
      aiMayNotCertify: true,
    });
    expect(run.findings[0]).toMatchObject({ status: 'open', humanReviewRequired: false, aiAdvisoryOnly: true });
    expect(run.aiActionLog.status).toBe('advisory');
    expect(run.reviewQueueItem).toBeNull();
  });

  it('requires human review for medium/high findings even when confidence is high', () => {
    const run = buildComplianceRun({
      projectId: 'project-1',
      actorUid: 'bep-1',
      drawingPackageId: 'pkg-1',
      prompt,
      summary: 'Review required.',
      findings: [{ ...lowRiskFinding, code: 'SANS-10400-T', severity: 'high', confidence: 0.94, title: 'Fire escape concern' }],
    });

    expect(run.overallStatus).toBe('review_required');
    expect(run.humanReviewRequired).toBe(true);
    expect(run.findings[0].humanReviewRequired).toBe(true);
    expect(run.reviewQueueItem).toMatchObject({ status: 'open', assignedRole: 'bep' });
  });

  it('escalates critical compliance findings to legal/compliance admin review', () => {
    const run = buildComplianceRun({
      projectId: 'project-1',
      actorUid: 'bep-1',
      drawingPackageId: 'pkg-1',
      prompt,
      summary: 'Critical issue.',
      findings: [{ ...lowRiskFinding, code: 'NBR-CRITICAL', severity: 'critical', confidence: 0.8, title: 'Critical non-compliance' }],
    });

    expect(run.overallStatus).toBe('critical_review_required');
    expect(run.aiActionLog.flags).toContain('legal_or_compliance_risk');
    expect(run.reviewQueueItem).toMatchObject({ priority: 'critical', assignedRole: 'admin' });
  });

  it('rejects findings without sources or valid confidence', () => {
    expect(() => buildComplianceRun({ projectId: 'project-1', actorUid: 'bep-1', drawingPackageId: 'pkg-1', prompt, findings: [{ ...lowRiskFinding, sourceReferences: [] }], summary: 'No source.' })).toThrow(/sourceReferences/);
    expect(() => buildComplianceRun({ projectId: 'project-1', actorUid: 'bep-1', drawingPackageId: 'pkg-1', prompt, findings: [{ ...lowRiskFinding, confidence: -0.1 }], summary: 'Bad confidence.' })).toThrow(/confidence/);
  });

  it('requires verified professional or admin human review records', () => {
    expect(() => buildComplianceReviewRecord({ runId: 'run-1', projectId: 'project-1', reviewerId: 'client-1', reviewerRole: 'client', findingDecisions: [{ code: 'A', status: 'resolved', note: 'Done' }] })).toThrow(/BEP, architect, or admin/);
    expect(() => buildComplianceReviewRecord({ runId: 'run-1', projectId: 'project-1', reviewerId: 'bep-1', reviewerRole: 'bep', reviewerVerificationStatus: 'pending', findingDecisions: [{ code: 'A', status: 'resolved', note: 'Done' }] })).toThrow(/verified professional/);

    expect(buildComplianceReviewRecord({ runId: 'run-1', projectId: 'project-1', reviewerId: 'bep-1', reviewerRole: 'bep', reviewerVerificationStatus: 'verified', findingDecisions: [{ code: 'A', status: 'accepted_risk', note: 'Accepted with mitigation.' }] })).toMatchObject({ humanReviewed: true, aiMayNotCertify: true });
  });

  it('builds audit metadata that preserves advisory-only posture', () => {
    expect(buildComplianceAuditInput({ actorId: 'bep-1', action: 'ai_compliance.run.created', projectId: 'project-1', runId: 'run-1', status: 'review_required', findingCount: 2 })).toMatchObject({
      actorId: 'bep-1',
      resourceType: 'ai_compliance_run',
      resourceId: 'run-1',
      metadata: { status: 'review_required', findingCount: 2, aiAdvisoryOnly: true, aiMayNotCertify: true },
    });
  });
});
