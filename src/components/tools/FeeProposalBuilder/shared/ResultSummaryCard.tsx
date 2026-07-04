import { Calculator } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FeeCalculationResult } from '@/services/professionalFee/types';
import { useFeeProposalBuilder } from '../FeeProposalBuilderContext';

/**
 * ResultSummaryCard — Fee breakdown display card showing all result fields.
 * Uses a glass card with grid layout. Shows "Project Fee Rate %" and
 * "Scope of Work Fee Rate %" for architect profession.
 *
 * Requirements: 1.10, 15.6
 */
export interface ResultSummaryCardProps {
  className?: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 }).format(value);
}

function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

interface ResultRowProps {
  label: string;
  value: string;
  highlight?: boolean;
  muted?: boolean;
}

function ResultRow({ label, value, highlight, muted }: ResultRowProps) {
  return (
    <div className={cn('flex items-center justify-between py-1.5', highlight && 'border-t border-surface-700/50 pt-3')}>
      <span className={cn('text-xs uppercase tracking-wider', muted ? 'text-surface-500' : 'text-surface-400')}>
        {label}
      </span>
      <span className={cn('font-mono text-sm', highlight ? 'text-lg font-bold text-white' : muted ? 'text-surface-500' : 'text-surface-200')}>
        {value}
      </span>
    </div>
  );
}

export function ResultSummaryCard({ className }: ResultSummaryCardProps) {
  const { calculatorState, activeProfession } = useFeeProposalBuilder();
  const result: FeeCalculationResult | null = calculatorState.result;

  if (!result) {
    return (
      <div
        className={cn(
          'rounded-lg border border-surface-700/50 bg-surface-800/70 p-6 backdrop-blur',
          className
        )}
      >
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-surface-500">
          <Calculator className="h-8 w-8" aria-hidden="true" />
          <p className="text-sm">Enter project details to calculate fees</p>
        </div>
      </div>
    );
  }

  const projectFeeRate = result.guidelineProfessionalFee > 0 && calculatorState.projectValue > 0
    ? result.guidelineProfessionalFee / calculatorState.projectValue
    : 0;

  const scopeFeeRate = result.stageAdjustedFee > 0 && calculatorState.projectValue > 0
    ? result.stageAdjustedFee / calculatorState.projectValue
    : 0;

  return (
    <div
      className={cn(
        'rounded-lg border border-surface-700/50 bg-surface-800/70 p-6 backdrop-blur',
        className
      )}
      aria-label="Fee calculation results"
    >
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-surface-400">
        Fee Breakdown
      </h3>

      <div className="space-y-1">
        <ResultRow label="Guideline Professional Fee" value={formatCurrency(result.guidelineProfessionalFee)} />
        <ResultRow label="Stage-Adjusted Fee" value={formatCurrency(result.stageAdjustedFee)} />

        {activeProfession === 'architect' && (
          <>
            <ResultRow label="Project Fee Rate %" value={formatPercentage(projectFeeRate)} muted />
            <ResultRow label="Scope of Work Fee Rate %" value={formatPercentage(scopeFeeRate)} muted />
          </>
        )}

        <ResultRow label="Professional Fee (before discount)" value={formatCurrency(result.professionalFeeBeforeDiscount)} />

        {result.discountAmount > 0 && (
          <ResultRow label="Discount" value={`-${formatCurrency(result.discountAmount)}`} muted />
        )}

        <ResultRow label="Professional Fee (after discount)" value={formatCurrency(result.professionalFeeAfterDiscount)} />

        {result.disbursementsTotal > 0 && (
          <ResultRow label="Disbursements" value={formatCurrency(result.disbursementsTotal)} />
        )}

        {result.statutoryFeesTotal > 0 && (
          <ResultRow label="Statutory Fees" value={formatCurrency(result.statutoryFeesTotal)} />
        )}

        <ResultRow label="VAT (15%)" value={formatCurrency(result.vatAmount)} />
        <ResultRow label="Total (incl. VAT)" value={formatCurrency(result.totalInclVat)} highlight />
      </div>

      {result.warnings.length > 0 && (
        <div className="mt-4 space-y-1 border-t border-surface-700/50 pt-3">
          {result.warnings.map((warning, i) => (
            <p key={i} className="text-xs text-amber-400">⚠ {warning}</p>
          ))}
        </div>
      )}
    </div>
  );
}
