# Quote Response Form — quote_response

## Overview

| Field | Value |
|-------|-------|
| **ID** | `quote_response` |
| **Category** | `supplier` |
| **Roles** | supplier |
| **Current State** | Routes to `/packages` page. Runner uses generic supplier form |
| **Priority** | P3 |
| **Branch** | `toolbox/quote-response` |

## PRD

A supplier submits a quote in response to an RFQ with line items, prices, validity, and delivery terms.

## Functional Requirements

### FR-1: Input Form

| Field | Type | Required |
|-------|------|----------|
| RFQ Reference | text | no |
| Line Items | table | yes |
| Total Price | auto | |
| Validity Period | select | yes: 7/14/30/60 days |
| Delivery Terms | text | no |
| Exclusions | textarea | no |

### Implementation Tasks

- [ ] Add dedicated quote form with line-item table
- [ ] Auto-calculate total
- [ ] Test: quote with 0 items, with items
