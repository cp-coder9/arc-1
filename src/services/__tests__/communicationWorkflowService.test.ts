import { describe, expect, it } from 'vitest';
import { buildCommunicationAuditInput, buildProjectMessage, buildProjectThread } from '../communicationWorkflowService';

describe('communicationWorkflowService', () => {
  it('builds auditable project/pro threads with unique participants', () => {
    const thread = buildProjectThread({
      projectId: 'project-1',
      jobId: 'job-1',
      createdBy: 'client-1',
      participantIds: ['client-1', 'bep-1', 'bep-1', ' '],
      participantRoles: { 'client-1': 'client', 'bep-1': 'bep' },
      subject: ' Appointment questions ',
    });

    expect(thread).toMatchObject({
      jobId: 'job-1',
      createdBy: 'client-1',
      participantIds: ['client-1', 'bep-1'],
      type: 'client_professional',
      subject: 'Appointment questions',
      archived: false,
      auditVisible: true,
    });
  });

  it('requires the thread creator and message sender to be participants', () => {
    expect(() => buildProjectThread({ jobId: 'job-1', createdBy: 'outsider', participantIds: ['client-1', 'bep-1'] })).toThrow(/creator must be a participant/);
    expect(() => buildProjectMessage({ threadId: 'thread-1', jobId: 'job-1', senderId: 'outsider', senderRole: 'client', participantIds: ['client-1', 'bep-1'], content: 'Hello' })).toThrow(/Only thread participants/);
  });

  it('sanitizes message content and fans out notification triggers to other participants', () => {
    const message = buildProjectMessage({
      threadId: 'thread-1',
      jobId: 'job-1',
      senderId: 'client-1',
      senderRole: 'client',
      participantIds: ['client-1', 'bep-1', 'admin-1'],
      content: '<script>alert(1)</script>Please review @bep',
      mentions: ['bep-1', 'missing-user', 'client-1'],
      attachments: [{ name: 'Brief.pdf', url: 'https://example.com/brief.pdf', type: 'application/pdf' }],
    });

    expect(message.content).toBe('Please review @bep');
    expect(message.auditVisible).toBe(true);
    expect(message.mentions).toEqual(['bep-1']);
    expect(message.notificationTriggers).toEqual([
      expect.objectContaining({ type: 'mention', recipientId: 'bep-1', title: 'You were mentioned' }),
      expect.objectContaining({ type: 'message_sent', recipientId: 'admin-1', title: 'New project message' }),
    ]);
    expect(message.notificationTriggers[0].data).toMatchObject({ threadId: 'thread-1', jobId: 'job-1', senderId: 'client-1' });
  });

  it('rejects empty sanitized messages', () => {
    expect(() => buildProjectMessage({ threadId: 'thread-1', jobId: 'job-1', senderId: 'client-1', senderRole: 'client', participantIds: ['client-1', 'bep-1'], content: '<script>alert(1)</script>' })).toThrow(/Message content cannot be empty/);
  });

  it('builds audit metadata for message thread visibility', () => {
    expect(buildCommunicationAuditInput({ actorId: 'client-1', action: 'project.message.sent', threadId: 'thread-1', jobId: 'job-1', projectId: 'project-1', messageId: 'message-1' })).toMatchObject({
      actorId: 'client-1',
      action: 'project.message.sent',
      resourceType: 'project_message_thread',
      resourceId: 'thread-1',
      projectId: 'project-1',
      jobId: 'job-1',
      metadata: { messageId: 'message-1', auditVisible: true },
    });
  });
});
