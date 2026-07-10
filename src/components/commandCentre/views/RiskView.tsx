'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, AlertTriangle, Shield, ArrowUp } from 'lucide-react';
import type { RiskItem } from '@/services/commandCentre/types';

interface RiskViewProps {
  projectId: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/50',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
  medium: 'bg-amber-500/20 text-amber-400 border-amber-500/50',
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
};

export default function RiskView({ projectId }: RiskViewProps) {
  const [risks, setRisks] = useState<RiskItem[]>([]);

  useEffect(() => {
    void projectId;
  }, [projectId]);

  const riskStats = {
    critical: risks.filter((r) => r.severity === 'critical').length,
    high: risks.filter((r) => r.severity === 'high').length,
    medium: risks.filter((r) => r.severity === 'medium').length,
    low: risks.filter((r) => r.severity === 'low').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Risk Register</h2>
        <Button size="sm" className="gap-1">
          <Plus className="h-3.5 w-3.5" />
          Add Risk
        </Button>
      </div>

      {/* Risk Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(riskStats).map(([severity, count]) => (
          <Card key={severity} className="bg-surface-800/70 backdrop-blur border-surface-700/50">
            <CardContent className="pt-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">{severity}</p>
              <p className="text-2xl font-bold mt-1">{count}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Risk Table */}
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-700/50">
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Description</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Category</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Severity</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Owner</th>
                  <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Status</th>
                  <th className="text-right py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {risks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <Shield className="h-8 w-8 opacity-40" />
                        <p>No risks recorded</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  risks.map((risk) => (
                    <tr key={risk.id} className="border-b border-surface-700/30">
                      <td className="py-2 px-2 font-medium max-w-xs truncate">
                        <div className="flex items-center gap-1.5">
                          {risk.aiGenerated && <Badge variant="outline" className="text-[10px]">AI</Badge>}
                          {risk.description}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-muted-foreground capitalize">{risk.category.replace(/_/g, ' ')}</td>
                      <td className="py-2 px-2">
                        <Badge variant="outline" className={`text-xs ${SEVERITY_COLORS[risk.severity] ?? ''}`}>
                          {risk.severity}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">{risk.ownerName}</td>
                      <td className="py-2 px-2 capitalize text-muted-foreground">{risk.status}</td>
                      <td className="text-right py-2 px-2">
                        <Button size="sm" variant="ghost" className="h-7 px-2">
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                      </td>
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
