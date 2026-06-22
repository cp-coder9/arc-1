# Catalogue / Product Data Manager — catalogue_manager

## Overview

| Field | Value |
|-------|-------|
| **ID** | `catalogue_manager` |
| **Category** | `supplier` |
| **StandaloneOnly** | true |
| **Roles** | supplier |
| **Current State** | Uses supplier form (product, qty, price, lead time). Single-entry, not a "manager" |
| **Priority** | P3 |
| **Branch** | `toolbox/catalogue-manager` |

## PRD

A supplier manages their product catalogue with multiple entries, categories, prices, and lead times.

## Functional Requirements

### FR-1: Input Form

Multi-entry CRUD table:
- Product name, category, SKU, unit price, lead time, alternative products
- Add/remove rows like BoQ component

### Implementation Tasks

- [ ] Add multi-entry table (reuse BoQ item pattern)
- [ ] Replace single-entry supplier form
- [ ] Test: add 1 item, add 5 items, remove items
