import { describe, expect, it } from 'vitest';
import type { Job, Message } from '../../types';
import { buildProjectCommunicationCentreModel } from '../projectCommunicationCentreService';

const jobs: Job[] = [
  { id: 'job-1', clientId: 'client-1', title: 'House renovation', description: 'Renovation', requirements: [], deadline: '2026-06-01', budget: 1000, category: 'Renovation', status: 'in-progress', createdAt: '2026-05-01T08:00:00.000Z' },
  { id: 'job-2', clientId: 'client-2', title: 'Office fitout', description: 'Commercial', requirements: [], deadline: '2026-06-10', budget: 2000, category: 'Commercial', status: 'open', createdAt: '2026-05-02T08:00:00.000Z' },
];

const messages: Message[] = [
  { id: 'm-1', jobId: 'job-1', projectId: 'project-1', phase: 'delivery', captureType: 'site_photo', structuredStatus: 'raw', senderId: 'contractor-1', senderRole: 'contractor', content: 'Waterproofing membrane photo uploaded. Please inspect before tiling tomorrow.', attachments: [{ name: 'photo.jpg', url: 'https://example.com/photo.jpg', type: 'image/jpeg' }], isRead: false, createdAt: '2026-05-30T09:00:00.000Z' },
  { id: 'm-2', jobId: 'job-1', projectId: 'project-1', phase: 'delivery', captureType: 'rfi', structuredStatus: 'linked', recordLinks: [{ recordType: 'rfi', recordId: 'rfi-1' }], senderId: 'bep-1', senderRole: 'bep', content: 'RFI linked to detail drawing.', attachments: [], isRead: true, createdAt: '2026-05-30T10:00:00.000Z' },
  { id: 'm-3', jobId: 'job-2', senderId: 'client-2', senderRole: 'client', content: 'Legacy message before project metadata.', attachments: [], isRead: false, createdAt: '2026-05-30T08:00:00.000Z' },
];

describe('projectCommunicationCentreService', () => {
  it('builds desktop/mobile communication centre cards with phase, project, attachment, and AI governance state', () => {
    const model = buildProjectCommunicationCentreModel({ jobs, messages, selectedJobId: 'job-1' });

    expect(model.selectedJob?.id).toBe('job-1');
    expect(model.threadCards).toHaveLength(2);
    expect(model.threadCards[0]).toMatchObject({
      id: 'm-2',
      jobTitle: 'House renovation',
      phase: 'delivery',
      captureType: 'rfi',
      structuredStatus: 'linked',
      linkedRecordCount: 1,
      attachmentCount: 0,
      requiresHumanApproval: false,
    });
    expect(model.threadCards[1]).toMatchObject({
      id: 'm-1',
      phase: 'delivery',
      captureType: 'site_photo',
      structuredStatus: 'raw',
      attachmentCount: 1,
      requiresHumanApproval: true,
      suggestedConversionRoutes: expect.arrayContaining(['site_log', 'snag_item']),
    });
    expect(model.summary).toMatchObject({ totalMessages: 3, unconvertedMessages: 2, unreadMessages: 2, attachmentMessages: 1, humanApprovalQueue: 1 });
  });

  it('keeps old job messages visible with safe legacy defaults instead of dropping them', () => {
    const model = buildProjectCommunicationCentreModel({ jobs, messages, selectedJobId: 'job-2' });

    expect(model.threadCards).toHaveLength(1);
    expect(model.threadCards[0]).toMatchObject({
      id: 'm-3',
      jobTitle: 'Office fitout',
      phase: 'intake',
      captureType: 'chat',
      structuredStatus: 'raw',
      visibility: 'job_participants',
      legacyFallback: true,
      requiresHumanApproval: false,
    });
  });

  it('filters by phase, capture type, and search text for the desktop message centre', () => {
    const model = buildProjectCommunicationCentreModel({ jobs, messages, filters: { phase: 'delivery', captureType: 'site_photo', search: 'waterproofing' } });

    expect(model.threadCards.map(card => card.id)).toEqual(['m-1']);
  });
});
