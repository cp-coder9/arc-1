/**
 * ComplianceView — Staff PI Insurance and Professional Registration Tracking
 *
 * Displays staff compliance list with PI/registration status badges,
 * firm-wide compliance score, alert indicators, and advisory disclaimer.
 *
 * Validates: Requirements 13.1, 13.6, 13.9
 */

import React, { useMemo } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Info,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { StaffComplianceRecord } from '../types';
import {
  evaluateComplianceStatus,
  calculateFirmCompliance,
  generateComplianceAlerts,
  COMPLIANCE_DISCLAIMER,
  type ComplianceStatusResult,
  type FirmComplianceSummary,
  type ComplianceAlert,
  type PIStatus,
  type RegistrationStatus,
} from '../services/staffCompliance';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ComplianceViewProps {
  firmId: string;
  records?: StaffComplianceRecord[];
}

// ─── Status Badge Helpers ─────────────────────────────────────────────────────

function PIStatusBadge({ status, daysRemaining }: { status: PIStatus; daysRemaining: number | null }) {
  switch (status) {
    case 'valid':
      return (
        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          PI Valid{daysRemaining !== null ? ` (${daysRemaining}d)` : ''}
        </Badge>
      );
    case 'expiring_60':
      return (
        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
          <Clock className="h-3 w-3 mr-1" />
          PI Expiring ({daysRemaining}d)
        </Badge>
      );
    case 'expiring_30':
      return (
        <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">
          <AlertTriangle className="h-3 w-3 mr-1" />
          PI Urgent ({daysRemaining}d)
        </Badge>
      );
    case 'lapsed':
      return (
        <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
          <XCircle className="h-3 w-3 mr-1" />
          PI Lapsed
        </Badge>
      );
    case 'not_set':
      return (
        <Badge className="bg-surface-600/20 text-surface-400 border-surface-600/30">
          Not Set
        </Badge>
      );
    default:
      return null;
  }
}

function RegistrationStatusBadge({
  status,
  daysRemaining,
}: {
  status: RegistrationStatus;
  daysRemaining: number | null;
}) {
  switch (status) {
    case 'valid':
      return (
        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Registered{daysRemaining !== null ? ` (${daysRemaining}d)` : ''}
        </Badge>
      );
    case 'lifetime':
      return (
        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
          <ShieldCheck className="h-3 w-3 mr-1" />
          Lifetime
        </Badge>
      );
    case 'expiring_90':
      return (
        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
          <Clock className="h-3 w-3 mr-1" />
          Expiring ({daysRemaining}d)
        </Badge>
      );
    case 'lapsed':
      return (
        <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
          <XCircle className="h-3 w-3 mr-1" />
          Lapsed
        </Badge>
      );
    default:
      return null;
  }
}

// ─── Compliance Score Gauge ───────────────────────────────────────────────────

function ComplianceScoreCard({ summary }: { summary: FirmComplianceSummary }) {
  const score = summary.complianceScore;
  let scoreColor = 'text-green-400';
  let bgColor = 'bg-green-500/10';
  if (score < 50) {
    scoreColor = 'text-red-400';
    bgColor = 'bg-red-500/10';
  } else if (score < 80) {
    scoreColor = 'text-amber-400';
    bgColor = 'bg-amber-500/10';
  }

  return (
    <Card className={`${bgColor} border-surface-700/50`}>
      <CardContent className="pt-4 text-center">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
          Firm Compliance Score
        </p>
        <p className={`text-4xl font-bold ${scoreColor}`}>{score.toFixed(0)}%</p>
        <p className="text-xs text-muted-foreground mt-1">
          {summary.staffWithValidPI} of {summary.totalStaffTracked} with valid PI &amp; registration
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ComplianceView({
  firmId: _firmId,
  records = [],
}: ComplianceViewProps) {
  const now = useMemo(() => new Date(), []);

  // ── Evaluate each staff member's compliance status ──
  const staffStatuses = useMemo(() => {
    const results: ComplianceStatusResult[] = [];
    for (const record of records) {
      const result = evaluateComplianceStatus(record, now);
      if (result.success) {
        results.push(result.data);
      }
    }
    return results;
  }, [records, now]);

  // ── Firm-wide compliance summary ──
  const firmSummary = useMemo(() => {
    const result = calculateFirmCompliance(records, now);
    return result.success ? result.data : null;
  }, [records, now]);

  // ── Compliance alerts ──
  const alerts = useMemo(() => {
    const result = generateComplianceAlerts(records, now);
    return result.success ? result.data : [];
  }, [records, now]);

  // ── Empty State ──
  if (records.length === 0) {
    return (
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardContent className="py-12 text-center">
          <ShieldCheck className="h-12 w-12 text-surface-500 mx-auto mb-3" aria-hidden="true" />
          <p className="text-lg font-medium text-surface-300">No Compliance Records</p>
          <p className="text-sm text-surface-500 mt-1">
            Add staff compliance records to track professional registration and PI insurance.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="compliance-view">
      {/* ── Advisory Disclaimer (Req 13.9) ── */}
      <Card className="bg-blue-950/30 border-blue-500/30">
        <CardContent className="py-3 flex items-start gap-3">
          <Info className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-300">{COMPLIANCE_DISCLAIMER}</p>
        </CardContent>
      </Card>

      {/* ── Alerts Section ── */}
      {alerts.length > 0 && (
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-400" />
              Compliance Alerts ({alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.map((alert: ComplianceAlert, idx: number) => {
              let alertColor = 'text-amber-400';
              if (alert.severity === 'urgent') alertColor = 'text-orange-400';
              if (alert.severity === 'critical') alertColor = 'text-red-400';

              return (
                <div
                  key={`${alert.staffId}-${alert.category}-${idx}`}
                  className="flex items-start gap-3 p-3 bg-surface-800/50 rounded-lg border border-surface-700/50"
                >
                  <AlertTriangle className={`h-4 w-4 ${alertColor} mt-0.5 shrink-0`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {alert.staffDisplayName}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] capitalize ${alertColor} border-current`}
                      >
                        {alert.severity}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{alert.message}</p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ── Firm Summary Cards ── */}
      {firmSummary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <ComplianceScoreCard summary={firmSummary} />
          <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
            <CardContent className="pt-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                Staff Tracked
              </p>
              <p className="text-2xl font-bold text-foreground">{firmSummary.totalStaffTracked}</p>
            </CardContent>
          </Card>
          <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
            <CardContent className="pt-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                PI Lapsed
              </p>
              <p className={`text-2xl font-bold ${firmSummary.staffWithLapsedPI > 0 ? 'text-red-400' : 'text-foreground'}`}>
                {firmSummary.staffWithLapsedPI}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
            <CardContent className="pt-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                Reg. Expiring (90d)
              </p>
              <p className={`text-2xl font-bold ${firmSummary.staffWithRegistrationExpiring90 > 0 ? 'text-amber-400' : 'text-foreground'}`}>
                {firmSummary.staffWithRegistrationExpiring90}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Staff Compliance List ── */}
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Staff Compliance Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" role="table" aria-label="Staff compliance status">
              <thead>
                <tr className="border-b border-surface-700/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-3 pr-4">Staff Member</th>
                  <th className="py-3 pr-4">Registration</th>
                  <th className="py-3 pr-4">Category</th>
                  <th className="py-3 pr-4">PI Status</th>
                  <th className="py-3">Registration Status</th>
                </tr>
              </thead>
              <tbody>
                {staffStatuses.map((status: ComplianceStatusResult) => (
                  <tr
                    key={status.staffId}
                    className="border-b border-surface-700/30 hover:bg-surface-700/20 transition-colors"
                  >
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">
                          {status.staffDisplayName}
                        </span>
                        {status.isFullyCompliant ? (
                          <CheckCircle2 className="h-4 w-4 text-green-400" aria-label="Fully compliant" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-amber-400" aria-label="Not fully compliant" />
                        )}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <span>{status.registrationBody}</span>
                        <span className="text-xs text-surface-500">
                          #{status.registrationNumber}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground text-xs">
                      {status.registrationCategory}
                    </td>
                    <td className="py-3 pr-4">
                      <PIStatusBadge
                        status={status.piStatus}
                        daysRemaining={status.piDaysRemaining}
                      />
                    </td>
                    <td className="py-3">
                      <RegistrationStatusBadge
                        status={status.registrationStatus}
                        daysRemaining={status.registrationDaysRemaining}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
