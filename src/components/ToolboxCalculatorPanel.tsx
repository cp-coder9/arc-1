import React, { useState, useMemo } from 'react';
import {
  Calculator,
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  Download,
  ArrowRight,
  XCircle,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { cn } from '@/lib/utils';

import type {
  CalculatorDefinition,
  CalculatorExportTarget,
  CalculatorRiskStatus,
  CalculatorRun,
  ToolboxContext,
  ToolboxFamilyId,
} from '@/types/toolboxCalculators';
import {
  listCalculatorsForContext,
  runCalculator,
} from '@/services/toolboxCalculatorService';
import { reviewCalculatorRun } from '@/services/toolboxAgentService';

const FAMILY_LABELS: Record<ToolboxFamilyId, string> = {
  xa_energy: 'XA Energy',
  structural: 'Structural',
  civil_stormwater: 'Civil / Stormwater',
  electrical: 'Electrical',
  mechanical_hvac: 'Mechanical / HVAC',
  wet_services: 'Wet Services',
  fire_life_safety: 'Fire / Life Safety',
  contractor_trade: 'Contractor Trade',
};

const FAMILY_ICONS: Record<ToolboxFamilyId, React.ReactNode> = {
  xa_energy: <ShieldCheck className="h-4 w-4" />,
  structural: <Wrench className="h-4 w-4" />,
  civil_stormwater: <Info className="h-4 w-4" />,
  electrical: <Info className="h-4 w-4" />,
  mechanical_hvac: <Info className="h-4 w-4" />,
  wet_services: <Info className="h-4 w-4" />,
  fire_life_safety: <AlertTriangle className="h-4 w-4" />,
  contractor_trade: <Calculator className="h-4 w-4" />,
};

const RISK_BADGE: Record<CalculatorRiskStatus, { variant: 'default' | 'destructive' | 'secondary' | 'outline'; label: string }> = {
  pass: { variant: 'default', label: 'PASS' },
  warning: { variant: 'secondary', label: 'WARNING' },
  fail: { variant: 'destructive', label: 'FAIL' },
  info: { variant: 'outline', label: 'INFO' },
};

const EXPORT_LABELS: Record<CalculatorExportTarget, string> = {
  compliance_report: 'Compliance Report',
  tender_boq: 'Tender BOQ',
  bid_line_item: 'Bid Line Item',
  supplier_rfq: 'Supplier RFQ',
  site_log: 'Site Log',
  rfi: 'RFI',
  variation_claim: 'Variation Claim',
  payment_valuation: 'Payment Valuation',
  bim_coordination_comment: 'BIM Comment',
};

interface ToolboxCalculatorPanelProps {
  context: ToolboxContext;
  preselectedCalculatorId?: string;
  onRunComplete?: (run: CalculatorRun) => void;
  onExport?: (run: CalculatorRun, target: CalculatorExportTarget) => void;
  compact?: boolean;
}

export default function ToolboxCalculatorPanel({
  context,
  preselectedCalculatorId,
  onRunComplete,
  onExport,
  compact = false,
}: ToolboxCalculatorPanelProps) {
  const [selectedFamily, setSelectedFamily] = useState<ToolboxFamilyId | 'all'>('all');
  const [selectedCalc, setSelectedCalc] = useState<CalculatorDefinition | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<CalculatorRun | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableCalculators = useMemo(() => {
    const all = listCalculatorsForContext(context);
    if (preselectedCalculatorId && !selectedCalc) {
      const preselected = all.find((c) => c.id === preselectedCalculatorId);
      if (preselected) setSelectedCalc(preselected as CalculatorDefinition);
    }
    return selectedFamily === 'all' ? all : all.filter((c) => c.familyId === selectedFamily);
  }, [context, selectedFamily, preselectedCalculatorId, selectedCalc]);

  const families = useMemo(() => {
    const ids = new Set(availableCalculators.map((c) => c.familyId));
    return Array.from(ids) as ToolboxFamilyId[];
  }, [availableCalculators]);

  const handleRun = () => {
    if (!selectedCalc) return;
    setError(null);
    setRunning(true);
    try {
      const numericInputs: Record<string, unknown> = {};
      for (const key of selectedCalc.requiredInputs) {
        const value = inputs[key];
        if (value === undefined || value === '') {
          throw new Error(`Missing required input: ${key}`);
        }
        numericInputs[key] = isNaN(Number(value)) ? value : Number(value);
      }
      for (const key of (selectedCalc.optionalInputs ?? [])) {
        const value = inputs[key];
        if (value !== undefined && value !== '') {
          numericInputs[key] = isNaN(Number(value)) ? value : Number(value);
        }
      }
      const run = runCalculator(selectedCalc.id, context, numericInputs);
      setResult(run);
      onRunComplete?.(run);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Calculation failed');
    } finally {
      setRunning(false);
    }
  };

  const agentNotes = result ? reviewCalculatorRun(result) : [];

  const resetCalc = () => {
    setSelectedCalc(null);
    setInputs({});
    setResult(null);
    setError(null);
  };

  if (!availableCalculators.length) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          <Calculator className="mx-auto h-8 w-8 mb-2" />
          <p>No calculators available for your current role and phase.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn('space-y-4', compact && 'space-y-2')}>
      {/* Header with family filter */}
      {!selectedCalc && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge
              variant={selectedFamily === 'all' ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setSelectedFamily('all')}
            >
              All
            </Badge>
            {families.map((family) => (
              <Badge
                key={family}
                variant={selectedFamily === family ? 'default' : 'outline'}
                className="cursor-pointer flex items-center gap-1"
                onClick={() => setSelectedFamily(family)}
              >
                {FAMILY_ICONS[family]}
                {FAMILY_LABELS[family]}
              </Badge>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {availableCalculators.map((calc) => (
              <Card
                key={calc.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setSelectedCalc(calc as CalculatorDefinition)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Calculator className="h-4 w-4 text-primary" />
                    {calc.label}
                  </CardTitle>
                  <CardDescription className="text-xs">{calc.description}</CardDescription>
                </CardHeader>
                <CardFooter className="pt-0 flex gap-1 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    {FAMILY_LABELS[calc.familyId]}
                  </Badge>
                  {calc.professionalSignoffRequired && (
                    <Badge variant="secondary" className="text-xs">
                      <ShieldCheck className="h-3 w-3 mr-1" />
                      Sign-off
                    </Badge>
                  )}
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Calculator input form */}
      {selectedCalc && !result && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calculator className="h-5 w-5" />
                  {selectedCalc.label}
                </CardTitle>
                <CardDescription>{selectedCalc.description}</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={resetCalc}>
                Back
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedCalc.requiredInputs.map((key) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`input-${key}`}>
                  {String(key).replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
                  <span className="text-destructive ml-1">*</span>
                </Label>
                <Input
                  id={`input-${key}`}
                  value={inputs[key] ?? ''}
                  onChange={(e) => setInputs((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder={`Enter ${String(key)}`}
                />
              </div>
            ))}
            {selectedCalc.optionalInputs?.map((key) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`input-${key}`}>
                  {String(key).replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
                </Label>
                <Input
                  id={`input-${key}`}
                  value={inputs[key] ?? ''}
                  onChange={(e) => setInputs((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder={`Enter ${String(key)} (optional)`}
                />
              </div>
            ))}
            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <XCircle className="h-4 w-4" />
                {error}
              </div>
            )}
          </CardContent>
          <CardFooter className="gap-2">
            <Button onClick={handleRun} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {running ? 'Calculating...' : 'Run Calculation'}
            </Button>
            <Button variant="outline" onClick={resetCalc}>
              Cancel
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Results */}
      {result && selectedCalc && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Badge variant={RISK_BADGE[result.riskStatus].variant}>
                  {RISK_BADGE[result.riskStatus].label}
                </Badge>
                {selectedCalc.label}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={resetCalc}>
                New Calculation
              </Button>
            </div>
            <CardDescription>
              Run {result.id.slice(0, 12)}... — {new Date(result.createdAt).toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Numeric results */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {Object.entries(result.results).map(([key, value]) => (
                <div key={key} className="bg-muted/50 rounded-lg p-3">
                  <div className="text-xs text-muted-foreground">
                    {String(key).replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
                  </div>
                  <div className="text-lg font-semibold">
                    {typeof value === 'number' ? value.toLocaleString() : String(value)}
                  </div>
                </div>
              ))}
            </div>

            <Separator />

            {/* Assumptions */}
            {result.assumptions.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-1">Assumptions</div>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                  {result.assumptions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Agent notes */}
            {agentNotes.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium">Agent Guidance</div>
                {agentNotes.map((note, i) => (
                  <div
                    key={i}
                    className={cn(
                      'flex items-start gap-2 text-xs p-2 rounded',
                      note.severity === 'blocker' && 'bg-destructive/10 text-destructive',
                      note.severity === 'warning' && 'bg-yellow-500/10 text-yellow-600',
                      note.severity === 'info' && 'bg-primary/10 text-primary',
                    )}
                  >
                    {note.severity === 'blocker' && <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                    {note.severity === 'warning' && <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />}
                    {note.severity === 'info' && <Info className="h-4 w-4 mt-0.5 shrink-0" />}
                    <span>{note.message}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Next actions */}
            {result.nextRecommendedActions.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-1">Recommended Next Actions</div>
                <ul className="text-xs space-y-1">
                  {result.nextRecommendedActions.map((action, i) => (
                    <li key={i} className="flex items-center gap-1">
                      <ArrowRight className="h-3 w-3 text-primary" />
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Sign-off warning */}
            {result.professionalSignoffRequired && (
              <div className="flex items-center gap-2 text-sm text-yellow-600 bg-yellow-50 dark:bg-yellow-950/20 p-2 rounded">
                <ShieldCheck className="h-4 w-4" />
                Professional sign-off required before statutory or final design use.
              </div>
            )}
          </CardContent>
          <CardFooter className="flex gap-2 flex-wrap">
            <div className="text-sm font-medium mr-2">Export to:</div>
            {result.exportTargets.map((target) => (
              <Button
                key={target}
                variant="outline"
                size="sm"
                onClick={() => onExport?.(result, target)}
              >
                <Download className="h-3 w-3 mr-1" />
                {EXPORT_LABELS[target] ?? target}
              </Button>
            ))}
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
