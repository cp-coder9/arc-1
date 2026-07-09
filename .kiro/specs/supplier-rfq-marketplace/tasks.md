# Implementation Plan: Supplier RFQ Marketplace

## Overview

Implement the Supplier RFQ Marketplace as a Module 6 (Tender/Procurement/Supplier) feature within Architex OS. The implementation follows a service-layer architecture with pure business logic in `src/services/rfqMarketplace/`, a React workspace component, and deep integration with SpecForge, Project Passport, and the Action Centre. All scoring logic is implemented as pure functions for property-based testing with fast-check.

## Tasks

- [x] 1. Set up project structure, types, and core interfaces
  - [x] 1.1 Create TypeScript type definitions and interfaces
    - Create `src/services/rfqMarketplace/types.ts` with all interfaces: `RfqDocument`, `RfqLineItem`, `EvaluationCriteria`, `InvitedSupplier`, `QuoteResponse`, `QuoteLineItem`, `QuoteAttachment`, `ScoredQuote`, `AwardRecommendation`, `ConflictFlag`, `ApprovalRecord`, `SupplierMarketplaceProfile`, `RfqStatus`
    - Define error code constants and validation error types
    - Define the RFQ state machine transitions as a type-safe map
    - _Requirements: 1.1, 1.2, 1.4, 3.2, 3.4, 4.1, 6.1, 7.1_

  - [x] 1.2 Create barrel export and service stubs
    - Create `src/services/rfqMarketplace/index.ts` as the public API barrel export
    - Create stub files for all services: `rfqService.ts`, `quoteService.ts`, `comparisonEngine.ts`, `awardService.ts`, `invitationService.ts`, `rfqNotificationService.ts`, `rfqIntegrationService.ts`, `supplierProfileService.ts`
    - _Requirements: All (foundational structure)_

- [x] 2. Implement RFQ creation, validation, and state machine
  - [x] 2.1 Implement RFQ CRUD and validation in `rfqService.ts`
    - Implement `createRfq()` — validates title (max 150 chars), description (max 2000 chars), at least one line item with quantity > 0, unit of measure, delivery address, Quote_Deadline ≥ 24h in future, evaluation criteria weights summing to 100%
    - Implement `validateEvaluationCriteria()` — enforce integer weights 0–100 summing to 100, enforce B-BBEE minimum 10% for public sector or estimatedValue > R1,000,000
    - Implement `validateRfqSubmission()` — reject missing deadline, missing line items, empty Package_Scope, invalid SpecForge_Link references
    - Create RFQ with status "draft" and link line items to SpecForge via `specForgeItemId`
    - Use Firestore persistence via `getDemoDoc`/`getDemoCol` pattern at `projects/{pid}/rfqs/{rfqId}`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 5.1_

  - [x] 2.2 Implement RFQ state machine transitions
    - Implement `publishRfq()` — transition draft → published, enforce ≥1 supplier on invitation list
    - Implement `transitionToEvaluation()` — triggered when deadline passes + ≥2 quotes received
    - Implement `cancelRfq()` — transition draft/published → cancelled
    - Implement `awardRfq()` — transition evaluation → awarded (after both approvals)
    - Record timestamps for each transition (`publishedAt`, `awardedAt`, `cancelledAt`)
    - _Requirements: 2.6, 4.5_

  - [ ]* 2.3 Write property test for evaluation criteria weights (Property 1)
    - **Property 1: Evaluation criteria weights sum to 100**
    - Generate arbitrary `EvaluationCriteria` objects and verify the system only accepts those where `priceWeight + leadTimeWeight + bbeeWeight + warrantyWeight + performanceWeight === 100`
    - **Validates: Requirements 1.4**

  - [ ]* 2.4 Write property test for B-BBEE minimum weight enforcement (Property 11)
    - **Property 11: B-BBEE minimum weight enforcement**
    - For any RFQ where `isPublicSector === true` or `estimatedValue > 1_000_000`, verify that accepted `EvaluationCriteria` has `bbeeWeight >= 10`
    - **Validates: Requirements 5.1**

  - [ ]* 2.5 Write property test for publication requires invited supplier (Property 16)
    - **Property 16: Publication requires at least one invited supplier**
    - For any RFQ status transition from 'draft' to 'published', verify the `invitationList` contains at least 1 supplier
    - **Validates: Requirements 2.6**

  - [ ]* 2.6 Write unit tests for RFQ creation and validation
    - Test valid RFQ creation with all fields
    - Test rejection for missing deadline, zero line items, empty Package_Scope
    - Test title and description length validation
    - Test deadline < 24h rejection
    - Test weights not summing to 100
    - Test SpecForge_Link warning for nonexistent references
    - _Requirements: 1.1–1.9_

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement supplier invitation and discovery
  - [x] 4.1 Implement supplier invitation service in `invitationService.ts`
    - Implement `discoverSuppliers()` — filter by trade category, delivery region, verification status, B-BBEE level, max 100 per page
    - Implement `addToInvitationList()` — add suppliers manually or via bulk selection, max 50 per list
    - Implement `addSuppliersToPublishedRfq()` — allow adding suppliers while RFQ is published, trigger notification within 60 seconds
    - Display warning badge for suppliers with verification status "expired" or "rejected"
    - Handle empty results with message suggesting broadened filter criteria
    - Query Firestore `suppliers/{supplierId}/marketplace` with composite index on tradeCategories, deliveryRegions, verificationStatus
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [ ]* 4.2 Write unit tests for invitation service
    - Test supplier filtering by trade category, region, verification status
    - Test max 50 supplier limit enforcement
    - Test warning badge display for expired/rejected suppliers
    - Test empty results handling
    - Test adding suppliers to published RFQ
    - _Requirements: 2.1–2.7_

- [x] 5. Implement supplier quote submission and revision
  - [x] 5.1 Implement quote submission service in `quoteService.ts`
    - Implement `submitQuote()` — validate unit prices (0.01–999,999,999.99), calculate total price as sum of extended prices, validate lead time (1–730 days), delivery terms (min 10 chars)
    - Implement `validateQuoteAttachments()` — max 10 files, each ≤ 25MB, formats PDF/DOCX/XLSX/JPG/PNG
    - Implement deadline enforcement — accept submissions only before `quoteDeadline`, reject after with message
    - Implement `reviseQuote()` — supersede previous submission, retain revision history, increment revision number
    - Implement access control — reject non-invited suppliers
    - Record submission timestamp, assign status "submitted"
    - Retain all entered data on validation failure
    - Persist to `projects/{pid}/rfqs/{rfqId}/quotes/{quoteId}`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

  - [ ]* 5.2 Write property test for quote deadline enforcement (Property 6)
    - **Property 6: Quote deadline enforcement**
    - For any submission attempt where current time is after `quoteDeadline`, verify the system rejects and no `QuoteResponse` record is created
    - **Validates: Requirements 3.5, 3.6**

  - [ ]* 5.3 Write property test for quote revision preserves history (Property 7)
    - **Property 7: Quote revision preserves history**
    - For any revised submission, verify previous has status 'superseded' and new has `revisionNumber` exactly one greater
    - **Validates: Requirements 3.8**

  - [ ]* 5.4 Write property test for non-invited supplier rejection (Property 8)
    - **Property 8: Non-invited supplier rejection**
    - For any submission by a supplier not in the `invitationList`, verify the system rejects
    - **Validates: Requirements 3.9**

  - [ ]* 5.5 Write property test for line-item price validation bounds (Property 15)
    - **Property 15: Line-item price validation bounds**
    - For any accepted `QuoteLineItem`, verify `unitPrice` is between 0.01 and 999,999,999.99
    - **Validates: Requirements 3.2**

  - [ ]* 5.6 Write unit tests for quote submission
    - Test valid quote submission with all fields
    - Test rejection for out-of-range prices, invalid lead time, short delivery terms
    - Test attachment validation (size, count, format)
    - Test submission exactly at deadline boundary
    - Test revision number increment and supersede logic
    - _Requirements: 3.1–3.9_

- [x] 6. Implement comparison engine and scoring
  - [x] 6.1 Implement comparison engine in `comparisonEngine.ts`
    - Implement `normalizeScores()` — linear min-max normalisation producing scores in range [0.00, 100.00]
    - Implement `calculateWeightedScores()` — multiply each normalised score by weight/100, sum for total weighted score in [0.00, 100.00]
    - Implement `rankQuotes()` — sort by total weighted score descending, break ties by earliest `submittedAt` timestamp
    - Implement `generateComparison()` — produce `ScoredQuote[]` within 30 seconds, flag when lowest-price and highest-score differ (show price difference in Rand and score difference in points)
    - Implement `getLineItemBreakdown()` — display line-item price breakdown across up to 10 quotes
    - Handle fewer than 2 quotes: notify issuer within 5 minutes, offer deadline extension or proceed with single quote
    - B-BBEE scoring: Level 1 receives maximum points, Level 8 receives minimum points, proportional across configured weight
    - Cache results to `projects/{pid}/rfqs/{rfqId}/comparison`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2_

  - [ ]* 6.2 Write property test for normalised score bounds (Property 2)
    - **Property 2: Normalised scores are bounded 0–100**
    - For any set of `QuoteResponse` inputs and valid `EvaluationCriteria`, verify every normalised score is in [0.00, 100.00]
    - **Validates: Requirements 4.1**

  - [ ]* 6.3 Write property test for weighted score convex combination (Property 3)
    - **Property 3: Weighted score is a convex combination**
    - For any `ScoredQuote`, verify `weightedScore` equals sum of (normalised × weight/100) and is in [0.00, 100.00]
    - **Validates: Requirements 4.1**

  - [ ]* 6.4 Write property test for ranking consistency (Property 4)
    - **Property 4: Ranking is consistent with score ordering**
    - For any comparison with ≥2 quotes, if quote A has higher `weightedScore` than quote B, verify A has lower rank
    - **Validates: Requirements 4.2**

  - [ ]* 6.5 Write property test for tie-breaking by earliest submission (Property 5)
    - **Property 5: Tie-breaking by earliest submission**
    - For any two quotes with identical `weightedScore`, verify the earlier `submittedAt` receives lower rank
    - **Validates: Requirements 4.2**

  - [ ]* 6.6 Write unit tests for comparison engine
    - Test normalisation with known values
    - Test B-BBEE Level 1–8 proportional scoring
    - Test flag when lowest-price differs from highest-score
    - Test fewer than 2 quotes handling
    - Test line-item breakdown across 10 quotes
    - _Requirements: 4.1–4.5, 5.1, 5.2_

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement B-BBEE procurement compliance
  - [x] 8.1 Implement B-BBEE compliance logic
    - Integrate B-BBEE level sourcing from `SupplierMarketplaceProfile` (`bbeeLevelNumber`, `bbeeCertificateExpiry`)
    - Implement mandatory B-BBEE scoring for public sector or estimatedValue > R1,000,000 (minimum 10% weight)
    - Display visual warning for expired or missing B-BBEE certificates (distinguish between the two states)
    - Block award progression for expired/missing B-BBEE certificate on recommended supplier
    - Calculate and display local content percentage per supplier based on delivery origin
    - Display warning for suppliers below project local-spend target
    - Prevent comparison finalisation if public sector and no supplier has valid certificate
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 8.2 Write property test for B-BBEE certificate blocks award (Property 12)
    - **Property 12: B-BBEE certificate blocks award**
    - For any award recommendation where recommended supplier has expired/missing B-BBEE certificate, verify approval progression is prevented
    - **Validates: Requirements 5.3**

- [x] 9. Implement award recommendation and approval gate
  - [x] 9.1 Implement award service in `awardService.ts`
    - Implement `createAwardRecommendation()` — create record with recommended supplier, quoted price, justification (min 50 chars), risk notes, all compared quote IDs
    - Implement `checkConflictOfInterest()` — compare supplier ownership/directorship/affiliations against project team member list, flag matches
    - Implement `recordClientApproval()` — client approval must precede professional approval, no automatic appointment
    - Implement `recordProfessionalApproval()` — only after client approval recorded, then transition to "awarded" and generate PO draft
    - Implement `rejectRecommendation()` — transition to "rejected", record reason, notify author
    - Block approval if unacknowledged conflicts exist (require min 100 char justification per conflict)
    - Block approval if recommended quote superseded or supplier verification changed to "expired"
    - Record complete decision in project audit trail
    - Persist to `projects/{pid}/rfqs/{rfqId}/award`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

  - [ ]* 9.2 Write property test for sequential approval gate (Property 9)
    - **Property 9: Sequential approval gate enforcement**
    - For any `AwardRecommendation`, verify `professionalApproval` can only be recorded when `clientApproval` is already recorded with decision 'approved'
    - **Validates: Requirements 6.2**

  - [ ]* 9.3 Write property test for conflict-of-interest blocks approval (Property 10)
    - **Property 10: Conflict-of-interest blocks approval**
    - For any `AwardRecommendation` with unacknowledged `conflictOfInterestFlags`, verify `clientApproval` cannot be recorded
    - **Validates: Requirements 6.4**

  - [ ]* 9.4 Write unit tests for award service
    - Test award recommendation creation with valid/invalid justification
    - Test conflict-of-interest detection with matching affiliations
    - Test sequential approval (client before professional)
    - Test rejection flow and notification
    - Test blocking for superseded quote and expired verification
    - _Requirements: 6.1–6.8_

- [x] 10. Implement supplier marketplace profile
  - [x] 10.1 Implement supplier profile service in `supplierProfileService.ts`
    - Implement `createProfile()` / `updateProfile()` — validate 1–10 trade categories, 1–9 delivery regions (SA provinces)
    - Source verification badge status from platform verification service
    - Calculate past-performance metrics (quote acceptance rate, on-time delivery %, average rating) from trailing 12-month platform data, refresh within 24h of new delivery
    - Display "New Supplier" badge for suppliers with zero completed deliveries
    - Implement marketplace search with filtering by trade category, delivery region, verification status (return results within 3 seconds)
    - Reject profile updates with 0 categories or 0 regions
    - Persist to `suppliers/{supplierId}/marketplace`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ]* 10.2 Write unit tests for supplier profile service
    - Test profile creation with valid/invalid categories and regions
    - Test performance metrics calculation from 12-month window
    - Test "New Supplier" badge logic
    - Test marketplace search filtering and response time
    - _Requirements: 7.1–7.6_

- [x] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Implement role-based access control
  - [x] 12.1 Implement RBAC enforcement across all services
    - Implement `checkRfqCreationAccess()` — restrict to architect, quantity_surveyor, contractor, admin on the project
    - Implement `checkQuoteSubmissionAccess()` — restrict to supplier role + on Invitation_List for specific RFQ
    - Implement `checkAwardRecommendationAccess()` — restrict to quantity_surveyor, architect, contractor on the project
    - Implement `checkApprovalAccess()` — restrict to designated client approver or professional approver
    - Implement supplier visibility scope — only show RFQs where user is on Invitation_List
    - Prevent action execution for insufficient permissions, display error, preserve entered data
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [ ]* 12.2 Write property test for role-based access for RFQ creation (Property 13)
    - **Property 13: Role-based access for RFQ creation**
    - For any RFQ creation attempt, verify the user holds at least one of architect, quantity_surveyor, contractor, or admin on the project
    - **Validates: Requirements 10.1**

  - [ ]* 12.3 Write property test for supplier visibility scope (Property 14)
    - **Property 14: Supplier visibility scope**
    - For any user with role supplier, verify RFQ queries return only RFQs where user's `supplierId` is in the `invitationList`
    - **Validates: Requirements 10.5**

  - [ ]* 12.4 Write unit tests for RBAC
    - Test all 4 action type restrictions
    - Test supplier visibility filtering
    - Test error handling for unauthorized access attempts
    - Test data preservation on access denial
    - _Requirements: 10.1–10.6_

- [x] 13. Implement notifications and deadline management
  - [x] 13.1 Implement notification service in `rfqNotificationService.ts`
    - Implement publish notification — notify all invited suppliers within 60 seconds (RFQ title, reference number, deadline)
    - Implement 24h deadline reminder — notify suppliers without Quote_Response
    - Implement quote submission notification — notify issuer within 60 seconds (supplier name, RFQ reference)
    - Implement award approval notification — notify approvers within 60 seconds (RFQ reference, approval link)
    - Implement zero-quote alert — notify issuer within 5 minutes with options to extend deadline or expand list
    - Implement retry logic — 3 retries within 5 minutes, log failure and display undelivered indicator
    - Include RFQ status and direct navigation link in every notification
    - Integrate with existing `notificationService.ts`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [ ]* 13.2 Write unit tests for notification service
    - Test notification dispatch timing (60 seconds, 5 minutes)
    - Test 24h reminder targeting (only suppliers without submissions)
    - Test retry logic and failure logging
    - Test notification content (title, reference, deadline, link)
    - _Requirements: 9.1–9.7_

- [x] 14. Implement SpecForge and Project Passport integration
  - [x] 14.1 Implement integration service in `rfqIntegrationService.ts`
    - Implement SpecForge write-back on award — update `SpecProcurementEntry` with supplier name, confirmed unit rate/total cost, lead time. Set status to 'ordered'
    - Handle orphaned SpecForge references — log warning to audit trail, skip update, don't block award
    - Implement Project Passport records — write `ProjectRecord` on every status transition (RFQ number, title, stage, supplier, quoted value, timestamp)
    - Implement Action Centre events — emit `WorkflowEvent` for deadline reminders (48h), pending approvals (24h overdue), zero-quote alerts
    - Maintain bidirectional SpecForge link — display ProcurementStatus in SpecForge workspace, display Package_Scope title/ID in RFQ detail
    - Log all state transitions to `projects/{pid}/rfqs/{rfqId}/audit/`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 14.2 Write unit tests for integration service
    - Test SpecForge write-back with valid and orphaned references
    - Test Project Passport record creation for all transitions
    - Test Action Centre event emission (48h deadline, 24h approval)
    - Test bidirectional link display data
    - Test audit trail logging completeness
    - _Requirements: 8.1–8.5_

- [x] 15. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Implement React workspace UI
  - [x] 16.1 Create the RFQ Marketplace workspace component
    - Create `src/components/RfqMarketplaceWorkspace.tsx` following AppShell 3-column grid pattern
    - Implement Hero section (eyebrow "RFQ MARKETPLACE", h1 with project name, sub with context metadata, status pills)
    - Implement Stat Row (active RFQs count, pending quotes, awarded count, total value)
    - Implement content panels: RFQ list table, supplier discovery panel, quote comparison table, award approval panel
    - Use `.panel`, `.pill`, `.btn`, `.table`, `.chip` classes per workspace-template steering
    - Accept `user: UserProfile` prop, respect role-based visibility
    - _Requirements: All (UI layer)_

  - [x] 16.2 Create the `useRfqMarketplace` React hook
    - Create `src/hooks/useRfqMarketplace.ts`
    - Manage RFQ state (list, current RFQ, quotes, comparison, award)
    - Wire service layer calls to React state updates
    - Handle loading states, error states, and optimistic updates
    - _Requirements: All (state management)_

  - [x] 16.3 Register workspace in navigation and routing
    - Add lazy-loaded route in `App.tsx` via `lazyWithChunkRetry`
    - Register Tool Nav config in `src/navigation/toolNavRegistry.ts` (sections: Overview, RFQ Management, Supplier Discovery, Comparison, Awards)
    - Register in `src/navigation/architexNavigationConfig.ts` under Module 6 (Tender/Procurement/Supplier)
    - Configure role access (architect, quantity_surveyor, contractor, supplier, admin)
    - _Requirements: 10.1–10.6_

- [x] 17. Wire all components together and validate end-to-end flow
  - [x] 17.1 Wire service layer to UI and validate full lifecycle
    - Connect `RfqMarketplaceWorkspace` to all services via `useRfqMarketplace` hook
    - Validate full RFQ lifecycle: draft → published → evaluation → awarded
    - Ensure notification triggers fire on each transition
    - Ensure SpecForge and Project Passport write-backs execute on award
    - Ensure audit trail captures all events
    - Verify role-based visibility across all user types
    - _Requirements: All_

  - [ ]* 17.2 Write integration tests for full RFQ lifecycle
    - Test Firestore persistence round-trip (create RFQ → read back)
    - Test full lifecycle flow (draft → published → evaluation → awarded)
    - Test notification pipeline (mock notification service)
    - Test Project Passport record creation on transitions
    - Test Action Centre event emission
    - _Requirements: All_

- [x] 18. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using `fast-check` (minimum 100 iterations)
- Unit tests validate specific examples and edge cases
- All services use the existing `getDemoDoc`/`getDemoCol` Firestore pattern
- The UI follows the AppShell workspace-template pattern (Hero → Stat Row → Panels)
- CSS tokens from `architex-UI-Foundation-scaffold.html` must be used — no hardcoded hex values
- Integration with existing platform services (notificationService, projectPassportService, actionCentreService, verificationBadgeService, auditTrailService)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "10.1"] },
    { "id": 3, "tasks": ["2.2", "4.1", "5.1", "2.3", "2.4", "10.2"] },
    { "id": 4, "tasks": ["2.5", "2.6", "4.2", "5.2", "5.3", "5.4", "5.5", "5.6"] },
    { "id": 5, "tasks": ["6.1", "8.1"] },
    { "id": 6, "tasks": ["6.2", "6.3", "6.4", "6.5", "6.6", "8.2"] },
    { "id": 7, "tasks": ["9.1", "12.1"] },
    { "id": 8, "tasks": ["9.2", "9.3", "9.4", "12.2", "12.3", "12.4"] },
    { "id": 9, "tasks": ["13.1", "14.1"] },
    { "id": 10, "tasks": ["13.2", "14.2"] },
    { "id": 11, "tasks": ["16.1", "16.2"] },
    { "id": 12, "tasks": ["16.3"] },
    { "id": 13, "tasks": ["17.1"] },
    { "id": 14, "tasks": ["17.2"] }
  ]
}
```
