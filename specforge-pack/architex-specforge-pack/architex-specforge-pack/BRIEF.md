# Architex SpecForge Pack — Interactive Pictorial Specification + Planning Tool

**For:** Greg + Amy integration into Architex toolsets  
**Prepared for:** Leor / Architex  
**Package version:** 1.0.0  
**Primary module name:** `SpecForge`  
**Positioning:** Unified architect + interior designer specification, schedule, approval, procurement and project-planning workspace.

---

## 1. Executive brief

SpecForge adds a dedicated specification layer to Architex. It combines the strongest patterns from:

- **Programa** — interior-design project management, specifications, product library, mood boards, client dashboards/approvals, invoicing, time tracking and procurement.
- **Gather** — FF&E-focused design development, web clipping, pin boards, budget/cost analysis, team collaboration and exportable spec reports.
- **Hubexo Specification** — construction specification intelligence, product/spec content, manufacturer data, tender/submittal alignment. Direct page access was Cloudflare-blocked during research, so the pack treats it as a construction-spec benchmark rather than a scraped source.
- **ArchifySpec** — architect-focused setup → sections → products → specifications → publish workflow, pre-written trade sections, standards-linked content, BIM consultancy and practice-wide spec collaboration.
- **OpenProject** — optional work-package/Gantt bridge for schedule planning, responsibilities, approvals and issue tracking.

The tool must not be another isolated calculator tile. It becomes a cross-cutting Architex workflow object that speaks back to:

- Project Passport
- Design Team Matrix / responsibility matrix
- FileManager and drawing register
- Project records / audit trail
- Inbox / Action Centre approvals
- Procurement, RFQ and supplier workflows
- Programme / Gantt
- Budget, QS and cost-plan tracking
- Site execution, substitutions, samples and shop drawings
- Closeout, warranties and handover packs

---

## 2. Product concept

### Tool name

**SpecForge** — _Interactive Specifications, Schedules & Product Decisions_.

### Core promise

Create specification documents that are:

1. **Pictorial** — product images, finishes, room/zone boards, sample photos, thumbnails and drawing/detail references.
2. **Interactive** — live filter by room, package, discipline, status, responsible role, approval state and procurement status.
3. **Role-connected** — each item knows who specifies, reviews, approves, prices, procures, installs and maintains it.
4. **Workflow-linked** — specification changes generate tasks, approvals, RFQs, submittals, samples, substitutions and closeout records.
5. **Versioned and auditable** — issued specs are immutable snapshots; superseded sources and substitutions are tracked.
6. **Planning-aware** — specification packages map to programme milestones and optional OpenProject work packages.

---

## 3. Source benchmark notes

### Programa patterns to adopt

Source: https://programa.design/

Observed patterns:

- Specifications and schedules as a central interior-design workflow.
- Product library as all-in-one hub for product details.
- Mood boards and presentations connected to the same project data.
- Web clipper for sourcing products.
- Client dashboard and approvals.
- Procurement with order/ship/delivery/install stages.
- Project management, invoicing and time tracking in one practice workspace.

Architex translation:

- Add `SpecProductLibrary`, `SpecDocument`, `SpecIssue`, `SpecApproval` and `SpecProcurementMilestone` records.
- Build pictorial boards from the same spec line items that drive schedules and RFQs.
- Connect approval decisions to the Action Centre, not to email-only approvals.

### Gather patterns to adopt

Source: https://gatherit.co/

Observed patterns:

- FF&E specification software for teams.
- Design development → manage data → issue specs.
- Web clipper, drag/drop pin boards, real-time budget and cost analysis.
- Export templates/reports and share with outside collaborators.

Architex translation:

- Treat interior specification as a first-class package type alongside architectural trade sections.
- Budget impact must show on every selection, alternative and substitution.
- Export is not just PDF: it is a versioned Architex project record plus optional PDF/CSV/package issue.

### Hubexo Specification patterns to adopt

Source requested: https://hubexo.com/products/specification/  
Research note: direct page returned Cloudflare 403 in this environment.

Industry pattern to adopt:

- Specification platforms should connect spec clauses, products, manufacturer data, procurement/tender data and downstream project information.
- The useful Architex pattern is not content ownership; it is the information spine: product data → spec clause → package → tender/RFQ → submittal → approval → closeout.

### ArchifySpec patterns to adopt

Source: https://archifyspec.com/

Observed patterns:

- Cloud platform for writing, editing and coordinating material schedules and project specifications.
- Pre-written trade sections updated with standards/building-code references.
- Five-step workflow: **Setup, Sections, Products, Specifications, Publish**.
- Project details, design team, key dates and workflow progress are visible in one place.

Architex translation:

- SpecForge workflow: **Setup → Sections → Products → Compose → Issue → Track → Closeout**.
- Add South African profile: SANS/NBR references, municipal submission evidence, Pr Arch/BEP responsibility confirmation, POPIA-safe sharing.
- No standard clause should imply automatic compliance; professionals approve final issued content.

### OpenProject patterns to adopt

Sources:

- https://www.openproject.org/docs/api/
- https://www.openproject.org/docs/user-guide/work-packages/

Observed patterns:

- Work packages support task planning, relations, hierarchy, dates, tables, Gantt, boards and exports.
- API v3 is a general-purpose HATEOAS API. OpenProject also supports BIM-oriented BCF API.

Architex translation:

- Optional OpenProject bridge maps spec sections/packages to work packages.
- Do not make OpenProject mandatory. Architex must remain source of truth; OpenProject is a planning mirror.

---

## 4. Users and role matrix

### Primary roles

- `architect` / `bep`: author architectural sections, approve issued specifications, coordinate consultants.
- `interior_designer` equivalent: Architex can map to `architect`, `bep`, `freelancer` with interior-design specialisation, or future dedicated role.
- `engineer`, `fire_engineer`, `energy_professional`: author/review technical sections tied to their scope.
- `quantity_surveyor`: cost validation, budget deltas, procurement package checks.
- `client` / `developer`: view, comment and approve selected client-decision items only.
- `contractor`: view issued-for-tender/issued-for-construction specs, request clarification, propose substitutions.
- `subcontractor`: package-limited view and submittal/shop-drawing/sample workflow.
- `supplier`: product data, quote, lead-time, warranty and alternative/substitution proposals.
- `site_manager`: installed/as-built status, site evidence and closeout handover.
- `admin` / `platform_admin`: template governance, clause libraries, role permissions and audit controls.

### Permission principle

Client-side UI gating is not enough. Every create/update/issue/approve/substitute action needs server-side policy checks and audit events.

---

## 5. End-to-end workflow

### Phase A — Setup

- Create a SpecForge workspace from a project.
- Pull project name, stage, category, municipality, team matrix, appointments and current drawings from Project Passport.
- Select specification profile:
  - Residential architectural
  - Commercial architectural
  - Interior FF&E
  - Retail/hospitality fit-out
  - Contractor package spec
  - Municipal submission evidence schedule

### Phase B — Sections

- Create sections by trade/package/room/discipline:
  - General requirements
  - Concrete / masonry / roofing / doors / windows / finishes / joinery
  - FF&E, lighting, sanitaryware, ironmongery, appliances, signage
  - SANS/NBR-related compliance sections where source data is licensed/verified
- Support master templates and project-specific clauses.
- Every section stores status, owner, reviewer, expiry, standard source, last review date and issue set.

### Phase C — Products and pictorial selections

Each product/selection line item stores:

- Product name, supplier/manufacturer, model/SKU, finish, colour, dimensions
- Image/gallery/sample photo
- Room/zone/location
- Drawing/detail reference
- Clause reference and section
- Budget allowance, estimated cost, lead time
- Sustainability/warranty/maintenance fields
- Alternatives and approved-equal status
- Supplier quote/RFQ linkage
- Responsible roles
- Status: draft, needs client decision, approved, issued, RFQ, ordered, delivered, installed, as-built, superseded

### Phase D — Compose interactive document

Generate a living spec document with:

- Cover sheet and issue register
- Role-filtered dashboard
- Visual room/product boards
- Section/clause view
- Product schedules
- Budget summary and deltas
- Approval register
- Risk register
- RFQ/procurement schedule
- Closeout/warranty schedule

### Phase E — Issue and approval

- Drafts are editable.
- Issued documents are immutable snapshots.
- Revisions create new issue versions.
- Client approvals are item-level, date-stamped and limited to client-decision items.
- Professional approvals require responsibility confirmation.
- Contractor/supplier substitutions cannot mutate issued spec; they create substitution requests.

### Phase F — Planning and procurement

- Spec packages create Architex tasks and optional OpenProject work packages.
- Long-lead items feed programme risk.
- RFQ packages pull issued spec data.
- Cost impacts feed QS and finance.
- Procurement status feeds site readiness and closeout.

### Phase G — Site and closeout

- Site manager/contractor records installed status.
- Photos attach to line items.
- Warranties, manuals and maintenance docs attach to closeout pack.
- As-built specification is issued as final version.

---

## 6. Architex integration points

### Navigation / toolbox

Add a role-aware tool tile:

- id: `specforge`
- label: `SpecForge Specifications`
- category: `Design & Compliance`
- roles: `architect`, `bep`, `engineer`, `quantity_surveyor`, `energy_professional`, `fire_engineer`, `freelancer`, `contractor`, `subcontractor`, `supplier`, `client`, `developer`, `admin`
- modes:
  - standalone tool tile
  - project workflow tool

### Project Passport

Write:

- `project.specificationSummary`
- current issue number/status
- open decisions count
- long-lead risk count
- packages pending QS / client / contractor / supplier

### FileManager / Drawing Register

Link:

- drawings/details to spec line items
- spec issues to transmittals
- superseded drawings/spec conflicts to risk register

### Inbox / Action Centre

Create action cards:

- Client: approve finish/product option
- Architect/BEP: issue revision, approve substitution, confirm professional responsibility
- QS: review budget delta
- Contractor: price package, respond to clarification
- Supplier: quote item, confirm lead time, upload warranty
- Site manager: record installed/as-built evidence

### Procurement / marketplace

Create RFQ-ready packages from issued spec sections. Suppliers should only see package-scoped data relevant to their quote.

### Finance/payment

Specification changes that alter cost create budget-delta records and can block payment/claim approval until reviewed where material.

### Closeout

Warranty/manual/O&M data is collected per spec line item and exported into handover.

---

## 7. Data model summary

Recommended collections / tables:

- `specWorkspaces`
- `specSections`
- `specItems`
- `specDocuments`
- `specIssues`
- `specApprovals`
- `specSubstitutions`
- `specProcurementEvents`
- `specSnapshots`
- `specAuditEvents`
- `specOpenProjectLinks`

Key design rule: the issued spec snapshot must include all line-item data, role assignments, approval state, source references and images used at issue time. Never reconstruct issued documents from mutable live records.

---

## 8. UI requirements

### Mobile-first

Most approvals and site evidence will happen on phones. Use:

- Single-column cards at 320px.
- Sticky issue/action bar.
- Large image thumbnails.
- Clear role chips and approval status.
- Offline-first draft save for site evidence where practical.

### Main surfaces

1. Workspace overview
2. Pictorial spec board
3. Section editor
4. Product/selection library
5. Interactive document preview
6. Approval register
7. Budget and lead-time risk panel
8. Procurement/RFQ panel
9. OpenProject/planning panel
10. Closeout/warranty panel

---

## 9. Security, POPIA and governance

- Project/tenant isolation mandatory.
- Supplier/subcontractor package scoping mandatory.
- Do not expose full project commercial data to suppliers.
- Client approvals must show exactly what they approved.
- Substitutions require professional approval before becoming spec changes.
- AI-generated clauses must be labelled draft until professional approval.
- SANS/NBR content must be licensed/verified before embedding. Otherwise store references/checklist prompts, not copyrighted clause text.
- Every issued snapshot gets hash, timestamp, issuer and professional responsibility acknowledgement.

---

## 10. MVP scope for Greg/Amy

### Build in first pass

- SpecForge standalone demo and project tool surface.
- Data types and sample seed data.
- Role-aware permissions engine.
- Interactive pictorial document generator.
- Approval and issue snapshot service.
- OpenProject payload mapper.
- Tests for permissions, snapshots, stale source detection and OpenProject mapping.

### Defer

- Live supplier catalog integrations.
- Licensed SANS clause library.
- BIM element sync.
- Full PDF renderer; use browser print first.
- Real OpenProject API calls; ship connector interface + payload mapper first.

---

## 11. Acceptance criteria

- A user can create/view a pictorial spec document with at least sections, line items, images, room/package filters, role chips and status chips.
- A draft spec can be issued as immutable snapshot.
- Client can approve only client-decision items.
- Contractor/supplier cannot edit issued spec; only request substitution or quote scoped packages.
- QS can see budget impact and mark review state.
- Long-lead items create planning risks.
- Spec packages can map to OpenProject work-package payloads.
- Tests run without network.
- Codebase includes copy-ready Architex integration notes.

---

## 12. Pack contents

- `BRIEF.md` — this document.
- `CODE/README.md` — developer handoff.
- `CODE/public/index.html` — working standalone interactive demo.
- `CODE/public/styles.css` — Architex-style responsive UI.
- `CODE/src/*.mjs` — domain engine, role matrix, document generator, OpenProject mapper and browser app.
- `CODE/tests/*.test.mjs` — executable Node tests.
- `CODE/ARCHITEX_INTEGRATION.md` — exact integration guidance for `arc-1`.
- `CODE/architex-dropins/*` — copy-ready TypeScript/React starter files for Greg/Amy.
