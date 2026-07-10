// QuantitySurveyorCalc — Three fee basis toggle (% contract, % architect fee, time-based)
//
// Switching fee basis recalculates with appropriate formula.
// QS-specific stages from profile.
// Uses shared components.
//
// Requirements: 1.5

import { useState, useCallback, type ChangeEvent } from 'react';
import { Calculator } from 'lucide-react';
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type QSFeeBasis = 'percentContract' | 'percentArchitect' | 'timeBased';

const FEE_BASIS_OPTIONS: Array<{ id: QSFeeBasis; label: string; description: string }> = [
  { id: 'percentContract', label: '% of Contract Value', description: 'Fee as percentage of construction contract value' },
  { id: 'percentArchitect', label: '% of Architect Fee', description: 'Fee as percentage of the architect professional fee' },
  { id: 'timeBased', label: 'Time-Based', description: 'Hourly rates × estimated hours per stage' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const registry = new ProfessionProfileRegistry();

export default function QuantitySurveyorCalc() {
  const { calculatorState, dispatch, activeSourceVersion, isDemoSeed } = useFeeProposalBuilder();
  const profile = registry.get('quantitySurveyor');

  const [feeBasis, setFeeBasis] = useState<QSFeeBasis>('percentContract');
  const [architectFee, setArchitectFee] = useState<number>(0);
  const [hourlyRate, setHourlyRate] = useState<number>(1500);
  const [estimatedHours, setEstimatedHours] = useState<number>(0);

  const handleProjectValueChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    dispatch({ type: 'SET_PROJECT_VALUE', value: isNaN(val) ? 0 : val });
  }, [dispatch]);

  const handleComplexityChange = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    dispatch({ type: 'SET_COMPLEXITY', complexityId: e.target.value });
  }, [dispatch]);

  const handleFeeBasisChange = useCallback((basis: QSFeeBasis) => {
    setFeeBasis(basis);
  }, []);

  return (
    <div className="space-y-6">
      <SourceVersionBadge sourceVersion={activeSourceVersion} isDemoSeed={isDemoSeed} />
      <DisclaimerBanner />

      {/* Header */}
      <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Calculator className="h-5 w-5 text-primary-400" />
          <h2 className="text-lg font-bold text-surface-100">Quantity Surveyor — SACQSP Fee Calculation</h2>
        </div>
        <p className="text-sm text-surface-400">
          Calculate QS professional fees using one of three fee bases. Select the basis that matches
          your engagement terms.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Inputs */}
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
                  onClick={() => handleFeeBasisChange(option.id)}
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

          {/* Fee Parameters based on selected basis */}
          <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
              Fee Parameters
            </h3>

            {feeBasis === 'percentContract' && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="qs-contract-value" className="text-xs uppercase tracking-wider text-surface-400">
                    Construction Contract Value (R)
                  </Label>
                  <Input
                    id="qs-contract-value"
                    type="number"
                    min={0}
                    step={10000}
                    value={calculatorState.projectValue || ''}
                    onChange={handleProjectValueChange}
                    placeholder="e.g. 15000000"
                  />
                </div>
              </>
            )}

            {feeBasis === 'percentArchitect' && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="qs-architect-fee" className="text-xs uppercase tracking-wider text-surface-400">
                    Architect Professional Fee (R)
                  </Label>
                  <Input
                    id="qs-architect-fee"
                    type="number"
                    min={0}
                    step={1000}
                    value={architectFee || ''}
                    onChange={(e) => setArchitectFee(parseFloat(e.target.value) || 0)}
                    placeholder="e.g. 750000"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="qs-project-value-ref" className="text-xs uppercase tracking-wider text-surface-400">
                    Reference Construction Value (R)
                  </Label>
                  <Input
                    id="qs-project-value-ref"
                    type="number"
                    min={0}
                    step={10000}
                    value={calculatorState.projectValue || ''}
                    onChange={handleProjectValueChange}
                    placeholder="e.g. 15000000"
                  />
                </div>
              </>
            )}

            {feeBasis === 'timeBased' && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="qs-hourly-rate" className="text-xs uppercase tracking-wider text-surface-400">
                    Hourly Rate (R/hr)
                  </Label>
                  <Input
                    id="qs-hourly-rate"
                    type="number"
                    min={0}
                    step={50}
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="qs-estimated-hours" className="text-xs uppercase tracking-wider text-surface-400">
                    Estimated Total Hours
                  </Label>
                  <Input
                    id="qs-estimated-hours"
                    type="number"
                    min={0}
                    step={1}
                    value={estimatedHours || ''}
                    onChange={(e) => setEstimatedHours(parseFloat(e.target.value) || 0)}
                    placeholder="e.g. 200"
                  />
                </div>
                <div className="rounded-lg bg-surface-700/30 p-3">
                  <p className="text-xs text-surface-400">Time-based estimate:</p>
                  <p className="text-sm font-semibold text-primary-300">
                    R{(hourlyRate * estimatedHours).toLocaleString()}
                  </p>
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="qs-complexity" className="text-xs uppercase tracking-wider text-surface-400">
                Complexity Level
              </Label>
              <select
                id="qs-complexity"
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
