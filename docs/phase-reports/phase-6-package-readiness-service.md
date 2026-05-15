# Phase 6 Package Readiness Service Slice

Implemented a standalone service slice for contractor/subcontractor package close-out readiness without changing shared API router or Firestore rules ownership.

## Files

- `src/services/packageReadinessService.ts`
- `src/services/__tests__/packageReadinessService.test.ts`

## Scope covered

The service evaluates whether a construction/procurement/subcontractor package is ready for professional review or close-out using persisted domain records supplied by callers:

- tender/package award state
- awarded bid/package assignee
- construction programme tasks
- RFIs and overdue RFIs
- site logs
- inspections
- delivery/procurement/close-out evidence
- extensible evidence types for supplier quotes, purchase orders, deliveries, wages, plant, snags, and close-out documents

## Decision support only

The service returns blockers, warnings, a score, required evidence, missing evidence, and a summary. It does not certify work, award packages, close RFIs, approve inspections, release payments, or override human/professional responsibility.

## Human confirmations still needed

- Final close-out evidence checklist per package type and trade.
- Supplier/procurement document naming and retention requirements.
- Whether wage/plant records are mandatory for all contractor packages or only specific package types.
- Firestore collection/rule/index design once Phase 6 ownership of rules/API is free.
