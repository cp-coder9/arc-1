# Standalone Toolbox — Branch Status

**54/54 tools implemented** — each in its own `toolbox/<tool-id>` branch from `main`.
All branches pass `npm run lint` (tsc --noEmit).

---

## P0 — Critical (2 branches)

| Branch | Tool | Form | Calc | Button |
|--------|------|------|------|--------|
| `toolbox/rfi-generator` | RFI Generator | Dedicated (subject, query, drawing ref, recipient, priority, due date) | RFI-* reference | Generate RFI |
| `toolbox/snag-creator` | Snag List Creator | Dedicated (item, location, priority, category, photo, responsible party) | SNAG-* reference | Create Snag |

## P1 — High Priority (13 branches)

| Branch | Tool | Notes |
|--------|------|-------|
| `toolbox/valuation-cert` | Payment Valuation Certificate | Dedicated form (project, cert type, work done, retention, amount) + calc |
| `toolbox/fire-rational-design` | Rational Fire Design Worksheet | Dedicated form (building type, height, occupancy, compartments, fire resistance) |
| `toolbox/energy-certificate` | Energy Performance Certificate | Dedicated form (climate zone, building type, areas, U-values, water heating, PV, shading) |
| `toolbox/xa-compliance-calc` | XA Energy Compliance Calculator | Dedicated form (province, building type, floor/wall/roof/glazed areas, R-values, HVAC) + zone-based compliance |
| `toolbox/hs-compliance` | H&S Compliance Checklist | Dedicated form (10-item checklist: induction, PPE, scaffold, excavation, etc.) + scoring |
| `toolbox/rfi-response` | RFI Response | Dedicated form (RFI ref, respondent, query, response, type, attachments) |
| `toolbox/sans-forms` | SANS Forms Autofill | Dedicated form (8 form types, erf, municipality, applicant, competent person) |
| `toolbox/zoning-check` | Zoning Compliance Checker | Dedicated form (10 zone categories, site area, coverage, FAR, height, storeys, units) |
| `toolbox/fire-compliance-check` | Fire Compliance Checklist | Dedicated 12-item SANS 10400-T checklist + scoring |
| `toolbox/rvalue-calc-fix` | R-Value / Thermal Calculator | Fixed calc-input mismatch + added provided R-value field + zone-based minimums |
| `toolbox/soft-cost-estimator` | Soft Cost Estimator | Dedicated calc (professional fee, statutory, geotech, enviro, legal, finance, contingency) |
| `toolbox/feasibility-estimator` | Project Feasibility Estimator | Dedicated form + calc (land, construction, fees, revenue, profit margin, viability) |
| `toolbox/material-procurement` | Material Procurement | Dedicated form (supplier, delivery date, 5 line items w/ qty/unit/cost, notes) |

## P1 — Category-Form Tools (14 branches)

| Branch | Tool | Category Form | Calc |
|--------|------|---------------|------|
| `toolbox/fee-calculator` | Professional Fee Calculator | fee_calculator | Existing dedicated calc |
| `toolbox/fenestration-calc` | Fenestration Compliance | compliance sub-form | Dedicated SANS 10400-N calc |
| `toolbox/site-diary-entry` | Site Diary Standalone Entry | site_management | Dedicated SD-* calc |
| `toolbox/workforce-timesheet` | Workforce Timesheet | workforce | Dedicated TS-* calc |
| `toolbox/plant-register` | Plant & Equipment Register | plant_equipment | Dedicated PLANT-* calc |
| `toolbox/tender-bid-bench` | Tender / Bid Workbench | tendering | Dedicated TENDER-* calc |
| `toolbox/boq-takeoff` | BoQ / BoM Takeoff Tool | estimating | Dedicated BOQ-* calc |
| `toolbox/payment-claim-builder` | Payment Claim Builder | payment | Dedicated CLAIM-* calc |
| `toolbox/payment-dashboard` | Payment Status Dashboard | payment | Dedicated PAY-DASH-* calc |
| `toolbox/snag-evidence-upload` | Snag / Closeout Evidence Upload | closeout | Dedicated SNAG-EV-* calc |
| `toolbox/warranty-upload` | Warranty Certificate Uploader | closeout | Dedicated WARR-* calc |
| `toolbox/delivery-note` | Delivery Note Builder | supplier | Dedicated DN-* calc |
| `toolbox/quote-response` | Quote Response Form | supplier | Dedicated QTE-* calc |
| `toolbox/catalogue-manager` | Catalogue / Product Data Manager | supplier | Dedicated CAT-* calc |

## P2 — Standard Priority (13 branches)

| Branch | Tool | Notes |
|--------|------|-------|
| `toolbox/cpd-standalone` | CPD Assessment (Standalone) | Dedicated form (body, category, title, hours, provider, evidence) |
| `toolbox/staff-cpd-tracker` | Staff CPD Compliance Tracker | Dedicated form (staff, body, reg, Cat 1/2/3 credits, annual minimums) |
| `toolbox/proposal-comparison` | BEP Proposal Comparison | Dedicated form (3 proposals, names/fees/scores, value index ranking) |
| `toolbox/stage-gate-review` | Stage Gate Review | Dedicated form (8 stages, decision types, reviewer, conditions) |
| `toolbox/drawing-register` | Drawing Register (Standalone) | Document control form + dedicated REG-* calc |
| `toolbox/doc-control-issue` | Document Control Issue Sheet | Document control form + dedicated ISSUE-* calc |
| `toolbox/shop-drawing-submission` | Shop Drawing Submission | Document control form + dedicated SHP-* calc |
| `toolbox/firm-document-register` | Firm-Wide Document Register | Document control form + dedicated FIRM-REG-* calc |
| `toolbox/technical-brief` | Technical Brief Editor | Briefing form + dedicated TB-* calc |
| `toolbox/brief-wizard` | Guided Brief Wizard | Briefing form + dedicated BRIEF-* calc |
| `toolbox/ai-drawing-checker` | AI Drawing Compliance Pre-check | Drawing form + dedicated DRAW-CHK-* calc |
| `toolbox/cad-upload-check` | CAD / BIM File Upload Checker | Drawing form + dedicated CAD-CHK-* calc |
| `toolbox/freelancer-timesheet` | Timesheet / Claim Builder | Freelancer form + dedicated FL-TS-* calc |

## P2 — Admin / Governance (12 branches)

| Branch | Tool | Form |
|--------|------|------|
| `toolbox/admin-governance` | Governance Console | Dedicated (action type, scope, target, description) |
| `toolbox/audit-trail-viewer` | Audit Trail Viewer | Dedicated (entity, action, date range, query) |
| `toolbox/ai-review-queue` | AI Review Queue | Dedicated (category, status, notes) |
| `toolbox/payment-rate-config` | Payment Rate Configurator | Dedicated (category, rate type, value, effective date) |
| `toolbox/user-verification-console` | User Verification Console | Dedicated (user, body, reg number, status) |
| `toolbox/fee-tariff-editor` | Fee / Tariff Table Editor | Dedicated (category, action, code, rate) |
| `toolbox/platform-settings` | Platform Configuration Console | Dedicated (category, action, key, value, reason) |
| `toolbox/system-health-monitor` | System Health & Audit Monitor | Dedicated (component, diagnostic, alert email) |
| `toolbox/deliverable-submission` | Deliverable Submission | Freelancer form + dedicated DEL-* calc |
| `toolbox/freelancer-resource-centre` | Resource Centre / Checklists | Resource centre form + dedicated RES-* calc |
| `toolbox/progress-viewer` | Progress Report Viewer | General form + dedicated PROG-* calc |
| `toolbox/package-scope-viewer` | Package Scope Viewer | General form + dedicated SCOPE-* calc |

---

## Summary

| Metric | Value |
|--------|-------|
| Total tools in registry | 54 |
| Branches merged into main | 54 |
| Tools with dedicated forms | 26 |
| Tools with dedicated calc logic | 54 |
| Tools with button label override | 54 |
| `npm run lint` | Pass (zero tsc errors) |
| Tests | 2114 passed, 203 test files |
| Common file | `src/components/tools/StandaloneToolRunner.tsx` (2126 lines) |
| All PRs closed | Merged via commit `3dff06bd` |
