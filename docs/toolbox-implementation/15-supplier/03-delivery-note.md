# Delivery Note Builder — delivery_note

## Overview

| Field | Value |
|-------|-------|
| **ID** | `delivery_note` |
| **Category** | `supplier` |
| **StandaloneOnly** | true |
| **Roles** | supplier, contractor |
| **Current State** | Uses supplier form (wrong for delivery note — shows product/qty/price/lead time) |
| **Priority** | P2 |
| **Branch** | `toolbox/delivery-note` |

## PRD

A supplier creates a delivery note with line items, quantities, PO reference, delivery details, and POD signature.

## Functional Requirements

### FR-1: Input Form

| Field | Type | Required |
|-------|------|----------|
| Delivery Address | text | yes |
| PO Reference | text | no |
| Line Items | table | yes (qty + description + part number) |
| Delivery Date | date | auto |
| Driver Name | text | no |
| Vehicle Registration | text | no |
| POD Signature | file | no |

### Implementation Tasks

- [ ] Add `case 'delivery_note'` with dedicated form
- [ ] Reuse line-item table component
- [ ] Test: delivery note creation
