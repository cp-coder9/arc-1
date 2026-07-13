'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, AlertTriangle } from 'lucide-react';
import { useDemoMode } from '@/demo-context/DemoModeProvider';

interface ProgrammeViewProps {
  projectId: string;
}

interface Activity {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  progress: number;
  assignee: string;
  isCriticalPath: boolean;
  specForgeRef?: string;
}

export default function ProgrammeView({ projectId }: ProgrammeViewProps) {
  const { isDemoMode } = useDemoMode();
  const [activities, setActivities] = useState<Activity[]>([]);

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
        <h2 className="text-lg font-semibold">Programme / Gantt</h2>
        <Button size="sm" className="gap-1">
          <Plus className="h-3.5 w-3.5" />
          Add Activity
        </Button>
      </div>

      {/* Gantt Chart Representation */}
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Activity Timeline</CardTitle>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1">
                <span className="w-3 h-2 rounded-sm bg-red-500/60" /> Critical Path
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-2 rounded-sm bg-green-500/60" /> Complete
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-2 rounded-sm bg-primary-500/60" /> On Track
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {activities.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              No activities added yet. Create an activity to start building the programme.
            </p>
          ) : (
            <div className="space-y-2">
              {activities.map((activity) => (
                <div key={activity.id} className="flex items-center gap-3 p-2 rounded bg-surface-700/30">
                  <div className="w-40 shrink-0">
                    <p className="text-sm font-medium truncate">{activity.name}</p>
                    <p className="text-xs text-muted-foreground">{activity.assignee}</p>
                  </div>
                  <div className="flex-1 h-6 rounded bg-surface-700/50 relative overflow-hidden">
                    <div
                      className={`h-full rounded transition-all ${
                        activity.progress === 100
                          ? 'bg-green-500/60'
                          : activity.isCriticalPath
                            ? 'bg-red-500/60'
                            : 'bg-primary-500/60'
                      }`}
                      style={{ width: `${activity.progress}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">
                      {activity.progress}%
                    </span>
                  </div>
                  <div className="w-32 text-right shrink-0">
                    <p className="text-xs text-muted-foreground">{activity.startDate}</p>
                    <p className="text-xs text-muted-foreground">{activity.endDate}</p>
                  </div>
                  {activity.isCriticalPath && (
                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                  )}
                  {activity.specForgeRef && (
                    <Badge variant="outline" className="text-[10px] shrink-0">SF</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
