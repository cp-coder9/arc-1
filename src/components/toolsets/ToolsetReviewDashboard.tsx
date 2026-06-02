import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { UserProfile } from '@/types';
import type { ArchitexUserRole, ArchitexWorkflowPhase, ToolContext } from '@/types/comprehensiveToolsets';
import type { ToolboxContext, ToolboxUserRole } from '@/types/toolboxCalculators';
import { phaseToolSummary, recommendTools } from '@/services/toolsets/comprehensiveToolRegistryService';
import { listCalculatorsForContext, runCalculator } from '@/services/toolsets/toolboxCalculatorService';

const roleMap: Record<string, ArchitexUserRole> = {
  client: 'client',
  architect: 'architect',
  admin: 'platform_admin',
};

const calculatorRoleMap: Record<string, ToolboxUserRole> = {
  client: 'architect',
  architect: 'architect',
  admin: 'admin',
};

const defaultPhaseByRole: Record<string, ArchitexWorkflowPhase> = {
  client: 'brief_feasibility',
  architect: 'design_coordination',
  admin: 'operations_post_occupancy',
};

interface ToolsetReviewDashboardProps {
  user: UserProfile;
}

export default function ToolsetReviewDashboard({ user }: ToolsetReviewDashboardProps) {
  const toolRole = roleMap[user.role] ?? 'architect';
  const phase = defaultPhaseByRole[user.role] ?? 'design_coordination';
  const toolContext: ToolContext = {
    userId: user.uid,
    role: toolRole,
    phase,
    municipality: 'South Africa',
    sourceReferences: ['Amy/Greg implementation pack v0.1'],
  };
  const calculatorContext: ToolboxContext = {
    userId: user.uid,
    role: calculatorRoleMap[user.role] ?? 'architect',
    phase,
    municipality: 'South Africa',
    sourceReferences: ['Amy/Greg BEP calculator toolbox v0.1'],
  };

  const recommendedTools = recommendTools(toolContext, 'drawing compliance tender boq site log invoice resource marketplace workflow');
  const calculators = listCalculatorsForContext(calculatorContext);
  const exampleConcreteRun = runCalculator('concrete_order', calculatorContext, {
    elements: [{ label: 'Strip foundation allowance', lengthM: 10, widthM: 0.6, depthM: 0.25, count: 1 }],
    wastePercent: 7,
    truckCapacityM3: 6,
  });
  const phaseSummary = Object.entries(phaseToolSummary(toolRole)).map(([phaseName, toolIds]) => ({
    phase: phaseName,
    toolCount: toolIds.length,
  }));

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3">
        <Badge className="w-fit bg-primary/10 text-primary border-primary/20">Amy / Greg toolset pack</Badge>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Role-aware Architex toolsets</h1>
        <p className="text-muted-foreground max-w-3xl">
          Registry-driven launchpad for the comprehensive user toolset and BEP/contractor calculator toolbox. AI outputs stay as guarded pre-checks and every run is designed to carry source snapshots, role context and review state before export.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{recommendedTools.length} recommended tools</CardTitle>
            <CardDescription>Matched to {toolRole} during {phase.replaceAll('_', ' ')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recommendedTools.slice(0, 4).map((item) => (
              <div key={item.id} className="rounded-xl border border-border bg-white p-3">
                <div className="font-semibold text-sm">{item.toolId.replaceAll('_', ' ')}</div>
                <div className="text-xs text-muted-foreground">{item.reason}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{calculators.length} calculators available</CardTitle>
            <CardDescription>Includes XA, stormwater, concrete, blockwork, rate build-up and productivity calculators</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {calculators.slice(0, 5).map((calculator) => (
              <div key={calculator.id} className="flex items-center justify-between gap-3 rounded-lg bg-secondary/40 px-3 py-2">
                <span className="text-sm font-medium">{calculator.label}</span>
                <Badge variant="secondary">{calculator.useClass.replaceAll('_', ' ')}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Guarded sample run</CardTitle>
            <CardDescription>Concrete ordering example with professional review flags</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-xl bg-secondary/50 p-4">
              <div className="text-muted-foreground">Risk status</div>
              <div className="font-bold uppercase">{exampleConcreteRun.riskStatus}</div>
            </div>
            <div className="rounded-xl bg-secondary/50 p-4">
              <div className="text-muted-foreground">Professional sign-off required</div>
              <div className="font-bold">{exampleConcreteRun.professionalSignoffRequired ? 'Yes' : 'No'}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Implementation coverage by workflow phase</CardTitle>
          <CardDescription>Imported from the comprehensive manifest starter registry</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {phaseSummary.slice(0, 8).map((phaseItem) => (
            <div key={phaseItem.phase} className="rounded-xl border border-border p-4">
              <div className="font-semibold capitalize">{phaseItem.phase.replaceAll('_', ' ')}</div>
              <div className="text-sm text-muted-foreground">{phaseItem.toolCount} tools mapped</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button disabled>Persist ToolRun to Firestore</Button>
        <Button variant="outline" disabled>Export to tender / site / payment objects</Button>
        <p className="text-xs text-muted-foreground self-center">Next integration step: connect these disabled actions to authenticated project objects and approval workflows.</p>
      </div>
    </div>
  );
}
