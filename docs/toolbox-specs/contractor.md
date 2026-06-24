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
