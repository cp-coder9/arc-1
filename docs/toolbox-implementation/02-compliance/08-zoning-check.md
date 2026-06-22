# Zoning Compliance Checker — zoning_check

## Overview

| Field | Value |
|-------|-------|
| **ID** | `zoning_check` |
| **Category** | `compliance` |
| **Roles** | town_planner, architect, developer |
| **Current State** | Routes to `/design` page. Runner uses generic fallback |
| **Priority** | P3 |
| **Branch** | `toolbox/zoning-check` |

## PRD

A town planner or architect needs to check a proposed development against zoning scheme rules: use rights, coverage, FAR, height, setbacks, parking. Advisory pre-check — not a substitute for professional sign-off.

## Functional Requirements

### FR-1: Input Form

| Field | Type | Required |
|-------|------|----------|
| Erf Size (m²) | number | yes |
| Zoning District | select | yes |
| Proposed Use | text | yes |
| Current Coverage (m²) | number | yes |
| Proposed Coverage (m²) | number | yes |
| Current Floor Area (m²) | number | yes |
| Proposed Floor Area (m²) | number | yes |
| Height (m) | number | yes |
| Front Setback (m) | number | yes |
| Side Setback (m) | number | yes |
| Parking Bays Provided | number | yes |
| Parking Bays Required | number | yes |

### FR-2: Calculation

Compare each metric against typical zoning table data (tabled per municipality). Flag over-limit items.

### FR-3: Output

Per-metric table (Metric | Allowable | Proposed | Status), overall risk score (Low/Medium/High), recommended actions.

### Implementation Tasks

- [ ] Build zoning data tables in `src/services/compliance/zoningData.ts` with typical SA municipal rules
- [ ] Add `case 'zoning_check'` with dedicated form
- [ ] Build compliance engine
- [ ] Test: each metric independently
