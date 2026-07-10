// InteriorDesignerCalc — Design fee % + procurement markup on FF&E
//
// Requirements: 1.8

import { useState, useCallback, type ChangeEvent } from 'react';
import { PenTool } from 'lucide-react';
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

export default function InteriorDesignerCalc() {
  const { calculatorState, dispatch, activeSourceVersion, isDemoSeed } = useFeeProposalBuilder();
  const profile = registry.get('interiorDesigner');

  const [designFeePercent, setDesignFeePercent] = useState(12);
  const [ffeBudget, setFfeBudget] = useState(0);
  const [procurementMarkup, setProcurementMarkup] = useState(15);

  const handleProjectValueChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    dispatch({ type: 'SET_PROJECT_VALUE', value: isNaN(val) ? 0 : val });
  }, [dispatch]);

  const handleComplexityChange = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    dispatch({ type: 'SET_COMPLEXITY', complexityId: e.target.value });
  }, [dispatch]);

  const designFee = (calculatorState.projectValue * designFeePercent) / 100;
  const procurementFee = (ffeBudget * procurementMarkup) / 100;
  const combinedFee = designFee + procurementFee;

  return (
    <div className="space-y-6">
      <SourceVersionBadge sourceVersion={activeSourceVersion} isDemoSeed={isDemoSeed} />
      <DisclaimerBanner />

      <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-6">
        <div className="flex items-center gap-3 mb-4">
          <PenTool className="h-5 w-5 text-primary-400" />
          <h2 className="text-lg font-bold text-surface-100">Interior Designer — Fee Calculation</h2>
        </div>
        <p className="text-sm text-surface-400">
          Design fee as percentage of fitout/construction value, plus procurement markup on FF&E budget.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          {/* Design Fee */}
          <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
              Design Fee
            </h3>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-surface-400">Fitout / Construction Value (R)</Label>
              <Input
                type="number"
                min={0}
                step={10000}
                value={calculatorState.projectValue || ''}
                onChange={handleProjectValueChange}
                placeholder="e.g. 3000000"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-surface-400">Design Fee Percentage (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={designFeePercent}
                onChange={(e) => setDesignFeePercent(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="pt-2 border-t border-surface-700/30 flex justify-between">
              <span className="text-xs text-surface-400">Design fee</span>
              <span className="text-sm font-semibold text-primary-300">R{designFee.toLocaleString()}</span>
            </div>
          </div>

          {/* Procurement Markup */}
          <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
              Procurement Markup (FF&E)
            </h3>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-surface-400">FF&E Budget (R)</Label>
              <Input
                type="number"
                min={0}
                step={5000}
                value={ffeBudget || ''}
                onChange={(e) => setFfeBudget(parseFloat(e.target.value) || 0)}
                placeholder="e.g. 1500000"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-surface-400">Markup Percentage (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={procurementMarkup}
                onChange={(e) => setProcurementMarkup(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="pt-2 border-t border-surface-700/30 flex justify-between">
              <span className="text-xs text-surface-400">Procurement fee</span>
              <span className="text-sm font-semibold text-primary-300">R{procurementFee.toLocaleString()}</span>
            </div>
          </div>

          {/* Combined total */}
          <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold uppercase tracking-wider text-surface-400">Combined Fee</span>
              <span className="text-lg font-bold text-white">R{combinedFee.toLocaleString()}</span>
            </div>
          </div>

          {/* Complexity */}
          <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5 space-y-4">
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
