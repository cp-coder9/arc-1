# Supplier Toolbox Spec

**Role key:** `supplier` · **UserRole:** ✅ · **TOOLBOX_CONFIG:** ✅ · **Nav:** Command Centre, Inbox, Projects, Toolboxes, Marketplace, Messages, My Account (NO Documents, NO Finance)

## 1. Identity
- **Title:** Supplier Delivery Toolbox
- **Subtitle:** Supplier quote path, catalogue, product data, lead times, delivery notes, warranties, and payment evidence.
- **Scope:** Supplier access is delivery/procurement scoped. It is separate from subcontractor execution tools and cannot issue subcontract orders.
- **Responsibilities:** Maintain catalogue and lead-time evidence · Respond to quotes and purchase orders · Upload delivery notes, product data, warranties.
- **Handoff boundaries:** Cannot issue subcontractor execution records · Cannot mark deliveries accepted without contractor/client evidence.

## 2. AI-guided toolbox groups
| Group | Tools (→ pageId) |
|-------|------------------|
| Catalogue and quotes | Supplier API Catalogue → `procurement` · Supplier Quote Path → `packages` |
| Delivery and payment evidence | Delivery Notes & Warranties → `snagging` · Payment Tracker → `payments` |

## 3. Standalone tools (`getToolsForRole('supplier')` → 9)
payment_dashboard, tender_bid_bench, material_procurement, shop_drawing_submission, rfi_response, catalogue_manager, quote_response, delivery_note, warranty_upload.

Categories spanned: payment, estimating, procurement, drawing, catalogue, quote, delivery.

## 4. Lifecycle participation
- **tender_procurement:** tender_bid_bench, material_procurement, catalogue_manager, quote_response (catalogue maintenance + quote/PO response).
- **design_development:** shop_drawing_submission, rfi_response (product data and clarifications).
- **construction_execution → closeout:** delivery_note, warranty_upload (delivery and warranty evidence).
- **continuous:** payment_dashboard (payment tracker).

## 5. Governance gates
- Delivery/procurement scoped — cannot issue subcontractor execution records.
- Deliveries cannot be self-marked accepted; acceptance needs contractor/client evidence.
- Payment view-only (`payment_dashboard`); release stays on escrow/admin gate.

## 6. Workflow verification & gaps
- ✅ AI-guided routes (`procurement`, `packages`, `snagging`, `payments`) valid.
- ⚠ AI-guided mode surfaces 4 curated tools of 9 standalone. Candidates missing from guided flow: `tender_bid_bench`, `material_procurement`, `shop_drawing_submission`, `rfi_response`. Tightest gap is small here, but consider a "Tender & product data" group to surface bid/RFI tools.
- ✅ Scope separation: supplier registry omits Documents/Finance nav and execution tools — consistent with delivery/procurement-only scope claim.
