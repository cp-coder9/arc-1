# Tender / Bid Workbench — tender_bid_bench

## Overview

| Field | Value |
|-------|-------|
| **ID** | `tender_bid_bench` |
| **Category** | `tendering` |
| **Roles** | contractor, subcontractor, supplier |
| **Current State** | Uses tendering form (project, value, scope, date). Works but minimal |
| **Priority** | P1 |
| **Branch** | `toolbox/tender-bid-bench` |

## PRD

A contractor needs to prepare a tender response with project details, BOQ pricing, methodology, exclusions, and qualifications. The tool aggregates the BOQ items into the total tender value.

## Enhancement Tasks

- [x] Basic tendering form present
- [ ] Add: client name field
- [ ] Add: BOQ line items (reuse BoQ component)
- [ ] Add: methodology (textarea)
- [ ] Add: exclusions (textarea)
- [ ] Add: qualifications (textarea)
- [ ] Add: validity period (select: 30/60/90 days)
- [ ] Add: bonds/guarantees (textarea)
- [ ] Test: tender with 0 BOQ items, with items
