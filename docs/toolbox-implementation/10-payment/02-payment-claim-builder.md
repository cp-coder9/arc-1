# Payment Claim Builder — payment_claim_builder

## Overview

| Field | Value |
|-------|-------|
| **ID** | `payment_claim_builder` |
| **Category** | `payment` |
| **StandaloneOnly** | true |
| **Roles** | contractor, subcontractor, freelancer |
| **Current State** | Uses payment form (claim ref, amount, period, description). Works but minimal |
| **Priority** | P1 |
| **Branch** | `toolbox/payment-claim-builder` |

## PRD

A contractor needs to build a payment claim from work completed data. They enter line items (work completed, materials on site, plant), retention, and VAT. The tool calculates the net amount due.

## Enhancement Tasks

- [x] Basic payment form present
- [ ] Add: line items (work completed, materials on site, plant)
- [ ] Add: retention % (default 5%)
- [ ] Add: VAT % (default 15%)
- [ ] Add: previous certified amount
- [ ] Calculate: gross earned, retention deducted, VAT, net payable
- [ ] Test: claim with retention, without VAT, with both
