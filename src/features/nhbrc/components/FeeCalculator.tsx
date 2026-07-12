/**
 * Fee Calculator Component
 *
 * Shows units and value inputs, calculates the enrolment fee
 * based on configured fee bands, and displays a fee disclaimer.
 *
 * Requirements: 11.9
 */

import React, { useState, useMemo } from 'react';
import { Calculator, Info } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { FeeBand } from '../types';

export interface FeeCalculatorProps {
  feeBands?: FeeBand[];
  onCalculate?: (units: number, valuePerUnit: number) => void;
}

const DEFAULT_FEE_BANDS: FeeBand[] = [
  { id: 'band-1', minValue: 0.01, maxValue: 500_000, feePerUnit: 1_298, effectiveFrom: '2024-01-01' },
  { id: 'band-2', minValue: 500_000.01, maxValue: 1_000_000, feePerUnit: 2_596, effectiveFrom: '2024-01-01' },
  { id: 'band-3', minValue: 1_000_000.01, maxValue: 2_500_000, feePerUnit: 5_192, effectiveFrom: '2024-01-01' },
  { id: 'band-4', minValue: 2_500_000.01, maxValue: 5_000_000, feePerUnit: 10_384, effectiveFrom: '2024-01-01' },
  { id: 'band-5', minValue: 5_000_000.01, maxValue: 999_999_999.99, feePerUnit: 20_768, effectiveFrom: '2024-01-01' },
];

const FEE_DISCLAIMER =
  'This fee is an estimate based on configured fee bands and does not constitute a formal NHBRC quotation. The actual fee must be confirmed with the NHBRC directly.';

function findFeeBand(valuePerUnit: number, bands: FeeBand[]): FeeBand | null {
  return bands.find((b) => valuePerUnit >= b.minValue && valuePerUnit <= b.maxValue) ?? null;
}

export function FeeCalculator({ feeBands, onCalculate }: FeeCalculatorProps) {
  const bands = feeBands ?? DEFAULT_FEE_BANDS;
  const [units, setUnits] = useState<string>('');
  const [valuePerUnit, setValuePerUnit] = useState<string>('');

  const calculation = useMemo(() => {
    const numUnits = parseInt(units, 10);
    const numValue = parseFloat(valuePerUnit);
    if (isNaN(numUnits) || isNaN(numValue) || numUnits <= 0 || numValue <= 0) {
      return null;
    }
    const band = findFeeBand(numValue, bands);
    if (!band) return { fee: null, error: 'No fee band configured for this value range.' };
    return { fee: numUnits * band.feePerUnit, band };
  }, [units, valuePerUnit, bands]);

  function handleCalculate() {
    const numUnits = parseInt(units, 10);
    const numValue = parseFloat(valuePerUnit);
    if (!isNaN(numUnits) && !isNaN(numValue) && numUnits > 0 && numValue > 0) {
      onCalculate?.(numUnits, numValue);
    }
  }

  return (
    <Card className="bg-slate-800/70 border-slate-700/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-100">
          <Calculator className="h-5 w-5 text-blue-400" aria-hidden="true" />
          Fee Calculator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="nhbrc-units" className="text-xs uppercase tracking-wider text-slate-400">
              Number of Units
            </label>
            <input
              id="nhbrc-units"
              type="number"
              min="1"
              step="1"
              value={units}
              onChange={(e) => setUnits(e.target.value)}
              placeholder="e.g. 12"
              className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="nhbrc-value" className="text-xs uppercase tracking-wider text-slate-400">
              Estimated Value per Unit (ZAR)
            </label>
            <input
              id="nhbrc-value"
              type="number"
              min="0.01"
              step="0.01"
              value={valuePerUnit}
              onChange={(e) => setValuePerUnit(e.target.value)}
              placeholder="e.g. 1500000"
              className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <Button onClick={handleCalculate} disabled={!calculation || calculation.fee === null} size="sm">
          Calculate Fee
        </Button>

        {/* Calculated result */}
        {calculation && (
          <div className="rounded-lg border border-slate-700/40 bg-slate-900/50 p-4">
            {calculation.fee !== null ? (
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wider text-slate-400">Estimated Enrolment Fee</p>
                <p className="text-2xl font-bold text-green-400">
                  R {calculation.fee.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                {'band' in calculation && calculation.band && (
                  <p className="text-xs text-slate-400">
                    Fee band: R{calculation.band.feePerUnit.toLocaleString()} per unit ×{' '}
                    {parseInt(units, 10)} unit{parseInt(units, 10) !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-red-400">{'error' in calculation ? calculation.error : ''}</p>
            )}
          </div>
        )}

        {/* Fee disclaimer */}
        <div className="flex items-start gap-2 rounded-md border border-slate-700/30 bg-slate-950/30 px-3 py-2">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-400" aria-hidden="true" />
          <p className="text-xs text-slate-400 leading-relaxed">{FEE_DISCLAIMER}</p>
        </div>
      </CardContent>
    </Card>
  );
}
