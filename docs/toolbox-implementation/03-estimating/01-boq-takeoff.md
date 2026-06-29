# BoQ / BoM Takeoff Tool — boq_takeoff

## Overview

| Field | Value |
|-------|-------|
| **ID** | `boq_takeoff` |
| **Category** | `estimating` |
| **Roles** | contractor, subcontractor, quantity_surveyor, architect |
| **Current State** | **WORKING** — dedicated BoQ line-item editor with add/remove, qty/unit/rate, total calculation |
| **Priority** | P1 (working, polish) |
| **Branch** | `toolbox/boq-takeoff` |

## PRD

A quantity surveyor or contractor needs to create a bill of quantities from scratch with line items, quantities, units, and rates. The tool computes subtotals per row and a grand total, with VAT option. Export to CSV for spreadsheet import.

## Enhancement Tasks

- [x] Line-item editor with add/remove
- [x] Total calculation
- [ ] Add item categories/grouping (by trade)
- [ ] Add VAT toggle + calculation
- [ ] Add subtotals by category in output
- [ ] Improve CSV export with row-level data
- [ ] Test: totals match manual sum
