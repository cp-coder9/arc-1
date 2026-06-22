# Plant & Equipment Register — plant_register

## Overview

| Field | Value |
|-------|-------|
| **ID** | `plant_register` |
| **Category** | `plant_equipment` |
| **Roles** | contractor, subcontractor, site_manager |
| **Current State** | Uses plant_equipment form (asset name, hire rate, hours used, operator). Single-entry |
| **Priority** | P1 |
| **Branch** | `toolbox/plant-register` |

## PRD

A site manager needs to maintain a plant register with asset details, hire rates, service reminders, and utilisation tracking.

## Enhancement Tasks

- [x] Single-entry form present
- [ ] Migrate to multi-asset table
- [ ] Add: asset ID, make/model, year
- [ ] Add: service interval (hours)
- [ ] Add: utilisation percentage
- [ ] Test: single asset, multiple assets
