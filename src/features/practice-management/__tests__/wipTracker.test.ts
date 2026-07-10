// @vitest-environment node
/**
 * WIP Tracker Service — Unit Tests
 *
 * Tests for:
 * - calculateProjectWIP: WIP formula, approved-only filtering, rate lookup, edge cases
 * - calculateFirmWIP: aggregation, sorting by WIP descending
 * - evaluateWIPAlerts: 80% warning, 100% critical, null budget handling
 * - ageWIP: ageing buckets, approved-only filtering, boundary days
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8
 */

import { describe, it, expect } from 'vitest';
import {
  calculateProjectWIP,
  calculateFirmWIP,
  evaluateWIPAlerts,
  ageWIP,
} from '../services/wipTracker';
import type {
  TimesheetEntry,
  ChargeOutRates,
  Disbursement,
  Invoice,
  WIPCalculation,
} from '../types';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function makeTimesheet(overrides: Partial<TimesheetEntry> = {}): TimesheetEntry {
  return {
    id: 'ts-1',
    firmId: 'firm-1',
    staffId: 'staff-1',
    projectId: 'proj-1',
    date: '2025-03-15',
    activityCategory: 'design',
    hours: 8,
    description: 'Design work',
    billable: true,
    status: 'approved',
    createdAt: '2025-03-15T08:00:00.000Z',
    updatedAt: '2025-03-15T08:00:00.000Z',
    ...overrides,
  };
}

function makeRate(overrides: Partial<ChargeOutRates> = {}): ChargeOutRates {
  return {
    staffId: 'staff-1',
    clientRate: 1500,
    internalCostRate: 800,
    ...overrides,
  };
}

function makeDisbursement(overrides: Partial<Disbursement> = {}): Disbursement {
  return {
    id: 'disb-1',
    firmId: 'firm-1',
    projectId: 'proj-1',
    description: 'Travel costs',
    amountZAR: 2500,
    date: '2025-03-16',
    invoiced: false,
    createdAt: '2025-03-16T00:00:00.000Z',
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    firmId: 'firm-1',
    projectId: 'proj-1',
    invoiceNumber: 'INV-001',
    lineItems: [{ description: 'Design services', hours: 8, rate: 1500, amount: 12000, category: 'design' }],
    subtotalZAR: 12000,
    vatZAR: 1800,
    totalZAR: 13800,
    status: 'sent',
    billingModel: 'hourly',
    createdAt: '2025-03-20T00:00:00.000Z',
    updatedAt: '2025-03-20T00:00:00.000Z',
    ...overrides,
  };
}

// ─── calculateProjectWIP ──────────────────────────────────────────────────────

describe('calculateProjectWIP', () => {
  it('should calculate WIP as (billable hours × rate) + unbilled disbursements − invoiced amounts', () => {
    const timesheets = [makeTimesheet({ hours: 10, staffId: 'staff-1' })];
    const rates = [makeRate({ staffId: 'staff-1', clientRate: 1500 })];
    const disbursements = [makeDisbursement({ amountZAR: 3000, invoiced: false })];
    const invoices = [makeInvoice({ subtotalZAR: 5000 })];

    const result = calculateProjectWIP(timesheets, rates, disbursements, invoices);

    expect(result.success).toBe(true);
    if (result.success) {
      // WIP = (10 × 1500) + 3000 - 5000 = 15000 + 3000 - 5000 = 13000
      expect(result.data.totalWIPValueZAR).toBe(13000);
      expect(result.data.billableHoursNotInvoiced).toBe(10);
      expect(result.data.unbilledDisbursementsZAR).toBe(3000);
    }
  });

  it('should only include timesheet entries with status "approved"', () => {
    const timesheets = [
      makeTimesheet({ id: 'ts-1', hours: 8, status: 'approved' }),
      makeTimesheet({ id: 'ts-2', hours: 4, status: 'draft' }),
      makeTimesheet({ id: 'ts-3', hours: 6, status: 'submitted' }),
      makeTimesheet({ id: 'ts-4', hours: 5, status: 'invoiced' }),
    ];
    const rates = [makeRate({ clientRate: 1000 })];

    const result = calculateProjectWIP(timesheets, rates, [], []);

    expect(result.success).toBe(true);
    if (result.success) {
      // Only the approved entry (8 hours) should count
      expect(result.data.totalWIPValueZAR).toBe(8000); // 8 × 1000
      expect(result.data.billableHoursNotInvoiced).toBe(8);
    }
  });

  it('should exclude non-billable entries from WIP calculation', () => {
    const timesheets = [
      makeTimesheet({ id: 'ts-1', hours: 8, billable: true, status: 'approved' }),
      makeTimesheet({ id: 'ts-2', hours: 4, billable: false, status: 'approved' }),
    ];
    const rates = [makeRate({ clientRate: 1000 })];

    const result = calculateProjectWIP(timesheets, rates, [], []);

    expect(result.success).toBe(true);
    if (result.success) {
      // Only billable approved (8 hours) counts
      expect(result.data.totalWIPValueZAR).toBe(8000);
      expect(result.data.billableHoursNotInvoiced).toBe(8);
    }
  });

  it('should only count disbursements where invoiced=false as unbilled', () => {
    const disbursements = [
      makeDisbursement({ id: 'd1', amountZAR: 1000, invoiced: false }),
      makeDisbursement({ id: 'd2', amountZAR: 2000, invoiced: true }),
      makeDisbursement({ id: 'd3', amountZAR: 500, invoiced: false }),
    ];

    const result = calculateProjectWIP([], [], disbursements, []);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.unbilledDisbursementsZAR).toBe(1500); // 1000 + 500
      expect(result.data.totalWIPValueZAR).toBe(1500);
    }
  });

  it('should use subtotalZAR (excluding VAT) for invoiced amounts', () => {
    const invoices = [
      makeInvoice({ subtotalZAR: 10000, vatZAR: 1500, totalZAR: 11500 }),
    ];

    const result = calculateProjectWIP([], [], [], invoices);

    expect(result.success).toBe(true);
    if (result.success) {
      // WIP = 0 + 0 - 10000 = -10000
      expect(result.data.totalWIPValueZAR).toBe(-10000);
    }
  });

  it('should handle multiple staff members with different rates', () => {
    const timesheets = [
      makeTimesheet({ id: 'ts-1', staffId: 'staff-1', hours: 5, status: 'approved' }),
      makeTimesheet({ id: 'ts-2', staffId: 'staff-2', hours: 10, status: 'approved' }),
    ];
    const rates = [
      makeRate({ staffId: 'staff-1', clientRate: 2000 }),
      makeRate({ staffId: 'staff-2', clientRate: 1200 }),
    ];

    const result = calculateProjectWIP(timesheets, rates, [], []);

    expect(result.success).toBe(true);
    if (result.success) {
      // (5 × 2000) + (10 × 1200) = 10000 + 12000 = 22000
      expect(result.data.totalWIPValueZAR).toBe(22000);
      expect(result.data.billableHoursNotInvoiced).toBe(15);
    }
  });

  it('should use rate of 0 for staff without a configured rate', () => {
    const timesheets = [
      makeTimesheet({ staffId: 'staff-unknown', hours: 8, status: 'approved' }),
    ];
    const rates = [makeRate({ staffId: 'staff-1', clientRate: 1500 })];

    const result = calculateProjectWIP(timesheets, rates, [], []);

    expect(result.success).toBe(true);
    if (result.success) {
      // staff-unknown has no rate, so hours × 0 = 0
      expect(result.data.totalWIPValueZAR).toBe(0);
      expect(result.data.billableHoursNotInvoiced).toBe(8);
    }
  });

  it('should return the most recent invoice date as lastInvoiceDate', () => {
    const invoices = [
      makeInvoice({ id: 'inv-1', subtotalZAR: 5000, createdAt: '2025-02-01T00:00:00.000Z' }),
      makeInvoice({ id: 'inv-2', subtotalZAR: 3000, createdAt: '2025-03-15T00:00:00.000Z' }),
      makeInvoice({ id: 'inv-3', subtotalZAR: 2000, createdAt: '2025-01-10T00:00:00.000Z' }),
    ];

    const result = calculateProjectWIP([], [], [], invoices);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lastInvoiceDate).toBe('2025-03-15T00:00:00.000Z');
    }
  });

  it('should return undefined lastInvoiceDate when no invoices exist', () => {
    const result = calculateProjectWIP(
      [makeTimesheet()],
      [makeRate()],
      [],
      []
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lastInvoiceDate).toBeUndefined();
    }
  });

  it('should handle empty inputs gracefully', () => {
    const result = calculateProjectWIP([], [], [], []);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalWIPValueZAR).toBe(0);
      expect(result.data.billableHoursNotInvoiced).toBe(0);
      expect(result.data.unbilledDisbursementsZAR).toBe(0);
      expect(result.data.wipAgeDays).toBe(0);
    }
  });

  it('should return error for invalid inputs', () => {
    const result = calculateProjectWIP(
      null as unknown as TimesheetEntry[],
      [],
      [],
      []
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_INPUT');
    }
  });
});

// ─── calculateFirmWIP ─────────────────────────────────────────────────────────

describe('calculateFirmWIP', () => {
  it('should aggregate WIP across multiple projects', () => {
    const projects = [
      {
        projectId: 'proj-1',
        timesheets: [makeTimesheet({ projectId: 'proj-1', hours: 10 })],
        rates: [makeRate({ clientRate: 1000 })],
        disbursements: [],
        invoices: [],
      },
      {
        projectId: 'proj-2',
        timesheets: [makeTimesheet({ projectId: 'proj-2', hours: 5 })],
        rates: [makeRate({ clientRate: 2000 })],
        disbursements: [makeDisbursement({ projectId: 'proj-2', amountZAR: 1000 })],
        invoices: [],
      },
    ];

    const result = calculateFirmWIP(projects);

    expect(result.success).toBe(true);
    if (result.success) {
      // proj-1: 10 × 1000 = 10000
      // proj-2: 5 × 2000 + 1000 = 11000
      // total = 21000
      expect(result.data.totalWIP).toBe(21000);
      expect(result.data.projectCount).toBe(2);
    }
  });

  it('should sort projects by WIP value descending', () => {
    const projects = [
      {
        projectId: 'proj-low',
        timesheets: [makeTimesheet({ projectId: 'proj-low', hours: 2 })],
        rates: [makeRate({ clientRate: 500 })],
        disbursements: [],
        invoices: [],
      },
      {
        projectId: 'proj-high',
        timesheets: [makeTimesheet({ projectId: 'proj-high', hours: 20 })],
        rates: [makeRate({ clientRate: 2000 })],
        disbursements: [],
        invoices: [],
      },
    ];

    const result = calculateFirmWIP(projects);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.byProject[0].projectId).toBe('proj-high');
      expect(result.data.byProject[1].projectId).toBe('proj-low');
    }
  });

  it('should handle empty projects array', () => {
    const result = calculateFirmWIP([]);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalWIP).toBe(0);
      expect(result.data.byProject).toHaveLength(0);
      expect(result.data.projectCount).toBe(0);
    }
  });

  it('should return error for invalid input', () => {
    const result = calculateFirmWIP(null as unknown as []);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_INPUT');
    }
  });
});

// ─── evaluateWIPAlerts ────────────────────────────────────────────────────────

describe('evaluateWIPAlerts', () => {
  const baseWIP: WIPCalculation = {
    projectId: 'proj-1',
    totalWIPValueZAR: 80000,
    billableHoursNotInvoiced: 50,
    unbilledDisbursementsZAR: 5000,
    wipAgeDays: 30,
  };

  it('should generate budget_warning when WIP exceeds 80% of budget', () => {
    const wip = { ...baseWIP, totalWIPValueZAR: 85000 };
    const result = evaluateWIPAlerts(wip, 100000);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].alertType).toBe('budget_warning');
      expect(result.data[0].percentage).toBe(85);
    }
  });

  it('should generate budget_critical when WIP exceeds 100% of budget', () => {
    const wip = { ...baseWIP, totalWIPValueZAR: 120000 };
    const result = evaluateWIPAlerts(wip, 100000);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].alertType).toBe('budget_critical');
      expect(result.data[0].percentage).toBe(120);
      expect(result.data[0].message).toContain('exceeded');
    }
  });

  it('should generate only budget_critical (not warning) when at exactly 100%', () => {
    const wip = { ...baseWIP, totalWIPValueZAR: 100000 };
    const result = evaluateWIPAlerts(wip, 100000);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].alertType).toBe('budget_critical');
    }
  });

  it('should return no alerts when WIP is below 80% of budget', () => {
    const wip = { ...baseWIP, totalWIPValueZAR: 70000 };
    const result = evaluateWIPAlerts(wip, 100000);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(0);
    }
  });

  it('should return no alerts when budget is null (requirement 9.8)', () => {
    const wip = { ...baseWIP, totalWIPValueZAR: 999999 };
    const result = evaluateWIPAlerts(wip, null);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(0);
    }
  });

  it('should generate budget_warning at exactly 80%', () => {
    const wip = { ...baseWIP, totalWIPValueZAR: 80000 };
    const result = evaluateWIPAlerts(wip, 100000);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].alertType).toBe('budget_warning');
      expect(result.data[0].percentage).toBe(80);
    }
  });

  it('should return error for invalid budget (zero)', () => {
    const result = evaluateWIPAlerts(baseWIP, 0);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_BUDGET');
    }
  });

  it('should return error for negative budget', () => {
    const result = evaluateWIPAlerts(baseWIP, -5000);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_BUDGET');
    }
  });

  it('should include overrun amount in critical alert message', () => {
    const wip = { ...baseWIP, totalWIPValueZAR: 150000 };
    const result = evaluateWIPAlerts(wip, 100000);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0].message).toContain('50000.00');
    }
  });
});

// ─── ageWIP ───────────────────────────────────────────────────────────────────

describe('ageWIP', () => {
  const now = new Date('2025-04-15T12:00:00.000Z');

  it('should bucket entries into 0–30 days', () => {
    const entries = [
      makeTimesheet({ date: '2025-04-10', hours: 4, status: 'approved', billable: true }),
      makeTimesheet({ id: 'ts-2', date: '2025-04-01', hours: 6, status: 'approved', billable: true }),
    ];

    const result = ageWIP(entries, now);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bucket_0_30).toBe(10); // 4 + 6
      expect(result.data.bucket_31_60).toBe(0);
      expect(result.data.bucket_61_90).toBe(0);
      expect(result.data.bucket_90_plus).toBe(0);
    }
  });

  it('should bucket entries into 31–60 days', () => {
    const entries = [
      makeTimesheet({ date: '2025-03-05', hours: 8, status: 'approved', billable: true }),
    ];

    const result = ageWIP(entries, now);

    expect(result.success).toBe(true);
    if (result.success) {
      // March 5 to April 15 = 41 days → 31–60 bucket
      expect(result.data.bucket_0_30).toBe(0);
      expect(result.data.bucket_31_60).toBe(8);
    }
  });

  it('should bucket entries into 61–90 days', () => {
    const entries = [
      makeTimesheet({ date: '2025-02-01', hours: 3, status: 'approved', billable: true }),
    ];

    const result = ageWIP(entries, now);

    expect(result.success).toBe(true);
    if (result.success) {
      // Feb 1 to April 15 = 73 days → 61–90 bucket
      expect(result.data.bucket_0_30).toBe(0);
      expect(result.data.bucket_31_60).toBe(0);
      expect(result.data.bucket_61_90).toBe(3);
    }
  });

  it('should bucket entries into 90+ days', () => {
    const entries = [
      makeTimesheet({ date: '2025-01-01', hours: 12, status: 'approved', billable: true }),
    ];

    const result = ageWIP(entries, now);

    expect(result.success).toBe(true);
    if (result.success) {
      // Jan 1 to April 15 = 104 days → 90+ bucket
      expect(result.data.bucket_0_30).toBe(0);
      expect(result.data.bucket_31_60).toBe(0);
      expect(result.data.bucket_61_90).toBe(0);
      expect(result.data.bucket_90_plus).toBe(12);
    }
  });

  it('should distribute entries across multiple buckets', () => {
    const entries = [
      makeTimesheet({ id: 'ts-1', date: '2025-04-10', hours: 2, status: 'approved', billable: true }),
      makeTimesheet({ id: 'ts-2', date: '2025-03-10', hours: 4, status: 'approved', billable: true }),
      makeTimesheet({ id: 'ts-3', date: '2025-02-10', hours: 6, status: 'approved', billable: true }),
      makeTimesheet({ id: 'ts-4', date: '2024-12-01', hours: 8, status: 'approved', billable: true }),
    ];

    const result = ageWIP(entries, now);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bucket_0_30).toBe(2);   // April 10 = 5 days
      expect(result.data.bucket_31_60).toBe(4);  // March 10 = 36 days
      expect(result.data.bucket_61_90).toBe(6);  // Feb 10 = 64 days
      expect(result.data.bucket_90_plus).toBe(8); // Dec 1 = 135 days
    }
  });

  it('should only include approved billable entries', () => {
    const entries = [
      makeTimesheet({ id: 'ts-1', date: '2025-04-10', hours: 8, status: 'approved', billable: true }),
      makeTimesheet({ id: 'ts-2', date: '2025-04-10', hours: 4, status: 'draft', billable: true }),
      makeTimesheet({ id: 'ts-3', date: '2025-04-10', hours: 6, status: 'approved', billable: false }),
      makeTimesheet({ id: 'ts-4', date: '2025-04-10', hours: 2, status: 'invoiced', billable: true }),
    ];

    const result = ageWIP(entries, now);

    expect(result.success).toBe(true);
    if (result.success) {
      // Only ts-1 (approved + billable) should count
      expect(result.data.bucket_0_30).toBe(8);
      expect(result.data.bucket_31_60).toBe(0);
      expect(result.data.bucket_61_90).toBe(0);
      expect(result.data.bucket_90_plus).toBe(0);
    }
  });

  it('should handle empty entries array', () => {
    const result = ageWIP([], now);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bucket_0_30).toBe(0);
      expect(result.data.bucket_31_60).toBe(0);
      expect(result.data.bucket_61_90).toBe(0);
      expect(result.data.bucket_90_plus).toBe(0);
    }
  });

  it('should return error for invalid input', () => {
    const result = ageWIP(null as unknown as TimesheetEntry[], now);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_INPUT');
    }
  });

  it('should place entry exactly at day 30 boundary in 0–30 bucket', () => {
    // April 15 minus 30 days = March 16
    const entries = [
      makeTimesheet({ date: '2025-03-16', hours: 5, status: 'approved', billable: true }),
    ];

    const result = ageWIP(entries, now);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bucket_0_30).toBe(5);
      expect(result.data.bucket_31_60).toBe(0);
    }
  });
});
