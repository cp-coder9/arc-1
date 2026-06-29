# Workforce Timesheet / Payroll Export — workforce_timesheet

## Overview

| Field | Value |
|-------|-------|
| **ID** | `workforce_timesheet` |
| **Category** | `workforce` |
| **Roles** | contractor, subcontractor, site_manager |
| **Current State** | Uses workforce form (worker name, trade, hours, rate). Single-worker only |
| **Priority** | P1 |
| **Branch** | `toolbox/workforce-timesheet` |

## PRD

A site manager needs to record workforce timesheets with hours, rates, and cost codes. Estimate PAYE/UIF/SDL deductions for payroll.

## Enhancement Tasks

- [x] Single-worker form present
- [ ] Migrate to multi-worker table
- [ ] Add: cost code field
- [ ] Add: PAYE estimate (26% flat)
- [ ] Add: UIF (1%)
- [ ] Add: SDL (1%)
- [ ] Add: total cost to employer
- [ ] Test: single worker, multiple workers, deduction calculations
