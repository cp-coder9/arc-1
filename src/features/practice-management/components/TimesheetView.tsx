/**
 * TimesheetView — Weekly timesheet grid with approval workflow
 *
 * Displays:
 * - Weekly grid view (7-day period with entries per project/activity)
 * - Daily totals per column
 * - Billable vs non-billable split
 * - Submit for approval action
 * - Edit restrictions on approved/invoiced entries
 *
 * Validates: Requirements 10.3, 10.4, 10.10
 */

import React, { useState, useMemo } from 'react';
import {
  Clock,
  Send,
  Lock,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type {
  TimesheetEntry,
  TimesheetMetrics,
  TimesheetStatus,
  ActivityCategory,
} from '../types';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface TimesheetViewProps {
  firmId: string;
  staffId: string;
  entries?: TimesheetEntry[];
  metrics?: TimesheetMetrics;
  availableHoursPerWeek?: number;
  onSubmitWeek?: (weekStart: string, entries: TimesheetEntry[]) => void;
  onEntryEdit?: (entryId: string) => void;
  onEntryCreate?: (date: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekDates(weekStart: Date): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatDayShort(date: Date): string {
  return date.toLocaleDateString('en-ZA', { weekday: 'short' });
}

function formatDayNum(date: Date): string {
  return date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
}

const STATUS_CONFIG: Record<TimesheetStatus, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  draft: { label: 'Draft', color: 'text-muted-foreground border-border', icon: FileText },
  submitted: { label: 'Submitted', color: 'text-blue-400 border-blue-500/50', icon: Send },
  approved: { label: 'Approved', color: 'text-green-400 border-green-500/50', icon: CheckCircle2 },
  invoiced: { label: 'Invoiced', color: 'text-purple-400 border-purple-500/50', icon: Lock },
};

const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  design: 'Design',
  documentation: 'Documentation',
  administration: 'Admin',
  site_visit: 'Site Visit',
  meeting: 'Meeting',
  travel: 'Travel',
  research: 'Research',
  other: 'Other',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function TimesheetView({
  firmId,
  staffId,
  entries = [],
  metrics,
  availableHoursPerWeek = 40,
  onSubmitWeek,
  onEntryEdit,
  onEntryCreate,
}: TimesheetViewProps) {
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));

  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);

  // Filter entries for current week
  const weekEntries = useMemo(() => {
    const start = formatDate(weekDates[0]);
    const end = formatDate(weekDates[6]);
    return entries.filter((e) => e.date >= start && e.date <= end);
  }, [entries, weekDates]);

  // Daily totals
  const dailyTotals = useMemo(() => {
    return weekDates.map((date) => {
      const dateStr = formatDate(date);
      const dayEntries = weekEntries.filter((e) => e.date === dateStr);
      return dayEntries.reduce((sum, e) => sum + e.hours, 0);
    });
  }, [weekEntries, weekDates]);

  // Weekly total
  const weeklyTotal = useMemo(
    () => dailyTotals.reduce((sum, h) => sum + h, 0),
    [dailyTotals]
  );

  // Billable/non-billable split
  const billableSplit = useMemo(() => {
    const billable = weekEntries.filter((e) => e.billable).reduce((sum, e) => sum + e.hours, 0);
    const nonBillable = weekEntries.filter((e) => !e.billable).reduce((sum, e) => sum + e.hours, 0);
    return { billable, nonBillable };
  }, [weekEntries]);

  // Whether the week has draft entries that can be submitted
  const draftEntries = useMemo(
    () => weekEntries.filter((e) => e.status === 'draft'),
    [weekEntries]
  );
  const canSubmit = draftEntries.length > 0;

  // Group entries by project
  const entriesByProject = useMemo(() => {
    const grouped: Record<string, TimesheetEntry[]> = {};
    for (const entry of weekEntries) {
      if (!grouped[entry.projectId]) {
        grouped[entry.projectId] = [];
      }
      grouped[entry.projectId].push(entry);
    }
    return grouped;
  }, [weekEntries]);

  // Navigation
  const goToPreviousWeek = () => {
    const prev = new Date(weekStart);
    prev.setDate(prev.getDate() - 7);
    setWeekStart(prev);
  };

  const goToNextWeek = () => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + 7);
    setWeekStart(next);
  };

  const goToCurrentWeek = () => {
    setWeekStart(getMonday(new Date()));
  };

  const handleSubmit = () => {
    if (onSubmitWeek && canSubmit) {
      onSubmitWeek(formatDate(weekStart), draftEntries);
    }
  };

  const isEntryEditable = (entry: TimesheetEntry): boolean => {
    return entry.status === 'draft';
  };

  return (
    <div className="space-y-6" data-testid="timesheet-view">
      {/* Metrics Summary */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard
            label="Hours This Week"
            value={`${metrics.totalHoursWeek.toFixed(1)}h`}
          />
          <MetricCard
            label="Hours This Month"
            value={`${metrics.totalHoursMonth.toFixed(1)}h`}
          />
          <MetricCard
            label="Billable %"
            value={`${metrics.billablePercentage.toFixed(0)}%`}
            highlight={metrics.billablePercentage >= 70}
          />
          <MetricCard
            label="Utilisation"
            value={`${metrics.utilisationRate.toFixed(0)}%`}
            highlight={metrics.utilisationRate >= 75}
          />
        </div>
      )}

      {/* Week Navigation & Actions */}
      <Card className="rounded-xl border-border bg-card/90">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Weekly Timesheet
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={goToPreviousWeek}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={goToCurrentWeek}
                className="h-8 text-xs"
              >
                This Week
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={goToNextWeek}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {formatDayNum(weekDates[0])} — {formatDayNum(weekDates[6])}
          </p>
        </CardHeader>

        <CardContent>
          {/* Grid Header */}
          <div className="overflow-x-auto">
            <div className="min-w-[700px]">
              {/* Day Headers */}
              <div className="grid grid-cols-[180px_repeat(7,1fr)_80px] gap-1 mb-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground py-2">
                  Project
                </div>
                {weekDates.map((date, idx) => (
                  <div key={idx} className="text-center py-2">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      {formatDayShort(date)}
                    </p>
                    <p className="text-xs text-muted-foreground">{date.getDate()}</p>
                  </div>
                ))}
                <div className="text-xs uppercase tracking-wider text-muted-foreground py-2 text-right">
                  Total
                </div>
              </div>

              {/* Entry Rows by Project */}
              {Object.entries(entriesByProject).length > 0 ? (
                Object.entries(entriesByProject).map(([projectId, projectEntries]) => {
                  const projectTotal = projectEntries.reduce((sum, e) => sum + e.hours, 0);
                  return (
                    <div
                      key={projectId}
                      className="grid grid-cols-[180px_repeat(7,1fr)_80px] gap-1 border-b border-border/30 py-1"
                    >
                      <div className="flex items-center gap-1 truncate text-sm text-foreground font-medium py-1">
                        <span className="truncate">{projectId}</span>
                      </div>
                      {weekDates.map((date, idx) => {
                        const dateStr = formatDate(date);
                        const dayEntries = projectEntries.filter((e) => e.date === dateStr);
                        const dayHours = dayEntries.reduce((sum, e) => sum + e.hours, 0);
                        const hasLocked = dayEntries.some(
                          (e) => e.status === 'approved' || e.status === 'invoiced'
                        );

                        return (
                          <div
                            key={idx}
                            className="relative flex items-center justify-center"
                          >
                            {dayHours > 0 ? (
                              <button
                                onClick={() => {
                                  const entry = dayEntries[0];
                                  if (entry && isEntryEditable(entry) && onEntryEdit) {
                                    onEntryEdit(entry.id);
                                  }
                                }}
                                disabled={hasLocked}
                                className={`w-full rounded px-1 py-1 text-center text-sm font-medium transition-colors ${
                                  hasLocked
                                    ? 'bg-surface-800/50 text-muted-foreground cursor-not-allowed'
                                    : 'bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer'
                                }`}
                                title={
                                  hasLocked
                                    ? 'Entry is locked (approved/invoiced)'
                                    : `${dayHours}h — click to edit`
                                }
                              >
                                {dayHours.toFixed(dayHours % 1 === 0 ? 0 : 1)}
                                {hasLocked && <Lock className="h-3 w-3 inline ml-0.5 opacity-60" />}
                              </button>
                            ) : (
                              <button
                                onClick={() => onEntryCreate?.(dateStr)}
                                className="w-full rounded px-1 py-1 text-center text-sm text-muted-foreground/50 hover:bg-surface-800/50 hover:text-muted-foreground transition-colors cursor-pointer"
                                title="Add entry"
                              >
                                —
                              </button>
                            )}
                          </div>
                        );
                      })}
                      <div className="flex items-center justify-end text-sm font-semibold text-foreground py-1">
                        {projectTotal.toFixed(1)}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No timesheet entries for this week.
                </div>
              )}

              {/* Daily Totals Row */}
              <div className="grid grid-cols-[180px_repeat(7,1fr)_80px] gap-1 border-t border-border pt-2 mt-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground py-1 font-semibold">
                  Daily Total
                </div>
                {dailyTotals.map((total, idx) => (
                  <div
                    key={idx}
                    className={`text-center text-sm font-bold py-1 ${
                      total > 0 ? 'text-foreground' : 'text-muted-foreground/50'
                    }`}
                  >
                    {total > 0 ? total.toFixed(1) : '—'}
                  </div>
                ))}
                <div className="text-right text-sm font-bold text-primary py-1">
                  {weeklyTotal.toFixed(1)}h
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Billable / Non-Billable Split */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="rounded-xl border-border bg-card/90">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Billable</p>
                <p className="text-xl font-bold text-green-400 mt-1">
                  {billableSplit.billable.toFixed(1)}h
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-400" />
              </div>
            </div>
            {weeklyTotal > 0 && (
              <div className="mt-2 h-1.5 rounded-full bg-surface-800 overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{ width: `${(billableSplit.billable / weeklyTotal) * 100}%` }}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-xl border-border bg-card/90">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Non-Billable</p>
                <p className="text-xl font-bold text-muted-foreground mt-1">
                  {billableSplit.nonBillable.toFixed(1)}h
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-surface-800/50 border border-border flex items-center justify-center">
                <Clock className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
            {weeklyTotal > 0 && (
              <div className="mt-2 h-1.5 rounded-full bg-surface-800 overflow-hidden">
                <div
                  className="h-full bg-muted-foreground/50 rounded-full transition-all"
                  style={{ width: `${(billableSplit.nonBillable / weeklyTotal) * 100}%` }}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Submit Action */}
      <Card className="rounded-xl border-border bg-card/90">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                Submit Week for Approval
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {canSubmit
                  ? `${draftEntries.length} draft ${draftEntries.length === 1 ? 'entry' : 'entries'} ready for submission`
                  : 'No draft entries to submit for this week'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {weekEntries.some((e) => e.status === 'submitted') && (
                <Badge variant="outline" className="text-blue-400 border-blue-500/50">
                  <Send className="h-3 w-3 mr-1" />
                  Submitted
                </Badge>
              )}
              {weekEntries.some((e) => e.status === 'approved') && (
                <Badge variant="outline" className="text-green-400 border-green-500/50">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Approved
                </Badge>
              )}
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit}
                size="sm"
                className="gap-2"
              >
                <Send className="h-4 w-4" />
                Submit for Approval
              </Button>
            </div>
          </div>

          {/* Edit Restriction Notice */}
          {weekEntries.some((e) => e.status === 'approved' || e.status === 'invoiced') && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2">
              <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-300">
                Some entries this week have been approved or invoiced and cannot be edited.
                Only draft entries may be modified.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Card className="rounded-xl border-border bg-card/90">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`text-xl font-bold mt-1 ${highlight ? 'text-green-400' : 'text-foreground'}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
