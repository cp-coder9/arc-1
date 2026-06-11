import React, { useMemo, useState } from 'react';
import { AlertCircle, BarChart3, CheckCircle2, Clock, Users2 } from 'lucide-react';
import {
  classifyProcurementScope,
  type ProcurementScopeInput,
  type ProcurementScopeResult,
} from '@/services/procurementScopeClassifier';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ScopeClassifyCardProps {
  projectId: string;
  projectName?: string;
  estimatedValueZar: number;
  location?: string;
  requiredTrades?: string[];
}

export default function ProcurementScopeClassifyCard({
  projectId,
  projectName = 'Unnamed Project',
  estimatedValueZar,
  location = '',
  requiredTrades = [],
}: ScopeClassifyCardProps) {
  const [result, setResult] = useState<ProcurementScopeResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const classifyLabel = useMemo(() => {
    if (!result) return null;
    const labels: Record<string, { label: string; color: string }> = {
      open_tender: { label: 'Open Tender', color: 'bg-blue-100 text-blue-700' },
      invited_tender: { label: 'Invited Tender', color: 'bg-purple-100 text-purple-700' },
      rfq: { label: 'RFQ', color: 'bg-amber-100 text-amber-700' },
      direct_appointment: { label: 'Direct Appointment', color: 'bg-emerald-100 text-emerald-700' },
    };
    return labels[result.classification] || { label: result.classification, color: 'bg-slate-100 text-slate-700' };
  }, [result]);

  const handleClassify = async () => {
    setIsLoading(true);
    try {
      const input: ProcurementScopeInput = {
        projectId,
        projectName,
        estimatedValueZar,
        complexity: 'medium',
        urgency: 'standard',
        publicSector: estimatedValueZar >= 10_000_000,
        requiredTrades,
        requiredSpecialists: [],
        municipalReadinessScore: 70,
        regulatoryRequirements: [],
        riskFlags: [],
        location,
      };
      const result = classifyProcurementScope(input);
      setResult(result);
    } catch (err: any) {
      console.error('Classification error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="rounded-2xl border-border bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="font-heading text-lg font-bold flex items-center gap-2">
          <BarChart3 size={20} />
          Procurement Scope Classification
        </CardTitle>
        <CardDescription>Determine the appropriate procurement approach based on project attributes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!result && (
          <Button onClick={handleClassify} disabled={isLoading} className="w-full" variant="outline">
            {isLoading ? 'Classifying...' : 'Classify Procurement Scope'}
          </Button>
        )}

        {result && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              {classifyLabel && (
                <Badge className={`text-sm px-3 py-1 ${classifyLabel.color}`}>
                  {classifyLabel.label}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                Confidence: {Math.round(result.confidence * 100)}%
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-secondary/30 p-3 text-center">
                <Users2 size={16} className="mx-auto mb-1 text-muted-foreground" />
                <p className="text-lg font-bold">{result.minimumBidders}</p>
                <p className="text-xs text-muted-foreground">Min Bidders</p>
              </div>
              <div className="rounded-xl bg-secondary/30 p-3 text-center">
                <Clock size={16} className="mx-auto mb-1 text-muted-foreground" />
                <p className="text-lg font-bold">{result.estimatedDurationDays}</p>
                <p className="text-xs text-muted-foreground">Est. Days</p>
              </div>
            </div>

            {result.regulatoryTriggers.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle size={16} className="text-amber-500 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-amber-700">Regulatory Triggers</p>
                    <ul className="mt-1 space-y-0.5">
                      {result.regulatoryTriggers.map((t, i) => (
                        <li key={i} className="text-xs text-amber-600">{t}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {result.publicAdvertisement && (
              <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 rounded-lg p-2">
                <CheckCircle2 size={14} />
                Public advertisement required
              </div>
            )}

            <p className="text-xs text-muted-foreground italic">{result.governanceNote}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
