# Phase 3 — Tasks Checklist

> Track progress for Phase 3: Contractor Procurement & Tender System

- [ ] **Task 3.1** — Define `TenderPackage`, `Bid`, `BidLineItem` types in `src/types.ts`
  - Add `TenderStatus`, `BidStatus` types
  - Add `TenderPackage` interface
  - Add `BidLineItem` interface
  - Add `Bid` interface
  - Run `npm run lint`

- [ ] **Task 3.2** — Create `src/services/tenderService.ts`
  - `createTenderPackage()`, `publishTender()`, `closeTender()`
  - `submitBid()`, `withdrawBid()`, `shortlistBid()`, `awardBid()`
  - `getTendersByProject()`, `getBidsForTender()`
  - `subscribeToTender()`, `subscribeToBids()`
  - Write unit test

- [ ] **Task 3.3** — Create `src/services/bidComparisonService.ts`
  - Integrate with existing Gemini/LLM proxy
  - Structured prompt for multi-bid comparison
  - Return markdown report + per-bid scores
  - Persist scores to Bid documents

- [ ] **Task 3.4** — Create `src/components/TenderWizard.tsx`
  - 4-step wizard (details, requirements, documents, review)
  - Uses existing UI components
  - Creates `TenderPackage` in Firestore
  - Upload support via existing upload service

- [ ] **Task 3.5** — Create `src/components/BidSubmission.tsx`
  - Lists open tenders for BEP/contractor
  - Line-item bid form (add/remove rows)
  - Methodology + timeline fields
  - Attachment upload
  - Submit writes to Firestore

- [ ] **Task 3.6** — Create `src/components/BidEvaluation.tsx`
  - Comparison table of all bids
  - "Run AI Comparison" button
  - Rendered markdown report
  - Shortlist/reject/award actions
  - Per-bid AI scores as badges

- [ ] **Task 3.7** — Add Tender tabs to dashboards
  - ArchitectDashboard: "Tender" tab
  - BEPDashboard: "Open Tenders" section
  - AdminDashboard: "Tenders" tab
  - Wire all components

- [ ] **Task 3.8** — Firestore rules for `tender_packages` and `bids`
  - Read: authenticated
  - Create: authenticated
  - Update: creator or admin (tenders), contractor or creator (bids)
  - Validate rules

## Git Strategy

```
Branch: phase-3/tender-procurement
Base: main (after phase-2 merge)
Commits: One per task
PR: phase-3/tender-procurement → main
```
