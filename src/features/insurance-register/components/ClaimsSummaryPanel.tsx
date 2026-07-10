/**
 * Insurance Register — Claims Summary Panel
 *
 * Displays cumulative claims summary data:
 * - Total claims by policy type
 * - Total estimated loss
 * - Count per status stage
 * - Total settled amount
 *
 * Requirements: 3.8
 */

import React from 'react';
import { BarChart3 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ClaimsSummary, InsurancePolicyType, ClaimNotificationStatus } from '../types';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ClaimsSummaryPanelProps {
  claimsSummary: ClaimsSummary;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const POLICY_TYPE_LABELS: Record<InsurancePolicyType, string> = {
  CAR: 'CAR',
  PI: 'PI',
  public_liability: 'Public Liability',
  SASRIA: 'SASRIA',
  LDI: 'LDI',
};

const STATUS_LABELS: Record<ClaimNotificationStatus, string> = {
  reported: 'Reported',
  notified_to_insurer: 'Notified',
  under_investigation: 'Investigating',
  claim_lodged: 'Lodged',
  settled: 'Settled',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

const STATUS_COLORS: Record<ClaimNotificationStatus, string> = {
  reported: 'bg-slate-800/60 text-slate-300 border-slate-600/50',
  notified_to_insurer: 'bg-blue-950/40 text-blue-300 border-blue-700/50',
  under_investigation: 'bg-amber-950/40 text-amber-300 border-amber-700/50',
  claim_lodged: 'bg-purple-950/40 text-purple-300 border-purple-700/50',
  settled: 'bg-green-950/40 text-green-300 border-green-700/50',
  rejected: 'bg-red-950/40 text-red-300 border-red-700/50',
  withdrawn: 'bg-slate-800/60 text-slate-400 border-slate-600/50',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ClaimsSummaryPanel({ claimsSummary }: ClaimsSummaryPanelProps) {
  const { totalByPolicyType, totalEstimatedLoss, countByStatus, totalSettledAmount } = claimsSummary;

  const totalClaims = Object.values(countByStatus).reduce((sum, count) => sum + count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4 text-blue-400" aria-hidden="true" />
          Claims Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Key Figures */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryTile label="Total Claims" value={String(totalClaims)} />
          <SummaryTile label="Estimated Loss" value={formatZAR(totalEstimatedLoss)} />
          <SummaryTile label="Settled Amount" value={formatZAR(totalSettledAmount)} />
          <SummaryTile
            label="Open Claims"
            value={String(
              totalClaims -
                (countByStatus.settled || 0) -
                (countByStatus.rejected || 0) -
                (countByStatus.withdrawn || 0)
            )}
          />
        </div>

        {/* By Policy Type */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Total by Policy Type
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(Object.entries(totalByPolicyType) as [InsurancePolicyType, number][])
              .filter(([, count]) => count > 0)
              .map(([type, count]) => (
                <div
                  key={type}
                  className="flex items-center justify-between rounded-lg border border-slate-700/50 bg-slate-800/30 px-3 py-2"
                >
                  <span className="text-xs text-slate-300">{POLICY_TYPE_LABELS[type]}</span>
                  <span className="text-sm font-semibold text-slate-100">{count}</span>
                </div>
              ))}
          </div>
        </div>

        {/* By Status */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Count by Status
          </p>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(countByStatus) as [ClaimNotificationStatus, number][])
              .filter(([, count]) => count > 0)
              .map(([status, count]) => (
                <Badge
                  key={status}
                  variant="outline"
                  className={`text-xs ${STATUS_COLORS[status]}`}
                >
                  {STATUS_LABELS[status]}: {count}
                </Badge>
              ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 px-3 py-2 text-center">
      <p className="text-lg font-bold text-slate-100">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-slate-400">{label}</p>
    </div>
  );
}

function formatZAR(amount: number): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
