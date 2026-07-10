/**
 * WIPDashboard — Firm-wide Work in Progress dashboard
 *
 * Displays:
 * - Firm-wide WIP summary (total WIP, project count, budget overruns)
 * - WIP by project (sorted by value descending)
 * - WIP by discipline
 * - Ageing buckets (0–30, 31–60, 61–90, 90+ days)
 * - Budget threshold indicators (80% warning, 100% critical)
 *
 * Validates: Requirements 9.3, 10.3
 */

import React, { useMemo } from 'react';
import {
  TrendingUp,
  AlertTriangle,
  AlertCircle,
  Clock,
  Layers,
  BarChart3,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type {
  WIPCalculation,
  PracticeDiscipline,
} from '../types';
import type { WIPAgeing, WIPAlert, FirmWIPSummary } from '../services/wipTracker';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface WIPDashboardProps {
  firmId: string;
  firmWIPSummary?: FirmWIPSummary;
  wipByDiscipline?: Record<PracticeDiscipline, number>;
  ageing?: WIPAgeing;
  alerts?: WIPAlert[];
  budgets?: Record<string, number | null>;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatZAR(amount: number): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatHours(hours: number): string {
  return `${hours.toFixed(1)}h`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WIPDashboard({
  firmId,
  firmWIPSummary,
  wipByDiscipline,
  ageing,
  alerts = [],
  budgets = {},
}: WIPDashboardProps) {
  const projectsOverBudget = useMemo(() => {
    if (!firmWIPSummary || !budgets) return 0;
    return firmWIPSummary.byProject.filter((project) => {
      const budget = budgets[project.projectId];
      return budget != null && budget > 0 && project.totalWIPValueZAR > budget;
    }).length;
  }, [firmWIPSummary, budgets]);

  return (
    <div className="space-y-6" data-testid="wip-dashboard">
      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-3 rounded-lg border p-3 ${
                alert.alertType === 'budget_critical'
                  ? 'border-red-500/50 bg-red-500/10 text-red-300'
                  : 'border-amber-500/50 bg-amber-500/10 text-amber-300'
              }`}
            >
              {alert.alertType === 'budget_critical' ? (
                <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
              )}
              <div>
                <p className="text-sm font-medium">
                  {alert.alertType === 'budget_critical' ? 'Budget Exceeded' : 'Budget Warning'}
                </p>
                <p className="text-xs mt-0.5 opacity-80">{alert.message}</p>
              </div>
              <Badge
                variant="outline"
                className={`ml-auto shrink-0 ${
                  alert.alertType === 'budget_critical'
                    ? 'border-red-500/50 text-red-300'
                    : 'border-amber-500/50 text-amber-300'
                }`}
              >
                {alert.percentage.toFixed(0)}%
              </Badge>
            </div>
          ))}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-xl border-border bg-card/90">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Total WIP</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {firmWIPSummary ? formatZAR(firmWIPSummary.totalWIP) : '—'}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-border bg-card/90">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Layers className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Active Projects</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {firmWIPSummary ? firmWIPSummary.projectCount : '—'}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-border bg-card/90">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Over Budget</span>
            </div>
            <p className={`text-2xl font-bold ${projectsOverBudget > 0 ? 'text-red-400' : 'text-foreground'}`}>
              {projectsOverBudget}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-border bg-card/90">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Clock className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Aged 90+</span>
            </div>
            <p className={`text-2xl font-bold ${ageing && ageing.bucket_90_plus > 0 ? 'text-amber-400' : 'text-foreground'}`}>
              {ageing ? formatHours(ageing.bucket_90_plus) : '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* WIP Ageing Buckets */}
      {ageing && (
        <Card className="rounded-xl border-border bg-card/90">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              WIP Ageing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <AgeingBucket label="0–30 days" hours={ageing.bucket_0_30} variant="good" />
              <AgeingBucket label="31–60 days" hours={ageing.bucket_31_60} variant="moderate" />
              <AgeingBucket label="61–90 days" hours={ageing.bucket_61_90} variant="warning" />
              <AgeingBucket label="90+ days" hours={ageing.bucket_90_plus} variant="critical" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* WIP by Project */}
      {firmWIPSummary && firmWIPSummary.byProject.length > 0 && (
        <Card className="rounded-xl border-border bg-card/90">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              WIP by Project
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-xs uppercase tracking-wider text-muted-foreground pb-2 border-b border-border">
                <span className="col-span-4">Project</span>
                <span className="col-span-2 text-right">WIP Value</span>
                <span className="col-span-2 text-right">Hours</span>
                <span className="col-span-2 text-right">Disbursements</span>
                <span className="col-span-2 text-right">Budget</span>
              </div>
              {firmWIPSummary.byProject.map((project) => {
                const budget = budgets[project.projectId];
                const budgetPct = budget && budget > 0
                  ? (project.totalWIPValueZAR / budget) * 100
                  : null;

                return (
                  <div
                    key={project.projectId}
                    className="grid grid-cols-12 gap-2 text-sm py-2 border-b border-border/50 last:border-0"
                  >
                    <span className="col-span-4 truncate text-foreground font-medium">
                      {project.projectId}
                    </span>
                    <span className="col-span-2 text-right text-foreground">
                      {formatZAR(project.totalWIPValueZAR)}
                    </span>
                    <span className="col-span-2 text-right text-muted-foreground">
                      {formatHours(project.billableHoursNotInvoiced)}
                    </span>
                    <span className="col-span-2 text-right text-muted-foreground">
                      {formatZAR(project.unbilledDisbursementsZAR)}
                    </span>
                    <span className="col-span-2 text-right">
                      {budgetPct !== null ? (
                        <BudgetIndicator percentage={budgetPct} />
                      ) : (
                        <Badge variant="outline" className="text-[10px]">No budget</Badge>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* WIP by Discipline */}
      {wipByDiscipline && Object.keys(wipByDiscipline).length > 0 && (
        <Card className="rounded-xl border-border bg-card/90">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              WIP by Discipline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(wipByDiscipline)
                .sort(([, a], [, b]) => b - a)
                .map(([discipline, value]) => (
                  <div
                    key={discipline}
                    className="flex items-center justify-between rounded-lg border border-border/50 bg-surface-800/30 p-3"
                  >
                    <span className="text-sm capitalize text-foreground">
                      {discipline.replace(/_/g, ' ')}
                    </span>
                    <span className="text-sm font-semibold text-foreground">
                      {formatZAR(value)}
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!firmWIPSummary && (
        <Card className="rounded-xl border-border bg-card/90">
          <CardContent className="p-8 text-center">
            <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-lg font-semibold text-foreground">No WIP Data</p>
            <p className="text-sm text-muted-foreground mt-1">
              WIP will appear once timesheet entries are approved and charge-out rates configured.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

function AgeingBucket({
  label,
  hours,
  variant,
}: {
  label: string;
  hours: number;
  variant: 'good' | 'moderate' | 'warning' | 'critical';
}) {
  const colorMap = {
    good: 'text-green-400 border-green-500/30 bg-green-500/5',
    moderate: 'text-blue-400 border-blue-500/30 bg-blue-500/5',
    warning: 'text-amber-400 border-amber-500/30 bg-amber-500/5',
    critical: 'text-red-400 border-red-500/30 bg-red-500/5',
  };

  return (
    <div className={`rounded-lg border p-3 text-center ${colorMap[variant]}`}>
      <p className="text-xs uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-xl font-bold mt-1">{formatHours(hours)}</p>
    </div>
  );
}

function BudgetIndicator({ percentage }: { percentage: number }) {
  if (percentage >= 100) {
    return (
      <Badge className="bg-red-500/20 text-red-300 border-red-500/50 text-[10px]">
        {percentage.toFixed(0)}%
      </Badge>
    );
  }
  if (percentage >= 80) {
    return (
      <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/50 text-[10px]">
        {percentage.toFixed(0)}%
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-green-400 border-green-500/50 text-[10px]">
      {percentage.toFixed(0)}%
    </Badge>
  );
}
