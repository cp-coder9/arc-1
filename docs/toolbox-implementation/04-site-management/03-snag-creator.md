# Snag List Creator — snag_creator

## Overview

| Field | Value |
|-------|-------|
| **ID** | `snag_creator` |
| **Category** | `site_management` |
| **Roles** | contractor, subcontractor, architect, client, site_manager |
| **Current State** | **BROKEN** — uses site_management (site diary) form. Shows weather/labour/plant instead of snag fields |
| **Priority** | **P0 — CRITICAL** |
| **Branch** | `toolbox/snag-creator` |

## PRD

A site manager, contractor, or architect needs to create a snag/punch list entry. They enter location, description, responsible party, due date, severity, and category. Track status through open → in progress → completed → verified.

## Functional Requirements

### FR-1: Input Form

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Location / Area | text | yes | e.g. "Bedroom 2 — North Wall" |
| Description | textarea | yes | |
| Responsible Party | text | yes | e.g. "John's Plastering" |
| Due Date | date | no | |
| Severity | select | yes | critical, major, minor |
| Category | select | yes | architectural, structural, MEP, finishes, external |
| Status | select | yes | open, in_progress, completed, verified |
| Photo | file | no | Placeholder |

### FR-2: Processing

Generate snag record with tracking ID. Severity color coding: critical=red, major=amber, minor=blue.

### FR-3: Output

Snag summary card with severity-color-coded status badge. All fields displayed.

### Implementation Tasks

- [ ] **CRITICAL**: Add `case 'snag_creator'` with dedicated form
- [ ] Build severity-color mapping
- [ ] Support multi-entry (create multiple snags in one session)
- [ ] Test: snag fields shown instead of site diary fields
- [ ] Test: all severities displayed with correct colors
