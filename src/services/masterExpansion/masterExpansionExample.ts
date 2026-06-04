import { createDrawingRevisionRecord } from '@/services/masterExpansion/documentIntelligenceService';
import { createKnowledgeSourceRecord } from '@/services/masterExpansion/knowledgeHubService';
import { createCandidateProfessionalListing } from '@/services/masterExpansion/marketplaceService';
import { createEscrowMilestone } from '@/services/masterExpansion/financeControlService';
import { createQuoteComparisonRecord } from '@/services/masterExpansion/procurementService';
import { createSiteDiaryRecord } from '@/services/masterExpansion/siteExecutionService';
import { buildLifecycleState } from '@/services/masterExpansion/projectLifecycleEngine';
import { buildProjectPassportSummary } from '@/services/masterExpansion/projectPassportService';
import { detectProjectRisks } from '@/services/masterExpansion/riskEngineService';
import { modulesForPhase } from '@/services/masterExpansion/moduleRegistry';
import { navigationZonesForRole, workspaceRoutesForContext } from '@/services/masterExpansion/navigationConfig';

const tenantId = 'tenant_architex_demo';
const projectId = 'project_master_demo';
const userId = 'user_leor_demo';

const records = [
  createDrawingRevisionRecord({ tenantId, projectId, userId, fileName: 'A-100.pdf', drawingNumber: 'A-100', revision: 'P01' }),
  createKnowledgeSourceRecord({ tenantId, projectId, userId, sourceTitle: 'SANS 10400 submission note', sourceType: 'NBR_SANS', summary: 'Reviewed source-linked guidance required before agent answers cite it.' }),
  createCandidateProfessionalListing({ tenantId, projectId, userId, discipline: 'architectural technology' }),
  createEscrowMilestone({ tenantId, projectId, userId, amountZar: 25000, label: 'Concept design approval milestone' }),
  createQuoteComparisonRecord({ tenantId, projectId, userId, packageName: 'aluminium windows', quoteCount: 3 }),
  createSiteDiaryRecord({ tenantId, projectId, userId, labourCount: 12, delays: ['late delivery of windows'] }),
];

const lifecycle = buildLifecycleState({ tenantId, projectId, currentPhase: 'construction_execution', records });
const passport = buildProjectPassportSummary(lifecycle, records);
const risks = detectProjectRisks(records);
const constructionModules = modulesForPhase('construction_execution');

console.log('Master expansion records created:');
console.log(records.map((record) => `${record.moduleKey}:${record.recordType}`).join(' | '));

console.log('\nProject Passport phase:');
console.log(passport.currentPhase);

console.log('\nMissing required records:');
console.log(passport.missingRequiredRecords.join(' | ') || 'none');

console.log('\nNext best action:');
console.log(passport.nextBestActions[0]);

console.log('\nRisk findings:');
console.log(risks.map((risk) => `${risk.severity}:${risk.code}`).join(' | '));

console.log('\nConstruction phase modules:');
console.log(constructionModules.map((module) => module.label).join(' | '));

console.log('\nUpdated architect sidebar zones:');
console.log(navigationZonesForRole('architect').map((zone) => zone.label).join(' | '));

console.log('\nConstruction workspace routes for architect:');
console.log(workspaceRoutesForContext('construction_execution', 'architect').map((route) => route.routeLabel).join(' | '));
