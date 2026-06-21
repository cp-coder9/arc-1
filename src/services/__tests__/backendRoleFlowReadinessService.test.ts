import { describe, expect, it } from 'vitest';
import { buildApprovalGateRecord } from '../approvalGateService';
import { BACKEND_ROLE_FLOW_REQUIREMENTS, projectBackendRoleFlowReadiness } from '../backendRoleFlowReadinessService';

const commonPages = ['command', 'profile', 'toolbox', 'journey', 'tasks', 'messages', 'programme', 'contracts', 'payments', 'escrow', 'ai'];

describe('backendRoleFlowReadinessService', () => {
  it('defines backend.html role-flow coverage for every canonical role', () => {
    const roles = new Set(BACKEND_ROLE_FLOW_REQUIREMENTS.flatMap((requirement) => requirement.roles));

    expect([...roles].sort()).toEqual(['admin', 'architect', 'bep', 'client', 'contractor', 'freelancer', 'subcontractor', 'supplier']);
    expect(BACKEND_ROLE_FLOW_REQUIREMENTS.every((requirement) => requirement.requiredPages.length > 0 && requirement.requiredCapabilities.length > 0)).toBe(true);
  });

  it('marks a client flow ready only when pages, capabilities, and human governance evidence are present', () => {
    const projection = projectBackendRoleFlowReadiness('client', {
      pageIds: [...commonPages, 'client-intake', 'client-proposals', 'directory-search', 'client-progress', 'municipal-tracker'],
      capabilityIds: ['guided_brief_record', 'proposal_comparison', 'appointment_decision', 'plain_language_progress', 'payment_governance_warning'],
      humanGovernanceQueues: ['approval_queue'],
    }, '2026-05-21T01:35:00.000Z');

    expect(projection.generatedAt).toBe('2026-05-21T01:35:00.000Z');
    expect(projection.overallStatus).toBe('ready');
    expect(projection.readyCount).toBe(1);
    expect(projection.nextActions).toEqual([]);
    expect(projection.audit).toEqual({ source: 'backend.html', providerNeutral: true, noFakeIntegrations: true, humanApprovalPreserved: true });
    expect(Object.isFrozen(projection)).toBe(true);
  });

  it('keeps BEP/design readiness provider-gated until statutory approvals and real capabilities are evidenced', () => {
    const projection = projectBackendRoleFlowReadiness('bep', {
      pageIds: [...commonPages, 'design', 'drawing-register', 'drawing-checker'],
      capabilityIds: ['technical_brief_review', 'drawing_register'],
      humanGovernanceQueues: ['ai_review_queue'],
    });

    expect(projection.overallStatus).toBe('partial');
    expect(projection.items[0].maturity).toBe('provider_gated');
    expect(projection.items[0].missingPages).toEqual(expect.arrayContaining(['sans-forms', 'technical-brief', 'bep-team', 'bep-freelancers', 'resource-centre', 'cpd-assessment']));
    expect(projection.nextActions).toEqual(expect.arrayContaining([
      'Missing workflow capability: ai_compliance_review.',
      'Missing workflow capability: sans_form_evidence.',
      'Provider/human approval gate not cleared: statutory.',
    ]));
  });

  it('blocks package participant readiness when only generic shell pages are visible', () => {
    const projection = projectBackendRoleFlowReadiness('supplier', {
      pageIds: commonPages,
      capabilityIds: [],
    });

    expect(projection.overallStatus).toBe('blocked');
    expect(projection.blockedCount).toBe(1);
    expect(projection.items[0].missingPages).toEqual(['construction', 'procurement', 'packages', 'snagging', 'knowledge']);
    expect(projection.nextActions).toContain('Human governance queue evidence is required before automated completion or release.');
  });

  it('marks admin governance as human governed when queues, release gates, pages, and deployment approval evidence are present', () => {
    const projection = projectBackendRoleFlowReadiness('admin', {
      pageIds: [...commonPages, 'admin-console', 'design', 'drawing-register', 'sans-forms', 'construction', 'procurement', 'packages', 'snagging', 'knowledge'],
      capabilityIds: ['admin_queue_summary', 'dispute_queue', 'payment_hold_queue', 'ai_review_queue', 'statutory_sync_queue', 'release_no_go_gates'],
      providerApprovals: ['deployment'],
      humanGovernanceQueues: ['admin_governance_queue'],
    });

    expect(projection.overallStatus).toBe('ready');
    expect(projection.items[0].maturity).toBe('human_governed');
  });

  it('uses approval gate readiness evidence for backend.html human-governed BEP design workflows', () => {
    const gate = buildApprovalGateRecord({
      id: 'gate-design-1',
      domain: 'compliance_signoff',
      projectId: 'project-1',
      target: { type: 'sans_form_pack', id: 'sans-pack-1' },
      requestedBy: { uid: 'bep-1', role: 'bep', verificationStatus: 'verified' },
      requiredApproverRoles: ['bep'],
      risk: 'high',
      reason: 'SANS form pack requires verified professional sign-off before municipal submission.',
      statutoryImpact: true,
      evidence: [
        { id: 'drawing-1', type: 'drawing', label: 'Council drawing set', hash: 'sha256:drawing' },
        { id: 'sans-form-1', type: 'form', label: 'SANS 10400 form pack', hash: 'sha256:sans' },
      ],
      createdAt: '2026-05-22T11:30:00.000Z',
    });

    const projection = projectBackendRoleFlowReadiness('bep', {
      pageIds: [...commonPages, 'design', 'drawing-register', 'drawing-checker', 'sans-forms', 'technical-brief', 'bep-team', 'bep-freelancers', 'resource-centre', 'cpd-assessment'],
      capabilityIds: ['technical_brief_review', 'drawing_register', 'ai_compliance_review', 'sans_form_evidence', 'discipline_matrix', 'cpd_evidence'],
      providerApprovals: ['statutory'],
      approvalGates: [gate],
    }, '2026-05-22T11:35:00.000Z');

    expect(projection.overallStatus).toBe('partial');
    expect(projection.items[0].maturity).toBe('implemented');
    expect(projection.items[0].approvalGateEvidence[0].gateId).toBe('gate-design-1');
    expect(projection.items[0].approvalGateEvidence[0].domain).toBe('compliance_signoff');
    expect(projection.items[0].approvalGateEvidence[0].ready).toBe(false);
    expect(projection.items[0].approvalGateEvidence[0].risk).toBe('high');
    expect(projection.items[0].approvalGateEvidence[0].requiredApproverRoles).toEqual(['bep']);
    expect(projection.items[0].approvalGateEvidence[0].requiresVerifiedProfessional).toBe(true);
    expect(projection.nextActions).toEqual([
      'Approval gate gate-design-1: High-risk approval (high) requires admin escalation.',
    ]);
  });

  it('surfaces approval gate blockers from shared readiness primitives', () => {
    const gate = buildApprovalGateRecord({
      id: 'gate-ai-1',
      domain: 'ai_output',
      projectId: 'project-1',
      target: { type: 'drawing_review', id: 'review-1' },
      requestedBy: { uid: 'ai-agent-1', role: 'system' },
      requiredApproverRoles: ['subcontractor'],
      risk: 'high',
      reason: 'AI drawing output cannot advance without professional review.',
      aiGenerated: true,
      statutoryImpact: true,
      evidence: [{ id: 'ai-review-1', type: 'ai_output', label: 'AI drawing review report' }],
      createdAt: '2026-05-22T11:40:00.000Z',
    });

    const projection = projectBackendRoleFlowReadiness('bep', {
      pageIds: [...commonPages, 'design', 'drawing-register', 'drawing-checker', 'sans-forms', 'technical-brief', 'bep-team', 'bep-freelancers', 'resource-centre', 'cpd-assessment'],
      capabilityIds: ['technical_brief_review', 'drawing_register', 'ai_compliance_review', 'sans_form_evidence', 'discipline_matrix', 'cpd_evidence'],
      providerApprovals: ['statutory'],
      approvalGates: [gate],
    });

    expect(projection.overallStatus).toBe('partial');
    expect(projection.items[0].approvalGateEvidence[0]).toMatchObject({
      gateId: 'gate-ai-1',
      ready: false,
      blockers: [
        'High-risk approval (high) requires admin escalation',
      ],
    });
    expect(projection.nextActions).toEqual(expect.arrayContaining([
      'Approval gate gate-ai-1: High-risk approval (high) requires admin escalation.',
    ]));
  });

});
