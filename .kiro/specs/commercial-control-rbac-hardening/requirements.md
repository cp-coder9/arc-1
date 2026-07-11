# Requirements Document

## Introduction

Sprint 6 — Commercial Control & RBAC Hardening. This sprint hardens Architex's financial workflows, contract/signature gates, Firestore security rules, and admin governance controls. The goal is production-grade commercial control: no payment releases without proper approvals, immutable audit trails on all money movement, server-side enforcement of role-based access, and governed admin oversight. Architex does NOT hold funds — it orchestrates provider references, approvals, webhooks, and audit trails through registered third-party financial service providers.

## Glossary

- **Finance_Engine**: The server-side service layer (`src/services/finance/`) responsible for orchestrating payment claims, escrow lifecycle, certifications, and provider interactions
- **Escrow_State_Machine**: The state machine governing escrow wallet lifecycle with states: Unfunded → FundedHeld → Released / Disputed
- **Contract_Engine**: The service layer (`src/services/contractAdmin/`) managing contract generation, signature collection, versioning, and immutability enforcement
- **Permission_Service**: The authorization layer (`src/services/permissionService.ts`) evaluating role-based and project-scoped access decisions
- **Firestore_Rules**: The Firebase Security Rules governing client-side read/write access at the database level
- **API_Guard**: Server-side Express middleware that validates authentication, role, project membership, and action authorization before processing write requests
- **Audit_Service**: The immutable append-only logging service recording all sensitive platform actions with actor, timestamp, action, and evidence
- **Admin_Console**: The platform governance UI (`AdminGovernanceConsolePage.tsx`) providing admin oversight, search, and configuration management
- **Separation_Of_Duty**: A control requiring that the person who initiates a financial action cannot also approve/release that same action
- **Payment_Claim**: A request from a contractor, subcontractor, or professional for payment against a milestone, deliverable, or package
- **Payment_Certificate**: A signed approval document authorizing release of funds against a verified claim
- **Commercial_Gate**: A prerequisite condition (signature, approval, verification) that must be satisfied before a financial action can proceed
- **FICA_Report**: A Financial Intelligence Centre Act report (CTR ≥ R50,000 or STR/SAR) triggered by monetary threshold or suspicious activity
- **Provider_Webhook**: An inbound callback from a registered third-party financial service provider confirming transaction status
- **Signature_Authority**: A verified user with contractual authority to execute a binding signature on a specific document type
- **Immutable_Version**: A locked document snapshot that cannot be modified; changes create new revision versions
- **Project_Membership**: An active, verified association between a user and a project granting specific project-scoped access roles
- **Package_Assignment**: A scoped assignment granting a subcontractor or supplier access only to their designated work package within a project
- **Task_Assignment**: A scoped assignment granting a freelancer access only to their designated task within a project

## Requirements

### Requirement 1: Payment Claim Governance Workflows

**User Story:** As a project lead professional, I want governed payment claim workflows for all party types, so that no payment releases without proper approvals and commercial gates being satisfied.

#### Acceptance Criteria

1. WHEN a professional submits a milestone payment claim, THE Finance_Engine SHALL validate that the referenced milestone exists, the claimant holds an active project membership with payment:read permission, and the claimed amount does not exceed the milestone value, and upon successful validation SHALL persist the claim with status "approval_required" and return the generated claimId to the caller within 5 seconds
2. WHEN a contractor submits a stage payment claim, THE Finance_Engine SHALL validate that the construction stage is certified complete by the site manager or lead professional before accepting the claim, and SHALL reject the claim if the stage certification record does not exist or is dated later than the claim submission timestamp
3. WHEN a freelancer submits a deliverable payment claim, THE Finance_Engine SHALL validate that the deliverable is marked as accepted by the assigning professional and the freelancer holds an active freelancer_task_assignee role on the project
4. WHEN a subcontractor submits a package payment claim, THE Finance_Engine SHALL validate that the package scope is complete, the subcontractor holds subcontractor_package_assignee on the project, and the claim does not exceed the package value
5. WHEN a supplier submits a material purchase order claim, THE Finance_Engine SHALL validate that the PO exists, delivery is confirmed, and the supplier holds supplier_package_assignee on the project
6. WHEN a resource booking payment claim is submitted, THE Finance_Engine SHALL validate that the booking period end date is in the past relative to submission time and the booking was authorized by a user with payment:manage permission
7. WHEN a payment claim requires split fees or platform fees, THE Finance_Engine SHALL calculate the platform fee by applying the tariff percentage associated with the project's active fee schedule and include the fee amount, the net payable amount, and the tariff identifier in the claim record before certification
8. WHEN a partial release is requested against a certified claim, THE Finance_Engine SHALL validate that the partial amount does not exceed the remaining releasable balance (defined as certified amount minus total previously released amounts minus retention held) and record the partial release in the claim ledger
9. WHEN retention is applied to a payment claim, THE Finance_Engine SHALL withhold the retention percentage configured on the project's CommercialBaseline (between 0% and 10% inclusive) and create a RetentionRecord linked to the claim and the project's defects liability period
10. IF a payment claim fails one or more validation conditions, THEN THE Finance_Engine SHALL return a structured error listing each failed condition as a separate entry with a machine-readable condition identifier and a human-readable description, and SHALL write a failed-validation audit record containing the claimant identity, claim parameters, and all failed conditions
11. IF a claimant submits a payment claim against a milestone that already has a pending or disputed claim from the same claimant, THEN THE Finance_Engine SHALL reject the duplicate claim and return an error indicating the existing claim's identifier and status
12. WHEN the Finance_Engine successfully validates and persists a payment claim, THE Finance_Engine SHALL write an audit record containing the claimant role, claim amount, linked milestone or package identifier, and the timestamp of acceptance

### Requirement 2: Escrow State Machine and Dispute Holds

**User Story:** As a project owner, I want escrow wallets to follow a governed state machine with dispute hold capability, so that funds are protected and disputes are resolved fairly.

#### Acceptance Criteria

1. THE Escrow_State_Machine SHALL enforce exactly four states: Unfunded, FundedHeld, Released, and Disputed, and SHALL reject any attempt to assign a state value outside this enumeration
2. WHEN an escrow wallet transitions from Unfunded to FundedHeld, THE Escrow_State_Machine SHALL require a confirmed provider webhook indicating successful fund receipt before completing the transition, and SHALL reject the transition if the webhook confirmation is not received within 300 seconds of the funding request
3. WHEN an escrow wallet transitions from FundedHeld to Released, THE Escrow_State_Machine SHALL require a signed payment certificate, confirmation that all linked payment milestones have status "approved_for_provider_request" or later, and a release request from a user with escrow:release permission who is not the claim initiator
4. WHEN a dispute is raised against a FundedHeld escrow wallet, THE Escrow_State_Machine SHALL transition the wallet to Disputed state within 5 seconds and block all release requests until resolution
5. WHILE an escrow wallet is in Disputed state, THE Escrow_State_Machine SHALL reject any release requests and record each rejected attempt in the audit trail including the requesting actor UID, timestamp, and rejection reason
6. WHEN a dispute is resolved, THE Escrow_State_Machine SHALL transition the wallet to Released if the resolution outcome is "in_favour_of_claimant", or initiate a refund to the funding party if the resolution outcome is "in_favour_of_funder", requiring a digital signature from a user holding the dispute:resolve permission who was not a party to the dispute
7. IF an invalid state transition is attempted, THEN THE Escrow_State_Machine SHALL reject the transition, log the attempt with actor UID and ISO-8601 timestamp, and return a structured error indicating the current state and the list of allowed target states from the current state
8. THE Escrow_State_Machine SHALL write an append-only audit record for every state transition including actor UID, ISO-8601 timestamp, previous state, new state, and an evidence reference linking to the triggering artifact (webhook event ID, certificate ID, release request ID, or dispute resolution ID)
9. IF a provider webhook confirmation is not received within 300 seconds of a funding request for an Unfunded escrow wallet, THEN THE Escrow_State_Machine SHALL mark the transition as timed out, record the timeout in the audit trail, and emit an inbox notification to the escrow owner indicating the funding attempt failed

### Requirement 3: Payment Certification and Release Controls

**User Story:** As a quantity surveyor, I want payment certificates to require proper authority and separation of duty, so that no single person can both claim and release funds.

#### Acceptance Criteria

1. WHEN a payment certificate is issued, THE Finance_Engine SHALL verify that the certifying user holds the payment:manage permission and is not the user who submitted the linked claim; IF the certifying user is the claim submitter or lacks payment:manage permission, THEN THE Finance_Engine SHALL reject the certification with an error message indicating the specific violation (missing permission or separation-of-duty breach) and preserve the claim in its pre-certification state
2. WHEN a payment release is requested, THE Finance_Engine SHALL validate that a payment certificate with status approved_for_provider_request exists for the claim, all linked milestones and variation orders referenced by the certificate are in approved or incorporated status, and the releasing user holds escrow:release permission
3. THE Finance_Engine SHALL enforce that the claim submitter, the certifier, and the release approver are three distinct user identifiers for any single payment flow; IF any two of the three roles resolve to the same user, THEN THE Finance_Engine SHALL reject the action with an error message indicating which separation-of-duty constraint is violated
4. WHEN a payout batch is created, THE Finance_Engine SHALL group certified releases by provider, include no more than 200 release requests per batch, and submit each batch through the registered third-party provider with a unique batch reference identifier recorded against each included release
5. IF a provider-mediated payment fails, THEN THE Finance_Engine SHALL revert the escrow state to FundedHeld, record the provider-returned failure reason in the audit trail, and send notifications to the release approver and the claim submitter within 60 seconds of receiving the failure event from the provider
6. WHEN a refund is initiated, THE Finance_Engine SHALL require that the initiating user holds admin:override permission, that a reason of at least 10 characters is provided, create a refund audit record linking the original certificate and the stated reason, and route the refund instruction through the registered provider
7. WHEN any single transaction exceeds R50,000 or the aggregate of transactions for a single party within a calendar day (00:00–23:59 SAST) exceeds R50,000, THE Finance_Engine SHALL generate a FICA_Report containing the party identifier, transaction references, and the total amount that triggered the threshold

### Requirement 4: Contract and Signature Gates

**User Story:** As a lead professional, I want contracts to gate payment and project activation, so that no commercial activity begins without binding signed agreements.

#### Acceptance Criteria

1. WHEN a proposal is accepted, THE Contract_Engine SHALL convert the accepted proposal into an appointment record and generate a contract from the active versioned template within 60 seconds of acceptance
2. WHEN a contract is generated, THE Contract_Engine SHALL support special conditions (up to 50 per contract) and redline annotations that are tracked as contract variations
3. WHEN a signatory attempts to sign a contract, THE Contract_Engine SHALL validate that the signer holds a registered Signature_Authority record for the document type and the contracting party they represent before accepting the signature
4. WHEN all required signatures are collected, THE Contract_Engine SHALL lock the signed version as an Immutable_Version and record the lock event in the contract audit trail
5. WHILE a contract lacks required signatures, THE Finance_Engine SHALL block escrow activation and payment schedule creation for the associated project scope
6. WHEN a contract variation, notice, or extension of time is issued, THE Contract_Engine SHALL link the variation to the parent contract, create a new version, and require fresh signatures where the variation modifies contract sum, payment schedule, rates, penalties, retention percentage, or fee structure
7. WHEN a payment claim or dispute is filed, THE Contract_Engine SHALL link the claim or dispute record to the latest locked Immutable_Version of the governing contract that was effective at the time the claim or dispute event occurred
8. THE Contract_Engine SHALL write all contract actions (generation, signature, lock, variation, notice, claim linkage) to ProjectRecord, Passport, Inbox, and Audit collections within 60 seconds of the triggering action
9. IF a signatory attempts to sign a contract without a valid Signature_Authority record for the document type, THEN THE Contract_Engine SHALL reject the signature attempt, return an error indicating the authority requirement, and write a rejected-signature audit record

### Requirement 5: Firestore Security Rules Enforcement

**User Story:** As a platform administrator, I want Firestore rules to enforce the same access controls as the server-side API, so that no client-side bypass is possible.

#### Acceptance Criteria

1. THE Firestore_Rules SHALL enforce project membership for all project-scoped document reads and writes by verifying that the requesting user is the project client, a lead professional, an active team member (teamMembers entry with status "active"), or an active firm member when firmAccessEnabled is true — rejecting requests from users who satisfy none of these conditions
2. THE Firestore_Rules SHALL enforce package-limited access for subcontractors, restricting reads and writes to documents where the document's packageId references a tender_package whose awardedContractorId matches the requesting user's UID
3. THE Firestore_Rules SHALL enforce task-limited access for freelancers, restricting reads and writes to documents where the document's assigneeId or assignedFreelancerId matches the requesting user's UID
4. THE Firestore_Rules SHALL enforce supplier access scoping, restricting reads and writes to documents where the document's packageId references a tender_package whose awardedContractorId matches the requesting user's UID or where the supplier is listed as an eligible contractor for the package
5. THE Firestore_Rules SHALL enforce separation of duty on payment and escrow documents by denying all client-side writes to the escrow and payments collections (mutations to these collections are permitted only through server-side Admin SDK operations)
6. THE Firestore_Rules SHALL reject admin role assignment attempts from client-side writes (admin roles may only be assigned through server-side Admin SDK operations), specifically denying any user document update that modifies the role field to "admin" or "platform_admin" unless the request originates from the Admin SDK
7. IF a Firestore write request lacks valid Firebase Authentication, a recognized role value in the user document, active project membership as defined in criterion 1, or the appropriate package/task assignment as defined in criteria 2–4, THEN THE Firestore_Rules SHALL deny the write and return a permission-denied error
8. THE Firestore_Rules SHALL protect audit trail collections (audit_logs, access_logs, project_stage_history, and firms/{firmId}/audit_events) as append-only by allowing authenticated create operations while denying all update and delete operations on existing records
9. THE Firestore_Rules SHALL enforce a default-deny posture: any document path not matched by an explicit allow rule SHALL deny both reads and writes, ensuring no unprotected collection can be accessed from the client
10. IF the Firestore emulator test suite (scripts/run-firestore-rules-tests.mjs) is executed, THEN every acceptance criterion in this requirement SHALL have at least one passing positive test (access granted for authorized user) and one passing negative test (access denied for unauthorized user)

### Requirement 6: Server-Side API Guards

**User Story:** As a security engineer, I want every write endpoint to validate auth, role, membership, and scope before processing, so that the API layer independently enforces access control regardless of client behaviour.

#### Acceptance Criteria

1. WHEN a project-scoped write request is received, THE API_Guard SHALL validate the Firebase Auth token via Firebase Admin SDK verifyIdToken, extract the user role from the Firestore users collection, normalize the user via normalizeUserForAuthz, and verify the user holds an active ProjectAccessRole membership on the target project before passing the request to the route handler
2. WHEN a write endpoint is invoked, THE API_Guard SHALL evaluate the authenticated user against the Permission_Service canUserPerform function using the same ROLE_PERMISSIONS and PROJECT_ACCESS_PERMISSIONS matrices, such that any request permitted by canUserPerform passes the guard and any request denied by canUserPerform is rejected
3. WHEN a payment-related write is attempted (actions: payment:manage, escrow:release), THE API_Guard SHALL additionally validate that the requesting user is not the same user who initiated or certified the payment milestone (separation of duty), and SHALL verify that the project's commercial gate status (project.commercialGateOpen field) is true before allowing the write to proceed
4. IF authorization fails at any guard check, THEN THE API_Guard SHALL reject the request with HTTP 403 and a JSON body containing exactly the fields { error: string, requestId: string } where the error string is a generic denial message that does not indicate whether authentication, role, membership, or permission was the failing check
5. WHEN a write request is rejected by the API_Guard, THE API_Guard SHALL write an audit trail record to Firestore at projects/{projectId}/auditTrail/{eventId} (or platform-level auditTrail/{eventId} for non-project-scoped requests) containing actor UID, attempted PermissionAction, target resource identifier, and internal denial reason within 5 seconds of the rejection
6. THE Firestore_Rules and API_Guard SHALL produce identical allow/deny decisions for any given (user, action, resource) tuple — verified by a shared test suite that asserts agreement across at least the full set of PermissionAction values and all ProjectAccessRole combinations
7. IF the Firebase Auth token is missing, expired, or fails verifyIdToken validation, THEN THE API_Guard SHALL reject the request with HTTP 401 and a JSON body containing { error: string, requestId: string } without revealing the specific token failure reason to external callers

### Requirement 7: Unauthorized Access Tests

**User Story:** As a developer, I want comprehensive unauthorized-action tests for all critical workflows, so that access control regressions are caught before deployment.

#### Acceptance Criteria

1. WHEN a test user without project membership (not in the project's participant list) attempts to read or write a project-scoped document, THE test suite SHALL verify that the operation is rejected with a permission-denied error, covering at least the following collections: project documents, drawing checklists, municipal submissions, gantt tasks, transmittals, and coordination items
2. WHEN a test user with the subcontractor role attempts to read or write a document belonging to a tender package they are not assigned to (their UID does not appear in the package's participant list or awardedContractorId), THE test suite SHALL verify that the operation is rejected with a permission-denied error for at least 3 package-linked collections (package_procurement_commitments, package_delivery_evidence, site_instructions)
3. WHEN a test user with the freelancer role attempts to read or write a work package where assignedFreelancerId does not match their UID, THE test suite SHALL verify that the read and update operations are rejected with a permission-denied error
4. WHEN a test user with the supplier role attempts to read or write a document belonging to a tender package they are not invited to or awarded, THE test suite SHALL verify that the operation is rejected with a permission-denied error for at least 2 package-linked collections
5. IF a user who submitted a payment claim (identified by createdBy field matching their UID) attempts to certify or release that same claim, THEN THE test suite SHALL verify that the operation is rejected, confirming that submitter and certifier must be different UIDs
6. WHEN a test user attempts to set their own role field to platform_admin or admin via a client-side Firestore write to the users collection, THE test suite SHALL verify that the operation is rejected by Firestore security rules with a permission-denied error
7. IF a platform_admin user attempts to bypass a financial approval gate (escrow release or payment certification) without providing an auditable reason of at least 10 characters, THEN THE test suite SHALL verify that the override is rejected and no state change occurs
8. WHEN an unauthenticated request (request.auth == null) attempts any write operation, THE test suite SHALL verify that the operation is rejected with a permission-denied error, covering at least 5 distinct writable collections including audit_logs, user_verifications, project_briefs, proposals, and delegatedTasks
9. THE test suite SHALL execute all unauthorized-action tests as Vitest unit tests compatible with the existing test infrastructure (run via `npm test`) or as Firestore emulator tests (run via `npm run test:firestore:rules`), with each test producing a deterministic pass/fail result within 30 seconds per test case

### Requirement 8: Immutable Financial Audit Trail

**User Story:** As a compliance officer, I want every money movement to have immutable audit evidence, so that the platform maintains a complete and tamper-proof financial record.

#### Acceptance Criteria

1. WHEN a payment claim submission, certification, release, refund, or dispute action occurs, THE Audit_Service SHALL write an immutable record within 5 seconds including actor UID, actor role, ISO 8601 timestamp, action type, monetary amount, target resource ID, and at least one evidence reference (provider transaction ID, document version, or approval chain ID)
2. WHEN an escrow state transition occurs, THE Audit_Service SHALL write an immutable record within 5 seconds including previous state, new state, trigger event identifier, timestamp, and provider reference
3. WHEN a contract signature, lock, or variation event occurs, THE Audit_Service SHALL write an immutable record including document version identifier, signatory UID, signatory role, and authority validation result (pass or fail with reason)
4. IF a modification or deletion of an existing audit record is attempted through any interface, THEN THE Audit_Service SHALL reject the operation, return a 403 status, and write a separate tamper-attempt audit entry recording the actor UID, target record ID, and attempted operation
5. WHEN a provider webhook reports a transaction status event, THE Audit_Service SHALL record the provider ID, provider reference, transaction ID, reported status, monetary amount, and confirmation timestamp as audit evidence regardless of whether the status is success or failure
6. THE Audit_Service SHALL include human confirmation references (certifier UID, approver UID, and their roles) alongside provider references for every payment release record
7. THE Audit_Service SHALL retain all financial audit records (categories: payment, escrow, contract, dispute) for a minimum of 5 years from the record creation date, and SHALL NOT permit automated or manual purging of records within the retention period

### Requirement 9: Admin Governance Console

**User Story:** As a platform administrator, I want a governed admin console with separation-of-duty controls, so that admin actions are audited and no single admin can silently bypass approval gates.

#### Acceptance Criteria

1. THE Admin_Console SHALL provide all-project search, inspect, and audit view functionality accessible only to users with platform_admin or admin role
2. THE Admin_Console SHALL provide user, role, and professional verification management with all changes writing to the audit trail including the acting admin UID, target entity, change description, and timestamp
3. THE Admin_Console SHALL provide feature flag and toolset management with version history for all configuration changes, retaining at least the previous 50 versions per configuration item
4. THE Admin_Console SHALL provide tariff and rule registry management where each change is versioned with an effective date that must be a current or future calendar date
5. THE Admin_Console SHALL provide payment rate settings management where each change is versioned and requires a documented reason of at least 10 characters before persistence
6. THE Admin_Console SHALL provide escrow and dispute oversight view showing all active escrow wallets and disputed items with current state, amount, and last-updated timestamp
7. THE Admin_Console SHALL provide AI prompt and review governance controls with change audit trail recording the previous value, new value, and modifying admin UID for each change
8. THE Admin_Console SHALL provide flagged messages view for content moderation displaying message content, reporter identity, flag reason, and timestamp
9. WHEN an admin performs an override action that bypasses a financial gate (escrow release, payment approval, fee waiver) or a professional gate (verification status change, role elevation, compliance sign-off bypass), THE Admin_Console SHALL require a documented reason of at least 10 characters and write a separation-of-duty override audit record before the action takes effect
10. THE Admin_Console SHALL enforce that admin override audit records include the overriding admin UID, target action, target project ID, reason text, and ISO 8601 timestamp, and that these records cannot be modified or deleted after creation
11. WHEN a second platform_admin reviews override audit records, THE Admin_Console SHALL display the override record with a flag indicating whether the override was performed by a different admin than the reviewer, so that separation-of-duty violations are detectable
12. THE Admin_Console SHALL provide an immutable audit viewer showing all platform actions with filtering by actor, action type, project, and date range, returning a maximum of 500 records per query, where immutable means no record can be edited, deleted, or overwritten after initial creation

### Requirement 10: Configuration Versioning and Governance

**User Story:** As a platform administrator, I want all configuration changes to be versioned and audited, so that the platform maintains a history of rule and rate changes.

#### Acceptance Criteria

1. WHEN a feature flag is created or modified, THE Admin_Console SHALL create a new version record containing the previous value, new value, modifier UID, and UTC timestamp
2. WHEN a tariff rule is created or modified, THE Admin_Console SHALL create a new version record containing the previous value, new value, effective date, modifier UID, and UTC timestamp
3. IF an administrator attempts to modify a tariff rule whose effective date is earlier than the current UTC date, THEN THE Admin_Console SHALL reject the modification and display an error message indicating that past-effective rules cannot be changed
4. WHEN a payment rate setting is modified, THE Admin_Console SHALL require a reason field containing at least 10 characters before accepting the change and SHALL create a new version record containing the previous value, new value, documented reason, modifier UID, and UTC timestamp
5. WHEN an AI prompt or review configuration is modified, THE Admin_Console SHALL require a reason field containing at least 10 characters before accepting the change and SHALL create a new version record preserving the full previous prompt text, the new prompt text, documented reason, modifier UID, and UTC timestamp
6. THE Admin_Console SHALL prevent deletion of version history records for all governed configurations (feature flags, tariff rules, payment rate settings, and AI prompt configurations), ensuring an append-only change trail
7. WHEN an administrator requests the version history for a governed configuration, THE Admin_Console SHALL display all version records for that configuration in reverse-chronological order, showing the modifier UID, UTC timestamp, previous value, new value, and reason where applicable

### Requirement 11: Platform Financial Integrity Constraints

**User Story:** As a platform owner, I want the system to clearly communicate that Architex does not hold funds, so that the platform's legal and financial position is accurately represented.

#### Acceptance Criteria

1. THE Finance_Engine SHALL reference only registered third-party financial service providers (providers where `registered` is true and `liveConfigured` is true) for all fund movements and SHALL NOT record any payment, release, or payout action without a valid `providerId` linking to a registered provider
2. THE Finance_Engine SHALL include the provider `providerId`, provider `name`, and provider-issued transaction reference in every payment record, release request record, and payout record
3. WHEN a payment UI is rendered, THE Finance_Engine SHALL display a persistent disclaimer within the payment panel stating that funds are held and processed by the named registered provider (including the provider name) and that Architex does not hold, store, or custody any funds
4. THE Finance_Engine SHALL validate that every release, refund, and payout action includes both a provider confirmation (webhook or API response with a provider-issued reference) and a human authorization (signed payment certificate or admin approval from a user with escrow:release permission) before recording the action as complete
5. IF a provider confirmation is not received within 120 seconds of submission, THEN THE Finance_Engine SHALL mark the action as `provider_configuration_required`, write a timeout audit record including the provider reference and elapsed time, and notify the release approver that manual provider verification is required
6. IF any payment record is missing a `providerId` or provider transaction reference at write time, THEN THE Finance_Engine SHALL reject the write operation, return a structured error indicating the missing provider fields, and write a failed-validation audit record
