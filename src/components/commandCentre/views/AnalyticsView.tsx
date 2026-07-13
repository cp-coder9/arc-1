'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart3, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useDemoMode } from '@/demo-context/DemoModeProvider';

interface AnalyticsViewProps {
  projectId: string;
}

interface KPIItem {
  label: string;
  value: string;
  trend: 'improving' | 'stable' | 'deteriorating';
  description: string;
}

export default function AnalyticsView({ projectId }: AnalyticsViewProps) {
  const { isDemoMode } = useDemoMode();
  const [kpis, setKpis] = useState<KPIItem[]>([]);

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

  const defaultKpis: KPIItem[] = [
    { label: 'Schedule Variance', value: '—', trend: 'stable', description: 'Planned vs actual milestone dates' },
    { label: 'Cost Variance', value: '—', trend: 'stable', description: 'Forecast vs contract sum deviation' },
    { label: 'Quality Score', value: '—', trend: 'stable', description: 'Snag resolution rate percentage' },
    { label: 'RFI Response Time', value: '—', trend: 'stable', description: 'Average days to respond to RFIs' },
  ];

  const displayKpis = kpis.length > 0 ? kpis : defaultKpis;

  const TrendIcon = ({ trend }: { trend: string }) => {
    if (trend === 'improving') return <TrendingUp className="h-4 w-4 text-green-400" />;
    if (trend === 'deteriorating') return <TrendingDown className="h-4 w-4 text-red-400" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Analytics & KPIs</h2>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {displayKpis.map((kpi) => (
          <Card key={kpi.label} className="bg-surface-800/70 backdrop-blur border-surface-700/50">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{kpi.label}</p>
                <TrendIcon trend={kpi.trend} />
              </div>
              <p className="text-2xl font-bold mt-2">{kpi.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{kpi.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* KPI Details Table */}
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Performance Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-700/50">
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Metric</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Value</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Trend</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                {displayKpis.map((kpi) => (
                  <tr key={kpi.label} className="border-b border-surface-700/30">
                    <td className="py-2 px-2 font-medium">{kpi.label}</td>
                    <td className="py-2 px-2">{kpi.value}</td>
                    <td className="py-2 px-2">
                      <Badge
                        variant="outline"
                        className={`text-xs capitalize ${
                          kpi.trend === 'improving' ? 'border-green-500/50 text-green-400' :
                          kpi.trend === 'deteriorating' ? 'border-red-500/50 text-red-400' :
                          'border-slate-500/50 text-slate-400'
                        }`}
                      >
                        {kpi.trend}
                      </Badge>
                    </td>
                    <td className="py-2 px-2 text-muted-foreground">{kpi.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
