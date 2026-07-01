// SubTaskPanel — Sub-task weights within architect stages per SACAP IDoW deliverable breakdown
//
// Used only for the Architect profession to break down deliverables within a stage.
// Each sub-task has an editable weight percentage; weights should sum to 100%.
// Dispatches SET_SUBTASK_WEIGHT action to context.
//
// Requirements: 2.3, 2.5

import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useFeeProposalBuilder } from '../FeeProposalBuilderContext';

export interface SubTaskPanelProps {
  stageId: string;
  deliverables: string[];
  className?: string;
}

export function SubTaskPanel({ stageId, deliverables, className }: SubTaskPanelProps) {
  const { calculatorState, dispatch } = useFeeProposalBuilder();
  const weights = calculatorState.subTaskWeights?.[stageId] ?? {};

  // Derive current weight values — default to equal split when not explicitly set
  const rows = useMemo(() => {
    const defaultWeight = deliverables.length > 0 ? 100 / deliverables.length : 0;
    return deliverables.map((deliverable) => {
      const id = deliverable.replace(/\s+/g, '-').toLowerCase();
      const weight = weights[id] ?? defaultWeight;
      return { id, label: deliverable, weight };
    });
  }, [deliverables, weights, stageId]);

  const totalWeight = useMemo(() => {
    return rows.reduce((sum, row) => sum + row.weight, 0);
  }, [rows]);

  const isBalanced = Math.abs(totalWeight - 100) < 0.5;

  const handleWeightChange = (subtaskId: string, value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return;
    const clamped = Math.max(0, Math.min(100, num));
    dispatch({ type: 'SET_SUBTASK_WEIGHT', stageId, subtaskId, weight: clamped });
  };

  if (deliverables.length === 0) return null;

  return (
    <div className={cn('rounded-lg bg-surface-800/50 backdrop-blur border border-surface-700/40 overflow-hidden', className)}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-surface-700/30">
        <h4 className="text-xs font-semibold text-surface-200 uppercase tracking-wider">
          IDoW Deliverable Breakdown
        </h4>
        <p className="text-[10px] text-surface-400 mt-0.5">
          Adjust sub-task weights within this stage (should sum to 100%).
        </p>
      </div>

      {/* Sub-task rows */}
      <div className="divide-y divide-surface-700/20">
        {rows.map(({ id, label, weight }) => (
          <div
            key={id}
            className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 px-3 py-2"
          >
            <Label className="flex-1 text-xs text-surface-300 capitalize leading-tight">
              {label}
            </Label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={0}
                max={100}
                step={1}
                value={Number(weight.toFixed(1))}
                onChange={(e) => handleWeightChange(id, e.target.value)}
                className="w-16 h-6 text-xs text-center tabular-nums"
                aria-label={`Weight for ${label}`}
              />
              <span className="text-xs text-surface-400">%</span>
            </div>
          </div>
        ))}
      </div>

      {/* Sum indicator */}
      <div className="px-3 py-2 border-t border-surface-700/30 flex items-center justify-between">
        <span className="text-[10px] font-medium text-surface-400 uppercase tracking-wider">
          Sub-task total
        </span>
        <span
          className={cn(
            'text-xs font-bold tabular-nums',
            isBalanced ? 'text-emerald-400' : 'text-amber-400'
          )}
        >
          {totalWeight.toFixed(1)}%
        </span>
      </div>
      {!isBalanced && (
        <div className="px-3 pb-2">
          <p className="text-[10px] text-amber-400/80">
            {totalWeight > 100
              ? 'Sub-task weights exceed 100%.'
              : 'Sub-task weights do not sum to 100%.'}
          </p>
        </div>
      )}
    </div>
  );
}
