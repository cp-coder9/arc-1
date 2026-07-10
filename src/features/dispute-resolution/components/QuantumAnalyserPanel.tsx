/**
 * Quantum Analyser Panel
 *
 * Cost line items table with category, quantity, rate, amount.
 * Category subtotals and total. Percentage breakdown per cost category.
 *
 * Requirements: 9.2, 9.4
 */

import React from 'react';
import { Calculator, TrendingUp } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell, TableFooter } from '@/components/ui/table';
import type { QuantumAssessment, DelayAnalysis, CostCategory } from '../types';
import { DelayAnalysisPanel } from './DelayAnalysisPanel';

export interface QuantumAnalyserPanelProps {
  assessments: QuantumAssessment[];
  delayAnalyses: DelayAnalysis[];
  selectedAssessmentId?: string;
}

const CATEGORY_LABELS: Record<CostCategory, string> = {
  labour: 'Labour',
  materials: 'Materials',
  plant: 'Plant',
  preliminaries: 'Preliminaries',
  overheads: 'Overheads',
  profit: 'Profit',
  other: 'Other',
};

const CATEGORY_COLORS: Record<CostCategory, string> = {
  labour: 'bg-blue-500',
  materials: 'bg-emerald-500',
  plant: 'bg-amber-500',
  preliminaries: 'bg-purple-500',
  overheads: 'bg-rose-500',
  profit: 'bg-cyan-500',
  other: 'bg-slate-500',
};

function formatCurrency(amount: number): string {
  return `R ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function QuantumAnalyserPanel({
  assessments,
  delayAnalyses,
  selectedAssessmentId,
}: QuantumAnalyserPanelProps) {
  const assessment = selectedAssessmentId
    ? assessments.find((a) => a.id === selectedAssessmentId)
    : assessments[0];

  const delayAnalysis = assessment
    ? delayAnalyses.find((d) => d.claimId === assessment.claimId)
    : delayAnalyses[0];

  return (
    <div className="space-y-6 pt-4">
      {/* Assessment selector if multiple */}
      {assessments.length > 1 && (
        <Card size="sm" className="bg-slate-800/60 border-slate-700/50">
          <CardContent className="pt-3">
            <p className="text-xs uppercase tracking-wider text-slate-400 mb-2">
              Assessments ({assessments.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {assessments.map((a) => (
                <span
                  key={a.id}
                  className={`inline-flex items-center rounded-md border px-2 py-1 text-xs ${
                    a.id === assessment?.id
                      ? 'bg-blue-950/60 text-blue-300 border-blue-500'
                      : 'bg-slate-800/40 text-slate-400 border-slate-700/50'
                  }`}
                >
                  {a.claimId} — {formatCurrency(a.totalQuantumAmount)}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!assessment ? (
        <Card className="bg-slate-800/60 border-slate-700/50">
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500 text-center">No quantum assessment available.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Quantum summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card size="sm" className="bg-slate-800/60 border-slate-700/50">
              <CardContent className="pt-3">
                <p className="text-xs uppercase tracking-wider text-slate-400">Total Quantum</p>
                <p className="text-2xl font-bold text-slate-100">{formatCurrency(assessment.totalQuantumAmount)}</p>
              </CardContent>
            </Card>
            <Card size="sm" className="bg-slate-800/60 border-slate-700/50">
              <CardContent className="pt-3">
                <p className="text-xs uppercase tracking-wider text-slate-400">Line Items</p>
                <p className="text-2xl font-bold text-slate-100">{assessment.lineItems.length}</p>
              </CardContent>
            </Card>
            <Card size="sm" className="bg-slate-800/60 border-slate-700/50">
              <CardContent className="pt-3">
                <p className="text-xs uppercase tracking-wider text-slate-400">Categories</p>
                <p className="text-2xl font-bold text-slate-100">
                  {Object.keys(assessment.subtotalByCategory).filter(
                    (k) => assessment.subtotalByCategory[k as CostCategory] > 0
                  ).length}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Percentage breakdown bar */}
          <Card className="bg-slate-800/60 border-slate-700/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-400" aria-hidden="true" />
                <CardTitle className="text-sm text-slate-200">Category Breakdown</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {/* Stacked bar */}
              <div className="h-6 flex rounded-md overflow-hidden mb-4" role="img" aria-label="Cost category percentage breakdown">
                {(Object.entries(assessment.percentageByCategory) as [CostCategory, number][])
                  .filter(([, pct]) => pct > 0)
                  .map(([category, pct]) => (
                    <div
                      key={category}
                      className={`${CATEGORY_COLORS[category]} opacity-80`}
                      style={{ width: `${pct}%` }}
                      title={`${CATEGORY_LABELS[category]}: ${pct.toFixed(1)}%`}
                    />
                  ))}
              </div>
              {/* Legend */}
              <div className="flex flex-wrap gap-3">
                {(Object.entries(assessment.percentageByCategory) as [CostCategory, number][])
                  .filter(([, pct]) => pct > 0)
                  .map(([category, pct]) => (
                    <div key={category} className="flex items-center gap-1.5">
                      <div className={`h-3 w-3 rounded-sm ${CATEGORY_COLORS[category]}`} />
                      <span className="text-xs text-slate-300">
                        {CATEGORY_LABELS[category]}: {pct.toFixed(1)}%
                      </span>
                      <span className="text-xs text-slate-500">
                        ({formatCurrency(assessment.subtotalByCategory[category])})
                      </span>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          {/* Line items table */}
          <Card className="bg-slate-800/60 border-slate-700/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4 text-blue-400" aria-hidden="true" />
                <CardTitle className="text-sm text-slate-200">Cost Line Items</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700/50">
                    <TableHead className="text-slate-400">Description</TableHead>
                    <TableHead className="text-slate-400">Category</TableHead>
                    <TableHead className="text-slate-400 text-right">Qty</TableHead>
                    <TableHead className="text-slate-400">Unit</TableHead>
                    <TableHead className="text-slate-400 text-right">Rate</TableHead>
                    <TableHead className="text-slate-400 text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assessment.lineItems.map((item) => (
                    <TableRow key={item.id} className="border-slate-700/50">
                      <TableCell className="text-slate-300 text-xs max-w-[200px] truncate">
                        {item.description}
                      </TableCell>
                      <TableCell className="text-slate-300 text-xs">
                        {CATEGORY_LABELS[item.costCategory]}
                      </TableCell>
                      <TableCell className="text-slate-200 text-xs text-right">
                        {item.quantity.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-slate-400 text-xs">{item.unit}</TableCell>
                      <TableCell className="text-slate-200 text-xs text-right">
                        {formatCurrency(item.rate)}
                      </TableCell>
                      <TableCell className="text-slate-100 text-xs font-medium text-right">
                        {formatCurrency(item.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="border-slate-700/50">
                    <TableCell colSpan={5} className="text-sm font-semibold text-slate-200 text-right">
                      Total
                    </TableCell>
                    <TableCell className="text-sm font-bold text-slate-100 text-right">
                      {formatCurrency(assessment.totalQuantumAmount)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* Delay analysis section */}
      {delayAnalysis && (
        <DelayAnalysisPanel analysis={delayAnalysis} />
      )}
    </div>
  );
}
