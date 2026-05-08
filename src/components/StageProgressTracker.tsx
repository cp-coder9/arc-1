import React from 'react';
import { CheckCircle2, Circle, Clock3 } from 'lucide-react';
import { PROJECT_STAGE_LABELS, PROJECT_STAGE_ORDER, ProjectStage, StageHistoryEntry } from '../types';
import { cn } from '@/lib/utils';

interface StageProgressTrackerProps {
  currentStage: ProjectStage;
  stageHistory?: StageHistoryEntry[];
  className?: string;
}

export default function StageProgressTracker({ currentStage, stageHistory = [], className }: StageProgressTrackerProps) {
  const currentIndex = PROJECT_STAGE_ORDER.indexOf(currentStage);

  return (
    <section className={cn('rounded-[2rem] border border-primary/10 bg-white/90 p-5 shadow-sm', className)} aria-label="Project lifecycle progress">
      <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">Project Lifecycle</p>
          <h3 className="font-heading text-xl font-black tracking-tight text-foreground">{PROJECT_STAGE_LABELS[currentStage]}</h3>
        </div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Stage {Math.max(currentIndex + 1, 1)} of {PROJECT_STAGE_ORDER.length}
        </p>
      </div>

      <ol className="grid grid-cols-1 gap-3 md:grid-cols-9 md:gap-2">
        {PROJECT_STAGE_ORDER.map((stage, index) => {
          const isComplete = index < currentIndex;
          const isCurrent = index === currentIndex;
          const historyEntry = stageHistory.find(entry => entry.stage === stage);

          return (
            <li key={stage} className="relative">
              {index > 0 && (
                <span
                  className={cn(
                    'absolute left-5 top-[-0.875rem] h-3 w-px bg-border md:left-[-0.5rem] md:top-5 md:h-px md:w-4',
                    index <= currentIndex && 'bg-primary/50'
                  )}
                  aria-hidden="true"
                />
              )}
              <div
                className={cn(
                  'flex h-full items-center gap-3 rounded-2xl border p-3 transition-colors md:flex-col md:items-start md:gap-2',
                  isComplete && 'border-primary/20 bg-primary/5 text-primary',
                  isCurrent && 'border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/20',
                  !isComplete && !isCurrent && 'border-border bg-secondary/20 text-muted-foreground'
                )}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-white',
                    isComplete && 'border-primary text-primary',
                    isCurrent && 'border-primary-foreground/40 bg-primary-foreground/15 text-primary-foreground',
                    !isComplete && !isCurrent && 'border-border text-muted-foreground'
                  )}
                >
                  {isComplete ? <CheckCircle2 size={18} /> : isCurrent ? <Clock3 size={18} /> : <Circle size={18} />}
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-70">{String(index + 1).padStart(2, '0')}</p>
                  <p className="text-xs font-black leading-tight md:text-[11px]">{PROJECT_STAGE_LABELS[stage]}</p>
                  {historyEntry?.enteredAt && (
                    <p className={cn('mt-1 text-[10px]', isCurrent ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                      {new Date(historyEntry.enteredAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

