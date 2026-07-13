'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity, DollarSign, AlertTriangle, MessageSquare, CheckCircle, Clock, XCircle } from 'lucide-react';
import { useDemoMode } from '@/demo-context/DemoModeProvider';
import type { AIRecommendation, CommandCentreMilestone } from '@/services/commandCentre/types';

interface DashboardViewProps {
  projectId: string;
}

const LIFECYCLE_STAGES = ['Brief', 'Appoint', 'Design', 'Comply', 'Procure', 'Build', 'Pay', 'Closeout'];

export default function DashboardView({ projectId }: DashboardViewProps) {
  const { isDemoMode } = useDemoMode();
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([]);
  const [milestones, setMilestones] = useState<CommandCentreMilestone[]>([]);
  const [currentStage] = useState(4); // Index of active stage

  const statCards = [
    { label: 'Overall Progress', value: '62%', icon: Activity, trend: '+3% this week' },
    { label: 'Budget Spent', value: 'R 2.4M / R 5.8M', icon: DollarSign, trend: '41% of contract' },
    { label: 'Open Actions', value: '12', icon: AlertTriangle, trend: '3 overdue' },
    { label: 'Active RFIs', value: '5', icon: MessageSquare, trend: '2 pending response' },
  ];

  if (!isDemoMode) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <p className="text-lg text-muted-foreground">No data loaded</p>
        <p className="text-sm text-muted-foreground mt-2">
          Live data integration pending for project {projectId}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Demo Data Indicator */}
      <div className="flex justify-end">
        <span className="text-xs text-orange-400 bg-orange-500/20 rounded-full px-2 py-0.5">Demo Data</span>
      </div>
      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className="bg-surface-800/70 backdrop-blur border-surface-700/50">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">{card.label}</p>
                    <p className="text-2xl font-bold mt-1">{card.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{card.trend}</p>
                  </div>
                  <Icon className="h-8 w-8 text-primary-400 opacity-60" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Lifecycle Bar */}
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Project Lifecycle</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-1">
            {LIFECYCLE_STAGES.map((stage, i) => (
              <div
                key={stage}
                className={`flex-1 text-center py-2 px-1 rounded text-xs font-medium transition-colors ${
                  i < currentStage
                    ? 'bg-green-600/30 text-green-400'
                    : i === currentStage
                      ? 'bg-primary-600/30 text-primary-400 ring-1 ring-primary-500/50'
                      : 'bg-surface-700/30 text-muted-foreground'
                }`}
              >
                {stage}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI Recommendations Panel */}
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardHeader>
            <CardTitle className="text-sm font-medium">AI Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            {recommendations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending recommendations</p>
            ) : (
              <ul className="space-y-3">
                {recommendations.slice(0, 5).map((rec) => (
                  <li key={rec.id} className="flex items-start gap-3 p-2 rounded bg-surface-700/30">
                    <Badge variant="outline" className="text-xs shrink-0 mt-0.5">
                      {rec.category.replace(/_/g, ' ')}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{rec.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{rec.explanation}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">Accept</Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground">Dismiss</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Milestones */}
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Upcoming Milestones</CardTitle>
          </CardHeader>
          <CardContent>
            {milestones.length === 0 ? (
              <p className="text-sm text-muted-foreground">No milestones configured</p>
            ) : (
              <ul className="space-y-2">
                {milestones.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 p-2 rounded bg-surface-700/30">
                    {m.status === 'overdue' && <XCircle className="h-4 w-4 text-red-400 shrink-0" />}
                    {m.status === 'at_risk' && <Clock className="h-4 w-4 text-amber-400 shrink-0" />}
                    {(m.status === 'on_track' || m.status === 'complete') && <CheckCircle className="h-4 w-4 text-green-400 shrink-0" />}
                    {m.status === 'pending' && <Clock className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{m.name}</p>
                      <p className="text-xs text-muted-foreground">{m.plannedDate}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        m.status === 'overdue' ? 'border-red-500/50 text-red-400' :
                        m.status === 'at_risk' ? 'border-amber-500/50 text-amber-400' :
                        'border-green-500/50 text-green-400'
                      }`}
                    >
                      {m.status.replace(/_/g, ' ')}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
