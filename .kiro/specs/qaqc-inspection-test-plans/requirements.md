# Requirements Document

## Introduction

QA/QC & Inspection Test Plans (ITPs) is a new module within the Site Execution workflow (Module 7) of the Architex Built Environment OS. It provides structured quality assurance during construction — defining what inspections and material tests are required at each construction stage, enforcing mandatory hold points where work must stop until sign-off, tracking witness points, managing SANS 3001 material testing schedules with lab result integration, and linking failures to the existing Non-Conformance Report (NCR) system. This is distinct from post-completion snagging; ITPs govern pre-completion quality assurance DURING active construction.

## Glossary

- **ITP_Service**: The service (`src/services/itpService.ts`) responsible for creating, managing, and evaluating Inspection Test Plans and their associated inspection items.
- **Inspection_Item**: A single inspection or test entry within an ITP, defining what must be checked, the acceptance criteria, the inspection type (hold point, witness point, or surveillance), and the responsible inspector.
- **Hold_Point**: A mandatory inspection checkpoint where construction work MUST stop and cannot proceed until the designated inspector signs off. Failure to obtain sign-off constitutes a non-conformance.
- **Witness_Point**: An inspection point where the designated inspector is notified in advance and should attend, but construction work may proceed if the inspector does not attend within the notification period.
- **Surveillance_Point**: A routine quality check performed by site personnel without mandatory stop or notification requirements, recorded for audit trail purposes.
- **Material_Test**: A scheduled laboratory test (per SANS 3001) for construction materials — concrete cube tests, soil compaction tests, steel tensile tests, aggregate grading — performed by an accredited testing laboratory.
- **Lab_Result**: The recorded outcome from an accredited testing laboratory for a Material_Test, including pass/fail determination against the applicable SANS specification threshold.
- **Testing_Schedule**: A structured plan defining which Material_Tests are required, at what frequency, at which construction stages, and the applicable SANS 3001 test method reference.
- **NCR_Manager**: The existing Non-Conformance Report system (`src/services/ncrService.ts` and `src/components/NCRManager.tsx`) that manages non-conformance lifecycle from creation through corrective action to close-out.
- **Project_Passport**: The central project state layer (`src/services/projectPassportService.ts`) that aggregates project health, compliance status, and quality metrics.
- **Action_Centre**: The platform inbox system that surfaces pending actions, approvals, and notifications to users based on their role.
- **Compliance_Score**: A calculated percentage representing the ratio of completed and passed inspections to total required inspections within an ITP.
- **Sign_Off_Record**: An immutable record capturing the inspector's identity, timestamp, outcome (pass/fail/conditional), and any conditions or observations attached to an inspection sign-off.
- **Construction_Stage**: A defined phase of construction work (e.g., foundations, superstructure, roof, finishes) to which ITP items are linked.

## Requirements

### Requirement 1: Create and Manage Inspection Test Plans

**User Story:** As an engineer, I want to create structured Inspection Test Plans for a project, so that all required inspections and tests are documented and assigned before construction begins.

#### Acceptance Criteria

1. WHEN an engineer creates a new ITP, THE ITP_Service SHALL persist an ITP record containing: project ID, title (maximum 200 characters), description (maximum 2000 characters), construction stage, revision number (starting at 1), status (draft), created-by user ID, and creation timestamp.
2. WHEN an ITP is created, THE ITP_Service SHALL associate it with exactly one project and one construction stage.
3. WHILE an ITP has status `draft`, THE ITP_Service SHALL allow the creating engineer or site manager to add, edit, reorder, and remove Inspection_Items, where each Inspection_Item contains: a sequence number, item description, inspection type (hold point, witness point, or surveillance), responsible discipline, acceptance criteria text, and applicable reference standard.
4. WHILE an ITP has status `draft`, THE ITP_Service SHALL enforce a maximum of 200 Inspection_Items per ITP.
5. WHEN an ITP transitions from `draft` to `approved`, THE ITP_Service SHALL require a Sign_Off_Record from a user holding the `engineer` or `architect` role on the project, where the Sign_Off_Record contains the approver's user ID, role, timestamp, and the ITP revision number being approved.
6. WHILE an ITP has status `approved`, THE ITP_Service SHALL prevent modification of Inspection_Items unless a new revision is created.
7. WHEN a user holding the `engineer` or `site_manager` role on the project requests a new revision of an approved ITP, THE ITP_Service SHALL create a new ITP revision with an incremented revision number, copy all existing Inspection_Items to the new revision, set the new revision to `draft`, and mark the previous revision as `superseded`.
8. WHEN all Inspection_Items within an approved ITP have been scheduled for execution, THE ITP_Service SHALL transition the ITP status from `approved` to `in_progress`.
9. THE ITP_Service SHALL enforce that only one non-superseded revision of an ITP exists per construction stage per project at any time.
10. IF an ITP is deleted while in `draft` status, THEN THE ITP_Service SHALL soft-delete the record and retain it for audit trail purposes.
11. IF a user attempts to delete an ITP that has status `approved` or `in_progress`, THEN THE ITP_Service SHALL reject the deletion and return an error indicating that approved or active ITPs cannot be deleted.

### Requirement 2: Define Inspection Items with Hold Points and Witness Points

**User Story:** As an engineer, I want to define individual inspection checkpoints within an ITP specifying whether each is a hold point, witness point, or surveillance point, so that critical quality gates are clearly identified and enforceable.

#### Acceptance Criteria

1. WHEN an Inspection_Item is added to an ITP, THE ITP_Service SHALL require: title (1–200 characters), description (1–2000 characters), inspection type (`hold_point`, `witness_point`, or `surveillance`), acceptance criteria text (1–2000 characters), responsible inspector role (one of `engineer`, `architect`, `site_manager`), applicable specification reference (1–500 characters), and sequence order within the ITP.
2. WHEN an Inspection_Item has type `hold_point`, THE ITP_Service SHALL mark it as work-stopping, meaning the next sequenced construction activity cannot commence until this item receives a passing or conditional Sign_Off_Record.
3. WHEN an Inspection_Item has type `witness_point`, THE ITP_Service SHALL mark it as notification-required, meaning the designated inspector must be notified at least 24 hours before the Inspection_Item's scheduled inspection date as recorded on the item.
4. WHEN an Inspection_Item has type `surveillance`, THE ITP_Service SHALL mark it as record-only, meaning it requires documentation of the check but does not block work or require advance notification.
5. THE ITP_Service SHALL validate that each Inspection_Item's specification reference matches one of the following: a SANS standard clause in the format "SANS NNNNN clause X.Y", an NHBRC requirement identifier, or a project-specific specification ID that exists in the project's SpecForge specification register.
6. THE ITP_Service SHALL allow an Inspection_Item to optionally reference between 1 and 20 Material_Tests from the Testing_Schedule, linking lab testing requirements to the inspection checkpoint.
7. WHEN an Inspection_Item is reordered within an ITP, THE ITP_Service SHALL update all sequence numbers to maintain a contiguous integer sequence starting at 1.
8. IF any required field is missing or fails its length or format validation when adding an Inspection_Item, THEN THE ITP_Service SHALL reject the request, return a validation error indicating which fields failed and why, and leave the ITP unchanged.

### Requirement 3: Execute Hold Point Inspections

**User Story:** As a contractor, I want to request a hold point inspection when my work reaches a mandatory checkpoint, so that the engineer can inspect and sign off before I proceed to the next stage.

#### Acceptance Criteria

1. WHEN a contractor requests a hold point inspection, THE ITP_Service SHALL create an inspection request record containing: the Inspection_Item ID, requesting user ID, requested inspection date, and request timestamp.
2. IF a contractor submits a hold point inspection request with a requested inspection date that is less than 24 hours in the future or in the past, THEN THE ITP_Service SHALL reject the request and return a validation error indicating the date must be at least 24 hours from the current time.
3. WHEN a hold point inspection is requested, THE Action_Centre SHALL deliver a notification within 60 seconds to all users holding the responsible inspector role on the project, containing the ITP title, inspection item title, requested date, and a link to the inspection sign-off form.
4. WHILE a hold point inspection request is pending (no Sign_Off_Record exists), THE ITP_Service SHALL block the status of subsequent Inspection_Items in the same ITP from transitioning to `in_progress`.
5. WHEN an inspector signs off a hold point with outcome `pass`, THE ITP_Service SHALL record the Sign_Off_Record (containing the inspector's user ID, outcome, timestamp, and Inspection_Item ID), update the Inspection_Item status to `passed`, and unblock subsequent items in sequence.
6. WHEN an inspector signs off a hold point with outcome `fail`, THE ITP_Service SHALL record the Sign_Off_Record, update the Inspection_Item status to `failed`, and trigger automatic creation of a Non-Conformance Report via the NCR_Manager with severity set to the severity level explicitly assigned to the Inspection_Item in the ITP, defaulting to `high` if no severity level is assigned.
7. WHEN an inspector signs off a hold point with outcome `conditional_pass`, THE ITP_Service SHALL record the Sign_Off_Record with conditions text (maximum 2000 characters), update the Inspection_Item status to `conditional`, unblock subsequent items in sequence, and create a follow-up action in the Action_Centre for the contractor to address conditions within the timeframe specified by the inspector (minimum 1 business day, maximum 30 business days).
8. IF a conditional pass follow-up action remains unresolved after the specified timeframe expires, THEN THE ITP_Service SHALL update the Inspection_Item status from `conditional` to `failed`, block subsequent Inspection_Items from transitioning to `in_progress`, and deliver a notification via the Action_Centre to the inspector and the contractor indicating the conditions were not addressed within the allowed timeframe.
9. IF a contractor proceeds with work beyond a hold point that has not received a passing or conditional Sign_Off_Record, THEN THE ITP_Service SHALL flag this as a hold point breach and automatically generate a critical-severity Non-Conformance Report via the NCR_Manager.

### Requirement 4: Execute Witness Point Inspections

**User Story:** As a site manager, I want the system to notify inspectors of upcoming witness points and record whether they attended, so that the project maintains a complete inspection record regardless of inspector attendance.

#### Acceptance Criteria

1. WHEN a witness point inspection is 24 hours from its scheduled date, THE Action_Centre SHALL deliver a notification within 60 seconds to all users holding the responsible inspector role on the project, containing the ITP title, inspection item title, scheduled date and time, and location details.
2. WHEN the notification for a witness point is delivered, THE Action_Centre SHALL allow the inspector to respond with an acknowledgement indicating intent to attend, and SHALL record the response timestamp; if no acknowledgement is received by the scheduled inspection time, THE Action_Centre SHALL record the inspector response as `no_response`.
3. WHEN the scheduled time for a witness point arrives, THE ITP_Service SHALL allow the site manager or contractor to proceed with recording the inspection outcome (pass, fail, or conditional_pass) regardless of whether the inspector has signed off.
4. WHEN an inspector attends and signs off a witness point, THE ITP_Service SHALL record the Sign_Off_Record with the inspector's identity, the outcome (pass, fail, or conditional_pass), any observations text, and mark the item as `inspector_witnessed`.
5. WHEN a witness point proceeds without inspector attendance after the scheduled time, THE ITP_Service SHALL record a self-inspection entry containing the recording user's identity, outcome (pass, fail, or conditional_pass), observations text, and timestamp, and mark the item as `contractor_recorded`.
6. WHEN a witness point inspection result is `fail` (whether inspector-witnessed or contractor-recorded), THE ITP_Service SHALL trigger creation of a Non-Conformance Report via the NCR_Manager with severity `high` if the witness point references structural or safety-critical specifications, and `medium` for all other witness point failures.
7. THE ITP_Service SHALL retain a complete attendance record for each witness point showing: notification sent timestamp, inspector response (acknowledged/no_response), attendance (attended/not_attended), and final sign-off identity.

### Requirement 5: Manage Material Testing Schedules (SANS 3001)

**User Story:** As an engineer, I want to define material testing schedules specifying which SANS 3001 tests are required at what frequency, so that laboratory testing is planned and tracked systematically throughout construction.

#### Acceptance Criteria

1. WHEN an engineer creates a Testing_Schedule for a project, THE ITP_Service SHALL require: project ID, material type (concrete, soil, steel, aggregate, bituminous), applicable SANS 3001 test method reference, required test frequency expressed as a ratio of tests to quantity placed (e.g., 1 test per 50m³), unit of measure for the quantity, minimum number of samples per test (between 1 and 10), acceptance threshold as a numeric value with unit and comparison operator (greater-than-or-equal / less-than-or-equal), and the construction stage during which testing applies.
2. THE ITP_Service SHALL support the following SANS 3001 material test categories: concrete compressive strength (cube tests at 7-day and 28-day), soil compaction (Proctor density ratio), steel tensile strength, aggregate grading, and bituminous binder content.
3. WHEN a Material_Test is scheduled, THE ITP_Service SHALL create a test record containing: testing schedule reference, sample identification number, date sampled, date test due (calculated as the date sampled plus the expected turnaround period defined in the Testing_Schedule, defaulting to 7 calendar days for 7-day cube tests and 28 calendar days for 28-day cube tests, or as specified by the engineer for other test types up to a maximum of 90 calendar days), testing laboratory name, and status (`scheduled`, `sampled`, `submitted_to_lab`, `results_received`, `passed`, `failed`).
4. WHEN a Material_Test status remains other than `results_received`, `passed`, or `failed` at 08:00 on the calendar day after its test-due date, THE Action_Centre SHALL deliver an overdue notification to the engineer and site manager identifying the test method, sample ID, and number of days overdue.
5. IF a user attempts to record a Lab_Result for a Material_Test referencing a testing laboratory that is not marked as SANAS-accredited for the applicable test method in the project's approved laboratory register, THEN THE ITP_Service SHALL reject the result recording and return an error indicating the laboratory lacks valid accreditation for that test method.
6. WHEN the cumulative quantity placed for a material type (as recorded via site daily logs or manual quantity entries) divided by the required test frequency ratio yields a number of required tests that exceeds the number of completed tests for that material type by 1 or more, THE ITP_Service SHALL flag a testing compliance gap and notify the site manager via the Action_Centre within 24 hours of the quantity record that triggered the gap.
7. IF an engineer modifies a Testing_Schedule after one or more Material_Tests have already been created against it, THEN THE ITP_Service SHALL apply the updated frequency and thresholds only to Material_Tests created after the modification date and SHALL retain the original parameters for previously created tests.

### Requirement 6: Record and Evaluate Lab Results

**User Story:** As an engineer, I want to record laboratory test results against defined acceptance thresholds, so that material compliance is objectively determined and failures trigger appropriate corrective actions.

#### Acceptance Criteria

1. WHEN a Lab_Result is recorded for a Material_Test, THE ITP_Service SHALL capture: test date, result value (numeric, range 0.00 to 999,999,999.99), result unit (matching the unit defined in the Testing_Schedule for the applicable test method), testing laboratory name (maximum 200 characters), laboratory report reference number (maximum 50 characters), pass/fail determination, and the user who recorded the result.
2. WHEN a Lab_Result value satisfies the acceptance threshold defined in the Testing_Schedule (meets or exceeds a minimum threshold, or meets or falls below a maximum threshold, as specified by the threshold direction on the Testing_Schedule entry), THE ITP_Service SHALL mark the Material_Test status as `passed`.
3. WHEN a Lab_Result value does not satisfy the acceptance threshold defined in the Testing_Schedule (falls below a minimum threshold, or exceeds a maximum threshold, as specified by the threshold direction on the Testing_Schedule entry), THE ITP_Service SHALL mark the Material_Test status as `failed` and automatically trigger creation of a Non-Conformance Report via the NCR_Manager with the failing test details (material type, test method reference, result value, acceptance threshold, and result unit) included in the NCR description.
4. WHEN a concrete cube test at 7 days fails, THE ITP_Service SHALL identify the 28-day Material_Test for the same sample identification number, flag it as high-priority, and notify the engineer via the Action_Centre that early strength results are below specification, including the 7-day result value and the acceptance threshold.
5. WHEN a Lab_Result is recorded or a Material_Test status changes to `passed` or `failed`, THE ITP_Service SHALL recalculate the running pass rate for that material type on the project (total passed tests divided by total completed tests, expressed as a percentage to one decimal place) and expose the updated metric to the Project_Passport as part of the quality Compliance_Score.
6. IF a Lab_Result is recorded with a laboratory report reference that duplicates an existing record for the same Material_Test, THEN THE ITP_Service SHALL reject the duplicate entry and return an error indicating the result has already been recorded.
7. THE ITP_Service SHALL support attaching a digital copy of the laboratory certificate (PDF, JPEG, or PNG, maximum file size 25 MB) to the Lab_Result record via the existing file upload mechanism, limited to one attachment per Lab_Result.
8. IF a Lab_Result is recorded with a result unit that does not match the unit defined in the Testing_Schedule for the applicable test method, THEN THE ITP_Service SHALL reject the entry and return an error indicating the unit mismatch, specifying the expected unit.

### Requirement 7: Non-Conformance Linkage

**User Story:** As a site manager, I want failed inspections and test results to automatically create linked NCRs, so that quality failures are tracked through to resolution without manual re-entry.

#### Acceptance Criteria

1. WHEN the ITP_Service creates a Non-Conformance Report due to an inspection failure or test failure, THE ITP_Service SHALL include a reference to the originating Inspection_Item ID or Material_Test ID in the NCR record metadata, enabling bidirectional navigation between the NCR and its source.
2. WHEN the ITP_Service creates an NCR from a hold point failure, THE ITP_Service SHALL set NCR severity to `critical` if the Inspection_Item's specification_category field contains `structural`, `fire_safety`, or `geotechnical`, and `high` for all other hold point failures.
3. WHEN the ITP_Service creates an NCR from a material test failure, THE ITP_Service SHALL set NCR severity based on the material type: `critical` for concrete and steel failures, `high` for soil compaction failures, `medium` for aggregate and bituminous failures, and `medium` as a default for any material type not matching the listed categories.
4. WHEN a linked NCR transitions to status `verified_closed` in the NCR_Manager, THE ITP_Service SHALL update the originating Inspection_Item status to `ncr_resolved` or the Material_Test status to `ncr_resolved`, indicating the non-conformance has been formally closed.
5. WHILE a linked NCR remains open (status `open` or `corrective_action_submitted`), THE ITP_Service SHALL prevent the associated Inspection_Item from being marked as `passed` and SHALL display the NCR status alongside the inspection item in the ITP view.
6. THE ITP_Service SHALL expose a count of open NCRs linked to each ITP, enabling the Project_Passport to surface ITP-specific quality risk indicators.

### Requirement 8: Project Passport Integration

**User Story:** As a client, I want the Project Passport to reflect overall quality status from ITPs, so that I can see at a glance whether my project is meeting quality requirements.

#### Acceptance Criteria

1. WHEN the Project_Passport is assembled for a project, THE ITP_Service SHALL contribute a quality summary containing: total ITPs, ITPs by status (draft, approved, in_progress, completed), overall Compliance_Score, count of open hold point breaches, and count of pending material tests.
2. THE ITP_Service SHALL calculate the project Compliance_Score as: (number of passed inspections + number of passed material tests) divided by (total required inspections + total required material tests), expressed as a percentage rounded to one decimal place. IF the total required inspections plus total required material tests equals zero, THEN THE ITP_Service SHALL report the Compliance_Score as 100%.
3. WHEN any Inspection_Item status or material test result changes within a project, THE ITP_Service SHALL recalculate the project Compliance_Score. IF the recalculated Compliance_Score is below 80% and the previous Compliance_Score was at or above 80%, THEN THE ITP_Service SHALL emit a ProjectRiskSignal to the Project_Passport risk engine with category `delay`, severity `high`, and a detail string indicating the current Compliance_Score value.
4. WHEN all Inspection_Items in an ITP have status `passed` or `conditional_accepted` (where `conditional_accepted` means the Inspection_Item has a non-empty `conditions_closed_at` timestamp), THE ITP_Service SHALL transition the ITP status to `completed` and record the completion timestamp.
5. THE ITP_Service SHALL expose ITP data as ProjectRecord entries with record type `inspection_test_plan`, phase set to `construction_execution`, and status mapped from ITP status (draft → draft, approved → approved, in_progress → issued, completed → approved), enabling the lifecycle engine to include ITP status in construction-phase readiness evaluation.
6. IF the ITP_Service cannot retrieve inspection or material test data required to calculate the Compliance_Score (due to missing records or data unavailability), THEN THE ITP_Service SHALL omit the Compliance_Score field from the quality summary and include a flag indicating the score is unavailable.

### Requirement 9: Role-Based Access Control

**User Story:** As a platform architect, I want ITP access governed by project role, so that only authorised users can create, approve, or sign off inspections.

#### Acceptance Criteria

1. THE ITP_Service SHALL grant `itp:create` and `itp:approve` permissions to users holding the `engineer` or `architect` role on the project.
2. THE ITP_Service SHALL grant `itp:read`, `inspection:request`, and `test:record_result` permissions to users holding the `site_manager` role on the project; and `itp:read` and `inspection:request` permissions to users holding any of: `contractor`, `subcontractor`, `quantity_surveyor`.
3. THE ITP_Service SHALL grant `inspection:sign_off` permission exclusively to users holding the `engineer` or `architect` role on the project.
4. THE ITP_Service SHALL grant `test:record_result` permission to users holding the `engineer` or `site_manager` role on the project.
5. THE ITP_Service SHALL grant `itp:read` (read-only, with no write or action permissions) to users holding the `client` or `developer` role on the project.
6. IF a user without the required permission attempts any ITP action (`itp:create`, `itp:approve`, `inspection:sign_off`, `inspection:request`, or `test:record_result`), THEN THE ITP_Service SHALL reject the request, return a permission denied indication identifying the missing permission, and leave the ITP state unchanged.
7. THE ITP_Service SHALL validate permissions using the Permission_Service, verifying both that the user holds a qualifying platform role AND that the user has active membership on the target project, before granting access to any ITP operation.
8. IF a user attempts an ITP operation on a project where they have no active project membership, THEN THE ITP_Service SHALL reject the request with an indication that the user is not a member of the target project, regardless of platform role held.

### Requirement 10: Audit Trail and Compliance Documentation

**User Story:** As an engineer, I want a complete audit trail of all ITP activities, so that the project has defensible compliance documentation for regulatory review and dispute resolution.

#### Acceptance Criteria

1. WHEN any state change occurs on an ITP, Inspection_Item, or Material_Test, THE ITP_Service SHALL create an immutable audit record containing: entity type, entity ID, action performed, actor user ID, timestamp, previous state, new state, and any attached metadata (maximum 10 KB per metadata payload).
2. THE ITP_Service SHALL write all audit records to the project audit trail via the existing audit trail service pattern, and SHALL NOT permit modification or deletion of any audit record after creation.
3. WHEN an inspector signs off an inspection (any outcome), THE ITP_Service SHALL record the sign-off in the audit trail including the inspector's professional registration number (ECSA, SACAP, or NHBRC number from their user profile) if available; if no professional registration number is recorded on the user profile, THE ITP_Service SHALL record the sign-off with the registration field set to `not_available`.
4. WHEN a user with `itp:read` permission requests a compliance summary report for a given ITP, THE ITP_Service SHALL generate the report containing: all inspection items with outcomes, all sign-off records, all linked material test results, all linked NCRs and their resolution status, and overall pass/fail/pending counts.
5. THE ITP_Service SHALL retain all audit records and sign-off records indefinitely, with no automatic purging or deletion mechanism.
6. WHEN an ITP revision supersedes a previous revision, THE ITP_Service SHALL retain the complete audit trail of the superseded revision, link it bidirectionally to the new revision (queryable from either revision), and preserve historical reference continuity.

### Requirement 11: Action Centre Notifications

**User Story:** As a site manager, I want all ITP-related actions surfaced in my inbox, so that I never miss a pending inspection, overdue test, or hold point that needs attention.

#### Acceptance Criteria

1. WHEN a hold point inspection is requested, THE Action_Centre SHALL create an action item for each user holding the responsible inspector role on the project with priority `high`, category `inspection_required`, including the ITP title, Inspection_Item title, requested date, and a reference to the originating Inspection_Item ID for navigation.
2. WHEN a witness point notification is due (24 hours before scheduled date), THE Action_Centre SHALL create an action item for each user holding the responsible inspector role on the project with priority `medium`, category `witness_notification`, including the ITP title, Inspection_Item title, scheduled date and time, and location details.
3. WHEN a Material_Test is overdue (test-due date has passed without results being recorded), THE Action_Centre SHALL create a single action item for the engineer and site manager with priority `high` and category `test_overdue`, including the material type, test method reference, and date test was due. THE Action_Centre SHALL NOT create additional overdue action items for the same Material_Test while an unresolved action item for that test already exists.
4. WHEN a hold point breach is detected, THE Action_Centre SHALL create an action item for the engineer, site manager, and project lead consultant with priority `critical` and category `hold_point_breach`, including the ITP title, breached Inspection_Item title, and a reference to the linked NCR.
5. WHEN a Lab_Result records a failure, THE Action_Centre SHALL create an action item for the engineer with priority `high` and category `test_failed`, including the material type, test method, result value, and acceptance threshold.
6. WHEN the triggering condition for an action item is resolved (inspection signed off, test results recorded, or NCR closed), THE Action_Centre SHALL mark the corresponding action item as resolved and remove it from the active inbox view.
7. THE ITP_Service SHALL surface action items using the existing inbox event adapter pattern (`workflowEventsFromProjectState`), mapping ITP events to `WorkflowEvent` records with `sourceModule` set to the Site Execution module identifier and `assignedRoles` derived from the responsible inspector role and project team membership.

### Requirement 12: SpecForge Integration

**User Story:** As an architect, I want ITP inspection requirements linked to SpecForge specification items, so that quality verification is traceable back to the original design specification.

#### Acceptance Criteria

1. WHEN an Inspection_Item references a specification, THE ITP_Service SHALL store the SpecForge spec item ID on the Inspection_Item record and store the Inspection_Item ID on the corresponding SpecForge spec item's linked-inspections list, creating a bidirectional reference that is queryable from either entity.
2. WHEN a SpecForge spec item that has one or more linked Inspection_Items is substituted or has its title, acceptance criteria, specification reference, material type, or finish fields modified, THE ITP_Service SHALL transition each linked Inspection_Item to status `review_required` and create an Action_Centre notification for the responsible engineer within 5 seconds, containing the spec item code, the field that changed, and a link to the affected Inspection_Item.
3. THE ITP_Service SHALL expose to SpecForge, for each linked spec item, an aggregated inspection verification status of `passed` (all linked Inspection_Items passed), `failed` (any linked Inspection_Item failed), or `pending` (at least one linked Inspection_Item has no Sign_Off_Record and none have failed), queryable by spec item ID.
4. WHEN an ITP is created for a construction stage, THE ITP_Service SHALL query SpecForge for spec items whose material type or discipline matches the ITP's construction stage material scope, return a maximum of 20 matching spec items ordered by relevance (exact material type match first, then discipline match), and present them to the engineer as optional links during ITP creation.
5. IF a linked SpecForge spec item is deleted or its status transitions to `superseded`, THEN THE ITP_Service SHALL transition the linked Inspection_Items to status `review_required`, retain the original spec item reference for audit purposes, and notify the engineer via the Action_Centre that the specification reference is no longer current.
6. WHEN a link between an Inspection_Item and a SpecForge spec item is removed, THE ITP_Service SHALL remove the reference from both the Inspection_Item record and the SpecForge spec item's linked-inspections list, and record the unlinking action in the audit trail.
