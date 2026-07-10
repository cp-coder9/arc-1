// LandscapeArchCalc — Percentage of cost formula
//
// Requirements: 1.9

import { useCallback, type ChangeEvent } from 'react';
import { TreePine } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ProfessionProfileRegistry } from '@/services/professionalFee/profiles';
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

const registry = new ProfessionProfileRegistry();

export default function LandscapeArchCalc() {
  const { calculatorState, dispatch, activeSourceVersion, isDemoSeed } = useFeeProposalBuilder();
  const profile = registry.get('landscapeArchitect');

  const feePercentage = calculatorState.tariffOverrides['landscapeFeePercent'] ?? 10;

  const handleProjectValueChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    dispatch({ type: 'SET_PROJECT_VALUE', value: isNaN(val) ? 0 : val });
  }, [dispatch]);

  const handleFeePercentChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val >= 0 && val <= 100) {
      dispatch({ type: 'SET_TARIFF_OVERRIDE', key: 'landscapeFeePercent', value: val });
    }
  }, [dispatch]);

  const handleComplexityChange = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    dispatch({ type: 'SET_COMPLEXITY', complexityId: e.target.value });
  }, [dispatch]);

  const calculatedFee = (calculatorState.projectValue * feePercentage) / 100;

  return (
    <div className="space-y-6">
      <SourceVersionBadge sourceVersion={activeSourceVersion} isDemoSeed={isDemoSeed} />
      <DisclaimerBanner />

      <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-6">
        <div className="flex items-center gap-3 mb-4">
          <TreePine className="h-5 w-5 text-green-400" />
          <h2 className="text-lg font-bold text-surface-100">Landscape Architect — SACLAP Fee Calculation</h2>
        </div>
        <p className="text-sm text-surface-400">
          Fee calculated as a percentage of landscape construction cost per SACLAP guidelines.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
              Fee Parameters
            </h3>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-surface-400">
                Landscape Construction Cost (R)
              </Label>
              <Input
                type="number"
                min={0}
                step={10000}
                value={calculatorState.projectValue || ''}
                onChange={handleProjectValueChange}
                placeholder="e.g. 2000000"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-surface-400">
                Fee Percentage (%)
              </Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={feePercentage}
                onChange={handleFeePercentChange}
              />
              <p className="text-[10px] text-surface-500">
                Typical range: 8–15% depending on complexity and scope.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-surface-400">Complexity Level</Label>
              <select
                value={calculatorState.complexityId}
                onChange={handleComplexityChange}
                className="w-full h-9 rounded-md border border-surface-700 bg-surface-900 px-3 text-sm text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
              >
                {profile.complexity.map((c) => (
                  <option key={c.id} value={c.id}>{c.label} — {c.description}</option>
                ))}
              </select>
            </div>

            <div className="pt-3 border-t border-surface-700/30 flex justify-between items-center">
              <span className="text-xs font-semibold uppercase tracking-wider text-surface-400">Calculated Fee</span>
              <span className="text-lg font-bold text-white">R{calculatedFee.toLocaleString()}</span>
            </div>
          </div>

          <StageWeightingPanel stages={profile.stages} />
        </div>

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
