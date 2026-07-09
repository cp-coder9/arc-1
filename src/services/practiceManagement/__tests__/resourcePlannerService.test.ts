/**
 * Unit tests for ResourcePlannerService
 *
 * Tests capacity calculation, over-allocation detection, forward-looking views,
 * and pipeline impact layer.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

import {
  getCapacityView,
  getPersonCapacity,
  getOverAllocated,
  generateWeekStarts,
  calculateLeaveHoursForWeek,
  calculateHolidayHoursForWeek,
  calculateAllocatedHoursForWeek,
  calculatePipelineImpactForWeek,
  STANDARD_WEEKLY_HOURS,
  STANDARD_DAILY_HOURS,
} from '../resourcePlannerService';
import type {
  TeamMember,
  ResourceAllocation,
  CapacityViewConfig,
} from '../resourcePlannerService';
import type {
  LeaveRequest,
  PipelineOpportunity,
} from '../types';

// ─── Test Fixtures ───────────────────────────────────────────────────────────

const baseMember: TeamMember = {
  userId: 'user-1',
  displayName: 'Alice Architect',
  role: 'architect',
};

const baseAllocation: ResourceAllocation = {
  userId: 'user-1',
  projectId: 'proj-1',
  hoursPerWeek: 20,
  startDate: '2025-01-06',
  endDate: '2025-03-28',
};

const baseLeave: LeaveRequest = {
  id: 'leave-1',
  firmId: 'firm-1',
  userId: 'user-1',
  leaveType: 'annual',
  startDate: '2025-01-13',
  endDate: '2025-01-17',
  workingDays: 5,
  status: 'approved',
  approvedBy: 'approver-1',
  approvedAt: '2025-01-10T10:00:00Z',
  createdAt: '2025-01-08T10:00:00Z',
  updatedAt: '2025-01-10T10:00:00Z',
};

const basePipelineOpportunity: PipelineOpportunity = {
  id: 'opp-1',
  firmId: 'firm-1',
  projectId: 'pipeline-proj-1',
  title: 'New Office Block',
  estimatedFeeCents: 500000_00,
  probability: 80,
  requiredDisciplines: ['architect', 'technologist'],
  requiredHeadcount: 2,
  expectedStartDate: '2025-01-06',
  isHighConfidence: true,
  includedInCapacity: true,
  weightedValueCents: 400000_00,
  // PipelineProject fields (minimal for testing)
  status: 'active',
  createdAt: '2024-12-01T00:00:00Z',
  updatedAt: '2024-12-15T00:00:00Z',
} as unknown as PipelineOpportunity;

// ─── generateWeekStarts ──────────────────────────────────────────────────────

describe('generateWeekStarts', () => {
  it('generates correct number of week starts', () => {
    const weeks = generateWeekStarts(4, '2025-01-06');
    expect(weeks).toHaveLength(4);
  });

  it('generates consecutive Mondays', () => {
    const weeks = generateWeekStarts(4, '2025-01-06');
    expect(weeks).toEqual([
      '2025-01-06',
      '2025-01-13',
      '2025-01-20',
      '2025-01-27',
    ]);
  });

  it('supports 8-week view', () => {
    const weeks = generateWeekStarts(8, '2025-01-06');
    expect(weeks).toHaveLength(8);
    expect(weeks[7]).toBe('2025-02-24');
  });

  it('supports 12-week view', () => {
    const weeks = generateWeekStarts(12, '2025-01-06');
    expect(weeks).toHaveLength(12);
    expect(weeks[11]).toBe('2025-03-24');
  });
});

// ─── calculateLeaveHoursForWeek ──────────────────────────────────────────────

describe('calculateLeaveHoursForWeek', () => {
  it('returns zero when no leave overlaps the week', () => {
    const hours = calculateLeaveHoursForWeek(
      [baseLeave],
      '2025-01-20', // week of Jan 20
      '2025-01-24',
    );
    expect(hours).toBe(0);
  });

  it('calculates full week leave hours correctly', () => {
    // Leave is Mon-Fri Jan 13-17, checking week of Jan 13
    const hours = calculateLeaveHoursForWeek(
      [baseLeave],
      '2025-01-13',
      '2025-01-17',
    );
    expect(hours).toBe(5 * STANDARD_DAILY_HOURS); // 40 hours
  });

  it('calculates partial week leave hours correctly', () => {
    // Leave starts Wed Jan 15 to Fri Jan 17 (3 working days)
    const partialLeave: LeaveRequest = {
      ...baseLeave,
      startDate: '2025-01-15',
      endDate: '2025-01-17',
      workingDays: 3,
    };
    const hours = calculateLeaveHoursForWeek(
      [partialLeave],
      '2025-01-13',
      '2025-01-17',
    );
    expect(hours).toBe(3 * STANDARD_DAILY_HOURS); // 24 hours
  });

  it('handles leave spanning multiple weeks (only counts overlap)', () => {
    // Leave spans two weeks: Jan 13 - Jan 24
    const twoWeekLeave: LeaveRequest = {
      ...baseLeave,
      startDate: '2025-01-13',
      endDate: '2025-01-24',
      workingDays: 10,
    };
    // Check first week only (Mon-Fri Jan 13-17)
    const hours = calculateLeaveHoursForWeek(
      [twoWeekLeave],
      '2025-01-13',
      '2025-01-17',
    );
    expect(hours).toBe(5 * STANDARD_DAILY_HOURS); // 40 hours for that week
  });
});

// ─── calculateHolidayHoursForWeek ────────────────────────────────────────────

describe('calculateHolidayHoursForWeek', () => {
  it('returns zero for a week with no public holidays', () => {
    // Week of Jan 6-10, 2025 — no SA public holidays
    const hours = calculateHolidayHoursForWeek('2025-01-06', '2025-01-10');
    expect(hours).toBe(0);
  });

  it('counts public holidays on working days', () => {
    // Workers' Day: May 1, 2025 is a Thursday (working day)
    // April 27, 2025 is a Sunday so Freedom Day does not reduce capacity
    // Check week of April 28 - May 2: only Workers' Day (May 1) counts
    const hours = calculateHolidayHoursForWeek('2025-04-28', '2025-05-02');
    expect(hours).toBe(1 * STANDARD_DAILY_HOURS);
  });
});

// ─── calculateAllocatedHoursForWeek ──────────────────────────────────────────

describe('calculateAllocatedHoursForWeek', () => {
  it('returns zero when no allocations overlap the week', () => {
    const hours = calculateAllocatedHoursForWeek(
      [{ ...baseAllocation, startDate: '2025-04-01', endDate: '2025-04-30' }],
      '2025-01-06',
      '2025-01-10',
    );
    expect(hours).toBe(0);
  });

  it('sums hours from overlapping allocations', () => {
    const allocations: ResourceAllocation[] = [
      { ...baseAllocation, hoursPerWeek: 20 },
      {
        userId: 'user-1',
        projectId: 'proj-2',
        hoursPerWeek: 16,
        startDate: '2025-01-01',
        endDate: '2025-03-31',
      },
    ];
    const hours = calculateAllocatedHoursForWeek(
      allocations,
      '2025-01-06',
      '2025-01-10',
    );
    expect(hours).toBe(36);
  });

  it('excludes allocations that end before the week', () => {
    const allocations: ResourceAllocation[] = [
      { ...baseAllocation, endDate: '2025-01-03' }, // ends before week
    ];
    const hours = calculateAllocatedHoursForWeek(
      allocations,
      '2025-01-06',
      '2025-01-10',
    );
    expect(hours).toBe(0);
  });
});

// ─── calculatePipelineImpactForWeek ──────────────────────────────────────────

describe('calculatePipelineImpactForWeek', () => {
  it('returns zero when no pipeline opportunities match', () => {
    const hours = calculatePipelineImpactForWeek(
      [],
      baseMember,
      '2025-01-06',
      '2025-01-10',
    );
    expect(hours).toBe(0);
  });

  it('includes hours from high-confidence pipeline matching member role', () => {
    const hours = calculatePipelineImpactForWeek(
      [basePipelineOpportunity],
      baseMember,
      '2025-01-06',
      '2025-01-10',
    );
    // headcount=2, so estimatedHoursPerPerson = 40/2 = 20
    expect(hours).toBe(STANDARD_WEEKLY_HOURS / 2);
  });

  it('excludes pipeline opportunities where role does not match', () => {
    const adminMember: TeamMember = {
      userId: 'user-2',
      displayName: 'Bob Admin',
      role: 'admin',
    };
    const hours = calculatePipelineImpactForWeek(
      [basePipelineOpportunity], // requires architect, technologist
      adminMember,
      '2025-01-06',
      '2025-01-10',
    );
    expect(hours).toBe(0);
  });

  it('excludes opportunities not flagged as high-confidence', () => {
    const lowConfidence = {
      ...basePipelineOpportunity,
      isHighConfidence: false,
    };
    const hours = calculatePipelineImpactForWeek(
      [lowConfidence],
      baseMember,
      '2025-01-06',
      '2025-01-10',
    );
    expect(hours).toBe(0);
  });

  it('excludes opportunities not included in capacity', () => {
    const notIncluded = {
      ...basePipelineOpportunity,
      includedInCapacity: false,
    };
    const hours = calculatePipelineImpactForWeek(
      [notIncluded],
      baseMember,
      '2025-01-06',
      '2025-01-10',
    );
    expect(hours).toBe(0);
  });

  it('excludes opportunities without an expected start date', () => {
    const noStartDate = {
      ...basePipelineOpportunity,
      expectedStartDate: undefined,
    };
    const hours = calculatePipelineImpactForWeek(
      [noStartDate],
      baseMember,
      '2025-01-06',
      '2025-01-10',
    );
    expect(hours).toBe(0);
  });
});

// ─── getPersonCapacity ───────────────────────────────────────────────────────

describe('getPersonCapacity', () => {
  it('calculates correct capacity for a person with no leave or allocations', () => {
    const weekStarts = ['2025-02-03']; // Week with no holidays
    const result = getPersonCapacity(
      baseMember,
      [],
      [],
      [],
      weekStarts,
    );

    expect(result.userId).toBe('user-1');
    expect(result.displayName).toBe('Alice Architect');
    expect(result.role).toBe('architect');
    expect(result.weeks).toHaveLength(1);
    expect(result.weeks[0].totalAvailableHours).toBe(STANDARD_WEEKLY_HOURS);
    expect(result.weeks[0].allocatedHours).toBe(0);
    expect(result.weeks[0].leaveHours).toBe(0);
    expect(result.weeks[0].remainingCapacity).toBe(STANDARD_WEEKLY_HOURS);
    expect(result.weeks[0].isOverAllocated).toBe(false);
    expect(result.weeks[0].pipelineImpactHours).toBe(0);
  });

  it('reduces available hours by leave hours', () => {
    // Week of Jan 13, member on leave Mon-Fri
    const weekStarts = ['2025-01-13'];
    const result = getPersonCapacity(
      baseMember,
      [],
      [baseLeave],
      [],
      weekStarts,
    );

    expect(result.weeks[0].leaveHours).toBe(5 * STANDARD_DAILY_HOURS);
    expect(result.weeks[0].totalAvailableHours).toBe(0);
    expect(result.weeks[0].remainingCapacity).toBe(0);
  });

  it('detects over-allocation when allocated exceeds available', () => {
    // Week of Feb 3 (no holidays, no leave). Allocate 48 hours on 40 available.
    const weekStarts = ['2025-02-03'];
    const allocations: ResourceAllocation[] = [
      {
        userId: 'user-1',
        projectId: 'proj-1',
        hoursPerWeek: 30,
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      },
      {
        userId: 'user-1',
        projectId: 'proj-2',
        hoursPerWeek: 18,
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      },
    ];

    const result = getPersonCapacity(
      baseMember,
      allocations,
      [],
      [],
      weekStarts,
    );

    expect(result.weeks[0].allocatedHours).toBe(48);
    expect(result.weeks[0].totalAvailableHours).toBe(STANDARD_WEEKLY_HOURS);
    expect(result.weeks[0].isOverAllocated).toBe(true);
    expect(result.weeks[0].remainingCapacity).toBe(STANDARD_WEEKLY_HOURS - 48);
  });

  it('detects over-allocation when available is zero due to leave', () => {
    // Full week leave + any allocation = over-allocated
    const weekStarts = ['2025-01-13'];
    const allocations: ResourceAllocation[] = [
      {
        userId: 'user-1',
        projectId: 'proj-1',
        hoursPerWeek: 8,
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      },
    ];

    const result = getPersonCapacity(
      baseMember,
      allocations,
      [baseLeave],
      [],
      weekStarts,
    );

    expect(result.weeks[0].totalAvailableHours).toBe(0);
    expect(result.weeks[0].allocatedHours).toBe(8);
    expect(result.weeks[0].isOverAllocated).toBe(true);
  });

  it('includes pipeline impact hours as a separate layer', () => {
    const weekStarts = ['2025-01-06'];
    const result = getPersonCapacity(
      baseMember,
      [],
      [],
      [basePipelineOpportunity],
      weekStarts,
    );

    expect(result.weeks[0].pipelineImpactHours).toBeGreaterThan(0);
    // Pipeline hours should NOT affect isOverAllocated (separate layer)
    expect(result.weeks[0].isOverAllocated).toBe(false);
  });

  it('respects custom standard weekly hours', () => {
    const partTimeMember: TeamMember = {
      ...baseMember,
      standardWeeklyHours: 20,
    };
    const weekStarts = ['2025-02-03'];
    const result = getPersonCapacity(partTimeMember, [], [], [], weekStarts);
    expect(result.weeks[0].totalAvailableHours).toBe(20);
  });
});

// ─── getOverAllocated ────────────────────────────────────────────────────────

describe('getOverAllocated', () => {
  it('returns empty array when no one is over-allocated', () => {
    const result = getOverAllocated(
      'firm-1',
      [baseMember],
      [{ ...baseAllocation, hoursPerWeek: 20 }],
      [],
      '2025-02-03',
    );
    expect(result).toHaveLength(0);
  });

  it('identifies over-allocated members', () => {
    const allocations: ResourceAllocation[] = [
      {
        userId: 'user-1',
        projectId: 'proj-1',
        hoursPerWeek: 30,
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      },
      {
        userId: 'user-1',
        projectId: 'proj-2',
        hoursPerWeek: 20,
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      },
    ];

    const result = getOverAllocated(
      'firm-1',
      [baseMember],
      allocations,
      [],
      '2025-02-03',
    );

    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe('user-1');
    expect(result[0].allocatedHours).toBe(50);
    expect(result[0].availableHours).toBe(STANDARD_WEEKLY_HOURS);
    expect(result[0].overBy).toBe(10);
  });

  it('flags over-allocation when available is zero due to leave', () => {
    const allocations: ResourceAllocation[] = [
      {
        userId: 'user-1',
        projectId: 'proj-1',
        hoursPerWeek: 5,
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      },
    ];

    const result = getOverAllocated(
      'firm-1',
      [baseMember],
      allocations,
      [baseLeave],
      '2025-01-13', // member on leave this week
    );

    expect(result).toHaveLength(1);
    expect(result[0].availableHours).toBe(0);
    expect(result[0].allocatedHours).toBe(5);
    expect(result[0].overBy).toBe(5);
  });

  it('returns correct overBy amount', () => {
    const allocations: ResourceAllocation[] = [
      {
        userId: 'user-1',
        projectId: 'proj-1',
        hoursPerWeek: 45,
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      },
    ];

    const result = getOverAllocated(
      'firm-1',
      [baseMember],
      allocations,
      [],
      '2025-02-03',
    );

    expect(result).toHaveLength(1);
    expect(result[0].overBy).toBe(5); // 45 - 40 = 5
  });
});

// ─── getCapacityView ─────────────────────────────────────────────────────────

describe('getCapacityView', () => {
  it('generates capacity view for multiple team members', () => {
    const teamMembers: TeamMember[] = [
      baseMember,
      { userId: 'user-2', displayName: 'Bob Technologist', role: 'technologist' },
    ];

    const allocations: ResourceAllocation[] = [
      { ...baseAllocation, userId: 'user-1', hoursPerWeek: 20 },
      {
        userId: 'user-2',
        projectId: 'proj-2',
        hoursPerWeek: 30,
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      },
    ];

    const config: CapacityViewConfig = { weeks: 4, startDate: '2025-02-03' };

    const result = getCapacityView(
      'firm-1',
      teamMembers,
      allocations,
      [],
      [],
      config,
    );

    expect(result.firmId).toBe('firm-1');
    expect(result.people).toHaveLength(2);
    expect(result.people[0].weeks).toHaveLength(4);
    expect(result.people[1].weeks).toHaveLength(4);
  });

  it('calculates firm-wide totals correctly', () => {
    const teamMembers: TeamMember[] = [
      baseMember,
      { userId: 'user-2', displayName: 'Bob Technologist', role: 'technologist' },
    ];

    const allocations: ResourceAllocation[] = [
      {
        userId: 'user-1',
        projectId: 'proj-1',
        hoursPerWeek: 20,
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      },
      {
        userId: 'user-2',
        projectId: 'proj-2',
        hoursPerWeek: 30,
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      },
    ];

    // Use a week with no holidays or leave for easy calculation
    const config: CapacityViewConfig = { weeks: 1, startDate: '2025-02-03' };

    const result = getCapacityView(
      'firm-1',
      teamMembers,
      allocations,
      [],
      [],
      config,
    );

    // 2 people × 1 week × 40 hours = 80 total available
    expect(result.firmTotalAvailable).toBe(80);
    // 20 + 30 = 50 total allocated
    expect(result.firmTotalAllocated).toBe(50);
    // 50/80 * 100 = 62.5%
    expect(result.firmUtilisationPercent).toBe(62.5);
  });

  it('handles zero available hours in utilisation calculation', () => {
    const config: CapacityViewConfig = { weeks: 1, startDate: '2025-01-13' };

    // Member fully on leave
    const result = getCapacityView(
      'firm-1',
      [baseMember],
      [],
      [baseLeave],
      [],
      config,
    );

    expect(result.firmTotalAvailable).toBe(0);
    expect(result.firmUtilisationPercent).toBe(0);
  });

  it('supports forward-looking 4, 8, 12 week views (Requirement 8.4)', () => {
    for (const weeks of [4, 8, 12] as const) {
      const config: CapacityViewConfig = { weeks, startDate: '2025-02-03' };
      const result = getCapacityView('firm-1', [baseMember], [], [], [], config);
      expect(result.people[0].weeks).toHaveLength(weeks);
    }
  });

  it('shows pipeline impact as separate layer from confirmed allocations (Requirement 8.5)', () => {
    const config: CapacityViewConfig = { weeks: 1, startDate: '2025-01-06' };

    const result = getCapacityView(
      'firm-1',
      [baseMember],
      [{ ...baseAllocation, hoursPerWeek: 20 }],
      [],
      [basePipelineOpportunity],
      config,
    );

    const week = result.people[0].weeks[0];
    expect(week.allocatedHours).toBe(20); // Confirmed allocation
    expect(week.pipelineImpactHours).toBeGreaterThan(0); // Pipeline layer
    // Pipeline does NOT increase allocatedHours
    expect(week.allocatedHours).toBe(20);
    // Over-allocation check only uses confirmed allocations vs available
    expect(week.isOverAllocated).toBe(false);
  });
});
