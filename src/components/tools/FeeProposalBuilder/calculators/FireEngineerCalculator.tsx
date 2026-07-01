// FireEngineerCalculator — Hybrid: base assessment + hourly rational design
//
// Base assessment fee derived from project value + complexity.
// Hourly line items editor for rational design hours.
// Uses shared components.
//
// Requirements: 1.4

import { useState, useCallback, type ChangeEvent, type KeyboardEvent } from 'react';
import { Flame, Plus, Trash2 } from 'lucide-react';
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const registry = new ProfessionProfileRegistry();

export default function FireEngineerCalculator() {
  const { calculatorState, dispatch, activeSourceVersion, isDemoSeed } = useFeeProposalBuilder();
  const profile = registry.get('fireEngineer');

  const [newLabel, setNewLabel] = useState('');
  const [newHours, setNewHours] = useState('');
  const [newRate, setNewRate] = useState('');

  const handleProjectValueChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    dispatch({ type: 'SET_PROJECT_VALUE', value: isNaN(val) ? 0 : val });
  }, [dispatch]);

  const handleComplexityChange = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    dispatch({ type: 'SET_COMPLEXITY', complexityId: e.target.value });
  }, [dispatch]);

  const handleAddHourlyLine = useCallback(() => {
    const label = newLabel.trim();
    const hours = parseFloat(newHours);
    const rate = parseFloat(newRate);
    if (!label || isNaN(hours) || isNaN(rate) || hours <= 0 || rate <= 0) return;
    dispatch({ type: 'ADD_HOURLY_LINE', label, hours, rate });
    setNewLabel('');
    setNewHours('');
    setNewRate('');
  }, [dispatch, newLabel, newHours, newRate]);

  const handleRemoveHourlyLine = useCallback((index: number) => {
    dispatch({ type: 'REMOVE_HOURLY_LINE', index });
  }, [dispatch]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddHourlyLine();
    }
  }, [handleAddHourlyLine]);

  const hourlyTotal = calculatorState.hourlyLines.reduce(
    (sum, line) => sum + line.hours * line.rate,
    0
  );

  return (
    <div className="space-y-6">
      <SourceVersionBadge sourceVersion={activeSourceVersion} isDemoSeed={isDemoSeed} />
      <DisclaimerBanner />

      {/* Header */}
      <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Flame className="h-5 w-5 text-orange-400" />
          <h2 className="text-lg font-bold text-surface-100">Fire Engineer — Hybrid Fee Calculation</h2>
        </div>
        <p className="text-sm text-surface-400">
          Combines a base assessment fee (derived from project value and complexity) with hourly
          rational design work items.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Inputs */}
        <div className="space-y-6">
          {/* Base Assessment */}
          <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
              Base Assessment Fee
            </h3>

            <div className="space-y-1.5">
              <Label htmlFor="fire-project-value" className="text-xs uppercase tracking-wider text-surface-400">
                Construction Value (R)
              </Label>
              <Input
                id="fire-project-value"
                type="number"
                min={0}
                step={10000}
                value={calculatorState.projectValue || ''}
                onChange={handleProjectValueChange}
                placeholder="e.g. 5000000"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fire-complexity" className="text-xs uppercase tracking-wider text-surface-400">
                Complexity Level
              </Label>
              <select
                id="fire-complexity"
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

          {/* Hourly Rational Design Items */}
          <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
              Hourly Rational Design Work
            </h3>
            <p className="text-[10px] text-surface-500">
              Add line items for rational fire design hours at applicable rates.
            </p>

            {/* Existing lines */}
            {calculatorState.hourlyLines.length > 0 && (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_64px_80px_36px] gap-2 text-xs uppercase tracking-wider text-surface-500">
                  <span>Description</span>
                  <span>Hours</span>
                  <span>Rate (R/hr)</span>
                  <span className="sr-only">Actions</span>
                </div>
                {calculatorState.hourlyLines.map((line, index) => (
                  <div key={index} className="grid grid-cols-[1fr_64px_80px_36px] items-center gap-2">
                    <span className="text-sm text-surface-200 truncate">{line.label}</span>
                    <span className="text-sm text-surface-300 tabular-nums text-center">{line.hours}</span>
                    <span className="text-sm text-surface-300 tabular-nums text-center">R{line.rate}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleRemoveHourlyLine(index)}
                      aria-label={`Remove: ${line.label}`}
                      className="text-surface-500 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <div className="flex justify-end pt-2 border-t border-surface-700/30">
                  <span className="text-xs text-surface-400">
                    Hourly Total: <span className="font-bold text-surface-200">R{hourlyTotal.toLocaleString()}</span>
                  </span>
                </div>
              </div>
            )}

            {/* Add new line */}
            <div className="grid grid-cols-[1fr_64px_80px_36px] items-end gap-2">
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Task description..."
                aria-label="New hourly item description"
              />
              <Input
                type="number"
                min={0}
                step={1}
                value={newHours}
                onChange={(e) => setNewHours(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Hrs"
                aria-label="Hours"
              />
              <Input
                type="number"
                min={0}
                step={50}
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="R/hr"
                aria-label="Rate per hour"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleAddHourlyLine}
                disabled={!newLabel.trim() || !newHours || !newRate}
                aria-label="Add hourly item"
                className="text-surface-400 hover:text-emerald-400"
              >
                <Plus className="h-4 w-4" />
              </Button>
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
