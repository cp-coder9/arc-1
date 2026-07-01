'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FolderOpen, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';

interface PortfolioDashboardViewProps {
  userId: string;
}

interface PortfolioProject {
  id: string;
  name: string;
  value: number;
  stage: string;
  health: 'healthy' | 'at_risk' | 'critical';
  progress: number;
  overdueActions: number;
}

export default function PortfolioDashboardView({ userId }: PortfolioDashboardViewProps) {
  const [projects, setProjects] = useState<PortfolioProject[]>([]);

  useEffect(() => {
    void userId;
  }, [userId]);

  const totalValue = projects.reduce((s, p) => s + p.value, 0);
  const avgProgress = projects.length > 0
    ? Math.round(projects.reduce((s, p) => s + p.progress, 0) / projects.length)
    : 0;
  const atRiskCount = projects.filter((p) => p.health !== 'healthy').length;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Portfolio Dashboard</h2>

      {/* Portfolio Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="pt-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Active Projects</p>
            <p className="text-2xl font-bold mt-1">{projects.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="pt-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Value</p>
            <p className="text-2xl font-bold mt-1">R {(totalValue / 1_000_000).toFixed(1)}M</p>
          </CardContent>
        </Card>
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="pt-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Avg Progress</p>
            <p className="text-2xl font-bold mt-1">{avgProgress}%</p>
          </CardContent>
        </Card>
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="pt-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">At Risk</p>
            <p className="text-2xl font-bold mt-1">{atRiskCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Project List */}
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardHeader>
          <CardTitle className="text-sm font-medium">All Projects</CardTitle>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FolderOpen className="h-8 w-8 mx-auto opacity-40 mb-2" />
              <p className="text-sm">No projects in portfolio</p>
            </div>
          ) : (
            <div className="space-y-2">
              {projects.map((project) => (
                <div key={project.id} className="flex items-center gap-4 p-3 rounded-lg border border-surface-700/30">
                  {project.health === 'healthy' && <CheckCircle className="h-5 w-5 text-green-400 shrink-0" />}
                  {project.health === 'at_risk' && <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />}
                  {project.health === 'critical' && <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{project.name}</p>
                    <p className="text-xs text-muted-foreground">{project.stage} · R {(project.value / 1_000_000).toFixed(1)}M</p>
                  </div>
                  <div className="w-24">
                    <div className="h-2 rounded-full bg-surface-700/50">
                      <div className="h-full rounded-full bg-primary-500" style={{ width: `${project.progress}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 text-right">{project.progress}%</p>
                  </div>
                  {project.overdueActions > 0 && (
                    <Badge variant="outline" className="text-xs border-red-500/50 text-red-400">
                      {project.overdueActions} overdue
                    </Badge>
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
