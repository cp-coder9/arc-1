# Phase 5 — Payments, Escrow & Financial Console

> **Goal:** Implement the milestone-based escrow payment system tied to project stages, a central financial ledger, and a comprehensive admin financial console. This corresponds to the "Payments" stage.

## What Exists Today

| Feature | Status |
|---|---|
| `Payment` type | Basic: `escrow_deposit`, `milestone_release`, `refund`, `platform_fee` |
| `Escrow` type | 3-milestone model (`initial`, `draft`, `final`) |
| `paymentService.ts` | PayFast integration, escrow init, milestone release, refund |
| `FeeEstimator` component | SACAP fee calculation for architects |
| `InvoiceManagement` component | Basic invoice CRUD |
| Stage-based milestones | ❌ Missing — milestones don't map to lifecycle stages |

## What This Phase Adds

1. **Stage-Linked Milestones** — map escrow milestones to `ProjectStage` transitions.
2. **Extended Escrow Model** — support for >3 milestones, custom milestone names.
3. **Central Financial Ledger** — aggregated view of all financial transactions across projects.
4. **Admin Financial Dashboard** — revenue, outstanding escrow, platform fees, refund tracking.
5. **Automated Invoice Generation** — trigger invoices on milestone approval.
6. **Fee Schedule Integration** — tie SACAP fee calculations to project lifecycle milestones.

---

## Detailed Tasks

### Task 5.1 — Extend Escrow & Payment Types

**File:** `src/types.ts`

Extend the existing `Escrow` interface:

```typescript
export interface EscrowMilestone {
  id: string;
  name: string;
  stage: ProjectStage;               // linked to lifecycle
  percentage: number;                 // of total
  amount: number;
  status: 'pending' | 'funded' | 'release_requested' | 'released' | 'disputed';
  releaseConditions?: string[];       // what must be true to release
  requestedAt?: string;
  releasedAt?: string;
  approvedBy?: string;
}

// Update Escrow to use extended milestones
export interface EscrowV2 extends Omit<Escrow, 'milestones'> {
  milestones: EscrowMilestone[];
  linkedProjectId?: string;
}

export interface LedgerEntry {
  id: string;
  projectId: string;
  jobId: string;
  type: PaymentType | 'invoice_payment';
  amount: number;
  direction: 'credit' | 'debit';
  description: string;
  payerId: string;
  payeeId: string;
  paymentId?: string;
  escrowMilestoneId?: string;
  createdAt: string;
}
```

**Acceptance:**
- No lint errors.
- Existing `Escrow` type remains for backward compatibility.

---

### Task 5.2 — Create Financial Ledger Service

**File:** `src/services/financialLedgerService.ts` *(NEW)*

```
Exports:
  - recordTransaction(entry: Omit<LedgerEntry, 'id'>): Promise<string>
  - getLedgerForProject(projectId): Promise<LedgerEntry[]>
  - getLedgerForUser(userId): Promise<LedgerEntry[]>
  - getPlatformSummary(): Promise<{ totalRevenue, totalEscrowHeld, totalRefunded, ledgerCount }>
  - subscribeToLedger(projectId, cb): () => void

Firestore collection: /ledger/{entryId}
```

**Acceptance:**
- Unit tests for recording and querying pass.

---

### Task 5.3 — Stage-Linked Escrow Service

**File:** `src/services/paymentService.ts` *(MODIFY)*

Add methods:
```
  - initializeStageEscrow(project: Project, totalAmount: number): Promise<void>
    Creates EscrowV2 with milestones mapped to stages:
      intake (10%), appointment (15%), compliance (25%),
      tender (20%), delivery (20%), closeout (10%)

  - requestStageRelease(projectId, stage): Promise<void>
    Architect/contractor requests milestone release

  - approveStageRelease(projectId, stage, adminId): Promise<void>
    Admin approves, records in ledger
```

**Acceptance:**
- Escrow with 6 milestones created for a project.
- Release writes to both escrow and ledger.

---

### Task 5.4 — Admin Financial Dashboard

**File:** `src/components/FinancialDashboard.tsx` *(NEW)*

Dashboard showing:
- **Summary Cards**: Total revenue, total escrow held, pending releases, refunds.
- **Ledger Table**: All transactions with filters (date, project, type).
- **Revenue Chart**: Simple bar chart of monthly platform fees (CSS-based).
- **Escrow Overview**: Per-project escrow status with milestone progress.

**Acceptance:**
- Dashboard renders with real Firestore data.
- Filters work correctly.

---

### Task 5.5 — Integrate Financial Dashboard into Admin

**File:** `src/components/AdminDashboard.tsx`

Add a "Financial" tab that embeds `<FinancialDashboard />`.

**Acceptance:**
- Tab renders without errors.
- Existing tabs unaffected.

---

### Task 5.6 — Auto-Invoice on Milestone Release

**File:** `src/services/paymentService.ts` *(MODIFY)*

When `approveStageRelease()` completes:
1. Auto-generate an invoice via existing `InvoiceManagement` patterns.
2. Link invoice to the milestone and project.
3. Send notification to architect/contractor.

**Acceptance:**
- Invoice created automatically on milestone release.
- Invoice appears in `InvoiceManagement` component.

---

### Task 5.7 — Fee Estimator Stage Integration

**File:** `src/components/FeeEstimator.tsx` *(MODIFY)*

Add a "Milestone Breakdown" section that:
- Takes the SACAP-calculated fee as total.
- Breaks it down by the 6 stage-linked milestones.
- Shows estimated amount per milestone.

**Acceptance:**
- Milestone breakdown visible below the fee calculation.
- Amounts sum to total.

---

## Verification Plan

| Check | Command / Method |
|---|---|
| TypeScript | `npm run lint` |
| Unit tests | `npm test -- --testPathPattern=financialLedger\|paymentService` |
| Browser test | Init escrow → request release → admin approves → check ledger |
| Git | Branch `phase-5/payments-escrow` |

## Dependencies

- **Phase 1** — requires `Project` and `ProjectStage`.
- Existing `paymentService.ts` and `InvoiceManagement.tsx`.
