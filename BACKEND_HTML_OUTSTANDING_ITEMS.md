# Architex `backend.html` Alignment Audit — Outstanding Implementation Items

**Source of truth audited:** `backend.html`  
**Current codebase compared:** React 19 + TypeScript + Firebase/Express app under `src/`, `server.ts`, and service/domain modules.  
**Audit date:** 2026-05-16  
**Purpose:** Identify every outstanding item required to make the current codebase fully match the `backend.html` built-environment OS concept: role-aware layouts, workflows, tools, permissions, and AI-agentic operations.

---

## 1. Executive Summary

The codebase has **important foundations** already in place:

- Canonical role/page matrix in `src/App.tsx` based on `backend.html`.
- Core roles in `src/types.ts`: `client`, `architect`, `bep`, `contractor`, `subcontractor`, `supplier`, `freelancer`, `admin`.
- Multi-agent SANS/NBR drawing review in `src/services/geminiService.ts`.
- Project lifecycle, team matrix, tendering, construction, escrow/ledger, verification, CPD, resource-booking, municipal tracking, and governance domain services.
- Several UI components: `ClientDashboard`, `ArchitectDashboard`, `BEPDashboard`, `ContractorDashboard`, `FreelancerDashboard`, `AdminDashboard`, `MunicipalTracker`, `InvoiceManagement`, `FileManager`, `GanttChart`, `RFIManager`, `SiteLogManager`, `TeamBuilder`, `ResponsibilityMatrix`, `CloseoutWizard`.

However, compared with `backend.html`, the product is **not yet 100% operational** as an agentic built-environment OS. The major gap is that many `backend.html` tool pages are currently **navigation shells or partial MVP surfaces**, not complete workflows with real data, write APIs, permissions, human-approval gates, audit logs, and role-specific tool workspaces.

### Highest-priority outstanding themes

1. Convert `DashboardPageShell` placeholders into real pages for each `backend.html` tool.
2. Resolve role taxonomy confusion between `architect` and `bep`.
3. Add missing auth/onboarding support for `subcontractor`, `supplier`, and `admin` role flows.
4. Build the role-aware Project Command Centre with “Next Best Action”, AI summary, risks, approvals, documents, budget, and recent activity from real project state.
5. Complete client brief → BEP technical brief → proposal comparison → appointment → contract → project lifecycle workflow.
6. Complete contract, digital signing, payment gateway, escrow release, invoicing, claims, and dispute workflows end-to-end.
7. Complete the BEP drawing/compliance/SANS form workflows beyond AI review reports.
8. Complete contractor, subcontractor/supplier, procurement, package, staff/wages/plant, and close-out tools.
9. Expose AI co-pilot workflows for all roles, not only drawing review.
10. Strengthen Firestore rules/API authorization around RBAC and project membership.

---

## 2. `backend.html` Role Model vs Current Codebase

### 2.1 Expected roles from `backend.html`

| Role | Expected meaning in `backend.html` | Current state | Outstanding items |
|---|---|---|---|
| Client | Project owner, guided brief creator, payer/approver | Implemented as role; has `ClientDashboard` | Needs full guided brief wizard, progress reports, proposal comparison, client payment/escrow views, simplified municipal status, contracts/signing UX |
| BEP / Design Team | Built Environment Professional / professional design team lead | Both `bep` and `architect` exist; meaning is inconsistent | Clarify role taxonomy. `backend.html` treats BEP as professional design-team role, while current login describes BEP as “Builder, Tiler, etc.” and architect separately |
| Main Contractor | Construction delivery lead | Role exists; `ContractorDashboard` is tender-focused | Needs Construction OS, programme builder, staff/wages/plant, RFIs/site instructions, procurement, claims, packages, snags |
| Subcontractor / Supplier | Package-specific trade/supplier participant | Roles exist in types and permissions; no real dashboard | Needs onboarding, dashboard, package workspace, shop drawings, deliveries, package claims, close-out evidence |
| Freelancer | BEP-assigned work package user | Role exists; `FreelancerDashboard` exists | Needs submissions/feedback, work package agreements, pre-check drawing checker, payment tracker, remote resources, drawing checklist tracker |
| Admin / Governance | Whole-system governance, verification, disputes, payments, AI orchestration, tool management | Admin dashboard exists | Needs whole-system console matching `backend.html`, payment rate settings, escrow oversight, dispute console, AI review queue, toolset management, message moderation |

### 2.2 Critical role taxonomy issue

**Outstanding fix:** Decide and enforce one of these models:

1. **Model A: Keep both `architect` and `bep`**
   - `architect` = SACAP architect marketplace legacy role.
   - `bep` = broader professional design-team role.
   - Update `backend.html` page mapping, onboarding, permissions, labels, profile fields, tests, docs.

2. **Model B: Merge `architect` into `bep`**
   - Treat architects as one BEP discipline.
   - Migrate legacy `architectId`, `selectedArchitectId`, `ArchitectDashboard`, `ArchitectProfile`, and `SACAPVerification` naming to generic BEP/professional terms.

Current confusion examples:

- `src/App.tsx` login card says **BEP = Builder, Tiler, etc.**, but `backend.html` says **BEP / Design Team**.
- `Job.selectedArchitectId`, `Application.architectId`, `Invoice.architectId` are still architect-specific.
- `DESIGN_TEAM_ROLES` in `App.tsx` includes `bep` and `architect`, which helps compatibility but does not fully resolve business meaning.

---

## 3. Navigation and Layout Gaps

### 3.1 Role-aware sidebar

**Implemented:** `src/App.tsx` has `CANONICAL_DASHBOARD_PAGES` and `pagesForRole()`.

**Outstanding:**

- [ ] Add role selection/onboarding cards for `subcontractor`, `supplier`, and admin invitation/access paths.
- [ ] Replace generic sidebar ordering with `backend.html` group headings: Account, Project, Client Tools, BEP Tools, Contractor Tools, Freelancer Tools, System.
- [ ] Ensure admin can view/manage all tools without accidentally bypassing separation-of-duty policies for approvals.
- [ ] Add `data-testid` coverage for every role-visible page in the canonical matrix.
- [ ] Add automated tests to verify each role sees only the correct nav and tool groups.

### 3.2 DashboardPageShell placeholders

**Current state:** `DashboardPageShell` says pages are “surfaced from backend.html” and are mostly read-only advisory placeholders.

**Outstanding:** Replace shell pages with real modules for:

- `toolbox`
- `journey`
- `tasks`
- `messages`
- `programme`
- `disputes`
- `payments`
- `contracts`
- `escrow`
- `ai`
- `client-intake`
- `client-proposals`
- `directory-search`
- `client-progress`
- `design`
- `drawing-checker`
- `sans-forms`
- `technical-brief`
- `bep-freelancers`
- `snagging`
- `contractor-staff`
- `procurement`
- `packages`
- `freelancer-submissions`
- `knowledge`
- `resource-sharing`
- `resource-centre`
- `cpd-assessment`
- `admin-console`

---

## 4. Project Command Centre Outstanding Items

`backend.html` expects every user to land on a role-adaptive Project Command Centre with:

- Next Best Action
- Project Overview
- Current Stage
- Open Approvals
- At Risk / Overdue
- Documents
- AI Summary
- Recent Activity
- Budget & Payments
- Key Dates

### Current codebase

- Role dashboards exist, but no single real `ProjectCommandCentre` data projection exists.
- `App.tsx` uses role dashboards for `command` and shell pages for many non-command pages.
- Some service pieces exist: lifecycle, ledger, notifications, tasks, RFIs, tenders, AI review.

### Outstanding items

- [ ] Create `ProjectCommandCentre` component with real active-project selection.
- [ ] Create a command-centre projection service that aggregates:
  - project lifecycle stage
  - team coverage
  - open approvals
  - AI findings/signoff requirements
  - RFIs/site tasks
  - tender/procurement/package status
  - ledger/escrow state
  - municipal tracking status
  - disputes and holds
  - recent activity/audit logs
- [ ] Implement role-specific “Next Best Action” resolver.
- [ ] Implement AI-generated plain-language summaries with human-review disclaimers.
- [ ] Add notification/action routing so “Take Next Action” opens the exact workflow item.
- [ ] Add tests for each role’s command centre view.

---

## 5. Account / Profile Editor Outstanding Items

`backend.html` requires profile data to drive verification, contracts, invoices, SANS forms, payment gateway/escrow, digital signatures, project matching, and AI routing.

### Current codebase

- `UserProfile` has basic role fields.
- `roleProfileService.ts` sanitizes role-specific profile updates.
- `ProfileEditor` and `UserSettings` exist.
- Verification services exist for SACAP/CIDB/CIPC/manual patterns.

### Outstanding items

- [ ] Expand profile UI per role to match `backend.html` fields:
  - Client: ID/company registration, billing, digital signature, address, project owner details.
  - BEP/Architect: discipline, statutory body, registration number, PI insurance, practice details, VAT/tax, digital signature.
  - Contractor: CIDB/NHBRC, company registration, health & safety docs, banking, plant/labour capacity.
  - Subcontractor/Supplier: trade/category, warranty/product support, package type, banking, delivery regions.
  - Freelancer: skills, software, availability, portfolio, payout details.
  - Admin: permission level, department, 2FA, audit identity.
- [ ] Persist role-specific profile data in typed Firestore subdocuments or normalized `roleProfiles` collection.
- [ ] Add document upload/review for verification files.
- [ ] Add digital signature setup and status.
- [ ] Add banking/VAT/tax fields for payment gateway readiness.
- [ ] Link profile completion to onboarding gating and command centre warnings.
- [ ] Add role-profile tests and Firestore rule enforcement.

---

## 6. Client Toolset Outstanding Items

### 6.1 Guided Brief Wizard

**Expected:** A 7-step plain-language wizard with examples, uploads, AI explanations, route recommendation, and BEP handoff.

**Current foundations:** `briefWorkflowService.ts`, `ClientDashboard` job posting, `feeEstimatorService.ts`.

**Outstanding:**

- [ ] Build real `GuidedBriefWizard` component.
- [ ] Persist `ProjectBriefRecord` from `briefWorkflowService`.
- [ ] Support uploads: photos, old plans, title deed, municipal letters, screenshots.
- [ ] Add AI briefing agent UI for explanations and likely route.
- [ ] Create missing-information tasks from AI interpretation.
- [ ] Convert brief to project opportunity after publish.
- [ ] Add tests for client-only brief creation and evidence upload.

### 6.2 BEP Proposal Comparison

**Current foundations:** `marketplaceWorkflowService.ts`, `appointmentWorkflowService.ts`, legacy applications.

**Outstanding:**

- [ ] Build comparison UI showing BEP fit, fee, timeline, assumptions, exclusions, risk notes, verification.
- [ ] Persist proposals as `ProposalRecord`, not only legacy `Application` records.
- [ ] Connect AI comparison to real project brief and proposal data.
- [ ] Add appointment flow from selected proposal.
- [ ] Add contract draft generation after appointment.
- [ ] Add tests for client-only comparison and appointment.

### 6.3 Directory Search

**Current foundations:** role profiles, verification services, some docs.

**Outstanding:**

- [ ] Build searchable directory UI for BEPs, contractors, subcontractors, suppliers, freelancers.
- [ ] Add filters: name, firm, registration number, discipline/trade, region, verification.
- [ ] Add invite flows by target role: quote, team member, tender/package, task.
- [ ] Add AI fit-check explanation for manually selected users.
- [ ] Add privacy controls for directory visibility.

### 6.4 Client Progress Reports

**Outstanding:**

- [ ] Generate plain-language progress reports from lifecycle, programme, municipal, budget, approvals, risks.
- [ ] Add download/export PDF.
- [ ] Link report snapshots to audit trail.
- [ ] Include AI summary with accountable human approval.

---

## 7. BEP / Design Team Toolset Outstanding Items

### 7.1 Technical Brief Editor

**Current foundations:** `briefWorkflowService.ts`, `marketplaceWorkflowService.ts`.

**Outstanding:**

- [ ] Build BEP technical brief editor UI.
- [ ] Persist professional scope, deliverables, exclusions, assumptions, consultants, approval route, risk level.
- [ ] Add AI-generated technical interpretation with BEP review decisions.
- [ ] Create missing-info tasks back to client or consultants.
- [ ] Feed finalized technical brief into proposals, contracts, programme, SANS forms, and project setup.

### 7.2 Fee Proposal Builder

**Current foundations:** `feeEstimatorService.ts`, marketplace proposal builders.

**Outstanding:**

- [ ] Build BEP fee proposal builder with stages, deliverables, exclusions, payment milestones.
- [ ] Support fee modes from `backend.html`: BEP proposes, recommended fee, fixed proposed fee, budget range.
- [ ] Convert accepted proposal into appointment contract and escrow milestones.
- [ ] Add admin-published brief fee setup integration.

### 7.3 Design Team Matrix

**Current foundations:** `teamService.ts`, `TeamBuilder`, `ResponsibilityMatrix`.

**Outstanding:**

- [ ] Align UI with `backend.html` design-team responsibilities, dependencies, due dates, overdue consultant inputs.
- [ ] Support disciplines: architect, structural, QS, fire, wet services, mechanical, electrical, landscape, planning, accessibility, energy.
- [ ] Add deliverable status tracking per discipline.
- [ ] Link team gaps to AI sign-off checklist and command centre blockers.

### 7.4 Drawing Register and Transmittals

**Outstanding:**

- [ ] Add drawing register domain model: drawing numbers, revisions, issue status, superseded records.
- [ ] Add transmittal generator for drawings/reports/addenda/submission packs.
- [ ] Add recipient logs and audit trail.
- [ ] Link drawing register to AI review, SANS forms, municipal submission, RFIs, and messages.

### 7.5 AI Drawing Checker

**Current foundations:** `reviewDrawing()` and multi-agent SANS/NBR specialists in `geminiService.ts`, `ComplianceReport`, `OrchestrationProgressModal`, file upload.

**Outstanding:**

- [ ] Build a dedicated `AIDrawingChecker` page matching `backend.html`.
- [ ] Allow selecting project, drawing set, compliance profile, execution mode, and output type.
- [ ] Support multi-file PDF/CAD/schedule upload and project file selection.
- [ ] Generate downloadable graphic/visual report from `pdfGenerationService.generateVisualComplianceReport`.
- [ ] Add issue assignment workflow from findings to tasks/team members.
- [ ] Distinguish freelancer pre-check from BEP professional compliance review.
- [ ] Add report archive and version comparison/resubmission delta review.

### 7.6 SANS / Compliance Form Autofill

**Current foundations:** AI drawing review can classify findings; `pdfGenerationService` can generate compliance artifacts.

**Outstanding:**

- [ ] Build digital SANS/compliance form pack data model.
- [ ] Autofill forms from project brief, user profiles, team, property data, and AI drawing interpretation.
- [ ] Implement field confidence states: auto-filled, missing, low-confidence, BEP-confirmed, locked.
- [ ] Add BEP signature and issue/submission workflow.
- [ ] Include forms mentioned in `backend.html`: architectural compliance, SANS declaration, municipal application details, energy/fenestration summary, fire/occupancy notes.
- [ ] Add tests verifying professional sign-off is required before issue.

### 7.7 BEP Freelancer Work Packages

**Current foundations:** `DelegatedTask`, `JobCard`, freelancer dashboard.

**Outstanding:**

- [ ] Build BEP freelancer package builder.
- [ ] Include scope, deliverables, deadline, files, revision rules, payment triggers.
- [ ] Add freelancer invitation and acceptance workflow.
- [ ] Add BEP approval gate for deliverables and payment release.
- [ ] Ensure freelancers cannot access client marketplace/jobs directly.

### 7.8 Resource Centre / Drawing Checklists

**Current foundations:** `KnowledgeSources`, `knowledgeService.ts`.

**Outstanding:**

- [ ] Build resource centre UI for municipal links, inspector contacts, submission portals, templates, checklists.
- [ ] Add municipal and discipline-specific drawing checklist tracker.
- [ ] Link checklist completion to AI drawing checker and submission readiness.
- [ ] Add admin management of checklist templates.

### 7.9 CPD Assessment

**Current foundations:** `cpdService.ts` supports scoring, certificates, and statutory sync planning.

**Outstanding:**

- [ ] Build CPD course/module UI.
- [ ] Persist assessments, attempts, certificates.
- [ ] Add certificate download and verification endpoint.
- [ ] Configure real statutory body sync provider.
- [ ] Add admin CPD content management.

---

## 8. Contractor Toolset Outstanding Items

### 8.1 Construction OS

**Current foundations:** `constructionService.ts`, `GanttChart`, `SiteLogManager`, `RFIManager`, `ContractorDashboard`.

**Outstanding:**

- [ ] Build full Construction OS page with active builds, RFIs, claims, snags, site instructions, inspections.
- [ ] Link contractor dashboard to actual project access, not only published tenders.
- [ ] Add site instruction tool and cost impact tracking.
- [ ] Add inspection scheduling and sign-off workflow.
- [ ] Add role-specific views for client, BEP, contractor, subcontractor.

### 8.2 Programme Builder

**Current foundations:** `GanttTask`, `GanttChart`, `constructionService`.

**Outstanding:**

- [ ] Build project programme builder with baseline/current/forecast.
- [ ] Add critical path, dependencies, look-ahead planning, recovery programme.
- [ ] Link programme to procurement, RFIs, inspections, snags, payments, and command centre risks.
- [ ] Add approval workflow for baseline updates.

### 8.3 Staff, Wages, Plant & Resources

**Outstanding:**

- [ ] Add staff registry, attendance, timesheets, wage batches, wage approvals.
- [ ] Add plant/equipment register, operators, hire periods, downtime, cost codes.
- [ ] Add productivity and daily allocation reporting.
- [ ] Add permissions so only contractor/admin can manage, while client/BEP see approved summaries if needed.

### 8.4 RFIs / Site Instructions

**Current foundations:** `RFIManager`, `constructionService.createRFI/respondToRFI/closeRFI`.

**Outstanding:**

- [ ] Add RFI numbering, response SLA, cost/programme impact, linked drawings and messages.
- [ ] Add site instruction domain model separate from RFI.
- [ ] Add AI routing to correct consultant.
- [ ] Add audit log for instructions and responses.

### 8.5 Progress Claims

**Current foundations:** `phase5FinancialDomain.buildClaimDraft`, ledger/payment services.

**Outstanding:**

- [ ] Build progress claim builder from measured work, photos, variations, QS certification.
- [ ] Add claim evidence upload and AI readiness checks.
- [ ] Add QS/principal agent/client certification approval gates.
- [ ] Link certified claims to invoices and escrow release.

---

## 9. BoQ / BoM Procurement and Supplier Toolset Outstanding Items

`backend.html` is explicit: procurement is driven by BoQ/BoM and supplier APIs, not only subcontractor packages.

### Current foundations

- `TenderPackage`, `Bid`, `packageReadinessService.ts`, `contractorWorkflowService.ts`.
- No complete BoQ/BoM extractor or supplier API integration in production UI.

### Outstanding items

- [ ] Add BoQ/BoM domain models: items, quantities, units, cost codes, trade/package mapping, source drawing references, confidence.
- [ ] Build AI drawing-to-BoM extraction workflow.
- [ ] Add QS review and approval workflow for extracted quantities.
- [ ] Add material schedule linked to programme dates and package responsibility.
- [ ] Add supplier catalogue/API abstraction for availability, pricing, alternatives, lead times.
- [ ] Add purchase order assistant with required human approval before purchase.
- [ ] Add delivery tracking and evidence allocation to site/package.
- [ ] Add supplier role dashboard and onboarding.
- [ ] Add tests ensuring AI cannot issue POs without human approval.

---

## 10. Subcontractor / Supplier Package Layer Outstanding Items

### Current foundations

- `subcontractor` and `supplier` roles in types and permission service.
- `packageReadinessService.ts` evaluates package readiness, evidence, procurement approvals, snags.
- No dedicated dashboard/components for package users.

### Outstanding items

- [ ] Build subcontractor/supplier dashboard.
- [ ] Add package assignment and acceptance workflow.
- [ ] Add shop drawing upload/approval workflow.
- [ ] Add sample/material approval workflow.
- [ ] Add delivery evidence and close-out document uploads.
- [ ] Add package claim/invoice workflow.
- [ ] Add warranty/manual/certificate close-out tracking.
- [ ] Enforce package-only project access in UI and Firestore rules.
- [ ] Add package payment visibility without broad project mutation rights.

---

## 11. Freelancer Toolset Outstanding Items

### Current foundations

- `FreelancerDashboard`, delegated task models, BEP task assignment.

### Outstanding items

- [ ] Build Assigned Work board matching `backend.html`.
- [ ] Build Submissions & Feedback page with deliverable status, revisions, BEP comments, payment status.
- [ ] Add freelancer invoice builder tied to approved deliverables.
- [ ] Add work package agreement / digital signing flow.
- [ ] Add AI drawing pre-check limited to QA/pre-submission, with clear disclaimer that BEP remains professionally responsible.
- [ ] Add drawing checklist tracker access.
- [ ] Add resource booking UI and payment flow.
- [ ] Prevent freelancers from seeing direct client marketplace jobs.

---

## 12. System Toolset Outstanding Items

### 12.1 Payments & Governance

**Current foundations:** `paymentService.ts`, `financialLedgerService.ts`, `phase5FinancialDomain.ts`, `InvoiceManagement`.

**Outstanding:**

- [ ] Build payable invoice list with Pay/Fund buttons by responsible paying party.
- [ ] Implement payment gateway flow end-to-end for all payment types:
  - Client → BEP professional fees
  - Client → contractor claims
  - Contractor/client → subcontractor package payments
  - BEP → freelancer task payments
  - Contractor/client → supplier material orders
- [ ] Implement transparent platform fee preview by workflow type.
- [ ] Implement role-specific payment visibility and approval states.
- [ ] Add payment receipt and ledger export.

### 12.2 Invoicing

**Current foundations:** `Invoice`, `InvoiceManagement`, `phase5FinancialDomain.buildInvoiceDraft`.

**Outstanding:**

- [ ] Support BEP stage invoices, freelancer deliverable invoices, contractor claim-linked invoices, manual invoices.
- [ ] Link invoices to contracts, milestones, deliverables, claims, variations, retention, evidence.
- [ ] Add VAT/tax and payout profile integration.
- [ ] Add approval routing before escrow release.
- [ ] Add PDF generation and storage for invoices.

### 12.3 Contracts & Digital Signing

**Current foundations:** appointment workflow has `contractDraftId`; no complete contract/signing module.

**Outstanding:**

- [ ] Add contract domain model for professional appointments, building contracts, subcontract agreements, supplier agreements, freelancer agreements.
- [ ] Build contract builder UI pulling from proposals, tenders, packages, tasks.
- [ ] Add milestone/payment schedule generation from contracts.
- [ ] Add digital signatures with identity, timestamp, version, and audit trail.
- [ ] Add versioning/redline/special conditions.
- [ ] Block downstream escrow/payment activation until required signatures are complete.

### 12.4 Escrow Service

**Current foundations:** `PaymentService.initializeStageEscrow`, `requestStageRelease`, `approveStageRelease`, `phase5FinancialDomain.ESCROW_TRANSITIONS`.

**Outstanding:**

- [ ] Expand escrow from project stages to all `backend.html` rails: professional milestones, freelancer deliverables, contractor claims, subcontractor packages, supplier/material POs, resource bookings.
- [ ] Add UI for funded/held/released/disputed/refunded balances.
- [ ] Add release request, approval, partial release, retention, dispute hold, refund workflows.
- [ ] Add platform fee deduction/assignment at release.
- [ ] Add admin oversight and immutable audit trail.

### 12.5 Dispute Resolution

**Current foundations:** `Dispute` type and `phase5FinancialDomain.buildDisputeEvidenceDraft/buildDisputeEscrowHold`.

**Outstanding:**

- [ ] Build dispute resolution centre for all roles.
- [ ] Allow disputes from tasks, invoices, contracts, drawings, snags, deliveries, payments, messages.
- [ ] Generate AI evidence bundle from contracts, messages, drawings, photos, invoices, approvals, audit logs.
- [ ] Link disputes to escrow holds/partial releases.
- [ ] Add admin mediation workflow, deadlines, outcomes, and resolution records.

### 12.6 Project Messenger

**Current foundations:** `messagingService.ts`, `Chat` component, notification service.

**Outstanding:**

- [ ] Build dedicated project messenger page with channels.
- [ ] Add linked instruction/comment threads by drawing/task/programme/invoice/snags.
- [ ] Add participant permissions by role and project membership.
- [ ] Add AI notification summaries and “what changed” feed.
- [ ] Add admin moderation/flagged message management.

### 12.7 Knowledge / CPD / Resource Centre

**Current foundations:** `knowledgeService.ts`, `cpdService.ts`, `KnowledgeSources`.

**Outstanding:**

- [ ] Build knowledge hub for each role.
- [ ] Add CPD learning modules and assessments as production UI.
- [ ] Add client education content and contractor training content.
- [ ] Add admin content management and publishing.
- [ ] Add citation governance for standards and municipal references.

### 12.8 Remote Desktop / Resource Sharing

**Current foundations:** `resourceBookingService.ts` has pure domain functions.

**Outstanding:**

- [ ] Add resource inventory model: high-spec desktop, software seat, equipment, workspace.
- [ ] Build booking calendar UI and conflict checking.
- [ ] Add resource owner publishing for BEPs.
- [ ] Add secure access provisioning integration.
- [ ] Add payment, usage logs, billing, owner payout, platform fees.
- [ ] Add project file sync permissions and audit logs.

---

## 13. Municipal Tracker Outstanding Items

### Current foundations

- `MunicipalTracker` component.
- `councilSubmissionService.ts`, `scraperService.ts`, `shadowTrackerService.ts`, `ocrService.ts`.

### Outstanding items

- [ ] Split BEP management view from client/contractor simplified insight view.
- [ ] Add role-specific `data-viewroles` equivalent in React.
- [ ] Add evidence upload for receipts/screenshots/emails.
- [ ] Add AI/OCR status extraction with BEP confirmation before client publishing.
- [ ] Add municipal API/scraper credential management with encryption and consent.
- [ ] Generate action tasks from municipal comments.
- [ ] Add query buttons linked to project messenger.

---

## 14. AI Agentic System Outstanding Items

### 14.1 Drawing review agents

**Strong current implementation:** `SPECIALIZED_AGENTS` includes orchestrator, regulatory scope, architectural completeness, council submission, SANS general, planning/zoning, structural, geotech, fire, accessibility, energy, drainage, electrical/services, envelope/materials, site safety, NHBRC, coordination clash, professional signoff, knowledge research, and legacy compatibility agents.

**Outstanding:**

- [ ] Ensure Firestore agents are migrated to the latest `SPECIALIZED_AGENTS` using `update_agents.ts`.
- [ ] Add monitoring for each agent’s status, last run, failures, confidence, and human-review queue.
- [ ] Add project-level AI action logs for every AI output used in workflow decisions.
- [ ] Add user feedback loop to improve agent prompts/knowledge.
- [ ] Add test coverage for every execution mode in `agentSelectionService.ts`.

### 14.2 AI Co-Pilot across workflows

`backend.html` expects AI to: Detect, Explain, Prepare, Route, Remind, Ask Approval.

**Current state:** Drawing review and some workflow agents exist (`briefingAgent`, `matchingAgent`, `tenderAgent`, `constructionAgent`), but there is no universal co-pilot UI/action router.

**Outstanding:**

- [ ] Build `AICoPilot` page and contextual assistant panel.
- [ ] Add AI action types for: task creation, reminder, summary, approval prompt, evidence bundle, route recommendation, risk detection.
- [ ] Add human confirmation queue for all workflow-affecting AI outputs.
- [ ] Integrate AI with brief wizard, technical brief, marketplace matching, tender review, procurement, claims, disputes, municipal tracker, CPD, resource booking.
- [ ] Add `aiGovernanceService` persistence, not only pure builders.
- [ ] Ensure no AI can approve, certify, sign, release funds, or submit statutory documents without human sign-off.

---

## 15. Admin / Governance Console Outstanding Items

`backend.html` admin console includes all projects, user-role tools, escrow management, disputes, messaging, AI orchestration/training, toolset management, payment rate settings, and admin brief fee setup.

### Current foundations

- `AdminDashboard`, agents, users, reviews, financial dashboard, knowledge uploaders.
- `permissionService`, `auditService`, `accessLogService`, `aiGovernanceService`.

### Outstanding items

- [ ] Build whole-system governance console matching `backend.html`.
- [ ] Add all-project search/inspect/audit view.
- [ ] Add all-role toolset management and feature flags.
- [ ] Add admin escrow oversight and dispute hold/release workflows.
- [ ] Add messaging moderation and flagged thread queue.
- [ ] Add AI orchestration console: prompts, training data, feedback loops, confidence thresholds, human-review rules.
- [ ] Add payment rate settings by workflow type:
  - professional services fee
  - construction claims fee
  - freelancer payment fee
  - resource booking fee
  - minimum transaction fee
  - dispute admin fee
- [ ] Add admin brief publisher with fee mode, proposed fee, marketplace visibility, external opportunity source.
- [ ] Add separation-of-duty controls for admin overrides.

---

## 16. Security, RBAC, and Firestore Rules Outstanding Items

### Current foundations

- `permissionService.ts` defines role permissions and project access roles.
- Firestore rules exist but were not fully audited in this pass.

### Outstanding items

- [ ] Audit `firestore.rules` against every `backend.html` workflow.
- [ ] Enforce project membership roles server-side and in Firestore rules.
- [ ] Prevent client-side-only admin assignment from being a trusted security mechanism.
- [ ] Add route/API guards for every write action.
- [ ] Enforce package-limited subcontractor/supplier access.
- [ ] Enforce freelancer task-only access.
- [ ] Enforce payment/escrow separation-of-duty.
- [ ] Add immutable audit logs for contracts, payments, AI decisions, admin overrides, signatures, access events.
- [ ] Add tests for unauthorized role attempts across all critical workflows.

---

## 17. Data Model Outstanding Items

Add or extend domain models for:

- [ ] `ProjectCommandProjection`
- [ ] `NextBestAction`
- [ ] `ProjectBrief` persistence collections
- [ ] `TechnicalBrief`
- [ ] `Proposal` / `ProposalComparison`
- [ ] `Contract` / `Signature` / `ContractVersion`
- [ ] `DrawingRegisterItem` / `Transmittal`
- [ ] `ComplianceFormPack` / `ComplianceFormField`
- [ ] `Task` / `ApprovalGate` generalized across workflows
- [ ] `BoQItem` / `BoMItem` / `MaterialScheduleItem`
- [ ] `SupplierCatalogueItem` / `PurchaseOrder`
- [ ] `SubcontractPackage` / `PackageEvidence`
- [ ] `Snag` / `CloseoutEvidence`
- [ ] `StaffMember` / `Timesheet` / `WageBatch`
- [ ] `PlantItem` / `PlantUsage`
- [ ] `ResourceListing` / `ResourceBooking` / `ResourceUsage`
- [ ] `CPDCourse` / `CPDAttempt` / `CPDCertificate`
- [ ] `DisputeCase` / `DisputeEvidence` / `MediationOutcome`
- [ ] `AiActionLog` / `AiReviewQueueItem` persistence models

---

## 18. Testing Outstanding Items

### Required test coverage

- [ ] Role navigation matrix tests for all roles and all pages.
- [ ] Firestore rules tests for role/project/package/task/payment access.
- [ ] Client brief wizard unit/integration tests.
- [ ] Technical brief editor and proposal comparison tests.
- [ ] Appointment → contract → escrow milestone flow tests.
- [ ] AI drawing checker end-to-end tests with mocked LLM responses.
- [ ] SANS form autofill tests with low-confidence human review.
- [ ] Contractor programme/RFI/site-log tests with project membership.
- [ ] BoQ/BoM procurement approval gate tests.
- [ ] Package readiness + payment hold tests.
- [ ] Freelancer deliverable → BEP approval → invoice → escrow release tests.
- [ ] Dispute evidence bundle and escrow hold tests.
- [ ] Admin override/separation-of-duty tests.
- [ ] CPD assessment/certificate persistence tests.
- [ ] Resource booking conflict/payment/payout integration tests.
- [ ] Playwright E2E tests per role.

---

## 19. Items to Change / Fix / Delete

### Change

- [ ] Rename or clarify user-facing role labels so BEP is not described as “Builder, Tiler, etc.” if it represents the design team.
- [ ] Update legacy `architectId` naming in new workflows to `professionalId` / `bepId` / `leadProfessionalId` where appropriate.
- [ ] Convert `DashboardPageShell` summaries into real workflow components.
- [ ] Replace static `backend.html` example values with real Firestore data projections.

### Fix

- [ ] The first lines of `backend.html` contain duplicated JS snippets before `<!DOCTYPE html>`; clean the file if it is used as an executable prototype.
- [ ] Auth role selection omits `subcontractor`, `supplier`, and direct admin onboarding/access handling.
- [ ] Contractor “Prepare Bid” button is disabled; connect it to `BidSubmission`.
- [ ] Payment wording currently implies capabilities that are not fully wired in UI.
- [ ] Ensure `SHELL_PAGE_IDS` fallback does not hide real role dashboards for pages that should have full components.

### Delete / Deprecate carefully

- [ ] Deprecate legacy `post-job` once Guided Brief Wizard is production-ready.
- [ ] Deprecate duplicated marketplace concepts once `ProjectBrief`/`MarketplaceOpportunity` replaces legacy jobs/applications for BEP workflows.
- [ ] Remove purely prototype/demo code paths after production pages are implemented.

### Add

- [ ] Production tool workspace framework: each tool opens against active project, workflow stage, responsible role, permissions, and audit trail.
- [ ] Central approval-gate engine used by payments, contracts, procurement, SANS forms, AI actions, tasks, and close-out.
- [ ] Central activity feed/audit projection for command centre.

---

## 20. Recommended Implementation Order

1. **Role/RBAC foundation**
   - Resolve `architect`/`bep` taxonomy.
   - Add missing role onboarding.
   - Harden permissions and Firestore rules.

2. **Project Command Centre**
   - Build unified projection service and real command centre UI.

3. **Client → BEP workflow**
   - Guided Brief Wizard → Technical Brief → Proposals → Appointment → Contract.

4. **AI Drawing Checker + SANS forms**
   - Complete core built-environment compliance workflow.

5. **Payments/contracts/escrow/disputes**
   - Make governance and money flows safe before broad marketplace scaling.

6. **Contractor/procurement/package workflows**
   - Programme, RFIs, staff/plant, BoQ/BoM, supplier API, package close-out.

7. **Freelancer/resource/CPD ecosystem**
   - Deliverable submissions, remote resources, CPD, resource centre.

8. **Admin whole-system console**
   - Toolset management, AI governance, payment rates, audit, dispute and messaging management.

---

## 21. Definition of “100% Working” for the Agentic Built-Environment System

The system should only be considered complete when:

- Every `backend.html` role can onboard, verify, and access only its permitted toolset.
- Every `backend.html` navigation page is backed by a production component, not a placeholder shell.
- Every tool is linked to an active project, workflow stage, responsible role, approval gate, and audit trail.
- AI agents produce explainable, cited, confidence-labelled outputs with human-review gates.
- AI cannot certify, approve, sign, submit, release funds, or purchase without authorized human confirmation.
- Payments, escrow, contracts, invoices, claims, disputes, and platform fees work end-to-end.
- Client, BEP, contractor, subcontractor/supplier, freelancer, and admin workflows are all tested with unit, integration, Firestore rules, and E2E tests.
