# Architex Comprehensive User Toolset Brief

Version: 0.1 draft
Scope: built-environment operating toolset for all Architex user roles
Companion to: `ARCHITEX_BEP_CALCULATOR_TOOLBOX_BRIEF.md`
Repo inspected: `https://github.com/cp-coder9/arc-1`, branch `main`, head `8541ede`

## 1. Key conclusion

Architex should not only add calculators. It should become a phase-aware, agent-assisted built-environment operating system: a single project workspace where every user sees the tools they need at the exact moment they need them.

The examples supplied are useful because they show different parts of the workflow:

- GoBuild360: supplier/customer portal, quote/order/delivery tracking, ERP integration, materials/BoM workflows.
- Fencalc: focused SANS 10400-XA compliance calculator with project dashboard and council-ready reports.
- BuildSmart/RIB: construction ERP backbone: procurement, payroll, plant, subcontractors, cost control, inventory and accounting.
- AllWage: South African workforce attendance/activity/payroll workflows, including WhatsApp/self-service patterns.
- ClickUp: convenient task/project views, statuses, dashboards, forms, docs, automations and guest collaboration.
- Fresh Projects: A&E practice management: CRM, fee proposals, resource planning, timesheets, profitability, forecasting and accounting integrations.

Architex should duplicate the useful workflow patterns, not proprietary implementations or UI. The Architex version must be South African, construction-native, phase-aware, project-record based, and agentic.

## 2. Current Architex repo comparison

The current repo already includes important foundations:

| Area | Current evidence | Status | Gap / next toolset layer |
|---|---|---:|---|
| Role dashboards | `ClientDashboard`, `ArchitectDashboard`, `BEPDashboard`, `ContractorDashboard`, `FirmDashboard`, `AdminDashboard` | Partial | Add phase-aware tool launchers and role-specific toolboxes. |
| Fee estimator | `FeeEstimator`, `feeEstimatorService.ts` | Partial | Keep separate from working tools; connect to proposal/appointment/payment workflow. |
| Tender/bid | `TenderWizard`, `BidSubmission`, `BidEvaluation`, `tenderService.ts`, `bidComparisonService.ts` | Partial | Add BOQ, rate build-up, supplier RFQ, subcontract adjudication, tender clarifications. |
| Construction programme | `GanttChart`, `constructionService.ts` | Partial | Add dependencies, baseline/revisions, resource/plant loading, lookahead plans. |
| Site logs | `SiteLogManager`, `constructionService.ts` | Partial | Add labour, plant, weather, deliveries, activities, photos, productivity and daywork capture. |
| RFIs | `RFIManager`, `constructionService.ts` | Partial | Add drawing links, cost/time impact, consultant routing, variation linkage. |
| Invoices/payments | `InvoiceManagement`, `paymentService.ts`, `financialLedgerService.ts` | Partial | Add payment certificates, retentions, claim valuations, 1% platform fee split, escrow release. |
| Files/documents | `FileManager`, upload service | Partial | Add document control registers, revisions, transmittals, approvals, submittals. |
| Teams/permissions | `teamService.ts`, `permissionService.ts`, `firmService.ts` | Partial | Add staff/resource planning, role workload, subcontractor/supplier portal access. |
| Agents | `services/agents/*`, `agentSelectionService.ts`, `geminiService.ts` | Partial | Add Tool Router, Workflow Orchestrator, Cost Agent, Site Agent, Procurement Agent, Compliance Agent. |
| Knowledge/compliance | `knowledgeService`, `councilSubmissionService`, `ComplianceReport` | Partial | Add SANS/NBR/municipal checklists, NHBRC/CIDB compliance and expiry tracking. |
| AI drawing / model review | File upload + agents exist, but no dedicated drawing reader/checker found | Missing | Add drawing-ingestion agents that read PDF, DWG/DXF, RVT/IFC/BIM, image scans and schedules, then check SANS/NBR, land-use and municipality-specific rules with human sign-off. |
| Plant/equipment | No clear dedicated module found | Missing | Add plant register, allocation, maintenance, utilisation and job-costing. |
| Workforce/payroll | No clear dedicated module found | Missing | Add attendance, timesheets, activity capture, payroll export, SA statutory integration. |
| Inventory/procurement | No clear dedicated module found | Missing | Add requisitions, POs, GRNs, delivery tracking, stock/materials-on-site, invoice matching. |
| BoM/BoQ/programme/drawdown linkage | Tender, Gantt and payment foundations exist separately | Missing | Add a linked estimating chain: drawing takeoff → pre-populated BoM/BoQ → editable quotes → programme activities → cashflow/drawdown/payment schedules. |
| Resource sharing / freelancer marketplace | No dedicated module found | Missing | Add vetted shared-resource centre and candidate-professional/freelancer workflows across BEP disciplines, as a revenue stream and capacity layer. |

## 3. Product principle: convenient agentic tool access

Do not make users hunt through a giant tools menu. Architex should expose tools through four convenient surfaces:

1. Role toolbox
   - A persistent toolbox in each dashboard, filtered by role and project stage.

2. Phase workspace
   - Tools shown inside the current project phase: brief, appointment, design, council, tender, construction, closeout.

3. Contextual agent prompts
   - Agent sees a message, upload, drawing revision, site log, tender package or payment claim and suggests the next tool.

4. Object action menus
   - Every project object has tool actions: drawing → compare/revise/RFI; tender line → rate build-up/RFQ; site log → daywork/claim; invoice → payment/escrow/reconciliation.

5. AI-readable drawing intelligence
   - Drawings and models should be first-class data sources, not just uploaded files. Agents must be able to read PDFs, scanned/image drawings, DWG/DXF, IFC/BIM exports, Revit-derived schedules, Excel schedules and marked-up site photos where technically possible.
   - Extracted data should include rooms, areas, levels, walls, openings, windows, doors, stairs, roof geometry, fire routes, parking counts, site coverage, boundary/building lines, fixtures, finishes, schedules, notes and title-block revision metadata.
   - The output must always state confidence, source drawing revision, assumptions and items needing professional/manual verification.

6. Linked commercial chain
   - The same extracted project information should be reusable through the commercial workflow: drawing takeoff → BoM → BoQ → contractor/subcontractor/QS review → editable quotes → programme activities → cashflow/drawdown schedule → payment valuations and escrow release milestones.
   - Quantities should be pre-populated but never silently final. Contractors, subcontractors and QSs must be able to edit, override, qualify, exclude and version their review.

## 4. Comprehensive toolset families

### 4.1 Client / Developer tools

Purpose: make the client informed and transaction-ready without overwhelming them.

Tools:
- Project brief builder
- Budget range and affordability tool
- Soft-cost estimator
- Professional/team selection comparator
- Proposal comparison and appointment tool
- Escrow/payment schedule viewer
- Approval dashboard
- Decision log
- Document request checklist
- Variation approval tool
- Progress/payment certificate viewer
- Handover/closeout checklist

Agent support:
- Briefing Agent asks missing questions.
- Budget Agent warns if scope and budget are misaligned.
- Approval Agent summarises what needs client decision.
- Payment Agent explains amount payable, escrow, Architex line item and release conditions.

### 4.2 Architect / Lead consultant tools

Tools:
- Client brief intake and scope builder
- Fee/proposal builder
- Appointment and terms builder
- Consultant team builder
- Project phase/stage plan
- Drawing/document register
- AI drawing reader and compliance pre-check
- Land-use / zoning / municipal rule pre-check
- Submission readiness checklist
- SANS/NBR compliance checklist launcher
- Consultant instruction/RFI manager
- Design change register
- Council submission tracker
- Tender package builder
- Bid evaluation/adjudication assistant
- Site inspection and architect instruction tools
- Lead consultant snag/punch-list inspection tool
- Snag allocation, status and re-inspection dashboard
- Payment certificate review tool
- Closeout/handover pack builder

Agent support:
- Lead Consultant Agent routes actions to BEPs/contractors/client.
- Drawing Intelligence Agent reads uploaded drawings/models/schedules and creates extractable project facts.
- Compliance Agent checks NBR/SANS/land-use/municipal missing items against those facts.
- Document Control Agent manages revision/transmittal discipline.
- Snag Agent turns architect/lead-consultant site inspections into allocated, photo-linked snag items and closeout evidence.

### 4.3 BEP / consultant tools

Covers engineers, QS, town planners, land surveyors, energy consultants, fire consultants, interior designers, landscape architects and other specialists.

Tools:
- Discipline-specific calculator toolbox
- Consultant proposal builder
- Deliverables checklist by phase
- Discipline RFI/response manager
- Compliance/rational-design evidence register
- Drawing/model review and comment tool
- AI-assisted discipline drawing takeoff/check tool
- Report builder
- Time and expense capture
- Resource/capacity planner for practice users
- Professional sign-off register

Agent support:
- Discipline Agent suggests applicable calculator/checklist.
- Evidence Agent packages calculations, assumptions and report attachments.
- Sign-off Agent ensures professional responsibility is explicit.
- Candidate Professional Agent routes candidate-professional/freelancer outputs to registered professional review where required.

### 4.4 Contractor tools

Tools:
- Tender opportunity tracker
- Tender package review checklist
- AI drawing takeoff to pre-populated BoM/BoQ
- BOQ/takeoff and quantity calculators
- Rate build-up calculator
- Supplier/subcontractor RFQ tool
- Editable construction quote builder linked to programme and drawdown schedule
- Bid programme and methodology builder
- Bid qualification/exclusions builder
- Award/contract setup tool
- Construction programme / Gantt baseline
- Lookahead planner
- Site diary/log manager
- Labour/crew productivity manager
- Plant/equipment allocation manager
- Procurement/requisition/PO/GRN manager
- Subcontractor package manager
- Variation and claims manager
- Payment valuation/certificate builder
- Defects/snag and closeout manager

Agent support:
- Tender Agent decomposes tender requirements and missing info.
- BoM/BoQ Agent converts drawings, schedules and specifications into editable contractor/QS/subcontractor review packs.
- Cost Agent maintains budget, allowable, commitments, actuals and forecast final cost.
- Site Agent converts daily records into progress/claim evidence.
- Procurement Agent routes RFQs, POs, deliveries and invoice matching.
- Programme/Drawdown Agent links BOQ items to programme activities, cashflow, drawdowns and payment valuation milestones.

### 4.5 Subcontractor tools

Tools:
- Package invitation and scope review
- Quote/rate build-up tool
- Material/labour/plant allowance calculator
- Package-specific BoM/BoQ review and qualification
- Editable subcontract quote linked to contractor programme and drawdown/payment application
- Programme availability and crew planner
- RAMS/safety-file upload checklist
- Daily progress and photos
- Daywork sheet
- Variation claim builder
- Payment application/certificate tracker
- Retention release tracker

Agent support:
- Package Agent highlights inclusions/exclusions.
- Quote Agent checks whether package quantities, exclusions and lead times align with the main programme and payment milestones.
- Claim Agent helps assemble variation/daywork evidence.
- Compliance Agent tracks expired safety/statutory documents.

### 4.6 Supplier / merchant tools

Inspired by GoBuild360-style material portal.

Tools:
- Supplier catalogue and price list manager
- Project BoM/RFQ response portal
- Quote comparison normaliser
- Order confirmation and lead-time tool
- Delivery scheduling and proof-of-delivery tool
- Stock/materials-on-site tracker
- Invoice matching and payment tracker
- Alternative product/substitution proposal tool with professional approval routing

Agent support:
- BoM Agent converts takeoff/calculator outputs into supplier RFQs.
- Procurement Agent compares quotes on delivered cost, lead time, exclusions and pack sizes.
- Delivery Agent reconciles PO, GRN, POD, invoice and payment.

### 4.7 Site manager / clerk of works tools

Tools:
- Daily diary: weather, labour, plant, visitors, deliveries, work areas
- Photo/video capture and tagging
- Activity progress capture by zone/work package
- Inspection checklist
- NCR/defect/snag tool
- Architect/lead-consultant snag walk tool with photos, location pins, responsible party and re-inspection state
- Toolbox talk and safety observation capture
- Material delivery ticket capture
- Plant utilisation and fuel log
- Delay event and site instruction capture
- Weekly report generator

Agent support:
- Site Diary Agent turns quick notes/photos into structured logs.
- Risk Agent spots missing photos, no logs, overdue RFIs and delays.
- Claims Agent flags potential cost/time notices early.

### 4.8 Freelancer / candidate professional tools

A freelancer can be a candidate professional or independent practitioner in any BEP category: candidate architect, candidate engineer, candidate QS, candidate town planner, draughtsperson, technologist, inspector, energy modeller, visualiser, document controller, contract admin support, site assistant or specialist consultant support. Treat this as both a workflow and a marketplace/resource layer.

Tools:
- Freelancer profile, portfolio, discipline and registration/candidate-status manager
- Availability/capacity calendar
- Rate card and quote builder
- Task/package invitation and acceptance workflow
- Scope, deliverables and review-gate checklist
- Timesheet, expense and progress claim tool
- Candidate-professional supervision/sign-off routing
- PI/insurance/document expiry tracker where applicable
- Resource sharing centre listings: staff time, specialist services, drafting capacity, rendering capacity, inspection support, equipment, software seats, templates and knowledge packs
- Tenna-style / desktop-service-inspired shared-resource booking, utilisation and billing where resources are assets rather than professional services

Agent support:
- Resource Marketplace Agent matches project needs to vetted freelancers/resources by role, location, availability, rate, compliance and performance.
- Supervision Agent makes it clear when a candidate professional's work needs mentor/registered-professional review before issue.
- Capacity Agent suggests resource sharing as an income stream for under-utilised staff, equipment or specialist capability.

### 4.9 Firm / admin / platform operator tools

Tools:
- User/company verification dashboard
- SACAP/ECSA/SACQSP/SACPLAN/CIDB/NHBRC/COIDA/document expiry tracker
- Tool/template admin
- Rate tables and calculator version admin
- Agent governance and approval settings
- Audit log explorer
- Platform-fee/escrow reconciliation dashboard
- Marketplace quality and dispute dashboard
- Knowledge-source manager

Agent support:
- Governance Agent tracks unsafe automations, missing sign-offs and stale templates.
- Finance Agent reconciles platform fees, escrow, invoices and payouts.
- Trust Agent scores users/suppliers based on verified credentials and delivery history.

## 5. Full workflow tool map

### Phase 0: Business development / lead
- CRM pipeline
- Opportunity intake
- Client qualification
- Site/property data capture
- Budget sanity check
- Team suggestion
- Agent: Opportunity Agent

### Phase 1: Brief and feasibility
- Brief builder
- Site/context checklist
- Soft-cost estimator
- Feasibility risk register
- Zoning/land-use pre-check
- AI drawing/site-plan reader for existing plans, survey diagrams, title deeds and context data
- SANS/NBR checklist launcher
- Agent: Briefing + Compliance Agents

### Phase 2: Proposal and appointment
- Fee calculator/proposal builder
- Scope/terms builder
- Escrow/payment schedule
- Client acceptance/signature
- Appointment record
- Agent: Proposal + Payment Agents

### Phase 3: Design and consultant coordination
- Phase/stage plan
- Deliverables checklist
- Drawing/document control
- AI drawing/model reader: PDF, DWG/DXF, IFC/BIM/Revit-derived exports, image scans and schedules
- SANS/NBR/land-use/municipality-specific compliance pre-check
- Discipline calculator toolbox
- RFIs/comments
- Model/drawing review
- Agent: Coordination + Document Control + Drawing Intelligence + Compliance Agents

### Phase 4: Municipal / statutory submission
- Submission checklist
- Forms/document pack builder
- SANS/NBR/XA evidence register
- Council tracker
- Comment-response manager
- Agent: Municipal Submission Agent

### Phase 5: Tender / procurement
- Tender package builder
- AI takeoff to pre-populated BoM/BoQ
- BOQ/takeoff/rate calculators
- Editable contractor/subcontractor/QS quote review packs
- RFQ/supplier/subcontractor portal
- Programme-linked pricing, cashflow and drawdown schedule builder
- Bid submission/evaluation
- Adjudication and award
- Agent: Tender + Procurement + Cost + BoM/BoQ + Programme/Drawdown Agents

### Phase 6: Construction execution
- Gantt/programme
- Lookahead plan
- Programme activity linkage to BoQ, procurement, labour, plant and drawdown milestones
- Site diary
- Labour/staff attendance
- Plant/equipment register
- Procurement/PO/GRN
- RFIs/SIs/NCRs/snags
- Lead-consultant/architect snag walks and re-inspections
- Variation/claims
- Agent: Site + Risk + Claims + Snag Agents

### Phase 7: Payments and commercial control
- Invoices
- Payment valuations/certificates
- Retentions
- Materials on site
- Programme/cashflow/drawdown schedule updates
- Escrow funding/release
- Platform fee split
- Forecast final cost
- Agent: Finance + Escrow + Reconciliation + Programme/Drawdown Agents

### Phase 8: Practical completion / closeout
- Snag/defect manager
- As-built document register
- O&M/manuals/warranties
- Occupation/compliance certificates
- Final account
- Handover pack
- Agent: Closeout Agent

### Phase 9: Operations / post-occupancy
- Maintenance reminders
- Defects liability tracker
- Warranty register
- Facility asset list
- User feedback and lessons learned
- Agent: Operations/Learning Agent

## 6. South African localisation requirements

- NBR/SANS 10400 parts and professional-responsibility guardrails.
- SANS 10400-XA / energy evidence routing.
- Municipal submission pack variations by municipality.
- NHBRC enrolment/document tracking for residential work where applicable.
- CIDB grading/eligibility for contractor workflows.
- SACAP/ECSA/SACQSP/SACPLAN/other professional registration verification and expiry tracking.
- COIDA / Letter of Good Standing / insurance / safety-file tracking for contractors/subcontractors.
- VAT at SA rate and platform fee disclosure.
- PAYE/UIF/SDL/payroll export integration rather than full payroll engine initially.
- Public holidays and SA working-calendar defaults.
- B-BBEE, tax clearance and CSD/vendor documentation where relevant.

## 7. Implementation architecture

Use one registry-driven Tool OS instead of separate disconnected widgets.

Core records:
- ToolDefinition
- ToolRun
- ToolExport
- WorkflowRecommendation
- ApprovalGate
- IntegrationConnector
- RoleToolProfile

Services:
- `toolRegistryService.ts`
- `workflowToolAgentService.ts`
- `toolExportService.ts`
- `drawingIntelligenceService.ts`
- `complianceCheckService.ts`
- `bomBoqGenerationService.ts`
- `programmeDrawdownLinkService.ts`
- `snagInspectionService.ts`
- `resourceMarketplaceService.ts`
- `resourcePlanningService.ts`
- `plantEquipmentService.ts`
- `procurementService.ts`
- `paymentValuationService.ts`

Storage pattern:
- `projects/{projectId}/tool_runs/{toolRunId}`
- `projects/{projectId}/workflow_recommendations/{recommendationId}`
- `projects/{projectId}/procurement_packages/{packageId}`
- `projects/{projectId}/plant_equipment/{assetId}`
- `projects/{projectId}/attendance_logs/{logId}`
- `projects/{projectId}/drawing_extractions/{extractionId}`
- `projects/{projectId}/compliance_checks/{checkId}`
- `projects/{projectId}/bom_boq_sets/{setId}`
- `projects/{projectId}/snag_items/{snagId}`
- `projects/{projectId}/drawdown_schedules/{scheduleId}`
- `resource_marketplace/listings/{listingId}`
- `resource_marketplace/bookings/{bookingId}`
- `tender_packages/{tenderPackageId}/tool_runs/{toolRunId}`

Export targets:
- task
- tender line
- bid line
- BoM item
- BOQ item
- editable quote
- programme activity
- cashflow item
- drawdown schedule
- RFQ
- PO
- GRN
- site log
- RFI
- variation
- payment valuation
- invoice
- escrow release
- compliance report
- snag item
- resource listing/booking
- closeout pack

## 8. MVP sequencing

### MVP A: Tool router and project object actions
- Add role/phase-aware tool registry.
- Add dashboard toolbox panels.
- Add project object “suggested tools”.
- Save versioned tool runs.

### MVP A2: Drawing intelligence and compliance pre-checks
- Add upload-to-extraction pipeline for PDFs, scanned drawings/images, DWG/DXF, IFC/BIM/Revit-derived exports and schedules.
- Extract spatial/project facts and title-block metadata with confidence levels.
- Add SANS/NBR, land-use and municipality-specific pre-checks with professional sign-off gates.
- Route issues to RFIs, drawing comments, compliance reports and submission readiness checklists.

### MVP B: Tender and contractor productivity
- Enable contractor “Prepare Bid”.
- Add AI takeoff → pre-populated BoM/BoQ → contractor/subcontractor/QS editable review flow.
- Link editable quotes to programme activities, cashflow and drawdown/payment schedules.
- Add BOQ/rate/subcontractor/supplier RFQ flow.
- Add concrete/masonry/labour/productivity calculators.
- Export to bid line items.

### MVP C: Site and commercial control
- Upgrade site diary with labour/plant/deliveries/weather/photos.
- Add variation/daywork/payment valuation tools.
- Add basic plant register and utilisation logs.
- Add architect/lead-consultant snag walk, allocation, re-inspection and closeout proof tools.

### MVP D: Practice/resource management
- Add Fresh Projects-style practice tools: resource plans, timesheets, budgets, profitability.
- Integrate Xero/Sage/QuickBooks/CSV.
- Add freelancer/candidate-professional workflow with supervision/sign-off routing.
- Add resource sharing centre as an income stream for staff capacity, specialist services, equipment, templates and desktop-service-style resources.

### MVP E: Procurement and supplier portal
- Add GoBuild360-style supplier RFQ/order/delivery/POD workflow.
- Add catalogues, price lists, pack sizes and lead times.

### MVP F: Governance and integrations
- Admin-managed tool templates, calculation tables, approval gates and connector settings.
- Payroll/accounting/document-storage connectors.

## 9. Guardrails

- Agents should suggest, draft, route, check and reconcile; they should not certify engineering, legal, payroll, tax, fire, energy or statutory compliance without human sign-off.
- Tool outputs must snapshot source version, drawing revision, assumptions and user identity.
- Commercial outputs must show platform fees, VAT, retention, discounts and exclusions clearly.
- Generic PM tools should not dilute Architex into ClickUp. Architex must stay construction-native and SA-aware.
- ERP-style depth should be modular. Do not build full payroll/accounting first; integrate/export first, then deepen where Architex has unique project context.
