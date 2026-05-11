# Phase 5 — Tasks Checklist

> Track progress for Phase 5: Payments, Escrow & Financial Console

- [x] **Task 5.1** — Extend Escrow & Payment types in `src/types.ts`
  - `EscrowMilestone` interface
  - `EscrowV2` interface (extends Escrow)
  - `LedgerEntry` interface
  - Run `npm run lint`

- [x] **Task 5.2** — Create `src/services/financialLedgerService.ts`
  - `recordTransaction()`
  - `getLedgerForProject()`
  - `getLedgerForUser()`
  - `getPlatformSummary()`
  - `subscribeToLedger()`
  - Write unit tests

- [x] **Task 5.3** — Stage-linked escrow in `src/services/paymentService.ts`
  - `initializeStageEscrow()` — 6 milestones mapped to stages
  - `requestStageRelease()` — architect/contractor request
  - `approveStageRelease()` — admin approval + ledger write
  - Update unit tests

- [x] **Task 5.4** — Create `src/components/FinancialDashboard.tsx`
  - Summary stat cards
  - Ledger table with filters
  - Revenue chart (CSS-based)
  - Escrow overview per project

- [x] **Task 5.5** — Add "Financial" tab to `AdminDashboard.tsx`
  - Embed `<FinancialDashboard />`
  - Update sidebar mapping
  - Verify no conflicts with existing tabs

- [x] **Task 5.6** — Auto-invoice on milestone release
  - Trigger in `approveStageRelease()`
  - Create invoice linked to milestone + project
  - Send notification
  - Verify in InvoiceManagement

- [x] **Task 5.7** — Fee Estimator milestone breakdown
  - Add "Milestone Breakdown" section to `FeeEstimator.tsx`
  - Break SACAP fee by 6 stage-linked percentages
  - Verify amounts sum to total

## Git Strategy

```
Branch: phase-5/payments-escrow
Base: main (after phase-4 merge)
Commits: One per task
PR: phase-5/payments-escrow → main
```
