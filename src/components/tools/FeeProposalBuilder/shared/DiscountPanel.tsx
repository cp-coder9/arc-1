import React, { useState, useCallback } from 'react';
import { Percent } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useFeeProposalBuilder } from '../FeeProposalBuilderContext';

/**
 * DiscountPanel — Discount percentage input (0-100%) + mandatory reason textarea.
 * When discount > 0 and reason is empty, shows validation error.
 * Dispatches SET_DISCOUNT action to context.
 *
 * Requirements: 3.8, 3.9, 3.10
 */
export interface DiscountPanelProps {
  className?: string;
}

export function DiscountPanel({ className }: DiscountPanelProps) {
  const { calculatorState, dispatch } = useFeeProposalBuilder();
  const { discount } = calculatorState;

  const [touched, setTouched] = useState(false);
  const showError = touched && discount.percentage > 0 && discount.reason.trim() === '';

  const handlePercentageChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = parseFloat(e.target.value);
      const percentage = isNaN(raw) ? 0 : Math.min(100, Math.max(0, raw));
      dispatch({ type: 'SET_DISCOUNT', percentage, reason: discount.reason });
    },
    [dispatch, discount.reason]
  );

  const handleReasonChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setTouched(true);
      dispatch({ type: 'SET_DISCOUNT', percentage: discount.percentage, reason: e.target.value });
    },
    [dispatch, discount.percentage]
  );

  const handleReasonBlur = useCallback(() => {
    setTouched(true);
  }, []);

  return (
    <div
      className={cn(
        'rounded-lg border border-surface-700/50 bg-surface-800/70 p-5 backdrop-blur',
        className
      )}
    >
      <h3 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-surface-400">
        <Percent className="h-3.5 w-3.5" aria-hidden="true" />
        Discount
      </h3>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="discount-percentage" className="text-xs uppercase tracking-wider text-surface-400">
            Discount Percentage (%)
          </Label>
          <Input
            id="discount-percentage"
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={discount.percentage || ''}
            onChange={handlePercentageChange}
            placeholder="0"
            aria-describedby={showError ? 'discount-error' : undefined}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="discount-reason" className="text-xs uppercase tracking-wider text-surface-400">
            Reason for Discount
            {discount.percentage > 0 && <span className="ml-1 text-amber-400">*</span>}
          </Label>
          <Textarea
            id="discount-reason"
            value={discount.reason}
            onChange={handleReasonChange}
            onBlur={handleReasonBlur}
            placeholder="Provide justification for the applied discount..."
            aria-invalid={showError}
            aria-describedby={showError ? 'discount-error' : undefined}
          />
          {showError && (
            <p id="discount-error" className="text-xs font-medium text-red-400" role="alert">
              A reason is required when applying a discount.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
