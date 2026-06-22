# Professional Fee Calculator — fee_calculator

## Overview

| Field | Value |
|-------|-------|
| **ID** | `fee_calculator` |
| **Category** | `fee_calculator` |
| **StandaloneOnly** | false |
| **Roles** | architect, bep, engineer, quantity_surveyor, town_planner, energy_professional, fire_engineer |
| **Current State** | **WORKING** — dedicated form, dedicated switch-case with inline rate table |
| **Priority** | P1 (already working, minor polish) |
| **Branch** | `toolbox/fee-calculator` |

**Description**: Calculate professional fees per SACAP/FeeDesk, ECSA, SACQSP, or SACPLAN rate guidelines. Given construction value, project type, and complexity, returns the recommended fee range with breakdown.

## PRD

A professional in the built environment needs to quickly quote a fee for a potential project. They enter the estimated construction value, select their professional category (architect/engineer/QS/planner), choose the project type and complexity, and get an instant fee calculation based on published rate guidelines. The output shows the recommended fee, the applied rate percentage, a breakdown, and next steps (submit proposal, save as template).

## Functional Requirements

### FR-1: Input Form

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| Construction Value (R) | number | yes | — | Must be >= 0 |
| Project Type | select | yes | residential | Options: residential, commercial, industrial, renovation |
| Professional Category | select | yes | architect | Options: architect (SACAP), engineer (ECSA), qs (SACQSP), planner (SACPLAN) |
| Complexity Factor | select | yes | 1.0 | Options: 1.0 (Simple), 1.25 (Moderate), 1.5 (Complex), 2.0 (Very Complex) |
| Additional Services | textarea | no | — | Optional description of extra services |

### FR-2: Calculation

Algorithm:
```
base_rate = rate_table[category]  // architect=0.085, engineer=0.075, qs=0.035, planner=0.02
adjusted_rate = base_rate * complexity_factor
fee = construction_value * adjusted_rate
```

Edge cases:
- construction_value = 0 → fee = 0
- construction_value < 0 → clamped to 0
- Unknown category → fallback to architect rate

### FR-3: Output

| Field | Type | Description |
|-------|------|-------------|
| fee | number | Calculated fee in ZAR |
| rate | number | Applied rate percentage |
| currency | string | Always 'ZAR' |
| breakdown | object | { baseFee, complexityMultiplier, adjustedFee } |

### FR-4: Persistence

Save full input (constructionValue, projectType, category, complexity) + output (fee, rate, breakdown). Export to PDF. Assign to project.

## Implementation Tasks

- [x] Already implemented in StandaloneToolRunner.tsx
- [ ] Verify inline rates match current SACAP/ECSA/SACQSP guidelines; update if needed
- [ ] Add `calculatorId: 'professional_fee'` to tool definition for future service wiring
- [ ] Add currency formatting (ZAR locale with thousands separator)
- [ ] Add test: fee calculation for all 4 professional categories
- [ ] Add test: zero construction value
- [ ] Add test: negative construction value clamped
