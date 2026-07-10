/**
 * Unit tests for CrmPipelineService
 *
 * Tests opportunity CRUD, weighted value calculation, high-confidence flagging,
 * and win/lose transitions.
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5
 */
import {
  createOpportunity,
  updateOpportunity,
  winOpportunity,
  loseOpportunity,
  getWeightedPipelineValue,
  getHighConfidenceOpportunities,
  getCapacityImpactOpportunities,
  getPipelineForecastEntries,
  calculateWeightedValue,
  isHighConfidence,
  HIGH_CONFIDENCE_THRESHOLD,
} from '../crmPipelineService';
import type { PipelineOpportunity, CreatePipelineOpportunityInput } from '../types';

// ─── Test Fixtures ──────────────────────────────────────────────────────

const FIRM_ID = 'firm_001';

function makeInput(overrides: Partial<CreatePipelineOpportunityInput> = {}): CreatePipelineOpportunityInput {
  return {
    firmId: FIRM_ID,
    projectId: 'proj_001',
    title: 'New Office Tower',
    estimatedFeeCents: 500_000_00, // R500,000
    probability: 60,
    expectedStartDate: '2025-06-01',
    requiredDisciplines: ['architect', 'technologist'],
    requiredHeadcount: 3,
    ...overrides,
  };
}

function makeOpportunity(overrides: Partial<PipelineOpportunity> = {}): PipelineOpportunity {
  return {
    id: 'opp_001',
    firmId: FIRM_ID,
    projectId: 'proj_001',
    title: 'New Office Tower',
    stage: 'stage_1_inception' as unknown as import('@/types').ProjectStage,
    status: 'active',
    estimatedValueCents: 500_000_00,
    probability: 60,
    expectedCloseDate: '2025-06-01',
    createdBy: 'user_001',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    requiredDisciplines: ['architect', 'technologist'],
    requiredHeadcount: 3,
    expectedStartDate: '2025-06-01',
    isHighConfidence: false,
    includedInCapacity: false,
    weightedValueCents: 300_000_00, // 500k * 60%
    ...overrides,
  };
}

// ─── calculateWeightedValue ─────────────────────────────────────────────

describe('calculateWeightedValue', () => {
  it('should calculate weighted value as fee × (probability / 100)', () => {
    expect(calculateWeightedValue(1_000_000, 50)).toBe(500_000);
    expect(calculateWeightedValue(500_000_00, 60)).toBe(300_000_00);
    expect(calculateWeightedValue(100_000_00, 100)).toBe(100_000_00);
    expect(calculateWeightedValue(100_000_00, 0)).toBe(0);
  });

  it('should round to nearest integer', () => {
    // 333_333 * 33 / 100 = 109,999.89 → rounds to 109,999.89 → 110000
    expect(calculateWeightedValue(333_333, 33)).toBe(110_000);
  });
});

// ─── isHighConfidence ───────────────────────────────────────────────────

describe('isHighConfidence', () => {
  it('should return false when probability <= 75%', () => {
    expect(isHighConfidence(0)).toBe(false);
    expect(isHighConfidence(50)).toBe(false);
    expect(isHighConfidence(75)).toBe(false); // boundary: NOT > 75
  });

  it('should return true when probability > 75%', () => {
    expect(isHighConfidence(76)).toBe(true);
    expect(isHighConfidence(80)).toBe(true);
    expect(isHighConfidence(100)).toBe(true);
  });

  it('should have HIGH_CONFIDENCE_THRESHOLD at 75', () => {
    expect(HIGH_CONFIDENCE_THRESHOLD).toBe(75);
  });
});

// ─── createOpportunity ──────────────────────────────────────────────────

describe('createOpportunity', () => {
  it('should create an opportunity with all required fields', () => {
    const input = makeInput();
    const result = createOpportunity(input);

    expect(result.firmId).toBe(FIRM_ID);
    expect(result.projectId).toBe('proj_001');
    expect(result.title).toBe('New Office Tower');
    expect(result.estimatedValueCents).toBe(500_000_00);
    expect(result.probability).toBe(60);
    expect(result.requiredDisciplines).toEqual(['architect', 'technologist']);
    expect(result.requiredHeadcount).toBe(3);
    expect(result.expectedStartDate).toBe('2025-06-01');
    expect(result.status).toBe('active');
    expect(result.id).toBeTruthy();
    expect(result.createdAt).toBeTruthy();
  });

  it('should calculate weighted value correctly', () => {
    const result = createOpportunity(makeInput({ estimatedFeeCents: 1_000_000, probability: 40 }));
    expect(result.weightedValueCents).toBe(400_000);
  });

  it('should flag as high-confidence when probability > 75%', () => {
    const result = createOpportunity(makeInput({ probability: 80 }));
    expect(result.isHighConfidence).toBe(true);
    expect(result.includedInCapacity).toBe(true);
  });

  it('should NOT flag as high-confidence when probability <= 75%', () => {
    const result = createOpportunity(makeInput({ probability: 75 }));
    expect(result.isHighConfidence).toBe(false);
    expect(result.includedInCapacity).toBe(false);
  });

  it('should throw if probability is out of range', () => {
    expect(() => createOpportunity(makeInput({ probability: -1 }))).toThrow('Probability must be between 0 and 100.');
    expect(() => createOpportunity(makeInput({ probability: 101 }))).toThrow('Probability must be between 0 and 100.');
  });

  it('should throw if required fields are missing', () => {
    expect(() => createOpportunity(makeInput({ firmId: '' }))).toThrow('firmId, projectId, and title are required.');
    expect(() => createOpportunity(makeInput({ projectId: '' }))).toThrow('firmId, projectId, and title are required.');
    expect(() => createOpportunity(makeInput({ title: '' }))).toThrow('firmId, projectId, and title are required.');
  });

  it('should throw if no disciplines specified', () => {
    expect(() => createOpportunity(makeInput({ requiredDisciplines: [] }))).toThrow(
      'At least one required discipline must be specified.',
    );
  });

  it('should throw if estimatedFeeCents is negative', () => {
    expect(() => createOpportunity(makeInput({ estimatedFeeCents: -100 }))).toThrow(
      'estimatedFeeCents must not be negative.',
    );
  });
});

// ─── updateOpportunity ──────────────────────────────────────────────────

describe('updateOpportunity', () => {
  it('should update specified fields and recalculate derived values', () => {
    const existing = makeOpportunity({ probability: 50, estimatedValueCents: 1_000_000 });
    const result = updateOpportunity(existing, { probability: 80 });

    expect(result.probability).toBe(80);
    expect(result.weightedValueCents).toBe(800_000); // 1M * 80%
    expect(result.isHighConfidence).toBe(true);
    expect(result.includedInCapacity).toBe(true);
  });

  it('should recalculate when estimated fee changes', () => {
    const existing = makeOpportunity({ probability: 50, estimatedValueCents: 1_000_000 });
    const result = updateOpportunity(existing, { estimatedValueCents: 2_000_000 });

    expect(result.estimatedValueCents).toBe(2_000_000);
    expect(result.weightedValueCents).toBe(1_000_000); // 2M * 50%
  });

  it('should preserve existing fields not in updates', () => {
    const existing = makeOpportunity();
    const result = updateOpportunity(existing, { probability: 90 });

    expect(result.firmId).toBe(existing.firmId);
    expect(result.projectId).toBe(existing.projectId);
    expect(result.title).toBe(existing.title);
    expect(result.requiredDisciplines).toEqual(existing.requiredDisciplines);
  });

  it('should throw if updated probability is out of range', () => {
    const existing = makeOpportunity();
    expect(() => updateOpportunity(existing, { probability: 150 })).toThrow('Probability must be between 0 and 100.');
    expect(() => updateOpportunity(existing, { probability: -5 })).toThrow('Probability must be between 0 and 100.');
  });

  it('should update the updatedAt timestamp', () => {
    const existing = makeOpportunity({ updatedAt: '2025-01-01T00:00:00.000Z' });
    const result = updateOpportunity(existing, { probability: 80 });
    expect(result.updatedAt).not.toBe('2025-01-01T00:00:00.000Z');
  });
});

// ─── winOpportunity ─────────────────────────────────────────────────────

describe('winOpportunity', () => {
  it('should transition opportunity to won with 100% probability', () => {
    const existing = makeOpportunity({ probability: 80 });
    const { opportunity } = winOpportunity(existing);

    expect(opportunity.status).toBe('won');
    expect(opportunity.probability).toBe(100);
    expect(opportunity.weightedValueCents).toBe(existing.estimatedValueCents);
    expect(opportunity.isHighConfidence).toBe(true);
    expect(opportunity.includedInCapacity).toBe(true);
    expect(opportunity.closedAt).toBeTruthy();
  });

  it('should produce a pipeline_won trigger event', () => {
    const existing = makeOpportunity();
    const { triggerEvent } = winOpportunity(existing);

    expect(triggerEvent.type).toBe('pipeline_won');
    expect(triggerEvent).toHaveProperty('opportunityId', existing.id);
    expect(triggerEvent).toHaveProperty('projectId', existing.projectId);
  });

  it('should throw if opportunity is already won', () => {
    const existing = makeOpportunity({ status: 'won' });
    expect(() => winOpportunity(existing)).toThrow('Opportunity is already won.');
  });

  it('should throw if opportunity is lost', () => {
    const existing = makeOpportunity({ status: 'lost' });
    expect(() => winOpportunity(existing)).toThrow('Cannot win an opportunity that has been lost or abandoned.');
  });
});

// ─── loseOpportunity ────────────────────────────────────────────────────

describe('loseOpportunity', () => {
  it('should transition opportunity to lost with 0% probability', () => {
    const existing = makeOpportunity({ probability: 60 });
    const { opportunity } = loseOpportunity(existing, 'Client chose competitor');

    expect(opportunity.status).toBe('lost');
    expect(opportunity.probability).toBe(0);
    expect(opportunity.weightedValueCents).toBe(0);
    expect(opportunity.isHighConfidence).toBe(false);
    expect(opportunity.includedInCapacity).toBe(false);
    expect(opportunity.closedAt).toBeTruthy();
    expect(opportunity.closedReason).toBe('Client chose competitor');
  });

  it('should produce a pipeline_lost trigger event', () => {
    const existing = makeOpportunity();
    const { triggerEvent } = loseOpportunity(existing, 'Budget cut');

    expect(triggerEvent.type).toBe('pipeline_lost');
    expect(triggerEvent).toHaveProperty('opportunityId', existing.id);
  });

  it('should throw if opportunity is already lost', () => {
    const existing = makeOpportunity({ status: 'lost' });
    expect(() => loseOpportunity(existing, 'Already lost')).toThrow('Opportunity is already lost.');
  });

  it('should throw if opportunity is already won', () => {
    const existing = makeOpportunity({ status: 'won' });
    expect(() => loseOpportunity(existing, 'Changed mind')).toThrow(
      'Cannot lose an opportunity that has already been won.',
    );
  });
});

// ─── getWeightedPipelineValue ───────────────────────────────────────────

describe('getWeightedPipelineValue', () => {
  it('should sum weighted values of active opportunities for the firm', () => {
    const opportunities: PipelineOpportunity[] = [
      makeOpportunity({ id: 'opp_1', weightedValueCents: 300_000, status: 'active' }),
      makeOpportunity({ id: 'opp_2', weightedValueCents: 200_000, status: 'active' }),
      makeOpportunity({ id: 'opp_3', weightedValueCents: 100_000, status: 'won' }), // excluded
      makeOpportunity({ id: 'opp_4', weightedValueCents: 150_000, status: 'active', firmId: 'other_firm' }), // excluded
    ];

    expect(getWeightedPipelineValue(opportunities, FIRM_ID)).toBe(500_000);
  });

  it('should return 0 for empty pipeline', () => {
    expect(getWeightedPipelineValue([], FIRM_ID)).toBe(0);
  });

  it('should return 0 when no active opportunities exist for firm', () => {
    const opportunities: PipelineOpportunity[] = [
      makeOpportunity({ status: 'won' }),
      makeOpportunity({ status: 'lost' }),
    ];
    expect(getWeightedPipelineValue(opportunities, FIRM_ID)).toBe(0);
  });
});

// ─── getHighConfidenceOpportunities ─────────────────────────────────────

describe('getHighConfidenceOpportunities', () => {
  it('should return only active high-confidence opportunities for the firm', () => {
    const opportunities: PipelineOpportunity[] = [
      makeOpportunity({ id: 'opp_1', isHighConfidence: true, status: 'active' }),
      makeOpportunity({ id: 'opp_2', isHighConfidence: false, status: 'active' }),
      makeOpportunity({ id: 'opp_3', isHighConfidence: true, status: 'won' }), // excluded: not active
      makeOpportunity({ id: 'opp_4', isHighConfidence: true, status: 'active', firmId: 'other_firm' }), // excluded: different firm
    ];

    const result = getHighConfidenceOpportunities(opportunities, FIRM_ID);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('opp_1');
  });

  it('should return empty array if no high-confidence opportunities', () => {
    const opportunities: PipelineOpportunity[] = [
      makeOpportunity({ isHighConfidence: false }),
    ];
    expect(getHighConfidenceOpportunities(opportunities, FIRM_ID)).toHaveLength(0);
  });
});

// ─── getCapacityImpactOpportunities ─────────────────────────────────────

describe('getCapacityImpactOpportunities', () => {
  it('should return opportunities included in capacity planning', () => {
    const opportunities: PipelineOpportunity[] = [
      makeOpportunity({ id: 'opp_1', includedInCapacity: true, status: 'active' }),
      makeOpportunity({ id: 'opp_2', includedInCapacity: false, status: 'active' }),
      makeOpportunity({ id: 'opp_3', includedInCapacity: true, status: 'lost' }), // excluded: not active
    ];

    const result = getCapacityImpactOpportunities(opportunities, FIRM_ID);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('opp_1');
  });
});

// ─── getPipelineForecastEntries ─────────────────────────────────────────

describe('getPipelineForecastEntries', () => {
  it('should generate forecast entries for active opportunities', () => {
    const opportunities: PipelineOpportunity[] = [
      makeOpportunity({ id: 'opp_1', title: 'Project A', weightedValueCents: 300_000, expectedStartDate: '2025-06-01' }),
      makeOpportunity({ id: 'opp_2', title: 'Project B', weightedValueCents: 200_000, status: 'lost' }), // excluded
    ];

    const entries = getPipelineForecastEntries(opportunities, FIRM_ID);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      projectId: 'proj_001',
      projectName: 'Project A',
      amountCents: 300_000,
      expectedStartDate: '2025-06-01',
    });
  });

  it('should return empty array for no active opportunities', () => {
    expect(getPipelineForecastEntries([], FIRM_ID)).toEqual([]);
  });
});
