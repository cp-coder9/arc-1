'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BrainCircuit, CheckCircle, X, RefreshCw } from 'lucide-react';
import { useDemoMode } from '@/demo-context/DemoModeProvider';
import type { AIRecommendation } from '@/services/commandCentre/types';

interface AIAdvisorViewProps {
  projectId: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  schedule_optimisation: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  risk_detection: 'bg-red-500/20 text-red-400 border-red-500/50',
  cost_savings: 'bg-green-500/20 text-green-400 border-green-500/50',
  compliance_alert: 'bg-amber-500/20 text-amber-400 border-amber-500/50',
  supply_chain_risk: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
};

export default function AIAdvisorView({ projectId }: AIAdvisorViewProps) {
  const { isDemoMode } = useDemoMode();
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([]);
  const [loading, setLoading] = useState(false);

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
        <h2 className="text-lg font-semibold">AI Advisor</h2>
        <Button size="sm" variant="outline" className="gap-1" disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Generate Recommendations
        </Button>
      </div>

      {recommendations.length === 0 ? (
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="pt-4">
            <div className="text-center py-12">
              <BrainCircuit className="h-12 w-12 mx-auto text-primary-400 opacity-40 mb-3" />
              <p className="text-sm text-muted-foreground">No recommendations yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Generate AI-powered recommendations based on your project data
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {recommendations.map((rec) => (
            <Card key={rec.id} className="bg-surface-800/70 backdrop-blur border-surface-700/50">
              <CardContent className="pt-4">
                <div className="flex items-start gap-4">
                  <BrainCircuit className="h-5 w-5 text-primary-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-xs ${CATEGORY_COLORS[rec.category] ?? ''}`}>
                        {rec.category.replace(/_/g, ' ')}
                      </Badge>
                      <Badge variant="outline" className="text-xs capitalize">{rec.status}</Badge>
                    </div>
                    <h3 className="text-sm font-medium">{rec.title}</h3>
                    <p className="text-sm text-muted-foreground">{rec.explanation}</p>
                    {rec.suggestedActions.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {rec.suggestedActions.map((action, i) => (
                          <Badge key={i} variant="outline" className="text-[10px]">
                            {action.type.replace(/_/g, ' ')}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  {rec.status === 'pending' && (
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-xs">
                        <CheckCircle className="h-3 w-3" />
                        Accept
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-xs text-muted-foreground">
                        <X className="h-3 w-3" />
                        Dismiss
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
