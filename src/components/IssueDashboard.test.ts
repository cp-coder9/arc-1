import { describe, it, expect } from 'vitest';
import { filterIssues, computeStatusCounts, SNAG_STATUSES } from './IssueDashboard';
import type { SnagItem, Severity, SnagStatus } from '@/types';
import type { DashboardFilters, StatusCounts } from './IssueDashboard';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeIssue(overrides: Partial<SnagItem> = {}): SnagItem {
  return {
    id: overrides.id ?? 'issue-1',
    projectId: 'project-1',
    location: 'Level 1 passage',
    description: 'Test issue',
    priority: 'medium' as Severity,
    responsiblePartyId: 'user-a',
    dueDate: '2026-07-01',
    evidenceIds: [],
    status: 'open' as SnagStatus,
    blocksPayment: false,
    createdBy: 'admin',
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

const emptyFilters: DashboardFilters = {
  status: '',
  severity: '',
  responsibleParty: '',
  lifecycleStage: '',
};

// ---------------------------------------------------------------------------
// filterIssues tests
// ---------------------------------------------------------------------------

describe('filterIssues', () => {
  const issues: SnagItem[] = [
    makeIssue({ id: '1', status: 'open', priority: 'high', responsiblePartyId: 'alice' }),
    makeIssue({ id: '2', status: 'allocated', priority: 'medium', responsiblePartyId: 'bob' }),
    makeIssue({ id: '3', status: 'closed', priority: 'low', responsiblePartyId: 'alice' }),
    makeIssue({ id: '4', status: 'open', priority: 'critical', responsiblePartyId: 'charlie' }),
    makeIssue({ id: '5', status: 'rejected', priority: 'medium', responsiblePartyId: 'bob' }),
  ];

  it('returns all issues when no filters are applied', () => {
    const result = filterIssues(issues, emptyFilters);
    expect(result).toHaveLength(5);
  });

  it('filters by status only', () => {
    const result = filterIssues(issues, { ...emptyFilters, status: 'open' });
    expect(result).toHaveLength(2);
    expect(result.every((i) => i.status === 'open')).toBe(true);
  });

  it('filters by severity only', () => {
    const result = filterIssues(issues, { ...emptyFilters, severity: 'medium' });
    expect(result).toHaveLength(2);
    expect(result.every((i) => i.priority === 'medium')).toBe(true);
  });

  it('filters by responsible party only', () => {
    const result = filterIssues(issues, { ...emptyFilters, responsibleParty: 'alice' });
    expect(result).toHaveLength(2);
    expect(result.every((i) => i.responsiblePartyId === 'alice')).toBe(true);
  });

  it('applies AND logic across multiple filters', () => {
    const result = filterIssues(issues, {
      ...emptyFilters,
      status: 'open',
      severity: 'high',
      responsibleParty: 'alice',
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('returns empty array when no issues match all filters', () => {
    const result = filterIssues(issues, {
      ...emptyFilters,
      status: 'closed',
      severity: 'critical',
    });
    expect(result).toHaveLength(0);
  });

  it('handles empty issues array', () => {
    const result = filterIssues([], { ...emptyFilters, status: 'open' });
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// computeStatusCounts tests
// ---------------------------------------------------------------------------

describe('computeStatusCounts', () => {
  it('returns zero for all statuses when input is empty', () => {
    const counts = computeStatusCounts([]);
    expect(counts).toEqual({
      open: 0,
      allocated: 0,
      ready_for_reinspection: 0,
      closed: 0,
      rejected: 0,
    });
  });

  it('counts issues per status correctly', () => {
    const issues: SnagItem[] = [
      makeIssue({ id: '1', status: 'open' }),
      makeIssue({ id: '2', status: 'open' }),
      makeIssue({ id: '3', status: 'allocated' }),
      makeIssue({ id: '4', status: 'closed' }),
      makeIssue({ id: '5', status: 'closed' }),
      makeIssue({ id: '6', status: 'closed' }),
      makeIssue({ id: '7', status: 'rejected' }),
    ];
    const counts = computeStatusCounts(issues);
    expect(counts).toEqual({
      open: 2,
      allocated: 1,
      ready_for_reinspection: 0,
      closed: 3,
      rejected: 1,
    });
  });

  it('shows zero for statuses with no matching issues', () => {
    const issues: SnagItem[] = [
      makeIssue({ id: '1', status: 'open' }),
    ];
    const counts = computeStatusCounts(issues);
    expect(counts.allocated).toBe(0);
    expect(counts.ready_for_reinspection).toBe(0);
    expect(counts.closed).toBe(0);
    expect(counts.rejected).toBe(0);
    expect(counts.open).toBe(1);
  });

  it('counts all five statuses', () => {
    const issues: SnagItem[] = SNAG_STATUSES.map((status, i) =>
      makeIssue({ id: `${i}`, status }),
    );
    const counts = computeStatusCounts(issues);
    expect(counts.open).toBe(1);
    expect(counts.allocated).toBe(1);
    expect(counts.ready_for_reinspection).toBe(1);
    expect(counts.closed).toBe(1);
    expect(counts.rejected).toBe(1);
  });
});
