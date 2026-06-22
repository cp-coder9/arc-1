# Deliverable Submission — deliverable_submission

## Overview

| Field | Value |
|-------|-------|
| **ID** | `deliverable_submission` |
| **Category** | `freelancer` |
| **Roles** | freelancer |
| **Current State** | Routes to `/freelancer-submissions` page. Runner uses generic freelancer form |
| **Priority** | P2 |
| **Branch** | `toolbox/deliverable-submission` |

## PRD

A freelancer submits a deliverable for supervisor approval with file, description, and notes.

## Functional Requirements

### FR-1: Input Form

| Field | Type | Required |
|-------|------|----------|
| Deliverable Name | text | yes |
| Description | textarea | yes |
| File Upload | file | no |
| Supervisor Email | text | yes |
| Notes | textarea | no |

### Implementation Tasks

- [ ] Add `case 'deliverable_submission'` with dedicated form
- [ ] Add: status tracking (submitted/approved/rejected)
- [ ] Add "Go to Submissions page" link
- [ ] Test: submission creation
