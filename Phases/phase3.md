# Phase 3 — Contractor Procurement & Tender System

> **Goal:** Build the Tender & Procurement system that enables competitive bidding, AI-assisted comparison, and formal contract award. This corresponds to the "Tender" stage in the 9-stage lifecycle.

## What Exists Today

| Feature | Status |
|---|---|
| Job marketplace | Architects browse/apply for client jobs |
| Application system | Basic proposal + notes |
| BEP matching | Score-based matching by trade/region |
| Tender workflow | ❌ Missing entirely |

## What This Phase Adds

1. **`TenderPackage` type** — a formal procurement document linked to a project.
2. **`Bid` type** — contractor/BEP bid with breakdown, timeline, and attachments.
3. **Tender Service** — CRUD, bid submission, AI-assisted comparison, award workflow.
4. **Tender Creation Wizard** — step-by-step UI for architects/admins to create tender packages.
5. **Bid Submission UI** — BEP/contractor view for submitting bids.
6. **AI Bid Comparison** — Gemini-powered analysis comparing bids on cost, timeline, risk.
7. **Award Workflow** — formal award with notification and contract generation.

---

## Detailed Tasks

### Task 3.1 — Define Tender & Bid Types

**File:** `src/types.ts`

```typescript
export type TenderStatus = 'draft' | 'published' | 'closed' | 'evaluating' | 'awarded' | 'cancelled';

export interface TenderPackage {
  id: string;
  projectId: string;
  jobId: string;
  title: string;
  description: string;
  scope: string[];                     // work items
  documents: { name: string; url: string }[];
  deadline: string;
  estimatedBudget?: number;
  requiredDisciplines: Discipline[];
  requiredCertifications?: string[];   // e.g. 'NHBRC', 'CIDB Grade 5+'
  status: TenderStatus;
  createdBy: string;
  awardedBidId?: string;
  awardedContractorId?: string;
  aiComparisonReport?: string;         // markdown report from Gemini
  createdAt: string;
  updatedAt?: string;
}

export type BidStatus = 'submitted' | 'shortlisted' | 'rejected' | 'awarded' | 'withdrawn';

export interface BidLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Bid {
  id: string;
  tenderPackageId: string;
  contractorId: string;
  contractorName: string;
  totalAmount: number;
  lineItems: BidLineItem[];
  proposedTimeline: string;            // e.g. "12 weeks"
  proposedStartDate: string;
  methodology: string;
  qualifications: string;
  attachments: { name: string; url: string }[];
  status: BidStatus;
  aiScore?: number;                    // 0-100 from AI comparison
  aiNotes?: string;                    // AI analysis notes
  createdAt: string;
  updatedAt?: string;
}
```

**Acceptance:**
- No TypeScript errors.
- Existing types unchanged.

---

### Task 3.2 — Create Tender Service

**File:** `src/services/tenderService.ts` *(NEW)*

```
Exports:
  - createTenderPackage(data): Promise<string>
  - publishTender(tenderId): Promise<void>
  - closeTender(tenderId): Promise<void>
  - submitBid(tenderId, bidData): Promise<string>
  - withdrawBid(bidId): Promise<void>
  - shortlistBid(bidId): Promise<void>
  - awardBid(tenderId, bidId): Promise<void>
  - getTendersByProject(projectId): Promise<TenderPackage[]>
  - getBidsForTender(tenderId): Promise<Bid[]>
  - subscribeToTender(tenderId, cb): () => void
  - subscribeToBids(tenderId, cb): () => void

Firestore structure:
  - /tender_packages/{tenderId}
  - /tender_packages/{tenderId}/bids/{bidId}
```

**Acceptance:**
- Unit tests pass.
- CRUD operations verified in Firestore.

---

### Task 3.3 — Create AI Bid Comparison Service

**File:** `src/services/bidComparisonService.ts` *(NEW)*

Uses the existing Gemini/LLM infrastructure to:
1. Accept an array of `Bid` objects and the `TenderPackage`.
2. Send structured prompt to Gemini comparing bids on:
   - Total cost vs. estimated budget
   - Timeline feasibility
   - Contractor qualifications
   - Risk assessment
   - Value for money score
3. Return a markdown comparison report + per-bid score (0-100).
4. Persist AI scores back to each `Bid` document.

**Acceptance:**
- Integration test with mock bid data.
- Report format matches existing markdown rendering.

---

### Task 3.4 — Create Tender Creation Wizard

**File:** `src/components/TenderWizard.tsx` *(NEW)*

A multi-step form (3 steps):
1. **Package Details** — title, description, scope items, deadline.
2. **Requirements** — required disciplines, certifications, estimated budget.
3. **Documents** — upload BOQ, drawings, specifications via existing upload service.
4. **Review & Publish** — summary card with "Publish" CTA.

Uses existing `Card`, `Input`, `Textarea`, `Button` components.

**Acceptance:**
- Wizard creates a `TenderPackage` in Firestore.
- Uploaded documents appear in the package.

---

### Task 3.5 — Create Bid Submission UI

**File:** `src/components/BidSubmission.tsx` *(NEW)*

For BEP/contractor roles:
- Lists open tenders matching their trade/discipline.
- Bid form with line items (add/remove rows), methodology, timeline, attachments.
- "Submit Bid" button writes to Firestore.
- Shows bid status after submission.

**Acceptance:**
- BEP can view open tenders and submit a bid.
- Bid appears in Firestore under the tender package.

---

### Task 3.6 — Create Bid Evaluation Dashboard

**File:** `src/components/BidEvaluation.tsx` *(NEW)*

For architects/admins:
- Shows all bids for a tender package in a comparison table.
- "Run AI Comparison" button triggers `bidComparisonService`.
- AI report displayed as rendered markdown.
- Per-bid AI score displayed as badge.
- Shortlist/reject buttons per bid.
- "Award Contract" button for the selected bid.

**Acceptance:**
- Comparison table renders correctly.
- AI comparison produces meaningful output.
- Award updates tender status and bid status.

---

### Task 3.7 — Add Tender Tab to Dashboards

**Files:**
- `src/components/ArchitectDashboard.tsx` — "Tender" tab showing tender packages for active projects.
- `src/components/BEPDashboard.tsx` — "Open Tenders" section in marketplace.
- `src/components/AdminDashboard.tsx` — "Tenders" tab showing all active tenders.

**Acceptance:**
- Architect can create, manage, and award tenders.
- BEP can view and bid on tenders.
- Admin can oversee all tender activity.

---

### Task 3.8 — Firestore Rules for Tender Collections

**File:** `firestore.rules`

```
match /tender_packages/{tenderId} {
  allow read: if request.auth != null;
  allow create: if request.auth != null;
  allow update: if request.auth != null && (
    request.auth.uid == resource.data.createdBy || isAdmin()
  );

  match /bids/{bidId} {
    allow read: if request.auth != null;
    allow create: if request.auth != null;
    allow update: if request.auth != null && (
      request.auth.uid == resource.data.contractorId ||
      request.auth.uid == get(/databases/$(database)/documents/tender_packages/$(tenderId)).data.createdBy ||
      isAdmin()
    );
  }
}
```

**Acceptance:**
- Rules validate without errors.

---

## Verification Plan

| Check | Command / Method |
|---|---|
| TypeScript | `npm run lint` |
| Unit tests | `npm test -- --testPathPattern=tenderService\|bidComparison` |
| Browser test | Create tender → submit bid → run AI comparison → award |
| Git | Branch `phase-3/tender-procurement` |

## Dependencies

- **Phase 1** — requires `Project` type and stage-aware lifecycle.
- **Phase 2** — requires team management for discipline requirements.
