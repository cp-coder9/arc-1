/**
 * Claim Detail View
 *
 * Individual claim detail with stage indicator, description, particulars,
 * response data, and transition buttons for moving between claim stages.
 *
 * Requirements: 5.3, 5.6
 */

import React from 'react';
import { ArrowRight, AlertTriangle, Clock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { FormalClaim, ClaimStage } from '../types';

export interface ClaimDetailViewProps {
  claim: FormalClaim;
  permittedTransitions: ClaimStage[];
  onTransition?: (targetStage: ClaimStage) => void;
  onBack?: () => void;
}

const STAGE_LABELS: Record<ClaimStage, string> = {
  notified: 'Notified',
  particularised: 'Particularised',
  assessed: 'Assessed',
  responded: 'Responded',
  notice_of_dissatisfaction: 'Notice of Dissatisfaction',
  referred_to_adjudication: 'Referred to Adjudication',
  adjudication_decision_issued: 'Decision Issued',
  settled: 'Settled',
};

const STAGE_ORDER: ClaimStage[] = [
  'notified',
  'particularised',
  'assessed',
  'responded',
  'notice_of_dissatisfaction',
  'referred_to_adjudication',
  'adjudication_decision_issued',
  'settled',
];

function formatCurrency(amount: number | undefined): string {
  if (amount === undefined || amount === null) return '—';
  return `R ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ClaimDetailView({
  claim,
  permittedTransitions,
  onTransition,
  onBack,
}: ClaimDetailViewProps) {
  const currentStageIndex = STAGE_ORDER.indexOf(claim.currentStage);

  return (
    <div className="space-y-6">
      {/* Back button */}
      {onBack && (
        <Button variant="ghost" size="sm" onClick={onBack} className="text-slate-400 hover:text-slate-200">
          ← Back to Claims
        </Button>
      )}

      {/* Claim header */}
      <Card className="bg-slate-800/60 border-slate-700/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg text-slate-100">
                {claim.referenceNumber}
              </CardTitle>
              <p className="text-sm text-slate-400 mt-1">{claim.briefDescription}</p>
            </div>
            {claim.timeBarredRisk && (
              <Badge className="bg-red-950/40 text-red-300 border-red-700/50">
                <AlertTriangle className="h-3 w-3 mr-1" aria-hidden="true" />
                Time-barred Risk
              </Badge>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Stage progress indicator */}
      <Card className="bg-slate-800/60 border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-sm text-slate-200">Claim Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {STAGE_ORDER.map((stage, index) => {
              const isCompleted = index < currentStageIndex;
              const isCurrent = index === currentStageIndex;
              return (
                <React.Fragment key={stage}>
                  <div
                    className={`flex items-center justify-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap border ${
                      isCurrent
                        ? 'bg-blue-950/60 text-blue-300 border-blue-500'
                        : isCompleted
                        ? 'bg-green-950/40 text-green-400 border-green-700/50'
                        : 'bg-slate-800/40 text-slate-500 border-slate-700/50'
                    }`}
                  >
                    {STAGE_LABELS[stage]}
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

      {/* Claim details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-slate-800/60 border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-sm text-slate-200">Claim Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-400">Type</dt>
                <dd className="text-slate-200">{claim.claimType.replace(/_/g, ' ')}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-400">Clause</dt>
                <dd className="text-slate-200">{claim.contractClauseNumber} — {claim.contractClauseTitle}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-400">Causative Event</dt>
                <dd className="text-slate-200">{claim.causativeEventDate}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-400">Notification Date</dt>
                <dd className="text-slate-200">{claim.notificationDate}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/60 border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-sm text-slate-200">Financial Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-400">Amount Claimed</dt>
                <dd className="text-slate-200">{formatCurrency(claim.amountClaimed)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-400">Amount Awarded</dt>
                <dd className="text-green-300">{formatCurrency(claim.awardedAmount)}</dd>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-slate-400" aria-hidden="true" />
                <dt className="text-xs uppercase tracking-wider text-slate-400">Time Claimed</dt>
              </div>
              <dd className="text-slate-200">{claim.timeClaimed ? `${claim.timeClaimed} Working Days` : '—'}</dd>
              <div>
                <dt className="text-xs uppercase tracking-wider text-slate-400">Time Awarded</dt>
                <dd className="text-green-300">{claim.awardedTime ? `${claim.awardedTime} Working Days` : '—'}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Particulars */}
      {claim.detailedParticulars && (
        <Card className="bg-slate-800/60 border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-sm text-slate-200">Detailed Particulars</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-300 whitespace-pre-wrap">{claim.detailedParticulars}</p>
          </CardContent>
        </Card>
      )}

      {/* Response sub-state */}
      {claim.responseSubState && (
        <Card className="bg-slate-800/60 border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-sm text-slate-200">Response</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge
              className={
                claim.responseSubState === 'accepted'
                  ? 'bg-green-950/40 text-green-300 border-green-700/50'
                  : claim.responseSubState === 'partially_accepted'
                  ? 'bg-amber-950/40 text-amber-300 border-amber-700/50'
                  : 'bg-red-950/40 text-red-300 border-red-700/50'
              }
            >
              {claim.responseSubState.replace(/_/g, ' ')}
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* Transition actions */}
      {permittedTransitions.length > 0 && (
        <Card className="bg-slate-800/60 border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-sm text-slate-200">Available Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {permittedTransitions.map((targetStage) => (
                <Button
                  key={targetStage}
                  variant="outline"
                  size="sm"
                  onClick={() => onTransition?.(targetStage)}
                  className="border-slate-600 text-slate-200 hover:bg-slate-700/50"
                >
                  <ArrowRight className="h-3 w-3 mr-1" aria-hidden="true" />
                  {STAGE_LABELS[targetStage]}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
