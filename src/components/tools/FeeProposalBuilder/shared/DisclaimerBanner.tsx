import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * DisclaimerBanner — Persistent "This is a guideline calculator, not legal fee advice" banner.
 * Shown in every profession workspace with yellow/amber warning styling.
 *
 * Requirements: 13.1
 */
export interface DisclaimerBannerProps {
  className?: string;
}

export function DisclaimerBanner({ className }: DisclaimerBannerProps) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 backdrop-blur',
        className
      )}
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
      <p className="font-medium">
        This is a guideline calculator, not legal fee advice. Fees shown are indicative and based on
        published council body tariffs. Always verify against current gazetted schedules.
      </p>
    </div>
  );
}
