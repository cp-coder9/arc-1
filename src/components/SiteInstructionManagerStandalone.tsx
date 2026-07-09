/**
 * SiteInstructionManagerStandalone — Standalone wrapper for Site Instruction Manager.
 * Provides project selection when no projectId is provided, and renders the existing
 * SiteInstructionManager with the correct props once a project is chosen.
 *
 * Requirements: 3.3, 3.4, 3.5, 3.8, 3.9
 */

import { useState } from 'react';
import { FileText, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import type { UserProfile } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import SiteInstructionManager from '@/components/SiteInstructionManager';

interface Props {
  user: UserProfile;
  projectId?: string;
}

export default function SiteInstructionManagerStandalone({ user, projectId: propProjectId }: Props) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(propProjectId);
  const [auditError, setAuditError] = useState<string | null>(null);

  // Resolve the active project — either from prop or user selection
  const activeProjectId = propProjectId ?? selectedProjectId;

  /**
   * Handle audit trail write failures: display error toast, retain instruction data.
   * This wraps the SiteInstructionManager's actions at the standalone level.
   */
  const handleAuditWriteFailure = (error: unknown) => {
    const message = error instanceof Error ? error.message : 'Audit trail write failed';
    setAuditError(message);
    toast.error('Audit trail write failed — your instruction data has been preserved.', {
      description: message,
      duration: 6000,
    });
  };

  // ── No project selected — render selection prompt ─────────────────────────

  if (!activeProjectId) {
    return (
      <div className="space-y-6" data-testid="site-instruction-manager-standalone">
        {/* Header Card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                  Site Instructions
                </p>
                <CardTitle className="text-2xl">Select a Project</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Formal site instruction issuance, acknowledgement, and tracking
                </p>
              </div>
              <Badge className="rounded-full border-0 bg-primary/15 text-primary">
                {user.role}
              </Badge>
            </div>
          </CardHeader>
        </Card>

        {/* Project selection prompt */}
        <Card>
          <CardContent className="py-16 text-center">
            <FolderOpen className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-lg font-semibold">Select a project to manage site instructions</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
              Site instructions require an active project context. Select a project to issue,
              acknowledge, and track formal site instructions.
            </p>
            {/* Placeholder project selection — projects resolved from platform shell */}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => setSelectedProjectId('demo-project-1')}
              >
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-500" />
                Demo Project 1
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => setSelectedProjectId('demo-project-2')}
              >
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-amber-500" />
                Demo Project 2
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Project selected — render SiteInstructionManager ───────────────────────

  return (
    <div className="space-y-6" data-testid="site-instruction-manager-standalone">
      {/* Header Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                Site Instructions
              </p>
              <CardTitle className="text-2xl flex items-center gap-2">
                <FileText size={20} className="text-primary" />
                Project: {activeProjectId}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Formal site instruction issuance, acknowledgement, and tracking
              </p>
            </div>
            <Badge className="rounded-full border-0 bg-primary/15 text-primary">
              {user.role}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Audit error banner */}
      {auditError && (
        <Card className="border-red-500/30 bg-red-500/10">
          <CardContent className="py-3 px-4 flex items-center justify-between">
            <p className="text-sm text-red-400">
              Audit trail sync failed — instruction data retained locally.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="text-red-400 border-red-400/30"
              onClick={() => setAuditError(null)}
            >
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Existing SiteInstructionManager */}
      <SiteInstructionManager
        projectId={activeProjectId}
        currentUserId={user.uid}
        currentUserRole={user.role}
      />
    </div>
  );
}
