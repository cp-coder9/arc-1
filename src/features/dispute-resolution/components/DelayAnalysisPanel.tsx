/**
 * Delay Analysis Panel
 *
 * Delay events list with dates, type, responsible party, working days.
 * Net claimable delay display with breakdown by responsible party.
 *
 * Requirements: 9.4
 */

import React from 'react';
import { Clock, Users } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell, TableFooter } from '@/components/ui/table';
import type { DelayAnalysis, DelayType, ResponsibleParty } from '../types';

export interface DelayAnalysisPanelProps {
  analysis: DelayAnalysis;
}

const DELAY_TYPE_LABELS: Record<DelayType, string> = {
  critical_path: 'Critical Path',
  concurrent: 'Concurrent',
};

const PARTY_LABELS: Record<ResponsibleParty, string> = {
  employer: 'Employer',
  contractor: 'Contractor',
  neutral: 'Neutral',
  shared: 'Shared',
};

const PARTY_STYLES: Record<ResponsibleParty, string> = {
  employer: 'bg-red-950/40 text-red-300 border-red-700/50',
  contractor: 'bg-blue-950/40 text-blue-300 border-blue-700/50',
  neutral: 'bg-slate-800/40 text-slate-300 border-slate-600/50',
  shared: 'bg-amber-950/40 text-amber-300 border-amber-700/50',
};

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export function DelayAnalysisPanel({ analysis }: DelayAnalysisPanelProps) {
  return (
    <div className="space-y-4">
      {/* Net claimable delay summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card size="sm" className="bg-slate-800/60 border-slate-700/50">
          <CardContent className="pt-3">
            <p className="text-xs uppercase tracking-wider text-slate-400">Net Claimable Delay</p>
            <p className="text-2xl font-bold text-slate-100">{analysis.netClaimableDelay} WD</p>
          </CardContent>
        </Card>
        <Card size="sm" className="bg-slate-800/60 border-slate-700/50">
          <CardContent className="pt-3">
            <p className="text-xs uppercase tracking-wider text-slate-400">Delay Events</p>
            <p className="text-2xl font-bold text-slate-100">{analysis.events.length}</p>
          </CardContent>
        </Card>
        <Card size="sm" className="bg-slate-800/60 border-slate-700/50">
          <CardContent className="pt-3">
            <p className="text-xs uppercase tracking-wider text-slate-400">Status</p>
            <Badge className={analysis.isCompleted
              ? 'bg-green-950/40 text-green-300 border-green-700/50'
              : 'bg-amber-950/40 text-amber-300 border-amber-700/50'
            }>
              {analysis.isCompleted ? 'Completed' : 'In Progress'}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown by responsible party */}
      <Card className="bg-slate-800/60 border-slate-700/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-400" aria-hidden="true" />
            <CardTitle className="text-sm text-slate-200">Delay by Responsible Party</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(Object.entries(analysis.totalByParty) as [ResponsibleParty, number][]).map(
              ([party, days]) => (
                <div key={party} className="text-center">
                  <p className="text-xs uppercase tracking-wider text-slate-400">{PARTY_LABELS[party]}</p>
                  <p className="text-lg font-bold text-slate-100">{days} WD</p>
                </div>
              )
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delay events table */}
      <Card className="bg-slate-800/60 border-slate-700/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-400" aria-hidden="true" />
            <CardTitle className="text-sm text-slate-200">Delay Events</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {analysis.events.length === 0 ? (
            <p className="text-sm text-slate-500">No delay events recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700/50">
                  <TableHead className="text-slate-400">Description</TableHead>
                  <TableHead className="text-slate-400">Start</TableHead>
                  <TableHead className="text-slate-400">End</TableHead>
                  <TableHead className="text-slate-400">Type</TableHead>
                  <TableHead className="text-slate-400">Responsible</TableHead>
                  <TableHead className="text-slate-400 text-right">Working Days</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analysis.events.map((event) => (
                  <TableRow key={event.id} className="border-slate-700/50">
                    <TableCell className="text-slate-300 text-xs max-w-[180px] truncate">
                      {event.description}
                    </TableCell>
                    <TableCell className="text-slate-300 text-xs">{formatDate(event.startDate)}</TableCell>
                    <TableCell className="text-slate-300 text-xs">{formatDate(event.endDate)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] text-slate-300">
                        {DELAY_TYPE_LABELS[event.delayType]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${PARTY_STYLES[event.responsibleParty]}`}>
                        {PARTY_LABELS[event.responsibleParty]}
                      </span>
                    </TableCell>
                    <TableCell className="text-slate-100 text-xs font-medium text-right">
                      {event.workingDaysImpacted}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="border-slate-700/50">
                  <TableCell colSpan={5} className="text-sm font-semibold text-slate-200 text-right">
                    Net Claimable
                  </TableCell>
                  <TableCell className="text-sm font-bold text-slate-100 text-right">
                    {analysis.netClaimableDelay} WD
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
