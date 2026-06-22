# Payment Status Dashboard — payment_dashboard

## Overview

| Field | Value |
|-------|-------|
| **ID** | `payment_dashboard` |
| **Category** | `payment` |
| **Roles** | 8 roles (client, contractor, sub, supplier, energy, fire, developer, firm_admin) |
| **Current State** | Routes to `/payments` page. Runner uses payment form (claim ref, amount, period, description) — this is for claim building, not dashboard lookup |
| **Priority** | P2 |
| **Branch** | `toolbox/payment-dashboard` |

## PRD

A client or contractor needs to look up payment status for a project or claim reference. The tool should show amounts claimed, certified, paid, retention, and outstanding.

## Functional Requirements

### FR-1: Input Form

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Project Reference | text | no | |
| Claim Reference | text | no | |

At least one reference must be entered.

### FR-2: Output

Status table: Amount Claimed, Certified, Paid, Retention, Outstanding. Status badge (paid/pending/disputed).

### Implementation Tasks

- [ ] Add `case 'payment_dashboard'` with lookup form (1-2 fields)
- [ ] Display placeholder status table
- [ ] Add "Open full Payments page" link
- [ ] Test: lookup with various references
