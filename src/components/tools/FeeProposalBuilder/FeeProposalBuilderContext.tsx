import { createContext, useContext, useReducer, useState, type Dispatch, type ReactNode } from 'react';
import type { Profession, SourceVersion, FeeCalculationResult } from '@/services/professionalFee/types';
import type { UserProfile } from '@/types';
import { ProfessionProfileRegistry } from '@/services/professionalFee/profiles';

// --- Calculator State ---

export interface CalculatorState {
  profession: Profession;
  projectValue: number;
  complexityId: string;
  complexityOverride?: { level: string; justification: string };
  workCategorySplits: Record<string, number>;
  selectedStages: Record<string, { applicable: boolean; reductionPercentage: number }>;
  subTaskWeights?: Record<string, Record<string, number>>;
  hourlyLines: Array<{ label: string; hours: number; rate: number }>;
  unitLines: Array<{ label: string; quantity: number; unitRate: number; factor?: number }>;
  disbursements: Array<{ label: string; amount: number }>;
  statutoryFees: Array<{ label: string; amount: number }>;
  discount: { percentage: number; reason: string; appliesToDisbursements: boolean; appliesToStatutoryFees: boolean };
  vatApplicable: boolean;
  tariffOverrides: Record<string, number>;
  result: FeeCalculationResult | null;
}

// --- Calculator Actions ---

export type CalculatorAction =
  | { type: 'SET_PROFESSION'; profession: Profession }
  | { type: 'SET_PROJECT_VALUE'; value: number }
  | { type: 'SET_COMPLEXITY'; complexityId: string }
  | { type: 'SET_COMPLEXITY_OVERRIDE'; level: string; justification: string }
  | { type: 'SET_WORK_CATEGORY_SPLITS'; splits: Record<string, number> }
  | { type: 'TOGGLE_STAGE'; stageId: string }
  | { type: 'SET_STAGE_WEIGHT'; stageId: string; reductionPercentage: number }
  | { type: 'SET_SUBTASK_WEIGHT'; stageId: string; subtaskId: string; weight: number }
  | { type: 'SET_DISCOUNT'; percentage: number; reason: string }
  | { type: 'SET_VAT'; vatApplicable: boolean }
  | { type: 'SET_TARIFF_OVERRIDE'; key: string; value: number }
  | { type: 'CLEAR_TARIFF_OVERRIDE'; key: string }
  | { type: 'ADD_DISBURSEMENT'; disbursement: { label: string; amount: number } }
  | { type: 'UPDATE_DISBURSEMENT'; index: number; disbursement: { label: string; amount: number } }
  | { type: 'REMOVE_DISBURSEMENT'; index: number }
  | { type: 'ADD_STATUTORY_FEE'; fee: { label: string; amount: number } }
  | { type: 'UPDATE_STATUTORY_FEE'; index: number; fee: { label: string; amount: number } }
  | { type: 'REMOVE_STATUTORY_FEE'; index: number }
  | { type: 'ADD_HOURLY_LINE'; label: string; hours: number; rate: number }
  | { type: 'REMOVE_HOURLY_LINE'; index: number }
  | { type: 'ADD_UNIT_LINE'; label: string; quantity: number; unitRate: number; factor?: number }
  | { type: 'REMOVE_UNIT_LINE'; index: number }
  | { type: 'SET_RESULT'; result: FeeCalculationResult | null }
  | { type: 'RESET' };

// --- Tool View ---

export type ToolView = 'calculator' | 'proposal' | 'terms' | 'history' | 'client';

// --- Context Value ---

export interface FeeProposalBuilderContextValue {
  activeProfession: Profession;
  setActiveProfession: (p: Profession) => void;
  activeView: ToolView;
  setActiveView: (v: ToolView) => void;
  activeSourceVersion: SourceVersion | null;
  calculatorState: CalculatorState;
  dispatch: Dispatch<CalculatorAction>;
  isDemoSeed: boolean;
}

// --- Defaults ---

export const defaultCalculatorState: CalculatorState = {
  profession: 'architect',
  projectValue: 0,
  complexityId: 'medium',
  workCategorySplits: {},
  selectedStages: {},
  hourlyLines: [],
  unitLines: [],
  disbursements: [],
  statutoryFees: [],
  discount: { percentage: 0, reason: '', appliesToDisbursements: false, appliesToStatutoryFees: false },
  vatApplicable: true,
  tariffOverrides: {},
  result: null,
};

// --- Profile Registry & Initial State ---

const registry = new ProfessionProfileRegistry();

/** Map user role to a default profession, or undefined when unrecognised. */
export function roleToProfession(role?: string): Profession | undefined {
  const map: Record<string, Profession> = {
    architect: 'architect',
    engineer: 'civilEngineer',
    quantity_surveyor: 'quantitySurveyor',
    town_planner: 'townPlanner',
    fire_engineer: 'fireEngineer',
    energy_professional: 'mechanicalEngineer',
    site_manager: 'constructionProjectManager',
  };
  return role ? map[role] : undefined;
}

/** Create initial calculator state for the given profession, populating stages/splits from the profile. */
export function createInitialState(profession: Profession): CalculatorState {
  const profile = registry.get(profession);
  const selectedStages: Record<string, { applicable: boolean; reductionPercentage: number }> = {};
  for (const stage of profile.stages) {
    selectedStages[stage.id] = { applicable: true, reductionPercentage: 0 };
  }
  const workCategorySplits: Record<string, number> = {};
  if (profile.workCategories.length > 0) {
    const equalSplit = 1.0 / profile.workCategories.length;
    for (const cat of profile.workCategories) {
      workCategorySplits[cat.id] = equalSplit;
    }
  }
  return {
    ...defaultCalculatorState,
    profession,
    selectedStages,
    workCategorySplits,
  };
}

// --- Reducer ---

export function calculatorReducer(state: CalculatorState, action: CalculatorAction): CalculatorState {
  switch (action.type) {
    case 'SET_PROFESSION':
      return createInitialState(action.profession);
    case 'SET_PROJECT_VALUE':
      return { ...state, projectValue: action.value, result: null };
    case 'SET_COMPLEXITY':
      return { ...state, complexityId: action.complexityId, complexityOverride: undefined, result: null };
    case 'SET_COMPLEXITY_OVERRIDE':
      return { ...state, complexityOverride: { level: action.level, justification: action.justification }, result: null };
    case 'SET_WORK_CATEGORY_SPLITS':
      return { ...state, workCategorySplits: action.splits, result: null };
    case 'TOGGLE_STAGE': {
      const current = state.selectedStages[action.stageId];
      if (!current) return state;
      return {
        ...state,
        selectedStages: {
          ...state.selectedStages,
          [action.stageId]: { ...current, applicable: !current.applicable },
        },
        result: null,
      };
    }
    case 'SET_STAGE_WEIGHT': {
      const existing = state.selectedStages[action.stageId];
      if (!existing) return state;
      return {
        ...state,
        selectedStages: {
          ...state.selectedStages,
          [action.stageId]: { ...existing, reductionPercentage: action.reductionPercentage },
        },
        result: null,
      };
    }
    case 'SET_SUBTASK_WEIGHT':
      return {
        ...state,
        subTaskWeights: {
          ...state.subTaskWeights,
          [action.stageId]: {
            ...(state.subTaskWeights?.[action.stageId] ?? {}),
            [action.subtaskId]: action.weight,
          },
        },
        result: null,
      };
    case 'SET_DISCOUNT':
      return { ...state, discount: { ...state.discount, percentage: action.percentage, reason: action.reason }, result: null };
    case 'SET_VAT':
      return { ...state, vatApplicable: action.vatApplicable, result: null };
    case 'SET_TARIFF_OVERRIDE':
      return { ...state, tariffOverrides: { ...state.tariffOverrides, [action.key]: action.value }, result: null };
    case 'CLEAR_TARIFF_OVERRIDE': {
      const { [action.key]: _, ...rest } = state.tariffOverrides;
      return { ...state, tariffOverrides: rest, result: null };
    }
    case 'ADD_DISBURSEMENT':
      return { ...state, disbursements: [...state.disbursements, action.disbursement], result: null };
    case 'UPDATE_DISBURSEMENT':
      return {
        ...state,
        disbursements: state.disbursements.map((d, i) => i === action.index ? action.disbursement : d),
        result: null,
      };
    case 'REMOVE_DISBURSEMENT':
      return { ...state, disbursements: state.disbursements.filter((_, i) => i !== action.index), result: null };
    case 'ADD_STATUTORY_FEE':
      return { ...state, statutoryFees: [...state.statutoryFees, action.fee], result: null };
    case 'UPDATE_STATUTORY_FEE':
      return {
        ...state,
        statutoryFees: state.statutoryFees.map((f, i) => i === action.index ? action.fee : f),
        result: null,
      };
    case 'REMOVE_STATUTORY_FEE':
      return { ...state, statutoryFees: state.statutoryFees.filter((_, i) => i !== action.index), result: null };
    case 'ADD_HOURLY_LINE':
      return { ...state, hourlyLines: [...state.hourlyLines, { label: action.label, hours: action.hours, rate: action.rate }], result: null };
    case 'REMOVE_HOURLY_LINE':
      return { ...state, hourlyLines: state.hourlyLines.filter((_, i) => i !== action.index), result: null };
    case 'ADD_UNIT_LINE':
      return { ...state, unitLines: [...state.unitLines, { label: action.label, quantity: action.quantity, unitRate: action.unitRate, factor: action.factor }], result: null };
    case 'REMOVE_UNIT_LINE':
      return { ...state, unitLines: state.unitLines.filter((_, i) => i !== action.index), result: null };
    case 'SET_RESULT':
      return { ...state, result: action.result };
    case 'RESET':
      return createInitialState(state.profession);
    default:
      return state;
  }
}

// --- Context ---

const FeeProposalBuilderContext = createContext<FeeProposalBuilderContextValue | null>(null);

export function useFeeProposalBuilder(): FeeProposalBuilderContextValue {
  const ctx = useContext(FeeProposalBuilderContext);
  if (!ctx) {
    throw new Error('useFeeProposalBuilder must be used within a FeeProposalBuilderProvider');
  }
  return ctx;
}

export interface FeeProposalBuilderProviderProps {
  children: ReactNode;
  user: UserProfile;
  defaultProfession?: Profession;
  sourceVersion?: SourceVersion | null;
}

export function FeeProposalBuilderProvider({ children, user, defaultProfession, sourceVersion = null }: FeeProposalBuilderProviderProps) {
  const resolvedDefault = defaultProfession ?? roleToProfession(user.role) ?? 'architect';
  const [calculatorState, dispatch] = useReducer(calculatorReducer, createInitialState(resolvedDefault));
  const [activeView, setActiveView] = useState<ToolView>('calculator');

  const resolvedSourceVersion = sourceVersion ?? registry.get(calculatorState.profession).source;
  const isDemoSeed = resolvedSourceVersion?.status === 'demo-seed';

  const setActiveProfession = (p: Profession) => {
    dispatch({ type: 'SET_PROFESSION', profession: p });
  };

  return (
    <FeeProposalBuilderContext.Provider
      value={{
        activeProfession: calculatorState.profession,
        setActiveProfession,
        activeView,
        setActiveView,
        activeSourceVersion: resolvedSourceVersion,
        calculatorState,
        dispatch,
        isDemoSeed,
      }}
    >
      {children}
    </FeeProposalBuilderContext.Provider>
  );
}

export default FeeProposalBuilderContext;
