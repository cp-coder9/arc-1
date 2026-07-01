import { useCallback } from 'react';
import { Settings2, RotateCcw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFeeProposalBuilder } from '../FeeProposalBuilderContext';

/**
 * TariffOverridePanel — Editable hourly rates, discipline factors, and percentage overrides.
 * Shows defaults with ability to edit. Dispatches SET_TARIFF_OVERRIDE / CLEAR_TARIFF_OVERRIDE.
 *
 * Requirements: 4.1, 4.2, 4.3
 */

export interface TariffOverrideItem {
  key: string;
  label: string;
  defaultValue: number;
  unit: string; // e.g. 'R/hr', '%', 'factor'
  step?: number;
  min?: number;
  max?: number;
}

export interface TariffOverridePanelProps {
  items: TariffOverrideItem[];
  className?: string;
}

export function TariffOverridePanel({ items, className }: TariffOverridePanelProps) {
  const { calculatorState, dispatch } = useFeeProposalBuilder();
  const { tariffOverrides } = calculatorState;

  const handleOverride = useCallback(
    (key: string, value: string) => {
      const parsed = parseFloat(value);
      if (isNaN(parsed)) return;
      dispatch({ type: 'SET_TARIFF_OVERRIDE', key, value: parsed });
    },
    [dispatch]
  );

  const handleReset = useCallback(
    (key: string) => {
      dispatch({ type: 'CLEAR_TARIFF_OVERRIDE', key });
    },
    [dispatch]
  );

  return (
    <div
      className={cn(
        'rounded-lg border border-surface-700/50 bg-surface-800/70 p-5 backdrop-blur',
        className
      )}
    >
      <h3 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-surface-400">
        <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
        Tariff Overrides
      </h3>

      <p className="mb-4 text-xs text-surface-500">
        Override default guideline values to match current market conditions. Reset to restore defaults.
      </p>

      <div className="space-y-3">
        {items.map((item) => {
          const isOverridden = item.key in tariffOverrides;
          const currentValue = isOverridden ? tariffOverrides[item.key] : item.defaultValue;

          return (
            <div key={item.key} className="grid grid-cols-[1fr_100px_28px] items-center gap-2">
              <Label
                htmlFor={`tariff-${item.key}`}
                className={cn(
                  'text-xs',
                  isOverridden ? 'text-amber-300' : 'text-surface-400'
                )}
              >
                {item.label}
                <span className="ml-1 text-surface-600">({item.unit})</span>
              </Label>
              <div className="relative">
                <Input
                  id={`tariff-${item.key}`}
                  type="number"
                  min={item.min ?? 0}
                  max={item.max}
                  step={item.step ?? 0.01}
                  value={currentValue}
                  onChange={(e) => handleOverride(item.key, e.target.value)}
                  className={cn(isOverridden && 'border-amber-500/40 text-amber-200')}
                  aria-label={`${item.label} (${item.unit})`}
                />
              </div>
              {isOverridden && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleReset(item.key)}
                  aria-label={`Reset ${item.label} to default (${item.defaultValue})`}
                  className="text-surface-500 hover:text-surface-300"
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
              )}
              {!isOverridden && <div className="w-7" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
