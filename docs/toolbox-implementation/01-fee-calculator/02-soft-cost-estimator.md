# Soft Cost Estimator — soft_cost_estimator

## Overview

| Field | Value |
|-------|-------|
| **ID** | `soft_cost_estimator` |
| **Category** | `fee_calculator` |
| **StandaloneOnly** | true |
| **Roles** | client, developer |
| **Current State** | Uses generic fee_calculator form — outputs only a single fee, not multi-line soft cost breakdown |
| **Priority** | P2 |
| **Branch** | `toolbox/soft-cost-estimator` |

**Description**: Estimate likely professional fees + municipal costs for a project at planning stage. No appointment needed — ballpark projection for clients to budget.

## PRD

A client or developer wants a quick ballpark of all the soft costs for a planned project before engaging professionals. They enter the project type, rough construction value, and location. The tool returns an itemized estimate of architectural fees, engineering fees, QS fees, municipal submission fees, VAT, and contingency — giving a realistic total-budget number.

## Functional Requirements

### FR-1: Input Form

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| Project Type | select | yes | house | Options: house, block-of-flats, commercial, industrial |
| Construction Value (R) | number | yes | — | |
| Location / Municipality | text | no | — | Affects municipal fee estimate |
| Number of Storeys | number | no | 1 | |
| Site Area (m²) | number | no | — | |

### FR-2: Calculation

For client role: apply default rate assumptions (architect ~8%, engineer ~6%, QS ~3%, municipal ~1.5%, contingency ~10%).
For developer role: higher rates (developer overhead ~12% on professional fees).

```
architect_fee = cv * 0.08
engineer_fee = cv * 0.06
qs_fee = cv * 0.03
municipal_fees = cv * 0.015
subtotal = architect_fee + engineer_fee + qs_fee + municipal_fees
contingency = subtotal * 0.10
vat = subtotal * 0.15
total = subtotal + contingency + vat
```

### FR-3: Output

Itemized table:
- Architect fee (R X,XXX)
- Engineer fee (R X,XXX)
- QS fee (R X,XXX)
- Municipal fees (R X,XXX)
- Subtotal (R X,XXX)
- Contingency @ 10% (R X,XXX)
- VAT @ 15% (R X,XXX)
- **Total Estimated Soft Costs (R X,XXX)**

### FR-4: Persistence

Save all inputs + itemized breakdown. Export to PDF/CSV.

## Implementation Tasks

- [ ] Add `case 'soft_cost_estimator'` in fee_calculator form section with dedicated fields
- [ ] Build multi-line soft cost calculation (different from single-fee calc)
- [ ] Differentiate client vs developer rate tables
- [ ] Format output as itemized table
- [ ] Add test: client vs developer produce different totals
- [ ] Add test: zero construction value
- [ ] Manual smoke test
