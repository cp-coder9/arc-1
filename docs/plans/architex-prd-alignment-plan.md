# Architex PRD Implementation Alignment Plan

> For Hermes: use test-driven development and small commits. Do not push or deploy without explicit user approval.

Goal: Align the Architex platform to the user-provided Built Environment OS PRD: RBAC, 8-stage lifecycle, next-best-action command centre, compliance, procurement, escrow, and close-out governance.

Current implementation lane:
1. Treat `docs/prd/architex-built-environment-os-prd.md` as the active source of truth.
2. Continue backend-first stage-gate primitives before broad UI work.
3. Prioritize reusable services with Vitest coverage:
   - role/stage/toolset registry
   - next-best-action evaluation
   - approval/escrow governance gates
   - statutory/compliance trigger checks
   - procurement and close-out readiness gates
4. Each implementation block must:
   - inspect current branch and avoid racing active edits
   - implement one narrow PRD slice
   - run targeted tests plus `npm run lint -- --pretty false`
   - commit only clean scoped source/test changes
   - leave unrelated local logs/reports untouched

Near-term backlog:
- Wire escrow release approval gates into payment governance and admin review flows.
- Add PRD role/stage registry covering Client, BEP, Contractor, Subcontractor/Supplier, Freelancer, and Admin/Governance.
- Add next-best-action evaluator for the 8 lifecycle stages.
- Expand statutory gate services for SG boundary, SSEG, WULA, B-BBEE, fire, truss, development charges, demolition/asbestos, heritage, and lab testing triggers.
- Add hourly user-facing progress reports separate from silent implementation blocks.
