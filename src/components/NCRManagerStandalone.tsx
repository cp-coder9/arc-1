/**
 * NCRManagerStandalone — Standalone wrapper for NCR Manager.
 * Provides project selection when no projectId is provided.
 * When a project is selected, renders the full NCRManager component.
 *
 * Follows the SpecForge workspace template:
 * Header Card → Project Toggles → Content (NCRManager or selection prompt)
 */

import { useState } from 'react';
import type { UserProfile } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import NCRManager from '@/components/NCRManager';

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  user: UserProfile;
  projectId?: string;
}

interface ProjectOption {
  id: string;
  name: string;
  status: 'active' | 'pending' | 'complete';
}

// ── Demo project data (placeholder until project query service is wired) ─────

const DEMO_PROJECTS: ProjectOption[] = [
  { id: 'proj-1', name: 'Kensington Mixed-Use', status: 'active' },
  { id: 'proj-2', name: 'Sandton Office Park', status: 'active' },
  { id: 'proj-3', name: 'Melrose Arch Phase 3', status: 'pending' },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function NCRManagerStandalone({ user, projectId: propProjectId }: Props) {
  const [selectedProject, setSelectedProject] = useState<string | null>(propProjectId ?? null);

  const selectedProjectName = DEMO_PROJECTS.find(p => p.id === selectedProject)?.name ?? 'Select a Project';

  return (
    <div className="space-y-6" data-testid="ncr-manager-standalone">
      {/* ─── Header Card (SpecForge pattern) ────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                <ShieldAlert className="mr-1.5 inline h-3.5 w-3.5" />
                NCR Manager
              </p>
              <CardTitle className="mt-1 text-2xl">
                {selectedProject ? selectedProjectName : 'Select a Project'}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Non-conformance report management · Defect tracking & resolution
              </p>
            </div>
            <Badge className="rounded-full border-0 bg-primary/15 text-primary">
              {user.role.replace(/_/g, ' ')}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* ─── Project Toggles ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Projects:</span>
        {DEMO_PROJECTS.map((proj) => (
          <Button
            key={proj.id}
            variant={selectedProject === proj.id ? 'default' : 'outline'}
            size="sm"
            className="rounded-full text-xs"
            onClick={() => setSelectedProject(proj.id)}
          >
            <span className={cn(
              'mr-1.5 inline-block h-2 w-2 rounded-full',
              proj.status === 'active' ? 'bg-emerald-400' : proj.status === 'pending' ? 'bg-yellow-400' : 'bg-slate-400',
            )} />
            {proj.name}
          </Button>
        ))}
      </div>

      {/* ─── Content ────────────────────────────────────────────────────── */}
      {selectedProject ? (
        <NCRManager
          projectId={selectedProject}
          currentUserId={user.uid}
        />
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-lg font-medium">No Project Selected</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Select a project above to manage non-conformance reports. NCRs track defects,
              corrective actions, and resolution workflows during site execution.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
