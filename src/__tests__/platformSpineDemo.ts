/**
 * Architex Platform Spine — Validation Demo
 *
 * Runs the complete spine pipeline for every role and asserts expected
 * behaviour.  Designed to be executed directly via `npx tsx` or as a
 * Vitest test.  When all assertions pass the spine is correctly wired.
 *
 * Usage:
 *   npx tsx src/__tests__/platformSpineDemo.ts
 *
 * @see ARCHITEX_PLATFORM_SPINE_BRIEF.md — acceptance criteria
 */

import { DEMO_PROJECT_PASSPORT, DEMO_USERS, DEMO_WORKFLOW_EVENTS } from '../data/platformSpineSampleData';
import { buildPlatformSpineSnapshot } from '../services/platformSpineService';

// ── Run Demo ────────────────────────────────────────────────────────────────

let failures = 0;

for (const user of DEMO_USERS) {
  const snapshot = buildPlatformSpineSnapshot(
    user,
    DEMO_PROJECT_PASSPORT,
    DEMO_WORKFLOW_EVENTS,
  );

  console.log(`\n=== ${user.displayName} (${user.role}) ===`);
  console.log(
    `Navigation: ${snapshot.navigationZones.map((z) => z.label).join(' | ')}`,
  );
  console.log(
    `Workspace routes: ${snapshot.workspaceRoutes.map((r) => r.routeLabel).join(' | ')}`,
  );
  console.log(
    `Inbox: ${snapshot.inboxItems.map((i) => `${i.priority}:${i.title}`).join(' || ') || 'none'}`,
  );
  console.log(
    `Agent recommendations: ${snapshot.recommendations.map((r) => `${r.priority}:${r.title}`).join(' || ') || 'none'}`,
  );
}

// ── Assertions ──────────────────────────────────────────────────────────────

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    failures++;
  } else {
    console.log(`  ✓ ${message}`);
  }
}

console.log('\n── Assertions ──');

// Architect assertions
const architect = DEMO_USERS.find((u) => u.role === 'architect');
if (!architect) throw new Error('Architect demo user missing');
const archSnapshot = buildPlatformSpineSnapshot(
  architect,
  DEMO_PROJECT_PASSPORT,
  DEMO_WORKFLOW_EVENTS,
);

assert(
  archSnapshot.navigationZones.some((z) => z.id === 'knowledge'),
  'Knowledge zone should be visible to architect',
);
assert(
  archSnapshot.navigationZones.some((z) => z.id === 'cpd_learning'),
  'CPD & Learning zone should be visible to architect',
);
assert(
  archSnapshot.workspaceRoutes.some((r) => r.id === 'site'),
  'Site Execution route should be visible to architect during construction',
);
assert(
  archSnapshot.inboxItems.length > 0,
  'Architect should have inbox items from workflow events',
);
assert(
  archSnapshot.recommendations.length > 0,
  'Architect should have agent recommendations',
);

// Supplier assertions — should NOT see CPD or professional toolboxes
const supplier = DEMO_USERS.find((u) => u.role === 'supplier');
if (!supplier) throw new Error('Supplier demo user missing');
const suppSnapshot = buildPlatformSpineSnapshot(
  supplier,
  DEMO_PROJECT_PASSPORT,
  DEMO_WORKFLOW_EVENTS,
);

assert(
  !suppSnapshot.navigationZones.some((z) => z.id === 'cpd_learning'),
  'CPD & Learning should NOT be visible to supplier',
);
assert(
  !suppSnapshot.navigationZones.some((z) => z.id === 'toolboxes'),
  'Toolboxes should NOT be visible to supplier',
);
assert(
  suppSnapshot.navigationZones.some((z) => z.id === 'marketplace'),
  'Marketplace should be visible to supplier',
);

// Contractor assertions — should see finance but not CPD
const contractor = DEMO_USERS.find((u) => u.role === 'contractor');
if (!contractor) throw new Error('Contractor demo user missing');
const contSnapshot = buildPlatformSpineSnapshot(
  contractor,
  DEMO_PROJECT_PASSPORT,
  DEMO_WORKFLOW_EVENTS,
);

assert(
  contSnapshot.navigationZones.some((z) => z.id === 'finance'),
  'Finance should be visible to contractor',
);
assert(
  !contSnapshot.navigationZones.some((z) => z.id === 'cpd_learning'),
  'CPD & Learning should NOT be visible to contractor',
);

// Admin assertions — should see everything
const admin = DEMO_USERS.find((u) => u.role === 'admin');
if (!admin) throw new Error('Admin demo user missing');
const adminSnapshot = buildPlatformSpineSnapshot(
  admin,
  DEMO_PROJECT_PASSPORT,
  DEMO_WORKFLOW_EVENTS,
);

assert(
  adminSnapshot.navigationZones.length === 11,
  `Admin should see all 11 navigation zones, saw ${adminSnapshot.navigationZones.length}`,
);
assert(
  adminSnapshot.inboxItems.length === 5,
  `Admin should see all 5 inbox items, saw ${adminSnapshot.inboxItems.length}`,
);

// Candidate professional — should see CPD but not finance
const candidate = DEMO_USERS.find((u) => u.role === 'candidate_professional');
if (!candidate) throw new Error('Candidate professional demo user missing');
const candSnapshot = buildPlatformSpineSnapshot(
  candidate,
  DEMO_PROJECT_PASSPORT,
  DEMO_WORKFLOW_EVENTS,
);

assert(
  candSnapshot.navigationZones.some((z) => z.id === 'cpd_learning'),
  'CPD & Learning should be visible to candidate professional',
);
assert(
  !candSnapshot.navigationZones.some((z) => z.id === 'finance'),
  'Finance should NOT be visible to candidate professional',
);

// ── Summary ─────────────────────────────────────────────────────────────────

console.log('\n── Summary ──');
if (failures === 0) {
  console.log('Validation summary: platform spine demo completed successfully.');
} else {
  console.error(`Validation FAILED with ${failures} assertion(s).`);
  process.exit(1);
}
