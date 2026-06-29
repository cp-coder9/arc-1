# Feasibility Estimator — feasibility_estimator

## Overview

| Field | Value |
|-------|-------|
| **ID** | `feasibility_estimator` |
| **Category** | `fee_calculator` |
| **StandaloneOnly** | false |
| **Roles** | developer, client |
| **Current State** | Uses generic fee_calculator form — lacks feasibility-specific fields |
| **Priority** | P2 |
| **Branch** | `toolbox/feasibility-estimator` |

## Functional Requirements

### FR-1: Input Form

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Land Cost (R) | number | yes | |
| Construction Budget (R) | number | yes | |
| Professional Fees | number | yes | Auto-calc or manual override |
| Municipal Fees | number | no | |
| Contingency % | number | no | Default 10% |
| Financing Cost % | number | no | Default 8% |
| Desired Total Budget (R) | number | no | For feasibility ratio |

### FR-2: Calculation

```
total_cost = land + construction + professional + municipal + (contingency_pct * construction) + (financing_pct * construction)
if desired_budget > 0:
  ratio = total_cost / desired_budget
  if ratio <= 1.0 → status = "Feasible"
  if 1.0 < ratio <= 1.2 → status = "Marginal — review budget"
  if ratio > 1.2 → status = "Over budget — revise scope"
```

### FR-3: Output

- Total Project Cost (R)
- Itemized breakdown (donut/bar via CSS)
- Feasibility Status: green (Feasible) / amber (Marginal) / red (Over Budget)
- Ratio value

## Implementation Tasks

- [ ] Add `case 'feasibility_estimator'` with dedicated form
- [ ] Build feasibility scoring logic
- [ ] Add color-coded status badge (green/amber/red)
- [ ] Add test: all three feasibility statuses achievable
- [ ] Manual smoke test
