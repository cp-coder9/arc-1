// CPMCalculator — Three fee basis: % of construction value, % of team fees, monthly retainer
//
// Requirements: 1.9

import { useState, useCallback, type ChangeEvent } from 'react';
import { HardHat } from 'lucide-react';
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

type CPMFeeBasis = 'percentConstruction' | 'percentTeam' | 'monthlyRetainer';

const FEE_BASIS_OPTIONS: Array<{ id: CPMFeeBasis; label: string; description: string }> = [
  { id: 'percentConstruction', label: '% of Construction Value', description: 'Fee as percentage of total construction contract value' },
  { id: 'percentTeam', label: '% of Team Fees', description: 'Fee as percentage of total professional team fees' },
  { id: 'monthlyRetainer', label: 'Monthly Retainer', description: 'Fixed monthly retainer × project duration' },
];

const registry = new ProfessionProfileRegistry();

export default function CPMCalculator() {
  const { calculatorState, dispatch, activeSourceVersion, isDemoSeed } = useFeeProposalBuilder();
  const profile = registry.get('constructionProjectManager');

  const [feeBasis, setFeeBasis] = useState<CPMFeeBasis>('percentConstruction');
  const [cpmPercentage, setCpmPercentage] = useState(3.5);
  const [teamFeesTotal, setTeamFeesTotal] = useState(0);
  const [teamFeePercentage, setTeamFeePercentage] = useState(25);
  const [monthlyRetainer, setMonthlyRetainer] = useState(0);
  const [projectMonths, setProjectMonths] = useState(0);

  const handleProjectValueChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    dispatch({ type: 'SET_PROJECT_VALUE', value: isNaN(val) ? 0 : val });
  }, [dispatch]);

  const handleComplexityChange = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    dispatch({ type: 'SET_COMPLEXITY', complexityId: e.target.value });
  }, [dispatch]);

  const calculatedFee = (() => {
    switch (feeBasis) {
      case 'percentConstruction':
        return (calculatorState.projectValue * cpmPercentage) / 100;
      case 'percentTeam':
        return (teamFeesTotal * teamFeePercentage) / 100;
      case 'monthlyRetainer':
        return monthlyRetainer * projectMonths;
    }
  })();

  return (
    <div className="space-y-6">
      <SourceVersionBadge sourceVersion={activeSourceVersion} isDemoSeed={isDemoSeed} />
      <DisclaimerBanner />

      <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-6">
        <div className="flex items-center gap-3 mb-4">
          <HardHat className="h-5 w-5 text-primary-400" />
          <h2 className="text-lg font-bold text-surface-100">Construction Project Manager — SACPCMP Fee Calculation</h2>
        </div>
        <p className="text-sm text-surface-400">
          Calculate CPM/PA fees using one of three fee bases as per SACPCMP practice guidelines.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          {/* Fee Basis Toggle */}
          <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
              Fee Basis
            </h3>
            <div className="flex flex-col gap-2">
              {FEE_BASIS_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setFeeBasis(option.id)}
                  className={`
                    flex flex-col gap-0.5 px-4 py-3 rounded-lg text-left transition-colors border
                    ${feeBasis === option.id
                      ? 'bg-primary/15 text-primary-300 border-primary/30'
                      : 'bg-surface-800/50 text-surface-300 border-surface-700/40 hover:bg-surface-700/40'
                    }
                  `}
                  aria-pressed={feeBasis === option.id}
                >
                  <span className="text-sm font-medium">{option.label}</span>
                  <span className="text-xs text-surface-400">{option.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Parameters */}
          <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
              Fee Parameters
            </h3>

            {feeBasis === 'percentConstruction' && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-surface-400">Construction Value (R)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={10000}
                    value={calculatorState.projectValue || ''}
                    onChange={handleProjectValueChange}
                    placeholder="e.g. 50000000"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-surface-400">CPM Fee % </Label>
                  <Input
                    type="number"
                    min={0}
                    max={20}
                    step={0.1}
                    value={cpmPercentage}
                    onChange={(e) => setCpmPercentage(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </>
            )}

            {feeBasis === 'percentTeam' && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-surface-400">Total Team Fees (R)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={10000}
                    value={teamFeesTotal || ''}
                    onChange={(e) => setTeamFeesTotal(parseFloat(e.target.value) || 0)}
                    placeholder="Sum of all professional team fees"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-surface-400">CPM % of Team Fees</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={teamFeePercentage}
                    onChange={(e) => setTeamFeePercentage(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </>
            )}

            {feeBasis === 'monthlyRetainer' && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-surface-400">Monthly Retainer (R/month)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1000}
                    value={monthlyRetainer || ''}
                    onChange={(e) => setMonthlyRetainer(parseFloat(e.target.value) || 0)}
                    placeholder="e.g. 65000"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-surface-400">Project Duration (months)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={projectMonths || ''}
                    onChange={(e) => setProjectMonths(parseFloat(e.target.value) || 0)}
                    placeholder="e.g. 18"
                  />
                </div>
              </>
            )}

            <div className="pt-3 border-t border-surface-700/30 flex justify-between items-center">
              <span className="text-xs font-semibold uppercase tracking-wider text-surface-400">Calculated Fee</span>
              <span className="text-lg font-bold text-white">R{calculatedFee.toLocaleString()}</span>
            </div>

            <div className="space-y-1.5 pt-2">
              <Label className="text-xs uppercase tracking-wider text-surface-400">Complexity</Label>
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
