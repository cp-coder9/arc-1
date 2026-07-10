/**
 * SG Diagram Tracker
 *
 * Diagram lifecycle view showing stage progression indicator,
 * processing time vs expected comparison, queries/approval status,
 * and stage transition buttons.
 *
 * Requirements: 17.1, 17.6, 22.8
 */

import React, { useState } from 'react';
import { FileCheck, Clock, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { SGDiagram, SGDiagramStage } from '../types';

// ─── Stage Configuration ──────────────────────────────────────────────────────

const STAGE_SEQUENCE: SGDiagramStage[] = [
  'prepared',
  'checked',
  'lodged',
  'examination_in_progress',
  'queries_raised',
  'queries_resolved',
  'approved',
  'registered',
];

const STAGE_LABELS: Record<SGDiagramStage, string> = {
  prepared: 'Prepared',
  checked: 'Checked',
  lodged: 'Lodged',
  examination_in_progress: 'Examination',
  queries_raised: 'Queries Raised',
  queries_resolved: 'Queries Resolved',
  approved: 'Approved',
  registered: 'Registered',
  withdrawn: 'Withdrawn',
};

function getStageVariant(stage: SGDiagramStage, currentStage: SGDiagramStage): 'default' | 'secondary' | 'destructive' {
  const currentIdx = STAGE_SEQUENCE.indexOf(currentStage);
  const stageIdx = STAGE_SEQUENCE.indexOf(stage);

  if (stage === currentStage) return 'default';
  if (stageIdx < currentIdx) return 'secondary';
  return 'default';
}

function isStageComplete(stage: SGDiagramStage, currentStage: SGDiagramStage): boolean {
  const currentIdx = STAGE_SEQUENCE.indexOf(currentStage);
  const stageIdx = STAGE_SEQUENCE.indexOf(stage);
  return stageIdx < currentIdx;
}

// ─── Demo Data ────────────────────────────────────────────────────────────────

const DEMO_DIAGRAM: SGDiagram = {
  id: 'sgd_demo_001',
  projectId: 'proj_001',
  diagramReference: 'SG-2026/001',
  diagramType: 'general_plan',
  linkedSurveyInstructionId: 'si_001',
  propertyDescription: 'Erf 123, Sandton Extension 45',
  lodgementDate: '2026-04-01',
  lodgementOffice: 'Pretoria',
  surveyorName: 'J. van der Merwe',
  surveyorPLATO: 'PLS-98765',
  currentStage: 'examination_in_progress',
  processingDays: 45,
  expectedProcessingDays: 60,
  createdAt: '2026-04-01T08:00:00Z',
  updatedAt: '2026-05-20T14:00:00Z',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function SGDiagramTracker() {
  const [diagram, setDiagram] = useState<SGDiagram>(DEMO_DIAGRAM);

  const processingRatio = diagram.expectedProcessingDays > 0
    ? diagram.processingDays / diagram.expectedProcessingDays
    : 0;
  const isOverdue = processingRatio > 1.2;
  const isNearingDeadline = processingRatio > 0.8 && !isOverdue;

  const handleTransition = (nextStage: SGDiagramStage) => {
    setDiagram((prev) => ({
      ...prev,
      currentStage: nextStage,
      updatedAt: new Date().toISOString(),
    }));
  };

  const getNextStages = (): SGDiagramStage[] => {
    const currentIdx = STAGE_SEQUENCE.indexOf(diagram.currentStage);
    if (diagram.currentStage === 'examination_in_progress') {
      return ['queries_raised', 'approved'];
    }
    if (diagram.currentStage === 'queries_raised') {
      return ['queries_resolved'];
    }
    if (diagram.currentStage === 'queries_resolved') {
      return ['examination_in_progress'];
    }
    if (currentIdx >= 0 && currentIdx < STAGE_SEQUENCE.length - 1) {
      return [STAGE_SEQUENCE[currentIdx + 1]];
    }
    return [];
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-blue-400" aria-hidden="true" />
            <CardTitle className="text-base">SG Diagram: {diagram.diagramReference}</CardTitle>
          </div>
          <Badge variant={diagram.currentStage === 'withdrawn' ? 'destructive' : 'secondary'}>
            {STAGE_LABELS[diagram.currentStage]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Stage Indicator */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Stage Progress
            </h4>
            <div className="flex flex-wrap items-center gap-1">
              {STAGE_SEQUENCE.map((stage, idx) => {
                const isComplete = isStageComplete(stage, diagram.currentStage);
                const isCurrent = stage === diagram.currentStage;
                return (
                  <React.Fragment key={stage}>
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-wider transition-colors ${
                        isCurrent
                          ? 'bg-blue-600/30 text-blue-300 border border-blue-500/50'
                          : isComplete
                            ? 'bg-green-950/40 text-green-400 border border-green-700/40'
                            : 'bg-slate-800/40 text-slate-500 border border-slate-700/30'
                      }`}
                    >
                      {isComplete && <CheckCircle2 className="mr-1 h-3 w-3" />}
                      {STAGE_LABELS[stage]}
                    </span>
                    {idx < STAGE_SEQUENCE.length - 1 && (
                      <ArrowRight className="h-3 w-3 text-slate-600" aria-hidden="true" />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Processing Time */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Processing Time
            </h4>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-400" aria-hidden="true" />
                <span className="text-sm">
                  <span className="font-semibold text-foreground">{diagram.processingDays}</span>
                  <span className="text-muted-foreground"> / {diagram.expectedProcessingDays} working days</span>
                </span>
              </div>
              {isOverdue && (
                <span className="inline-flex items-center gap-1 text-xs text-red-400">
                  <AlertTriangle className="h-3 w-3" />
                  Overdue
                </span>
              )}
              {isNearingDeadline && (
                <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                  <Clock className="h-3 w-3" />
                  Nearing deadline
                </span>
              )}
            </div>
            {/* Progress bar */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full rounded-full transition-all ${
                  isOverdue
                    ? 'bg-red-500'
                    : isNearingDeadline
                      ? 'bg-amber-500'
                      : 'bg-blue-500'
                }`}
                style={{ width: `${Math.min(processingRatio * 100, 100)}%` }}
              />
            </div>
          </div>

          {/* Query / Approval Status */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Status Details
            </h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Office: </span>
                <span className="font-medium">{diagram.lodgementOffice}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Surveyor: </span>
                <span className="font-medium">{diagram.surveyorName}</span>
              </div>
              {diagram.queryDetails && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Query: </span>
                  <span className="font-medium text-amber-300">{diagram.queryDetails}</span>
                </div>
              )}
              {diagram.sgApprovalNumber && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Approval No: </span>
                  <span className="font-medium text-green-300">{diagram.sgApprovalNumber}</span>
                </div>
              )}
            </div>
          </div>

          {/* Stage Transition Buttons */}
          {getNextStages().length > 0 && diagram.currentStage !== 'registered' && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Actions
              </h4>
              <div className="flex flex-wrap gap-2">
                {getNextStages().map((nextStage) => (
                  <Button
                    key={nextStage}
                    variant="outline"
                    size="sm"
                    onClick={() => handleTransition(nextStage)}
                  >
                    <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
                    {STAGE_LABELS[nextStage]}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
