# Rational Fire Design Worksheet — fire_rational_design

## Overview

| Field | Value |
|-------|-------|
| **ID** | `fire_rational_design` |
| **Category** | `compliance` |
| **Roles** | fire_engineer, architect, bep |
| **Current State** | Routes to `/design` page. Runner uses generic fallback |
| **Priority** | P1 |
| **Branch** | `toolbox/fire-rational-design` |

## PRD

A fire engineer needs to document a rational fire design per SANS 10400-T. They enter occupancy classification, building height, compartment sizes, fire resistance ratings, escape route widths, and active systems. The tool checks critical values against SANS limits and produces a structured design record.

## Functional Requirements

### FR-1: Input Form

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Occupancy Type | select | yes | Per SANS 10400-T Table 1 |
| Building Height (m) | number | yes | |
| Number of Storeys | number | yes | |
| Floor Area per Compartment (m²) | number | yes | |
| Fire Resistance Rating (min) | select | yes | 30/60/90/120 |
| Escape Route Width (m) | number | yes | |
| Travel Distance (m) | number | yes | |
| Fire Detection Type | select | no | none/smoke/heat/multi |
| Sprinklers | select | no | yes/no |
| Fire Hydrants | select | no | yes/no |
| Fire Extinguishers | select | no | yes/no |

### FR-2: Calculation

Check against SANS 10400-T limits:
- Travel distance ≤ max for occupancy (30m-60m depending on type)
- Compartment size ≤ max for occupancy
- FRR ≥ minimum for occupancy/storeys
- Escape route width ≥ occupant load / 2.5 (if occupant count provided)

### FR-3: Output

- Compliance table per check (Metric | Required | Actual | Status)
- Violation list with references
- Rational design summary for inclusion in submission pack

### Implementation Tasks

- [ ] Add `case 'fire_rational_design'` with dedicated form
- [ ] Build SANS 10400-T reference tables in `src/services/compliance/fireComplianceData.ts`
- [ ] Build validation logic for travel distance, compartment size, FRR
- [ ] Add test: each rule independently
- [ ] Manual smoke test
