# Requirements Document

## Introduction

Multiple tools in the Architex platform have complete service logic and UI components but lack discoverable route entries in App.tsx. They are either buried inside parent pages as sub-panels (SA Council Drawing Compliance Navigator inside ComplianceToolboxHub, NCR Manager and Site Instruction Manager inside Site Execution) or have no UI entry point at all (Contract Administration services, Contractor/Supplier Compliance service). This feature wires all buried tools into App.tsx as first-class discoverable routes, registers them in the standalone tool registry where appropriate, and updates the navigation configuration so users can find and access them directly.

The scope covers:
1. Surfacing existing built tools that lack standalone routes (SA Council Navigator, NCR Manager, Site Instruction Manager)
2. Creating a dedicated Contract Administration workspace UI backed by the existing 13-file service layer
3. Creating a Contractor/Supplier Compliance dashboard UI backed by the existing compliance gate service
4. Wiring the existing Dispute Resolution page properly as a direct-access route (not only project-scoped)
5. Registering all newly routed tools in the standalone tool registry with appropriate role-based access
6. Updating navigation config to surface these tools in their correct module sections

## Glossary

- **Route_Registry**: The combination of CANONICAL_DASHBOARD_PAGES array and DIRECT_WORKFLOW_PAGE_IDS / PROJECT_WORKFLOW_PAGE_IDS sets in App.tsx that define accessible page routes.
- **Standalone_Tool_Registry**: The STANDALONE_TOOL_REGISTRY array in src/services/tools/standaloneToolRegistry.ts defining all tools available as tiles with role-based access.
- **Navigation_Config**: The architexNavigation array in src/navigation/architexNavigationConfig.ts defining role-aware sidebar navigation items and sections.
- **SA_Council_Navigator**: The SACouncilDrawingComplianceNavigator component providing municipality-specific drawing submission requirement guidance for South African local authorities.
- **NCR_Manager**: The NonConformanceReport management component providing defect identification, tracking, and resolution workflows during site execution.
- **Site_Instruction_Manager**: The SiteInstructionManager component providing formal site instruction issuance, acknowledgement, and tracking workflows.
- **Contract_Admin_Workspace**: A new workspace component providing a unified interface to the existing Contract Administration service layer (claims, variations, EoT, notices, payment scheduler, working day calculator).
- **Compliance_Dashboard**: A new dashboard component surfacing Contractor/Supplier compliance check status, missing critical checks, expired checks, and compliance gate results.
- **Lazy_Load**: The React lazy loading pattern using lazyWithChunkRetry() for code-splitting page components in App.tsx.
- **Platform_Contracts**: The five integration requirements every tool must satisfy: write to Project Passport, expose data to SpecForge, write to audit trail, surface actions to Action Centre, respect role-based access.

## Requirements

### Requirement 1: SA Council Drawing Compliance Navigator Route Registration

**User Story:** As an architect or BEP, I want to access the SA Council Drawing Compliance Navigator directly from the navigation menu, so that I can check municipality-specific drawing submission requirements without navigating through the Compliance Toolbox Hub.

#### Acceptance Criteria

1. THE Route_Registry SHALL include a page entry for the SA_Council_Navigator with id 'council-navigator', label 'Council Drawing Navigator', assigned to the 'BEP tools' group, with a summary describing municipality-specific drawing submission requirements.
2. THE Route_Registry SHALL grant access to the SA_Council_Navigator page for users with the roles: architect, bep, engineer, energy_professional, fire_engineer, town_planner, and admin.
3. WHEN a user navigates to the 'council-navigator' page, THE Route_Registry SHALL render the SACouncilDrawingComplianceNavigator component via Lazy_Load using the lazyWithChunkRetry pattern.
4. THE Standalone_Tool_Registry SHALL include a tool definition for SA_Council_Navigator with id 'council_navigator', route 'standalone/council-navigator', category 'compliance', the same role list as criterion 2, and a calculatorDefinitionId matching an existing calculator definition entry in the definition registry.
5. THE Navigation_Config SHALL include the SA_Council_Navigator as a visible item under the 'design_compliance' section of the Toolboxes module, accessible to all roles specified in criterion 2.
6. WHEN the SA_Council_Navigator is accessed as a standalone route, THE SA_Council_Navigator SHALL render its full UI (municipality selection, project name input, and requirements display) without requiring the ComplianceToolboxHub parent component to be mounted.
7. IF a user without a role listed in criterion 2 navigates to the 'council-navigator' page, THEN THE Route_Registry SHALL exclude the page from the user's available pages and not render the SA_Council_Navigator component.

### Requirement 2: NCR Manager Route Registration

**User Story:** As a site manager or principal agent, I want to access the NCR Manager directly from the navigation menu, so that I can manage non-conformance reports without navigating through Site Execution first.

#### Acceptance Criteria

1. THE Route_Registry SHALL include a page entry for the NCR_Manager with id 'ncr-manager', assigned to the 'Construction tools' group, and with a calculatorDefinitionId linking to its tool definition.
2. THE Route_Registry SHALL grant access to the NCR_Manager page for users with the roles: architect, bep, contractor, subcontractor, site_manager, engineer, and admin.
3. WHEN a user navigates to the 'ncr-manager' page, THE Route_Registry SHALL render the NCRManager component via Lazy_Load.
4. IF a user without an authorized role attempts to navigate to the 'ncr-manager' page, THEN THE Route_Registry SHALL deny access and display the platform's standard unauthorized-access view without rendering the NCRManager component.
5. WHEN the NCR_Manager is rendered as a standalone route, THE NCR_Manager SHALL accept the user prop (UserProfile) and the active projectId from the platform shell, and SHALL display a project selection prompt if no active project context is available.
6. THE Standalone_Tool_Registry SHALL include a tool definition for NCR_Manager with route 'standalone/ncr-manager', category 'construction', roles matching criterion 2, and tags including 'NCR', 'non-conformance', 'defect', and 'quality'.
7. THE Navigation_Config SHALL include the NCR_Manager as a visible item under the 'construction_admin' section of the Toolboxes module.
8. WHEN the NCR_Manager creates or updates a non-conformance report, THE NCR_Manager SHALL write an audit event to the project audit trail containing the acting user identity, the affected NCR identifier, the action performed, and a timestamp.

### Requirement 3: Site Instruction Manager Route Registration

**User Story:** As a principal agent or site manager, I want to access the Site Instruction Manager directly from the navigation menu, so that I can issue and track site instructions without navigating through Site Execution first.

#### Acceptance Criteria

1. THE Route_Registry SHALL include a page entry for the Site_Instruction_Manager with id 'site-instructions', assigned to the 'Construction tools' group.
2. THE Route_Registry SHALL grant access to the Site_Instruction_Manager page for users with the roles: architect, bep, contractor, subcontractor, site_manager, engineer, and admin.
3. WHEN a user navigates to the 'site-instructions' page, THE Route_Registry SHALL render the SiteInstructionManager component via Lazy_Load.
4. WHEN the Site_Instruction_Manager is rendered as a standalone route with an active project selected, THE Site_Instruction_Manager SHALL receive the current user context (UserProfile) and active project context (projectId) from the platform shell props.
5. IF the Site_Instruction_Manager is rendered as a standalone route with no active project selected, THEN THE Site_Instruction_Manager SHALL display a project selection prompt and SHALL NOT render instruction data until a project is selected.
6. THE Standalone_Tool_Registry SHALL include a tool definition for Site_Instruction_Manager with route 'standalone/site-instructions', category 'construction', tags including 'instruction', 'site', 'directive', and 'construction', and a calculatorDefinitionId linking to its registered definition.
7. THE Navigation_Config SHALL include the Site_Instruction_Manager as a visible item under the 'construction_admin' section of the Toolboxes module.
8. WHEN the Site_Instruction_Manager creates or updates an instruction, THE Site_Instruction_Manager SHALL write the event to the project audit trail and surface required acknowledgement actions to the Action Centre.
9. IF the audit trail write or Action Centre notification fails during instruction creation or update, THEN THE Site_Instruction_Manager SHALL display an error indication to the user and SHALL retain the instruction data so the user does not lose their input.

### Requirement 4: Contract Administration Workspace

**User Story:** As a principal agent or quantity surveyor, I want a dedicated Contract Administration workspace accessible from the navigation menu, so that I can manage claims, variations, extensions of time, notices, and payment schedules in a unified interface backed by the existing service layer.

#### Acceptance Criteria

1. THE Route_Registry SHALL include a page entry for the Contract_Admin_Workspace with id 'contract-admin', assigned to the 'Construction tools' group.
2. THE Route_Registry SHALL grant access to the Contract_Admin_Workspace page for users with the roles: architect, bep, quantity_surveyor, contractor, subcontractor, site_manager, engineer, and admin.
3. WHEN a user navigates to the 'contract-admin' page, THE Route_Registry SHALL render the ContractAdminWorkspace component via Lazy_Load.
4. WHEN the Contract_Admin_Workspace loads, THE Contract_Admin_Workspace SHALL display a tab bar containing exactly six tabs in this order: Claims Register, Variation Register, Extension of Time, Notices, Payment Scheduler, and Contract Data Sheet, with the Claims Register tab selected by default.
5. THE Contract_Admin_Workspace SHALL consume the existing services from src/services/contractAdmin/ (claimsRegisterService, variationRegisterService, eotEngineService, noticeEngineService, paymentSchedulerService, contractDataSheetService, workingDayCalculator) without duplicating service logic.
6. THE Contract_Admin_Workspace SHALL display a persistent, non-dismissible Disclaimer_Banner at the top of the workspace stating that the system is advisory only, does not constitute legal advice, and that outputs require professional review, using the text returned by the disclaimerService.getDisclaimerBannerText() function.
7. THE Standalone_Tool_Registry SHALL include a tool definition for Contract_Admin_Workspace with route 'standalone/contract-admin', category 'construction_admin', and tags including 'contract', 'claims', 'variations', 'EoT', 'notices', and 'payment'.
8. THE Navigation_Config SHALL include the Contract_Admin_Workspace as a visible item under the 'construction_admin' section of the Toolboxes module.
9. WHEN any contract administration action is performed (claim registered, variation approved, notice issued, EoT submitted), THE Contract_Admin_Workspace SHALL write the event to the project audit trail via contractIntegrationService.writeToAuditTrail, including the entity type, entity id, action description, acting user id, and ISO timestamp.
10. WHEN a contractual deadline is within 5 working days of its due date and requires user action, THE Contract_Admin_Workspace SHALL surface the action to the Action Centre via contractIntegrationService.surfaceToActionCentre with the deadline date, the required response type, the clause reference, and the number of remaining working days.
11. WHEN a contract status change occurs (new claim, variation approval, EoT grant/reject), THE Contract_Admin_Workspace SHALL write the updated contract status into the Project Passport via contractIntegrationService.writeToProjectPassport within 60 seconds of the action.
12. IF a write to the audit trail, Action Centre, or Project Passport fails after 3 retry attempts, THEN THE Contract_Admin_Workspace SHALL create a failed-sync alert in the Action Centre identifying the target module, the originating event, and the failure timestamp.
13. IF a user with a permitted role does not have contract-level permission for a specific tab's feature (as determined by contractRbacService.canAccess), THEN THE Contract_Admin_Workspace SHALL display that tab in a disabled state with a message indicating insufficient project-level permission.

### Requirement 5: Contractor and Supplier Compliance Dashboard

**User Story:** As a principal agent or project manager, I want a dedicated compliance dashboard for contractors and suppliers, so that I can view compliance check statuses, identify missing or expired certifications, and manage compliance gates before allowing site access or payment processing.

#### Acceptance Criteria

1. THE Route_Registry SHALL include a page entry for the Compliance_Dashboard with id 'contractor-compliance', assigned to the 'Construction tools' group.
2. THE Route_Registry SHALL grant access to the Compliance_Dashboard page for users with the roles: architect, bep, contractor, subcontractor, supplier, site_manager, quantity_surveyor, and admin.
3. WHEN a user navigates to the 'contractor-compliance' page, THE Route_Registry SHALL render the ContractorComplianceDashboard component via Lazy_Load.
4. THE Compliance_Dashboard SHALL display for each contractor/supplier entity: overall compliance status, individual check statuses (health_safety_file, coida_registration, sars_tax_pin, bbbee_verification, cips_registration, letter_of_good_standing), evidence references, and expiry dates, presenting a maximum of 50 entities per page with pagination controls when the total exceeds 50.
5. THE Compliance_Dashboard SHALL consume the existing contractorSupplierComplianceService without duplicating compliance evaluation logic.
6. THE Compliance_Dashboard SHALL highlight missing critical checks and expired checks using distinct visual indicators (red for non-compliant/expired, amber for pending, green for compliant).
7. WHEN a compliance check expires within 30 calendar days, THE Compliance_Dashboard SHALL surface an early warning action to the Action Centre identifying the entity, the expiring check type, and the expiry date.
8. THE Standalone_Tool_Registry SHALL include a tool definition for Compliance_Dashboard with route 'standalone/contractor-compliance', category 'compliance', and tags including 'contractor', 'supplier', 'compliance', 'COIDA', 'H&S', and 'B-BBEE'.
9. THE Navigation_Config SHALL include the Compliance_Dashboard as a visible item under the 'construction_admin' section of the Toolboxes module.
10. WHEN a user updates a compliance check status, THE Compliance_Dashboard SHALL write the change to the project audit trail with the entity, check type, previous status, new status, and timestamp.
11. IF a contractor or supplier entity has an overallStatus of 'non_compliant' or 'expired' as determined by the contractorSupplierComplianceService, THEN THE Compliance_Dashboard SHALL display a compliance gate indicator on that entity marking it as blocked from site access and payment processing until all mandatory checks (health_safety_file, coida_registration, sars_tax_pin) are compliant and unexpired.
12. IF the contractorSupplierComplianceService returns an error or is unavailable, THEN THE Compliance_Dashboard SHALL display an error message indicating the compliance data could not be loaded and retain any previously displayed data without clearing the view.
13. IF no contractor or supplier entities exist for the current project context, THEN THE Compliance_Dashboard SHALL display an empty state message indicating no entities are registered and prompting the user to add contractors or suppliers.

### Requirement 6: Dispute Resolution Direct Access Route

**User Story:** As a project team member, I want to access the Dispute Resolution page directly from the navigation menu without needing an active project context first, so that I can view and manage all disputes across projects from a single entry point.

#### Acceptance Criteria

1. THE Route_Registry SHALL include 'disputes' in both the DIRECT_WORKFLOW_PAGE_IDS set and the PROJECT_WORKFLOW_PAGE_IDS set so that the Dispute Resolution page is accessible with or without an active project context.
2. WHEN a user navigates to the 'disputes' page without an active project, THE DisputeResolutionPage SHALL display disputes across the user's assigned projects limited to the 75 most recent records, where visibility is scoped as follows: admin users see all disputes, client users see disputes on jobs where they are the clientId, architect/bep/freelancer users see disputes on jobs where they are a selectedProfessionalId/selectedBepId/selectedArchitectId, and all other roles see disputes they filed or disputes filed against them.
3. THE Navigation_Config SHALL include Dispute Resolution as a visible item under the 'construction_admin' section of the Toolboxes module for roles: architect, bep, contractor, subcontractor, quantity_surveyor, site_manager, and admin.
4. WHEN the 'disputes' page is accessed while a project is selected in the application shell (i.e., a projectId is present in the page routing context), THE DisputeResolutionPage SHALL filter the dispute register to show only disputes whose jobId belongs to that selected project.
5. IF the DisputeResolutionPage is accessed without an active project and the user has no assigned projects or visible disputes, THEN THE DisputeResolutionPage SHALL display an empty-state message indicating no disputes are available and shall not display an error state.

### Requirement 7: Route Registration Pattern Compliance

**User Story:** As a platform developer, I want all newly registered routes to follow the established App.tsx patterns, so that navigation, lazy loading, breadcrumbs, and role gating work consistently for new tool pages.

#### Acceptance Criteria

1. WHEN a new tool page is registered, THE Route_Registry SHALL include a CANONICAL_DASHBOARD_PAGES entry with: id (kebab-case string, unique across all entries, maximum 40 characters), label (human-readable name), roles (array of permitted UserRole values), group (one of: 'Core workflow', 'Client tools', 'BEP tools', 'Construction tools', 'Freelancer tools', 'Governance'), icon (lucide-react icon element at 18px), summary (single sentence describing purpose), and backedBy (array of backing component or service names).
2. WHEN a new tool page requires direct access (not project-scoped), THE Route_Registry SHALL add the page id to the DIRECT_WORKFLOW_PAGE_IDS set and SHALL NOT add it to the PROJECT_WORKFLOW_PAGE_IDS set.
3. WHEN a new tool page is project-scoped, THE Route_Registry SHALL add the page id to the PROJECT_WORKFLOW_PAGE_IDS set and SHALL NOT add it to the DIRECT_WORKFLOW_PAGE_IDS set.
4. A page id SHALL NOT appear in both DIRECT_WORKFLOW_PAGE_IDS and PROJECT_WORKFLOW_PAGE_IDS simultaneously, unless the page explicitly supports dual-mode access (both with and without project context) as documented in its CANONICAL_DASHBOARD_PAGES entry.
5. WHEN a new tool page component is imported, THE Route_Registry SHALL use the lazyWithChunkRetry() wrapper for code-splitting and chunk-error resilience.
6. THE Navigation_Config entry for each new tool SHALL include a label matching the CANONICAL_DASHBOARD_PAGES label for that tool, a description field, and a roles array that is a subset of or equal to the CANONICAL_DASHBOARD_PAGES roles array for that tool.
7. IF a user without an assigned role for a tool page attempts to navigate to that page, THEN THE Route_Registry SHALL prevent rendering and redirect to the user's default command centre page.

### Requirement 8: Standalone Tool Registry Wiring

**User Story:** As a user browsing the Full Tool Library, I want all newly routed tools to appear as tiles with correct metadata, so that I can discover and launch them from the toolbox.

#### Acceptance Criteria

1. WHEN a tool is registered in the Standalone_Tool_Registry, THE tool definition SHALL include: id (unique string, maximum 64 characters, lowercase with underscores), label (display name, maximum 80 characters), category (a valid StandaloneToolCategory value), description (maximum 160 characters), roles (permitted UserRole array with at least one entry), icon (lucide-react icon name string), route (navigation route string), tags (searchable keyword array with at least 3 and at most 12 entries), and calculatorDefinitionId (linking to the tool's calculator definition).
2. THE Standalone_Tool_Registry SHALL include entries for: SA_Council_Navigator, NCR_Manager, Site_Instruction_Manager, Contract_Admin_Workspace, and Compliance_Dashboard.
3. IF a user's role is not included in a tool definition's roles array, THEN THE Full Tool Library view SHALL NOT display that tool's tile to the user.
4. WHEN a user selects a tool tile from the Full Tool Library, THE platform SHALL navigate to the tool's registered route within 1 second of the selection event.
5. IF a tool definition's calculatorDefinitionId references a definition that does not exist in the system, THEN THE platform SHALL render the tool tile but fall back to the legacy runner path when the tool is launched.
