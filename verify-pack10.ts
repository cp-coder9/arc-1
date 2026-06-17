// @ts-nocheck
/**
 * Pack 10 Verification Script
 * Runs all state machine and guardrail validations directly.
 * Usage: npx tsx verify-pack10.ts
 */
import {
  isValidNcrTransition, ncrBlocksPayment,
  isValidSnagTransition, snagBlocksPayment,
  isValidWarningTransition,
  isValidInstructionTransition, canIssueInstruction, canSupersedeInstruction,
} from './src/services/siteExecutionValidators';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.error(`  ✗ FAILED: ${label}`); }
}

function section(title: string) { console.log(`\n${title}`); }

// ─── NCR ────────────────────────────────────────────────
section('NCR Service');
assert(ncrBlocksPayment('high') === true, 'blocks payment for high');
assert(ncrBlocksPayment('critical') === true, 'blocks payment for critical');
assert(ncrBlocksPayment('low') === false, 'does not block for low');
assert(ncrBlocksPayment('medium') === false, 'does not block for medium');
assert(isValidNcrTransition('open', 'corrective_action_submitted') === true, 'open → corrective_action_submitted');
assert(isValidNcrTransition('open', 'rejected') === true, 'open → rejected');
assert(isValidNcrTransition('corrective_action_submitted', 'verified_closed') === true, 'corrective → verified_closed');
assert(isValidNcrTransition('corrective_action_submitted', 'open') === true, 'corrective → open (reset)');
assert(isValidNcrTransition('rejected', 'open') === true, 'rejected → open (reopen)');
assert(isValidNcrTransition('verified_closed', 'open') === false, 'verified_closed terminal (no reopen)');
assert(isValidNcrTransition('open', 'verified_closed') === false, 'open → verified_closed blocked');

// ─── Snag ───────────────────────────────────────────────
section('Snag Service');
assert(snagBlocksPayment('high') === true, 'blocks payment for high');
assert(snagBlocksPayment('critical') === true, 'blocks payment for critical');
assert(snagBlocksPayment('low') === false, 'does not block for low');
assert(isValidSnagTransition('open', 'allocated') === true, 'open → allocated');
assert(isValidSnagTransition('allocated', 'ready_for_reinspection') === true, 'allocated → ready_for_reinspection');
assert(isValidSnagTransition('ready_for_reinspection', 'closed') === true, 'ready → closed');
assert(isValidSnagTransition('ready_for_reinspection', 'allocated') === true, 'ready → allocated (back)');
assert(isValidSnagTransition('closed', 'open') === false, 'closed terminal');
assert(isValidSnagTransition('rejected', 'open') === true, 'rejected → open (reopen)');

// ─── Delay Warning ──────────────────────────────────────
section('Delay Warning Service');
assert(isValidWarningTransition('recorded', 'notice_required') === true, 'recorded → notice_required');
assert(isValidWarningTransition('recorded', 'closed') === true, 'recorded → closed');
assert(isValidWarningTransition('notice_required', 'under_review') === true, 'notice → under_review');
assert(isValidWarningTransition('notice_required', 'closed') === true, 'notice → closed');
assert(isValidWarningTransition('under_review', 'closed') === true, 'review → closed');
assert(isValidWarningTransition('closed', 'recorded') === false, 'closed terminal');
assert(isValidWarningTransition('recorded', 'under_review') === false, 'recorded → under_review blocked');

// ─── Site Instruction ───────────────────────────────────
section('Site Instruction Service');
assert(canIssueInstruction('architect') === true, 'architect can issue');
assert(canIssueInstruction('admin') === true, 'admin can issue');
assert(canIssueInstruction('contractor') === false, 'contractor cannot issue');
assert(canIssueInstruction('subcontractor') === false, 'subcontractor cannot issue');
assert(canSupersedeInstruction('admin') === true, 'admin can supersede');
assert(canSupersedeInstruction('architect') === false, 'architect cannot supersede');
assert(isValidInstructionTransition('draft', 'issued') === true, 'draft → issued');
assert(isValidInstructionTransition('draft', 'superseded') === true, 'draft → superseded');
assert(isValidInstructionTransition('issued', 'acknowledged') === true, 'issued → acknowledged');
assert(isValidInstructionTransition('issued', 'superseded') === true, 'issued → superseded');
assert(isValidInstructionTransition('acknowledged', 'superseded') === true, 'acknowledged → superseded');
assert(isValidInstructionTransition('superseded', 'draft') === false, 'superseded terminal');
assert(isValidInstructionTransition('draft', 'acknowledged') === false, 'draft → acknowledged blocked');

// ─── Guardrail Summary ──────────────────────────────────
section('Pack 10 Guardrails');
assert(ncrBlocksPayment('high') && snagBlocksPayment('high'), 'NCR + snag high severity block payment');
assert(!ncrBlocksPayment('low') && !snagBlocksPayment('low'), 'NCR + snag low severity do not block');
assert(canIssueInstruction('architect') && !canIssueInstruction('contractor'), 'instructions require authorised professional');
assert(!isValidNcrTransition('verified_closed', 'open'), 'NCR verified_closed is terminal');
assert(!isValidSnagTransition('closed', 'open'), 'Snag closed is terminal');
assert(!isValidWarningTransition('closed', 'recorded'), 'Warning closed is terminal');
assert(!isValidInstructionTransition('superseded', 'draft'), 'Instruction superseded is terminal');

// ─── Report ─────────────────────────────────────────────
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed === 0) {
  console.log('✅ All pack 10 validators pass!');
  process.exit(0);
} else {
  console.error('❌ Some validators failed!');
  process.exit(1);
}
