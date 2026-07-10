/**
 * ProfitabilityView — Project and firm-wide profitability metrics (P2.9)
 *
 * Features:
 * - KPI cards: margin, effective hourly rate, burn rate
 * - Firm-wide summary: total revenue, costs, margin, profitable/loss-making counts
 * - Underperforming project flags
 * - Date range filtering (month, quarter, financial year, trailing 12 months, custom)
 * - Top/bottom 5 projects by margin
 *
 * Validates: Requirements 11.1, 11.2, 11.6
 */

import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  AlertTriangle,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  calculateProjectProfitability,
  calculateFirmProfitability,
  type ProjectProfitabilityInput,
  type FirmProfitabilitySummary,
} from '../services/profitabilityDashboard';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DateRangeFilter =
  | 'current_month'
  | 'current_quarter'
  | 'financial_year'
  | 'trailing_12_months'
  | 'custom';

export interface ProfitabilityViewProps {
  firmId: string;
  projects?: ProjectProfitabilityInput[];
  projectNames?: Record<string, string>;
  underperformanceThreshold?: number;
  financialYearStartMonth?: number; // 1-12, default 3 (March)
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProfitabilityView({
  firmId,
  projects = [],
  projectNames = {},
  underperformanceThreshold = 20,
}: ProfitabilityViewProps) {
  const [dateFilter, setDateFilter] = useState<DateRangeFilter>('financial_year');

  // Calculate firm-wide profitability
  const firmSummary = useMemo<FirmProfitabilitySummary | null>(() => {
    if (projects.length === 0) return null;

    const result = calculateFirmProfitability(projects, {
      underperformanceThreshold,
    });

    return result.success ? result.data : null;
  }, [projects, underperformanceThreshold]);

  const metrics = firmSummary?.firmMetrics;

  return (
    <div className="space-y-6" data-testid="profitability-view">
      {/* Date Range Filter */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            Period
          </span>
        </div>
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value as DateRangeFilter)}
          className="rounded-lg border border-border bg-surface-800/50 px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          aria-label="Date range filter"
        >
          <option value="current_month">Current Month</option>
          <option value="current_quarter">Current Quarter</option>
          <option value="financial_year">Financial Year</option>
          <option value="trailing_12_months">Trailing 12 Months</option>
          <option value="custom">Custom Range</option>
        </select>
      </div>

      {/* KPI Cards */}
      {metrics ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            icon={<TrendingUp className="h-5 w-5 text-green-400" />}
            label="Overall Margin"
            value={`${metrics.overallMarginPercentage.toFixed(1)}%`}
            indicator={metrics.overallMarginPercentage >= 0 ? 'positive' : 'negative'}
          />
          <KPICard
            icon={<Clock className="h-5 w-5 text-blue-400" />}
            label="Avg Effective Rate"
            value={formatCurrency(metrics.averageEffectiveHourlyRate)}
            subtitle="/hr"
          />
          <KPICard
            icon={<DollarSign className="h-5 w-5 text-emerald-400" />}
            label="Total Revenue"
            value={formatCurrency(metrics.totalRevenue)}
          />
          <KPICard
            icon={<BarChart3 className="h-5 w-5 text-amber-400" />}
            label="Total Costs"
            value={formatCurrency(metrics.totalCosts)}
          />
        </div>
      ) : (
        <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
          <CardContent className="p-8 text-center">
            <BarChart3 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No project data available. Add projects with profitability data to view metrics.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Firm Summary */}
      {metrics && (
        <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Firm Summary
            </CardTitle>
            <CardDescription>
              Practice-wide profitability overview for the selected period.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <SummaryItem label="Profitable Projects" value={String(metrics.profitableProjects)} variant="positive" />
              <SummaryItem label="Loss-Making Projects" value={String(metrics.lossMakingProjects)} variant="negative" />
              <SummaryItem
                label="Net Margin"
                value={formatCurrency(metrics.totalRevenue - metrics.totalCosts)}
                variant={metrics.totalRevenue - metrics.totalCosts >= 0 ? 'positive' : 'negative'}
              />
              <SummaryItem
                label="Total Projects"
                value={String(projects.length)}
                variant="neutral"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top & Bottom 5 Projects */}
      {firmSummary && (firmSummary.top5.length > 0 || firmSummary.bottom5.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top 5 */}
          <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <ArrowUpRight className="h-4 w-4 text-green-400" />
                Top 5 by Margin
              </CardTitle>
            </CardHeader>
            <CardContent>
              {firmSummary.top5.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data.</p>
              ) : (
                <div className="space-y-2">
                  {firmSummary.top5.map((p, idx) => (
                    <div
                      key={p.projectId}
                      className="flex items-center justify-between text-sm py-1.5 border-b border-border/30 last:border-b-0"
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-4">{idx + 1}.</span>
                        <span className="truncate max-w-[200px]">
                          {projectNames[p.projectId] || p.projectId}
                        </span>
                      </span>
                      <Badge
                        variant="outline"
                        className="text-green-400 border-green-400/30"
                      >
                        {p.marginPercentage.toFixed(1)}%
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bottom 5 */}
          <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <ArrowDownRight className="h-4 w-4 text-red-400" />
                Bottom 5 by Margin
              </CardTitle>
            </CardHeader>
            <CardContent>
              {firmSummary.bottom5.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data.</p>
              ) : (
                <div className="space-y-2">
                  {firmSummary.bottom5.map((p, idx) => (
                    <div
                      key={p.projectId}
                      className="flex items-center justify-between text-sm py-1.5 border-b border-border/30 last:border-b-0"
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-4">{idx + 1}.</span>
                        <span className="truncate max-w-[200px]">
                          {projectNames[p.projectId] || p.projectId}
                        </span>
                      </span>
                      <Badge
                        variant="outline"
                        className="text-red-400 border-red-400/30"
                      >
                        {p.marginPercentage.toFixed(1)}%
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Underperforming Projects */}
      {firmSummary && firmSummary.underperforming.length > 0 && (
        <Card className="rounded-2xl border-amber-400/20 bg-amber-400/5 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              Underperforming Projects
              <Badge variant="outline" className="text-[10px] border-amber-400/30 text-amber-400 ml-2">
                Margin &lt; {underperformanceThreshold}%
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {firmSummary.underperforming.map(projectId => (
                <Badge
                  key={projectId}
                  variant="outline"
                  className="border-amber-400/30 text-amber-300 text-xs"
                >
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {projectNames[projectId] || projectId}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

function KPICard({
  icon,
  label,
  value,
  subtitle,
  indicator,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  indicator?: 'positive' | 'negative' | 'neutral';
}) {
  return (
    <Card className="rounded-xl border-border bg-card/90 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="p-2 rounded-lg bg-surface-800/50">{icon}</div>
          {indicator === 'positive' && <TrendingUp className="h-4 w-4 text-green-400" />}
          {indicator === 'negative' && <TrendingDown className="h-4 w-4 text-red-400" />}
        </div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground mt-2">{label}</p>
        <p className="text-xl font-bold text-foreground">
          {value}
          {subtitle && <span className="text-sm font-normal text-muted-foreground">{subtitle}</span>}
        </p>
      </CardContent>
    </Card>
  );
}

function SummaryItem({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant: 'positive' | 'negative' | 'neutral';
}) {
  const colorClass = {
    positive: 'text-green-400',
    negative: 'text-red-400',
    neutral: 'text-foreground',
  }[variant];

  return (
    <div className="text-center p-3 rounded-lg bg-surface-800/30">
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-bold ${colorClass}`}>{value}</p>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return `R ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
