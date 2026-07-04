import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * DemoDataNotice — Renders a visible banner indicating that the displayed data
 * is placeholder/demonstration content and will be replaced by live Firestore
 * persistence in production deployment.
 *
 * Must be shown on all views that render MOCK_ data arrays.
 */
export interface DemoDataNoticeProps {
  className?: string;
}

export function DemoDataNotice({ className }: DemoDataNoticeProps) {
  return (
    <div
      role="status"
      aria-label="Demo data notice"
      className={cn(
        'flex items-center gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-300',
        className
      )}
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
      <span>
        <strong className="font-semibold">Demo mode:</strong> Data shown below is placeholder content for development preview.
        Live data will be loaded from Firestore when persistence is connected.
      </span>
    </div>
  );
}
