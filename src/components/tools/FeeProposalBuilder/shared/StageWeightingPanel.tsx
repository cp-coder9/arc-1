// StageWeightingPanel — Toggle stages on/off, edit weight percentages, show sum indicator
//
// Displays a table/list of profession-specific service stages with:
// - Toggle switch (applicable: boolean)
// - Weight % (editable, from defaultWeight)
// - Reduction % (editable)
// - Effective weight (defaultWeight × (1 - reductionPercentage))
// - Sum bar showing total effective weight
//
// Dispatches TOGGLE_STAGE and SET_STAGE_REDUCTION actions to context.
// Requirements: 2.1, 2.2, 2.4, 2.5

import { useMemo } from 'react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { StageDefinition } from '@/services/professionalFee/types';
import { useFeeProposalBuilder } from '../FeeProposalBuilderContext';

export interface StageWeightingPanelProps {
  stages: StageDefinition[];
  className?: string;
}

export function StageWeightingPanel({ stages, className }: StageWeightingPanelProps) {
  const { calculatorState, dispatch } = useFeeProposalBuilder();
  const { selectedStages } = calculatorState;

  const stageRows = useMemo(() => {
    return stages.map((stage) => {
      const sel = selectedStages[stage.id] ?? { applicable: true, reductionPercentage: 0 };
      const weightPct = stage.defaultWeight * 100;
      const effectiveWeight = stage.defaultWeight * (1 - sel.reductionPercentage / 100);
      const effectivePct = effectiveWeight * 100;
      return { stage, applicable: sel.applicable, reductionPct: sel.reductionPercentage, weightPct, effectivePct };
    });
  }, [stages, selectedStages]);

  const totalEffective = useMemo(() => {
    return stageRows.reduce((sum, row) => {
      if (!row.applicable) return sum;
      return sum + row.effectivePct;
    }, 0);
  }, [stageRows]);

  const handleToggle = (stageId: string, _checked: boolean) => {
    dispatch({ type: 'TOGGLE_STAGE', stageId });
  };

  const handleReductionChange = (stageId: string, value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return;
    const clamped = Math.max(0, Math.min(100, num));
    dispatch({ type: 'SET_STAGE_WEIGHT', stageId, reductionPercentage: clamped });
  };

  const barWidth = Math.min(100, Math.max(0, totalEffective));
  const isBalanced = Math.abs(totalEffective - 100) < 1;

  return (
    <div className={cn('rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 overflow-hidden', className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-surface-700/50">
        <h3 className="text-sm font-semibold text-surface-100 uppercase tracking-wider">
          Stage Weighting
        </h3>
        <p className="text-xs text-surface-400 mt-0.5">
          Toggle stages on/off and adjust reduction percentages to match your scope.
        </p>
      </div>

      {/* Table header (hidden on mobile, shown as grid on md+) */}
      <div className="hidden md:grid grid-cols-[1fr_56px_72px_72px_72px] gap-2 px-4 py-2 border-b border-surface-700/30 text-xs text-surface-400 uppercase tracking-wider">
        <span>Stage</span>
        <span className="text-center">Active</span>
        <span className="text-center">Weight %</span>
        <span className="text-center">Reduction %</span>
        <span className="text-center">Effective %</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-surface-700/30">
        {stageRows.map(({ stage, applicable, reductionPct, weightPct, effectivePct }) => (
          <div
            key={stage.id}
            className={cn(
              'grid grid-cols-1 md:grid-cols-[1fr_56px_72px_72px_72px] gap-2 md:gap-2 px-4 py-3 items-center transition-opacity',
              !applicable && 'opacity-50'
            )}
          >
            {/* Stage name */}
            <div className="flex flex-col md:flex-row md:items-center gap-1">
              <Label className="text-sm text-surface-200 font-medium leading-tight">
                {stage.name}
              </Label>
              {/* Mobile-only toggle row */}
              <div className="flex items-center gap-3 md:hidden mt-1">
                <Switch
                  checked={applicable}
                  onCheckedChange={(checked: boolean) => handleToggle(stage.id, checked)}
                  size="sm"
                  aria-label={`Toggle ${stage.name}`}
                />
                <span className="text-xs text-surface-400">
                  {applicable ? 'Active' : 'Excluded'}
                </span>
              </div>
            </div>

            {/* Toggle (desktop) */}
            <div className="hidden md:flex justify-center">
              <Switch
                checked={applicable}
                onCheckedChange={(checked: boolean) => handleToggle(stage.id, checked)}
                size="sm"
                aria-label={`Toggle ${stage.name}`}
              />
            </div>

            {/* Weight % (read-only — shows defaultWeight) */}
            <div className="flex items-center gap-1 md:justify-center">
              <span className="text-xs text-surface-400 md:hidden">Weight:</span>
              <span className="text-sm text-surface-300 tabular-nums text-center w-full md:w-auto">
                {weightPct.toFixed(1)}%
              </span>
            </div>

            {/* Reduction % (editable) */}
            <div className="flex items-center gap-1 md:justify-center">
              <span className="text-xs text-surface-400 md:hidden">Reduction:</span>
              <Input
                type="number"
                min={0}
                max={100}
                step={5}
                value={reductionPct}
                onChange={(e) => handleReductionChange(stage.id, e.target.value)}
                disabled={!applicable}
                className="w-16 h-7 text-xs text-center tabular-nums"
                aria-label={`Reduction percentage for ${stage.name}`}
              />
            </div>

            {/* Effective % (calculated) */}
            <div className="flex items-center gap-1 md:justify-center">
              <span className="text-xs text-surface-400 md:hidden">Effective:</span>
              <span
                className={cn(
                  'text-sm font-medium tabular-nums text-center w-full md:w-auto',
                  applicable ? 'text-primary-400' : 'text-surface-500'
                )}
              >
                {applicable ? `${effectivePct.toFixed(1)}%` : '—'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Sum bar */}
      <div className="px-4 py-3 border-t border-surface-700/50 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-surface-300 uppercase tracking-wider">
            Total effective weight
          </span>
          <span
            className={cn(
              'text-sm font-bold tabular-nums',
              isBalanced ? 'text-emerald-400' : 'text-amber-400'
            )}
          >
            {totalEffective.toFixed(1)}%
          </span>
        </div>
        {/* Visual bar */}
        <div className="h-2 rounded-full bg-surface-700/50 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300',
              isBalanced ? 'bg-emerald-500/80' : totalEffective > 100 ? 'bg-red-500/80' : 'bg-amber-500/80'
            )}
            style={{ width: `${barWidth}%` }}
          />
        </div>
        {!isBalanced && (
          <p className="text-xs text-amber-400/80">
            {totalEffective > 100
              ? 'Total exceeds 100% — review stage reductions.'
              : 'Selected stages do not sum to 100% — some scope is excluded.'}
          </p>
        )}
      </div>
    </div>
  );
}
