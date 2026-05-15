import { describe, expect, it } from 'vitest';
import {
  buildAiActionLog,
  buildAiReviewQueueItem,
  buildHumanSignOffRecord,
} from '../aiGovernanceService';

const baseAiAction = {
  projectId: 'project-1',
  actionKind: 'drawing_check' as const,
  actorUid: 'bep-1',
  target: { type: 'drawing_check_run', id: 'run-1' },
  prompt: {
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    promptVersion: 'drawing-check-v1',
    temperature: 0.2,
  },
  sourceReferences: [{ type: 'drawing' as const, id: 'drawing-1', excerptHash: 'sha256:abc' }],
  confidence: 0.91,
  outputSummary: 'Detected no major checklist gaps. Advisory only.',
  createdAt: '2026-05-15T11:00:00.000Z',
};

describe('aiGovernanceService', () => {
  it('builds advisory AI action logs with traceable model, prompt, confidence, and sources', () => {
    const log = buildAiActionLog(baseAiAction);

    expect(log).toMatchObject({
      projectId: 'project-1',
      status: 'advisory',
      immutable: true,
      requiresHumanConfirmation: false,
      confidence: 0.91,
      prompt: expect.objectContaining({ model: 'gemini-2.0-flash', promptVersion: 'drawing-check-v1' }),
      sourceReferences: [{ type: 'drawing', id: 'drawing-1', excerptHash: 'sha256:abc' }],
    });
  });

  it('rejects AI action logs without source evidence or valid confidence', () => {
    expect(() => buildAiActionLog({ ...baseAiAction, sourceReferences: [] })).toThrow(/source reference/);
    expect(() => buildAiActionLog({ ...baseAiAction, confidence: 1.2 })).toThrow(/between 0 and 1/);
  });

  it('creates an AI review queue item for low-confidence advisory outputs', () => {
    const log = buildAiActionLog({ ...baseAiAction, confidence: 0.5 });
    const item = buildAiReviewQueueItem(log, 'ai-log-1');

    expect(log.status).toBe('requires_review');
    expect(item).toMatchObject({
      projectId: 'project-1',
      actionLogId: 'ai-log-1',
      priority: 'medium',
      status: 'open',
      assignedRole: 'bep',
    });
    expect(item?.reason).toContain('below 0.72');
  });

  it('escalates legal or compliance risk flags to the admin review queue', () => {
    const log = buildAiActionLog({
      ...baseAiAction,
      confidence: 0.88,
      flags: ['legal_or_compliance_risk', 'legal_or_compliance_risk'],
    });
    const item = buildAiReviewQueueItem(log, 'ai-log-2');

    expect(item).toMatchObject({
      priority: 'critical',
      assignedRole: 'admin',
      flags: ['legal_or_compliance_risk'],
    });
  });

  it('does not create a queue item for high-confidence unflagged advisory outputs', () => {
    const log = buildAiActionLog(baseAiAction);
    expect(buildAiReviewQueueItem(log, 'ai-log-3')).toBeNull();
  });

  it('blocks AI/system actors from compliance sign-off', () => {
    expect(() => buildHumanSignOffRecord({
      domain: 'compliance_declaration',
      actorUid: 'ai',
      actorRole: 'ai',
      target: { type: 'compliance_form', id: 'form-1', projectId: 'project-1' },
      declaration: 'AI attempted certification.',
    })).toThrow(/cannot complete human sign-off/);
  });

  it('requires verified professional status for compliance declarations', () => {
    expect(() => buildHumanSignOffRecord({
      domain: 'compliance_declaration',
      actorUid: 'bep-1',
      actorRole: 'bep',
      actorVerificationStatus: 'pending',
      target: { type: 'compliance_form', id: 'form-1', projectId: 'project-1' },
      declaration: 'I confirm the declaration as the responsible professional.',
    })).toThrow(/verified professional status/);
  });

  it('builds immutable human sign-off records linked to advisory AI logs', () => {
    const record = buildHumanSignOffRecord({
      domain: 'municipal_submission',
      actorUid: 'architect-1',
      actorRole: 'architect',
      actorVerificationStatus: 'verified',
      target: { type: 'municipal_submission', id: 'submission-1', projectId: 'project-1' },
      declaration: 'I reviewed and approve this municipal submission package.',
      aiActionLogIds: ['ai-log-1'],
      createdAt: '2026-05-15T11:05:00.000Z',
    });

    expect(record).toMatchObject({
      humanConfirmed: true,
      aiMayNotSign: true,
      immutable: true,
      aiActionLogIds: ['ai-log-1'],
    });
  });
});
