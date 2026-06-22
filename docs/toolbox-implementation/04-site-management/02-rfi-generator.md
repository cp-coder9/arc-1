# RFI / Site Instruction Generator — rfi_generator

## Overview

| Field | Value |
|-------|-------|
| **ID** | `rfi_generator` |
| **Category** | `site_management` |
| **Roles** | contractor, subcontractor, architect, engineer, site_manager |
| **Current State** | **BROKEN** — uses site_management (site diary) form. Shows weather/labour/plant fields instead of RFI fields |
| **Priority** | **P0 — CRITICAL** |
| **Branch** | `toolbox/rfi-generator` |

## PRD

A contractor or engineer needs to draft a Request for Information or Site Instruction independently. They enter a subject, detailed question/instruction, category, priority, and requested response date. The tool generates a numbered RFI document ready for issuance.

## Functional Requirements

### FR-1: Input Form

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| RFI Number | text | auto | Auto-generated: RFI-{YYYYMMDD}-{NNNN} |
| Subject | text | yes | |
| Question / Instruction | textarea | yes | |
| Category | select | yes | design clarification, specification, site condition, other |
| Priority | select | yes | urgent, normal, low |
| Requested Response Date | date | no | |
| Attachments | file | no | Placeholder |
| Project Reference | text | no | Optional link to project |

### FR-2: Processing

Generate RFI tracking number. Set status to "draft".

### FR-3: Output

RFI summary card with tracking number, subject, category, priority, status: draft. Export to PDF.

### Implementation Tasks

- [ ] **CRITICAL**: Add `case 'rfi_generator'` at top of renderInputFields (before site_management fallback)
- [ ] Build RFI-specific form with 6 fields
- [ ] Generate RFI tracking number
- [ ] Test: rfi_generator shows RFI fields, NOT weather/labour/plant
- [ ] Test: generate 2 RFIs — different tracking numbers
