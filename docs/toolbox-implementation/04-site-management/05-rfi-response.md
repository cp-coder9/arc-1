# RFI / Site Instruction Response — rfi_response

## Overview

| Field | Value |
|-------|-------|
| **ID** | `rfi_response` |
| **Category** | `site_management` |
| **StandaloneOnly** | true |
| **Roles** | subcontractor, contractor, supplier |
| **Current State** | Uses site_management form (wrong — shows weather/labour/plant) |
| **Priority** | P2 |
| **Branch** | `toolbox/rfi-response` |

## PRD

A subcontractor or supplier needs to respond to an RFI or site instruction. They enter the RFI reference number, their response text, action taken, and optional attachments.

## Functional Requirements

### FR-1: Input Form

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| RFI Reference | text | yes | |
| Response Text | textarea | yes | |
| Attachments | file | no | Placeholder |
| Response Date | date | auto | Default today |
| Action Taken | select | yes | noted, revised, rejected, other |

### FR-2: Processing

Link response to original RFI by reference number. Generate response tracking.

### FR-3: Output

Response summary with reference, text, action, date.

### Implementation Tasks

- [ ] Add `case 'rfi_response'` with dedicated form
- [ ] Wire response to existing RFI by reference
- [ ] Test: correct fields displayed
