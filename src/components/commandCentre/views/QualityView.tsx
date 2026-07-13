'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, CheckCircle, AlertCircle, Clock, Wrench } from 'lucide-react';
import { useDemoMode } from '@/demo-context/DemoModeProvider';

interface QualityViewProps {
  projectId: string;
}

interface SnagItem {
  id: string;
  description: string;
  location: string;
  severity: 'high' | 'medium' | 'low';
  assignedParty: string;
  status: 'open' | 'rectifying' | 'resolved' | 'closed';
  createdAt: string;
}

export default function QualityView({ projectId }: QualityViewProps) {
  const { isDemoMode } = useDemoMode();
  const [snags, setSnags] = useState<SnagItem[]>([]);

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
    openSnags: snags.filter((s) => s.status === 'open').length,
    resolvedThisWeek: 0,
    activeNCRs: 0,
    inspectionsDue: 0,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Quality Tracker</h2>
        <Button size="sm" className="gap-1">
          <Plus className="h-3.5 w-3.5" />
          Log Snag
        </Button>
      </div>

      {/* Quality Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-400" />
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Open Snags</p>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.openSnags}</p>
          </CardContent>
        </Card>
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-400" />
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Resolved This Week</p>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.resolvedThisWeek}</p>
          </CardContent>
        </Card>
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-amber-400" />
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Active NCRs</p>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.activeNCRs}</p>
          </CardContent>
        </Card>
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary-400" />
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Inspections Due</p>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.inspectionsDue}</p>
          </CardContent>
        </Card>
      </div>

      {/* Snag Table */}
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-700/50">
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Description</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Location</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Severity</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Assigned</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {snags.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-muted-foreground">
                      No snags recorded
                    </td>
                  </tr>
                ) : (
                  snags.map((snag) => (
                    <tr key={snag.id} className="border-b border-surface-700/30">
                      <td className="py-2 px-2 font-medium truncate max-w-xs">{snag.description}</td>
                      <td className="py-2 px-2 text-muted-foreground">{snag.location}</td>
                      <td className="py-2 px-2">
                        <Badge variant="outline" className="text-xs capitalize">{snag.severity}</Badge>
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">{snag.assignedParty}</td>
                      <td className="py-2 px-2 capitalize text-muted-foreground">{snag.status}</td>
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
