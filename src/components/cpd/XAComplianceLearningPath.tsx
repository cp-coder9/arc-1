import React, { useEffect, useState } from 'react';
import { BookOpen, CheckCircle, Loader2 } from 'lucide-react';
import { DashboardSection } from '@/components/composite/DashboardSection';
import { getXACompletionStatus } from '@/services/xaCompletionSyncService';
import type { XACompletionStatus } from '@/services/xaCompletionSyncService';

/**
 * XAComplianceLearningPath — Displays the XA Compliance Learning Path
 * section within the XA Compliance Hub.
 *
 * Shows progress toward completing the 3 required XA-tagged CPD modules,
 * displays a message depending on completion status, and lists completed
 * module IDs when available.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */

interface XAComplianceLearningPathProps {
  userId: string;
}

type LoadState = 'loading' | 'ready' | 'error';

export default function XAComplianceLearningPath({ userId }: XAComplianceLearningPathProps) {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [status, setStatus] = useState<XACompletionStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      setLoadState('loading');
      try {
        const result = await getXACompletionStatus(userId);
        if (!cancelled) {
          setStatus(result);
          setLoadState('ready');
        }
      } catch (err) {
        console.error('[XA Learning Path] Failed to load status:', err);
        if (!cancelled) {
          setLoadState('error');
        }
      }
    }

    fetchStatus();
    return () => { cancelled = true; };
  }, [userId]);

  const completedCount = status?.completedModules?.length ?? 0;
  const totalRequired = status?.totalRequired ?? 3;
  const educationComplete = completedCount >= totalRequired;
  const progressPercent = Math.min((completedCount / totalRequired) * 100, 100);

  return (
    <DashboardSection
      title="Compliance Learning Path"
      icon={<BookOpen size={20} />}
      description="Complete XA-tagged modules to unlock the full compliance checklist"
    >
      {loadState === 'loading' && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="animate-spin text-foreground/60" size={24} />
          <span className="ml-2 text-sm text-foreground/60">Loading learning path...</span>
        </div>
      )}

      {loadState === 'error' && (
        <div className="glass-tile rounded-xl p-4 text-center">
          <p className="text-sm text-foreground/60">
            Unable to load learning path data. Please try again later.
          </p>
        </div>
      )}

      {loadState === 'ready' && status && (
        <div className="space-y-4">
          {/* Progress indicator */}
          <div className="glass-tile rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                Progress: {completedCount} / {totalRequired} modules completed
              </span>
              {educationComplete && (
                <span className="glass-pill inline-flex items-center gap-1.5 text-xs font-medium text-green-400">
                  <CheckCircle size={14} />
                  Complete
                </span>
              )}
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 rounded-full bg-foreground/10">
              <div
                className="h-2 rounded-full transition-all duration-500"
                style={{
                  width: `${progressPercent}%`,
                  backgroundColor: educationComplete
                    ? 'var(--secondary)'
                    : 'var(--primary)',
                }}
              />
            </div>
          </div>

          {/* Status message */}
          <div className="glass-tile rounded-xl p-4">
            {educationComplete ? (
              <div className="flex items-center gap-3">
                <CheckCircle size={20} className="text-green-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Learning Path Complete
                  </p>
                  <p className="text-xs text-foreground/60 mt-0.5">
                    Full XA compliance checklist is now unlocked.
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-foreground/80">
                Complete 3 CPD modules to unlock full XA checklist
              </p>
            )}
          </div>

          {/* Completed modules list */}
          {status.completedModules.length > 0 && (
            <div className="glass-tile rounded-xl p-4 space-y-2">
              <p className="text-xs font-medium text-foreground/60 uppercase tracking-wider">
                Completed Modules
              </p>
              <ul className="space-y-1.5">
                {status.completedModules.map((moduleId) => (
                  <li
                    key={moduleId}
                    className="glass-record flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground"
                  >
                    <CheckCircle size={14} className="text-green-400 shrink-0" />
                    {moduleId}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </DashboardSection>
  );
}
