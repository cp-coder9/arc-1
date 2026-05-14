# Architex Full Scope Production Backend Implementation Plan

Source: `Full_scope.md`  
Date: 2026-05-14  
Branch: `e2e-chromium-stabilization`

## Planning Method Used

- Read `Full_scope.md` and extracted backend, database, workflow, role, integration, security, AI, payment, and documentation requirements.
- Spawned swarm agents for parallel analysis:
  - scope extraction agent: role/workflow/entity/approval extraction.
  - backend inventory agent: existing code, service, rule, and test gap analysis.
  - research/docs/testing agent: South African verification, CPD, payments/escrow, POPIA, municipal integration, and documentation/testing strategy.
- Used web research for integration/compliance areas that should not rely on model memory.
- This plan is intentionally backend-first and production-only. UI updates should only expose persisted, permissioned backend functionality.

## Non-Negotiable Delivery Rules

1. No placeholder production features.
2. No mock production data. Mocks are allowed only inside tests.
3. Every production workflow stores durable state in the existing Firebase/Firestore architecture.
4. All money, approval, compliance, signature, AI, role, and admin actions must have an audit trail.
5. AI may draft, extract, recommend, classify, and summarize, but must not certify, sign, release escrow, approve compliance, auto-purchase, or override human responsibility.
6. External integrations must use real provider contracts where available. If provider details are unknown, implement only a safe abstraction plus documented human-input blocker, not fake integration behavior.
7. Keep the current visual colour scheme if frontend work is touched.
8. At the end of each phase, update this document or a phase report with exactly what was implemented.

## Research Notes and Known External Constraints

### Professional verification

- SACAP provides a public registered-person search and public guidance stating that registration should be verified before architectural appointment.
- No public, documented SACAP API was found during initial research.
- PrivySeal appears to provide real-time digital registration status for SACAP professionals, but commercial/API access needs human confirmation.
- Human input needed: authoritative verification providers, API agreements, manual verification SLA, accepted evidence, and override policy.

### CPD

- SACAP CPD exists as a continuing professional development requirement. Related South African architectural institutes describe five-year renewal and CPD credit requirements.
- No public CPD sync API was found during initial research.
- Human input needed: whether Architex intends to become/acquire an accredited CPD provider, which councils must sync, and what certificate rules apply.

### Payments and escrow

- South African payment systems are regulated by SARB/PASA and the National Payment System framework.
- PayFast supports payment gateway flows and marketplace-style/split payment materials are publicly discussed, but escrow/holding client funds may require legal/payment-provider structuring.
- Human input needed before production escrow release: gateway, escrow/legal model, settlement timing, refund rules, fee rates, chargeback policy, and whether funds are held by a licensed provider or trust/escrow partner.

### Municipal integrations

- Municipal portals vary by municipality. Some have online building plan submission/status portals, but a universal municipal API was not found.
- Human input needed: launch municipality list, portal access terms, whether automation is permitted, API agreements, and manual evidence standards.

### POPIA/security

- POPIA applies to personal information processing. Production implementation must include access control, purpose limitation, retention, secure processing, breach-response runbooks, and audit/access logs.
- Human input needed: retention periods, operator/responsible-party allocation, privacy policy, and data subject request handling.

## Existing Codebase Inventory Summary

Observed existing backend/service areas:

- Firebase Auth, Firestore, Firebase Admin, Vercel Blob file storage.
- Express API router in `src/lib/api-router.ts` and Vercel/server entrypoints.
- Existing services for payments, financial ledger, construction, tendering, messaging, notifications, lifecycle, team management, council submissions, SACAP verification, municipal automation, OCR, PDF generation, and AI orchestration.
- Existing user roles currently include `client`, `architect`, `admin`, `freelancer`, `bep`, `contractor`. Full scope also requires subcontractor and supplier role support.
- Existing tests under `src/services/__tests__`, `src/lib/__tests__`, `src/test/integration`, and Playwright E2E.

High-risk gaps to address early:

- Role model is incomplete for subcontractor/supplier. The previous `architect`/`bep` overlap is resolved by treating `architect` as a BEP subtype in authorization while preserving legacy/current records.
- Firestore rules must be reviewed and expanded in lockstep with new collections.
- Some integrations appear partially implemented or demo-oriented and must be hardened before production use.
- Admin assignment and permission checks must be server-authoritative, not client/email driven.
- Payment/escrow needs strict state machine, idempotency, callback validation, and legal/provider confirmation.

## Target Backend Architecture

- **Auth:** Firebase Auth with server-side token verification and optional custom claims.
- **API:** Express routes grouped by bounded domains.
- **Database:** Firestore collections/subcollections with documented schemas, indexes, retention, and security rules.
- **Storage:** Existing secure file storage with document metadata and versioning in Firestore.
- **Security:** RBAC plus project, firm, package, task, and admin-scope permissions.
- **Audit:** Immutable audit logs for access, authority, payment, escrow, AI, signatures, disputes, and admin overrides.
- **AI:** AI action logs, confidence scores, source evidence, human review queues, and no autonomous legally binding actions.

---

# Phase 1: Security, Identity, RBAC, Audit, and Core Data Foundation

## Goal

Build the production foundation required by every later workflow.

## Tasks

1. Normalize role taxonomy:
   - `client`
   - `bep`
   - `architect` as either legacy alias or BEP subtype, pending human decision
   - `contractor`
   - `freelancer`
   - `subcontractor`
   - `supplier`
   - `admin`
2. Add project-scoped permission model:
   - project owner/client
   - lead BEP
   - design team member
   - contractor
   - subcontractor/package assignee
   - supplier/package assignee
   - freelancer/task assignee
   - admin
3. Add verification state model for BEPs, contractors, subcontractors, suppliers, freelancers, and admins.
4. Replace email/client-side admin assumptions with server-side role/claim/user-record checks.
5. Implement/standardize immutable audit logging service.
6. Add access log and request correlation IDs for sensitive backend actions.
7. Define canonical Firestore schema and ID conventions.
8. Harden Firestore rules for all collections introduced or changed in this phase.
9. Add idempotency helpers for sensitive write APIs.

## Backend Entities

- `users`
- `user_verifications`
- `firms`
- `firm_memberships`
- `projects`
- `project_memberships`
- `permission_policies`
- `audit_logs`
- `access_logs`
- `approval_actions`
- `system_settings`

## API Work

- `POST /api/auth/bootstrap`
- `GET /api/auth/me`
- `POST /api/admin/users/:userId/roles`
- `POST /api/admin/users/:userId/verify`
- `POST /api/firms`
- `POST /api/firms/:firmId/invite`
- `POST /api/projects`
- `GET /api/projects/:projectId/access`
- `GET /api/admin/audit-logs`

## Tests

- Unit tests for role resolution, permission resolution, verification gates, audit event construction, and admin override rules.
- Integration tests for auth bootstrap, project membership, firm membership, admin role changes, and verification approval.
- Firestore rules tests for owner/member/admin/non-member access.
- E2E path: register/bootstrap/create project/invite member/admin audit visibility.

## Documentation

- RBAC matrix.
- Firestore schema catalog.
- Verification state machine.
- Admin override policy.
- Audit event taxonomy.
- API contract docs.

## Acceptance Criteria

- All protected APIs require verified server-side auth context.
- No client-side role write can escalate privileges.
- Project, firm, package, and admin access are enforced in API and Firestore rules.
- All sensitive actions emit immutable audit entries.
- No production feature in this phase uses mock or placeholder data.

## Phase-End Exact Implementation Note Must Include

- Collections created/changed.
- Fields added to each entity.
- Permission matrix shipped.
- Endpoints added/changed.
- Firestore rules/index changes.
- Audit events emitted.
- Tests added and exact command results.
- Known limitations and human-input blockers.

---

# Phase 2: Profiles, Marketplace, Guided Brief, Directory Search, and Appointment

## Goal

Support the first complete platform route: client brief to verified professional appointment.

## Tasks

1. Expand role-specific profile schemas using `Full_scope.md` fields.
2. Persist guided client briefs with uploaded evidence metadata.
3. Create AI-assisted brief interpretation records with human-visible limitations.
4. Publish marketplace opportunities from valid briefs.
5. Implement verification-aware manual directory search.
6. Implement AI smart matching as advisory scored recommendations, not automatic appointments.
7. Add proposals, proposal comparison data, client invitations, and appointment workflow.
8. Generate project codes and initialize project command-centre state.
9. Link appointment to contract readiness and initial milestone plan where rules are known.

## Backend Entities

- `role_profiles`
- `project_briefs`
- `project_attachments`
- `brief_interpretations`
- `marketplace_opportunities`
- `directory_profiles`
- `match_recommendations`
- `invitations`
- `proposals`
- `proposal_comparisons`
- `appointments`
- `project_stage_history`

## API Work

- `PUT /api/users/:userId/profile`
- `POST /api/project-briefs`
- `POST /api/project-briefs/:briefId/attachments`
- `POST /api/project-briefs/:briefId/interpretations`
- `POST /api/marketplace/opportunities`
- `GET /api/marketplace/opportunities`
- `GET /api/directory/search`
- `POST /api/invitations`
- `POST /api/proposals`
- `POST /api/proposals/:proposalId/compare`
- `POST /api/appointments`
- `POST /api/projects/:projectId/initialize`

## Tests

- Role profile validation tests.
- Directory search permission and verification tests.
- Marketplace visibility tests.
- Brief-to-opportunity integration test.
- Proposal-to-appointment integration test.
- E2E: client creates brief, verified BEP submits proposal, client compares and appoints.

## Documentation

- Profile field reference for every role.
- Guided brief workflow.
- Marketplace lifecycle.
- Directory search rules.
- AI matching limitations and human approval policy.
- Appointment API contract.

## Acceptance Criteria

- Client brief, uploads, AI interpretation, opportunity, proposals, comparison, and appointment persist in Firestore.
- Manual search does not bypass verification.
- Only eligible verified users can pitch where verification is required.
- Appointment creates durable project membership and stage history.

## Phase-End Exact Implementation Note Must Include

- Profile fields shipped per role.
- Search filters and ranking rules.
- Matching criteria implemented.
- Proposal/appointment statuses.
- Project initialization artifacts.
- Tests and docs completed.

---

# Phase 3: Project Command Centre, Team Coordination, Documents, Messenger, and Approvals

## Goal

Make every project operable with command-centre aggregates, team coordination, document control, contextual communication, and approvals.

## Tasks

1. Implement role-specific command-centre backend projections.
2. Add design team matrix and role assignment lifecycle.
3. Add document register, drawing register, document metadata, versioning, and revision history.
4. Add task board and approval engine.
5. Add contextual project messenger with links to tasks, drawings, RFIs, invoices, municipal items, claims, snags, contracts, payment holds, and compliance flags.
6. Add transmittals, consultant dependencies, and responsibility matrix persistence.
7. Ensure all views are filtered by role and project membership.

## Backend Entities

- `project_command_views`
- `design_team_members`
- `responsibility_matrix`
- `drawing_registers`
- `documents`
- `document_versions`
- `tasks`
- `approvals`
- `message_threads`
- `messages`
- `transmittals`
- `consultant_dependencies`

## API Work

- `GET /api/projects/:projectId/command-centre`
- `POST /api/projects/:projectId/team-members`
- `POST /api/projects/:projectId/responsibility-matrix`
- `POST /api/projects/:projectId/documents`
- `POST /api/projects/:projectId/document-versions`
- `POST /api/projects/:projectId/tasks`
- `POST /api/projects/:projectId/approvals`
- `POST /api/projects/:projectId/message-threads`
- `POST /api/projects/:projectId/messages`
- `POST /api/projects/:projectId/transmittals`

## Tests

- Command-centre aggregation tests.
- Document version immutability tests.
- Approval state-machine tests.
- Messenger context linking tests.
- Permission denial tests for non-members and wrong roles.
- E2E: BEP adds consultant, uploads revision, creates task, asks contextual question, requests client approval.

## Documentation

- Command-centre schema per role.
- Document/drawing versioning rules.
- Approval workflow states.
- Messenger context schema.
- Design team matrix guide.

## Acceptance Criteria

- Every command-centre panel is backed by persisted state.
- Documents and drawings are versioned and attributable.
- Approvals are durable, auditable, and permission-gated.
- Messages are project-linked and context-linked.

## Phase-End Exact Implementation Note Must Include

- Command-centre fields shipped per role.
- Document versioning behavior.
- Approval statuses and actors.
- Thread context types supported.
- Indexes added for project views.

---

# Phase 4: Technical Briefs, Compliance, Municipal Tracker, Checklists, and AI Review Governance

## Goal

Deliver professional workflow tools while preserving human professional responsibility.

## Tasks

1. Implement BEP technical brief editor backend.
2. Add drawing checklist tracker by municipality, discipline, and stage.
3. Add municipal submission records, evidence uploads, manual statuses, and audience-specific projections.
4. Add client and contractor read-only municipal status windows.
5. Add SANS/compliance form records and autofill field maps.
6. Add AI drawing checker issue records, issue assignment, and resolution tracking.
7. Add AI action logs with source references, confidence, prompt/model metadata, and human confirmation.
8. Add admin AI review queue for flagged/uncertain outputs.
9. Ensure compliance declarations and professional sign-offs are human-only.

## Backend Entities

- `technical_briefs`
- `municipal_submissions`
- `municipal_status_events`
- `municipal_evidence`
- `municipal_status_views`
- `drawing_checklists`
- `checklist_templates`
- `compliance_forms`
- `compliance_form_versions`
- `drawing_check_runs`
- `drawing_issues`
- `ai_action_logs`
- `ai_review_queue`

## API Work

- `PUT /api/projects/:projectId/technical-brief`
- `POST /api/projects/:projectId/municipal-submissions`
- `POST /api/projects/:projectId/municipal-evidence`
- `POST /api/projects/:projectId/municipal-status-events`
- `GET /api/projects/:projectId/municipal-status-view`
- `POST /api/projects/:projectId/checklists`
- `POST /api/projects/:projectId/compliance-forms`
- `POST /api/projects/:projectId/drawing-check-runs`
- `POST /api/projects/:projectId/drawing-issues/:issueId/assign`
- `POST /api/ai/action-logs`
- `POST /api/admin/ai-review/:itemId/resolve`

## Tests

- Technical brief validation tests.
- Municipal status projection tests for BEP/client/contractor.
- Checklist progress tests.
- Compliance form version tests.
- AI advisory vs human-confirmed state tests.
- Security tests: client cannot edit BEP municipal controls; freelancer cannot sign compliance declarations.

## Documentation

- Technical brief schema.
- Municipal tracker state machine.
- Checklist template authoring guide.
- Compliance form lifecycle.
- AI governance and human sign-off policy.

## Acceptance Criteria

- Municipal and compliance records persist and are role-filtered.
- AI outputs are advisory artifacts with traceable sources.
- Uncertain/flagged AI outcomes create tasks or review queue entries.
- Human review is required before official compliance/sign-off outputs.

## Phase-End Exact Implementation Note Must Include

- Municipal statuses and transitions.
- Compliance form schemas shipped.
- Checklist template structure.
- AI log fields stored.
- Review/flag resolution actions.
- Audience filtering rules.

---

# Phase 5: Contracts, Digital Signing, Invoicing, Payments, Escrow, Ledger, and Disputes

## Goal

Implement the money and governance backbone with durable auditability.

## Tasks

1. Implement contract records, versions, parties, clauses metadata, and signature audit metadata.
2. Add invoices and claims linked to contracts, milestones, deliverables, evidence, package, or variation.
3. Implement fee schedule settings governed by admins.
4. Implement payment initiation and callback processing with idempotency.
5. Implement escrow state machine: pending funding, funded, held, partially released, released, disputed, refunded/cancelled where legally supported.
6. Implement append-only ledger entries.
7. Implement dispute intake from any workflow item.
8. Add evidence bundling for disputes using existing persisted documents/messages/actions.
9. Link disputes to payment holds and escrow release conditions.
10. Add reconciliation and failure recovery runbooks.

## Backend Entities

- `contracts`
- `contract_versions`
- `contract_signatures`
- `invoices`
- `claims`
- `payment_attempts`
- `payment_callbacks`
- `escrow_accounts`
- `escrow_transactions`
- `ledger_entries`
- `fee_schedules`
- `disputes`
- `dispute_evidence`
- `resolution_actions`

## API Work

- `POST /api/projects/:projectId/contracts`
- `POST /api/contracts/:contractId/sign`
- `POST /api/projects/:projectId/invoices`
- `POST /api/projects/:projectId/claims`
- `POST /api/payments/initiate`
- `POST /api/payments/callback`
- `POST /api/escrow/:escrowId/hold`
- `POST /api/escrow/:escrowId/release`
- `POST /api/disputes`
- `POST /api/disputes/:disputeId/respond`
- `POST /api/disputes/:disputeId/resolve`
- `GET /api/admin/financials/ledger`

## Tests

- Escrow transition tests.
- Fee calculation tests.
- Payment callback signature and replay tests.
- Ledger append-only tests.
- Dispute hold/release integration tests.
- E2E: invoice payment, escrow funding, dispute hold, admin resolution, partial/full release.

## Documentation

- Contract and signing architecture.
- Invoice/claim model.
- Payment callback validation.
- Escrow state machine.
- Ledger entry taxonomy.
- Dispute workflow.
- Reconciliation runbook.

## Acceptance Criteria

- All payment, escrow, fee, ledger, and dispute actions persist and are auditable.
- Duplicate callbacks are idempotent.
- Release requires configured human approvals.
- Disputes can hold or alter release eligibility.
- No fake production transaction state exists.

## Phase-End Exact Implementation Note Must Include

- Contract statuses and versioning rules.
- Invoice/claim statuses.
- Escrow states and transitions.
- Fee formulas shipped.
- Callback validation rules.
- Ledger entry types.
- Dispute types and outcomes.
- Recovery procedure for failed callbacks.

---

# Phase 6: Contractor Construction OS, Procurement, Packages, Snagging, and Close-Out

## Goal

Support contractor-led delivery and package-level collaboration.

## Tasks

1. Implement construction programme, Gantt/task schedule, baseline, look-ahead, and recovery programme persistence.
2. Add RFIs, site instructions, site reports, weather, delays, and safety notes.
3. Add staff, wage batches, timesheets, plant register, and equipment usage records.
4. Add BoQ/BoM items and review workflow.
5. Add procurement orders, supplier quotes, delivery tracking, and approval gates.
6. Add supplier integration abstraction without fake supplier data.
7. Add subcontractor/supplier package lifecycle.
8. Add package claims and payment linkage.
9. Add snagging and close-out records with evidence.
10. Link snags/close-out to escrow/payment hold rules where applicable.

## Backend Entities

- `programmes`
- `programme_tasks`
- `rfis`
- `site_instructions`
- `site_logs`
- `weather_records`
- `delay_records`
- `staff_records`
- `timesheets`
- `wage_batches`
- `plant_register`
- `equipment_usage`
- `boq_items`
- `bom_items`
- `procurement_orders`
- `supplier_quotes`
- `deliveries`
- `subcontractor_packages`
- `package_claims`
- `snags`
- `closeout_records`

## API Work

- `POST /api/projects/:projectId/programmes`
- `POST /api/projects/:projectId/programme-tasks`
- `POST /api/projects/:projectId/rfis`
- `POST /api/projects/:projectId/site-instructions`
- `POST /api/projects/:projectId/site-logs`
- `POST /api/projects/:projectId/staff-records`
- `POST /api/projects/:projectId/wage-batches`
- `POST /api/projects/:projectId/plant`
- `POST /api/projects/:projectId/boq-items`
- `POST /api/projects/:projectId/bom-items`
- `POST /api/projects/:projectId/procurement-orders`
- `POST /api/projects/:projectId/packages`
- `POST /api/projects/:projectId/package-claims`
- `POST /api/projects/:projectId/snags`
- `POST /api/projects/:projectId/closeout-records`

## Tests

- Programme dependency tests.
- Package access tests.
- Procurement approval tests.
- Supplier integration contract tests with test-only mocks.
- Snag/close-out completion tests.
- Integration: contractor creates package, subcontractor uploads evidence, claim links to invoice/payment.
- E2E: contractor delivery path with package claim and close-out.

## Documentation

- Contractor OS data model.
- Procurement workflow.
- Supplier integration contract.
- Package lifecycle.
- Snagging and close-out rules.

## Acceptance Criteria

- Contractor workflows persist and are role-scoped.
- Procurement never auto-purchases without approved human action.
- Package participants see only package-relevant data.
- Snagging and close-out evidence can affect payment holds according to configured rules.

## Phase-End Exact Implementation Note Must Include

- Contractor/package statuses.
- Procurement order states.
- Supplier integration assumptions and real provider gaps.
- Close-out evidence types.
- Snag/payment linkage rules.

---

# Phase 7: CPD, Resource Sharing, Notifications, AI Orchestration Expansion, Analytics, and Admin Governance

## Goal

Complete the platform governance, learning, CPD, resource, and monetization systems.

## Tasks

1. Implement CPD content, assessments, attempts, records, certificate generation, and verification codes.
2. Add CPD statutory sync abstraction with no fake sync if no real provider is configured.
3. Implement resource listings, calendars, booking, usage logs, billing linkage, access/provisioning records, and owner payouts.
4. Implement notification event matrix and delivery tracking.
5. Expand AI orchestrator registry, workflow routing, human review queue, training feedback, and learning-loop records.
6. Implement admin settings for fees, templates, checklists, forms, tool sets, verification queues, AI review, and analytics.
7. Add analytics events and projection jobs for platform usage and operational dashboards.
8. Add admin override dual-control where human policy requires it.

## Backend Entities

- `cpd_courses`
- `cpd_assessments`
- `cpd_attempts`
- `cpd_records`
- `cpd_certificates`
- `cpd_sync_jobs`
- `resources`
- `resource_availability`
- `resource_bookings`
- `resource_usage_logs`
- `resource_access_sessions`
- `resource_payouts`
- `notifications`
- `notification_deliveries`
- `ai_agents`
- `ai_workflows`
- `ai_training_feedback`
- `analytics_events`
- `analytics_projections`
- `admin_governance_settings`

## API Work

- `POST /api/cpd/courses`
- `POST /api/cpd/assessments`
- `POST /api/cpd/assessments/:assessmentId/submit`
- `GET /api/cpd/certificates/:certificateId`
- `POST /api/resources`
- `POST /api/resources/:resourceId/availability`
- `POST /api/resource-bookings`
- `POST /api/resource-bookings/:bookingId/usage`
- `POST /api/resource-bookings/:bookingId/access-session`
- `POST /api/admin/system-settings/fees`
- `POST /api/admin/templates`
- `POST /api/admin/checklists`
- `GET /api/admin/analytics`
- `POST /api/admin/notifications/retry`
- `POST /api/admin/ai-workflows`

## Tests

- CPD scoring and certificate tests.
- CPD verification-code tests.
- Resource booking conflict and billing tests.
- Notification fanout/preference tests.
- AI workflow routing tests.
- Admin settings permission tests.
- Analytics projection tests.
- E2E: BEP completes CPD; resource booking paid and usage logged; admin reviews AI flag and updates fee schedule.

## Documentation

- CPD backend specification.
- Certificate verification guide.
- Resource-sharing billing model.
- Notification event matrix.
- AI workflow governance guide.
- Admin governance API guide.
- Analytics projection model.

## Acceptance Criteria

- CPD, resource booking, notifications, AI routing, analytics, and admin settings persist in Firestore.
- Certificates are verifiable and tamper-resistant.
- Resource usage and payouts are traceable.
- Admin actions are audited and governed.
- Any unavailable external sync is documented as a human-input blocker, not simulated.

## Phase-End Exact Implementation Note Must Include

- CPD pass/fail logic.
- Certificate verification fields.
- Booking and usage billing formula.
- Notification event types.
- Admin settings exposed.
- Analytics projections created.
- External sync blockers.

---

# Cross-Phase Documentation Requirements

Create and maintain:

1. `docs/roles/`
   - client.md
   - bep.md
   - contractor.md
   - subcontractor-supplier.md
   - freelancer.md
   - admin.md
2. `docs/backend/`
   - architecture.md
   - auth-rbac.md
   - firestore-schema.md
   - firestore-rules.md
   - api-reference.md
   - audit-log-taxonomy.md
   - error-codes.md
3. `docs/workflows/`
   - guided-brief-to-appointment.md
   - technical-brief-and-compliance.md
   - municipal-tracker.md
   - project-command-centre.md
   - payments-escrow-ledger.md
   - dispute-resolution.md
   - contractor-os.md
   - procurement.md
   - cpd.md
   - resource-sharing.md
4. `docs/integrations/`
   - payment-gateway.md
   - escrow-provider.md
   - professional-verification.md
   - municipal-integrations.md
   - supplier-apis.md
   - digital-signatures.md
   - cpd-sync.md
5. `docs/testing/`
   - test-strategy.md
   - security-rules-tests.md
   - payment-callback-tests.md
   - e2e-workflows.md
6. `docs/phase-reports/`
   - one report per completed phase with exact implementation details.

# Cross-Phase Testing Standards

Every phase must include:

- Unit tests for pure logic and state transitions.
- Integration tests for API + Firestore persistence.
- Firestore rules/security tests for each new collection.
- Workflow tests for happy path and permission-denied path.
- Audit assertions for sensitive actions.
- Idempotency/retry tests for callbacks, approvals, external syncs, and background jobs.
- E2E tests for at least one role-specific workflow.

Before marking a phase complete, run the relevant subset plus, where feasible:

```bash
npm run lint
npm test
npm run test:e2e -- --project=chromium
```

# Human Input Required Before Certain Production Work

The following must be supplied or approved by a human before implementing production behavior:

1. Final role taxonomy: DECIDED, `architect` is a BEP subtype and is normalized to `bep` for authorization.
2. Supplier vs subcontractor account model.
3. Payment gateway and escrow provider/legal structure.
4. Final fee percentages, minimum fees, refund, chargeback, and dispute fee rules.
5. Digital signature provider and legal evidence requirements.
6. Professional verification providers, accepted evidence, and manual review SLA.
7. Municipal launch scope and allowed API/automation access.
8. CPD accreditation/provider strategy and certificate rules.
9. Data retention policy for contracts, payments, municipal evidence, AI logs, messages, and audit records.
10. Admin separation-of-duty rules: DECIDED, admins can override separation-of-duty with an auditable reason. Human input still needed for optional dual-approval thresholds.

# Immediate Next Implementation Step

Start Phase 1 only. Do not build later workflow modules until the security, RBAC, audit, and schema foundation is production-ready. The first implementation PR/commit should include:

- Canonical role/permission types.
- Auth context and permission middleware.
- Audit logging service.
- Firestore rules updates for core collections.
- Tests for role resolution, permission denial, and audit events.
- Initial backend docs for RBAC, schemas, and audit taxonomy.
