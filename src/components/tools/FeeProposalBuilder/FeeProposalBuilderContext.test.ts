import { describe, it, expect, beforeEach } from 'vitest';
import { calculatorReducer, createInitialState, roleToProfession } from './FeeProposalBuilderContext';
import type { CalculatorState } from './FeeProposalBuilderContext';

describe('roleToProfession', () => {
  it('maps architect role to architect profession', () => {
    expect(roleToProfession('architect')).toBe('architect');
  });

  it('maps engineer role to civilEngineer profession', () => {
    expect(roleToProfession('engineer')).toBe('civilEngineer');
  });

  it('maps quantity_surveyor role to quantitySurveyor profession', () => {
    expect(roleToProfession('quantity_surveyor')).toBe('quantitySurveyor');
  });

  it('maps town_planner role to townPlanner profession', () => {
    expect(roleToProfession('town_planner')).toBe('townPlanner');
  });

  it('maps fire_engineer role to fireEngineer profession', () => {
    expect(roleToProfession('fire_engineer')).toBe('fireEngineer');
  });

  it('maps site_manager role to constructionProjectManager profession', () => {
    expect(roleToProfession('site_manager')).toBe('constructionProjectManager');
  });

  it('returns undefined for unrecognised roles', () => {
    expect(roleToProfession('client')).toBeUndefined();
    expect(roleToProfession('admin')).toBeUndefined();
    expect(roleToProfession('freelancer')).toBeUndefined();
    expect(roleToProfession('unknown_role')).toBeUndefined();
  });

  it('returns undefined for undefined/empty role', () => {
    expect(roleToProfession(undefined)).toBeUndefined();
    expect(roleToProfession('')).toBeUndefined();
  });
});

describe('createInitialState', () => {
  it('creates state with default values for architect', () => {
    const state = createInitialState('architect');
    expect(state.profession).toBe('architect');
    expect(state.projectValue).toBe(0);
    expect(state.complexityId).toBe('medium');
    expect(state.vatApplicable).toBe(true);
    expect(state.disbursements).toEqual([]);
    expect(state.statutoryFees).toEqual([]);
    expect(state.result).toBeNull();
  });

  it('initializes all stages as applicable for the profession', () => {
    const state = createInitialState('architect');
    const stageIds = Object.keys(state.selectedStages);
    expect(stageIds.length).toBeGreaterThan(0);
    for (const id of stageIds) {
      expect(state.selectedStages[id].applicable).toBe(true);
      expect(state.selectedStages[id].reductionPercentage).toBe(0);
    }
  });

  it('initializes work category splits that sum to ~1.0', () => {
    const state = createInitialState('civilEngineer');
    const total = Object.values(state.workCategorySplits).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(1.0, 5);
  });
});

describe('calculatorReducer', () => {
  let initial: CalculatorState;

  beforeEach(() => {
    initial = createInitialState('architect');
  });

  it('SET_PROJECT_VALUE updates value and clears result', () => {
    const next = calculatorReducer(initial, { type: 'SET_PROJECT_VALUE', value: 5000000 });
    expect(next.projectValue).toBe(5000000);
    expect(next.result).toBeNull();
  });

  it('SET_COMPLEXITY updates complexityId and clears override', () => {
    const withOverride: CalculatorState = { ...initial, complexityOverride: { level: 'high', justification: 'test' } };
    const next = calculatorReducer(withOverride, { type: 'SET_COMPLEXITY', complexityId: 'low' });
    expect(next.complexityId).toBe('low');
    expect(next.complexityOverride).toBeUndefined();
  });

  it('SET_COMPLEXITY_OVERRIDE sets override', () => {
    const next = calculatorReducer(initial, { type: 'SET_COMPLEXITY_OVERRIDE', level: 'high', justification: 'Complex heritage building' });
    expect(next.complexityOverride).toEqual({ level: 'high', justification: 'Complex heritage building' });
  });

  it('TOGGLE_STAGE flips applicable flag', () => {
    const stageId = Object.keys(initial.selectedStages)[0];
    expect(initial.selectedStages[stageId].applicable).toBe(true);
    const next = calculatorReducer(initial, { type: 'TOGGLE_STAGE', stageId });
    expect(next.selectedStages[stageId].applicable).toBe(false);

    const toggled = calculatorReducer(next, { type: 'TOGGLE_STAGE', stageId });
    expect(toggled.selectedStages[stageId].applicable).toBe(true);
  });

  it('SET_STAGE_WEIGHT updates reductionPercentage', () => {
    const stageId = Object.keys(initial.selectedStages)[0];
    const next = calculatorReducer(initial, { type: 'SET_STAGE_WEIGHT', stageId, reductionPercentage: 25 });
    expect(next.selectedStages[stageId].reductionPercentage).toBe(25);
  });

  it('SET_SUBTASK_WEIGHT adds subtask weight', () => {
    const next = calculatorReducer(initial, { type: 'SET_SUBTASK_WEIGHT', stageId: 's1', subtaskId: 'brief', weight: 0.5 });
    expect(next.subTaskWeights?.['s1']?.['brief']).toBe(0.5);
  });

  it('ADD_DISBURSEMENT appends to list', () => {
    const next = calculatorReducer(initial, { type: 'ADD_DISBURSEMENT', disbursement: { label: 'Travel', amount: 1500 } });
    expect(next.disbursements).toHaveLength(1);
    expect(next.disbursements[0]).toEqual({ label: 'Travel', amount: 1500 });
  });

  it('REMOVE_DISBURSEMENT removes by index', () => {
    const withItems: CalculatorState = {
      ...initial,
      disbursements: [{ label: 'A', amount: 100 }, { label: 'B', amount: 200 }],
    };
    const next = calculatorReducer(withItems, { type: 'REMOVE_DISBURSEMENT', index: 0 });
    expect(next.disbursements).toHaveLength(1);
    expect(next.disbursements[0].label).toBe('B');
  });

  it('UPDATE_DISBURSEMENT replaces at index', () => {
    const withItems: CalculatorState = {
      ...initial,
      disbursements: [{ label: 'A', amount: 100 }],
    };
    const next = calculatorReducer(withItems, { type: 'UPDATE_DISBURSEMENT', index: 0, disbursement: { label: 'Updated', amount: 999 } });
    expect(next.disbursements[0]).toEqual({ label: 'Updated', amount: 999 });
  });

  it('ADD_STATUTORY_FEE appends to list', () => {
    const next = calculatorReducer(initial, { type: 'ADD_STATUTORY_FEE', fee: { label: 'Plan fee', amount: 3500 } });
    expect(next.statutoryFees).toHaveLength(1);
    expect(next.statutoryFees[0]).toEqual({ label: 'Plan fee', amount: 3500 });
  });

  it('REMOVE_STATUTORY_FEE removes by index', () => {
    const withItems: CalculatorState = {
      ...initial,
      statutoryFees: [{ label: 'A', amount: 100 }, { label: 'B', amount: 200 }],
    };
    const next = calculatorReducer(withItems, { type: 'REMOVE_STATUTORY_FEE', index: 0 });
    expect(next.statutoryFees).toHaveLength(1);
    expect(next.statutoryFees[0].label).toBe('B');
  });

  it('ADD_HOURLY_LINE appends to list', () => {
    const next = calculatorReducer(initial, { type: 'ADD_HOURLY_LINE', label: 'Design review', hours: 8, rate: 950 });
    expect(next.hourlyLines).toHaveLength(1);
    expect(next.hourlyLines[0]).toEqual({ label: 'Design review', hours: 8, rate: 950 });
  });

  it('REMOVE_HOURLY_LINE removes by index', () => {
    const withItems: CalculatorState = {
      ...initial,
      hourlyLines: [{ label: 'A', hours: 1, rate: 100 }, { label: 'B', hours: 2, rate: 200 }],
    };
    const next = calculatorReducer(withItems, { type: 'REMOVE_HOURLY_LINE', index: 0 });
    expect(next.hourlyLines).toHaveLength(1);
    expect(next.hourlyLines[0].label).toBe('B');
  });

  it('SET_DISCOUNT updates percentage and reason', () => {
    const next = calculatorReducer(initial, { type: 'SET_DISCOUNT', percentage: 10, reason: 'Repeat client' });
    expect(next.discount.percentage).toBe(10);
    expect(next.discount.reason).toBe('Repeat client');
  });

  it('SET_VAT toggles vatApplicable', () => {
    const next = calculatorReducer(initial, { type: 'SET_VAT', vatApplicable: false });
    expect(next.vatApplicable).toBe(false);
  });

  it('SET_TARIFF_OVERRIDE adds override key', () => {
    const next = calculatorReducer(initial, { type: 'SET_TARIFF_OVERRIDE', key: 'hourlyRate', value: 850 });
    expect(next.tariffOverrides['hourlyRate']).toBe(850);
  });

  it('CLEAR_TARIFF_OVERRIDE removes override key', () => {
    const withOverride: CalculatorState = { ...initial, tariffOverrides: { hourlyRate: 850 } };
    const next = calculatorReducer(withOverride, { type: 'CLEAR_TARIFF_OVERRIDE', key: 'hourlyRate' });
    expect(next.tariffOverrides['hourlyRate']).toBeUndefined();
  });

  it('SET_RESULT stores calculation result', () => {
    const mockResult = { guidelineProfessionalFee: 100000 } as any;
    const next = calculatorReducer(initial, { type: 'SET_RESULT', result: mockResult });
    expect(next.result).toBe(mockResult);
  });

  it('SET_RESULT with null clears result', () => {
    const withResult: CalculatorState = { ...initial, result: { guidelineProfessionalFee: 100000 } as any };
    const next = calculatorReducer(withResult, { type: 'SET_RESULT', result: null });
    expect(next.result).toBeNull();
  });

  it('RESET returns fresh initial state for current profession', () => {
    const modified: CalculatorState = { ...initial, projectValue: 9999999, complexityId: 'high' };
    const next = calculatorReducer(modified, { type: 'RESET' });
    expect(next.projectValue).toBe(0);
    expect(next.complexityId).toBe('medium');
    expect(next.profession).toBe('architect');
  });

  it('SET_PROFESSION resets state to new profession', () => {
    const next = calculatorReducer(initial, { type: 'SET_PROFESSION', profession: 'quantitySurveyor' });
    expect(next.profession).toBe('quantitySurveyor');
    expect(next.projectValue).toBe(0);
    // QS stages should be different from architect stages
    const qsStageIds = Object.keys(next.selectedStages);
    const archStageIds = Object.keys(initial.selectedStages);
    // QS has 6 stages with 'qs' prefix, architect has 7 stages with 's' prefix
    expect(qsStageIds[0]).toMatch(/^qs/);
    expect(archStageIds[0]).toMatch(/^s/);
  });
});
