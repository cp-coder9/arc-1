/**
 * CapacityView — Staff Capacity Planning and Forecasting
 *
 * Displays staff allocation table, utilisation percentages,
 * 12-week forward capacity forecast chart, over-allocation warnings,
 * and leave recording interface.
 *
 * Validates: Requirements 12.1, 12.3, 12.4
 */

import React, { useState, useMemo } from 'react';
import {
  Users,
  Calendar,
  TrendingUp,
  AlertTriangle,
  Plus,
  Palmtree,
  BarChart3,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type {
  StaffMember,
  Allocation,
  LeaveRecord,
  LeaveType,
  StaffUtilisation,
  CapacityForecast,
  EnquiryRecord,
} from '../types';
import {
  calculateStaffUtilisation,
  forecastCapacity,
  evaluateCapacityAlerts,
  evaluateStaffOverAllocation,
  type CapacityAlert,
  type ConversionRates,
} from '../services/capacityPlanner';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CapacityViewProps {
  firmId: string;
  staff?: StaffMember[];
  allocations?: Allocation[];
  leave?: LeaveRecord[];
  pipeline?: EnquiryRecord[];
  conversionRates?: ConversionRates;
}

// ─── Leave Type Labels ────────────────────────────────────────────────────────

const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  annual: 'Annual Leave',
  sick: 'Sick Leave',
  study: 'Study Leave',
  other: 'Other',
};

// ─── Helper: Utilisation Badge ────────────────────────────────────────────────

function UtilisationBadge({ percentage }: { percentage: number }) {
  if (percentage > 100) {
    return (
      <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
        {percentage.toFixed(0)}% — Over-allocated
      </Badge>
    );
  }
  if (percentage > 85) {
    return (
      <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
        {percentage.toFixed(0)}%
      </Badge>
    );
  }
  if (percentage < 50) {
    return (
      <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
        {percentage.toFixed(0)}%
      </Badge>
    );
  }
  return (
    <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
      {percentage.toFixed(0)}%
    </Badge>
  );
}

// ─── Helper: Forecast Bar ─────────────────────────────────────────────────────

function ForecastBar({ forecast }: { forecast: CapacityForecast }) {
  const allocatedPct = forecast.totalCapacity > 0
    ? Math.min((forecast.totalAllocated / forecast.totalCapacity) * 100, 100)
    : 0;
  const pipelinePct = forecast.totalCapacity > 0
    ? Math.min((forecast.pipelineWeighted / forecast.totalCapacity) * 100, 100 - allocatedPct)
    : 0;

  const weekDate = new Date(forecast.weekStart);
  const weekLabel = weekDate.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' });

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{weekLabel}</span>
        <span>{forecast.firmUtilisation.toFixed(0)}%</span>
      </div>
      <div className="relative h-6 bg-surface-800 rounded overflow-hidden">
        <div
          className="absolute left-0 top-0 h-full bg-primary/70 rounded-l"
          style={{ width: `${allocatedPct}%` }}
          title={`Allocated: ${forecast.totalAllocated.toFixed(0)}h`}
        />
        <div
          className="absolute top-0 h-full bg-amber-500/50"
          style={{ left: `${allocatedPct}%`, width: `${pipelinePct}%` }}
          title={`Pipeline (weighted): ${forecast.pipelineWeighted.toFixed(0)}h`}
        />
        {forecast.firmUtilisation > 85 && (
          <div className="absolute right-1 top-0 h-full flex items-center">
            <AlertTriangle className="h-3 w-3 text-amber-400" />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CapacityView({
  firmId: _firmId,
  staff = [],
  allocations = [],
  leave = [],
  pipeline = [],
  conversionRates = { quote_sent: 0.30, quote_accepted: 0.70 },
}: CapacityViewProps) {
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [leaveStaffId, setLeaveStaffId] = useState('');
  const [leaveStartDate, setLeaveStartDate] = useState('');
  const [leaveEndDate, setLeaveEndDate] = useState('');
  const [leaveType, setLeaveType] = useState<LeaveType>('annual');

  const now = useMemo(() => new Date(), []);

  // ── Compute Staff Utilisation (current week) ──
  const staffUtilisations = useMemo(() => {
    const results: (StaffUtilisation & { staffName: string; discipline: string })[] = [];
    for (const member of staff) {
      const result = calculateStaffUtilisation(member, allocations, leave, now);
      if (result.success) {
        results.push({
          ...result.data,
          staffName: member.displayName,
          discipline: member.discipline,
        });
      }
    }
    return results.sort((a, b) => b.utilisationPercentage - a.utilisationPercentage);
  }, [staff, allocations, leave, now]);

  // ── Firm-wide Summary ──
  const firmSummary = useMemo(() => {
    const totalCapacity = staffUtilisations.reduce((sum, s) => sum + s.availableHours, 0);
    const totalAllocated = staffUtilisations.reduce((sum, s) => sum + s.allocatedHours, 0);
    const totalAvailable = totalCapacity - totalAllocated;
    const firmUtilisation = totalCapacity > 0 ? (totalAllocated / totalCapacity) * 100 : 0;
    const overAllocated = staffUtilisations.filter((s) => s.utilisationPercentage > 100).length;
    const underUtilised = staffUtilisations.filter((s) => s.utilisationPercentage < 50).length;
    return { totalCapacity, totalAllocated, totalAvailable, firmUtilisation, overAllocated, underUtilised };
  }, [staffUtilisations]);

  // ── 12-Week Forecast ──
  const forecastData = useMemo(() => {
    const result = forecastCapacity(staff, allocations, leave, pipeline, conversionRates, 12);
    return result.success ? result.data : [];
  }, [staff, allocations, leave, pipeline, conversionRates]);

  // ── Capacity Alerts ──
  const alerts = useMemo(() => {
    const result = evaluateCapacityAlerts(staff, allocations, leave, pipeline, conversionRates);
    return result.success ? result.data : [];
  }, [staff, allocations, leave, pipeline, conversionRates]);

  // ── Leave Recording ──
  const handleRecordLeave = () => {
    // In production, this would call an API to persist the leave record.
    // For now, just close the dialog — the data layer is managed externally.
    setShowLeaveDialog(false);
    setLeaveStaffId('');
    setLeaveStartDate('');
    setLeaveEndDate('');
    setLeaveType('annual');
  };

  // ── Empty State ──
  if (staff.length === 0) {
    return (
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardContent className="py-12 text-center">
          <Users className="h-12 w-12 text-surface-500 mx-auto mb-3" aria-hidden="true" />
          <p className="text-lg font-medium text-surface-300">No Staff Members</p>
          <p className="text-sm text-surface-500 mt-1">
            Add staff members to begin capacity planning.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="capacity-view">
      {/* ── Alerts Section ── */}
      {alerts.length > 0 && (
        <Card className="bg-amber-950/30 border-amber-500/30">
          <CardHeader>
            <CardTitle className="text-amber-400 flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5" />
              Capacity Warnings ({alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.map((alert: CapacityAlert, idx: number) => (
              <div
                key={idx}
                className="flex items-start gap-3 p-3 bg-surface-800/50 rounded-lg border border-surface-700/50"
              >
                <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-foreground">{alert.message}</p>
                  {alert.details.staffName && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Staff: {alert.details.staffName} — Allocated: {alert.details.allocatedHours}h / Available: {alert.details.availableHours}h
                    </p>
                  )}
                  {alert.details.firmUtilisation !== undefined && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Firm utilisation: {alert.details.firmUtilisation.toFixed(0)}% (threshold: {alert.details.threshold}%)
                    </p>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Firm Summary Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider mb-1">
              <Users className="h-4 w-4" />
              Total Capacity
            </div>
            <p className="text-2xl font-bold text-foreground">{firmSummary.totalCapacity.toFixed(0)}h</p>
            <p className="text-xs text-muted-foreground">per week</p>
          </CardContent>
        </Card>
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider mb-1">
              <BarChart3 className="h-4 w-4" />
              Allocated
            </div>
            <p className="text-2xl font-bold text-foreground">{firmSummary.totalAllocated.toFixed(0)}h</p>
            <p className="text-xs text-muted-foreground">{firmSummary.firmUtilisation.toFixed(0)}% utilisation</p>
          </CardContent>
        </Card>
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider mb-1">
              <TrendingUp className="h-4 w-4" />
              Available
            </div>
            <p className="text-2xl font-bold text-foreground">{firmSummary.totalAvailable.toFixed(0)}h</p>
            <p className="text-xs text-muted-foreground">spare capacity</p>
          </CardContent>
        </Card>
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider mb-1">
              <AlertTriangle className="h-4 w-4" />
              Flags
            </div>
            <p className="text-2xl font-bold text-foreground">
              {firmSummary.overAllocated + firmSummary.underUtilised}
            </p>
            <p className="text-xs text-muted-foreground">
              {firmSummary.overAllocated} over-allocated, {firmSummary.underUtilised} under 50%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Staff Allocation Table ── */}
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Staff Allocation
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowLeaveDialog(true)}
            className="flex items-center gap-1"
          >
            <Palmtree className="h-4 w-4" />
            Record Leave
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" role="table" aria-label="Staff allocation table">
              <thead>
                <tr className="border-b border-surface-700/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-3 pr-4">Staff Member</th>
                  <th className="py-3 pr-4">Discipline</th>
                  <th className="py-3 pr-4 text-right">Available</th>
                  <th className="py-3 pr-4 text-right">Allocated</th>
                  <th className="py-3 pr-4 text-right">Spare</th>
                  <th className="py-3 text-right">Utilisation</th>
                </tr>
              </thead>
              <tbody>
                {staffUtilisations.map((su) => (
                  <tr
                    key={su.staffId}
                    className="border-b border-surface-700/30 hover:bg-surface-700/20 transition-colors"
                  >
                    <td className="py-3 pr-4 font-medium text-foreground">{su.staffName}</td>
                    <td className="py-3 pr-4 capitalize text-muted-foreground">
                      {su.discipline.replace(/_/g, ' ')}
                    </td>
                    <td className="py-3 pr-4 text-right text-muted-foreground">
                      {su.availableHours.toFixed(0)}h
                    </td>
                    <td className="py-3 pr-4 text-right text-muted-foreground">
                      {su.allocatedHours.toFixed(0)}h
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <span className={su.availableCapacity < 0 ? 'text-red-400' : 'text-foreground'}>
                        {su.availableCapacity.toFixed(0)}h
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <UtilisationBadge percentage={su.utilisationPercentage} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── 12-Week Forecast Chart ── */}
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            12-Week Capacity Forecast
          </CardTitle>
        </CardHeader>
        <CardContent>
          {forecastData.length > 0 ? (
            <div className="space-y-3">
              {/* Legend */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-primary/70 inline-block" />
                  Allocated
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-amber-500/50 inline-block" />
                  Pipeline (weighted)
                </span>
                <span className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-amber-400" />
                  &gt;85% utilisation
                </span>
              </div>
              {/* Bars */}
              <div className="space-y-2">
                {forecastData.map((forecast: CapacityForecast) => (
                  <ForecastBar key={forecast.weekStart} forecast={forecast} />
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">
              Add staff members and allocations to generate a capacity forecast.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Leave Recording Dialog ── */}
      <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Leave</DialogTitle>
            <DialogDescription>
              Record staff leave to adjust available capacity for the period.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">
                Staff Member
              </label>
              <select
                className="w-full rounded-md border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-foreground"
                value={leaveStaffId}
                onChange={(e) => setLeaveStaffId(e.target.value)}
                aria-label="Select staff member"
              >
                <option value="">Select staff member...</option>
                {staff.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  className="w-full rounded-md border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-foreground"
                  value={leaveStartDate}
                  onChange={(e) => setLeaveStartDate(e.target.value)}
                  aria-label="Leave start date"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  className="w-full rounded-md border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-foreground"
                  value={leaveEndDate}
                  onChange={(e) => setLeaveEndDate(e.target.value)}
                  aria-label="Leave end date"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">
                Leave Type
              </label>
              <select
                className="w-full rounded-md border border-surface-700 bg-surface-800 px-3 py-2 text-sm text-foreground"
                value={leaveType}
                onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                aria-label="Leave type"
              >
                {(Object.entries(LEAVE_TYPE_LABELS) as [LeaveType, string][]).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowLeaveDialog(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!leaveStaffId || !leaveStartDate || !leaveEndDate}
                onClick={handleRecordLeave}
              >
                <Plus className="h-4 w-4 mr-1" />
                Record Leave
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
