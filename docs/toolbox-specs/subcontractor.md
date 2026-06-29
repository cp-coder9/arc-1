# Subcontractor Toolbox Spec

**Role key:** `subcontractor` · **UserRole:** ✅ · **TOOLBOX_CONFIG:** ✅ · **Nav:** Command Centre, Inbox, Projects, Toolboxes, Documents, Finance, Messages, My Account (NO Marketplace)

## 1. Identity
- **Title:** Subcontractor Package Toolbox
- **Subtitle:** Assigned package scope, RFIs, shop drawings, samples, claims, snags, and close-out evidence.
- **Scope:** Subcontractor access is package-scoped. It cannot control whole-project procurement, supplier catalogues, or client approvals.
- **Responsibilities:** Deliver assigned package scope · Submit shop drawings, samples, RFIs, claims · Upload close-out and warranty evidence.
- **Handoff boundaries:** Cannot issue project-wide procurement commitments · Cannot approve own payment claim or completion status.

## 2. AI-guided toolbox groups
| Group | Tools (→ pageId) |
|-------|------------------|
| Package scope and submissions | Assigned Package Scope → `packages` · Shop Drawings & Samples → `procurement` |
| RFIs, claims, and close-out | RFIs / Site Instructions → `construction` · Payment Claims & Close-Out Evidence → `snagging` |

## 3. Standalone tools (`getToolsForRole('subcontractor')` → 17)
doc_control_issue, payment_dashboard, boq_takeoff, site_diary_entry, rfi_generator, workforce_timesheet, plant_register, tender_bid_bench, snag_creator, material_procurement, payment_claim_builder, shop_drawing_submission, package_scope_viewer, snag_evidence_upload, rfi_response, warranty_upload, hs_compliance.

Categories spanned: document_control, payment, estimating, site_management, procurement, drawing, compliance.

## 4. Lifecycle participation
- **tender_procurement:** tender_bid_bench, boq_takeoff, material_procurement, package_scope_viewer.
- **design_development:** shop_drawing_submission (shop drawings & samples for the assigned package).
- **construction_execution:** site_diary_entry, workforce_timesheet, plant_register, rfi_generator, rfi_response, hs_compliance, doc_control_issue.
- **closeout:** snag_creator, snag_evidence_upload, payment_claim_builder, warranty_upload.
- **continuous:** payment_dashboard.

## 5. Governance gates
- Package-scoped: `package_scope_viewer` reads assigned scope only — no project-wide procurement commitments.
- Payment view/preparation only (`payment_dashboard`, `payment_claim_builder`); cannot approve own claim or certify completion.
- Submissions (shop drawings, samples, RFIs) routed for accountable review — not self-approved.

## 6. Workflow verification & gaps
- ✅ AI-guided routes (`packages`, `procurement`, `construction`, `snagging`) valid.
- ⚠ AI-guided mode surfaces only 4 curated tools of 17 standalone. Strong candidates missing from guided flow: `shop_drawing_submission`, `package_scope_viewer`, `payment_claim_builder`, `snag_evidence_upload`, `hs_compliance`, `warranty_upload`. Recommend "Submissions", "H&S & site", and "Closeout evidence" groups to match registry breadth.
- ✅ Lifecycle alignment: subcontractor delivers package scope across tender_procurement → construction_execution → closeout, consistent with `lifecycleDefinitions`.

## 7. Toolbox Framework Status

All subcontractor tools now participate in the Toolbox Capability Framework (`CalculatorDefinition` contract).

### Full-status tools (4)
| Tool | Definition ID | Method | Key clause coverage |
|------|---------------|--------|-------------------|
| workforce_timesheet | `workforce_timesheet_v1` | time | Hours/cost, PAYE/UIF/SDL deductions |
| plant_register | `plant_register_v1` | time | Hire rates, utilization tracking |
| site_diary_entry | `site_diary_entry_v1` | schedule | Weather, progress, resource records |
| shop_drawing_submission | `shop_drawing_submission_v1` | schedule | Revision states, review routing |

### Preview-status tools (2)
| Tool | Status | Notes |
|------|--------|-------|
| snag_evidence_upload | `preview` | Evidence capture workflow — definition pending |
| quote_response | `preview` | Supplier quote response — definition pending |

### Framework details
- **Methods used:** time, schedule
- **Versioned tables:** PAYE/UIF/SDL tables, plant rates, revision states
- **Rendering:** `DefinitionToolRunner` for full tools; legacy fallback for preview stubs
- **Reports:** PDF/CSV export with timesheet summaries, source versions, disclaimers
