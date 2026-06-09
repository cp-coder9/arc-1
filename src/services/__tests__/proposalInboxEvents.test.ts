import {
  generateProposalInboxEvents,
  inboxEventsForRole,
  sortInboxEventsByPriority,
} from '../proposalInboxEvents';
import type { InboxEvent } from '../proposalInboxEvents';

const baseContext = {
  projectId: 'proj-1',
  proposalId: 'prop-1',
  status: 'draft' as const,
  payeeRole: 'architect',
  clientUserId: 'client-1',
  professionalUserId: 'prof-1',
};

describe('proposalInboxEvents', () => {
  describe('generateProposalInboxEvents', () => {
    it('generates terms review event when standard terms text is substantial', () => {
      const events = generateProposalInboxEvents(
        { ...baseContext, status: 'terms_attached' },
        { standardTermsText: 'A'.repeat(200), termsTemplateId: 'test-template' },
      );
      expect(events.some((e) => e.id.includes('terms-review'))).toBe(true);
    });

    it('generates discount reason missing event', () => {
      const events = generateProposalInboxEvents(
        baseContext,
        undefined,
        '',
      );
      expect(events.some((e) => e.id.includes('discount-reason'))).toBe(true);
    });

    it('does not generate discount event when reason is present', () => {
      const events = generateProposalInboxEvents(
        baseContext,
        undefined,
        'Promotional discount',
      );
      expect(events.some((e) => e.id.includes('discount-reason'))).toBe(false);
    });

    it('generates ready-for-review event at professional_approved', () => {
      const events = generateProposalInboxEvents({
        ...baseContext,
        status: 'professional_approved',
      });
      expect(events.some((e) => e.id.includes('ready-for-review'))).toBe(true);
    });

    it('generates issued event for client', () => {
      const events = generateProposalInboxEvents({
        ...baseContext,
        status: 'issued',
      });
      const issuedEvent = events.find((e) => e.id.includes('-issued'));
      expect(issuedEvent).toBeDefined();
      expect(issuedEvent!.priority).toBe('high');
      expect(issuedEvent!.assignedRoles).toContain('client');
      expect(issuedEvent!.expiresAt).toBeDefined();
    });

    it('generates accepted event', () => {
      const events = generateProposalInboxEvents({
        ...baseContext,
        status: 'accepted',
      });
      const acceptedEvent = events.find((e) => e.id.includes('-accepted'));
      expect(acceptedEvent).toBeDefined();
      expect(acceptedEvent!.assignedRoles).toContain('architect');
    });

    it('generates expiring event when issued with validity period', () => {
      const events = generateProposalInboxEvents(
        { ...baseContext, status: 'issued' },
        { validityPeriodDays: 14 },
      );
      const expiringEvent = events.find((e) => e.id.includes('expiring'));
      expect(expiringEvent).toBeDefined();
      expect(expiringEvent!.priority).toBe('medium');
    });
  });

  describe('inboxEventsForRole', () => {
    it('filters events by assigned role', () => {
      const events: InboxEvent[] = [
        {
          id: 'e1', type: 'proposal_issued', actor: 'proposal_agent',
          projectId: 'p1', proposalId: 'p1', message: 'For client',
          priority: 'high', assignedRoles: ['client'], createdAt: new Date().toISOString(),
        },
        {
          id: 'e2', type: 'proposal_issued', actor: 'proposal_agent',
          projectId: 'p1', proposalId: 'p1', message: 'For architect',
          priority: 'medium', assignedRoles: ['architect'], createdAt: new Date().toISOString(),
        },
      ];
      expect(inboxEventsForRole(events, 'client')).toHaveLength(1);
      expect(inboxEventsForRole(events, 'architect')).toHaveLength(1);
    });
  });

  describe('sortInboxEventsByPriority', () => {
    it('sorts critical first, low last', () => {
      const events: InboxEvent[] = [
        { id: 'low', type: 'proposal_generated', actor: 'proposal_agent', projectId: 'p', proposalId: 'p', message: '', priority: 'low', assignedRoles: [], createdAt: '' },
        { id: 'high', type: 'proposal_generated', actor: 'proposal_agent', projectId: 'p', proposalId: 'p', message: '', priority: 'high', assignedRoles: [], createdAt: '' },
        { id: 'critical', type: 'proposal_generated', actor: 'proposal_agent', projectId: 'p', proposalId: 'p', message: '', priority: 'critical', assignedRoles: [], createdAt: '' },
        { id: 'medium', type: 'proposal_generated', actor: 'proposal_agent', projectId: 'p', proposalId: 'p', message: '', priority: 'medium', assignedRoles: [], createdAt: '' },
      ];
      const sorted = sortInboxEventsByPriority(events);
      expect(sorted[0].id).toBe('critical');
      expect(sorted[1].id).toBe('high');
      expect(sorted[2].id).toBe('medium');
      expect(sorted[3].id).toBe('low');
    });
  });
});
