# Contractor Toolbox Spec

**Role key:** `contractor` · **UserRole:** ✅ · **TOOLBOX_CONFIG:** ✅ · **Nav:** Command Centre, Inbox, Projects, Toolboxes, Documents, Marketplace, Finance, Messages, My Account

## 1. Identity
- **Title:** Main Contractor Toolbox
- **Subtitle:** Tender, procurement, programme, staff, claims, site instruction, and package controls.
- **Scope:** Contractor tools manage the whole construction delivery layer but do not bypass client/admin approvals.
- **Responsibilities:** Manage procurement and package scopes · Maintain programme, labour, plant, site records · Prepare claims with evidence.
- **Handoff boundaries:** Cannot release client funds directly · Cannot override professional design or statutory approval gates.

## 2. AI-guided toolbox groups
| Group | Tools (→ pageId) |
|-------|------------------|
| Commercial and procurement | BoQ / BoM Procurement → `procurement` · Subcontractor Packages → `packages` |
| Site delivery controls | Staff, Wages & Plant → `contractor-staff` · Programme / Gantt → `programme` |

## 3. Standalone tools (`getToolsForRole('contractor')` → 18)
drawing_register, doc_control_issue, payment_dashboard, boq_takeoff, site_diary_entry, rfi_generator, workforce_timesheet, plant_register, tender_bid_bench, snag_creator, material_procurement, payment_claim_builder, snag_evidence_upload, rfi_response, delivery_note, warranty_upload, hs_compliance, valuation_cert.

Categories spanned: procurement, estimating, document_control, site_management, payment, compliance, drawing.

## 4. Lifecycle participation
- **tender_procurement:** tender_bid_bench, boq_takeoff, material_procurement, payment_claim_builder.
- **construction_execution:** site_diary_entry, workforce_timesheet, plant_register, rfi_generator, rfi_response, delivery_note, hs_compliance, doc_control_issue, drawing_register.
- **closeout:** snag_creator, snag_evidence_upload, warranty_upload, valuation_cert.
- **continuous:** payment_dashboard.

## 5. Governance gates
- Payment view/preparation only (`payment_dashboard`, `payment_claim_builder`); fund release requires escrow/admin gate.
- Claims and valuations prepared with evidence, certified by accountable professional — not auto-approved.
- Procurement and packages bounded by client/admin design and statutory approvals.

## 6. Workflow verification & gaps
- ✅ AI-guided routes (`procurement`, `packages`, `contractor-staff`, `programme`) valid.
- ⚠ AI-guided mode surfaces only 4 curated tools of 18 standalone. Strong candidates missing from guided flow: `tender_bid_bench`, `payment_claim_builder`, `valuation_cert`, `snag_creator`, `hs_compliance`, `rfi_generator`. Recommend "Tender & claims", "Compliance & H&S", and "Closeout" groups to match registry breadth.
- ✅ Lifecycle alignment: contractor owns tender_procurement → construction_execution → closeout delivery, consistent with `lifecycleDefinitions`.

## 7. Toolbox Framework Status

All contractor tools now participate in the Toolbox Capability Framework (`CalculatorDefinition` contract).

### Full-status tools (8)
| Tool | Definition ID | Method | Key clause coverage |
|------|---------------|--------|-------------------|
| boq_takeoff | `boq_takeoff_v1` | area | Quantity × rate, rate build-ups, contingencies |
| material_procurement | `material_procurement_v1` | area | Supplier pricing, priority scheduling |
| valuation_cert | `valuation_cert_v1` | hybrid | Work-done/retention/previous/VAT/certified |
| payment_claim_builder | `payment_claim_builder_v1` | hybrid | Platform-fee disclosure, retention calcs |
| workforce_timesheet | `workforce_timesheet_v1` | time | Hours/cost, PAYE/UIF/SDL deductions |
| plant_register | `plant_register_v1` | time | Hire rates, utilization tracking |
| site_diary_entry | `site_diary_entry_v1` | schedule | Weather, progress, resource records |
| hs_compliance | `hs_compliance_v1` | clauseSet | H&S regulation checklist (OHS Act) |

### Preview-status tools (0)
All contractor tools have reached full status.

### Framework details
- **Methods used:** area, hybrid, time, schedule, clauseSet
- **Versioned tables:** Rate libraries, retention/VAT config, PAYE/UIF/SDL tables, plant rates, H&S checklist
- **Rendering:** `DefinitionToolRunner` for all tools
- **Reports:** PDF/CSV export with clause outcomes, payroll summaries, source versions, disclaimers

## 8. Forma Build Field Tools (Stage 6 Build / Stage 8 Close-out)
<!-- forma-build-site-tools:field-tools -->

Extends Pack 9 site execution with Autodesk Build / Forma-style mobile field capture. Reuses the existing snag state machine (`open → allocated → ready_for_reinspection → closed / rejected`) and payment-blocker governance unchanged.

**Granted capabilities (editor role):**
- **Field capture** — create/edit field issues with pin-on-drawing location referencing or text location; attach evidence with GPS/location.
- **Inspection checklists** — start checklist instances from templates (items copied in order), record pass/fail/na, numeric, or text responses, view pass/fail/na counts, and convert any failed item into a field issue carrying the item prompt, checklist reference, and attached evidence.
- **Photo annotation** — capture JPEG/PNG photos (≤ 25 MB), mark them up with structured shapes (arrows, text notes), and store both the structured annotation and a flattened rendered image; annotations round-trip without data loss.
- **Issue Dashboard & offline capture** — AND-filtered dashboard access; offline captures queue locally and sync in creation order when connectivity returns.

**Governance:** Payment view/preparation only — fund release stays behind the escrow/admin gate, and contractor sign-off is required before a site-manager-blocked payment can release. Every field action is audited via `SiteAuditRecord` with a permitted/denied outcome.

_Spec: `forma-build-site-tools` · Requirements 1, 2, 3, 5, 6._
