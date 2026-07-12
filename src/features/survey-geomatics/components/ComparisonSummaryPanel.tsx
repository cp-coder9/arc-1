/**
 * Comparison Summary Panel
 *
 * Summary display for as-built comparisons:
 * - Total measurements count
 * - Within tolerance count
 * - Outside tolerance count
 * - Maximum deviation
 * - Compliance percentage (large display)
 *
 * Requirements: 19.4, 22.8
 */

import React, { useMemo } from 'react';
import { BarChart3, CheckCircle2, XCircle, TrendingUp } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { MeasurementPair } from '../types';

export interface ComparisonSummaryPanelProps {
  measurements: MeasurementPair[];
}

export function ComparisonSummaryPanel({ measurements }: ComparisonSummaryPanelProps) {
  const summary = useMemo(() => {
    const total = measurements.length;
    const within = measurements.filter((m) => m.isWithinTolerance).length;
    const outside = total - within;
    const maxDev = total > 0
      ? Math.max(...measurements.map((m) => m.absoluteDeviation))
      : 0;
    const compliance = total > 0
      ? Math.round((within / total) * 1000) / 10
      : 0.0;

    return { total, within, outside, maxDev, compliance };
  }, [measurements]);

  const complianceColor =
    summary.compliance >= 90
      ? 'text-green-400'
      : summary.compliance >= 70
        ? 'text-amber-400'
        : 'text-red-400';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-blue-400" aria-hidden="true" />
          <CardTitle className="text-base">Compliance Summary</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {/* Total Measurements */}
          <div className="rounded-lg border border-slate-700/40 bg-slate-800/30 p-3 text-center">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total
            </p>
            <p className="mt-1 text-2xl font-bold text-foreground">{summary.total}</p>
          </div>

          {/* Within Tolerance */}
          <div className="rounded-lg border border-green-700/30 bg-green-950/20 p-3 text-center">
            <p className="flex items-center justify-center gap-1 text-xs font-medium uppercase tracking-wider text-green-400">
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
              Within
            </p>
            <p className="mt-1 text-2xl font-bold text-green-300">{summary.within}</p>
          </div>

          {/* Outside Tolerance */}
          <div className="rounded-lg border border-red-700/30 bg-red-950/20 p-3 text-center">
            <p className="flex items-center justify-center gap-1 text-xs font-medium uppercase tracking-wider text-red-400">
              <XCircle className="h-3 w-3" aria-hidden="true" />
              Outside
            </p>
            <p className="mt-1 text-2xl font-bold text-red-300">{summary.outside}</p>
          </div>

          {/* Max Deviation */}
          <div className="rounded-lg border border-slate-700/40 bg-slate-800/30 p-3 text-center">
            <p className="flex items-center justify-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <TrendingUp className="h-3 w-3" aria-hidden="true" />
              Max Dev.
            </p>
            <p className="mt-1 text-2xl font-bold text-foreground">
              {summary.maxDev.toFixed(3)}
              <span className="ml-0.5 text-sm font-normal text-muted-foreground">m</span>
            </p>
          </div>

          {/* Compliance Percentage — Large Display */}
          <div className="col-span-2 rounded-lg border border-slate-700/40 bg-slate-800/30 p-4 text-center sm:col-span-1 lg:col-span-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Compliance
            </p>
            <p className={`mt-1 text-3xl font-bold ${complianceColor}`}>
              {summary.compliance.toFixed(1)}
              <span className="text-lg">%</span>
            </p>
          </div>
        </div>

        {/* Compliance Bar */}
        {summary.total > 0 && (
          <div className="mt-4 space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Tolerance compliance</span>
              <span>{summary.compliance.toFixed(1)}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full rounded-full transition-all ${
                  summary.compliance >= 90
                    ? 'bg-green-500'
                    : summary.compliance >= 70
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                }`}
                style={{ width: `${Math.min(summary.compliance, 100)}%` }}
              />
            </div>
          </div>
        )}

        {summary.total === 0 && (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            No measurements entered yet. Add measurement pairs above to see compliance summary.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
