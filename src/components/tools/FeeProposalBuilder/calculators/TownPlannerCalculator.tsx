// TownPlannerCalculator — Hybrid: application-type fees + time-based
//
// Requirements: 1.6

import { useState, useCallback, type ChangeEvent } from 'react';
import { Map, Plus, Trash2 } from 'lucide-react';
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

const APPLICATION_TYPES = [
  { id: 'rezoning', label: 'Rezoning Application', baseFee: 45000 },
  { id: 'subdivision', label: 'Subdivision', baseFee: 35000 },
  { id: 'consolidation', label: 'Consolidation', baseFee: 25000 },
  { id: 'site_dev_plan', label: 'Site Development Plan', baseFee: 30000 },
  { id: 'departure', label: 'Departure / Consent Use', baseFee: 20000 },
  { id: 'removal_restrictions', label: 'Removal of Restrictive Conditions', baseFee: 28000 },
  { id: 'township_establishment', label: 'Township Establishment', baseFee: 120000 },
];

const registry = new ProfessionProfileRegistry();

export default function TownPlannerCalculator() {
  const { calculatorState, dispatch, activeSourceVersion, isDemoSeed } = useFeeProposalBuilder();
  const profile = registry.get('townPlanner');

  const [selectedApplications, setSelectedApplications] = useState<string[]>([]);
  const [hourlyRate, setHourlyRate] = useState(1800);
  const [additionalHours, setAdditionalHours] = useState(0);

  const handleProjectValueChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    dispatch({ type: 'SET_PROJECT_VALUE', value: isNaN(val) ? 0 : val });
  }, [dispatch]);

  const toggleApplication = useCallback((appId: string) => {
    setSelectedApplications((prev) =>
      prev.includes(appId) ? prev.filter((id) => id !== appId) : [...prev, appId]
    );
  }, []);

  const applicationTotal = APPLICATION_TYPES.filter((a) => selectedApplications.includes(a.id))
    .reduce((sum, a) => sum + a.baseFee, 0);
  const timeTotal = hourlyRate * additionalHours;

  return (
    <div className="space-y-6">
      <SourceVersionBadge sourceVersion={activeSourceVersion} isDemoSeed={isDemoSeed} />
      <DisclaimerBanner />

      <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Map className="h-5 w-5 text-primary-400" />
          <h2 className="text-lg font-bold text-surface-100">Town Planner — SACPLAN Fee Calculation</h2>
        </div>
        <p className="text-sm text-surface-400">
          Hybrid fee structure: application-type base fees plus time-based consulting hours.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          {/* Application Types */}
          <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
              Application Types
            </h3>
            <div className="space-y-2">
              {APPLICATION_TYPES.map((app) => (
                <label key={app.id} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedApplications.includes(app.id)}
                    onChange={() => toggleApplication(app.id)}
                    className="rounded border-surface-600 bg-surface-800 text-primary-500 focus:ring-primary-500/50"
                  />
                  <span className="flex-1 text-sm text-surface-200">{app.label}</span>
                  <span className="text-xs text-surface-400 tabular-nums">R{app.baseFee.toLocaleString()}</span>
                </label>
              ))}
            </div>
            <div className="pt-2 border-t border-surface-700/30 flex justify-between">
              <span className="text-xs text-surface-400 uppercase">Application subtotal</span>
              <span className="text-sm font-semibold text-primary-300">R{applicationTotal.toLocaleString()}</span>
            </div>
          </div>

          {/* Time-based portion */}
          <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
              Time-Based Consulting
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-surface-400">Rate (R/hr)</Label>
                <Input
                  type="number"
                  min={0}
                  step={50}
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-surface-400">Hours</Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={additionalHours || ''}
                  onChange={(e) => setAdditionalHours(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
            <div className="pt-2 border-t border-surface-700/30 flex justify-between">
              <span className="text-xs text-surface-400 uppercase">Time subtotal</span>
              <span className="text-sm font-semibold text-primary-300">R{timeTotal.toLocaleString()}</span>
            </div>
          </div>

          {/* Project value for reference */}
          <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-surface-400">
                Reference Property / Development Value (R)
              </Label>
              <Input
                type="number"
                min={0}
                step={10000}
                value={calculatorState.projectValue || ''}
                onChange={handleProjectValueChange}
                placeholder="For reference/reporting"
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
