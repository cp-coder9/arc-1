/**
 * Adjudication Workflow View
 *
 * Adjudication stage timeline, submission management, and decision recording form.
 * Shows adjudication lifecycle from referral through to decision implementation.
 *
 * Requirements: 8.8
 */

import React, { useState } from 'react';
import { Gavel, ArrowRight, FileText, Calendar } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import type { Adjudication, AdjudicationStage, FormalClaim } from '../types';

export interface AdjudicationWorkflowViewProps {
  adjudications: Adjudication[];
  claims: FormalClaim[];
  onStageTransition?: (adjudicationId: string, targetStage: string) => void;
}

const ADJUDICATION_STAGE_LABELS: Record<AdjudicationStage, string> = {
  referred: 'Referred',
  adjudicator_appointed: 'Adjudicator Appointed',
  submissions_open: 'Submissions Open',
  submissions_closed: 'Submissions Closed',
  hearing_scheduled: 'Hearing Scheduled',
  hearing_completed: 'Hearing Completed',
  decision_issued: 'Decision Issued',
  decision_implemented: 'Decision Implemented',
};

const STAGE_ORDER: AdjudicationStage[] = [
  'referred',
  'adjudicator_appointed',
  'submissions_open',
  'submissions_closed',
  'hearing_scheduled',
  'hearing_completed',
  'decision_issued',
  'decision_implemented',
];

const STAGE_STYLES: Record<AdjudicationStage, string> = {
  referred: 'bg-blue-950/40 text-blue-300 border-blue-700/50',
  adjudicator_appointed: 'bg-indigo-950/40 text-indigo-300 border-indigo-700/50',
  submissions_open: 'bg-amber-950/40 text-amber-300 border-amber-700/50',
  submissions_closed: 'bg-purple-950/40 text-purple-300 border-purple-700/50',
  hearing_scheduled: 'bg-orange-950/40 text-orange-300 border-orange-700/50',
  hearing_completed: 'bg-cyan-950/40 text-cyan-300 border-cyan-700/50',
  decision_issued: 'bg-emerald-950/40 text-emerald-300 border-emerald-700/50',
  decision_implemented: 'bg-green-950/40 text-green-300 border-green-700/50',
};

function formatCurrency(amount: number | undefined): string {
  if (amount === undefined || amount === null) return '—';
  return `R ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export function AdjudicationWorkflowView({
  adjudications,
  claims,
  onStageTransition,
}: AdjudicationWorkflowViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedAdj = adjudications.find((a) => a.id === selectedId);

  return (
    <div className="space-y-6 pt-4">
      {/* Adjudications list */}
      <Card className="bg-slate-800/60 border-slate-700/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Gavel className="h-4 w-4 text-blue-400" aria-hidden="true" />
            <CardTitle className="text-sm text-slate-200">
              Adjudication Proceedings ({adjudications.length})
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {adjudications.length === 0 ? (
            <p className="text-sm text-slate-500">No adjudication proceedings.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700/50">
                  <TableHead className="text-slate-400">Claim</TableHead>
                  <TableHead className="text-slate-400">Adjudicator</TableHead>
                  <TableHead className="text-slate-400">Dispute Value</TableHead>
                  <TableHead className="text-slate-400">Stage</TableHead>
                  <TableHead className="text-slate-400">Appointment Date</TableHead>
                  <TableHead className="text-slate-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adjudications.map((adj) => {
                  const claim = claims.find((c) => c.id === adj.claimId);
                  return (
                    <TableRow key={adj.id} className="border-slate-700/50">
                      <TableCell className="text-slate-200 text-xs font-mono">
                        {claim?.referenceNumber ?? adj.claimId}
                      </TableCell>
                      <TableCell className="text-slate-300 text-xs">{adj.adjudicatorName}</TableCell>
                      <TableCell className="text-slate-200 text-xs">
                        {formatCurrency(adj.disputeValue)}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STAGE_STYLES[adj.currentStage]}`}>
                          {ADJUDICATION_STAGE_LABELS[adj.currentStage]}
                        </span>
                      </TableCell>
                      <TableCell className="text-slate-300 text-xs">
                        {formatDate(adj.appointmentDate)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedId(adj.id)}
                          className="text-blue-400 hover:text-blue-300 text-xs"
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Selected adjudication detail */}
      {selectedAdj && (
        <>
          {/* Stage timeline */}
          <Card className="bg-slate-800/60 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-sm text-slate-200">
                Adjudication Timeline — {selectedAdj.adjudicatorName}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1 overflow-x-auto pb-2">
                {STAGE_ORDER.map((stage, index) => {
                  const currentIndex = STAGE_ORDER.indexOf(selectedAdj.currentStage);
                  const isCompleted = index < currentIndex;
                  const isCurrent = index === currentIndex;
                  return (
                    <React.Fragment key={stage}>
                      <div
                        className={`flex items-center justify-center rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-wider whitespace-nowrap border ${
                          isCurrent
                            ? STAGE_STYLES[stage]
                            : isCompleted
                            ? 'bg-green-950/40 text-green-400 border-green-700/50'
                            : 'bg-slate-800/40 text-slate-500 border-slate-700/50'
                        }`}
                      >
                        {ADJUDICATION_STAGE_LABELS[stage]}
                      </div>
                      {index < STAGE_ORDER.length - 1 && (
                        <ArrowRight className="h-3 w-3 shrink-0 text-slate-600" aria-hidden="true" />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Adjudication details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-slate-800/60 border-slate-700/50">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-400" aria-hidden="true" />
                  <CardTitle className="text-sm text-slate-200">Submission Details</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-slate-400">Referring Party</dt>
                    <dd className="text-slate-200">{selectedAdj.referringParty}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-slate-400">Respondent Party</dt>
                    <dd className="text-slate-200">{selectedAdj.respondentParty}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-slate-400">Referral Notice Ref</dt>
                    <dd className="text-slate-200 font-mono text-xs">{selectedAdj.referralNoticeRef}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-slate-400">Max Submission Rounds</dt>
                    <dd className="text-slate-200">{selectedAdj.maxSubmissionRounds}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-slate-400">Submission Deadline</dt>
                    <dd className="text-slate-200">{formatDate(selectedAdj.submissionDeadline)}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/60 border-slate-700/50">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-blue-400" aria-hidden="true" />
                  <CardTitle className="text-sm text-slate-200">Decision</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-slate-400">Dispute Value</dt>
                    <dd className="text-slate-200">{formatCurrency(selectedAdj.disputeValue)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-slate-400">Time in Dispute</dt>
                    <dd className="text-slate-200">{selectedAdj.timeInDispute ? `${selectedAdj.timeInDispute} WD` : '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-slate-400">Decision Date</dt>
                    <dd className="text-slate-200">{formatDate(selectedAdj.decisionDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-slate-400">Amount Awarded</dt>
                    <dd className="text-green-300">{formatCurrency(selectedAdj.amountAwarded)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-slate-400">Time Awarded</dt>
                    <dd className="text-green-300">{selectedAdj.timeAwarded ? `${selectedAdj.timeAwarded} WD` : '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-slate-400">Binding</dt>
                    <dd>
                      <Badge variant="outline" className={`text-[10px] ${selectedAdj.isInterimBinding ? 'text-amber-300 border-amber-700/50' : 'text-green-300 border-green-700/50'}`}>
                        {selectedAdj.isInterimBinding ? 'Interim Binding' : 'Final'}
                      </Badge>
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>

          {/* Decision summary */}
          {selectedAdj.decisionSummary && (
            <Card className="bg-slate-800/60 border-slate-700/50">
              <CardHeader>
                <CardTitle className="text-sm text-slate-200">Decision Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-300 whitespace-pre-wrap">{selectedAdj.decisionSummary}</p>
              </CardContent>
            </Card>
          )}

          {/* Stage transition actions */}
          {onStageTransition && (
            <Card className="bg-slate-800/60 border-slate-700/50">
              <CardHeader>
                <CardTitle className="text-sm text-slate-200">Advance Stage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const currentIndex = STAGE_ORDER.indexOf(selectedAdj.currentStage);
                    const nextStages = STAGE_ORDER.slice(currentIndex + 1, currentIndex + 2);
                    return nextStages.map((stage) => (
                      <Button
                        key={stage}
                        variant="outline"
                        size="sm"
                        onClick={() => onStageTransition(selectedAdj.id, stage)}
                        className="border-slate-600 text-slate-200 hover:bg-slate-700/50"
                      >
                        <ArrowRight className="h-3 w-3 mr-1" aria-hidden="true" />
                        {ADJUDICATION_STAGE_LABELS[stage]}
                      </Button>
                    ));
                  })()}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
