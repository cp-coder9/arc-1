# Fenestration Compliance Calculator — fenestration_calc

## Overview

| Field | Value |
|-------|-------|
| **ID** | `fenestration_calc` |
| **Category** | `compliance` |
| **StandaloneOnly** | false |
| **Roles** | architect, bep, engineer, energy_professional |
| **Current State** | **WORKING** — dedicated form, enrichment calc, matching calculator |
| **Priority** | P1 (already working) |
| **Branch** | `toolbox/fenestration-calc` |

## Functional Requirements

### FR-1: Input Form

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Orientation | select | no | N/S/E/W/NE/NW/SE/SW |
| Building Type | select | no | residential/commercial/mixed |
| Energy Zone | select | no | 1-6 |
| Wall Area (m²) | number | yes | |
| Glazed Area (m²) | number | yes | |
| Avg U-Value | number | no | Advanced glazing spec |
| Avg SHGC | number | no | Advanced glazing spec |
| Shading Factor | number | no | Advanced glazing spec |

### FR-2: Calculation

Per SANS 10400-N: min ventilation = glazed area × 5%, min lighting = glazed area × 10%.
Per SANS 10400-XA: check glazing ratio = glazed area / wall area against zone limits.

### FR-3: Output

- Required ventilation (m²)
- Required lighting (m²)
- Glazing ratio %
- Compliance verdict per standard

## Implementation Tasks

- [x] Already implemented
- [ ] Add `calculatorId: 'xa_fenestration'` to tool definition
- [ ] Fix tag matching to use explicit calculatorId
- [ ] Add PDF export formatting
