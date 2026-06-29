import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_WORKSPACE, can, visibleItemsForRole, budgetSummary, createIssueSnapshot, validateIssueReadiness } from '../src/specificationDomain.mjs';
import { generateInteractiveSpecDocument } from '../src/documentGenerator.mjs';
import { mapSpecWorkspaceToOpenProject } from '../src/openProjectConnector.mjs';

test('role matrix allows clients to approve decisions but not edit specs', () => {
  assert.equal(can('client','approve_client_decision'), true);
  assert.equal(can('client','edit_spec'), false);
  assert.equal(can('architect','issue_spec'), true);
});

test('client role only sees client decision or already approved/issued items', () => {
  const visible = visibleItemsForRole(SAMPLE_WORKSPACE, 'client');
  assert.ok(visible.length > 0);
  assert.ok(visible.every(i => i.clientDecision || ['approved','issued'].includes(i.status)));
});

test('budget summary detects over-budget, long lead and stale items', () => {
  const summary = budgetSummary(SAMPLE_WORKSPACE.items);
  assert.ok(summary.delta > 0);
  assert.ok(summary.overBudgetItems.includes('item-wall-tile-001'));
  assert.ok(summary.longLeadItems.includes('item-pendant-001'));
  assert.ok(summary.staleItems.includes('item-counter-001'));
});

test('readiness validation blocks superseded items before issue', () => {
  const findings = validateIssueReadiness(SAMPLE_WORKSPACE);
  assert.ok(findings.some(f => f.severity === 'blocker' && f.itemId === 'item-counter-001'));
});

test('issued snapshot freezes data and includes audit hash', () => {
  const snap = createIssueSnapshot(SAMPLE_WORKSPACE, { userId: 'u-arch-1', role: 'architect', name: 'Architect' });
  assert.equal(snap.issueStatus, 'issued_snapshot');
  assert.ok(snap.auditHash.length >= 8);
  assert.throws(() => { snap.revision = 'MUTATED'; }, /read only|Cannot assign/);
});

test('interactive document has pictorial role chain data', () => {
  const doc = generateInteractiveSpecDocument(SAMPLE_WORKSPACE, { role: 'architect' });
  assert.ok(doc.pictorialItems.length >= 4);
  assert.ok(doc.pictorialItems[0].image.startsWith('data:image/svg+xml'));
  assert.ok(doc.pictorialItems.every(i => i.roleChain.owner));
});

test('OpenProject mapper creates one work package payload per section', () => {
  const payloads = mapSpecWorkspaceToOpenProject(SAMPLE_WORKSPACE, '/api/v3/projects/99');
  assert.equal(payloads.length, SAMPLE_WORKSPACE.sections.length);
  assert.equal(payloads[0]._links.project.href, '/api/v3/projects/99');
  assert.ok(payloads.some(p => p.customFields.staleSourceBlocker === true));
});
