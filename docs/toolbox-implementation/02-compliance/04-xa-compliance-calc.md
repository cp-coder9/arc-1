# XA Energy Compliance Calculator — xa_compliance_calc

## Overview

| Field | Value |
|-------|-------|
| **ID** | `xa_compliance_calc` |
| **Category** | `compliance` |
| **Roles** | energy_professional, architect, bep |
| **Current State** | Routes to `/sans-forms` page. Runner uses generic compliance fallback |
| **Priority** | P1 |
| **Branch** | `toolbox/xa-compliance-calc` |

## PRD

An energy professional needs to check a building design for SANS 10400-XA energy compliance across all building elements. They enter the climate zone, wall/roof/floor construction and insulation values, glazing specs, and orientation. The tool compares each element against XA prescriptive requirements and outputs a per-element pass/warning/fail with an overall compliance verdict.

## Functional Requirements

### FR-1: Input Form

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Climate Zone | select | yes | 1-6 |
| Wall Construction | select | yes | cavity/solid/timber frame |
| Wall Insulation R-Value | number | yes | |
| Roof Type | select | yes | pitched/flat |
| Roof Insulation R-Value | number | yes | |
| Floor Type | select | yes | slab-on-grade/suspended/timber |
| Floor Insulation R-Value | number | no | |
| Glazing U-Value | number | yes | |
| Glazing SHGC | number | yes | |
| Shading Factor | number | no | Default 1.0 |
| Building Orientation | select | no | N/S/E/W/NE/NW/SE/SW |
| Aspect Ratio | number | no | |

### FR-2: Calculation

Compare each element against SANS 10400-XA Table values for the selected zone:
- Wall R-value ≥ zone minimum
- Roof R-value ≥ zone minimum
- Floor R-value ≥ zone minimum (if applicable)
- Glazing U-value ≤ zone maximum
- Glazing SHGC ≤ zone maximum

If all pass → "Compliant". Any fail → "Non-compliant". Any warning → "Needs Review".

### FR-3: Output

Per-element compliance table: Element | Target | Actual | Status (Pass/Warning/Fail)
Overall verdict badge (green/amber/red)
List of required remedial actions

### Implementation Tasks

- [ ] Add `case 'xa_compliance_calc'` with dedicated multi-section form
- [ ] Build SANS 10400-XA reference table data in `src/services/compliance/xaComplianceData.ts`
- [ ] Build comparison engine against zone tables
- [ ] Wire to existing matching calculator
- [ ] Add test: each zone × element combination
- [ ] Manual smoke test
