// EngineerCalculator — Shared for structural/civil/electrical/mechanical engineers
//
// Percentage-of-discipline-portion formula with editable factor.
// Accepts discipline prop to determine which engineering type.
// Uses shared components for stages, discount, disbursements, results.
//
// Requirements: 1.3, 3.7, 4.2

import { useCallback, type ChangeEvent } from 'react';
import { Compass } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ProfessionProfileRegistry } from '@/services/professionalFee/profiles';
import type { Profession } from '@/services/professionalFee/types';
import { useFeeProposalBuilder } from '../FeeProposalBuilderContext';
import {
  DisclaimerBanner,
  SourceVersionBadge,
  ResultSummaryCard,
  DiscountPanel,
  DisbursementsEditor,
  StatutoryFeesEditor,
} from '../shared';
import { StageWeightingPanel } from '../shared/StageWeightingPanel';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EngineerCalculatorProps {
  discipline?: Profession;
}

const DISCIPLINE_LABELS: Partial<Record<Profession, string>> = {
  civilEngineer: 'Civil Engineer',
  structuralEngineer: 'Structural Engineer',
  electricalEngineer: 'Electrical Engineer',
  mechanicalEngineer: 'Mechanical Engineer',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const registry = new ProfessionProfileRegistry();

export default function EngineerCalculator({ discipline }: EngineerCalculatorProps) {
  const { calculatorState, dispatch, activeProfession, activeSourceVersion, isDemoSeed } = useFeeProposalBuilder();
  const resolvedDiscipline = discipline ?? activeProfession;
  const profile = registry.get(resolvedDiscipline);
  const displayName = DISCIPLINE_LABELS[resolvedDiscipline] ?? profile.displayName;

  // Discipline factor from work categories
  const defaultFactor = profile.workCategories[0]?.factor ?? 1;
  const disciplineFactor = calculatorState.tariffOverrides['disciplineFactor'] ?? defaultFactor;

  const handleProjectValueChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    dispatch({ type: 'SET_PROJECT_VALUE', value: isNaN(val) ? 0 : val });
  }, [dispatch]);

  const handleDisciplineFactorChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val >= 0 && val <= 5) {
      dispatch({ type: 'SET_TARIFF_OVERRIDE', key: 'disciplineFactor', value: val });
    }
  }, [dispatch]);

  const handleComplexityChange = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    dispatch({ type: 'SET_COMPLEXITY', complexityId: e.target.value });
  }, [dispatch]);

  return (
    <div className="space-y-6">
      {/* Source Version Badge */}
      <SourceVersionBadge sourceVersion={activeSourceVersion} isDemoSeed={isDemoSeed} />

      {/* Disclaimer */}
      <DisclaimerBanner />

      {/* Header */}
      <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Compass className="h-5 w-5 text-primary-400" />
          <h2 className="text-lg font-bold text-surface-100">{displayName} — ECSA Fee Calculation</h2>
        </div>
        <p className="text-sm text-surface-400">
          Percentage-of-discipline-portion formula. Adjust the discipline factor and complexity to
          calculate the engineering professional fee.
        </p>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Inputs */}
        <div className="space-y-6">
          {/* Project value & discipline factor */}
          <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
              Fee Parameters
            </h3>

            <div className="space-y-1.5">
              <Label htmlFor="eng-project-value" className="text-xs uppercase tracking-wider text-surface-400">
                Construction Value (R)
              </Label>
              <Input
                id="eng-project-value"
                type="number"
                min={0}
                step={10000}
                value={calculatorState.projectValue || ''}
                onChange={handleProjectValueChange}
                placeholder="e.g. 5000000"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="discipline-factor" className="text-xs uppercase tracking-wider text-surface-400">
                Discipline Percentage Factor
              </Label>
              <Input
                id="discipline-factor"
                type="number"
                min={0}
                max={5}
                step={0.05}
                value={disciplineFactor}
                onChange={handleDisciplineFactorChange}
              />
              <p className="text-[10px] text-surface-500">
                Default: {defaultFactor.toFixed(2)} — adjust based on discipline portion of total project.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="eng-complexity" className="text-xs uppercase tracking-wider text-surface-400">
                Complexity Level
              </Label>
              <select
                id="eng-complexity"
                value={calculatorState.complexityId}
                onChange={handleComplexityChange}
                className="w-full h-9 rounded-md border border-surface-700 bg-surface-900 px-3 text-sm text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
              >
                {profile.complexity.map((c) => (
                  <option key={c.id} value={c.id}>{c.label} — {c.description}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Stage Weighting */}
          <StageWeightingPanel stages={profile.stages} />
        </div>

        {/* Right: Results */}
        <div className="space-y-6">
          <ResultSummaryCard />
          <DiscountPanel />
          <DisbursementsEditor />
          <StatutoryFeesEditor />
        </div>
      </div>
    </div>
  );
}
