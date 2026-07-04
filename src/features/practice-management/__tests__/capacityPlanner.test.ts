// @vitest-environment node
/**
 * Capacity Planner Service — Unit Tests
 *
 * Tests for:
 * - calculateStaffUtilisation: formula, leave reduction, over-allocation, edge cases
 * - forecastCapacity: multi-week forecast, pipeline weighting, leave impact
 * - evaluateCapacityAlerts: firm >85% utilisation, over-allocation detection
 * - evaluateStaffOverAllocation: per-staff over-allocation flag
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7
 */

import { describe, it, expect } from 'vitest';
import {
  calculateStaffUtilisation,
  forecastCapacity,
  evaluateCapacityAlerts,
  evaluateStaffOverAllocation,
} from '../services/capacityPlanner';
import type {
  StaffMember,
  Allocation,
  LeaveRecord,
  EnquiryRecord,
} from '../types';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function makeStaff(overrides: Partial<StaffMember> = {}): StaffMember {
  return {
    id: 'staff-1',
    firmId: 'firm-1',
    userId: 'user-1',
    displayName: 'John Smith',
    discipline: 'architecture',
    availableHoursPerWeek: 40,
    clientChargeOutRate: 1500,
    internalCostRate: 800,
    ...overrides,
  };
}

function makeAllocation(overrides: Partial<Allocation> = {}): Allocation {
  return {
    id: 'alloc-1',
    firmId: 'firm-1',
    staffId: 'staff-1',
    projectId: 'proj-1',
    hoursPerWeek: 20,
    startDate: '2025-01-01',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeLeave(overrides: Partial<LeaveRecord> = {}): LeaveRecord {
  return {
    id: 'leave-1',
    firmId: 'firm-1',
    staffId: 'staff-1',
    startDate: '2025-03-17',
    endDate: '2025-03-21',
    leaveType: 'annual',
    createdAt: '2025-03-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeEnquiry(overrides: Partial<EnquiryRecord> = {}): EnquiryRecord {
  return {
    id: 'enq-1',
    firmId: 'firm-1',
    source: 'referral',
    clientName: 'Test Client',
    clientEmail: 'test@example.com',
    projectDescription: 'Test project',
    estimatedProjectValueZAR: 5000000,
    estimatedFeeValueZAR: 500000,
    discipline: 'architecture',
    enquiryDate: '2025-01-15',
    currentStage: 'quote_sent',
    stageHistory: [{ stage: 'lead', date: '2025-01-10', actor: 'user-1' }],
    lastActivityDate: '2025-01-15',
    createdBy: 'user-1',
    createdAt: '2025-01-10T00:00:00.000Z',
    updatedAt: '2025-01-15T00:00:00.000Z',
    ...overrides,
  };
}

// ─── calculateStaffUtilisation Tests ──────────────────────────────────────────

describe('calculateStaffUtilisation', () => {
  it('should calculate basic utilisation without leave', () => {
    const staff = makeStaff({ availableHoursPerWeek: 40 });
    const allocations = [makeAllocation({ hoursPerWeek: 20, startDate: '2025-01-01' })];
    const week = new Date('2025-03-10'); // A Monday

    const result = calculateStaffUtilisation(staff, allocations, [], week);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.staffId).toBe('staff-1');
    expect(result.data.availableHours).toBe(40);
    expect(result.data.allocatedHours).toBe(20);
    expect(result.data.availableCapacity).toBe(20);
    expect(result.data.utilisationPercentage).toBe(50);
  });

  it('should reduce available hours when staff is on leave (R12.7)', () => {
    const staff = makeStaff({ availableHoursPerWeek: 40 });
    const allocations = [makeAllocation({ hoursPerWeek: 20, startDate: '2025-01-01' })];
    // Leave for Mon-Fri of target week = 5 days × 8h/day = 40h leave
    const leave = [makeLeave({ startDate: '2025-03-10', endDate: '2025-03-14' })];
    const week = new Date('2025-03-10');

    const result = calculateStaffUtilisation(staff, allocations, leave, week);

    expect(result.success).toBe(true);
    if (!result.success) return;
    // Available should be 0 (40 - 40 leave hours)
    expect(result.data.availableHours).toBe(0);
    // Utilisation is 0 when available is 0
    expect(result.data.utilisationPercentage).toBe(0);
  });

  it('should handle partial leave in a week (R12.7)', () => {
    const staff = makeStaff({ availableHoursPerWeek: 40 });
    const allocations = [makeAllocation({ hoursPerWeek: 20, startDate: '2025-01-01' })];
    // Leave for 2 days (Mon-Tue) = 2 × 8 = 16h leave
    const leave = [makeLeave({ startDate: '2025-03-10', endDate: '2025-03-11' })];
    const week = new Date('2025-03-10');

    const result = calculateStaffUtilisation(staff, allocations, leave, week);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.availableHours).toBe(24); // 40 - 16
    expect(result.data.allocatedHours).toBe(20);
    expect(result.data.availableCapacity).toBe(4); // 24 - 20
    // 20 / 24 × 100 ≈ 83.33
    expect(result.data.utilisationPercentage).toBeCloseTo(83.33, 1);
  });

  it('should flag over-allocation (R12.6)', () => {
    const staff = makeStaff({ availableHoursPerWeek: 40 });
    const allocations = [
      makeAllocation({ id: 'a1', hoursPerWeek: 25, startDate: '2025-01-01' }),
      makeAllocation({ id: 'a2', staffId: 'staff-1', projectId: 'proj-2', hoursPerWeek: 20, startDate: '2025-01-01' }),
    ];
    const week = new Date('2025-03-10');

    const result = calculateStaffUtilisation(staff, allocations, [], week);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.allocatedHours).toBe(45);
    expect(result.data.availableCapacity).toBe(-5); // Over-allocated
    expect(result.data.utilisationPercentage).toBe(112.5); // 45/40 × 100
  });

  it('should handle no allocations', () => {
    const staff = makeStaff();
    const week = new Date('2025-03-10');

    const result = calculateStaffUtilisation(staff, [], [], week);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.allocatedHours).toBe(0);
    expect(result.data.availableCapacity).toBe(40);
    expect(result.data.utilisationPercentage).toBe(0);
  });

  it('should only include allocations active in the given week', () => {
    const staff = makeStaff();
    const allocations = [
      // Ended before target week
      makeAllocation({ id: 'a1', hoursPerWeek: 10, startDate: '2025-01-01', endDate: '2025-03-05' }),
      // Active during target week
      makeAllocation({ id: 'a2', hoursPerWeek: 15, startDate: '2025-03-01' }),
      // Starts after target week
      makeAllocation({ id: 'a3', hoursPerWeek: 20, startDate: '2025-03-20' }),
    ];
    const week = new Date('2025-03-10'); // Mon 10 March 2025

    const result = calculateStaffUtilisation(staff, allocations, [], week);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.allocatedHours).toBe(15); // Only active allocation
  });

  it('should reject invalid staff', () => {
    const result = calculateStaffUtilisation(null as unknown as StaffMember, [], [], new Date());
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('INVALID_STAFF');
  });

  it('should reject invalid date', () => {
    const staff = makeStaff();
    const result = calculateStaffUtilisation(staff, [], [], new Date('invalid'));
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('INVALID_DATE');
  });
});

// ─── forecastCapacity Tests ───────────────────────────────────────────────────

describe('forecastCapacity', () => {
  const defaultConversionRates = { quote_sent: 0.30, quote_accepted: 0.70 };

  it('should generate a forecast for specified weeks (R12.4)', () => {
    const staff = [makeStaff()];
    const allocations = [makeAllocation({ startDate: '2025-01-01' })];

    const result = forecastCapacity(staff, allocations, [], [], defaultConversionRates, 4);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(4);
    expect(result.data[0].weekStart).toBeDefined();
    expect(result.data[0].totalCapacity).toBe(40);
    expect(result.data[0].totalAllocated).toBe(20);
  });

  it('should weight pipeline entries by conversion probability (R12.4)', () => {
    const staff = [makeStaff({ clientChargeOutRate: 1000 })];
    const allocations: Allocation[] = [];
    // quote_sent with 500,000 fee × 0.30 = 150,000 weighted
    // At 1000/hr charge-out = 150 hours total / 4 weeks = 37.5 hours per week
    const pipeline = [makeEnquiry({ estimatedFeeValueZAR: 500000, currentStage: 'quote_sent' })];

    const result = forecastCapacity(staff, allocations, [], pipeline, defaultConversionRates, 4);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[0].pipelineWeighted).toBeGreaterThan(0);
    // 500000 × 0.30 / 1000 / 4 = 37.5
    expect(result.data[0].pipelineWeighted).toBe(37.5);
  });

  it('should only consider quote_sent and quote_accepted pipeline entries', () => {
    const staff = [makeStaff({ clientChargeOutRate: 1000 })];
    const pipeline = [
      makeEnquiry({ id: 'e1', currentStage: 'lead', estimatedFeeValueZAR: 1000000 }),
      makeEnquiry({ id: 'e2', currentStage: 'appointed', estimatedFeeValueZAR: 1000000 }),
      makeEnquiry({ id: 'e3', currentStage: 'active', estimatedFeeValueZAR: 1000000 }),
    ];

    const result = forecastCapacity(staff, [], [], pipeline, defaultConversionRates, 4);

    expect(result.success).toBe(true);
    if (!result.success) return;
    // None of these stages qualify
    expect(result.data[0].pipelineWeighted).toBe(0);
  });

  it('should reduce capacity when staff have leave (R12.7)', () => {
    const staff = [makeStaff()];
    const allocations: Allocation[] = [];

    // Create leave that covers the first forecast week (starting from today's Monday)
    const today = new Date();
    const day = today.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(monday.getDate() + diff);

    const friday = new Date(monday);
    friday.setDate(friday.getDate() + 4);

    const leave = [makeLeave({
      startDate: monday.toISOString().split('T')[0],
      endDate: friday.toISOString().split('T')[0],
    })];

    const result = forecastCapacity(staff, allocations, leave, [], defaultConversionRates, 4);

    expect(result.success).toBe(true);
    if (!result.success) return;
    // First week capacity should be 0 (full week leave)
    expect(result.data[0].totalCapacity).toBe(0);
    // Other weeks should remain 40
    expect(result.data[1].totalCapacity).toBe(40);
  });

  it('should calculate firm utilisation correctly (R12.3)', () => {
    const staff = [
      makeStaff({ id: 'staff-1', availableHoursPerWeek: 40 }),
      makeStaff({ id: 'staff-2', availableHoursPerWeek: 40 }),
    ];
    // Total capacity = 80h
    // Total allocated = 30h + 30h = 60h
    const allocations = [
      makeAllocation({ id: 'a1', staffId: 'staff-1', hoursPerWeek: 30, startDate: '2025-01-01' }),
      makeAllocation({ id: 'a2', staffId: 'staff-2', hoursPerWeek: 30, startDate: '2025-01-01' }),
    ];

    const result = forecastCapacity(staff, allocations, [], [], defaultConversionRates, 2);

    expect(result.success).toBe(true);
    if (!result.success) return;
    // firmUtilisation = (60 + 0) / 80 × 100 = 75%
    expect(result.data[0].firmUtilisation).toBe(75);
  });

  it('should reject empty staff array', () => {
    const result = forecastCapacity([], [], [], [], defaultConversionRates, 12);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('INVALID_STAFF');
  });

  it('should reject invalid weeks', () => {
    const staff = [makeStaff()];
    const result = forecastCapacity(staff, [], [], [], defaultConversionRates, 0);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('INVALID_WEEKS');
  });

  it('should reject invalid conversion rates', () => {
    const staff = [makeStaff()];
    const result = forecastCapacity(staff, [], [], [], null as unknown as { quote_sent: number; quote_accepted: number }, 12);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('INVALID_CONVERSION_RATES');
  });
});

// ─── evaluateCapacityAlerts Tests ─────────────────────────────────────────────

describe('evaluateCapacityAlerts', () => {
  it('should flag firm utilisation above threshold (R12.5)', () => {
    const forecast = [
      {
        weekStart: '2025-03-10',
        totalCapacity: 80,
        totalAllocated: 70,
        pipelineWeighted: 5,
        totalAvailable: 5,
        firmUtilisation: 93.75,
      },
    ];

    const result = evaluateCapacityAlerts(forecast, 85);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.length).toBe(1);
    expect(result.data[0].type).toBe('firm_utilisation_warning');
    expect(result.data[0].details.firmUtilisation).toBe(93.75);
    expect(result.data[0].details.threshold).toBe(85);
  });

  it('should not flag when utilisation is below threshold', () => {
    const forecast = [
      {
        weekStart: '2025-03-10',
        totalCapacity: 80,
        totalAllocated: 50,
        pipelineWeighted: 5,
        totalAvailable: 25,
        firmUtilisation: 68.75,
      },
    ];

    const result = evaluateCapacityAlerts(forecast, 85);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(0);
  });

  it('should flag over-allocation at firm level (R12.6)', () => {
    const forecast = [
      {
        weekStart: '2025-03-10',
        totalCapacity: 40,
        totalAllocated: 45,
        pipelineWeighted: 0,
        totalAvailable: 0,
        firmUtilisation: 112.5,
      },
    ];

    const result = evaluateCapacityAlerts(forecast, 85);

    expect(result.success).toBe(true);
    if (!result.success) return;
    // Should have both: utilisation warning AND over-allocation
    const types = result.data.map((a) => a.type);
    expect(types).toContain('over_allocation');
    expect(types).toContain('firm_utilisation_warning');
  });

  it('should handle multiple weeks with mixed alerts', () => {
    const forecast = [
      {
        weekStart: '2025-03-10',
        totalCapacity: 80,
        totalAllocated: 50,
        pipelineWeighted: 0,
        totalAvailable: 30,
        firmUtilisation: 62.5,
      },
      {
        weekStart: '2025-03-17',
        totalCapacity: 80,
        totalAllocated: 72,
        pipelineWeighted: 0,
        totalAvailable: 8,
        firmUtilisation: 90,
      },
    ];

    const result = evaluateCapacityAlerts(forecast, 85);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].weekStart).toBe('2025-03-17');
  });

  it('should use default threshold of 85%', () => {
    const forecast = [
      {
        weekStart: '2025-03-10',
        totalCapacity: 80,
        totalAllocated: 70,
        pipelineWeighted: 0,
        totalAvailable: 10,
        firmUtilisation: 87.5,
      },
    ];

    const result = evaluateCapacityAlerts(forecast);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].type).toBe('firm_utilisation_warning');
  });

  it('should reject invalid threshold', () => {
    const result = evaluateCapacityAlerts([], 150);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('INVALID_THRESHOLD');
  });
});

// ─── evaluateStaffOverAllocation Tests ────────────────────────────────────────

describe('evaluateStaffOverAllocation', () => {
  it('should flag staff whose allocated exceeds available (R12.6)', () => {
    const staff = [makeStaff({ availableHoursPerWeek: 40 })];
    const allocations = [
      makeAllocation({ id: 'a1', hoursPerWeek: 25, startDate: '2025-01-01' }),
      makeAllocation({ id: 'a2', hoursPerWeek: 20, startDate: '2025-01-01' }),
    ];
    const week = new Date('2025-03-10');

    const result = evaluateStaffOverAllocation(staff, allocations, [], week);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].type).toBe('over_allocation');
    expect(result.data[0].details.staffId).toBe('staff-1');
    expect(result.data[0].details.allocatedHours).toBe(45);
    expect(result.data[0].details.availableHours).toBe(40);
  });

  it('should not flag staff within capacity', () => {
    const staff = [makeStaff({ availableHoursPerWeek: 40 })];
    const allocations = [makeAllocation({ hoursPerWeek: 30, startDate: '2025-01-01' })];
    const week = new Date('2025-03-10');

    const result = evaluateStaffOverAllocation(staff, allocations, [], week);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(0);
  });

  it('should account for leave when checking over-allocation (R12.7)', () => {
    const staff = [makeStaff({ availableHoursPerWeek: 40 })];
    // 30h allocated against 40h available = fine normally
    // But with 2 days leave (16h), effective available = 24h, 30 > 24 = over-allocated
    const allocations = [makeAllocation({ hoursPerWeek: 30, startDate: '2025-01-01' })];
    const leave = [makeLeave({ startDate: '2025-03-10', endDate: '2025-03-11' })];
    const week = new Date('2025-03-10');

    const result = evaluateStaffOverAllocation(staff, allocations, leave, week);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].details.availableHours).toBe(24);
    expect(result.data[0].details.allocatedHours).toBe(30);
  });
});
