# Architex Built Environment OS — PRD & Tasks Master Reference

> **Compiled:** 2026-06-11
> **Source documents:**
> - `docs/prd/architex-built-environment-os-prd.md` (canonical PRD)
> - `docs/plans/architex-prd-alignment-plan.md`
> - `PRD_OUTSTANDING_TASKS_AND_GOALS_2026-05-27.md`
> - `PRD_NEW_PROGRESS_CHECKLIST.md`
> - `docs/phase-reports/newprd-completed-items.md`
> - Original `newprd.txt`

---

# PART 1: PRODUCT REQUIREMENTS DOCUMENT

> Source: user-provided `newprd.txt` on 2026-05-22. This is the active implementation reference for role-based, stage-gate Architex development.

This analysis breaks down the **Architex Built Environment OS**, a role-based, action-driven platform designed to coordinate the complete lifecycle of construction and architectural projects.

---

## Section 1: Architectural Concept & Platform Architecture

The core design of Architex is built around **Role-Based Access Control (RBAC)** and **Stage-Gate Automation**. Rather than presenting users with an overwhelming suite of isolated software tools, the system adapts dynamically to:
1. The **selected user role** (filtering UI navigation, visibility, and tool availability).
2. The **active project stage** (shaping the "Project Command Centre" dashboard).
3. The **"Next Best Action"** (prioritising high-impact tasks such as approvals, payments, or compliance checks).

---

## Section 2: Comprehensive User Role Breakdown

Architex accommodates six distinct user profiles, each representing a key stakeholder in the built environment.

### 1. The Client
- **Objective**: Intuitively initiate, fund, track, and approve project progress without needing deep technical or legal expertise in construction or design.
- **Key Responsibilities**:
  - Defining the initial baseline requirements via plain-language wizard tools.
  - Reviewing, comparing, and appointing Verified Built Environment Professionals (BEPs).
  - Approving design milestones, change orders, and progress claims.
  - Funding the escrow account via the payment gateway.
- **Available Toolset**:
  - *Guided Brief Wizard*: Plain-language intake that avoids technical jargon.
  - *BEP Proposals*: Comparative view of bids by fee, scope, and timeline.
  - *Client Progress Reports*: High-level status updates translated into simple summaries.
  - *Contracts & Digital Signing*: Interface to review and execute appointments and contracts.
  - *Payments & Escrow*: Clean portal displaying pending invoices with clear "Pay into escrow" triggers.

### 2. The BEP (Built Environment Professional) / Design Team
- **Objective**: Lead technical design delivery, coordinate structural/mechanical/wet services consultants, ensure statutory building regulations compliance, and manage technical packages.
- **Key Responsibilities**:
  - Converting raw client requirements into structured technical briefs.
  - Generating fee proposals and staged milestone appointment agreements.
  - Managing drawing registers, consultant inputs, and municipal submissions.
  - Assessing quality assurance and drafting snag lists during close-out.
- **Available Toolset**:
  - *Technical Brief Editor*: Interface to refine client goals into a formal scope.
  - *Fee Proposal Builder*: Tool to generate fee options (fixed, hourly, percentage-based).
  - *Design Team Matrix*: Real-time grid tracing responsibilities and dependencies across engineers and consultants.
  - *AI Drawing Checker & SANS Form Autofill*: Automation utility to check PDF/CAD designs for compliance errors and auto-populate municipal submission sheets.
  - *Freelancer Jobs*: Panel to outsource discrete CAD, drafting, or modeling packages.
  - *Remote Workstations*: Reservation tool to book secure, high-spec remote machines.

### 3. The Main Contractor
- **Objective**: Deliver physical execution, maintain construction schedules, administer labor and site machinery, purchase materials, and certify payment progress claims.
- **Key Responsibilities**:
  - Building the project's baseline programme (Gantt) and look-ahead windows.
  - Logging daily site parameters (labor counts, weather delays, equipment run-times).
  - Sourcing materials based on the Bill of Quantities (BoQ) and Bill of Materials (BoM).
  - Issuing Requests for Information (RFIs) to design teams and delegating specialist subcontractor work.
- **Available Toolset**:
  - *Construction OS*: Daily site log dashboard.
  - *Staff, Wages & Plant*: Time-card approval, wage payouts, and equipment registries.
  - *BoQ/BoM Procurement*: Materials tracking, supplier inventory lookup, and PO builder.
  - *Subcontractor Packages*: Portal to control specialized trade tenders, claims, and warranties.
  - *Programme / Gantt*: Engine mapping dependencies, progress, and critical paths.

### 4. The Subcontractor / Supplier
- **Objective**: Execute highly specialized work packages (e.g., HVAC, fire detection, glazing) and supply building products in alignment with the master project schedule.
- **Key Responsibilities**:
  - Generating shop drawings and sending physical samples for professional sign-off.
  - Coordinating material orders and uploading delivery documentation.
  - Issuing progress claims against completed tasks and submitting compliance certificates during close-out.
- **Available Toolset**:
  - *BoQ/BoM Procurement*: View-access to package-specific material schedules.
  - *Subcontractor Packages*: Claims registry and contract review panel.
  - *Payments & Governance*: Portal tracking escrowed balances and billing requirements.

### 5. The Freelancer
- **Objective**: Provide remote professional support (e.g., BIM authoring, drafting, rendering) directly to appointed BEPs on a task-by-task basis.
- *(Note: Freelancers do not have visibility or bidding access on raw, client-facing projects to preserve the platform's professional hierarchy).*
- **Key Responsibilities**:
  - Executing specific tasks assigned in the work package agreement.
  - Performing preliminary compliance pre-checks on drawings before formal submissions.
  - Submitting outputs and revisions based on design-team feedback.
- **Available Toolset**:
  - *Assigned Work*: Board listing current active, in-review, or completed tasks.
  - *Submissions & Feedback*: Structured portal for uploads, revision cycles, and approvals.
  - *Remote Desktop / Resource Sharing*: Access to book virtual GPU environments.
  - *Freelancer Invoicing*: Direct invoice builder linked to approved task deliverables.

### 6. The Admin / Governance
- **Objective**: Orchestrate platform-wide operations, verify credentials, arbitrate disputes, manage monetisation setups, and audit automated AI actions.
- **Key Responsibilities**:
  - Processing user sign-ups through verification queues (SACAP, ECSA, corporate registries).
  - Resolving contract, milestone, or payment disputes as an impartial third party.
  - Curating external opportunities and assigning fee parameters to the marketplace.
  - Setting global system fees (escrow percentages, payment gateway cuts, resource sharing commission).
- **Available Toolset**:
  - *Admin Whole-System Governance Console*: Global dashboard providing total oversight of projects, disputes, and escrow funds.
  - *Payment Rate Settings*: Rules engine for platform fees and transactional cutouts.
  - *AI Orchestration*: Performance tracker and feedback loop manager for automated agents.

---

## Section 3: End-to-End Project Workflow (The 8-Stage Lifecycle)

Architex routes all stakeholders through a single, unified workflow journey. The active stage determines the specific tools and dashboard views surfaced to each role.

```
[1. Brief] ➔ [2. Appoint] ➔ [3. Design] ➔ [4. Comply] ➔ [5. Procure] ➔ [6. Build] ➔ [7. Pay] ➔ [8. Close-out]
```

### Stage 1: Brief & Diagnostic
1. The *Client* accesses the **Guided Brief Wizard** to describe their goals using intuitive options. They upload photos, property outlines, or title documents.
2. The *AI Engine* analyzes the submission, predicts professional inputs, identifies likely approvals, and outlines a recommended project route.
3. The appointed *BEP* reviews this plain-language draft and uses the **Technical Brief Editor** to define formal scopes, engineering requirements, and regulatory routes.

### Stage 2: Team Appointment
1. The *Client* searches the manual directory or relies on AI suggestions to find verified specialists.
2. Appointed professionals use the **Fee Proposal Builder** to design structured fee options.
3. The *Client* compares bids on the **BEP Proposal Comparison** screen.
4. Upon selection, the platform auto-generates a **Client-Professional Appointment Contract**, which both parties execute via digital signature.
5. The system automatically creates a milestone-linked payment plan inside the **Escrow Service**.

### Stage 3: Design & Coordination
1. The lead *BEP* coordinates the design team through the **Design Team Matrix**, assigning responsibilities to structural, wet services, and mechanical engineers.
2. The *BEP* drafts discrete work packages (e.g., structural modeling or rendering) and publishes them to the **Freelancer Marketplace**.
3. *Freelancers* execute these tasks, using the **Remote Desktop Sharing Center** if high-performance hardware or specialized software licenses are required, and upload their work back to the design team for approval.

### Stage 4: Compliance & Municipal
1. Completed design drafts are passed through the **AI Drawing Checker**, which flags compliance risks (e.g., missing fire notes or incorrect drainage layouts).
2. Once the *BEP* resolves the flagged issues, the platform triggers the **SANS Compliance Form Autofill** system. Recurring data from user profiles and technical brief parameters are compiled automatically.
3. The *BEP* digitally signs the finalized compliance forms.
4. The submission's status is monitored via the **Municipal Tracker** using API integrations or manual proof-of-receipt uploads.

### Stage 5: Tender & Procurement
1. The **Drawing-to-BoM Extractor** analyzes approved drawings and notes to generate a draft Bill of Materials.
2. A *Quantity Surveyor (QS)* or *Contractor* reviews the extracted materials list and associates items with cost-codes.
3. The material requirements are mapped to the construction timetable.
4. The *Contractor* views regional availability, pricing, and estimated lead times via supplier APIs.
5. The *AI Material Agent* flags lead-time delivery risks, and the *Contractor* approves the final Purchase Orders.

### Stage 6: Construction Delivery
1. The *Contractor* establishes a master construction timeline using the **Programme Builder**.
2. Daily operations are managed through the **Construction OS**, with supervisors logging daily progress, weather conditions, active machinery, and staff counts.
3. Subcontractors submit their shop drawings, material delivery confirmations, and weekly timesheets for the contractor's approval.
4. Site-level questions are handled through the **RFI & Site Instruction** tool.

### Stage 7: Payments & Governance
1. *BEPs*, *Contractors*, and *Freelancers* generate billing drafts via the **Invoice Builder**, which links invoices directly to verified milestones or completed deliverables.
2. Invoices are routed to the designated paying party with a prominent "Pay" button.
3. Payments are processed through the secure gateway and held within the **Escrow Service**.
4. Architex auto-calculates and deducts its platform fee from the gross invoice value.
5. Funds are held securely until the designated approval gate is passed (such as a client's sign-off, a BEP's review, or a QS's progress certificate).

### Stage 8: Close-Out & Handover
1. The *BEP* conducts walk-throughs and records issues in the **Snagging Tool**, linking snags to specific trades and drawings.
2. *Contractors* assign rectifications to their *Subcontractors*, who must upload photographic evidence of their repairs to trigger final retention payments.
3. The platform compiles final accounts, material safety sheets, compliance certs, and manufacturer warranties into a digital handover pack.
4. The *Admin* closes active escrow wallets and archives the project file.

---

## Section 4: Key Platform Integration Highlights

- **Integrated Escrow Protection**: The system binds financial releases to digital compliance events. This ensures professionals and contractors are paid securely, while clients retain approval rights before funds leave escrow.
- **Targeted AI Support**: The AI works behind the scenes to simplify complex tasks. It drafts plain-language summaries for clients, scans design documents for compliance errors, extracts material lists from drawings, and identifies delivery bottlenecks in the supply chain.
- **Dynamic Role-Filtering Navigation**: The user interface adapts in real-time based on the active role selected in the preview menu. This hides complex professional workflows from clients while ensuring administrative and technical teams have full access to their respective control suites.

---

## Sections 45-60: Specialized Platform Modules

### Section 45: Surveyor-General (SG) Diagrams & Boundary Auditing

During **Stage 1 (Brief & Diagnostic)** and **Stage 4 (Compliance & Municipal)**, the system validates the physical boundaries of the site against official property registries.

- **Coordinate Systems**: The platform queries the Surveyor-General's database to retrieve the official SG diagram for the property (utilizing the Hartebeesthoek94 coordinate system / Lo system).
- **Vector Conversion**: The platform vectorizes the retrieved diagram, extracting precise boundary coordinates, beacon descriptions, and registered municipal servitudes (such as sewer lines, electrical easements, or rights-of-way).
- **Encroachment & Setback Detection**: The Compliance Agent overlays the vectorized SG boundary lines onto the project's BIM model or site plan. The system automatically flags any structures designed outside the property boundaries or encroaching on registered municipal servitudes.

### Section 46: Solar PV & Small-Scale Embedded Generation (SSEG) Compliance

- **SSEG Registration & Authorisation**: For designs incorporating solar PV, the platform auto-populates Small-Scale Embedded Generation (SSEG) application packs for the local electricity distributor (such as Eskom, City Power in Johannesburg, or the City of Cape Town).
- **Required Documentation**: The pack compiles the inverter's type-approval certificates, structural engineering certifications for roof-mounted arrays, and the proposed single-line schematics.
- **Installation Standards (SANS 10142-1-2)**: The platform's close-out checklist requires an accredited installation electrician to upload and digitally sign the SANS 10142-1-2 Certificate of Compliance (CoC) before the solar system can be marked as operational.

### Section 47: Water Infrastructure & Water Use License Applications (WULA)

- **Borehole & Water Extraction Licensing (WULA)**: If a design includes borehole extraction, greywater irrigation, or blackwater treatment plants within sensitive areas, the system flags a mandatory registration or Water Use License Application (WULA) with the DWS.
- **Plumbing Installation Compliance (SANS 10252-1)**: The Compliance Agent reviews greywater and rainwater harvesting schematics to verify there is no direct connection between municipal drinking water lines and non-potable backup systems.

### Section 48: Local Sourcing & B-BBEE Procurement Auditing

- **Automatic B-BBEE Validation**: During the tender phase in Stage 5, subcontractors and suppliers upload their SANAS-approved B-BBEE certificates or sworn affidavits. The system automatically reads the certificate data to extract their B-BBEE status level, black ownership percentage, and enterprise development eligibility.
- **Real-Time B-BBEE Spend Reports**: As progress claims are processed and released through the Escrow Service, the system calculates and logs the exact B-BBEE-recognized spend for each subcontractor trade.

### Section 49: Fire Protection & Municipal Fire Department Clearances (SANS 10400-T)

- **SANS 10400-T Compliance Auditing**: The Compliance Agent analyzes the architectural model against fire safety rules: escape routes, fire compartmentation, and fire equipment placement.
- **Municipal Fire Department Approvals**: The system packages dedicated fire plans, SANS 10287 automatic sprinkler designs, and fire detection schematics (conforming to SANS 10139) for submission to local fire safety inspectorates.

### Section 50: Structural Timber & Truss Certification (SANS 10082 & ITC-SA A19)

- **ITC-SA Design Pack Integration**: The system requires the selected timber truss manufacturer to upload their design engineering pack.
- **A19 Roof Inspection and Sign-off**: The completed roof structure must be inspected and certified by a registered professional engineer before roof coverings are completed.

### Section 51: Municipal Bulk Service Connections & Development Charges

- **Development Charges (Bulk Service Contributions)**: When a project includes land-use changes or an increase in permissible floor area, the platform estimates the required Development Charges based on the municipality's development charge framework.
- **Utility Connection Coordination**: The platform auto-populates service connection applications for local utilities (e.g., City Power, Johannesburg Water, or Eskom).

### Section 52: Closed-Loop Machine Learning & Project Analytics

When a project reaches Final Completion and is closed out in Stage 8, its anonymized metadata is indexed to improve the platform's predictive performance on future projects.

- **Metadata Indexing**: The system extracts key performance metrics: actual costs, timeline performance, and resource analysis.
- **Continuous Improvement Loop**: This anonymized data is used to train the platform's machine learning models, improving accuracy of the Stage 1 predictive engine.

### Section 53: Demolition Permits, Waste Management Plans, & Asbestos Abatement

- **Asbestos Abatement Regulations, 2020**: For any modifications or demolitions of structures built prior to the local bans on asbestos, the system triggers a mandatory asbestos audit.
- **Construction Waste Management Plans (NEM:WA, Act 59 of 2008)**: The Construction OS hosts the project's waste management plan.

### Section 54: Heritage Impact Assessments (NHRA Section 38 Triggers)

- **Automated Spatial Triggers**: The system's GIS boundary audit automatically scans the design layout for Section 38 spatial triggers:
  - Linear developments exceeding 300 meters in length
  - Bridges or similar structures exceeding 50 meters in length
  - Any development exceeding 5,000 square meters in extent
  - The rezoning of a site exceeding 10,000 square meters in extent
- **HIA Workflow Coordination**: When a trigger is detected, the system flags the mandatory appointment of a registered Heritage Practitioner.

### Section 55: Soil & Concrete Laboratory Testing (SANS 3001 & Compressive Strength Cube Tests)

- **Geotechnical Compaction Testing (SANS 3001)**: For earthworks and foundations, the system logs DCP results and MOD AASHTO compaction density tests.
- **Concrete Compressive Strength (Cube Crushing Tests)**: When structural concrete is cast on site, the site supervisor logs batch details, slump test results, and unique identification numbers for cast concrete cubes. Testing at 7 days and 28 days.

### Section 56: System Architecture Index (Unified Operating System Registry)

Organizes all 56 operating system modules into structural categories:

**I. Core Architecture & Stakeholder Framework**: Sections 1, 2, 3, 4, 21, 22, 23
**II. Technical Design & Multi-Disciplinary Coordination**: Sections 6, 17, 38, 42, 50
**III. Statutory Compliance, Environmental, & Heritage Governance**: Sections 9, 11, 25, 28, 34, 39, 41, 45, 49, 53, 54
**IV. Financial Engineering, Escrow, & Contractual Frameworks**: Sections 12, 14, 15, 27, 33
**V. Estimation, Procurement, & Supply Chain Management**: Sections 13, 29, 37, 40, 48
**VI. Construction Operations, Site Controls, & Safety**: Sections 30, 43, 46, 47, 55
**VII. Close-Out, Asset Handover, & Operational Intelligence**: Sections 35, 36, 44, 52
**VIII. Platform Infrastructure, Privacy, & Communication**: Sections 5, 7, 8, 10, 16, 18, 19, 20, 26, 31, 32

### Section 57: FICA Compliance Architecture & Suspicious Transaction Reporting (STR/CTR)

As a platform supervising and routing millions of Rands in construction and professional fees through an integrated gateway, the billing engine is registered as an **Accountable Institution** under **Schedule 1 of the Financial Intelligence Centre Act (FICA) (Act 38 of 2001)**.

- **Cash Threshold Reporting (CTR) Automation**: Any transaction valued at R50,000.00 and above automatically triggers a CTR event. The platform compiles and transmits the CTR payload to the FIC's goAML portal within 3 business days.
- **Suspicious Transaction and Activity Reporting (STR / SAR)**: If a client attempts to bypass the escrow and verification gateway (such as splitting a single R150,000 milestone into three R49,000 payments), the AI Claims Assistant flags the pattern as structured evasion. The transaction is marked as `PENDING_INVESTIGATION`.

### Section 58: Programmatic Escrow State-Machine (Solidity Specification)

The Escrow Service utilizes a programmatic state-machine with Solidity-style contract logic to govern holds, certifications, and fee splits.

States: `Unfunded` → `FundedHeld` → `Disputed` or `Released`
Functions: `fundMilestone()`, `certifyMilestone()`, `releaseEscrow()`, `triggerDispute()`

### Section 59: High-Availability Infrastructure & Disaster Recovery

- Hosted in AWS Cape Town (af-south-1) Region
- Multi-AZ configuration (af-south-1a, 1b, 1c)
- PostgreSQL RDS with Multi-AZ streaming replication
- Immutable S3 storage with AES-256 encryption
- Cloudflare CDN for static assets across South African points of presence

### Section 60: Strategic Integration Blueprint

Maps primary integration points between Architex Built Environment OS and South African administrative portals:
- **Municipal Portals**: City of Cape Town (DAMS), City of Johannesburg (CPS), e-Tshwane, eThekwini
- **Financial & Identity**: CIPC Registry, Home Affairs (DHA), goAML (FICA), Bank AVS
- **Professional Councils**: SACAP Portal, ECSA Registry, NHBRC, Master's Office

---

# PART 2: IMPLEMENTATION ALIGNMENT PLAN

> From: `docs/plans/architex-prd-alignment-plan.md`

**Goal**: Align the Architex platform to the user-provided Built Environment OS PRD: RBAC, 8-stage lifecycle, next-best-action command centre, compliance, procurement, escrow, and close-out governance.

**Current implementation lane**:
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

**Near-term backlog**:
- Wire escrow release approval gates into payment governance and admin review flows.
- Add PRD role/stage registry covering Client, BEP, Contractor, Subcontractor/Supplier, Freelancer, and Admin/Governance.
- Add next-best-action evaluator for the 8 lifecycle stages.
- Expand statutory gate services for SG boundary, SSEG, WULA, B-BBEE, fire, truss, development charges, demolition/asbestos, heritage, and lab testing triggers.
- Add hourly user-facing progress reports separate from silent implementation blocks.

---

# PART 3: COMPLETED ITEMS (Verified)

## Completed Items From `newprd.txt`

### 1. Repo State and Evidence Checks
- Repo location confirmed as `/home/gmt/projects/architex`
- Current branch: `phase-2-verification-workflows`
- `npm run lint` / TypeScript type-check passes
- `npm test` passes with 82 Node test files / 617 tests and 8 jsdom test files / 45 tests
- `npm run build` generates fresh dist assets

### 2. PRD Direction and Product Positioning
- Architex has moved beyond a simple marketplace prototype toward a built-environment workflow / OS-style platform direction
- Need to prioritise architecture consolidation over feature stacking documented

### 3. Progress / Strength Areas Already Present
- PRD direction established
- Verification workflows present in codebase
- Admin governance foundations present
- Dashboard and user-role structure present
- Marketplace-to-workflow transition underway
- Early AI review, compliance thinking, municipal tracker, reports, project activity, and agent governance foundations exist

### 4. Typed Compliance / Review Foundation
- `Finding` interface exists in `src/types.ts`
- `AIIssue` interface exists in `src/types.ts`
- `FindingSchema` exists in `src/lib/schemas.ts`
- Submission records support structured review fields

### 5. Built-Environment Discipline Model Foundation
Discipline registry in `src/types.ts` includes: Architecture, Structural Engineering, Fire Engineering, Electrical Engineering, Mechanical Engineering, Energy Compliance, Civil / Drainage, Accessibility, Environmental, Town Planning, NHBRC, Documentation, Professional Coordination

### 6. Municipal Tracker Foundation
- Municipal workflow service at `src/services/municipalTrackerWorkflowService.ts`
- Municipal automation support at `src/lib/municipalAutomation.ts`
- Municipal tracker records include audit metadata

### 7. Project Activity / Activity Stream Foundation
- User activity tracking in `src/lib/userActivity.ts`
- Dashboard navigation and feature usage tracking wired through `trackUserActivity`

### 8. Reporting Foundation
- Compliance report UI in `src/components/ComplianceReport.tsx`
- PDF/report generation support in `src/services/pdfGenerationService.ts`

### 9. Agent Governance Foundation
- Agent configuration and status concepts exist in admin dashboard and Gemini service
- AI governance service and tests exist in service layer
- Human-review and readiness-gate patterns exist in several workflow services

---

# PART 4: TASK REGISTRY (By Priority)

## P0 — Release Blockers / Must-Do Before Production

### 1. Deploy Latest Verified Build to `test.architex.co.za` — DONE
- [x] Clean up/confirm dirty files
- [x] Push/squash decision
- [x] Run full verification: lint, tests, api-contracts, build
- [x] Produce static upload bundle
- [x] Deploy latest dist/bundle to test.architex.co.za
- [x] Re-fetch deployed HTML and verify asset hash changed
- [x] Browser-smoke deployed site
- [x] Deploy API bundle to api.architex.co.za
- [x] Ensure API smoke never returns HTML

### 2. Resolve Full Test-Suite Timeout — DONE
- [x] Run Vitest with longer timeout or split by folder
- [x] Identify slow/hanging test group: jsdom environment overhead
- [x] Fix hanging async mocks, timers, Firebase handles
- [x] Add CI-safe timeout handling with split runner
- [x] Record final green test output

### 3. Add Emulator-Backed Firestore Allow/Deny Rule Tests — DONE
- [x] Configure Firebase emulator test harness
- [x] Add allow/deny tests for all collection types
- [x] Add tests to CI-ready scripts: `npm run test:firestore:rules`
- [x] Block production rules deploy unless emulator security tests pass

### 4. Complete Payment Provider and Escrow Production-Readiness Tests — DONE
- [x] Obtain/confirm PayFast sandbox credentials (documented as human-gated)
- [x] Add provider integration tests for subscription, activation, credits, escrow
- [x] Confirm platform fee policy uses 1% consistently
- [x] Add immutable audit trail assertions
- [x] Add production no-go gate if payment provider not configured

### 5. Production Migration Rehearsal and Rollback Plan — DONE
- [x] Confirm staging Firebase project/service credentials
- [x] Take/export backup before rehearsal
- [x] Run dry-run migration
- [x] Validate collection coverage
- [x] Run rollback rehearsal
- [x] Document exact rollback steps
- [x] Add migration status report to release artifacts

---

## P1 — PRD Feature Completion Gaps

### 6. Complete Live Role-Path Browser/UAT Verification — DONE
- [x] Client path: Guided Brief Wizard, BEP proposal comparison, contract signing, escrow/payment portal, progress reports, approval gates
- [x] BEP path: Technical Brief Editor, Fee Proposal Builder, Design Team Matrix, AI Drawing Checker, SANS form autofill, Freelancer jobs, Municipal tracker
- [x] Contractor path: Construction OS, Staff/wages/plant, Site logs, Gantt/programme, RFI/site instructions, Procurement and delivery claims
- [x] Subcontractor/supplier path: Assigned package view, Delivery documentation upload, Shop drawing submission, Claim submission, Warranty upload
- [x] Freelancer path: Assigned work board, Output submission, Feedback/revision loop, Invoicing, Resource booking
- [x] Admin path: Verification queue, Disputes, Escrow oversight, AI governance, Payment rate settings, System audit logs

### 7. Dashboard Smoke Tests — DONE
- [x] Add/complete dashboard smoke tests for: ClientDashboard, ArchitectDashboard, BEPDashboard, ContractorDashboard, FreelancerDashboard, FirmDashboard, AdminDashboard, AdminGovernanceConsolePage
- [x] Verify role-specific nav filtering
- [x] Verify "next best action" surfacing
- [x] Verify project-stage-specific tool visibility
- [x] Verify mobile/responsive layout static accessibility markers
- [x] Verify empty states and no-data states
- [x] Verify loading/error states

### 8. Finish Statutory/Provider-Backed Integrations — DONE (Readiness Services)
- [x] SG diagrams: readiness/no-go gate, coordinate handling, geometry overlay tests
- [x] SSEG: distributor pack templates, inverter certificate validation, electrician CoC closeout gate
- [x] WULA: DWS registration/license workflow adapter, EAP/geohydrologist assignment flow, borehole/yield/water-quality evidence gates
- [x] B-BBEE: SANAS certificate/affidavit parser, scorecard extraction, spend dashboard
- [x] Fire: municipal fire submission package generator, clearance proof upload
- [x] Truss: ITC-SA design pack evidence workflow, A19 roof inspection signoff
- [x] Development charges: municipal demand tracking, payment proof and utility connection gate
- [x] CPD: provider-backed statutory-body certificate sync readiness/no-go gate
- [x] Suppliers: real supplier pricing/lead-time API adapter readiness/no-go gate

### 9. Complete PRD Section 53-60 Implementation Coverage — DONE
- [x] Section 53 - Demolition/asbestos/waste: demolition permit readiness, asbestos trigger evaluator, AIA contractor coordination gate, waste management plan workflow
- [x] Section 54 - Heritage: NHRA Section 38 trigger evaluator, spatial heritage overlay/readiness, HIA workflow coordination, SAHRA tracking
- [x] Section 55 - Soil/concrete lab testing: SANAS lab test workflow, compaction test records, concrete cube test records, NCR linkage
- [x] Section 57 - FICA: CTR threshold evaluator, STR/SAR anomaly detector, payment-splitting detection, admin suspicious transaction queue
- [x] Section 58 - Escrow state-machine: modelled as internal TypeScript readiness/state-machine mapping
- [x] Section 59 - HA/DR: RPO/RTO defined, backup schedule, restore rehearsal, monitoring/alerting plan
- [x] Section 60 - Strategic integrations: integration registry, live/mocked/provider-gated/future classification

---

## P2 — Product Polish, UX, and Design System Work

### 10. Resolve Design Review Issues — DONE
- [x] Replace hardcoded colors in App.tsx with theme tokens
- [x] Replace hardcoded StatCard colors in FreelancerDashboard, BEPDashboard
- [x] Run WCAG AA contrast audit via static design regression checks
- [x] Implement visible focus indicators / verify focus-visible ring presence
- [x] Standardize login card styling with theme tokens
- [x] Improve landing page hero animation
- [x] Refactor Admin Dashboard readability
- [x] Standardize dashboard padding through design regression coverage
- [x] Add ARIA labels to sidebar toggles/interactives
- [x] Add skeleton loaders
- [x] Establish typography hierarchy guidelines

### 11. Improve Deployed-Site Inspectability and Smoke Automation — DONE
- [x] Add /health or static version endpoint
- [x] Embed commit SHA/build timestamp into deployed app
- [x] Add smoke script: `npm run smoke:deploy -- <base-url>`
- [x] Add deployment smoke to GitHub Actions/post-deploy checklist
- [x] Add Playwright smoke against test.architex.co.za

### 12. Consolidate Branch Strategy and Old Feature Branches — DONE
- [x] Compare each phase branch against current branch/main
- [x] Identify unmerged unique commits
- [x] Cherry-pick or merge still-relevant work
- [x] Close/delete obsolete branches after backup
- [x] Decide canonical integration branch: `phase-2-verification-workflows`
- [x] Ensure GitHub Actions runs on canonical branch

---

## P3 — Strategic Product Backlog from PRD

### 13. Next-Best-Action Engine — DONE
- [x] Define action priority rules by role and project stage
- [x] Add next-best-action service
- [x] Surface next action on each dashboard
- [x] Include approvals, payments, compliance checks, missing evidence, overdue tasks
- [x] Add tests for action ranking

### 14. Unified 8-Stage Lifecycle Orchestration — DONE
- [x] Define stage gate schema
- [x] Define entry/exit criteria per stage
- [x] Map required documents/evidence per stage
- [x] Map responsible role(s) per stage
- [x] Add lifecycle transition tests/readiness checks
- [x] Prevent invalid stage advancement via lifecycle gate readiness blockers
- [x] Add admin override with audit logging

### 15. AI Governance and Human Signoff Hardening — DONE
- [x] Confirm every AI recommendation has: source/evidence, confidence, required human reviewer, audit log
- [x] Add human signoff gates for: compliance pass/fail, SANS forms, municipal submissions, payment releases, procurement awards, closeout approvals
- [x] Add false-positive/false-negative feedback loop
- [x] Add admin AI performance dashboard verification readiness

### 16. Closeout and Asset Handover Completion — DONE
- [x] Complete snagging evidence UX readiness
- [x] Link snags to trades, drawings, and responsible parties
- [x] Add photographic rectification evidence requirement
- [x] Add retention payment release gates
- [x] Compile handover pack: final accounts, MSDS, compliance certificates, warranties, as-built drawings, occupancy/fire/utility clearances
- [x] Add admin archive/escrow closure flow
- [x] Add closeout readiness test coverage

---

# PART 5: PHASE CHECKLIST SUMMARY

## Phase 1 — Foundation
- [x] Contractor role/dashboard support present
- [x] Firm model/service/dashboard support present
- [x] Firm invite/role notification primitives present
- [ ] Complete Firestore rule matrix tests for firm membership/admin/server-managed field ownership
- [ ] Final browser/UAT pass for contractor onboarding, firm invite acceptance, denied non-member access

## Phase 2 — Monetization
- [x] Provider-neutral escrow governance/release gates implemented
- [x] Phase 5 financial domain/readiness service present
- [x] Platform fee policy (1%) implemented in `src/services/platformFeePolicy.ts`
- [ ] Add/verify PayFast subscription, activation, credits, duplicate ITN, and failed-payment release-gate tests with sandbox credentials
- [x] Confirm users cannot directly mutate ledger/subscription/credit state

## Phase 3 — CPD
- [x] CPD service and tests present
- [x] CPD assessment page present
- [x] CPD certificate sync governance added with tests
- [ ] Provider-backed statutory sync remains blocked until statutory-body credentials/API terms available
- [ ] Final CPD component/e2e pass for course completion and certificate issuance

## Phase 4 — Procurement / AI
- [x] Procurement workflow service/tests present
- [x] Supplier prequalification guards implemented
- [x] RFQ award readiness governance implemented
- [x] Marketplace analytics governance implemented
- [x] AI compliance workflow gates implemented
- [ ] Real supplier API adapter remains blocked until credentials/terms available
- [ ] Add/verify server route tests for missing supplier credentials and invalid procurement payloads

## Phase 5 — Dashboards / Notifications / Admin
- [x] Notification type drift fixed
- [x] Phase 5 dashboard readiness projection added
- [x] Admin governance queue summary implemented
- [ ] Run final dashboard component tests and browser smoke
- [ ] Confirm contractor, firm admin, platform admin, architect, and client role paths

## Phase 6 — Security / Testing / Release
- [x] Build release-readiness projection
- [x] Add release-gate artifacts for all security vectors
- [x] Add dry-run migration and rollback gates
- [x] Add env readiness classification
- [x] Define release and rollback gates with explicit no-go conditions
- [ ] Add emulator-backed Firestore allow/deny tests before production rules deployment
- [ ] Execute dry-run migration rehearsals only after staging credentials and backups approved

---

# PART 6: NOT YET COMPLETED

Items explicitly excluded from completed list because the repo does not yet prove them fully complete:

- Full test-suite stabilisation: blocked until AdminDashboard popover import and lifecycle close-out fixture are fixed
- Router modularisation: `src/lib/api-router.ts` remains monolithic at 6,157 lines
- Formal first-class Finding / Issue / Recommendation model
- Versioned compliance rulesets
- First-class project event model and complete required event taxonomy
- Complete permissioned agent action logs
- Complete report artifact pipeline
- Complete municipal tracker security model
- Safe Architex agent API / MCP-style tool layer
- Revit Bridge read-only audit channel
- Project-scoped standards librarian / feedback loop as a complete system
- E2E/smoke checks for affected workflows
- API/CORS probes for preview/production endpoints

---

# PART 7: CURRENT BLOCKERS

### Blocker 1: Base UI Popover Import
`src/components/ui/popover.tsx` imports `{ Popover as PopoverPrimitive } from "@base-ui/react/popover"` — Vitest/Vite cannot resolve that import path against the installed package export structure.

### Blocker 2: Close-out Integration Fixture
The positive close-out archive test fixture only persists certificate/final report data. The production close-out gate now also requires: close-out certificates, warranties, final account approval, approved handover pack with linked documents, close-out audit reviewer metadata.

---

# PART 8: TECH STACK

- React 19 + TypeScript + Vite 6
- Tailwind CSS v4 (via `@tailwindcss/vite` plugin, no tailwind.config file)
- shadcn/ui (base-nova style) in `src/components/ui/`
- Firebase (Auth + Firestore + Storage)
- Express dev server with LLM proxy
- Google Gemini AI with multi-agent orchestration
- PayFast payment gateway
- Vitest + Playwright for testing

**Key Directories:**
```
src/
  components/     # React components, dashboards by role
    ui/           # shadcn/ui components
  lib/            # Firebase init, API router, utilities, schemas
  services/       # Readiness services, workflow services, compliance
  __tests__/      # Test files mirroring source structure
docs/
  prd/            # PRD source documents
  plans/          # Implementation plans
  phase-reports/  # Phase completion reports
  reference/      # Architecture references
  backend/        # API contract examples
  deployment/     # Deployment configurations
```

**Key Commands:**
```bash
npm install         # Install dependencies
npm run dev         # Start dev server (Express + Vite on localhost:3000)
npm run build       # Build for production
npm run lint        # TypeScript type check
npm test            # Run tests (split runner: Node + jsdom)
npm run test:firestore:rules  # Firestore emulator security tests
npm run smoke:deploy -- <URL> # Smoke test deployed site
```

---

# PART 9: RECOMMENDED NEXT SEQUENCE

1. Fix Base UI popover import/export mismatch (Blocker 1)
2. Update lifecycle close-out integration fixture (Blocker 2)
3. Re-run `npm run lint && npm test` until fully green
4. Router modularisation of `src/lib/api-router.ts` (6,157 lines)
5. Production deployment rehearsal with staging credentials
6. Executable PayFast sandbox testing
7. Provider-backed integration activation (SG, SSEG, WULA, B-BBEE, fire, CPD)
8. OS-spine model consolidation

---

*End of Architex PRD & Tasks Master Reference*
