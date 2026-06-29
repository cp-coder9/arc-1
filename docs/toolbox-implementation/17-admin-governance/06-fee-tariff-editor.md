# Fee / Tariff Table Editor — fee_tariff_editor

## Overview

| Field | Value |
|-------|-------|
| **ID** | `fee_tariff_editor` |
| **Category** | `admin_governance` |
| **StandaloneOnly** | true |
| **Roles** | admin |
| **Current State** | `standaloneOnly: true`, uses admin_governance form (generic) |
| **Priority** | P3 |
| **Branch** | `toolbox/fee-tariff-editor` |

## PRD

An admin edits professional fee guideline tables and tariff brackets used by the fee calculator. Standalone CRUD for tariff data.

## Functional Requirements

### FR-1: Input Form

| Field | Type | Required |
|-------|------|----------|
| Professional Body | select | yes: SACAP, ECSA, SACQSP, SACPLAN |
| Category | text | yes |
| Rate % | number | yes |
| Min Value (R) | number | yes |
| Max Value (R) | number | no |

Multi-row table for bracket editing.

### Implementation Tasks

- [ ] Add tariff table CRUD form
- [ ] Wire to fee_calculator's rate table (future)
- [ ] Test: add/edit/remove tariff entries
