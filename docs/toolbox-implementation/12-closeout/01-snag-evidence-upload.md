# Snag / Closeout Evidence Upload — snag_evidence_upload

## Overview

| Field | Value |
|-------|-------|
| **ID** | `snag_evidence_upload` |
| **Category** | `closeout` |
| **StandaloneOnly** | true |
| **Roles** | subcontractor, contractor |
| **Current State** | Uses closeout form (item, status, notes). Semi-relevant but missing upload and snag reference |
| **Priority** | P2 |
| **Branch** | `toolbox/snag-evidence-upload` |

## PRD

A subcontractor needs to upload evidence of completed snag items: photos, inspector, verification. Closes out snag items.

## Functional Requirements

### FR-1: Input Form

| Field | Type | Required |
|-------|------|----------|
| Snag Reference | text | yes |
| Photo / File | file | no |
| Inspector Name | text | no |
| Verification Status | select | yes: verified, pending_review, rejected |
| Completion Date | date | auto |
| Notes | textarea | no |

### Implementation Tasks

- [ ] Add `case 'snag_evidence_upload'` with dedicated form
- [ ] Add file upload placeholder
- [ ] Test: evidence creation with/without photo
