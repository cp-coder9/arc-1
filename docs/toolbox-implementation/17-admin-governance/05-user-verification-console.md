# User Verification Console — user_verification_console

## Overview

| Field | Value |
|-------|-------|
| **ID** | `user_verification_console` |
| **Category** | `admin_governance` |
| **StandaloneOnly** | true |
| **Roles** | admin |
| **Current State** | `standaloneOnly: true`, uses admin_governance form (generic) |
| **Priority** | P3 |
| **Branch** | `toolbox/user-verification-console` |

## PRD

An admin verifies user identities, professional registrations, and PI insurance documents in a standalone dashboard.

## Functional Requirements

### FR-1: Input Form

| Field | Type | Required |
|-------|------|----------|
| User Search | text | no |
| Verification Status Filter | select | no: pending, verified, rejected |
| Document Type Filter | select | no: identity, registration, insurance |

### FR-2: Output

User list table with verification status badges and action buttons.

### Implementation Tasks

- [ ] Add user search + filter form
- [ ] Add "Open Verification Console" link
