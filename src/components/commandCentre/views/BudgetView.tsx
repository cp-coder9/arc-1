'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DollarSign, TrendingUp, AlertTriangle, Plus } from 'lucide-react';
import { useDemoMode } from '@/demo-context/DemoModeProvider';
import type { BudgetPackage, BudgetSummary } from '@/services/commandCentre/types';

interface BudgetViewProps {
  projectId: string;
}

export default function BudgetView({ projectId }: BudgetViewProps) {
  const { isDemoMode } = useDemoMode();
  const [summary, setSummary] = useState<BudgetSummary | null>(null);
  const [packages, setPackages] = useState<BudgetPackage[]>([]);

  if (!isDemoMode) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <p className="text-lg text-muted-foreground">No live data connected yet</p>
        <p className="text-sm text-muted-foreground mt-2">
          Data integration pending for project {projectId}
        </p>
      </div>
    );
  }

  const statCards = summary
    ? [
        { label: 'Contract Sum', value: `R ${(summary.contractSum / 1_000_000).toFixed(2)}M`, icon: DollarSign },
        { label: 'Approved Variations', value: `R ${(summary.approvedVariations / 1_000).toFixed(0)}K`, icon: TrendingUp },
        { label: 'Spent to Date', value: `R ${(summary.spentToDate / 1_000_000).toFixed(2)}M`, icon: DollarSign },
        { label: 'Forecast at Completion', value: `R ${(summary.forecastAtCompletion / 1_000_000).toFixed(2)}M`, icon: TrendingUp },
      ]
    : [
        { label: 'Contract Sum', value: '—', icon: DollarSign },
        { label: 'Approved Variations', value: '—', icon: TrendingUp },
        { label: 'Spent to Date', value: '—', icon: DollarSign },
        { label: 'Forecast at Completion', value: '—', icon: TrendingUp },
      ];

  return (
    <div className="space-y-6">
      {/* Budget Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className="bg-surface-800/70 backdrop-blur border-surface-700/50">
              <CardContent className="pt-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{card.label}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xl font-bold">{card.value}</p>
                  <Icon className="h-5 w-5 text-primary-400 opacity-60" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Cost Breakdown Table */}
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">Cost Breakdown by Work Package</CardTitle>
          <Button size="sm" variant="outline" className="gap-1">
            <Plus className="h-3.5 w-3.5" />
            Add Variation
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-700/50">
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Package</th>
                  <th className="text-right py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Budget</th>
                  <th className="text-right py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Committed</th>
                  <th className="text-right py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Spent</th>
                  <th className="text-right py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Progress</th>
                  <th className="text-right py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Variance</th>
                </tr>
              </thead>
              <tbody>
                {packages.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-muted-foreground">
                      No budget packages configured
                    </td>
                  </tr>
                ) : (
                  packages.map((pkg) => (
                    <tr key={pkg.id} className="border-b border-surface-700/30">
                      <td className="py-2 px-2 font-medium">
                        <div className="flex items-center gap-2">
                          {pkg.name}
                          {pkg.isOverBudget && <AlertTriangle className="h-3.5 w-3.5 text-red-400" />}
                        </div>
                      </td>
                      <td className="text-right py-2 px-2">R {pkg.budgetAmount.toLocaleString()}</td>
                      <td className="text-right py-2 px-2">R {pkg.committedAmount.toLocaleString()}</td>
                      <td className="text-right py-2 px-2">R {pkg.spentAmount.toLocaleString()}</td>
                      <td className="text-right py-2 px-2">{pkg.progressPercent}%</td>
                      <td className="text-right py-2 px-2">
                        <Badge
                          variant="outline"
                          className={`text-xs ${pkg.isOverBudget ? 'border-red-500/50 text-red-400' : 'border-green-500/50 text-green-400'}`}
                        >
                          {pkg.variance > 0 ? '+' : ''}{pkg.variance.toFixed(1)}%
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
