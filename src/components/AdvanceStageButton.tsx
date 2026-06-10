import React, { useState } from 'react';
import { AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { PROJECT_STAGE_LABELS, PROJECT_STAGE_ORDER, Project } from '../types';
import { evaluateStageGateTransition, transitionStage } from '../services/projectLifecycleService';
import { cn } from '@/lib/utils';

interface AdvanceStageButtonProps {
  project: Project;
  actorId: string;
  className?: string;
  variant?: React.ComponentProps<typeof Button>['variant'];
  size?: React.ComponentProps<typeof Button>['size'];
  /** Optional risk level to display on the button */
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  /** Optional blocker count for the next phase */
  blockerCount?: number;
}

const RISK_DOT_COLORS: Record<string, string> = {
  low: 'bg-amber-400',
  medium: 'bg-orange-500',
  high: 'bg-red-500',
  critical: 'bg-red-700',
};

const RISK_BADGE_COLORS: Record<string, string> = {
  low: 'bg-amber-100 text-amber-700 border-amber-300',
  medium: 'bg-orange-100 text-orange-700 border-orange-300',
  high: 'bg-red-100 text-red-700 border-red-300',
  critical: 'bg-red-200 text-red-800 border-red-500',
};

export default function AdvanceStageButton({
  project,
  actorId,
  className,
  variant,
  size,
  riskLevel,
  blockerCount,
}: AdvanceStageButtonProps) {
  const [isAdvancing, setIsAdvancing] = useState(false);
  const currentIndex = PROJECT_STAGE_ORDER.indexOf(project.currentStage);
  const nextStage = currentIndex >= 0 ? PROJECT_STAGE_ORDER[currentIndex + 1] : undefined;
  const gateEvaluation = nextStage
    ? evaluateStageGateTransition(project.currentStage, nextStage, project.stageGateEvidence || {})
    : undefined;
  const missingGateSummary = gateEvaluation?.missingRequirements
    .map(requirement => `• ${requirement.label}: ${requirement.reason}`)
    .join('\n');
  const hasBlockers = (blockerCount ?? 0) > 0;

  if (!nextStage) return null;

  const handleAdvance = async () => {
    if (gateEvaluation && !gateEvaluation.transitionAllowed) {
      const message = gateEvaluation.missingRequirements.length > 0
        ? `This project cannot advance to ${PROJECT_STAGE_LABELS[nextStage]} yet. Missing stage-gate evidence:\n${missingGateSummary}`
        : `This project cannot advance from ${PROJECT_STAGE_LABELS[project.currentStage]} to ${PROJECT_STAGE_LABELS[nextStage]}.`;
      toast.error(message);
      window.alert(message);
      return;
    }

    const confirmed = window.confirm(
      `Advance this project from ${PROJECT_STAGE_LABELS[project.currentStage]} to ${PROJECT_STAGE_LABELS[nextStage]}?`
    );
    if (!confirmed) return;

    setIsAdvancing(true);
    try {
      await transitionStage(
        project.id,
        nextStage,
        actorId,
        `Stage advanced to ${PROJECT_STAGE_LABELS[nextStage]}`
      );
      toast.success(`Project advanced to ${PROJECT_STAGE_LABELS[nextStage]}`);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to advance project stage. Check permissions and try again.');
    } finally {
      setIsAdvancing(false);
    }
  };

  const gateBlocked = gateEvaluation && !gateEvaluation.transitionAllowed;
  const missingCount = gateEvaluation?.missingRequirements.length ?? 0;

  return (
    <div className="inline-flex items-center gap-2">
      <Button
        type="button"
        onClick={handleAdvance}
        disabled={isAdvancing}
        title={missingGateSummary || undefined}
        className={className || cn('rounded-full font-bold gap-2', gateBlocked && 'opacity-70')}
        variant={variant}
        size={size}
        aria-label={`Advance project to ${PROJECT_STAGE_LABELS[nextStage]}`}
      >
        {isAdvancing ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}
        Advance to {PROJECT_STAGE_LABELS[nextStage]}
      </Button>
      {riskLevel && riskLevel !== 'low' && (
        <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-widest', RISK_BADGE_COLORS[riskLevel])} title={`Project risk level: ${riskLevel}`}>
          <span className={cn('h-2 w-2 rounded-full', RISK_DOT_COLORS[riskLevel])} />
          {riskLevel}
        </span>
      )}
      {hasBlockers && (
        <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-widest', RISK_BADGE_COLORS[riskLevel ?? 'medium'])} title={`${blockerCount} blocker(s) in the next phase`}>
          <AlertTriangle size={10} />
          {blockerCount} {blockerCount === 1 ? 'blocker' : 'blockers'}
        </span>
      )}
      {gateBlocked && missingCount > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-red-700" title={`${missingCount} missing stage-gate requirement(s)`}>
          <AlertTriangle size={10} />
          {missingCount} missing
        </span>
      )}
    </div>
  );
}
