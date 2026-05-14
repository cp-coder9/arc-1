import React, { useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { PROJECT_STAGE_LABELS, PROJECT_STAGE_ORDER, Project } from '../types';
import { transitionStage } from '../services/projectLifecycleService';

interface AdvanceStageButtonProps {
  project: Project;
  actorId: string;
  className?: string;
  variant?: React.ComponentProps<typeof Button>['variant'];
  size?: React.ComponentProps<typeof Button>['size'];
}

export default function AdvanceStageButton({ project, actorId, className, variant, size }: AdvanceStageButtonProps) {
  const [isAdvancing, setIsAdvancing] = useState(false);
  const currentIndex = PROJECT_STAGE_ORDER.indexOf(project.currentStage);
  const nextStage = currentIndex >= 0 ? PROJECT_STAGE_ORDER[currentIndex + 1] : undefined;

  if (!nextStage) return null;

  const handleAdvance = async () => {
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

  return (
    <Button
      type="button"
      onClick={handleAdvance}
      disabled={isAdvancing}
      className={className || 'rounded-full font-bold gap-2'}
      variant={variant}
      size={size}
      aria-label={`Advance project to ${PROJECT_STAGE_LABELS[nextStage]}`}
    >
      {isAdvancing ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}
      Advance Stage
    </Button>
  );
}
