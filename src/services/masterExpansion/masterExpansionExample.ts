import { createDrawingRevisionRecord } from '@/services/masterExpansion/documentIntelligenceService';
import { createKnowledgeSourceRecord } from '@/services/masterExpansion/knowledgeHubService';
import { createCandidateProfessionalListing } from '@/services/masterExpansion/marketplaceService';
import { createEscrowMilestone } from '@/services/masterExpansion/financeControlService';
import { createQuoteComparisonRecord } from '@/services/masterExpansion/procurementService';
import { createSiteDiaryRecord } from '@/services/masterExpansion/siteExecutionService';
import { buildLifecycleState } from '@/services/masterExpansion/projectLifecycleEngine';
import {
  buildProjectPassport,
  buildProjectPassportSummary,
  calculateReadinessScore,
} from '@/services/masterExpansion/projectPassportService';
import { detectProjectRisks } from '@/services/masterExpansion/riskEngineService';
import { workflowEventsFromProjectState } from '@/services/masterExpansion/inboxEventService';
import { recommendationsFromPassport } from '@/services/masterExpansion/agentRecommendationService';
import { modulesForPhase } from '@/services/masterExpansion/moduleRegistry';
import {
  navigationZonesForRole,
  workspaceRoutesForContext,
} from '@/services/masterExpansion/navigationConfig';
import type { ProjectMetadata } from '@/types/architexMasterTypes';

const tenantId = 'tenant_architex_demo';
const projectId = 'project_master_demo';
const userId = 'user_leor_demo';

const records = [
  createDrawingRevisionRecord({
    tenantId,
    projectId,
    userId,
    fileName: 'A-100.pdf',
    drawingNumber: 'A-100',
    revision: 'P01',
  }),
  createKnowledgeSourceRecord({
    tenantId,
    projectId,
    userId,
    sourceTitle: 'SANS 10400 submission note',
    sourceType: 'NBR_SANS',
    summary:
      'Reviewed source-linked guidance required before agent answers cite it.',
  }),
  createCandidateProfessionalListing({
    tenantId,
    projectId,
    userId,
    discipline: 'architectural technology',
  }),
  createEscrowMilestone({
    tenantId,
    projectId,
    userId,
    amountZar: 25000,
    label: 'Concept design approval milestone',
  }),
  createQuoteComparisonRecord({
    tenantId,
    projectId,
    userId,
    packageName: 'aluminium windows',
    quoteCount: 3,
  }),
  createSiteDiaryRecord({
    tenantId,
    projectId,
    userId,
    labourCount: 12,
    delays: ['late delivery of windows'],
  }),
];

// Metadata for enhanced passport building
const metadata: ProjectMetadata = {
  tenantId,
  projectId,
  projectName: 'Sandton Mixed-Use Upgrade',
  clientName: 'Demo Client Developments (Pty) Ltd',
  municipality: 'City of Johannesburg',
  propertyReference: 'Erf 1234 Sandton',
  propertyUse: 'Mixed-use commercial/residential alteration and addition',
  landUseNotes:
    'Confirm zoning, parking, building line and rights before submission.',
  currentPhase: 'construction_execution',
  leadProfessionalRole: 'architect',
};

// ── Original pipeline (backward compatible) ──────────────────────────────

const lifecycle = buildLifecycleState({
  tenantId,
  projectId,
  currentPhase: 'construction_execution',
  records,
});
const basicPassport = buildProjectPassportSummary(lifecycle, records);
const risks = detectProjectRisks(records);

console.log('=== Master Expansion Pipeline ===\n');

console.log('Records created:');
console.log(records.map((r) => `${r.moduleKey}:${r.recordType}`).join(' | '));

console.log('\n--- Basic Passport ---');
console.log(`Phase: ${basicPassport.currentPhase}`);
console.log(`Missing required: ${basicPassport.missingRequiredRecords.join(' | ') || 'none'}`);
console.log(`Next action: ${basicPassport.nextBestActions[0]}`);

console.log('\n--- Risk Findings ---');
console.log(risks.map((r) => `${r.severity}: ${r.code}`).join('\n'));

// ── Enhanced pipeline (Pack 2) ───────────────────────────────────────────

console.log('\n=== Enhanced Pack 2 Pipeline ===\n');

const passport = buildProjectPassport(metadata, records);

console.log('--- Full Project Passport ---');
console.log(`Project: ${passport.projectName}`);
console.log(`Client: ${passport.clientName}`);
console.log(`Phase: ${passport.currentPhase}`);
console.log(`Municipality: ${passport.municipality}`);
console.log(`Approval status: ${passport.approvalStatus}`);
console.log(`Document status: ${passport.documentStatus}`);
console.log(`Financial status: ${passport.financialStatus}`);
console.log(`Risk level: ${passport.riskLevel}`);
console.log(
  `Appointments: ${(passport.appointments ?? []).map((a) => `${a.role}:${a.appointedParty}`).join(' | ') || 'none'}`,
);

console.log('\n--- Lifecycle Evaluation ---');
const lc = passport.lifecycle!;
console.log(`Required: ${lc.requiredRecordTypes.join(' | ')}`);
console.log(`Present: ${lc.presentRequiredRecordTypes.join(' | ')}`);
console.log(
  `Missing: ${lc.missingRecords.map((m) => `${m.priority}:${m.recordType}`).join(' | ') || 'none'}`,
);
console.log(`May advance: ${lc.mayAdvance}`);
console.log(`Blockers:\n  ${lc.blockers.join('\n  ') || 'none'}`);
console.log(`Next actions:\n  ${lc.nextBestActions.join('\n  ')}`);

console.log(`\nReadiness score: ${calculateReadinessScore(passport)}/100`);

// ── Inbox Events ─────────────────────────────────────────────────────────

const events = workflowEventsFromProjectState(metadata, records);
console.log('\n--- Inbox Events ---');
for (const evt of events.slice(0, 5)) {
  console.log(
    `  [${evt.priority}] ${evt.type}: ${evt.title} → ${evt.assignedRoles.join(', ')}`,
  );
}
console.log(`  ... ${events.length} total events`);

// ── Agent Recommendations ────────────────────────────────────────────────

const recommendations = recommendationsFromPassport(passport, events);
console.log('\n--- Agent Recommendations ---');
for (const rec of recommendations.slice(0, 5)) {
  console.log(
    `  [${rec.priority}] ${rec.title} | human_approval=${rec.requiresHumanApproval} | route=${rec.relatedRoute}`,
  );
}
console.log(`  ... ${recommendations.length} total recommendations`);

// ── Navigation & Modules ─────────────────────────────────────────────────

const constructionModules = modulesForPhase('construction_execution');
console.log('\n--- Construction Phase Modules ---');
console.log(constructionModules.map((m) => m.label).join(' | '));

console.log('\n--- Architect Sidebar Zones ---');
console.log(
  navigationZonesForRole('architect')
    .map((z) => z.label)
    .join(' | '),
);

console.log('\n--- Construction Workspace Routes (Architect) ---');
console.log(
  workspaceRoutesForContext('construction_execution', 'architect')
    .map((r) => r.routeLabel)
    .join(' | '),
);

// ── Validation assertions ─────────────────────────────────────────────────

console.log('\n=== Validation ===');

const checks: [string, boolean][] = [
  ['Passport has project name', passport.projectName !== undefined],
  ['Passport has municipality', passport.municipality !== undefined],
  ['Passport has risk level', passport.riskLevel !== undefined],
  ['Lifecycle has blockers', lc.blockers.length > 0],
  ['Lifecycle has next actions', lc.nextBestActions.length > 0],
  ['Risks detected', risks.length > 0],
  ['Inbox events generated', events.length > 0],
  ['Agent recommendations generated', recommendations.length > 0],
  ['Readiness score calculated', calculateReadinessScore(passport) >= 0],
];

let failures = 0;
for (const [label, passed] of checks) {
  const status = passed ? '✅' : '❌';
  if (!passed) failures++;
  console.log(`${status} ${label}`);
}

if (failures > 0) {
  console.log(`\n❌ ${failures} validation check(s) failed.`);
  process.exit(1);
} else {
  console.log('\n✅ All validation checks passed.');
}
