# Warranty Certificate Uploader — warranty_upload

## Overview

| Field | Value |
|-------|-------|
| **ID** | `warranty_upload` |
| **Category** | `closeout` |
| **StandaloneOnly** | true |
| **Roles** | supplier, contractor, subcontractor |
| **Current State** | Uses closeout form (wrong — warranty is not a closeout defect) |
| **Priority** | P2 |
| **Branch** | `toolbox/warranty-upload` |

## PRD

A supplier or contractor uploads warranty certificates: product name, supplier, warranty period, expiry, certificate number.

## Functional Requirements

### FR-1: Input Form

| Field | Type | Required |
|-------|------|----------|
| Product Name | text | yes |
| Supplier | text | yes |
| Warranty Period (years) | number | yes |
| Expiry Date | date | yes |
| Certificate Number | text | no |
| File Upload | file | no |
| Project Reference | text | no |

### Implementation Tasks

- [ ] Add `case 'warranty_upload'` with dedicated form
- [ ] Test: warranty record creation
