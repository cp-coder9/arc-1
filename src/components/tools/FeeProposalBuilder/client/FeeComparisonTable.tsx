// FeeComparisonTable — Show estimates vs actual proposed fees when available
//
// Requirements: 14.6, 14.7

import { ArrowRight } from 'lucide-react';

interface EstimationResult {
  profession: string;
  displayName: string;
  lowEstimate: number;
  highEstimate: number;
  midEstimate: number;
}

export interface FeeComparisonTableProps {
  estimates: EstimationResult[];
  proposedFees?: Record<string, number>; // profession -> proposed amount
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 0 }).format(value);
}

export function FeeComparisonTable({ estimates, proposedFees }: FeeComparisonTableProps) {
  if (!proposedFees || Object.keys(proposedFees).length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5 space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
        Estimate vs Proposed Comparison
      </h3>
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_120px_24px_120px] gap-2 text-xs uppercase tracking-wider text-surface-500">
          <span>Discipline</span>
          <span className="text-right">Estimate (mid)</span>
          <span />
          <span className="text-right">Proposed</span>
        </div>
        {estimates.map((est) => {
          const proposed = proposedFees[est.profession];
          if (!proposed) return null;
          const diff = proposed - est.midEstimate;
          const isHigher = diff > 0;
          return (
            <div key={est.profession} className="grid grid-cols-[1fr_120px_24px_120px] gap-2 items-center py-1.5 border-b border-surface-700/30 last:border-0">
              <span className="text-sm text-surface-200 truncate">{est.displayName}</span>
              <span className="text-sm font-mono text-surface-400 text-right">{formatCurrency(est.midEstimate)}</span>
              <ArrowRight className="h-3.5 w-3.5 text-surface-500 mx-auto" />
              <span className={`text-sm font-mono text-right ${isHigher ? 'text-amber-300' : 'text-emerald-300'}`}>
                {formatCurrency(proposed)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
