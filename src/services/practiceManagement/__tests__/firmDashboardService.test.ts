/**
 * Unit tests for FirmDashboardService
 *
 * Tests firm-wide metrics, portfolio generation, utilisation calculation,
 * date range filtering, and PDF export data assembly.
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
 */

import {
  getSummaryMetrics,
  getProjectPortfolio,
  getUtilisationMetrics,
  exportToPdf,
  isWithinDateRange,
  filterInvoicesByDateRange,
  classifyProjectStatus,
  calculateUtilisationTrend,
} from '../firmDashboardService';
import type {
  FirmDashboardInput,
  ProjectFinancialData,
  PersonTimesheetData,
} from '../firmDashboardService';
import type {
  PracticeInvoice,
  PipelineOpportunity,
  DateRange,
  ProjectFeeStructure,
  WriteOffEntry,
} from '../types';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeFeeStructure(projectId: string, totalAgreedFeeCents: number): ProjectFeeStructure {
  return {
    id: `fee-${projectId}`,
    firmId: 'firm-1',
    projectId,
    totalAgreedFeeCents,
    feeBasis: 'lump_sum',
    stageBreakdown: [],
    createdBy: 'user-1',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  };
}

function makeProjectFinancialData(
  overrides: Partial<ProjectFinancialData> & { projectId: string },
): ProjectFinancialData {
  return {
    projectName: `Project ${overrides.projectId}`,
    feeStructure: makeFeeStructure(overrides.projectId, 1_000_000),
    timeCostsCents: 0,
    disbursementsCents: 0,
    writeOffsCents: 0,
    amountInvoicedCents: 0,
    amountCollectedCents: 0,
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<PracticeInvoice> = {}): PracticeInvoice {
  return {
    id: 'inv-1',
    firmId: 'firm-1',
    projectId: 'proj-1',
    invoiceNumber: 'INV-001',
    invoiceType: 'lump_sum',
    status: 'paid',
    amountCents: 100_000,
    vatCents: 15_000,
    totalCents: 115_000,
    dueDate: '2025-02-15',
    issuedDate: '2025-01-15',
    description: 'Stage 1 fee',
    createdBy: 'user-1',
    createdAt: '2025-01-15T00:00:00Z',
    updatedAt: '2025-01-15T00:00:00Z',
    ...overrides,
  };
}

function makePersonTimesheet(overrides: Partial<PersonTimesheetData> = {}): PersonTimesheetData {
  return {
    userId: 'user-1',
    displayName: 'Alice Architect',
    billableHours: 120,
    nonBillableHours: 40,
    availableHours: 160,
    previousPeriodBillableHours: 100,
    previousPeriodAvailableHours: 160,
    ...overrides,
  };
}

function makePipelineOpportunity(overrides: Partial<PipelineOpportunity> = {}): PipelineOpportunity {
  return {
    id: 'opp-1',
    firmId: 'firm-1',
    projectId: 'proj-pipeline-1',
    title: 'New Office Block',
    status: 'active',
    probability: 80,
    estimatedFeeCents: 2_000_000,
    weightedValueCents: 1_600_000,
    requiredDisciplines: ['architect'],
    isHighConfidence: true,
    includedInCapacity: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  } as PipelineOpportunity;
}

const DEFAULT_DATE_RANGE: DateRange = {
  type: 'monthly',
  from: '2025-01-01',
  to: '2025-01-31',
};

function makeDefaultInput(overrides: Partial<FirmDashboardInput> = {}): FirmDashboardInput {
  return {
    firmId: 'firm-1',
    dateRange: DEFAULT_DATE_RANGE,
    projects: [],
    pipelineOpportunities: [],
    invoices: [],
    personTimesheets: [],
    writeOffEntries: [],
    ...overrides,
  };
}

// ─── isWithinDateRange ───────────────────────────────────────────────────────

describe('isWithinDateRange', () => {
  it('returns true when date is within range', () => {
    expect(isWithinDateRange('2025-01-15', DEFAULT_DATE_RANGE)).toBe(true);
  });

  it('returns true when date is at range boundaries', () => {
    expect(isWithinDateRange('2025-01-01', DEFAULT_DATE_RANGE)).toBe(true);
    expect(isWithinDateRange('2025-01-31', DEFAULT_DATE_RANGE)).toBe(true);
  });

  it('returns false when date is before range', () => {
    expect(isWithinDateRange('2024-12-31', DEFAULT_DATE_RANGE)).toBe(false);
  });

  it('returns false when date is after range', () => {
    expect(isWithinDateRange('2025-02-01', DEFAULT_DATE_RANGE)).toBe(false);
  });
});

// ─── filterInvoicesByDateRange ───────────────────────────────────────────────

describe('filterInvoicesByDateRange', () => {
  it('filters invoices by issuedDate within range', () => {
    const invoices = [
      makeInvoice({ id: 'inv-1', issuedDate: '2025-01-10' }),
      makeInvoice({ id: 'inv-2', issuedDate: '2025-02-10' }),
    ];
    const result = filterInvoicesByDateRange(invoices, DEFAULT_DATE_RANGE);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('inv-1');
  });

  it('falls back to createdAt when issuedDate is undefined', () => {
    const invoices = [
      makeInvoice({ id: 'inv-1', issuedDate: undefined, createdAt: '2025-01-20T00:00:00Z' }),
    ];
    const result = filterInvoicesByDateRange(invoices, DEFAULT_DATE_RANGE);
    expect(result).toHaveLength(1);
  });
});

// ─── getSummaryMetrics ───────────────────────────────────────────────────────

describe('getSummaryMetrics', () => {
  it('calculates total revenue from paid and sent_to_client invoices', () => {
    const input = makeDefaultInput({
      invoices: [
        makeInvoice({ id: 'inv-1', status: 'paid', amountCents: 500_000, issuedDate: '2025-01-10' }),
        makeInvoice({ id: 'inv-2', status: 'sent_to_client', amountCents: 300_000, issuedDate: '2025-01-20' }),
        makeInvoice({ id: 'inv-3', status: 'draft', amountCents: 200_000, issuedDate: '2025-01-25' }),
      ],
    });

    const result = getSummaryMetrics(input);
    expect(result.totalRevenueCents).toBe(800_000);
  });

  it('excludes invoices outside date range from revenue', () => {
    const input = makeDefaultInput({
      invoices: [
        makeInvoice({ id: 'inv-1', status: 'paid', amountCents: 500_000, issuedDate: '2025-01-10' }),
        makeInvoice({ id: 'inv-2', status: 'paid', amountCents: 300_000, issuedDate: '2025-02-10' }),
      ],
    });

    const result = getSummaryMetrics(input);
    expect(result.totalRevenueCents).toBe(500_000);
  });

  it('calculates total WIP exposure across all projects', () => {
    const input = makeDefaultInput({
      projects: [
        makeProjectFinancialData({
          projectId: 'proj-1',
          feeStructure: makeFeeStructure('proj-1', 1_000_000),
          timeCostsCents: 300_000,
          disbursementsCents: 50_000,
          amountInvoicedCents: 200_000,
        }),
        makeProjectFinancialData({
          projectId: 'proj-2',
          feeStructure: makeFeeStructure('proj-2', 500_000),
          timeCostsCents: 100_000,
          disbursementsCents: 0,
          amountInvoicedCents: 100_000,
        }),
      ],
    });

    const result = getSummaryMetrics(input);
    // proj-1: 1M - 350K - 200K = 450K
    // proj-2: 500K - 100K - 100K = 300K
    expect(result.totalWipExposureCents).toBe(750_000);
  });

  it('calculates weighted average project margin', () => {
    const input = makeDefaultInput({
      projects: [
        makeProjectFinancialData({
          projectId: 'proj-1',
          feeStructure: makeFeeStructure('proj-1', 1_000_000),
          timeCostsCents: 600_000,
          disbursementsCents: 100_000,
          writeOffsCents: 50_000,
        }),
        makeProjectFinancialData({
          projectId: 'proj-2',
          feeStructure: makeFeeStructure('proj-2', 1_000_000),
          timeCostsCents: 400_000,
          disbursementsCents: 100_000,
          writeOffsCents: 0,
        }),
      ],
    });

    const result = getSummaryMetrics(input);
    // proj-1 profit: 1M - 600K - 100K - 50K = 250K
    // proj-2 profit: 1M - 400K - 100K - 0 = 500K
    // total profit: 750K / 2M = 37.5%
    expect(result.averageProjectMarginPercent).toBe(37.5);
  });

  it('calculates firm utilisation rate', () => {
    const input = makeDefaultInput({
      personTimesheets: [
        makePersonTimesheet({ userId: 'u1', billableHours: 120, availableHours: 160 }),
        makePersonTimesheet({ userId: 'u2', billableHours: 80, availableHours: 160 }),
      ],
    });

    const result = getSummaryMetrics(input);
    // (120+80) / (160+160) * 100 = 62.5%
    expect(result.firmUtilisationPercent).toBe(62.5);
  });

  it('calculates pipeline value from active opportunities', () => {
    const input = makeDefaultInput({
      firmId: 'firm-1',
      pipelineOpportunities: [
        makePipelineOpportunity({ firmId: 'firm-1', weightedValueCents: 1_600_000, status: 'active' }),
        makePipelineOpportunity({ id: 'opp-2', firmId: 'firm-1', weightedValueCents: 800_000, status: 'active' }),
        makePipelineOpportunity({ id: 'opp-3', firmId: 'firm-2', weightedValueCents: 500_000, status: 'active' }),
      ],
    });

    const result = getSummaryMetrics(input);
    expect(result.pipelineValueCents).toBe(2_400_000);
  });

  it('calculates write-off percentage', () => {
    const input = makeDefaultInput({
      projects: [
        makeProjectFinancialData({
          projectId: 'proj-1',
          feeStructure: makeFeeStructure('proj-1', 1_000_000),
          writeOffsCents: 100_000,
        }),
        makeProjectFinancialData({
          projectId: 'proj-2',
          feeStructure: makeFeeStructure('proj-2', 1_000_000),
          writeOffsCents: 50_000,
        }),
      ],
    });

    const result = getSummaryMetrics(input);
    // 150K write-offs / 2M total fees = 7.5%
    expect(result.writeOffPercentage).toBe(7.5);
  });

  it('returns zeros when no data is present', () => {
    const result = getSummaryMetrics(makeDefaultInput());
    expect(result.totalRevenueCents).toBe(0);
    expect(result.totalWipExposureCents).toBe(0);
    expect(result.averageProjectMarginPercent).toBe(0);
    expect(result.firmUtilisationPercent).toBe(0);
    expect(result.pipelineValueCents).toBe(0);
    expect(result.writeOffPercentage).toBe(0);
  });
});

// ─── getProjectPortfolio ─────────────────────────────────────────────────────

describe('getProjectPortfolio', () => {
  it('generates portfolio entries for each project', () => {
    const projects = [
      makeProjectFinancialData({
        projectId: 'proj-1',
        projectName: 'House Renovation',
        feeStructure: makeFeeStructure('proj-1', 1_000_000),
        timeCostsCents: 400_000,
        disbursementsCents: 100_000,
        writeOffsCents: 50_000,
        amountInvoicedCents: 300_000,
      }),
    ];

    const result = getProjectPortfolio(projects);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      projectId: 'proj-1',
      projectName: 'House Renovation',
      feeCents: 1_000_000,
      costsCents: 500_000,
      wipCents: 200_000, // 1M - 500K - 300K
      marginPercent: 45, // (1M - 400K - 100K - 50K) / 1M * 100
      status: 'healthy',
    });
  });

  it('marks project as loss_making when margin is negative', () => {
    const projects = [
      makeProjectFinancialData({
        projectId: 'proj-1',
        feeStructure: makeFeeStructure('proj-1', 500_000),
        timeCostsCents: 600_000,
        disbursementsCents: 50_000,
        writeOffsCents: 0,
      }),
    ];

    const result = getProjectPortfolio(projects);
    expect(result[0].status).toBe('loss_making');
    expect(result[0].marginPercent).toBeLessThan(0);
  });

  it('marks project as warning when margin is between 0% and 20%', () => {
    const projects = [
      makeProjectFinancialData({
        projectId: 'proj-1',
        feeStructure: makeFeeStructure('proj-1', 1_000_000),
        timeCostsCents: 850_000,
        disbursementsCents: 0,
        writeOffsCents: 0,
      }),
    ];

    const result = getProjectPortfolio(projects);
    // Margin: (1M - 850K) / 1M * 100 = 15%
    expect(result[0].marginPercent).toBe(15);
    expect(result[0].status).toBe('warning');
  });

  it('handles empty projects list', () => {
    const result = getProjectPortfolio([]);
    expect(result).toEqual([]);
  });
});

// ─── getUtilisationMetrics ───────────────────────────────────────────────────

describe('getUtilisationMetrics', () => {
  it('calculates firm-wide utilisation average', () => {
    const persons = [
      makePersonTimesheet({ userId: 'u1', billableHours: 140, nonBillableHours: 20, availableHours: 160 }),
      makePersonTimesheet({ userId: 'u2', billableHours: 80, nonBillableHours: 80, availableHours: 160 }),
    ];

    const result = getUtilisationMetrics(persons);
    // (140+80) / (160+160) * 100 = 68.75%
    expect(result.firmAverage).toBe(68.75);
    expect(result.billableHours).toBe(220);
    expect(result.nonBillableHours).toBe(100);
    expect(result.totalHours).toBe(320);
  });

  it('calculates per-person utilisation', () => {
    const persons = [
      makePersonTimesheet({
        userId: 'u1',
        displayName: 'Alice',
        billableHours: 120,
        availableHours: 160,
      }),
    ];

    const result = getUtilisationMetrics(persons);
    expect(result.byPerson[0].userId).toBe('u1');
    expect(result.byPerson[0].displayName).toBe('Alice');
    expect(result.byPerson[0].utilisation).toBe(75);
  });

  it('detects upward utilisation trend', () => {
    const persons = [
      makePersonTimesheet({
        userId: 'u1',
        billableHours: 140,
        availableHours: 160,
        previousPeriodBillableHours: 100,
        previousPeriodAvailableHours: 160,
      }),
    ];

    const result = getUtilisationMetrics(persons);
    // Current: 87.5%, Previous: 62.5% → diff = 25 > 2 → 'up'
    expect(result.byPerson[0].trend).toBe('up');
  });

  it('detects downward utilisation trend', () => {
    const persons = [
      makePersonTimesheet({
        userId: 'u1',
        billableHours: 80,
        availableHours: 160,
        previousPeriodBillableHours: 140,
        previousPeriodAvailableHours: 160,
      }),
    ];

    const result = getUtilisationMetrics(persons);
    // Current: 50%, Previous: 87.5% → diff = -37.5 < -2 → 'down'
    expect(result.byPerson[0].trend).toBe('down');
  });

  it('detects stable utilisation trend', () => {
    const persons = [
      makePersonTimesheet({
        userId: 'u1',
        billableHours: 120,
        availableHours: 160,
        previousPeriodBillableHours: 118,
        previousPeriodAvailableHours: 160,
      }),
    ];

    const result = getUtilisationMetrics(persons);
    // Current: 75%, Previous: 73.75% → diff = 1.25, within ±2 → 'stable'
    expect(result.byPerson[0].trend).toBe('stable');
  });

  it('handles zero available hours gracefully', () => {
    const persons = [
      makePersonTimesheet({
        userId: 'u1',
        billableHours: 0,
        nonBillableHours: 0,
        availableHours: 0,
        previousPeriodBillableHours: 0,
        previousPeriodAvailableHours: 0,
      }),
    ];

    const result = getUtilisationMetrics(persons);
    expect(result.firmAverage).toBe(0);
    expect(result.byPerson[0].utilisation).toBe(0);
    expect(result.byPerson[0].trend).toBe('stable');
  });

  it('handles empty persons list', () => {
    const result = getUtilisationMetrics([]);
    expect(result.firmAverage).toBe(0);
    expect(result.billableHours).toBe(0);
    expect(result.nonBillableHours).toBe(0);
    expect(result.totalHours).toBe(0);
    expect(result.byPerson).toEqual([]);
  });
});

// ─── classifyProjectStatus ───────────────────────────────────────────────────

describe('classifyProjectStatus', () => {
  it('returns healthy for margin >= 20%', () => {
    expect(classifyProjectStatus(25, 500_000, 1_000_000)).toBe('healthy');
    expect(classifyProjectStatus(20, 500_000, 1_000_000)).toBe('healthy');
  });

  it('returns warning for margin between 0% and 20%', () => {
    expect(classifyProjectStatus(10, 500_000, 1_000_000)).toBe('warning');
    expect(classifyProjectStatus(0, 500_000, 1_000_000)).toBe('warning');
  });

  it('returns loss_making for negative margin', () => {
    expect(classifyProjectStatus(-5, 600_000, 500_000)).toBe('loss_making');
  });

  it('returns over_run when costs exceed fee but margin is zero', () => {
    // This edge case: costsCents > feeCents, but margin could be 0 if writeoffs offset
    expect(classifyProjectStatus(0, 1_100_000, 1_000_000)).toBe('over_run');
  });
});

// ─── calculateUtilisationTrend ───────────────────────────────────────────────

describe('calculateUtilisationTrend', () => {
  it('returns up when diff exceeds +2 points', () => {
    expect(calculateUtilisationTrend(130, 160, 100, 160)).toBe('up');
  });

  it('returns down when diff exceeds -2 points', () => {
    expect(calculateUtilisationTrend(100, 160, 130, 160)).toBe('down');
  });

  it('returns stable when diff is within ±2 points', () => {
    expect(calculateUtilisationTrend(120, 160, 119, 160)).toBe('stable');
  });

  it('handles zero available hours in both periods', () => {
    expect(calculateUtilisationTrend(0, 0, 0, 0)).toBe('stable');
  });

  it('handles zero previous available hours', () => {
    // Current: 75%, Previous: 0% → diff = 75 > 2 → 'up'
    expect(calculateUtilisationTrend(120, 160, 0, 0)).toBe('up');
  });
});

// ─── exportToPdf ─────────────────────────────────────────────────────────────

describe('exportToPdf', () => {
  it('assembles all dashboard data into export structure', () => {
    const input = makeDefaultInput({
      projects: [
        makeProjectFinancialData({
          projectId: 'proj-1',
          projectName: 'Test Project',
          feeStructure: makeFeeStructure('proj-1', 1_000_000),
          timeCostsCents: 400_000,
          disbursementsCents: 50_000,
          writeOffsCents: 10_000,
          amountInvoicedCents: 200_000,
        }),
      ],
      personTimesheets: [
        makePersonTimesheet({ userId: 'u1', billableHours: 120, availableHours: 160 }),
      ],
      invoices: [
        makeInvoice({ status: 'paid', amountCents: 200_000, issuedDate: '2025-01-15' }),
      ],
    });

    const result = exportToPdf(input);
    expect(result.firmId).toBe('firm-1');
    expect(result.dateRange).toEqual(DEFAULT_DATE_RANGE);
    expect(result.generatedAt).toBeTruthy();
    expect(result.summaryMetrics).toBeDefined();
    expect(result.portfolio).toHaveLength(1);
    expect(result.utilisation).toBeDefined();
    expect(result.utilisation.firmAverage).toBe(75);
  });

  it('handles empty data gracefully', () => {
    const result = exportToPdf(makeDefaultInput());
    expect(result.summaryMetrics.totalRevenueCents).toBe(0);
    expect(result.portfolio).toEqual([]);
    expect(result.utilisation.firmAverage).toBe(0);
  });
});

// ─── Date Range Filtering (Requirement 12.5) ────────────────────────────────

describe('date range filtering', () => {
  it('supports monthly filtering', () => {
    const monthlyRange: DateRange = { type: 'monthly', from: '2025-03-01', to: '2025-03-31' };
    const input = makeDefaultInput({
      dateRange: monthlyRange,
      invoices: [
        makeInvoice({ id: 'inv-1', status: 'paid', amountCents: 100_000, issuedDate: '2025-03-15' }),
        makeInvoice({ id: 'inv-2', status: 'paid', amountCents: 200_000, issuedDate: '2025-04-01' }),
      ],
    });

    const result = getSummaryMetrics(input);
    expect(result.totalRevenueCents).toBe(100_000);
  });

  it('supports quarterly filtering', () => {
    const quarterlyRange: DateRange = { type: 'quarterly', from: '2025-01-01', to: '2025-03-31' };
    const input = makeDefaultInput({
      dateRange: quarterlyRange,
      invoices: [
        makeInvoice({ id: 'inv-1', status: 'paid', amountCents: 100_000, issuedDate: '2025-01-15' }),
        makeInvoice({ id: 'inv-2', status: 'paid', amountCents: 200_000, issuedDate: '2025-02-15' }),
        makeInvoice({ id: 'inv-3', status: 'paid', amountCents: 300_000, issuedDate: '2025-03-31' }),
        makeInvoice({ id: 'inv-4', status: 'paid', amountCents: 400_000, issuedDate: '2025-04-01' }),
      ],
    });

    const result = getSummaryMetrics(input);
    expect(result.totalRevenueCents).toBe(600_000);
  });

  it('supports annual filtering', () => {
    const annualRange: DateRange = { type: 'annually', from: '2025-01-01', to: '2025-12-31' };
    const input = makeDefaultInput({
      dateRange: annualRange,
      invoices: [
        makeInvoice({ id: 'inv-1', status: 'paid', amountCents: 100_000, issuedDate: '2025-06-15' }),
        makeInvoice({ id: 'inv-2', status: 'paid', amountCents: 200_000, issuedDate: '2025-12-31' }),
        makeInvoice({ id: 'inv-3', status: 'paid', amountCents: 300_000, issuedDate: '2026-01-01' }),
      ],
    });

    const result = getSummaryMetrics(input);
    expect(result.totalRevenueCents).toBe(300_000);
  });
});
