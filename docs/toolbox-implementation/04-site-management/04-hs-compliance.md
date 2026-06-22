# H&S Compliance Checklist — hs_compliance

## Overview

| Field | Value |
|-------|-------|
| **ID** | `hs_compliance` |
| **Category** | `site_management` |
| **Roles** | site_manager, contractor, subcontractor |
| **Current State** | Routes to `/construction` page. Runner uses site_management form (wrong) |
| **Priority** | P2 |
| **Branch** | `toolbox/hs-compliance` |

## PRD

A site manager needs to run a health and safety compliance check covering site induction, PPE, scaffolding, excavation, emergency procedures, first aid. Each item scored pass/fail/na.

## Functional Requirements

### FR-1: Input Form

Checklist with ~15-20 items across 6 categories (reuses the checklist component from fire_compliance_check):
- Site Induction (induction records, visitor log, H&S file)
- PPE (hard hats, boots, hi-vis, gloves, harnesses)
- Scaffolding (inspection tags, base plates, guardrails, access)
- Excavation (shoring, barricades, signage, inspection)
- Emergency (first aid kit, fire extinguisher, assembly point, emergency contact)
- Welfare (toilets, drinking water, eating area)

Each: status (pass/fail/na), notes (textarea)

### FR-2: Scoring

Same scoring engine as fire_compliance_check. Overall: compliant, non-compliant, advisory.

### FR-3: Output

Summary by category, overall status, action items list.

### Implementation Tasks

- [ ] Build H&S checklist data items
- [ ] Add checklist UI (shared checklist component)
- [ ] Implement as `case 'hs_compliance'`
- [ ] Test: all-pass, any-fail, mixed scenario
