// ─── NEMA Listed Activity Screening Service ─────────────────────────────────
// Deterministic screening engine evaluating project attributes against
// GN R.983, GN R.984, GN R.985 Listing Notice thresholds.
// Requirements: 2.1–2.9

import crypto from 'crypto';

import { ScreeningInputSchema } from '@/lib/eiaSchemas';

import type {
  ListingNotice,
  ScreeningInput,
  ScreeningRecommendation,
  ScreeningResult,
  TriggeredActivity,
} from './eiaTypes';
import {
  listingNotice1Rules,
  listingNotice2Rules,
  listingNotice3Rules,
  type ScreeningRule,
} from './screeningRules';

// ─── Constants ───────────────────────────────────────────────────────────────

const ADVISORY_TEXT =
  'This screening result is indicative only. The applicant must confirm with the Competent Authority whether an Environmental Authorization is required.';

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Runs a full NEMA Listed Activity screening.
 *
 * 1. Validates all mandatory inputs via Zod schema.
 * 2. Evaluates input against each Listing Notice rule set (R.983, R.984, R.985).
 * 3. Collects all triggered activities with their threshold details.
 * 4. Determines recommendation based on triggered listing notices.
 * 5. Attaches advisory disclaimer text.
 *
 * @throws Error with field-level validation messages when input is invalid.
 */
export function runScreening(
  input: ScreeningInput,
  options?: { projectId?: string; screenedBy?: string }
): ScreeningResult {
  // Step 1: Validate input via Zod
  const parseResult = ScreeningInputSchema.safeParse(input);
  if (!parseResult.success) {
    const fieldErrors = parseResult.error.flatten().fieldErrors;
    const messages = Object.entries(fieldErrors)
      .map(([field, errors]) => `${field}: ${(errors ?? []).join(', ')}`)
      .join('; ');
    throw new Error(`Validation failed: ${messages}`);
  }

  // Step 2: Evaluate all listing notices
  const ln1Triggered = evaluateListingNotice1(input);
  const ln2Triggered = evaluateListingNotice2(input);
  const ln3Triggered = evaluateListingNotice3(input);

  // Step 3: Collect all triggered activities
  const triggeredActivities: TriggeredActivity[] = [
    ...ln1Triggered,
    ...ln2Triggered,
    ...ln3Triggered,
  ];

  // Step 4: Determine recommendation
  const recommendation = determineRecommendation(triggeredActivities);

  // Step 5: Return result with advisory text
  return {
    id: crypto.randomUUID(),
    projectId: options?.projectId ?? '',
    input,
    triggeredActivities,
    recommendation,
    advisoryText: ADVISORY_TEXT,
    screenedAt: new Date().toISOString(),
    screenedBy: options?.screenedBy ?? '',
  };
}

/**
 * Determines the screening recommendation based on triggered activities.
 *
 * - LN2 triggered → full_scoping_eia (regardless of other listings)
 * - LN1 or LN3 only → basic_assessment
 * - None triggered → no_eia_required
 */
export function determineRecommendation(
  triggered: TriggeredActivity[]
): ScreeningRecommendation {
  if (triggered.length === 0) {
    return 'no_eia_required';
  }

  const hasLN2 = triggered.some(
    (activity) => activity.listingNotice === 'GN_R984'
  );

  if (hasLN2) {
    return 'full_scoping_eia';
  }

  return 'basic_assessment';
}

/**
 * Evaluates project input against GN R.983 (Listing Notice 1) rules.
 * Returns all triggered activities for Basic Assessment threshold.
 */
export function evaluateListingNotice1(
  input: ScreeningInput
): TriggeredActivity[] {
  return evaluateRuleSet(input, listingNotice1Rules);
}

/**
 * Evaluates project input against GN R.984 (Listing Notice 2) rules.
 * Returns all triggered activities for Full Scoping & EIA threshold.
 */
export function evaluateListingNotice2(
  input: ScreeningInput
): TriggeredActivity[] {
  return evaluateRuleSet(input, listingNotice2Rules);
}

/**
 * Evaluates project input against GN R.985 (Listing Notice 3) rules.
 * Returns all triggered activities for Basic Assessment in sensitive areas.
 */
export function evaluateListingNotice3(
  input: ScreeningInput
): TriggeredActivity[] {
  return evaluateRuleSet(input, listingNotice3Rules);
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Evaluates a set of screening rules against the input and collects triggered activities.
 */
function evaluateRuleSet(
  input: ScreeningInput,
  rules: ScreeningRule[]
): TriggeredActivity[] {
  const triggered: TriggeredActivity[] = [];

  for (const rule of rules) {
    if (rule.evaluator(input)) {
      triggered.push({
        listingNotice: rule.listingNotice,
        activityNumber: rule.activityNumber,
        description: rule.description,
        triggeringAttribute: rule.attribute,
        triggeringValue: input[rule.attribute] as string | number,
        thresholdValue: rule.thresholdDescription,
      });
    }
  }

  return triggered;
}
