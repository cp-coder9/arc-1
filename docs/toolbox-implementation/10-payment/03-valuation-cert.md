# Payment Valuation Certificate — valuation_cert

## Overview

| Field | Value |
|-------|-------|
| **ID** | `valuation_cert` |
| **Category** | `payment` |
| **Roles** | quantity_surveyor, architect, contractor |
| **Current State** | Routes to `/payments` page. Runner uses generic payment form (wrong for valuation) |
| **Priority** | P1 |
| **Branch** | `toolbox/valuation-cert` |

## PRD

A quantity surveyor needs to prepare a payment valuation certificate: contract sum, previous certified, works completed, materials on site, retention, VAT, net payable. Standalone QS worksheet with proper formatting.

## Functional Requirements

### FR-1: Input Form

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Contract Sum (R) | number | yes | |
| Previous Certified (R) | number | yes | |
| Works Completed (R) | number | yes | |
| Materials on Site (R) | number | no | |
| Retention % | number | no | Default 5% |
| VAT % | number | no | Default 15% |
| Nominated Subcontractors (R) | number | no | |
| Contingencies (R) | number | no | |

### FR-2: Calculation

```
gross_earned = works_completed + materials_on_site + nominated_subcons + contingencies
retention = gross_earned * retention_pct / 100
amount_certified = gross_earned - retention
vat = amount_certified * vat_pct / 100
net_payable = amount_certified + vat
```

### FR-3: Output

Valuation table with all line items, subtotals, and net payable. Certificate number and generation date.

### Implementation Tasks

- [ ] Add `case 'valuation_cert'` with dedicated form
- [ ] Build valuation calculation logic
- [ ] Generate valuation certificate preview
- [ ] Test: zero values, full calculation, partial completion
