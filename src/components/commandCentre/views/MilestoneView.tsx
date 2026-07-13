'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Target } from 'lucide-react';
import { useDemoMode } from '@/demo-context/DemoModeProvider';
import type { CommandCentreMilestone } from '@/services/commandCentre/types';

interface MilestoneViewProps {
  projectId: string;
}

const STATUS_COLORS: Record<string, string> = {
  complete: 'bg-green-500/20 text-green-400 border-green-500/50',
  on_track: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  at_risk: 'bg-amber-500/20 text-amber-400 border-amber-500/50',
  overdue: 'bg-red-500/20 text-red-400 border-red-500/50',
  pending: 'bg-slate-500/20 text-slate-400 border-slate-500/50',
};

export default function MilestoneView({ projectId }: MilestoneViewProps) {
  const { isDemoMode } = useDemoMode();
  const [milestones, setMilestones] = useState<CommandCentreMilestone[]>([]);

  if (!isDemoMode) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <p className="text-lg text-muted-foreground">No live data connected yet</p>
        <p className="text-sm text-muted-foreground mt-2">
          Data integration pending for project {projectId}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Milestones</h2>
        <Button size="sm" className="gap-1">
          <Plus className="h-3.5 w-3.5" />
          Add Milestone
        </Button>
      </div>

      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-700/50">
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Milestone</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Planned Date</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Actual Date</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Status</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Certificate</th>
                </tr>
              </thead>
              <tbody>
                {milestones.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <Target className="h-8 w-8 opacity-40" />
                        <p>No milestones configured</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  milestones.map((m) => (
                    <tr key={m.id} className="border-b border-surface-700/30">
                      <td className="py-2 px-2 font-medium">
                        <div className="flex items-center gap-2">
                          {m.name}
                          {m.category === 'nhbrc_inspection' && (
                            <Badge variant="outline" className="text-[10px]">NHBRC</Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">{m.plannedDate}</td>
                      <td className="py-2 px-2 text-muted-foreground">{m.actualDate ?? '—'}</td>
                      <td className="py-2 px-2">
                        <Badge variant="outline" className={`text-xs ${STATUS_COLORS[m.status] ?? ''}`}>
                          {m.status.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">{m.linkedCertificateId ?? '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
