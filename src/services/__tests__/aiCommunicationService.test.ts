import { describe, expect, it } from 'vitest';
import { buildAiCommunicationSuggestion } from '../aiCommunicationService';

describe('aiCommunicationService', () => {
  it('classifies phase messages into draft-only suggestions that require human approval', () => {
    const suggestion = buildAiCommunicationSuggestion({
      projectId: 'project-1',
      jobId: 'job-1',
      threadId: 'thread-1',
      messageId: 'message-1',
      phase: 'delivery',
      captureType: 'site_photo',
      content: 'Waterproofing membrane photo uploaded. Please inspect before tiling starts tomorrow.',
      senderRole: 'contractor',
    });

    expect(suggestion).toMatchObject({
      projectId: 'project-1',
      jobId: 'job-1',
      threadId: 'thread-1',
      messageId: 'message-1',
      phase: 'delivery',
      captureType: 'site_photo',
      urgency: 'high',
      structuredStatus: 'draft_suggestion',
      requiresHumanApproval: true,
      mayIssueFormalOutput: false,
      suggestedRecordLinks: expect.arrayContaining([{ recordType: 'site_log', confidence: 'high' }]),
      suggestedActions: expect.arrayContaining([
        expect.objectContaining({ type: 'inspection_required', approvalRequired: true }),
      ]),
    });

    expect(suggestion.summary).toContain('Waterproofing membrane photo');
    expect(suggestion.auditNote).toContain('AI suggestion only');
  });

  it('routes compliance approval requests as formal-draft blockers until a human approves', () => {
    const suggestion = buildAiCommunicationSuggestion({
      projectId: 'project-2',
      jobId: 'job-2',
      threadId: 'thread-2',
      messageId: 'message-2',
      phase: 'compliance',
      captureType: 'approval_request',
      content: 'Council submission drawings are ready. Can we submit to the municipality?',
      senderRole: 'bep',
    });

    expect(suggestion).toMatchObject({
      urgency: 'high',
      structuredStatus: 'draft_suggestion',
      requiresHumanApproval: true,
      mayIssueFormalOutput: false,
      suggestedRecordLinks: expect.arrayContaining([{ recordType: 'municipal_submission', confidence: 'medium' }]),
      suggestedActions: expect.arrayContaining([
        expect.objectContaining({ type: 'human_approval_required', approvalRequired: true }),
      ]),
    });
    expect(suggestion.aiTags).toEqual(expect.arrayContaining(['compliance', 'approval-request']));
  });
});
