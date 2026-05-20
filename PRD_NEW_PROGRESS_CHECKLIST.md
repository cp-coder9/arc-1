# PRD New Implementation Progress Checklist

Last updated: 2026-05-21 SAST by JCode after Phase 6 release-readiness projection implementation.
Source files reviewed: Phases/new-implementation-plan/phase-01-foundation-prd.md through phase-06-security-testing-release-prd.md, their task/workflow files, FULL_SCOPE_IMPLEMENTATION_PLAN_2026-05-20.md, and BACKEND_HTML_OUTSTANDING_ITEMS.md.

Important note: the repo does not contain a file literally named prdnew.md; the active PRD set appears to be Phases/new-implementation-plan/* plus the full-scope/outstanding files above.

## Evidence commits reviewed

- abb951ee Add phase 5 dashboard readiness projection
- 94863b9d fix notification type drift for phase 5
- b4a8bd86 feat: add admin governance queue summary
- c3458c3e feat: add RFQ award readiness governance
- 140e021a feat: add marketplace analytics governance
- 03f4aee3 feat: add CPD certificate sync governance
- f47e2f73 test resource sharing governance
- ced9c2d2 Add closeout gate validation
- 346c2be7 Add supplier prequalification workflow guards
- ef3de747 Add municipal tracker workflow primitives
- 9f644c0e Add contractor delivery readiness projection
- 24f6f6a3 feat: add AI compliance workflow gates
- b34c676e feat: add escrow governance release gates
- 7fd7b371 feat: add communication workflow primitives

## Phase status summary

| Phase | Status | Evidence / remaining gap |
|---|---|---|
| Phase 1 - Access, Identity, Firm Workspace Foundation | Substantially implemented; keep verification open | Firm service/tests exist, firm dashboard exists, contractor role/dashboard exists, notification support exists. Remaining hardening: Firestore rule allow/deny matrix and role/profile ownership tests. |
| Phase 2 - Monetization, Subscriptions, Activation Fees, Credits | Substantially implemented; provider/webhook readiness still gated | Phase 5 financial domain and escrow governance exist; PayFast/provider sandbox and immutable financial writes still require release-gate verification. |
| Phase 3 - CPD Learning, Certificates, Knowledge Integration | Substantially implemented; statutory sync blocked by provider | CPD service/tests and assessment page exist; CPD certificate sync governance was added. Real statutory-body sync remains a credential/provider blocker. |
| Phase 4 - Procurement Ecosystem and AI Orchestrator Refinement | Substantially implemented for provider-neutral governance | Procurement workflow service/tests, RFQ award readiness, supplier prequalification, marketplace analytics, AI compliance gates exist. Real supplier API execution remains credential/provider gated. |
| Phase 5 - Dashboards, Notifications, Admin Operations | Substantially implemented; final browser/component smoke remains | Notification type drift fixed, dashboard readiness projection added, admin governance queue summary present. Needs final component-level/dashboard verification before marking complete. |
| Phase 6 - Security, Testing, Migration, Deployment Readiness | Release-readiness projection implemented; production deployment/migration still gated | Phase 6 readiness service defines release checklist, env classification, migration dry-run/rollback gates, Firestore collection coverage, and no-go conditions. Real Firebase/Vercel deploy, sandbox credentials, and migration execution remain human/provider gated. |

## Phase task checklist

### Phase 1 - Foundation

- [x] Contractor role/dashboard support present in codebase: ContractorDashboard.tsx, role/dashboard tests and readiness services.
- [x] Firm model/service/dashboard support present: firmService.ts, FirmDashboard.tsx, firm tests.
- [x] Firm invite/role notification primitives present or covered by Phase 5 notification work.
- [ ] Complete Firestore rule matrix tests for firm membership/admin/server-managed field ownership.
- [ ] Final browser/UAT pass for contractor onboarding, firm invite acceptance, and denied non-member access.

### Phase 2 - Monetization

- [x] Provider-neutral escrow governance/release gates implemented.
- [x] Phase 5 financial domain/readiness service present.
- [ ] Verify all new-flow platform fees use the intended one percent configuration in server/client paths.
- [ ] Add/verify PayFast subscription, activation, credits, duplicate ITN, and failed-payment release-gate tests with sandbox credentials.
- [ ] Confirm users cannot directly mutate ledger/subscription/credit state in Firestore rules tests.

### Phase 3 - CPD

- [x] CPD service and tests present.
- [x] CPD assessment page present.
- [x] CPD certificate sync governance added with tests.
- [ ] Provider-backed statutory sync remains blocked until statutory-body credentials/API terms are available.
- [ ] Final CPD component/e2e pass for course completion and certificate issuance.

### Phase 4 - Procurement / AI

- [x] Procurement workflow service/tests present.
- [x] Supplier prequalification guards implemented.
- [x] RFQ award readiness governance implemented.
- [x] Marketplace analytics governance implemented.
- [x] AI compliance workflow gates implemented.
- [ ] Real supplier API adapter remains blocked until credentials/terms are available.
- [ ] Add/verify server route tests for missing supplier credentials and invalid procurement payloads.

### Phase 5 - Dashboards / Notifications / Admin

- [x] Notification type drift fixed by JCode: 94863b9d.
- [x] Phase 5 dashboard readiness projection added by JCode: abb951ee.
- [x] Admin governance queue summary implemented.
- [ ] Run final dashboard component tests and browser smoke after JCode is idle.
- [ ] Confirm contractor, firm admin, platform admin, architect, and client role paths against backend.html.

### Phase 6 - Security / Testing / Release

- [x] Build release-readiness projection covering Firestore/security rule matrix requirements for all new collections and fields.
- [x] Add release-gate artifacts for privilege escalation, CPD spoofing, ledger writes, firm bypass attempts, and server-only financial operations.
- [x] Add dry-run migration and rollback gates to the Phase 6 readiness projection.
- [x] Add env readiness classification for server-only vs browser-exposed variables.
- [x] Define release and rollback gates with explicit no-go conditions.
- [x] Validate Phase 6 artifacts with targeted tests and lint.
- [ ] Add emulator-backed Firestore allow/deny tests before production rules deployment.
- [ ] Execute dry-run migration rehearsals only after staging credentials and backups are approved through Hermes/human-in-the-loop routing.

## Active implementation lane

JCode completed the current Phase 6 release-readiness projection slice. Remaining human/provider-gated items should be routed through hermes-agent for staging credentials, supplier/statutory API terms, PayFast sandbox details, Firebase/Vercel deployment approval, and migration rehearsal approval.
