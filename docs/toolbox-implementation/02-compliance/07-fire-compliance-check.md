# Fire Compliance Checklist — fire_compliance_check

## Overview

| Field | Value |
|-------|-------|
| **ID** | `fire_compliance_check` |
| **Category** | `compliance` |
| **Roles** | fire_engineer, architect, bep, engineer |
| **Current State** | Routes to `/sans-forms` page. Runner uses generic fallback |
| **Priority** | P2 |
| **Branch** | `toolbox/fire-compliance-check` |

## PRD

A professional needs to run a quick SANS 10400-T compliance checklist covering fire doors, travel distances, compartmentation, detection, signage, and extinguishers. Each item is scored pass/warning/fail/na with optional notes. The tool produces a summary and overall status.

## Functional Requirements

### FR-1: Input Form

Interactive checklist with ~20 items across 6 categories:
- Escape Routes (travel distance, width, signage, emergency lighting)
- Fire Doors (ratings, self-closing, signage, intumescent seals)
- Compartmentation (wall/floor FRR, penetration seals, cavity barriers)
- Detection (smoke/heat detectors, alarm type)
- Extinguishers (type, coverage, location, inspection)
- Signage (exit signs, fire door signs, assembly point)

Each item: status (pass/warning/fail/na) + notes (textarea)

### FR-2: Calculation

- Count items by status
- If any fail → overall FAIL
- If any warning but no fail → ADVISORY
- All pass/na → COMPLIANT

### FR-3: Output

- Summary table (Category | Items | Pass | Warning | Fail | N/A)
- Overall status badge
- List of violations requiring action

### Implementation Tasks

- [ ] Build checklist data model (shared with hs_compliance)
- [ ] Add form with checklist UI component (not single-entry)
- [ ] Build scoring engine
- [ ] Test: all-pass, mixed, any-fail scenarios
