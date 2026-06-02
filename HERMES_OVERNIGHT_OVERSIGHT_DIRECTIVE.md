# Hermes Oversight Directive — Overnight PRD Completion

Timestamp: 2026-05-20 late SAST
Owner instruction: finish the Architex PRD overnight and keep JCode/agents on goal.

## Non-negotiables

- Stay aligned to `prdnew.md`, `FULL_SCOPE_IMPLEMENTATION_PLAN_2026-05-20.md`, `Full_scope.md`, `backend.html`, and `BACKEND_HTML_OUTSTANDING_ITEMS.md`.
- Production code only: no fake integrations, no simulated success, no UI-only placeholders claiming backend completion.
- If an external provider, legal credential, professional body, payment gateway, municipal integration, or hosting feature is missing, implement a safe governance/readiness abstraction and document the blocker.
- Keep AI outputs advisory and human-gated. Do not auto-certify, auto-sign, auto-release funds, auto-approve compliance, or auto-sync statutory certificates.
- Keep commits small and safe. Run targeted tests and lint before committing.
- Do not push or deploy without explicit owner approval.
- Do not expose secrets in logs, commits, reports, or chat.

## Current verified state

- Branch: `phase-2-verification-workflows`.
- JCode is active with coordinator `bird` and worker sessions on P2/P3 resource sharing, CPD/statutory sync, and validation.
- Latest committed PRD slices:
  - `f47e2f73 test resource sharing governance`
  - `03f4aee3 feat: add CPD certificate sync governance`
- Focused verification passed after those commits:
  - `npx vitest run src/services/__tests__/resourceBookingService.test.ts src/services/__tests__/cpdService.test.ts` — 23 tests passed.
  - `npm run lint -- --pretty false` — passed.
- API subdomain has a temporary cPanel PHP health endpoint. Full Node API remains blocked because cPanel Passenger/Node apps are disabled on the package.

## Overnight focus order

1. Re-read JCode goal/todos and repo status before editing.
2. Finish P2/P3 governance/readiness primitives that are still realistically implementable without vendor credentials.
3. For each slice:
   - inspect existing service/tests first,
   - implement the smallest production-safe primitive,
   - add or extend targeted tests,
   - run focused tests and `npm run lint -- --pretty false`,
   - commit only if clean and validated,
   - append concise entry to `AUTONOMOUS_IMPLEMENTATION_LOG.md`.
4. If JCode is still actively editing, supervise instead of racing it. Only intervene when it is idle, blocked, looping, or drifting.
5. Before morning report, run a final live status: git status, latest commits, active JCode sessions, targeted tests for overnight commits, and live smoke checks.

## Suggested remaining PRD areas to inspect next

- Marketplace analytics and directory governance/readiness.
- Supplier/RFQ lifecycle beyond prequalification if provider-neutral primitives are missing.
- Resource booking payout/readiness and dispute/audit boundaries.
- CPD statutory sync provider readiness, verification evidence, expiry/revocation handling.
- Admin governance visibility for pending human approvals, disputes, payments, AI actions, statutory sync and audit queues.
- API deployment package/readiness now that `api.architex.co.za` has isolated FTP access but Node hosting is blocked.
