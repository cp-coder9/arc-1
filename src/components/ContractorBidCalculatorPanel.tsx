import React, { useState, useMemo } from 'react';
import {
  Calculator,
  ClipboardCheck,
  FileText,
  ArrowRight,
  CheckCircle2,
  HardHat,
  Package,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import type { UserProfile, TenderPackage } from '@/types';
import type { CalculatorRun, ToolboxContext, CalculatorExportTarget } from '@/types/toolboxCalculators';
import { runCalculator } from '@/services/toolboxCalculatorService';
import { recommendToolboxCalculators } from '@/services/toolboxAgentService';

type Step = 'select_calculator' | 'run_calculations' | 'review_aggregate' | 'export';

interface BidLineItem {
  description: string;
  quantity: number;
  unit: string;
  unitRate: number;
  totalAmount: number;
  sourceCalculatorId?: string;
}

interface ContractorBidCalculatorPanelProps {
  user: UserProfile;
  tenderPackage?: TenderPackage;
  onBidLinesReady?: (lines: BidLineItem[]) => void;
}

export default function ContractorBidCalculatorPanel({
  user,
  tenderPackage,
  onBidLinesReady,
}: ContractorBidCalculatorPanelProps) {
  const [step, setStep] = useState<Step>('select_calculator');
  const [completedRuns, setCompletedRuns] = useState<CalculatorRun[]>([]);
  const [bidLines, setBidLines] = useState<BidLineItem[]>([]);

  const context: ToolboxContext = useMemo(
    () => ({
      userId: user.uid,
      role: 'contractor',
      projectId: tenderPackage?.projectId,
      tenderPackageId: tenderPackage?.id,
      phase: 'tender',
    }),
    [user.uid, tenderPackage],
  );

  const handleRunComplete = (run: CalculatorRun) => {
    setCompletedRuns((prev) => {
      const existing = prev.findIndex((r) => r.calculatorId === run.calculatorId);
      if (existing >= 0) {
        const copy = [...prev];
        copy[existing] = run;
        return copy;
      }
      return [...prev, run];
    });
  };

  const handleExportRun = (run: CalculatorRun, target: CalculatorExportTarget) => {
    if (target === 'tender_boq' || target === 'bid_line_item') {
      const results = run.results as Record<string, unknown>;
      const line: BidLineItem = {
        description: `[${run.calculatorId}] ${run.context.projectId ?? ''} - ${new Date().toLocaleDateString()}`,
        quantity: (results.quantity as number) ?? 0,
        unit: (results.unit as string) ?? 'each',
        unitRate: (results.unitRate as number) ?? (results.directUnitRate as number) ?? 0,
        totalAmount: (results.totalAmount as number) ?? (results.grossOrderVolumeM3 as number) ?? 0,
        sourceCalculatorId: run.calculatorId,
      };
      setBidLines((prev) => [...prev, line]);
    }
  };

  const aggregateTotal = useMemo(
    () => bidLines.reduce((sum, line) => sum + line.totalAmount, 0),
    [bidLines],
  );

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        {(['select_calculator', 'run_calculations', 'review_aggregate', 'export'] as Step[]).map(
          (s, i) => (
            <React.Fragment key={s}>
              <Badge
                variant={step === s ? 'default' : s < step ? 'secondary' : 'outline'}
                className="cursor-pointer"
                onClick={() => setStep(s)}
              >
                {i + 1}.{' '}
                {s === 'select_calculator'
                  ? 'Select'
                  : s === 'run_calculations'
                    ? 'Calculate'
                    : s === 'review_aggregate'
                      ? 'Review'
                      : 'Export'}
              </Badge>
              {i < 3 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
            </React.Fragment>
          ),
        )}
      </div>

      {/* Step content */}
      {step === 'select_calculator' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              Prepare Bid{tenderPackage ? `: ${tenderPackage.title ?? tenderPackage.id}` : ''}
            </CardTitle>
            <CardDescription>
              Run calculators to build your tender bid. Start with take-off quantities, then build
              your rates.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Card
                className="cursor-pointer hover:border-primary/50"
                onClick={() => {
                  const run = runCalculator(
                    'concrete_order',
                    context,
                    {
                      elements: [{ label: 'Slab', lengthM: 10, widthM: 8, depthM: 0.15 }],
                    } as Record<string, unknown>,
                  );
                  handleRunComplete(run);
                }}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <HardHat className="h-4 w-4" />
                    Concrete Take-off
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Quick concrete volume and truckload estimate
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card
                className="cursor-pointer hover:border-primary/50"
                onClick={() => {
                  const run = runCalculator(
                    'brick_blockwork',
                    context,
                    {
                      wallAreaM2: 120,
                      unitLengthMm: 222,
                      unitHeightMm: 106,
                    } as Record<string, unknown>,
                  );
                  handleRunComplete(run);
                }}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Brick / Blockwork
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Masonry unit quantity and order estimate
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>
            <Button onClick={() => setStep('run_calculations')} className="w-full">
              Open Full Calculator Panel
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 'run_calculations' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Run Bid Calculations
            </CardTitle>
            <CardDescription>
              Run the calculators you need for this bid. Results are saved automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted rounded-lg p-4 text-sm text-muted-foreground">
              <p>
                Use the full calculator panel below. Run concrete, brick, rate build-up, and labour
                productivity calculators to build your bid.
              </p>
            </div>
          </CardContent>
          <CardFooter className="gap-2">
            <Button variant="outline" onClick={() => setStep('select_calculator')}>
              Back
            </Button>
            <Button
              onClick={() => setStep('review_aggregate')}
              disabled={completedRuns.length === 0}
            >
              Review Bid Lines ({completedRuns.length} runs)
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === 'review_aggregate' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Review Bid Line Items
            </CardTitle>
            <CardDescription>
              Review and adjust quantities and rates before exporting to bid submission.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {bidLines.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calculator className="mx-auto h-8 w-8 mb-2" />
                <p>
                  No bid lines yet. Go back and run calculators, then export results as bid lines.
                </p>
                <Button
                  variant="outline"
                  className="mt-2"
                  onClick={() => setStep('run_calculations')}
                >
                  Run Calculators
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {bidLines.map((line, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between bg-muted/50 rounded-lg p-3"
                    >
                      <div>
                        <div className="text-sm font-medium">{line.description}</div>
                        <div className="text-xs text-muted-foreground">
                          {line.quantity} {line.unit} @ R{line.unitRate?.toLocaleString() ?? '0'}/
                          {line.unit}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">
                          R{line.totalAmount?.toLocaleString() ?? '0'}
                        </div>
                        {line.sourceCalculatorId && (
                          <Badge variant="outline" className="text-xs">
                            {line.sourceCalculatorId}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span>R{aggregateTotal.toLocaleString()}</span>
                </div>
              </>
            )}
          </CardContent>
          <CardFooter className="gap-2">
            <Button variant="outline" onClick={() => setStep('run_calculations')}>
              Back to Calculators
            </Button>
            <Button
              onClick={() => {
                onBidLinesReady?.(bidLines);
                setStep('export');
              }}
              disabled={bidLines.length === 0}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Export to Bid
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === 'export' && (
        <Card>
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-500 mb-2" />
            <h3 className="text-lg font-semibold">Bid Lines Ready</h3>
            <p className="text-muted-foreground">
              {bidLines.length} line items totalling R{aggregateTotal.toLocaleString()} have been
              prepared for bid submission.
            </p>
            <Button className="mt-4" onClick={() => setStep('select_calculator')}>
              Start New Bid Estimate
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
