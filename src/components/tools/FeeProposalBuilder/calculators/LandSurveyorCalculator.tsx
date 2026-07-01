// LandSurveyorCalculator — Area/unit rates + beacon rates
//
// Requirements: 1.7

import { useState, useCallback, type ChangeEvent } from 'react';
import { Briefcase, Plus, Trash2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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

export default function LandSurveyorCalculator() {
  const { calculatorState, dispatch, activeSourceVersion, isDemoSeed } = useFeeProposalBuilder();
  const profile = registry.get('landSurveyor');

  const [areaHectares, setAreaHectares] = useState(0);
  const [ratePerHectare, setRatePerHectare] = useState(2500);
  const [beaconCount, setBeaconCount] = useState(0);
  const [beaconRate, setBeaconRate] = useState(1200);

  const handleProjectValueChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    dispatch({ type: 'SET_PROJECT_VALUE', value: isNaN(val) ? 0 : val });
  }, [dispatch]);

  const areaFee = areaHectares * ratePerHectare;
  const beaconFee = beaconCount * beaconRate;
  const combinedFee = areaFee + beaconFee;

  return (
    <div className="space-y-6">
      <SourceVersionBadge sourceVersion={activeSourceVersion} isDemoSeed={isDemoSeed} />
      <DisclaimerBanner />

      <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Briefcase className="h-5 w-5 text-primary-400" />
          <h2 className="text-lg font-bold text-surface-100">Land Surveyor — SAGC Fee Calculation</h2>
        </div>
        <p className="text-sm text-surface-400">
          Area/unit rate calculation with beacon placement rates per SAGC guidelines.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          {/* Area-based */}
          <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
              Area-Based Fee
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-surface-400">Area (hectares)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  value={areaHectares || ''}
                  onChange={(e) => setAreaHectares(parseFloat(e.target.value) || 0)}
                  placeholder="e.g. 5.5"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-surface-400">Rate (R/ha)</Label>
                <Input
                  type="number"
                  min={0}
                  step={100}
                  value={ratePerHectare}
                  onChange={(e) => setRatePerHectare(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
            <div className="pt-2 border-t border-surface-700/30 flex justify-between">
              <span className="text-xs text-surface-400">Area subtotal</span>
              <span className="text-sm font-semibold text-primary-300">R{areaFee.toLocaleString()}</span>
            </div>
          </div>

          {/* Beacon-based */}
          <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
              Beacon Placement
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-surface-400">Number of Beacons</Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={beaconCount || ''}
                  onChange={(e) => setBeaconCount(parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-surface-400">Rate (R/beacon)</Label>
                <Input
                  type="number"
                  min={0}
                  step={100}
                  value={beaconRate}
                  onChange={(e) => setBeaconRate(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
            <div className="pt-2 border-t border-surface-700/30 flex justify-between">
              <span className="text-xs text-surface-400">Beacon subtotal</span>
              <span className="text-sm font-semibold text-primary-300">R{beaconFee.toLocaleString()}</span>
            </div>
          </div>

          {/* Combined & reference */}
          <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold uppercase tracking-wider text-surface-400">Combined Survey Fee</span>
              <span className="text-lg font-bold text-white">R{combinedFee.toLocaleString()}</span>
            </div>
            <div className="space-y-1.5 pt-2 border-t border-surface-700/30">
              <Label className="text-xs uppercase tracking-wider text-surface-400">Reference Land Value (R)</Label>
              <Input
                type="number"
                min={0}
                step={10000}
                value={calculatorState.projectValue || ''}
                onChange={handleProjectValueChange}
                placeholder="Optional — for reporting"
              />
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
