import { phaseToolSummary, recommendTools } from './comprehensiveToolRegistryService';
import { createPlantAllocation, createProcurementPackage, createStaffActivityLog, routeToolRunToProjectObject, suggestNextTools } from './workflowToolAgentService';
import type { ToolContext } from '@/types/comprehensiveToolsets';

const contractorContext: ToolContext = {
  projectId: 'project_architex_demo',
  tenderPackageId: 'tender_001',
  userId: 'contractor_user_001',
  role: 'contractor',
  phase: 'construction_execution',
  municipality: 'City of Johannesburg',
  costCode: '03-CONCRETE',
  locationZone: 'Ground floor slab',
  sourceReferences: ['A-201 Rev C', 'S-101 Rev B'],
};

console.log('Suggested tools:', suggestNextTools(contractorContext, { type: 'site_note', text: 'Concrete pour delayed because pump truck arrived late and extra labour stayed overtime' }));

const labourRun = createStaffActivityLog(contractorContext, {
  workerId: 'worker_001',
  workerName: 'Demo Worker',
  date: '2026-06-02',
  startTime: '07:00',
  endTime: '17:00',
  activity: 'Concrete pour overtime',
  costCode: '03-CONCRETE',
  locationZone: 'Ground floor slab',
  quantityCompleted: 36.9,
  unit: 'm3',
  gpsConfirmed: true,
  photoRefs: ['photo_001'],
});

const plantRun = createPlantAllocation(contractorContext, {
  assetId: 'plant_pump_001',
  assetLabel: 'Concrete pump truck',
  date: '2026-06-02',
  projectId: 'project_architex_demo',
  costCode: '03-CONCRETE',
  hoursUsed: 5.5,
  internalHireRatePerHour: 850,
  fuelLitres: 22,
  operatorId: 'operator_001',
});

const procurementContext: ToolContext = { ...contractorContext, phase: 'tender_procurement' };
const procurementRun = createProcurementPackage(procurementContext, {
  packageId: 'pkg_blocks_001',
  title: 'Blockwork material RFQ',
  costCode: '04-MASONRY',
  items: [{ description: '140mm concrete blocks', quantity: 1850, unit: 'each', targetRate: 14.5 }],
  invitedSuppliersOrSubcontractors: ['supplier_a', 'supplier_b'],
  requiredByDate: '2026-07-15',
  complianceDocumentsRequired: ['VAT invoice', 'delivery note', 'B-BBEE certificate if applicable'],
});

console.log('Labour run approval:', labourRun.approvalState, routeToolRunToProjectObject(labourRun));
console.log('Plant run approval:', plantRun.approvalState, routeToolRunToProjectObject(plantRun));
console.log('Procurement routes:', routeToolRunToProjectObject(procurementRun));
console.log('Architect phase summary:', phaseToolSummary('architect'));
console.log('Payment recommendations:', recommendTools({ ...contractorContext, phase: 'payments_commercial_control' }, 'prepare payment certificate with retention and escrow release'));
