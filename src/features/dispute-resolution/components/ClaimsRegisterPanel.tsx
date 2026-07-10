/**
 * Claims Register Panel
 *
 * Dashboard showing total claims by type, total amount/time claimed/awarded,
 * claims per stage. Uses Card + Badge for status display.
 *
 * Requirements: 5.3
 */

import React from 'react';
import { FileText } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import type { FormalClaim, ClaimType, ClaimStage } from '../types';

export interface ClaimsRegisterPanelProps {
  claims: FormalClaim[];
  onClaimSelect?: (claimId: string) => void;
}

const CLAIM_TYPE_LABELS: Record<ClaimType, string> = {
  EoT: 'Extension of Time',
  loss_and_expense: 'Loss & Expense',
  disruption: 'Disruption',
  prolongation: 'Prolongation',
};

const STAGE_LABELS: Record<ClaimStage, string> = {
  notified: 'Notified',
  particularised: 'Particularised',
  assessed: 'Assessed',
  responded: 'Responded',
  notice_of_dissatisfaction: 'Dissatisfaction',
  referred_to_adjudication: 'Adjudication',
  adjudication_decision_issued: 'Decision Issued',
  settled: 'Settled',
};

const STAGE_VARIANT: Record<ClaimStage, string> = {
  notified: 'bg-blue-950/40 text-blue-300 border-blue-700/50',
  particularised: 'bg-indigo-950/40 text-indigo-300 border-indigo-700/50',
  assessed: 'bg-amber-950/40 text-amber-300 border-amber-700/50',
  responded: 'bg-purple-950/40 text-purple-300 border-purple-700/50',
  notice_of_dissatisfaction: 'bg-orange-950/40 text-orange-300 border-orange-700/50',
  referred_to_adjudication: 'bg-red-950/40 text-red-300 border-red-700/50',
  adjudication_decision_issued: 'bg-emerald-950/40 text-emerald-300 border-emerald-700/50',
  settled: 'bg-green-950/40 text-green-300 border-green-700/50',
};

function formatCurrency(amount: number | undefined): string {
  if (amount === undefined || amount === null) return '—';
  return `R ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ClaimsRegisterPanel({ claims, onClaimSelect }: ClaimsRegisterPanelProps) {
  // Aggregate stats
  const totalClaimed = claims.reduce((sum, c) => sum + (c.amountClaimed ?? 0), 0);
  const totalAwarded = claims.reduce((sum, c) => sum + (c.awardedAmount ?? 0), 0);
  const totalTimeClaimed = claims.reduce((sum, c) => sum + (c.timeClaimed ?? 0), 0);
  const totalTimeAwarded = claims.reduce((sum, c) => sum + (c.awardedTime ?? 0), 0);

  // Claims by type
  const byType = claims.reduce<Record<string, number>>((acc, c) => {
    acc[c.claimType] = (acc[c.claimType] || 0) + 1;
    return acc;
  }, {});

  // Claims by stage
  const byStage = claims.reduce<Record<string, number>>((acc, c) => {
    acc[c.currentStage] = (acc[c.currentStage] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6 pt-4">
      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card size="sm" className="bg-slate-800/60 border-slate-700/50">
          <CardContent className="pt-3">
            <p className="text-xs uppercase tracking-wider text-slate-400">Total Claims</p>
            <p className="text-2xl font-bold text-slate-100">{claims.length}</p>
          </CardContent>
        </Card>
        <Card size="sm" className="bg-slate-800/60 border-slate-700/50">
          <CardContent className="pt-3">
            <p className="text-xs uppercase tracking-wider text-slate-400">Amount Claimed</p>
            <p className="text-lg font-bold text-slate-100">{formatCurrency(totalClaimed)}</p>
            <p className="text-xs text-slate-500">Awarded: {formatCurrency(totalAwarded)}</p>
          </CardContent>
        </Card>
        <Card size="sm" className="bg-slate-800/60 border-slate-700/50">
          <CardContent className="pt-3">
            <p className="text-xs uppercase tracking-wider text-slate-400">Time Claimed</p>
            <p className="text-lg font-bold text-slate-100">{totalTimeClaimed} WD</p>
            <p className="text-xs text-slate-500">Awarded: {totalTimeAwarded} WD</p>
          </CardContent>
        </Card>
        <Card size="sm" className="bg-slate-800/60 border-slate-700/50">
          <CardContent className="pt-3">
            <p className="text-xs uppercase tracking-wider text-slate-400">By Type</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {Object.entries(byType).map(([type, count]) => (
                <Badge key={type} variant="outline" className="text-[10px] text-slate-300">
                  {CLAIM_TYPE_LABELS[type as ClaimType]}: {count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Claims by stage breakdown */}
      <Card size="sm" className="bg-slate-800/60 border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-sm text-slate-200">Claims by Stage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.entries(byStage).map(([stage, count]) => (
              <span
                key={stage}
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STAGE_VARIANT[stage as ClaimStage]}`}
              >
                {STAGE_LABELS[stage as ClaimStage]}: {count}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Claims list table */}
      <Card size="sm" className="bg-slate-800/60 border-slate-700/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-400" aria-hidden="true" />
            <CardTitle className="text-sm text-slate-200">Claims Register</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {claims.length === 0 ? (
            <p className="text-sm text-slate-500">No claims registered.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700/50">
                  <TableHead className="text-slate-400">Reference</TableHead>
                  <TableHead className="text-slate-400">Type</TableHead>
                  <TableHead className="text-slate-400">Description</TableHead>
                  <TableHead className="text-slate-400">Amount</TableHead>
                  <TableHead className="text-slate-400">Time</TableHead>
                  <TableHead className="text-slate-400">Stage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.map((claim) => (
                  <TableRow
                    key={claim.id}
                    className="border-slate-700/50 cursor-pointer hover:bg-slate-700/30"
                    onClick={() => onClaimSelect?.(claim.id)}
                  >
                    <TableCell className="text-slate-200 font-mono text-xs">
                      {claim.referenceNumber}
                    </TableCell>
                    <TableCell className="text-slate-300 text-xs">
                      {CLAIM_TYPE_LABELS[claim.claimType]}
                    </TableCell>
                    <TableCell className="text-slate-300 text-xs max-w-[200px] truncate">
                      {claim.briefDescription}
                    </TableCell>
                    <TableCell className="text-slate-200 text-xs">
                      {formatCurrency(claim.amountClaimed)}
                    </TableCell>
                    <TableCell className="text-slate-200 text-xs">
                      {claim.timeClaimed ? `${claim.timeClaimed} WD` : '—'}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STAGE_VARIANT[claim.currentStage]}`}
                      >
                        {STAGE_LABELS[claim.currentStage]}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
