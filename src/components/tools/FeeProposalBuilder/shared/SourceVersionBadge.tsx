import { ShieldCheck, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SourceVersion } from '@/services/professionalFee/types';

/**
 * SourceVersionBadge — Shows source version info.
 * When isDemoSeed is true, displays a prominent amber badge: "Demo data — not verified against official sources".
 * When verified, shows a green "Verified" badge with gazette reference.
 *
 * Requirements: 5.4, 13.2
 */
export interface SourceVersionBadgeProps {
  sourceVersion: SourceVersion | null;
  isDemoSeed: boolean;
  className?: string;
}

export function SourceVersionBadge({ sourceVersion, isDemoSeed, className }: SourceVersionBadgeProps) {
  if (!sourceVersion) {
    return null;
  }

  if (isDemoSeed) {
    return (
      <div
        role="status"
        aria-label="Demo data warning"
        className={cn(
          'inline-flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-300',
          className
        )}
      >
        <AlertTriangle className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
        <span>Demo data — not verified against official sources</span>
      </div>
    );
  }

  if (sourceVersion.status === 'verified') {
    return (
      <Badge
        className={cn(
          'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/20',
          className
        )}
      >
        <ShieldCheck className="mr-1.5 h-3 w-3" aria-hidden="true" />
        Verified
        {sourceVersion.note && (
          <span className="ml-1.5 text-emerald-400/70">— {sourceVersion.note}</span>
        )}
      </Badge>
    );
  }

  // Draft or retired status
  return (
    <Badge
      variant="secondary"
      className={cn('text-surface-400', className)}
    >
      {sourceVersion.status === 'draft' ? 'Draft' : 'Retired'} — {sourceVersion.title}
    </Badge>
  );
}
