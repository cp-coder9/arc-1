# Stage Gate Review & Decision Log — stage_gate_review

## Overview

| Field | Value |
|-------|-------|
| **ID** | `stage_gate_review` |
| **Category** | `general` |
| **Roles** | developer, client |
| **Current State** | Routes to `/client-progress` page. Uses generic form |
| **Priority** | P3 |
| **Branch** | `toolbox/stage-gate-review` |

## PRD

A developer documents stage gate decisions: scope, budget, timeline, risk assessment, approval.

## Functional Requirements

### FR-1: Input Form

| Field | Type | Required |
|-------|------|----------|
| Project Name | text | yes |
| Gate Number | number | yes |
| Gate Name | text | yes |
| Criteria Checklist | table | yes |
| Decision | select | yes: pass, conditional, fail |
| Comments | textarea | no |

### FR-2: Output

Decision log entry with gate summary, pass/fail status, date, reviewer.

### Tasks

- [ ] Add dedicated form with criteria checklist
- [ ] Generate decision log output
- [ ] Test: pass, conditional, fail decisions
