import { recommendToolboxCalculators, reviewCalculatorRun } from './toolboxAgentService';
import { runCalculator } from './toolboxCalculatorService';
import type { ToolboxContext } from '@/types/toolboxCalculators';

const context: ToolboxContext = {
  projectId: 'project_demo_001',
  tenderPackageId: 'tender_demo_001',
  userId: 'user_demo_contractor',
  role: 'contractor',
  phase: 'tender',
  municipality: 'City of Johannesburg',
  locationZone: 'Ground floor / Grid A-C',
  sourceReferences: ['A-201 Rev B', 'BOQ draft v0'],
};

console.log('Recommendations:', recommendToolboxCalculators(context, 'Prepare bid rate and concrete quantity for slab pour'));

const concrete = runCalculator('concrete_order', context, {
  elements: [
    { label: 'Ground floor slab', lengthM: 18, widthM: 10, depthM: 0.15 },
    { label: 'Strip footing', lengthM: 42, widthM: 0.6, depthM: 0.3 },
  ],
  wastePercent: 7,
  truckCapacityM3: 6,
});

const rate = runCalculator('tender_rate_buildup', context, {
  quantity: concrete.results.grossOrderVolumeM3,
  unit: 'm3',
  materialUnitCost: 1450,
  labourUnitCost: 280,
  plantUnitCost: 120,
  overheadPercent: 8,
  profitPercent: 10,
  riskPercent: 3,
});

const xaContext: ToolboxContext = { ...context, role: 'bep', phase: 'design_development', userId: 'user_demo_bep' };
const xa = runCalculator('xa_fenestration_quick_check', xaContext, {
  buildingType: 'residential',
  energyZone: 2,
  orientation: 'W',
  wallAreaM2: 80,
  glazedAreaM2: 18,
  averageSHGC: 0.72,
  shadingFactor: 0.95,
});

console.log('Concrete result:', concrete.results);
console.log('Rate result:', rate.results);
console.log('XA result:', xa.results, xa.riskStatus);
console.log('Agent review:', [...reviewCalculatorRun(concrete), ...reviewCalculatorRun(rate), ...reviewCalculatorRun(xa)]);
