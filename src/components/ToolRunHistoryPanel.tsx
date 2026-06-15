import React, { useState, useEffect, useMemo } from 'react';
import {
  History,

  ChevronDown,
  ChevronRight,
  Calculator,
  Clock,
  User,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { CalculatorRiskStatus } from '@/types/toolboxCalculators';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
interface ToolRunRecord {
  id: string;
  toolId: string;
  calculatorId?: string;
  userId: string;
  userName?: string;
  riskStatus?: CalculatorRiskStatus;
  approvalState?: string;
  createdAt: string;
  context?: Record<string, unknown>;
  inputs?: Record<string, unknown>;
  results?: Record<string, unknown>;
  assumptions?: string[];
  exportTargets?: string[];
  nextRecommendedActions?: string[];
}

interface ToolRunHistoryPanelProps {
  projectId?: string;
  userId?: string;
  maxItems?: number;
}

const RISK_BADGE: Record<string, { variant: 'default' | 'destructive' | 'secondary' | 'outline'; label: string; icon: React.ReactNode }> = {
  pass: { variant: 'default', label: 'PASS', icon: <CheckCircle2 className="h-3 w-3" /> },
  warning: { variant: 'secondary', label: 'WARN', icon: <AlertTriangle className="h-3 w-3" /> },
  fail: { variant: 'destructive', label: 'FAIL', icon: <XCircle className="h-3 w-3" /> },
  info: { variant: 'outline', label: 'INFO', icon: <Info className="h-3 w-3" /> },
};

export default function ToolRunHistoryPanel({
  projectId,
  userId,
  maxItems = 20,
}: ToolRunHistoryPanelProps) {
  const [runs, setRuns] = useState<ToolRunRecord[]>([]);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    try {
      let q;
      if (projectId) {
        q = query(
          getDemoCol( 'projects', projectId, 'tool_runs'),
          orderBy('createdAt', 'desc'),
          limit(maxItems),
        );
      } else if (userId) {
        q = query(
          getDemoCol( 'tool_runs'),
          where('userId', '==', userId),
          orderBy('createdAt', 'desc'),
          limit(maxItems),
        );
      } else {
        q = query(getDemoCol( 'tool_runs'), orderBy('createdAt', 'desc'), limit(maxItems));
      }

      const unsubscribe = onSnapshot(
        q,
        (snapshot: any) => {
          setRuns(
            snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            })) as ToolRunRecord[],
          );
          setLoading(false);
        },
        () => {
          setError('Could not load tool run history. Firestore may be offline.');
          setLoading(false);
        },
      );

      return () => unsubscribe();
    } catch {
      setError('Tool run history requires Firestore connection.');
      setLoading(false);
    }
  }, [projectId, userId, maxItems]);

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          <Clock className="mx-auto h-6 w-6 animate-pulse mb-2" />
          <p className="text-sm">Loading tool run history...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          <History className="mx-auto h-8 w-8 mb-2" />
          <p className="text-sm">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (runs.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          <History className="mx-auto h-8 w-8 mb-2" />
          <p className="text-sm">No tool runs recorded yet.</p>
          <p className="text-xs mt-1">Run a calculator or tool to see it here.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <History className="h-5 w-5" />
          Tool Run History
        </CardTitle>
        <CardDescription>{runs.length} runs recorded</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          <div className="space-y-2">
            {runs.map((run) => (
              <div key={run.id}>
                <div
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() =>
                    setExpandedRunId(expandedRunId === run.id ? null : run.id)
                  }
                >
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      {expandedRunId === run.id ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                    <Calculator className="h-4 w-4 text-primary" />
                    <div>
                      <div className="text-sm font-medium">
                        {run.toolId
                          ?.replace(/_/g, ' ')
                          .replace(/\b\w/g, (c) => c.toUpperCase()) ?? run.calculatorId}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <Clock className="h-3 w-3" />
                        {formatDate(run.createdAt)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {run.riskStatus && RISK_BADGE[run.riskStatus] && (
                      <Badge
                        variant={RISK_BADGE[run.riskStatus].variant}
                        className="flex items-center gap-1 text-xs"
                      >
                        {RISK_BADGE[run.riskStatus].icon}
                        {RISK_BADGE[run.riskStatus].label}
                      </Badge>
                    )}
                    {run.approvalState && (
                      <Badge variant="outline" className="text-xs">
                        {run.approvalState}
                      </Badge>
                    )}
                  </div>
                </div>

                {expandedRunId === run.id && (
                  <div className="ml-9 mt-2 p-3 bg-muted/20 rounded-lg space-y-3 text-sm">
                    {/* Results */}
                    {run.results && Object.keys(run.results).length > 0 && (
                      <div>
                        <div className="font-medium mb-1">Results</div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
                          {Object.entries(run.results).map(([key, value]) => (
                            <div key={key} className="text-xs">
                              <span className="text-muted-foreground">{key}: </span>
                              <span className="font-medium">
                                {typeof value === 'number'
                                  ? (value as number).toLocaleString()
                                  : String(value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <Separator />

                    {/* Assumptions */}
                    {run.assumptions && run.assumptions.length > 0 && (
                      <div>
                        <div className="font-medium mb-1">Assumptions</div>
                        <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                          {run.assumptions.map((a, i) => (
                            <li key={i}>{a}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Export targets */}
                    {run.exportTargets && run.exportTargets.length > 0 && (
                      <div>
                        <div className="font-medium mb-1">Export Targets</div>
                        <div className="flex gap-1 flex-wrap">
                          {run.exportTargets.map((t) => (
                            <Badge key={t} variant="outline" className="text-xs">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Next actions */}
                    {run.nextRecommendedActions && run.nextRecommendedActions.length > 0 && (
                      <div>
                        <div className="font-medium mb-1">Recommended Actions</div>
                        <ul className="text-xs space-y-0.5">
                          {run.nextRecommendedActions.map((action, i) => (
                            <li key={i} className="text-muted-foreground">
                              • {action}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
