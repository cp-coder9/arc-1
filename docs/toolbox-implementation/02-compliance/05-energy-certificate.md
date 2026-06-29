# Energy Performance Certificate Prep — energy_certificate

## Overview

| Field | Value |
|-------|-------|
| **ID** | `energy_certificate` |
| **Category** | `compliance` |
| **Roles** | energy_professional |
| **Current State** | Routes to `/design` page (wrong route). Runner uses generic fallback |
| **Priority** | P1 |
| **Branch** | `toolbox/energy-certificate` |

## PRD

An energy professional needs to prepare an Energy Performance Certificate (EPC) data worksheet. They enter building envelope metrics, HVAC system details, lighting, and water heating. The tool calculates the notional building comparison per SANS 10400-XA performance path and outputs an EPC rating (A-G).

## Functional Requirements

### FR-1: Input Form (Multi-section)

Section 1 — Building Info:
- Building type (select)
- Floor area (m²)
- Conditioned floor area (m²)
- Occupancy type

Section 2 — Envelope:
- Wall U-value (number)
- Roof U-value (number)
- Floor U-value (number)
- Window-to-wall ratio (%)

Section 3 — Systems:
- HVAC type & efficiency
- Lighting type & wattage
- Water heating type

### FR-2: Calculation

Compare calculated energy consumption vs notional building (SANS 10400-XA reference).
Grade bands: A (>30% better), B (>15% better), C (=reference), D (<15% worse), E (<30% worse), F (<40% worse), G (>50% worse)

### FR-3: Output

- EPC Rating: A-G badge (color-coded)
- Consumption comparison table
- Certificate preview
- Recommended improvements list

### Implementation Tasks

- [ ] Add `case 'energy_certificate'` with multi-section form (3 sections, ~15 fields)
- [ ] Build EPC calculation engine in `src/services/compliance/epcService.ts`
- [ ] Build notional building reference data per zone
- [ ] Grade band lookup
- [ ] Add test: all 7 grades achievable with varying inputs
- [ ] Manual smoke test
