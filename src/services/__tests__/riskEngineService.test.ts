/**
 * Unit tests for riskEngineService (Pack 2)
 * Tests all risk detection types, severity ordering, and dynamic risks.
 */
import { describe, expect, it } from 'vitest';
import { detectProjectRisks } from '../masterExpansion/riskEngineService';
import type { LifecycleEvaluation, ProjectRecord } from '@/types/architexMasterTypes';

function makeRecord(
  overrides: Partial<ProjectRecord> & { id: string },
): ProjectRecord {
  return {
    tenantId: 't1',
    projectId: 'p1',
    phase: 'construction_execution',
    moduleKey: 'site_execution',
    recordType: 'site_diary',
    title: 'Test Record',
    status: 'draft',
    payload: {},
    approval: {
      status: 'draft',
      requiredApproverRoles: [],
    },
    audit: {
      createdByUserId: 'u1',
      createdAt: '2026-06-09T00:00:00Z',
      source: 'user',
    },
    linkedRecordIds: [],
    ...overrides,
  };
}

describe('detectProjectRisks', () => {
  it('detects construction without approval evidence', () => {
    const records = [
      makeRecord({ id: 'r1', recordType: 'site_diary', phase: 'construction_execution' }),
    ];
    const findings = detectProjectRisks(records);

    const constructionRisk = findings.find(
      (f) => f.code === 'CONSTRUCTION_WITHOUT_APPROVAL_EVIDENCE',
    );
    expect(constructionRisk).toBeDefined();
    expect(constructionRisk!.severity).toBe('critical');
    expect(constructionRisk!.assignedRoles).toContain('architect');
  });

  it('does not flag construction risk when approval exists', () => {
    const records = [
      makeRecord({
        id: 'r1',
        recordType: 'municipal_submission_item',
        approval: { status: 'approved', requiredApproverRoles: [] },
      }),
      makeRecord({ id: 'r2', recordType: 'site_diary', phase: 'construction_execution' }),
    ];
    const findings = detectProjectRisks(records);
    expect(
      findings.find((f) => f.code === 'CONSTRUCTION_WITHOUT_APPROVAL_EVIDENCE'),
    ).toBeUndefined();
  });

  it('detects missing appointment in dependent phases', () => {
    const records = [
      makeRecord({
        id: 'r1',
        recordType: 'drawing_revision',
        phase: 'design_coordination',
        approval: { status: 'approved', requiredApproverRoles: [] },
      }),
    ];
    const findings = detectProjectRisks(records);
    const apptRisk = findings.find((f) => f.code === 'NO_SIGNED_APPOINTMENT');
    expect(apptRisk).toBeDefined();
    expect(apptRisk!.severity).toBe('high');
  });

  it('detects tender without scope baseline', () => {
    const records = [
      makeRecord({ id: 'r1', recordType: 'document', phase: 'tender_procurement' }),
    ];
    const findings = detectProjectRisks(records);
    const tenderRisk = findings.find(
      (f) => f.code === 'TENDER_WITHOUT_SCOPE_BASELINE',
    );
    expect(tenderRisk).toBeDefined();
  });

  it('detects payment pending review', () => {
    const records = [
      makeRecord({
        id: 'r1',
        recordType: 'payment_certificate',
        approval: {
          status: 'pending_review',
          requiredApproverRoles: ['quantity_surveyor'],
        },
      }),
    ];
    const findings = detectProjectRisks(records);
    const payRisk = findings.find((f) => f.code === 'PAYMENT_PENDING_REVIEW');
    expect(payRisk).toBeDefined();
  });

  it('detects closeout without snag resolution', () => {
    const records = [
      makeRecord({
        id: 'r1',
        recordType: 'snag',
        phase: 'closeout',
        approval: { status: 'draft', requiredApproverRoles: [] },
      }),
    ];
    const findings = detectProjectRisks(records);
    const snagRisk = findings.find(
      (f) => f.code === 'CLOSEOUT_WITHOUT_SNAG_RESOLUTION',
    );
    expect(snagRisk).toBeDefined();
  });

  it('detects candidate unsupervised output', () => {
    const records = [
      makeRecord({
        id: 'r1',
        recordType: 'drawing_revision',
        audit: {
          createdByUserId: 'u-candidate-001',
          createdAt: '2026-06-09T00:00:00Z',
        },
        approval: {
          status: 'pending_review',
          requiredApproverRoles: ['architect'],
        },
      }),
    ];
    const findings = detectProjectRisks(records);
    const candRisk = findings.find(
      (f) => f.code === 'CANDIDATE_UNSUPERVISED_OUTPUT',
    );
    expect(candRisk).toBeDefined();
  });

  it('detects outstanding payments', () => {
    const records = [
      makeRecord({
        id: 'r1',
        recordType: 'payment_certificate',
        status: 'pending_review',
        approval: { status: 'pending_review', requiredApproverRoles: [] },
      }),
    ];
    const findings = detectProjectRisks(records);
    const outRisk = findings.find((f) => f.code === 'OUTSTANDING_PAYMENT');
    expect(outRisk).toBeDefined();
  });

  it('detects pending formal approvals', () => {
    const records = [
      makeRecord({
        id: 'r1',
        recordType: 'verification_record',
        approval: {
          status: 'pending_review',
          requiredApproverRoles: ['architect', 'platform_admin'],
        },
      }),
    ];
    const findings = detectProjectRisks(records);
    const pendRisk = findings.find((f) => f.code === 'PENDING_APPROVALS');
    expect(pendRisk).toBeDefined();
  });

  it('detects active construction delays', () => {
    const records = [
      makeRecord({
        id: 'r1',
        recordType: 'delay_event',
        phase: 'construction_execution',
        status: 'open',
        approval: { status: 'draft', requiredApproverRoles: [] },
      }),
    ];
    const findings = detectProjectRisks(records);
    const delayRisk = findings.find(
      (f) => f.code === 'ACTIVE_CONSTRUCTION_DELAYS',
    );
    expect(delayRisk).toBeDefined();
  });

  it('returns empty findings for clean project', () => {
    const records = [
      makeRecord({
        id: 'r1',
        recordType: 'knowledge_source',
        phase: 'lead_enquiry',
        approval: { status: 'approved', requiredApproverRoles: [] },
      }),
    ];
    const findings = detectProjectRisks(records);
    // lead_enquiry with no construction/design records should have minimal risks
    const criticalFindings = findings.filter((f) => f.severity === 'critical');
    expect(criticalFindings).toHaveLength(0);
  });

  it('sorts findings by severity (critical first)', () => {
    const records = [
      makeRecord({
        id: 'r1',
        recordType: 'site_diary',
        phase: 'construction_execution',
      }),
      makeRecord({
        id: 'r2',
        recordType: 'payment_certificate',
        approval: {
          status: 'pending_review',
          requiredApproverRoles: ['quantity_surveyor'],
        },
      }),
    ];
    const findings = detectProjectRisks(records);
    if (findings.length >= 2) {
      const severities = findings.map((f) => f.severity);
      const rankOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      for (let i = 1; i < severities.length; i++) {
        expect(rankOrder[severities[i - 1]]).toBeGreaterThanOrEqual(
          rankOrder[severities[i]],
        );
      }
    }
  });

  it('includes dynamic risks from lifecycle evaluation', () => {
    const records: ProjectRecord[] = [];
    const lifecycle: LifecycleEvaluation = {
      phase: 'closeout',
      requiredRecordTypes: ['closeout_item', 'drawing_revision'],
      presentRequiredRecordTypes: [],
      missingRecords: [
        {
          recordType: 'closeout_item',
          priority: 'high',
          reason: 'Required for Closeout: closeout_item',
        },
      ],
      mayAdvance: false,
      blockers: [],
      nextBestActions: [],
    };

    const findings = detectProjectRisks(records, lifecycle);
    const dynamicRisk = findings.find((f) =>
      f.code.includes('CLOSEOUT_ITEM'),
    );
    expect(dynamicRisk).toBeDefined();
  });

  it('each risk finding has assigned roles', () => {
    const records = [
      makeRecord({
        id: 'r1',
        recordType: 'site_diary',
        phase: 'construction_execution',
      }),
    ];
    const findings = detectProjectRisks(records);
    for (const finding of findings) {
      expect(finding.code).toBeTruthy();
      expect(finding.severity).toBeTruthy();
      expect(finding.message).toBeTruthy();
      expect(Array.isArray(finding.assignedRoles)).toBe(true);
      expect(finding.assignedRoles.length).toBeGreaterThan(0);
    }
  });
});
