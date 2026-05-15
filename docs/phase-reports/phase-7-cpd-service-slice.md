# Phase 7 CPD Backend Slice

## Implemented service slice

`src/services/cpdService.ts` provides pure backend-domain helpers for CPD course assessment processing and certificate verification. It does not call Firestore or external statutory providers directly, so it can be safely reused by API handlers, jobs, and security-tested write paths.

## CPD pass/fail logic

- Each assessment question carries a positive `points` value and at least one `correctOptionId`.
- Single-choice, true/false, and multi-choice answers are scored with exact set matching.
- Duplicate submitted option IDs are ignored before comparison.
- A question earns all points only when the submitted answer set exactly equals the configured correct set.
- `scorePercent = round((score / maxScore) * 100, 2 decimal places)`.
- `passed = scorePercent >= passMarkPercent`.
- Invalid assessments fail fast before grading:
  - pass mark outside 0 to 100,
  - no questions,
  - non-positive points,
  - missing correct answers.

## Certificate verification fields

Generated certificates should persist these fields on `cpd_certificates`:

- `verificationCode`, formatted as `CPD-{COURSE_PREFIX}-{RANDOM_HEX}`.
- `verificationHash`, a SHA-256 hash over user, course, attempt, issue/expiry dates, verification code, and issuer key.
- `verificationVersion`, currently `cpd-cert-v1`.

Verification recomputes the hash using the certificate record and configured issuer key. Any tampering with user ID, course ID, attempt ID, dates, or verification code invalidates the hash.

## Statutory CPD sync abstraction

`planCPDStatutorySync` explicitly prevents fake external sync:

- returns `blocked_provider_not_configured` when any of `enabled`, `providerName`, `endpointUrl`, or `apiKey` is missing,
- returns `ready` only when all real provider configuration fields are present.

No mock provider, pretend webhook, or simulated statutory submission is executed by this slice. Provider credentials and endpoint ownership remain a human/input blocker before statutory sync jobs can run.

## Validation

Targeted tests are in `src/services/__tests__/cpdService.test.ts` and cover:

- exact multi-select CPD scoring,
- pass/fail thresholds,
- certificate verification-code and tamper-resistance behavior,
- deterministic verification hashing,
- sync blocking when no real statutory provider is configured,
- sync readiness with complete provider config.
