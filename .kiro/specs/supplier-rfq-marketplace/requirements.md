# Requirements Document

## Introduction

The Supplier RFQ Marketplace is a Module 6 (Tender/Procurement/Supplier) feature within Architex OS that enables project teams to publish Requests for Quotation (RFQs) to qualified suppliers, allows suppliers to receive and respond with structured quotes, and provides comparison and award tools for quantity surveyors, architects, and contractors. The marketplace integrates with SpecForge (specification spine), the existing TenderPackage/Bid model, the B-BBEE procurement audit service, and the award recommendation workflow with human-approval gates.

## Glossary

- **RFQ_Marketplace**: The platform module that facilitates the creation, distribution, response, comparison, and award of Requests for Quotation between project teams and suppliers
- **RFQ**: A Request for Quotation document issued by a project team member specifying materials, quantities, delivery requirements, and evaluation criteria for supplier pricing
- **Quote_Response**: A structured pricing submission from a supplier in response to an RFQ, containing line-item pricing, lead times, delivery terms, and supporting documentation
- **Package_Scope**: A defined set of materials or work items derived from SpecForge specifications and Bill of Quantities that forms the basis of an RFQ
- **Supplier_Profile**: A registered supplier's catalogue of capabilities, certifications, trade categories, delivery regions, and verification status within the platform
- **Comparison_Engine**: The evaluation subsystem that normalises, scores, and ranks Quote_Responses against defined criteria (price, lead time, B-BBEE level, past performance)
- **Award_Gate**: The human-approval workflow requiring client and professional sign-off before a recommended supplier is formally appointed
- **Invitation_List**: A curated set of suppliers invited to respond to a specific RFQ, selected by trade category, region, verification status, and project requirements
- **Quote_Deadline**: The date and time after which no new Quote_Responses are accepted for a given RFQ
- **SpecForge_Link**: A reference connecting an RFQ line item to a SpecForge specification, selection, or product record

## Requirements

### Requirement 1: RFQ Creation and Configuration

**User Story:** As a quantity surveyor or architect, I want to create and configure an RFQ from a Package_Scope, so that I can solicit structured quotes from suppliers for project materials.

#### Acceptance Criteria

1. WHEN a project team member initiates RFQ creation, THE RFQ_Marketplace SHALL present a form pre-populated with line items from the selected Package_Scope
2. WHEN the user submits an RFQ with a title (maximum 150 characters), description (maximum 2000 characters), at least one line item with quantity greater than zero, a unit of measure, a delivery address, a Quote_Deadline set at least 24 hours in the future, and evaluation criteria with weights summing to 100%, THE RFQ_Marketplace SHALL create an RFQ record with status "draft" containing all submitted fields
3. WHEN the RFQ record is created, THE RFQ_Marketplace SHALL link each RFQ line item to the corresponding SpecForge specification or product record via SpecForge_Link
4. WHEN the user sets evaluation criteria, THE RFQ_Marketplace SHALL allow weighting of price, lead time, B-BBEE level, warranty terms, and past performance with integer percentage weights where each weight is between 0% and 100% and all weights sum to exactly 100%
5. IF the user submits an RFQ without a Quote_Deadline, THEN THE RFQ_Marketplace SHALL reject the submission and display a validation error indicating the deadline is required
6. IF the user submits an RFQ with fewer than one line item, THEN THE RFQ_Marketplace SHALL reject the submission and display a validation error indicating at least one line item is required
7. IF the selected Package_Scope contains no line items, THEN THE RFQ_Marketplace SHALL display an informational message indicating the Package_Scope is empty and disable form submission
8. IF a line item's SpecForge_Link references a specification or product record that does not exist, THEN THE RFQ_Marketplace SHALL display a validation warning on that line item indicating the linked record is unavailable
9. IF the user submits an RFQ with a Quote_Deadline less than 24 hours from the current time, THEN THE RFQ_Marketplace SHALL reject the submission and display a validation error indicating the deadline must be at least 24 hours in the future

### Requirement 2: Supplier Invitation and Discovery

**User Story:** As a contractor or quantity surveyor, I want to invite qualified suppliers to respond to my RFQ, so that I receive competitive quotes from verified vendors in the correct trade categories.

#### Acceptance Criteria

1. WHEN a user publishes an RFQ, THE RFQ_Marketplace SHALL display a supplier discovery panel filtered by trade category, delivery region, verification status, and B-BBEE level, showing a maximum of 100 suppliers per page of results
2. THE RFQ_Marketplace SHALL allow the user to add suppliers to the Invitation_List manually or via bulk selection from filtered results, up to a maximum of 50 suppliers per Invitation_List
3. WHEN the RFQ status transitions from "draft" to "published", THE RFQ_Marketplace SHALL send a notification to each supplier on the Invitation_List containing the RFQ title, deadline, and a link to respond
4. WHILE an RFQ has status "published", THE RFQ_Marketplace SHALL allow the issuer to add additional suppliers to the Invitation_List, and SHALL send a notification to each newly added supplier within 60 seconds of addition containing the RFQ title, deadline, and a link to respond
5. IF a supplier on the Invitation_List has verification status "expired" or "rejected", THEN THE RFQ_Marketplace SHALL display a warning badge next to the supplier name indicating the verification concern
6. IF the Invitation_List contains fewer than 1 supplier when the user attempts to transition the RFQ from "draft" to "published", THEN THE RFQ_Marketplace SHALL prevent the transition and display an error message indicating that at least 1 supplier must be invited
7. IF the supplier discovery panel returns no suppliers matching the applied filters, THEN THE RFQ_Marketplace SHALL display a message indicating no matching suppliers were found and suggest broadening filter criteria

### Requirement 3: Supplier Quote Submission

**User Story:** As a supplier, I want to receive RFQ invitations and submit structured quotes with line-item pricing, so that I can compete for project material supply contracts.

#### Acceptance Criteria

1. WHEN a supplier receives an RFQ invitation, THE RFQ_Marketplace SHALL display the RFQ details including all line items, quantities, units, delivery requirements, and evaluation criteria on the supplier dashboard
2. WHEN a supplier submits a Quote_Response, THE RFQ_Marketplace SHALL validate that unit prices are provided for all line items with values between 0.01 and 999,999,999.99, a total price is calculated as the sum of line-item extended prices, lead time is specified as a whole number between 1 and 730 calendar days, and delivery terms are stated with a minimum length of 10 characters
3. IF Quote_Response validation fails, THEN THE RFQ_Marketplace SHALL reject the submission, retain all entered data in the form, and display an error message indicating each field that failed validation
4. THE RFQ_Marketplace SHALL allow the supplier to attach up to 10 supporting documents (product data sheets, certifications, warranty terms) per Quote_Response, each no larger than 25 MB, in PDF, DOCX, XLSX, JPG, or PNG format
5. WHILE the current time is before the Quote_Deadline, THE RFQ_Marketplace SHALL accept Quote_Response submissions and revisions from invited suppliers
6. WHEN the current time passes the Quote_Deadline, THE RFQ_Marketplace SHALL reject any new Quote_Response submissions and display a message indicating the deadline has passed
7. WHEN a supplier submits a Quote_Response, THE RFQ_Marketplace SHALL record the submission timestamp and assign status "submitted" to the Quote_Response
8. IF a supplier submits a revised Quote_Response before the Quote_Deadline, THEN THE RFQ_Marketplace SHALL supersede the previous submission, retain the full revision history, and increment the revision number
9. IF a non-invited supplier attempts to access or submit a Quote_Response for an RFQ, THEN THE RFQ_Marketplace SHALL reject the action and display a message indicating the supplier is not authorized for that RFQ

### Requirement 4: Quote Comparison and Scoring

**User Story:** As a quantity surveyor, I want to compare received quotes side-by-side with weighted scoring, so that I can identify the best-value supplier objectively.

#### Acceptance Criteria

1. WHEN the Quote_Deadline passes and at least two Quote_Responses have been received, THE Comparison_Engine SHALL generate a normalised score (linear min-max, range 0.00–100.00) for each Quote_Response within 30 seconds, based on the evaluation criteria weights defined in the RFQ
2. THE Comparison_Engine SHALL rank Quote_Responses by total weighted score in descending order, breaking ties by earliest submission timestamp, and present the results in a comparison table showing price, lead time, B-BBEE level, warranty duration, and total score per supplier
3. IF the lowest-price Quote_Response and the highest-score Quote_Response differ, THEN THE Comparison_Engine SHALL flag both entries and display the price difference in Rand and the score difference in points
4. WHEN the user requests a detailed comparison, THE Comparison_Engine SHALL display a line-item price breakdown across up to 10 Quote_Responses for each RFQ line item
5. IF fewer than two Quote_Responses are received by the Quote_Deadline, THEN THE RFQ_Marketplace SHALL notify the issuer within 5 minutes and offer the option to extend the deadline or proceed with a single quote

### Requirement 5: B-BBEE Procurement Compliance

**User Story:** As a quantity surveyor on a public-sector project, I want B-BBEE scoring integrated into the comparison, so that procurement decisions meet regulatory compliance requirements.

#### Acceptance Criteria

1. WHEN the project is flagged as public sector or the estimated RFQ value exceeds R1,000,000, THE Comparison_Engine SHALL include B-BBEE level as a mandatory scoring criterion with a minimum weight of 10%, scoring suppliers on a scale where Level 1 receives maximum points and Level 8 receives minimum points proportionally across the configured weight
2. THE Comparison_Engine SHALL source each supplier B-BBEE level from the Supplier_Profile and display a visual warning indicator on suppliers whose B-BBEE certificate is expired (past its validity end date) or missing (no certificate on file), distinguishing between the two states
3. IF a recommended supplier has an expired or missing B-BBEE certificate, THEN THE RFQ_Marketplace SHALL block award progression and display a message indicating the certificate must be uploaded or renewed before award can proceed
4. WHEN a project local-spend target percentage is defined, THE RFQ_Marketplace SHALL calculate and display each supplier's local content percentage based on supplier delivery origin and display a visual warning indicator on suppliers whose local content percentage falls below the project local-spend target
5. IF a project is flagged as public sector and no B-BBEE certificate data is available for any supplier in the comparison, THEN THE Comparison_Engine SHALL display a notification indicating that B-BBEE scoring cannot be completed and prevent the comparison from being finalised until at least one supplier has a valid certificate on file

### Requirement 6: Award Recommendation and Approval

**User Story:** As a project team member, I want to recommend a supplier for award and route the decision through the approval gate, so that procurement decisions have proper governance.

#### Acceptance Criteria

1. WHEN a user selects a Quote_Response for award recommendation, THE RFQ_Marketplace SHALL create an award recommendation record containing the recommended supplier, quoted price, justification text of at least 50 characters, risk notes, and the identifiers of all Quote_Responses that were compared in the evaluation
2. THE Award_Gate SHALL require client approval followed sequentially by professional approval before the award is confirmed, where professional approval is not permitted until client approval is recorded, and no automatic appointment is permitted at any stage
3. WHEN the user creates an award recommendation, THE RFQ_Marketplace SHALL execute a conflict-of-interest check that compares the recommended supplier's ownership, directorship, and registered business affiliations against the project team member list and flag any matching affiliations as conflicts
4. IF conflict-of-interest flags are present on an award recommendation, THEN THE Award_Gate SHALL block client approval until each conflict is either removed by changing the recommendation or acknowledged with a written justification of at least 100 characters per conflict
5. WHEN both client and professional approvals are recorded, THE RFQ_Marketplace SHALL transition the RFQ status to "awarded" and generate a Purchase Order draft linked to the winning Quote_Response
6. THE RFQ_Marketplace SHALL record the complete award decision in the project audit trail including all compared quotes, scores, justification, approver identities, approval timestamps, and conflict-of-interest check results
7. IF the client approver or professional approver rejects the award recommendation, THEN THE Award_Gate SHALL transition the recommendation status to "rejected", record the rejection reason, and notify the recommendation author that a revised recommendation is required
8. IF the recommended supplier's Quote_Response has been superseded or the supplier's verification status has changed to "expired" since the recommendation was created, THEN THE RFQ_Marketplace SHALL block approval progression and display a message indicating the recommendation must be reviewed against current supplier data

### Requirement 7: Supplier Marketplace Profile

**User Story:** As a supplier, I want to maintain my marketplace profile with trade categories, delivery regions, and certifications, so that project teams can find and invite me to relevant RFQs.

#### Acceptance Criteria

1. THE RFQ_Marketplace SHALL allow suppliers to register between 1 and 10 trade categories (e.g., structural steel, electrical, plumbing, concrete, roofing) and between 1 and 9 delivery regions (province-level within South Africa)
2. THE RFQ_Marketplace SHALL display the supplier verification badge status (verified, pending, expired) sourced from the platform verification service on all supplier profile cards within marketplace search results and supplier detail views
3. IF a supplier submits a profile update with zero trade categories or zero delivery regions selected, THEN THE RFQ_Marketplace SHALL reject the update, retain the previously saved profile data, and display an error message indicating which required field is missing
4. THE RFQ_Marketplace SHALL display supplier past-performance metrics (quote acceptance rate, on-time delivery percentage, average rating) calculated from platform data within the trailing 12-month period, refreshed within 24 hours of any new delivery completion
5. IF a supplier has no completed deliveries on the platform, THEN THE RFQ_Marketplace SHALL display a "New Supplier" badge instead of performance metrics
6. WHEN a project team searches the marketplace, THE RFQ_Marketplace SHALL allow filtering suppliers by trade category, delivery region, and verification badge status, and return matching results within 3 seconds

### Requirement 8: SpecForge and Project Passport Integration

**User Story:** As a project team member, I want RFQ outcomes to flow back into SpecForge and the Project Passport, so that procurement decisions are recorded in the central project spine.

#### Acceptance Criteria

1. WHEN an RFQ is awarded, THE RFQ_Marketplace SHALL update the linked SpecForge SpecProcurementEntry records with the selected supplier name, confirmed unit rate and total cost from the awarded QuoteLine, and lead time in days
2. IF a linked SpecForge SpecProcurementEntry no longer exists at the time of award, THEN THE RFQ_Marketplace SHALL log a warning to the project audit trail indicating the orphaned reference and skip the update for that item without blocking the award
3. WHEN an RFQ transitions to any stage (drafting, published, evaluation, awarded, cancelled), THE RFQ_Marketplace SHALL write a ProjectRecord entry into the Project Passport containing the RFQ number, title, current stage, awarded supplier (if applicable), total quoted value (if applicable), and transition timestamp
4. WHEN an RFQ has a deadline within 48 hours and quotes remain unreviewed, or an approval is pending for more than 24 hours, THE RFQ_Marketplace SHALL emit a WorkflowEvent to the Action Centre inbox for team members holding the architect, quantity_surveyor, or contractor role on that project
5. WHEN an RFQ is created from a Package_Scope, THE RFQ_Marketplace SHALL maintain a bidirectional link such that the SpecForge workspace displays the current ProcurementStatus (rfq_sent, quoted, ordered, dispatched, delivered, installed, closed) for each linked specification item, and the RFQ detail view displays the originating Package_Scope title and ID

### Requirement 9: Notifications and Deadline Management

**User Story:** As a project team member or supplier, I want timely notifications about RFQ lifecycle events, so that I can act within required timeframes.

#### Acceptance Criteria

1. WHEN an RFQ is published, THE RFQ_Marketplace SHALL notify all suppliers on the Invitation_List within 60 seconds of publication, including the RFQ title, reference number, and Quote_Deadline in the notification content
2. WHEN the Quote_Deadline is 24 hours away, THE RFQ_Marketplace SHALL send a reminder notification to all invited suppliers who have not yet submitted a Quote_Response, including the RFQ reference number and remaining time until deadline
3. WHEN a supplier submits or revises a Quote_Response, THE RFQ_Marketplace SHALL notify the RFQ issuer within 60 seconds, identifying the supplier name and the RFQ reference number
4. WHEN an award recommendation is created, THE RFQ_Marketplace SHALL notify the client and designated professional approvers within 60 seconds that their approval is required, including the RFQ reference number and a link to the approval action
5. IF the Quote_Deadline passes with zero Quote_Responses received, THEN THE RFQ_Marketplace SHALL notify the issuer within 5 minutes and present actionable options to extend the Quote_Deadline or expand the Invitation_List
6. IF notification delivery to a recipient fails after 3 retry attempts within 5 minutes, THEN THE RFQ_Marketplace SHALL log the delivery failure and display an undelivered notification indicator to the RFQ issuer within the RFQ management view
7. THE RFQ_Marketplace SHALL include the RFQ status and a direct navigation path to the relevant RFQ detail view in every notification sent to a recipient

### Requirement 10: Role-Based Access Control

**User Story:** As a platform administrator, I want procurement actions restricted to authorised roles, so that only qualified team members manage RFQ workflows.

#### Acceptance Criteria

1. THE RFQ_Marketplace SHALL restrict RFQ creation to users who hold at least one of the roles architect, quantity_surveyor, contractor, or admin as a member of the project
2. THE RFQ_Marketplace SHALL restrict Quote_Response submission to users who hold role supplier and are on the Invitation_List for the specific RFQ
3. THE RFQ_Marketplace SHALL restrict award recommendation creation to users who hold at least one of the roles quantity_surveyor, architect, or contractor as a member of the project
4. THE RFQ_Marketplace SHALL restrict award approval actions to users designated as client approver or professional approver for the project
5. WHILE a user has role supplier, THE RFQ_Marketplace SHALL display only RFQs where the user is on the Invitation_List and hide RFQs for which the user is not invited
6. IF a user attempts a procurement action for which they lack the required role or designation, THEN THE RFQ_Marketplace SHALL prevent the action from executing, display an error message indicating insufficient permissions, and preserve any data the user had already entered without modification
