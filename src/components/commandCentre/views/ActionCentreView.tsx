'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Inbox, Clock, AlertTriangle, CheckCircle, Users } from 'lucide-react';
import { useDemoMode } from '@/demo-context/DemoModeProvider';
import type { CommandCentreAction } from '@/services/commandCentre/types';

interface ActionCentreViewProps {
  projectId: string;
}

const TYPE_COLORS: Record<string, string> = {
  approval: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
  technical: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  financial: 'bg-green-500/20 text-green-400 border-green-500/50',
  design: 'bg-amber-500/20 text-amber-400 border-amber-500/50',
  planning: 'bg-primary-500/20 text-primary-400 border-primary-500/50',
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/50',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
  medium: 'bg-amber-500/20 text-amber-400 border-amber-500/50',
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
};

export default function ActionCentreView({ projectId }: ActionCentreViewProps) {
  const { isDemoMode } = useDemoMode();
  const [actions, setActions] = useState<CommandCentreAction[]>([]);

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

  const stats = {
    overdue: actions.filter((a) => a.status === 'overdue').length,
    dueToday: 0,
    upcoming: 0,
    awaitingOthers: 0,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Action Centre</h2>
      </div>

      {/* Action Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Overdue</p>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.overdue}</p>
          </CardContent>
        </Card>
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-400" />
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Due Today</p>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.dueToday}</p>
          </CardContent>
        </Card>
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-400" />
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Upcoming (7d)</p>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.upcoming}</p>
          </CardContent>
        </Card>
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary-400" />
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Awaiting Others</p>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.awaitingOthers}</p>
          </CardContent>
        </Card>
      </div>

      {/* Action Table */}
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-700/50">
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Action</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Type</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Priority</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Due Date</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {actions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <Inbox className="h-8 w-8 opacity-40" />
                        <p>No actions pending</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  actions.map((action) => (
                    <tr key={action.id} className="border-b border-surface-700/30">
                      <td className="py-2 px-2 font-medium">{action.title}</td>
                      <td className="py-2 px-2">
                        <Badge variant="outline" className={`text-xs ${TYPE_COLORS[action.type] ?? ''}`}>
                          {action.type}
                        </Badge>
                      </td>
                      <td className="py-2 px-2">
                        <Badge variant="outline" className={`text-xs ${PRIORITY_COLORS[action.priority] ?? ''}`}>
                          {action.priority}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">{action.dueDate}</td>
                      <td className="py-2 px-2 capitalize text-muted-foreground">{action.status}</td>
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
