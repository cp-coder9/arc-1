# Material Procurement / Order List — material_procurement

## Overview

| Field | Value |
|-------|-------|
| **ID** | `material_procurement` |
| **Category** | `procurement` |
| **Roles** | contractor, subcontractor, supplier |
| **Current State** | Uses procurement form (supplier, delivery date, notes). Functions but minimal |
| **Priority** | P1 |
| **Branch** | `toolbox/material-procurement` |

## PRD

A contractor needs to create a material procurement list from takeoff or manual entry. Line items with quantities, units, estimated cost. Convert to purchase order-ready format.

## Enhancement Tasks

- [x] Basic procurement form present
- [ ] Add: line items table (reuse BoQ component pattern)
- [ ] Add: total quantity and cost
- [ ] Add: PO number generation
- [ ] Add: delivery address field
- [ ] Add: payment terms field
- [ ] Test: procurement list with 0 items, 10 items
