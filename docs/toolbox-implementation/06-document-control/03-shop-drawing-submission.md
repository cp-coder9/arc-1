# Shop Drawing & Sample Submission — shop_drawing_submission

## Overview

| Field | Value |
|-------|-------|
| **ID** | `shop_drawing_submission` |
| **Category** | `document_control` |
| **StandaloneOnly** | true |
| **Roles** | subcontractor, supplier |
| **Current State** | Uses document_control form (title, revision, recipient, purpose) — not ideal |
| **Priority** | P2 |
| **Branch** | `toolbox/shop-drawing-submission` |

## PRD

A subcontractor or supplier needs to submit shop drawings and material samples for approval. They enter drawing details, sample reference, submission status.

## Functional Requirements

### FR-1: Input Form

| Field | Type | Required |
|-------|------|----------|
| Drawing Title | text | yes |
| Drawing Number | text | yes |
| Revision | text | yes |
| Discipline | select | yes |
| Sample Material Reference | text | no |
| Submission Date | date | auto |
| Status | select | yes: submitted, approved, rejected, resubmit |
| Notes | textarea | no |

### Implementation Tasks

- [ ] Add `case 'shop_drawing_submission'` with dedicated form
- [ ] Test: submission record creation
