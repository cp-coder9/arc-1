# Staff CPD Compliance Tracker — staff_cpd_tracker

## Overview

| Field | Value |
|-------|-------|
| **ID** | `staff_cpd_tracker` |
| **Category** | `cpd` |
| **Roles** | firm_admin, admin |
| **Current State** | Routes to cpd-assessment page. Runner uses generic form |
| **Priority** | P4 |
| **Branch** | `toolbox/staff-cpd-tracker` |

## PRD

A firm admin tracks staff CPD credits across the firm: credits earned, outstanding, expiry dates, professional body requirements.

## Functional Requirements

### FR-1: Input Form

| Field | Type | Required |
|-------|------|----------|
| Staff Name / Email | text | no |
| Professional Body | select | no: SACAP, ECSA, SACQSP, SACPLAN |

### FR-2: Output

CPD status table: Name | Body | Credits Earned | Required | Outstanding | Expiry

### Implementation Tasks

- [ ] Add query form with name and professional body filter
- [ ] Add "Open full CPD page" link
