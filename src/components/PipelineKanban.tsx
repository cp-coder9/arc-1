import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import { toast } from 'sonner';
import {
  TrendingUp, DollarSign, Target, BarChart3, RefreshCw,
} from 'lucide-react';
import type { UserProfile, PipelineProject, PipelineForecast } from '../types';
import { pipelineService } from '../services/pipelineService';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { PROJECT_STAGE_LABELS, PROJECT_STAGE_ORDER } from '../types';

interface Props {
  user: UserProfile;
  firmId?: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-blue-100 text-blue-800 border-blue-300',
  won: 'bg-green-100 text-green-800 border-green-300',
  lost: 'bg-red-100 text-red-800 border-red-300',
  abandoned: 'bg-gray-100 text-gray-600 border-gray-300',
  on_hold: 'bg-yellow-100 text-yellow-800 border-yellow-300',
};

const PROBABILITY_COLORS = (p: number) => {
  if (p >= 70) return 'text-green-600';
  if (p >= 40) return 'text-yellow-600';
  return 'text-red-500';
};

export default function PipelineKanban({ user, firmId }: Props) {
  const [projects, setProjects] = useState<PipelineProject[]>([]);
  const [forecast, setForecast] = useState<PipelineForecast | null>(null);
  const activeFirmId = firmId || user.primaryFirmId || '';

  useEffect(() => {
    if (!activeFirmId) return;
    const unsub = pipelineService.subscribeToPipeline(activeFirmId, setProjects);
    return () => unsub();
  }, [activeFirmId]);

  const loadForecast = async () => {
    if (!activeFirmId) return;
    try {
      const f = await pipelineService.getPipelineForecast(activeFirmId);
      setForecast(f);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load forecast.');
    }
  };

  useEffect(() => {
    if (activeFirmId) loadForecast();
  }, [activeFirmId]);

  const formatCurrency = (cents: number) =>
    `R${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const projectsByStage = PROJECT_STAGE_ORDER.reduce((acc, stage) => {
    acc[stage] = projects.filter((p) => p.stage === stage);
    return acc;
  }, {} as Record<string, PipelineProject[]>);

  const activeProjects = projects.filter((p) => p.status === 'active');
  const wonProjects = projects.filter((p) => p.status === 'won');
  const lostProjects = projects.filter((p) => p.status === 'lost');

  const handleStatusChange = async (id: string, status: PipelineProject['status']) => {
    try {
      await pipelineService.updatePipelineStatus(id, status);
      toast.success(`Project marked as ${status}.`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update status.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Forecast Summary */}
      {forecast && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="rounded-[1rem] border-border bg-card/95 beos-soft-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <BarChart3 size={24} className="text-primary" />
              <div>
                <p className="text-xs text-muted-foreground font-bold uppercase">Pipeline Value</p>
                <p className="text-lg font-black">{formatCurrency(forecast.totalValueCents)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-[1rem] border-border bg-card/95 beos-soft-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <Target size={24} className="text-green-600" />
              <div>
                <p className="text-xs text-muted-foreground font-bold uppercase">Weighted Value</p>
                <p className="text-lg font-black">{formatCurrency(forecast.weightedValueCents)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-[1rem] border-border bg-card/95 beos-soft-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <TrendingUp size={24} className="text-blue-600" />
              <div>
                <p className="text-xs text-muted-foreground font-bold uppercase">Active</p>
                <p className="text-lg font-black">{activeProjects.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-[1rem] border-border bg-card/95 beos-soft-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <DollarSign size={24} className="text-green-700" />
              <div>
                <p className="text-xs text-muted-foreground font-bold uppercase">Won / Lost</p>
                <p className="text-lg font-black">{wonProjects.length} / {lostProjects.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Kanban Board */}
      <Card className="rounded-[1.25rem] border-border bg-card/95 beos-soft-shadow overflow-hidden">
        <CardHeader className="bg-[#f4faff]/80 border-b border-border/70">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-sans text-2xl font-black flex items-center gap-3">
                <BarChart3 size={22} className="text-primary" />
                Pipeline Kanban
              </CardTitle>
              <CardDescription>Projects by lifecycle stage with win/loss tracking</CardDescription>
            </div>
            <Button variant="outline" size="sm" className="rounded-full" onClick={loadForecast}>
              <RefreshCw size={14} className="mr-2" /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <ScrollArea className="w-full" orientation="horizontal">
            <div className="flex gap-4 min-w-max pb-2">
              {PROJECT_STAGE_ORDER.map((stage) => {
                const stageProjects = projectsByStage[stage] || [];
                return (
                  <div key={stage} className="w-64 shrink-0">
                    <div className="rounded-xl border border-border/70 bg-muted/40 p-3 mb-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-black text-foreground">{PROJECT_STAGE_LABELS[stage]}</p>
                        <Badge variant="secondary" className="rounded-full text-xs">{stageProjects.length}</Badge>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {stageProjects.map((project) => (
                        <div key={project.id} className="rounded-xl border border-border/50 bg-background p-3 shadow-sm">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <p className="text-sm font-bold truncate flex-1">{project.title}</p>
                            <Badge className={`rounded-full text-[10px] shrink-0 ${STATUS_COLORS[project.status] || 'bg-gray-100'}`}>
                              {project.status}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <DollarSign size={12} />
                              {formatCurrency(project.estimatedValueCents)}
                            </span>
                            <span className={`font-bold ${PROBABILITY_COLORS(project.probability)}`}>
                              {project.probability}%
                            </span>
                          </div>
                          {project.status === 'active' && (
                            <div className="mt-2 flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 rounded-full text-xs text-green-600 hover:bg-green-50"
                                onClick={() => handleStatusChange(project.id, 'won')}
                              >
                                Won
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 rounded-full text-xs text-red-500 hover:bg-red-50"
                                onClick={() => handleStatusChange(project.id, 'lost')}
                              >
                                Lost
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 rounded-full text-xs text-yellow-600 hover:bg-yellow-50"
                                onClick={() => handleStatusChange(project.id, 'on_hold')}
                              >
                                Hold
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                      {stageProjects.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-4">No projects</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
