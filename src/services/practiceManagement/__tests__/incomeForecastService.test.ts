/**
 * Unit tests for IncomeForecastService
 *
 * Tests income forecasting logic including:
 * - Monthly forecast generation
 * - Confidence level categorisation
 * - Probable-to-confirmed transitions on stage_completed events
 * - Rolling 12-month forecast view
 * - Event-driven updates (invoice_raised, pipeline_won, pipeline_lost)
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
 */

import {
  generateForecast,
  getMonthlyBreakdown,
  updateForecastOnEvent,
  determineConfidence,
  generateMonthRange,
  DEFAULT_FORECAST_MONTHS,
} from '../incomeForecastService';
import type {
  ForecastProjectInput,
  ForecastPipelineInput,
  ForecastState,
  ForecastEntryState,
  ForecastStageInput,
} from '../incomeForecastService';
import type { ForecastTriggerEvent } from '../types';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeStage(overrides: Partial<ForecastStageInput> = {}): ForecastStageInput {
  return {
    stage: 'stage_1_inception',
    feeCents: 100_000_00, // R100,000
    expectedCompletionMonth: '2025-03',
    invoiceRaised: false,
    nearingCompletion: false,
    ...overrides,
  };
}

function makeProject(overrides: Partial<ForecastProjectInput> = {}): ForecastProjectInput {
  return {
    projectId: 'proj-1',
    projectName: 'Test Project',
    stages: [makeStage()],
    ...overrides,
  };
}

function makePipelineEntry(overrides: Partial<ForecastPipelineInput> = {}): ForecastPipelineInput {
  return {
    projectId: 'pipeline-1',
    projectName: 'Pipeline Opportunity',
    weightedValueCents: 50_000_00, // R50,000 (weighted)
    expectedMonth: '2025-06',
    ...overrides,
  };
}

// ─── determineConfidence ─────────────────────────────────────────────────────

describe('determineConfidence', () => {
  it('returns confirmed when invoice is raised', () => {
    const stage = makeStage({ invoiceRaised: true, nearingCompletion: true });
    expect(determineConfidence(stage)).toBe('confirmed');
  });

  it('returns probable when stage is nearing completion but no invoice raised', () => {
    const stage = makeStage({ invoiceRaised: false, nearingCompletion: true });
    expect(determineConfidence(stage)).toBe('probable');
  });

  it('returns pipeline when neither invoiced nor nearing completion', () => {
    const stage = makeStage({ invoiceRaised: false, nearingCompletion: false });
    expect(determineConfidence(stage)).toBe('pipeline');
  });

  it('confirmed takes priority over probable', () => {
    // If both flags are true, confirmed wins (invoice already raised)
    const stage = makeStage({ invoiceRaised: true, nearingCompletion: true });
    expect(determineConfidence(stage)).toBe('confirmed');
  });
});

// ─── generateMonthRange ──────────────────────────────────────────────────────

describe('generateMonthRange', () => {
  it('generates correct number of months', () => {
    const range = generateMonthRange('2025-01', 6);
    expect(range).toHaveLength(6);
  });

  it('starts from the given month', () => {
    const range = generateMonthRange('2025-03', 3);
    expect(range[0]).toBe('2025-03');
    expect(range[1]).toBe('2025-04');
    expect(range[2]).toBe('2025-05');
  });

  it('rolls over year boundary', () => {
    const range = generateMonthRange('2025-11', 4);
    expect(range).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('handles single month', () => {
    const range = generateMonthRange('2025-07', 1);
    expect(range).toEqual(['2025-07']);
  });

  it('returns empty array for zero months', () => {
    const range = generateMonthRange('2025-01', 0);
    expect(range).toEqual([]);
  });
});

// ─── getMonthlyBreakdown ─────────────────────────────────────────────────────

describe('getMonthlyBreakdown', () => {
  it('generates 12 months by default', () => {
    const result = getMonthlyBreakdown([], [], undefined, '2025-01');
    expect(result).toHaveLength(DEFAULT_FORECAST_MONTHS);
  });

  it('generates specified number of months', () => {
    const result = getMonthlyBreakdown([], [], 6, '2025-01');
    expect(result).toHaveLength(6);
  });

  it('places confirmed entry in the correct month', () => {
    const project = makeProject({
      stages: [makeStage({ expectedCompletionMonth: '2025-03', invoiceRaised: true })],
    });
    const result = getMonthlyBreakdown([project], [], 6, '2025-01');
    const marchEntry = result.find((m) => m.month === '2025-03');

    expect(marchEntry).toBeDefined();
    expect(marchEntry!.confirmedCents).toBe(100_000_00);
    expect(marchEntry!.probableCents).toBe(0);
    expect(marchEntry!.pipelineCents).toBe(0);
  });

  it('places probable entry in the correct month', () => {
    const project = makeProject({
      stages: [
        makeStage({
          expectedCompletionMonth: '2025-04',
          invoiceRaised: false,
          nearingCompletion: true,
        }),
      ],
    });
    const result = getMonthlyBreakdown([project], [], 6, '2025-01');
    const aprilEntry = result.find((m) => m.month === '2025-04');

    expect(aprilEntry).toBeDefined();
    expect(aprilEntry!.probableCents).toBe(100_000_00);
    expect(aprilEntry!.confirmedCents).toBe(0);
  });

  it('places pipeline entry in the correct month', () => {
    const pipeline = makePipelineEntry({ expectedMonth: '2025-06' });
    const result = getMonthlyBreakdown([], [pipeline], 6, '2025-01');
    const juneEntry = result.find((m) => m.month === '2025-06');

    expect(juneEntry).toBeDefined();
    expect(juneEntry!.pipelineCents).toBe(50_000_00);
    expect(juneEntry!.confirmedCents).toBe(0);
    expect(juneEntry!.probableCents).toBe(0);
  });

  it('calculates totalCents as sum of all confidence levels', () => {
    const project = makeProject({
      stages: [
        makeStage({
          expectedCompletionMonth: '2025-03',
          invoiceRaised: true,
          feeCents: 100_00,
        }),
        makeStage({
          stage: 'stage_2_concept',
          expectedCompletionMonth: '2025-03',
          nearingCompletion: true,
          feeCents: 200_00,
        }),
      ],
    });
    const pipeline = makePipelineEntry({
      expectedMonth: '2025-03',
      weightedValueCents: 300_00,
    });

    const result = getMonthlyBreakdown([project], [pipeline], 6, '2025-01');
    const marchEntry = result.find((m) => m.month === '2025-03');

    expect(marchEntry!.totalCents).toBe(100_00 + 200_00 + 300_00);
  });

  it('includes project details in monthly entry', () => {
    const project = makeProject({
      projectId: 'proj-abc',
      projectName: 'ABC Project',
      stages: [makeStage({ expectedCompletionMonth: '2025-02', invoiceRaised: true })],
    });

    const result = getMonthlyBreakdown([project], [], 3, '2025-01');
    const febEntry = result.find((m) => m.month === '2025-02');

    expect(febEntry!.projects).toHaveLength(1);
    expect(febEntry!.projects[0]).toEqual({
      projectId: 'proj-abc',
      projectName: 'ABC Project',
      amountCents: 100_000_00,
      confidence: 'confirmed',
      stage: 'stage_1_inception',
    });
  });

  it('returns zero totals for months with no entries', () => {
    const result = getMonthlyBreakdown([], [], 3, '2025-01');

    for (const month of result) {
      expect(month.confirmedCents).toBe(0);
      expect(month.probableCents).toBe(0);
      expect(month.pipelineCents).toBe(0);
      expect(month.totalCents).toBe(0);
      expect(month.projects).toHaveLength(0);
    }
  });

  it('aggregates multiple projects in the same month', () => {
    const project1 = makeProject({
      projectId: 'proj-1',
      stages: [makeStage({ expectedCompletionMonth: '2025-02', invoiceRaised: true, feeCents: 100_00 })],
    });
    const project2 = makeProject({
      projectId: 'proj-2',
      projectName: 'Project Two',
      stages: [makeStage({ expectedCompletionMonth: '2025-02', invoiceRaised: true, feeCents: 200_00 })],
    });

    const result = getMonthlyBreakdown([project1, project2], [], 3, '2025-01');
    const febEntry = result.find((m) => m.month === '2025-02');

    expect(febEntry!.confirmedCents).toBe(300_00);
    expect(febEntry!.projects).toHaveLength(2);
  });
});

// ─── generateForecast ────────────────────────────────────────────────────────

describe('generateForecast', () => {
  it('generates a complete forecast with firmId and generatedAt', () => {
    const result = generateForecast('firm-1', [], [], 6, '2025-01');

    expect(result.firmId).toBe('firm-1');
    expect(result.generatedAt).toBeDefined();
    expect(result.months).toHaveLength(6);
  });

  it('defaults to 12-month rolling forecast', () => {
    const result = generateForecast('firm-1', [], [], undefined, '2025-01');
    expect(result.months).toHaveLength(12);
  });

  it('calculates correct totals across all months', () => {
    const project = makeProject({
      stages: [
        makeStage({ expectedCompletionMonth: '2025-02', invoiceRaised: true, feeCents: 50_000_00 }),
        makeStage({
          stage: 'stage_2_concept',
          expectedCompletionMonth: '2025-04',
          nearingCompletion: true,
          feeCents: 80_000_00,
        }),
      ],
    });
    const pipeline = makePipelineEntry({
      expectedMonth: '2025-06',
      weightedValueCents: 30_000_00,
    });

    const result = generateForecast('firm-1', [project], [pipeline], 12, '2025-01');

    expect(result.totalConfirmedCents).toBe(50_000_00);
    expect(result.totalProbableCents).toBe(80_000_00);
    expect(result.totalPipelineCents).toBe(30_000_00);
  });

  it('includes entries outside month range as zero in totals', () => {
    // Stage completion month is beyond the forecast window
    const project = makeProject({
      stages: [makeStage({ expectedCompletionMonth: '2026-06', invoiceRaised: true })],
    });

    const result = generateForecast('firm-1', [project], [], 6, '2025-01');

    // Entry is outside the 6-month window so won't appear in any monthly entry
    expect(result.totalConfirmedCents).toBe(0);
  });
});

// ─── updateForecastOnEvent ───────────────────────────────────────────────────

describe('updateForecastOnEvent', () => {
  const baseForecastState: ForecastState = {
    firmId: 'firm-1',
    entries: [
      {
        projectId: 'proj-1',
        projectName: 'Project One',
        amountCents: 100_000_00,
        confidence: 'probable',
        month: '2025-03',
        stage: 'stage_2_concept',
      },
      {
        projectId: 'proj-1',
        projectName: 'Project One',
        amountCents: 50_000_00,
        confidence: 'confirmed',
        month: '2025-02',
        stage: 'stage_1_inception',
      },
      {
        projectId: 'pipeline-1',
        projectName: 'Pipeline Opp',
        amountCents: 75_000_00,
        confidence: 'pipeline',
        month: '2025-06',
      },
    ],
  };

  describe('stage_completed event', () => {
    it('moves probable to confirmed for matching project and stage', () => {
      const event: ForecastTriggerEvent = {
        type: 'stage_completed',
        projectId: 'proj-1',
        stage: 'stage_2_concept',
      };

      const result = updateForecastOnEvent(baseForecastState, event);
      const updatedEntry = result.entries.find(
        (e) => e.projectId === 'proj-1' && e.stage === 'stage_2_concept',
      );

      expect(updatedEntry!.confidence).toBe('confirmed');
    });

    it('does NOT move confirmed entries (idempotent)', () => {
      const event: ForecastTriggerEvent = {
        type: 'stage_completed',
        projectId: 'proj-1',
        stage: 'stage_1_inception',
      };

      const result = updateForecastOnEvent(baseForecastState, event);
      const confirmedEntry = result.entries.find(
        (e) => e.projectId === 'proj-1' && e.stage === 'stage_1_inception',
      );

      // Was already confirmed, stays confirmed
      expect(confirmedEntry!.confidence).toBe('confirmed');
    });

    it('does NOT move pipeline entries on stage_completed', () => {
      const event: ForecastTriggerEvent = {
        type: 'stage_completed',
        projectId: 'pipeline-1',
        stage: 'stage_1_inception',
      };

      const result = updateForecastOnEvent(baseForecastState, event);
      const pipelineEntry = result.entries.find((e) => e.projectId === 'pipeline-1');

      expect(pipelineEntry!.confidence).toBe('pipeline');
    });

    it('does not modify entries for other projects', () => {
      const event: ForecastTriggerEvent = {
        type: 'stage_completed',
        projectId: 'proj-99',
        stage: 'stage_2_concept',
      };

      const result = updateForecastOnEvent(baseForecastState, event);
      expect(result.entries).toEqual(baseForecastState.entries);
    });
  });

  describe('invoice_raised event', () => {
    it('moves all non-confirmed entries for the project to confirmed', () => {
      const stateWithProbable: ForecastState = {
        firmId: 'firm-1',
        entries: [
          {
            projectId: 'proj-1',
            projectName: 'Project One',
            amountCents: 100_000_00,
            confidence: 'probable',
            month: '2025-03',
            stage: 'stage_2_concept',
          },
        ],
      };

      const event: ForecastTriggerEvent = {
        type: 'invoice_raised',
        projectId: 'proj-1',
        amountCents: 100_000_00,
      };

      const result = updateForecastOnEvent(stateWithProbable, event);
      expect(result.entries[0].confidence).toBe('confirmed');
    });

    it('does not affect entries for other projects', () => {
      const event: ForecastTriggerEvent = {
        type: 'invoice_raised',
        projectId: 'proj-1',
        amountCents: 100_000_00,
      };

      const result = updateForecastOnEvent(baseForecastState, event);
      const pipelineEntry = result.entries.find((e) => e.projectId === 'pipeline-1');
      expect(pipelineEntry!.confidence).toBe('pipeline');
    });
  });

  describe('pipeline_won event', () => {
    it('moves pipeline entries to probable for the won project', () => {
      const event: ForecastTriggerEvent = {
        type: 'pipeline_won',
        opportunityId: 'opp-1',
        projectId: 'pipeline-1',
      };

      const result = updateForecastOnEvent(baseForecastState, event);
      const entry = result.entries.find((e) => e.projectId === 'pipeline-1');
      expect(entry!.confidence).toBe('probable');
    });

    it('does not affect entries for other projects', () => {
      const event: ForecastTriggerEvent = {
        type: 'pipeline_won',
        opportunityId: 'opp-1',
        projectId: 'pipeline-1',
      };

      const result = updateForecastOnEvent(baseForecastState, event);
      const probableEntry = result.entries.find(
        (e) => e.projectId === 'proj-1' && e.confidence === 'probable',
      );
      expect(probableEntry).toBeDefined();
    });
  });

  describe('pipeline_lost event', () => {
    it('removes pipeline entries for the lost opportunity', () => {
      const event: ForecastTriggerEvent = {
        type: 'pipeline_lost',
        opportunityId: 'pipeline-1',
      };

      const result = updateForecastOnEvent(baseForecastState, event);
      const pipelineEntries = result.entries.filter((e) => e.projectId === 'pipeline-1');
      expect(pipelineEntries).toHaveLength(0);
    });

    it('does not remove non-pipeline entries for the same project', () => {
      const stateWithMixed: ForecastState = {
        firmId: 'firm-1',
        entries: [
          {
            projectId: 'proj-x',
            projectName: 'Project X',
            amountCents: 100_00,
            confidence: 'confirmed',
            month: '2025-02',
          },
          {
            projectId: 'proj-x',
            projectName: 'Project X',
            amountCents: 200_00,
            confidence: 'pipeline',
            month: '2025-05',
          },
        ],
      };

      const event: ForecastTriggerEvent = {
        type: 'pipeline_lost',
        opportunityId: 'proj-x',
      };

      const result = updateForecastOnEvent(stateWithMixed, event);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].confidence).toBe('confirmed');
    });

    it('does not affect entries for other projects', () => {
      const event: ForecastTriggerEvent = {
        type: 'pipeline_lost',
        opportunityId: 'pipeline-1',
      };

      const result = updateForecastOnEvent(baseForecastState, event);
      const otherEntries = result.entries.filter((e) => e.projectId !== 'pipeline-1');
      expect(otherEntries).toHaveLength(2);
    });
  });

  describe('timeline_changed event', () => {
    it('returns unchanged entries (signals need for full regeneration)', () => {
      const event: ForecastTriggerEvent = {
        type: 'timeline_changed',
        projectId: 'proj-1',
      };

      const result = updateForecastOnEvent(baseForecastState, event);
      expect(result.entries).toEqual(baseForecastState.entries);
    });
  });

  it('does not mutate the original state', () => {
    const event: ForecastTriggerEvent = {
      type: 'stage_completed',
      projectId: 'proj-1',
      stage: 'stage_2_concept',
    };

    const originalEntries = [...baseForecastState.entries];
    updateForecastOnEvent(baseForecastState, event);

    expect(baseForecastState.entries).toEqual(originalEntries);
  });
});
