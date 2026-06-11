/**
 * Documents + Drawing Intelligence Demo
 *
 * Runnable example that exercises all services and validates
 * the acceptance criteria from the module specification.
 *
 * Run: npx tsx src/examples/documentsDrawingExample.ts
 */

import { recommendationsFromDocumentState } from '@/services/agentRecommendationService';
import { registerSummary } from '@/services/documentRegistrationService';
import { analyseDocuments } from '@/services/drawingIntelligenceService';
import { workflowEventsFromReadiness } from '@/services/inboxEventAdapter';
import { projectRecordsFromDocuments } from '@/services/projectRecordAdapter';
import { allReadinessReports } from '@/services/readinessCheckService';
import { supersededConstructionDrawings } from '@/services/revisionControlService';
import {
  projectId,
  sampleDocuments,
  sampleDrawings,
} from '@/services/sampleDocumentData';

console.log('═══════════════════════════════════════════════');
console.log('  Architex Documents + Drawing Intelligence');
console.log('  Module Demo');
console.log('═══════════════════════════════════════════════');

const docs = sampleDocuments;
const dwgs = sampleDrawings;

// ── 1. Register Summary ──
console.log('\n📋 Document & Drawing Register');
console.log(registerSummary(docs, dwgs));

// ── 2. Drawing Intelligence ──
console.log('\n🔍 Drawing Intelligence (Simulated OCR/AI)');
const intelligenceResults = analyseDocuments(docs, dwgs);
for (const result of intelligenceResults) {
  console.log(
    `  ${result.documentId}: ${result.classification}/${result.detectedDiscipline} ` +
    `rev=${result.extractedRevision ?? 'n/a'} confidence=${result.confidence.toFixed(2)} ` +
    `findings=${result.findings.length}`,
  );
}

// ── 3. Readiness Reports ──
console.log('\n✅ Readiness Reports');
const readinessReports = allReadinessReports(docs, dwgs);
for (const report of readinessReports) {
  const status = report.ready ? '✓ READY' : '✗ NOT READY';
  console.log(
    `  ${report.checkName}: ${status} (${report.findings.length} findings)`,
  );
  for (const finding of report.findings) {
    console.log(`    [${finding.priority}] ${finding.code}: ${finding.message}`);
  }
}

// ── 4. Superseded Drawings ──
console.log('\n🚫 Superseded Construction Drawings');
const superseded = supersededConstructionDrawings(dwgs);
if (superseded.length === 0) {
  console.log('  None found');
} else {
  for (const d of superseded) {
    console.log(`  ${d.drawingNumber} rev ${d.currentRevision}: ${d.title}`);
  }
}

// ── 5. ProjectRecords ──
console.log('\n📦 ProjectRecord Outputs');
const projectRecords = projectRecordsFromDocuments(docs, dwgs);
for (const record of projectRecords) {
  console.log(`  ${record.recordType}: ${record.title} [${record.status}]`);
}

// ── 6. Inbox Events ──
console.log('\n📬 Inbox Events');
const events = workflowEventsFromReadiness(projectId, readinessReports);
for (const event of events) {
  console.log(
    `  [${event.priority}] ${event.eventType} → ${event.recipientRole}`,
  );
}

// ── 7. Agent Recommendations ──
console.log('\n🤖 Agent Recommendations');
const recommendations = recommendationsFromDocumentState(projectId, readinessReports, events);
for (const rec of recommendations) {
  const approval = rec.urgency === 'immediate' ? '🔒 Human approval required' : '✓ Auto-actionable';
  console.log(`  [${rec.severity}] ${rec.title} — ${approval}`);
}

// ── 8. Validation ──
console.log('\n═══════════════════════════════════════════════');
console.log('  Acceptance Criteria Validation');
console.log('═══════════════════════════════════════════════');

const errors: string[] = [];

if (superseded.length === 0) {
  errors.push('FAIL: Demo should detect a superseded construction drawing.');
}

const municipal = readinessReports.find((r) => r.checkName === 'municipal_submission');
if (!municipal || municipal.ready) {
  errors.push('FAIL: Municipal readiness should be incomplete in demo.');
}

const tender = readinessReports.find((r) => r.checkName === 'tender_pack');
if (!tender || tender.ready) {
  errors.push('FAIL: Tender readiness should be incomplete in demo.');
}

const closeout = readinessReports.find((r) => r.checkName === 'closeout_pack');
if (!closeout || closeout.ready) {
  errors.push('FAIL: Closeout readiness should be incomplete in demo.');
}

if (projectRecords.length !== docs.length) {
  errors.push(`FAIL: Expected ${docs.length} ProjectRecords, got ${projectRecords.length}.`);
}

if (events.length === 0) {
  errors.push('FAIL: Readiness findings should emit inbox events.');
}

const hasApprovalRecs = recommendations.some((r) => r.urgency === 'immediate');
if (!hasApprovalRecs) {
  errors.push('FAIL: Recommendations should include human-approval guardrails.');
}

if (errors.length > 0) {
  console.log('\n❌ VALIDATION FAILURES:');
  for (const error of errors) {
    console.log(`  ${error}`);
  }
  process.exit(1);
}

console.log('\n✓ All acceptance criteria passed.');
console.log('  - Demo builds document and drawing registers');
console.log('  - Demo detects superseded construction drawings');
console.log('  - Demo detects incomplete municipal/tender/closeout packs');
console.log('  - Demo emits ProjectRecord outputs');
console.log('  - Demo emits Platform Spine-compatible inbox events');
console.log('  - Demo emits agent-ready recommendations');
console.log('  - Human-approval guardrails present');
console.log('\n✅ Documents + Drawing Intelligence demo completed successfully.');
