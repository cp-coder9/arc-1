# Implementation Plan: Commercial Control & RBAC Hardening

## Overview

This plan implements Sprint 6's commercial control hardening across the service layer, API middleware, Firestore security rules, audit infrastructure, and admin governance UI. Implementation follows a bottom-up approach: core types/interfaces first, then service logic, then API guards, then Firestore rules, then UI, with testing woven throughout.

## Tasks

- [x] 1. Set up core types, interfaces, and shared infrastructure
  - [x] 1.1 Create governed payment claim types and interfaces
    - Create `src/services/finance/claimGovernanceService.ts` with `ClaimValidationContext`, `ClaimValidationResult`, `GovernedPaymentClaim`, `FinancePartyRole`, and `MoneyAmount` interfaces
    - Define claim status union type: `'approval_required' | 'certified' | 'released' | 'rejected' | 'disputed'`
    - Define claim type union: `'milestone' | 'stage' | 'deliverable' | 'package' | 'purchase_order' | 'resource_booking'`
    - Export stub functions: `validateAndSubmitClaim`, `validatePartialRelease`, `applyRetention`, `rejectDuplicateClaim`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11_

  - [x] 1.2 Create escrow state machine types and valid transitions map
    - Create `src/services/finance/escrowStateMachine.ts` with `EscrowState`, `EscrowWallet`, `EscrowTransitionResult`, `TransitionEvidence`, `DisputeResolution` types
    - Define `VALID_TRANSITIONS` map: `Unfunded → [FundedHeld]`, `FundedHeld → [Released, Disputed]`, `Disputed → [Released, Unfunded]`, `Released → []`
    - Export stub functions: `transitionEscrow`, `handleFundingTimeout`, `raiseDispute`, `resolveDispute`
    - _Requirements: 2.1, 2.7_

  - [x] 1.3 Create certification control and separation-of-duty types
    - Create `src/services/finance/certificationControlService.ts` with `CertificationRequest`, `SeparationOfDutyCheck`, `PayoutBatch`, `FICAReport` interfaces
    - Define separation-of-duty constraint union: `'submitter_is_certifier' | 'submitter_is_releaser' | 'certifier_is_releaser'`
    - Export stub functions: `certifyWithSeparationOfDuty`, `validateSeparationOfDuty`, `createPayoutBatch`, `generateFICAReport`
    - _Requirements: 3.1, 3.3, 3.4, 3.7_

  - [x] 1.4 Create immutable audit service types and writer
    - Create `src/services/finance/auditTrailService.ts` with `ImmutableAuditRecord`, `AuditAction` type union, and evidence reference types
    - Define all audit action types: `claim_submitted`, `claim_rejected`, `claim_certified`, `payment_released`, `payment_failed`, `refund_initiated`, `escrow_funded`, `escrow_released`, `escrow_disputed`, `escrow_timeout`, `contract_generated`, `contract_signed`, `contract_locked`, `contract_varied`, `provider_webhook_received`, `tamper_attempt`
    - Implement `writeImmutableAuditRecord` with 5-year retention calculation and Admin SDK Firestore write
    - Implement `rejectAuditMutation` that writes a tamper-attempt record and returns 403
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.7_

  - [x] 1.5 Create contract engine types and interfaces
    - Create `src/services/contractAdmin/contractGateService.ts` with `ContractTemplate`, `ContractInstance`, `SignatureAuthority`, `VariationInput` interfaces
    - Export stub functions: `generateContractFromProposal`, `validateSignatureAuthority`, `signContract`, `lockContract`, `isContractGateSatisfied`, `createContractVariation`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 1.6 Create configuration versioning service types
    - Create `src/services/configVersioningService.ts` with `ConfigVersion<T>` interface and config type union
    - Export functions: `createConfigVersion`, `getVersionHistory`, `validateTariffEffectiveDate`, `preventDeletion`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

- [x] 2. Implement payment claim governance logic
  - [x] 2.1 Implement claim validation and submission for all party types
    - Implement `validateAndSubmitClaim` with type-specific validation branches for milestone, stage, deliverable, package, purchase_order, and resource_booking claims
    - Validate active project membership and correct role per claim type
    - Validate referenced entity exists and is in valid state (milestone exists, stage certified, deliverable accepted, package complete, PO confirmed, booking past)
    - Validate claimed amount does not exceed entity value
    - Check for duplicate pending/disputed claims from same claimant
    - On success: persist claim with status `approval_required`, write audit record, return claimId within 5s
    - On failure: return structured error with all failed conditions as separate entries, write failed-validation audit record
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.10, 1.11, 1.12_

  - [ ]* 2.2 Write property test for claim validation correctness
    - **Property 1: Payment claim validation correctness**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.10, 1.11**

  - [x] 2.3 Implement platform fee calculation and partial release logic
    - Implement fee calculation: `feeAmount = claimedAmount × tariffPercent`, `netPayable = claimedAmount - feeAmount`
    - Include tariffId, feeAmount, and netPayable in claim record
    - Implement `validatePartialRelease`: validate `amount ≤ (certifiedAmount - totalReleased - retentionHeld)`
    - Record partial release in claim ledger with amount, timestamp, releaseId
    - _Requirements: 1.7, 1.8_

  - [ ]* 2.4 Write property tests for platform fee and partial release
    - **Property 2: Platform fee calculation invariant**
    - **Property 3: Partial release balance invariant**
    - **Validates: Requirements 1.7, 1.8**

  - [x] 2.5 Implement retention application logic
    - Implement `applyRetention`: calculate retention as `amount × retentionPercent / 100` where 0 ≤ percent ≤ 10
    - Create `RetentionRecord` linked to claim and project's defects liability period
    - Read retention percentage from project's CommercialBaseline document
    - _Requirements: 1.9_

  - [ ]* 2.6 Write property test for retention calculation
    - **Property 4: Retention calculation correctness**
    - **Validates: Requirements 1.9**

  - [ ]* 2.7 Write property test for successful claim audit trail
    - **Property 5: Successful claim audit trail completeness**
    - **Validates: Requirements 1.12**

- [x] 3. Implement escrow state machine
  - [x] 3.1 Implement escrow state transition logic with validation
    - Implement `transitionEscrow`: validate target state is in `VALID_TRANSITIONS[currentState]`
    - For `Unfunded → FundedHeld`: require confirmed provider webhook within 300s
    - For `FundedHeld → Released`: require signed payment certificate, all linked milestones `approved_for_provider_request`, and `escrow:release` permission from non-claim-initiator
    - For `FundedHeld → Disputed`: transition within 5s and block all release requests
    - For `Disputed → Released` (claimant wins): require `dispute:resolve` from non-party signer
    - For `Disputed → Unfunded` (funder wins): initiate refund via provider
    - On invalid transition: reject with current state and allowed targets, log attempt with actor UID and ISO-8601 timestamp
    - Write append-only audit record for every transition
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [ ]* 3.2 Write property tests for escrow state machine
    - **Property 6: Escrow state machine transition validity**
    - **Property 7: Disputed wallet blocks all releases**
    - **Property 8: Escrow transition audit completeness**
    - **Validates: Requirements 2.1, 2.5, 2.7, 2.8**

  - [x] 3.3 Implement escrow timeout and dispute resolution handlers
    - Implement `handleFundingTimeout`: mark transition as timed out after 300s, write audit record, emit inbox notification to escrow owner
    - Implement `raiseDispute`: transition to Disputed within 5s, block releases
    - Implement `resolveDispute`: handle `in_favour_of_claimant` (release) and `in_favour_of_funder` (refund) outcomes with appropriate permissions
    - _Requirements: 2.4, 2.6, 2.9_

- [x] 4. Implement payment certification and release controls
  - [x] 4.1 Implement certification with separation-of-duty enforcement
    - Implement `certifyWithSeparationOfDuty`: verify certifier holds `payment:manage` and is not claim submitter
    - Implement `validateSeparationOfDuty`: check that submitter, certifier, and release approver are three distinct UIDs
    - On violation: reject with error indicating which constraint is violated (e.g., `submitter_is_certifier`)
    - Preserve claim in pre-certification state on rejection
    - _Requirements: 3.1, 3.3_

  - [ ]* 4.2 Write property test for three-party separation of duty
    - **Property 9: Three-party separation of duty**
    - **Validates: Requirements 3.1, 3.3**

  - [x] 4.3 Implement payout batch creation and FICA reporting
    - Implement `createPayoutBatch`: group certified releases by provider, max 200 per batch, assign unique batch reference
    - Submit each batch through registered provider
    - Implement `generateFICAReport`: trigger when single transaction > R50,000 or daily aggregate per party > R50,000
    - Include party identifier, transaction references, and triggering amount
    - _Requirements: 3.4, 3.7_

  - [ ]* 4.4 Write property tests for payout batch and FICA
    - **Property 10: Payout batch constraints**
    - **Property 11: FICA threshold reporting**
    - **Validates: Requirements 3.4, 3.7**

  - [x] 4.5 Implement payment failure recovery and refund handling
    - On provider payment failure: revert escrow to FundedHeld, record failure reason, notify release approver and claim submitter within 60s
    - Implement refund flow: require `admin:override` permission, reason ≥ 10 chars, create refund audit record linking original certificate, route through registered provider
    - _Requirements: 3.5, 3.6_

- [x] 5. Checkpoint - Ensure all service layer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement contract engine and signature gates
  - [x] 6.1 Implement contract generation and signature authority validation
    - Implement `generateContractFromProposal`: convert accepted proposal to appointment record, generate contract from active versioned template within 60s
    - Support up to 50 special conditions per contract, track redline annotations as contract variations
    - Implement `validateSignatureAuthority`: verify signer holds registered, active `SignatureAuthority` for document type and representing party
    - On invalid authority: reject signature, return error, write rejected-signature audit record
    - _Requirements: 4.1, 4.2, 4.3, 4.9_

  - [ ]* 6.2 Write property test for signature authority enforcement
    - **Property 12: Signature authority enforcement**
    - **Validates: Requirements 4.3, 4.9**

  - [x] 6.3 Implement contract locking and gate enforcement
    - Implement `lockContract`: when all required signatures collected, lock as Immutable_Version, record lock event in audit trail
    - Implement `isContractGateSatisfied`: while contract lacks required signatures, block escrow activation and payment schedule creation
    - Write all contract actions to ProjectRecord, Passport, Inbox, and Audit collections within 60s
    - _Requirements: 4.4, 4.5, 4.8_

  - [ ]* 6.4 Write property test for contract locking on signature completion
    - **Property 13: Contract locking on signature completion**
    - **Validates: Requirements 4.4, 4.5**

  - [x] 6.5 Implement contract variation and claim linkage
    - Implement `createContractVariation`: link variation to parent contract, create new version
    - Require fresh signatures when variation modifies contract sum, payment schedule, rates, penalties, retention %, or fee structure
    - Implement claim/dispute linkage to latest locked Immutable_Version effective at event time
    - _Requirements: 4.6, 4.7_

  - [ ]* 6.6 Write property test for contract variation signature requirement
    - **Property 14: Contract variation signature requirement**
    - **Validates: Requirements 4.6**

- [x] 7. Implement API guard middleware
  - [x] 7.1 Enhance roleMiddleware with permission guard factory
    - Implement `requirePermissionWithGuards` factory in `src/lib/roleMiddleware.ts`
    - Chain: `requireAuth` → verify Firebase token via `verifyIdToken` → extract role from Firestore users collection → `normalizeUserForAuthz` → verify active `ProjectAccessRole` membership → pass to handler
    - Evaluate using `canUserPerform` against `ROLE_PERMISSIONS` and `PROJECT_ACCESS_PERMISSIONS` matrices
    - _Requirements: 6.1, 6.2_

  - [ ]* 7.2 Write property test for API Guard permission agreement
    - **Property 15: API Guard permission agreement with canUserPerform**
    - **Validates: Requirements 6.2**

  - [x] 7.3 Implement separation-of-duty and commercial gate checks for payment endpoints
    - For `payment:manage` and `escrow:release` actions: validate requesting user is not claim initiator or certifier
    - Verify `project.commercialGateOpen` field is `true` before allowing payment writes
    - _Requirements: 6.3_

  - [ ]* 7.4 Write property test for payment write commercial gate
    - **Property 17: Payment write commercial gate and separation of duty**
    - **Validates: Requirements 6.3**

  - [x] 7.5 Implement opaque error responses and audit trail for rejections
    - On auth failure (missing/expired/invalid token): return HTTP 401 with `{ error: string, requestId: string }` — do not reveal specific token failure reason
    - On authorization failure: return HTTP 403 with `{ error: string, requestId: string }` — generic denial, do not reveal which check failed
    - Write audit trail record on every rejection: actor UID, attempted action, target resource, internal denial reason
    - _Requirements: 6.4, 6.5, 6.7_

  - [ ]* 7.6 Write property test for opaque error format
    - **Property 16: API Guard opaque error format**
    - **Validates: Requirements 6.4**

- [x] 8. Implement Firestore security rules
  - [x] 8.1 Implement project membership and role-scoped access rules
    - Add rules enforcing project membership for all project-scoped reads/writes (client, lead professional, active team member, firm member when firmAccessEnabled)
    - Add package-limited access for subcontractors: validate `awardedContractorId` matches requesting UID
    - Add task-limited access for freelancers: validate `assigneeId` or `assignedFreelancerId` matches UID
    - Add supplier access scoping: validate package assignment or eligible contractor listing
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 8.2 Implement server-only write rules and admin elevation protection
    - Deny all client-side writes to escrow and payments collections (server-only via Admin SDK)
    - Deny client-side admin/platform_admin role assignment on user documents
    - Implement default-deny posture: unmatched paths deny both reads and writes
    - _Requirements: 5.5, 5.6, 5.7, 5.9_

  - [x] 8.3 Implement audit trail append-only protection rules
    - Allow authenticated `create` operations on `audit_logs`, `access_logs`, `project_stage_history`, and `firms/{firmId}/audit_events`
    - Deny all `update` and `delete` operations on existing audit records
    - _Requirements: 5.8_

- [x] 9. Checkpoint - Ensure API guard and rules tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement Firestore rules test suite and unauthorized access tests
  - [x] 10.1 Write Firestore emulator tests for project membership and scoped access
    - Write positive and negative tests for project membership enforcement (5.1)
    - Write positive and negative tests for package-limited subcontractor access (5.2)
    - Write positive and negative tests for task-limited freelancer access (5.3)
    - Write positive and negative tests for supplier access scoping (5.4)
    - Test non-member project access denial across project documents, drawing checklists, municipal submissions, gantt tasks, transmittals, coordination items
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.10, 7.1, 7.2, 7.3, 7.4_

  - [x] 10.2 Write Firestore emulator tests for server-only writes, admin elevation, and audit protection
    - Test payment/escrow server-only write enforcement (5.5)
    - Test admin role elevation denial from client (5.6)
    - Test composite write denial for unauthorized users (5.7)
    - Test audit trail append-only enforcement (5.8)
    - Test default-deny on unmatched paths (5.9)
    - Test unauthenticated write denial across 5+ collections (7.8)
    - Test client-side admin elevation denial (7.6)
    - _Requirements: 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 7.6, 7.8_

  - [x] 10.3 Write unauthorized access tests for separation-of-duty and override scenarios
    - Test claim submitter cannot certify own claim (7.5)
    - Test admin override without documented reason is rejected (7.7)
    - Write as Vitest unit tests compatible with `npm test` or Firestore emulator tests with `npm run test:firestore:rules`
    - Each test deterministic pass/fail within 30s
    - _Requirements: 7.5, 7.6, 7.7, 7.9_

  - [x] 10.4 Write shared test suite for Firestore rules and API Guard agreement
    - Create test matrix covering all PermissionAction values × all ProjectAccessRole combinations
    - Assert both Firestore rules and API Guard produce identical allow/deny decisions for each tuple
    - _Requirements: 6.6_

- [x] 11. Implement immutable audit service enhancements
  - [x] 11.1 Implement complete audit record structure with evidence and human confirmation
    - Ensure every financial event audit record includes: actor UID, actor role, ISO-8601 timestamp, action type, target resource ID, and at least one evidence reference
    - For monetary events: include monetary amount (currency + value)
    - For payment releases: include human confirmation references (certifier UID/role, approver UID/role) alongside provider references
    - For provider webhooks: record provider ID, reference, transaction ID, status, amount, confirmation timestamp
    - Set `retentionExpiresAtIso` to exactly 5 years from creation date
    - _Requirements: 8.1, 8.2, 8.3, 8.5, 8.6, 8.7_

  - [ ]* 11.2 Write property tests for immutable audit service
    - **Property 18: Immutable audit record structure**
    - **Property 19: Audit record tamper protection**
    - **Property 20: Audit record 5-year retention**
    - **Property 21: Payment release human confirmation**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7**

- [x] 12. Implement provider registration enforcement
  - [x] 12.1 Implement provider validation and dual confirmation logic
    - Validate every payment record, release request, and payout action has a valid `providerId` referencing a registered, `liveConfigured` provider
    - Reject writes missing `providerId` or provider transaction reference with structured error and failed-validation audit record
    - Include provider name and provider-issued reference in every persisted record
    - Implement dual confirmation: mark action complete only when both provider confirmation AND human authorization are present
    - Handle provider timeout (120s): mark as `provider_configuration_required`, write timeout audit, notify release approver
    - _Requirements: 11.1, 11.2, 11.4, 11.5, 11.6_

  - [ ]* 12.2 Write property tests for provider enforcement
    - **Property 25: Provider registration enforcement**
    - **Property 26: Dual confirmation for payment completion**
    - **Validates: Requirements 11.1, 11.2, 11.4, 11.6**

- [x] 13. Checkpoint - Ensure all service and rule tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Implement Admin Governance Console UI
  - [x] 14.1 Create AdminGovernanceConsolePage component with view routing
    - Create `src/components/AdminGovernanceConsolePage.tsx` accepting `user: UserProfile` prop
    - Implement view routing for: `project-search`, `user-management`, `feature-flags`, `tariff-registry`, `payment-rates`, `escrow-oversight`, `ai-governance`, `flagged-messages`, `audit-viewer`, `override-log`
    - Restrict access to `platform_admin` and `admin` roles only
    - Follow Hero → Stat Row → Panels content pattern per workspace-template steering
    - Register in `toolNavRegistry.ts` with appropriate sections
    - _Requirements: 9.1_

  - [x] 14.2 Implement user/role management and override audit views
    - Implement user, role, and professional verification management with all changes writing to audit trail (acting admin UID, target entity, change description, timestamp)
    - Implement admin override audit log view: show overriding admin UID, target action, project ID, reason, timestamp
    - Display flag indicating whether override was performed by different admin than reviewer
    - Immutable override records (cannot be modified/deleted after creation)
    - _Requirements: 9.2, 9.9, 9.10, 9.11_

  - [x] 14.3 Implement escrow oversight and flagged messages views
    - Implement escrow/dispute oversight: show all active escrow wallets and disputed items with state, amount, last-updated timestamp
    - Implement flagged messages view: display message content, reporter identity, flag reason, timestamp
    - _Requirements: 9.6, 9.8_

  - [x] 14.4 Implement immutable audit viewer with filtering
    - Implement audit viewer showing all platform actions
    - Support filtering by actor, action type, project, and date range
    - Return maximum 500 records per query
    - Ensure no record can be edited, deleted, or overwritten after creation
    - _Requirements: 9.12_

- [x] 15. Implement configuration versioning UI and logic
  - [x] 15.1 Implement feature flag and tariff rule management with versioning
    - Implement feature flag management: create version record on each change (previous value, new value, modifier UID, UTC timestamp)
    - Retain at least previous 50 versions per configuration item
    - Implement tariff rule management: include effective date (must be current or future, reject past dates)
    - _Requirements: 9.3, 9.4, 10.1, 10.2, 10.3_

  - [x] 15.2 Implement payment rate and AI prompt configuration with reason requirement
    - Implement payment rate settings: require reason ≥ 10 chars before accepting change, create version record
    - Implement AI prompt/review governance: require reason ≥ 10 chars, record previous prompt text, new text, reason, modifier UID, timestamp
    - Prevent deletion of all version history records (append-only change trail)
    - Display version history in reverse-chronological order
    - _Requirements: 9.5, 9.7, 10.4, 10.5, 10.6, 10.7_

  - [ ]* 15.3 Write property tests for configuration versioning
    - **Property 22: Admin override requires documented reason**
    - **Property 23: Configuration versioning completeness**
    - **Property 24: Configuration version history ordering**
    - **Validates: Requirements 9.9, 9.10, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7**

- [x] 16. Wire payment UI disclaimer and integration
  - [x] 16.1 Add persistent provider disclaimer to payment UI
    - Display persistent disclaimer in payment panel: funds held/processed by named registered provider, Architex does not hold/store/custody funds
    - Include provider name dynamically from registered provider record
    - _Requirements: 11.3_

- [x] 17. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using `fast-check` with 100+ iterations
- Unit tests validate specific examples and edge cases
- Firestore emulator tests verify security rules with positive and negative cases
- The Admin Governance Console follows the workspace-template steering pattern (Hero → Stat Row → Panels)
- All financial operations orchestrate through registered third-party providers — Architex does NOT hold funds

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1", "6.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.2", "3.3", "4.3", "6.2", "6.3"] },
    { "id": 3, "tasks": ["2.4", "2.5", "4.2", "4.4", "4.5", "6.4", "6.5"] },
    { "id": 4, "tasks": ["2.6", "2.7", "6.6", "7.1", "11.1"] },
    { "id": 5, "tasks": ["7.2", "7.3", "8.1", "11.2", "12.1"] },
    { "id": 6, "tasks": ["7.4", "7.5", "8.2", "8.3", "12.2"] },
    { "id": 7, "tasks": ["7.6", "10.1", "10.2"] },
    { "id": 8, "tasks": ["10.3", "10.4"] },
    { "id": 9, "tasks": ["14.1", "15.1"] },
    { "id": 10, "tasks": ["14.2", "14.3", "14.4", "15.2"] },
    { "id": 11, "tasks": ["15.3", "16.1"] }
  ]
}
```
