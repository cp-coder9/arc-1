# Payment Rate Configurator — payment_rate_config

## Overview

| Field | Value |
|-------|-------|
| **ID** | `payment_rate_config` |
| **Category** | `admin_governance` |
| **Roles** | admin |
| **Current State** | Routes to `/payments` page. Runner uses generic |
| **Priority** | P3 |
| **Branch** | `toolbox/payment-rate-config` |

## PRD

An admin configures payment platform settings: platform fee percentage, escrow settings, tariff tables.

## Functional Requirements

### FR-1: Input Form

| Field | Type | Required |
|-------|------|----------|
| Platform Fee % | number | yes |
| Escrow Release Threshold (R) | number | yes |
| Default Retention % | number | yes |
| Default VAT % | number | yes |

### Implementation Tasks

- [ ] Add dedicated config form
- [ ] Add "Open Payments page" link
