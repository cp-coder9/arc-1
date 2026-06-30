import { describe, it, expect } from 'vitest';
import {
  normalizeFieldIssueStatus,
  normalizeResponsibleParty,
  isValidFieldIssueStatus,
  guardStatusTransition,
  isPaymentBlocking,
  maintainPaymentBlocking,
  isTerminalStatus,
  snagToFieldIssue,
  ncrToFieldIssue,
  inspectionToFieldIssue,
  toFieldIssues,
  DEFAULT_FIELD_ISSUE_STATUS,
  UNASSIGNED_RESPONSIBLE_PARTY,
} from './fieldIssueService';
import { SNAG_STATUSES, isValidSnagTransition, snagBlocksPayment } from './snagService';
import type { SnagStatus, Severity, SnagItem, NonConformanceReport, InspectionRecord } from '@/types';

describe('fieldIssueService — status & responsible-party normalization', () => {
  describe('isValidFieldIssueStatus', () => {
    it('accepts every canonical snag status', () => {
      for (const status of SNAG_STATUSES) {
        expect(isValidFieldIssueStatus(status)).toBe(true);
      }
    });

    it('rejects values outside the enum', () => {
      expect(isValidFieldIssueStatus('in_progress')).toBe(false);
      expect(isValidFieldIssueStatus('OPEN')).toBe(false);
      expect(isValidFieldIssueStatus('')).toBe(false);
      expect(isValidFieldIssueStatus(undefined)).toBe(false);
      expect(isValidFieldIssueStatus(42)).toBe(false);
    });
  });

  describe('normalizeResponsibleParty', () => {
    it('defaults to unassigned when omitted or empty', () => {
      expect(normalizeResponsibleParty()).toBe(UNASSIGNED_RESPONSIBLE_PARTY);
      expect(normalizeResponsibleParty(null)).toBe(UNASSIGNED_RESPONSIBLE_PARTY);
      expect(normalizeResponsibleParty('')).toBe(UNASSIGNED_RESPONSIBLE_PARTY);
      expect(normalizeResponsibleParty('   ')).toBe(UNASSIGNED_RESPONSIBLE_PARTY);
    });

    it('preserves and trims a provided party', () => {
      expect(normalizeResponsibleParty('user-123')).toBe('user-123');
      expect(normalizeResponsibleParty('  user-123  ')).toBe('user-123');
    });
  });

  describe('normalizeFieldIssueStatus — creation', () => {
    it('defaults status to open when none supplied', () => {
      const result = normalizeFieldIssueStatus({});
      expect(result.ok).toBe(true);
      expect(result.value?.status).toBe(DEFAULT_FIELD_ISSUE_STATUS);
      expect(result.value?.status).toBe('open');
    });

    it('defaults responsible party to unassigned when none supplied', () => {
      const result = normalizeFieldIssueStatus({ status: 'open' });
      expect(result.ok).toBe(true);
      expect(result.value?.responsiblePartyId).toBe(UNASSIGNED_RESPONSIBLE_PARTY);
    });

    it('accepts a valid status and party on creation', () => {
      const result = normalizeFieldIssueStatus({ status: 'allocated', responsiblePartyId: 'sub-7' });
      expect(result.ok).toBe(true);
      expect(result.value).toEqual({ status: 'allocated', responsiblePartyId: 'sub-7' });
    });

    it('rejects an out-of-enum status by name on creation', () => {
      const result = normalizeFieldIssueStatus({ status: 'archived' });
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('invalid_status');
      expect(result.error?.invalidValue).toBe('archived');
      expect(result.error?.message).toContain('archived');
      expect(result.value).toBeUndefined();
    });
  });

  describe('normalizeFieldIssueStatus — update', () => {
    it('preserves existing status when none supplied', () => {
      const result = normalizeFieldIssueStatus({ responsiblePartyId: 'eng-2' }, 'allocated');
      expect(result.ok).toBe(true);
      expect(result.value?.status).toBe('allocated');
      expect(result.value?.responsiblePartyId).toBe('eng-2');
    });

    it('accepts a valid new status on update', () => {
      const result = normalizeFieldIssueStatus({ status: 'closed' }, 'ready_for_reinspection');
      expect(result.ok).toBe(true);
      expect(result.value?.status).toBe('closed');
    });

    it('rejects an invalid status and preserves the existing status', () => {
      const result = normalizeFieldIssueStatus({ status: 'bogus' }, 'allocated');
      expect(result.ok).toBe(false);
      expect(result.error?.invalidValue).toBe('bogus');
      expect(result.preservedStatus).toBe('allocated');
    });
  });

  describe('guardStatusTransition', () => {
    it('permits every transition allowed by the snag state machine', () => {
      const allowed: Array<[SnagStatus, SnagStatus]> = [
        ['open', 'allocated'],
        ['open', 'rejected'],
        ['allocated', 'ready_for_reinspection'],
        ['allocated', 'rejected'],
        ['ready_for_reinspection', 'closed'],
        ['ready_for_reinspection', 'allocated'],
        ['rejected', 'open'],
      ];
      for (const [from, to] of allowed) {
        const result = guardStatusTransition(from, to);
        expect(result.ok).toBe(true);
        expect(result.value).toBe(to);
        expect(result.error).toBeUndefined();
      }
    });

    it('rejects a disallowed transition naming source and target, preserving source', () => {
      const result = guardStatusTransition('open', 'closed');
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('invalid_transition');
      expect(result.error?.from).toBe('open');
      expect(result.error?.to).toBe('closed');
      expect(result.error?.message).toContain('open');
      expect(result.error?.message).toContain('closed');
      expect(result.preservedStatus).toBe('open');
      expect(result.value).toBeUndefined();
    });

    it('rejects transitions out of terminal closed status', () => {
      for (const to of SNAG_STATUSES) {
        const result = guardStatusTransition('closed', to);
        expect(result.ok).toBe(false);
        expect(result.preservedStatus).toBe('closed');
      }
    });

    it('permits a transition iff isValidSnagTransition agrees (exhaustive)', () => {
      for (const from of SNAG_STATUSES) {
        for (const to of SNAG_STATUSES) {
          const result = guardStatusTransition(from, to);
          expect(result.ok).toBe(isValidSnagTransition(from, to));
          if (!result.ok) {
            expect(result.preservedStatus).toBe(from);
          }
        }
      }
    });
  });
});

describe('fieldIssueService — payment-blocking flag maintenance', () => {
  const SEVERITIES: Severity[] = ['low', 'medium', 'high', 'critical'];

  describe('isTerminalStatus', () => {
    it('treats closed and rejected as terminal', () => {
      expect(isTerminalStatus('closed')).toBe(true);
      expect(isTerminalStatus('rejected')).toBe(true);
    });

    it('treats active statuses as non-terminal', () => {
      expect(isTerminalStatus('open')).toBe(false);
      expect(isTerminalStatus('allocated')).toBe(false);
      expect(isTerminalStatus('ready_for_reinspection')).toBe(false);
    });
  });

  describe('isPaymentBlocking', () => {
    it('blocks for high/critical severity in a non-terminal status', () => {
      expect(isPaymentBlocking('high', 'open')).toBe(true);
      expect(isPaymentBlocking('high', 'allocated')).toBe(true);
      expect(isPaymentBlocking('critical', 'ready_for_reinspection')).toBe(true);
    });

    it('does not block for low/medium severity regardless of status', () => {
      expect(isPaymentBlocking('low', 'open')).toBe(false);
      expect(isPaymentBlocking('medium', 'allocated')).toBe(false);
    });

    it('clears blocking once status is closed or rejected, even at high/critical', () => {
      expect(isPaymentBlocking('high', 'closed')).toBe(false);
      expect(isPaymentBlocking('critical', 'closed')).toBe(false);
      expect(isPaymentBlocking('high', 'rejected')).toBe(false);
      expect(isPaymentBlocking('critical', 'rejected')).toBe(false);
    });

    it('matches the invariant (blocking iff snagBlocksPayment and non-terminal) exhaustively', () => {
      for (const severity of SEVERITIES) {
        for (const status of SNAG_STATUSES) {
          const expected =
            snagBlocksPayment(severity) && status !== 'closed' && status !== 'rejected';
          expect(isPaymentBlocking(severity, status)).toBe(expected);
        }
      }
    });
  });

  describe('maintainPaymentBlocking', () => {
    it('signals create when a non-blocking issue becomes blocking', () => {
      const result = maintainPaymentBlocking({ severity: 'critical', status: 'open', blocksPayment: false });
      expect(result.blocksPayment).toBe(true);
      expect(result.blockerAction).toBe('create');
    });

    it('signals clear on transition to closed for a previously blocking issue', () => {
      const result = maintainPaymentBlocking({ severity: 'high', status: 'closed', blocksPayment: true });
      expect(result.blocksPayment).toBe(false);
      expect(result.blockerAction).toBe('clear');
    });

    it('signals clear on transition to rejected for a previously blocking issue', () => {
      const result = maintainPaymentBlocking({ severity: 'critical', status: 'rejected', blocksPayment: true });
      expect(result.blocksPayment).toBe(false);
      expect(result.blockerAction).toBe('clear');
    });

    it('signals none when the blocking state is unchanged', () => {
      const stillBlocking = maintainPaymentBlocking({ severity: 'high', status: 'allocated', blocksPayment: true });
      expect(stillBlocking.blocksPayment).toBe(true);
      expect(stillBlocking.blockerAction).toBe('none');

      const stillClear = maintainPaymentBlocking({ severity: 'low', status: 'open', blocksPayment: false });
      expect(stillClear.blocksPayment).toBe(false);
      expect(stillClear.blockerAction).toBe('none');
    });

    it('defaults the previous flag to false when omitted', () => {
      const result = maintainPaymentBlocking({ severity: 'high', status: 'open' });
      expect(result.blocksPayment).toBe(true);
      expect(result.blockerAction).toBe('create');

      const nonBlocking = maintainPaymentBlocking({ severity: 'low', status: 'open' });
      expect(nonBlocking.blocksPayment).toBe(false);
      expect(nonBlocking.blockerAction).toBe('none');
    });
  });
});

describe('fieldIssueService — FieldIssue normalizing adapter', () => {
  const makeSnag = (overrides: Partial<SnagItem> = {}): SnagItem => ({
    id: 'snag-1',
    projectId: 'proj-1',
    location: 'Level 2, Room 204',
    description: 'Cracked tile',
    priority: 'high',
    responsiblePartyId: 'sub-9',
    dueDate: '2026-07-01',
    evidenceIds: ['ev-1'],
    status: 'allocated',
    blocksPayment: true,
    drawingPin: { drawingId: 'A-101', x: 0.4, y: 0.6 },
    createdBy: 'sm-1',
    createdAt: '2026-06-01T08:00:00.000Z',
    updatedAt: '2026-06-02T09:00:00.000Z',
    ...overrides,
  });

  const makeNcr = (overrides: Partial<NonConformanceReport> = {}): NonConformanceReport => ({
    id: 'ncr-1',
    projectId: 'proj-1',
    title: 'Non-compliant rebar spacing',
    description: 'Rebar spacing exceeds tolerance',
    severity: 'critical',
    responsiblePartyId: 'con-3',
    correctiveAction: 'Re-tie rebar',
    evidenceIds: ['ev-2', 'ev-3'],
    status: 'open',
    blocksPayment: true,
    createdBy: 'eng-1',
    createdAt: '2026-06-03T10:00:00.000Z',
    updatedAt: '2026-06-04T11:00:00.000Z',
    ...overrides,
  });

  const makeInspection = (overrides: Partial<InspectionRecord> = {}): InspectionRecord => ({
    id: 'insp-1',
    projectId: 'proj-1',
    type: 'concrete_pour',
    inspector: 'eng-2',
    date: '2026-06-05',
    location: 'Foundation, Grid B',
    findings: 'Honeycombing observed at column base',
    status: 'failed',
    evidenceIds: ['ev-4'],
    createdAt: '2026-06-05T12:00:00.000Z',
    ...overrides,
  });

  describe('snagToFieldIssue', () => {
    it('maps a snag into the uniform shape preserving status, pin and payment flag', () => {
      const issue = snagToFieldIssue(makeSnag());
      expect(issue).toEqual({
        id: 'snag-1',
        projectId: 'proj-1',
        sourceType: 'snag',
        status: 'allocated',
        severity: 'high',
        responsiblePartyId: 'sub-9',
        location: 'Level 2, Room 204',
        drawingPin: { drawingId: 'A-101', x: 0.4, y: 0.6 },
        description: 'Cracked tile',
        blocksPayment: true,
        evidenceIds: ['ev-1'],
        createdAt: '2026-06-01T08:00:00.000Z',
        updatedAt: '2026-06-02T09:00:00.000Z',
      });
    });

    it('defaults a missing responsible party to unassigned', () => {
      const issue = snagToFieldIssue(makeSnag({ responsiblePartyId: '' }));
      expect(issue.responsiblePartyId).toBe(UNASSIGNED_RESPONSIBLE_PARTY);
    });

    it('coerces an out-of-enum snag status to open', () => {
      const issue = snagToFieldIssue(makeSnag({ status: 'in_progress' }));
      expect(issue.status).toBe('open');
    });
  });

  describe('ncrToFieldIssue', () => {
    it('maps an NCR, normalizing lifecycle status onto the snag enum', () => {
      const issue = ncrToFieldIssue(makeNcr({ status: 'corrective_action_submitted' }));
      expect(issue.sourceType).toBe('ncr');
      expect(issue.status).toBe('ready_for_reinspection');
      expect(issue.severity).toBe('critical');
      expect(issue.responsiblePartyId).toBe('con-3');
      expect(issue.location).toBe('Non-compliant rebar spacing');
      expect(issue.description).toBe('Rebar spacing exceeds tolerance');
      expect(issue.blocksPayment).toBe(true);
      expect(issue.evidenceIds).toEqual(['ev-2', 'ev-3']);
      expect(issue.drawingPin).toBeUndefined();
    });

    it('maps verified_closed and rejected onto terminal snag statuses', () => {
      expect(ncrToFieldIssue(makeNcr({ status: 'verified_closed' })).status).toBe('closed');
      expect(ncrToFieldIssue(makeNcr({ status: 'rejected' })).status).toBe('rejected');
      expect(ncrToFieldIssue(makeNcr({ status: 'open' })).status).toBe('open');
    });

    it('coerces an unrecognized NCR status to open', () => {
      const issue = ncrToFieldIssue(makeNcr({ status: 'something_else' }));
      expect(issue.status).toBe('open');
    });
  });

  describe('inspectionToFieldIssue', () => {
    it('maps a failed inspection into an open, unassigned, default-severity issue', () => {
      const issue = inspectionToFieldIssue(makeInspection());
      expect(issue.sourceType).toBe('inspection');
      expect(issue.status).toBe('open');
      expect(issue.severity).toBe('medium');
      expect(issue.responsiblePartyId).toBe(UNASSIGNED_RESPONSIBLE_PARTY);
      expect(issue.location).toBe('Foundation, Grid B');
      expect(issue.description).toBe('Honeycombing observed at column base');
      expect(issue.evidenceIds).toEqual(['ev-4']);
      // medium severity never blocks payment
      expect(issue.blocksPayment).toBe(false);
      // no updatedAt on source → falls back to createdAt
      expect(issue.updatedAt).toBe(issue.createdAt);
    });

    it('maps passed/completed inspections onto closed', () => {
      expect(inspectionToFieldIssue(makeInspection({ status: 'passed' })).status).toBe('closed');
      expect(inspectionToFieldIssue(makeInspection({ status: 'completed' })).status).toBe('closed');
      expect(inspectionToFieldIssue(makeInspection({ status: 'scheduled' })).status).toBe('open');
    });
  });

  describe('toFieldIssues', () => {
    it('produces a uniform list across all source record types', () => {
      const issues = toFieldIssues({
        snags: [makeSnag()],
        ncrs: [makeNcr()],
        inspections: [makeInspection()],
      });
      expect(issues).toHaveLength(3);
      expect(issues.map(i => i.sourceType)).toEqual(['snag', 'ncr', 'inspection']);
      // Every normalized issue exposes the same uniform key set
      for (const issue of issues) {
        expect(isValidFieldIssueStatus(issue.status)).toBe(true);
        expect(typeof issue.id).toBe('string');
        expect(typeof issue.responsiblePartyId).toBe('string');
        expect(typeof issue.severity).toBe('string');
        expect(typeof issue.location).toBe('string');
        expect(typeof issue.blocksPayment).toBe('boolean');
      }
    });

    it('handles missing source arrays as empty', () => {
      expect(toFieldIssues({})).toEqual([]);
      expect(toFieldIssues({ snags: [makeSnag()] })).toHaveLength(1);
    });
  });
});
