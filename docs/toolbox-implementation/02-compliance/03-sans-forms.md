# SANS / Compliance Forms Autofill — sans_forms

## Overview

| Field | Value |
|-------|-------|
| **ID** | `sans_forms` |
| **Category** | `compliance` |
| **StandaloneOnly** | true |
| **Roles** | architect, bep, engineer, energy_professional, fire_engineer, quantity_surveyor, town_planner, site_manager |
| **Current State** | Routes to `/sans-forms` page. Runner uses generic compliance fallback form |
| **Priority** | P4 |
| **Branch** | `toolbox/sans-forms` |

## PRD

A professional needs to fill out SANS 10400 compliance forms (Form 1-4) for a municipal submission. In standalone mode, they enter project data manually instead of pulling from a project. The tool generates a prefilled form stub ready for download or printing.

## Functional Requirements

### FR-1: Input Form

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Regulation | select | yes | SANS 10400-A through XA |
| Form Type | select | yes | Form1 (Competent Person), Form2 (Design), Form3 (Construction), Form4 (Completion) |
| Project Address | text | yes | |
| Erf Number | text | yes | |
| Municipal Authority | text | yes | |
| Owner Name | text | yes | |
| Professional Name | text | yes | |
| Registration Number | text | yes | SACAP/ECSA/SACQSP/SACPLAN number |

### FR-2: Processing

Generate structured form data based on inputs — template filling, no AI. Map user inputs to correct SANS form fields.

### FR-3: Output

Form preview with all fields mapped to SANS layout. Downloadable as PDF.

### Implementation Tasks

- [ ] Add dedicated form in compliance section by tool.id
- [ ] Build SANS form template data model in `src/services/compliance/sansFormTemplates.ts`
- [ ] Generate Form1-4 field mappings
- [ ] Add "Open full SANS Forms" link to existing page
- [ ] Test: form data generation for each form type
