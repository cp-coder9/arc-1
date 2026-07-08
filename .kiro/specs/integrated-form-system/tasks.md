# Implementation Plan: Integrated Form System

## Overview

Build the Integrated Form System as a deeply embedded Architex OS module providing automated construction document creation, intelligent auto-fill, manual form entry, PDF export, digital signatures, collaborative editing, and full audit trail. The implementation follows a bottom-up approach: types → services → API routes → hooks → components → integration wiring.

## Tasks

- [x] 1. Set up project structure and core types
  - [x] 1.1 Create form system TypeScript types and interfaces
    - Create `src/services/forms/formTypes.ts` with all interfaces: FormTemplate, FormInstance, FormFieldValue, FormSchema, FormSection, FormFieldDefinition, FieldMapping, DataSourceRef, SignatureRequirement, SignatureRecord, AuditEvent, FieldLock, FormStatus, FormCategory, FieldType, ValidationRule, ValidationError, PdfExportOptions, PdfExportResult
    - Include all supporting types: ResolverContext, DataResolver, TemplateFilters, FormDraft, ConditionalRule, LayoutConfig
    - Export all types for consumption by services, hooks, and components
    - _Requirements: 1.1, 1.6, 2.1, 2.2, 2.3, 6.1, 8.2, 12.1_

- [x] 2. Implement core services
  - [x] 2.1 Implement form template service
    - Create `src/services/forms/formTemplateService.ts`
    - Implement CRUD operations for form templates in Firestore `form_templates` collection
    - Implement search/filter by category, municipality, lifecycle stage, form type with pagination (20 per page)
    - Implement version management: new version publishing while retaining previous versions for existing instances
    - Implement municipality-priority sorting (project-associated municipality templates first)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 2.2 Implement auto-fill engine with resolver chain
    - Create `src/services/forms/autoFillEngine.ts`
    - Implement chain-of-responsibility pattern with resolvers: ProjectPassportResolver, UserProfileResolver, ClientRecordResolver, FirmRecordResolver
    - Each resolver queries its respective Firestore data source using the DataSourceRef path
    - Implement `resolveAutoFill()` that iterates field mappings and produces Record<string, FormFieldValue>
    - Handle unavailable data sources gracefully (leave field empty, mark as requiring manual entry)
    - Implement client selector logic when multiple client records exist
    - Ensure deterministic resolution (same context → same output)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 13.2, 14.3_

  - [ ]* 2.3 Write property test for auto-fill determinism
    - **Property 1: Auto-fill Determinism**
    - Given the same project, user, and client context, the Auto_Fill_Engine must produce identical field values on repeated invocations
    - Generate arbitrary ResolverContext and FieldMapping arrays, verify repeated calls yield identical results
    - **Validates: Requirements 2.6**

  - [x] 2.4 Implement form instance service
    - Create `src/services/forms/formInstanceService.ts`
    - Implement create (from template + auto-fill), read, update fields, delete operations
    - Implement status transitions: draft → awaiting_approval → ready_for_export → exported → signed
    - Store instances in Firestore `form_instances/{instanceId}` with denormalized template metadata
    - Implement project context switching with re-resolution of non-overridden fields
    - Support standalone form instances (null projectId)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4_

  - [ ]* 2.5 Write property test for override preservation
    - **Property 2: Override Preservation**
    - When project context is switched, all fields marked `isOverridden: true` must retain their manual values — only non-overridden fields may change
    - Generate arbitrary FormInstance with a mix of overridden/non-overridden fields, switch context, verify overridden fields unchanged
    - **Validates: Requirements 4.3**

  - [x] 2.6 Implement form validation service
    - Create `src/services/forms/formValidationService.ts`
    - Implement SA ID number validation (13 digits + Luhn check)
    - Implement SACAP registration format validation (PrArch/PrSArch/PrTechArch/SrArchTech/CandArch prefix + up to 10 digits)
    - Implement erf number and township validation against Municipality_Profile when geographic context available
    - Implement required field validation for export blocking
    - Implement per-field inline validation on blur
    - Return ValidationResult with field-level errors including fieldId, label, section, rule, message
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

  - [ ]* 2.7 Write unit tests for form validation service
    - Test SA ID Luhn check with valid/invalid IDs
    - Test SACAP format with valid prefixes and edge cases
    - Test required field validation
    - Test geographic validation with and without Municipality_Profile context
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

  - [x] 2.8 Implement form audit service
    - Create `src/services/forms/formAuditService.ts`
    - Implement audit event recording in Firestore subcollection `form_instances/{instanceId}/audit/{eventId}`
    - Support event types: created, field_modified, exported, signed, shared, approval_granted, approval_denied
    - Record before/after values for field modifications
    - Attribute auto-fill changes to 'system' rather than initiating user
    - Capture version snapshots on every event (complete form state at event timestamp)
    - Enforce immutability of audit entries (no update/delete operations)
    - Use Firestore transactions to make audit writes atomic with field modifications
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [ ]* 2.9 Write property test for audit completeness
    - **Property 3: Audit Completeness**
    - Every field modification (auto-fill, manual, override, revert) must produce exactly one audit event with correct before/after values
    - Generate arbitrary sequences of field modifications, verify 1:1 correspondence with audit events
    - **Validates: Requirements 6.2**

  - [ ]* 2.10 Write property test for version snapshot consistency
    - **Property 6: Version Snapshot Consistency**
    - Every audit event's snapshot must reconstruct the exact field state that existed at that event's timestamp
    - Generate a sequence of modifications, capture snapshots, verify each snapshot matches the expected state
    - **Validates: Requirements 6.4**

- [x] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement collaboration and permission services
  - [x] 4.1 Implement collaboration service with field locking
    - Create `src/services/forms/collaborationService.ts`
    - Implement `acquireFieldLock()` using Firestore transactions on `form_instances/{instanceId}/locks/{fieldId}`
    - Implement `releaseFieldLock()` on blur
    - Implement `subscribeToFieldLocks()` via Firestore onSnapshot for real-time lock state
    - Implement lock expiry after 5 minutes of inactivity
    - Filter expired locks in subscription handler
    - Implement share/revoke collaborator access (restricted to same project team members)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 4.2 Write property test for lock exclusivity
    - **Property 4: Lock Exclusivity**
    - At most one user may hold an active (non-expired) lock on any given field at any point in time
    - Simulate concurrent lock acquisition attempts, verify mutual exclusion
    - **Validates: Requirements 8.2**

  - [x] 4.3 Implement form permission service
    - Create `src/services/forms/formPermissionService.ts`
    - Implement role-based permission checks per the permission matrix:
      - Architects, engineers, QS, town planners, energy pros, fire engineers: full create/edit/export
      - Contractors/subcontractors: construction admin forms only (site instructions, variation orders, payment certificates)
      - Clients: view/download only for their project forms
      - Freelancer, developer, site_manager, bep, supplier: view-only unless elevated
      - Firm admin: all + configure workflows
      - Platform admin: all + template management
    - Record permission-denied attempts in audit trail
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [ ]* 4.4 Write unit tests for form permission service
    - Test all 17 role × action combinations from the permission matrix
    - Test elevated permission grants by firm admin
    - Test construction admin restriction for contractors
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

- [x] 5. Implement export, signature, and integration services
  - [x] 5.1 Implement PDF export service
    - Create `src/services/forms/pdfExportService.ts`
    - Implement single form PDF generation using existing pdf-vendor library
    - Reproduce template layout: page dimensions, field positions, fonts, logos
    - Embed populated field values and digital signatures in PDF
    - Upload generated PDF to Vercel Blob
    - Implement batch export (up to 50 instances, individual or combined)
    - Validate required fields before export (warn on empty, block on critical)
    - Handle generation failures gracefully (preserve FormInstance, allow retry)
    - Target: single export within 15 seconds
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 5.2 Implement signature service
    - Create `src/services/forms/signatureService.ts`
    - Implement signature capture (base64 canvas capture or crypto hash)
    - Validate professional credentials (SACAP registration) before allowing signature
    - Implement sequential signing order per SignatureRequirement
    - Lock all signed fields from modification after signature applied
    - Support signature revocation by signatory to unlock fields
    - Track per-signatory status and notify outstanding signatories via Action Centre
    - Require all required fields populated and validated before signature
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [ ]* 5.3 Write property test for signature immutability
    - **Property 5: Signature Immutability**
    - Once a signature is applied, all fields in the signed form must be read-only until the signature is explicitly revoked
    - Apply signature, attempt field modifications, verify all are rejected
    - **Validates: Requirements 12.6**

  - [x] 5.4 Implement form integration service
    - Create `src/services/forms/formIntegrationService.ts`
    - On PDF export: write entry to Document Register (form type, template version, export date, exporter, project)
    - On municipal form export (all fields + signatures): update Municipal Readiness submission tracking status
    - On PDF export: write project record to Project Passport (form type, title, date, stage)
    - On status transition: create Action Centre inbox item for form owner within 60 seconds
    - Implement retry queue for failed integration writes (retry within 5 minutes)
    - Notify user of pending integration status on failure
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [ ]* 5.5 Write property test for template version isolation
    - **Property 7: Template Version Isolation**
    - Existing FormInstances must continue using their original template version even when a newer version is published
    - Create instances, publish new template version, verify existing instances unchanged
    - **Validates: Requirements 1.7**

- [x] 6. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement API routes
  - [x] 7.1 Create forms API router with template and instance endpoints
    - Create `src/lib/forms-api-router.ts` and mount on Express app
    - Template endpoints: POST /api/forms/templates (admin), GET /api/forms/templates (search/filter/paginate), GET /api/forms/templates/:id, PATCH /api/forms/templates/:id (admin)
    - Instance endpoints: POST /api/forms/instances (create from template), GET /api/forms/instances/:id, PATCH /api/forms/instances/:id/fields (update fields), DELETE /api/forms/instances/:id
    - Wire authentication middleware on all routes
    - Wire role-based authorization via formPermissionService
    - _Requirements: 1.2, 1.6, 3.1, 4.1, 9.1, 9.2, 9.4_

  - [x] 7.2 Create export, signature, collaboration, draft, and audit endpoints
    - Export endpoints: POST /api/forms/instances/:id/export (PDF generation)
    - Signature endpoints: POST /api/forms/instances/:id/sign
    - Collaboration endpoints: POST /api/forms/instances/:id/share, DELETE /api/forms/instances/:id/share/:userId
    - Draft endpoints: GET /api/forms/drafts (user's drafts, paginated, max 50, sorted by last-modified)
    - Audit endpoints: GET /api/forms/instances/:id/audit (chronological events, within 3 seconds)
    - Auto-fill preview: POST /api/forms/auto-fill-preview
    - Wire all endpoints with authentication and permission checks
    - _Requirements: 5.1, 7.4, 8.1, 6.6, 12.1, 2.6_

  - [ ]* 7.3 Write integration tests for API routes
    - Test form creation → auto-fill → field override → export → Document Register entry flow
    - Test permission enforcement (client cannot create, contractor restricted)
    - Test draft persistence and retrieval
    - _Requirements: 1.2, 3.1, 5.1, 7.4, 9.2, 9.4_

- [x] 8. Implement React hooks
  - [x] 8.1 Create useFormTemplateLibrary hook
    - Create `src/hooks/useFormTemplateLibrary.ts`
    - Implement template search/filter with debounced query
    - Implement pagination (totalPages, currentPage)
    - Implement lifecycle stage recommendations ("Recommended for this stage" section)
    - React to project stage changes within 5 seconds
    - _Requirements: 1.2, 1.5, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 8.2 Create useFormInstance hook
    - Create `src/hooks/useFormInstance.ts`
    - Implement real-time field state management
    - Implement `updateField()` with atomic audit trail write
    - Subscribe to field locks via collaborationService
    - Track active collaborators and their locked fields
    - _Requirements: 3.1, 3.2, 8.2, 8.5_

  - [x] 8.3 Create useAutoFill hook
    - Create `src/hooks/useAutoFill.ts`
    - Invoke autoFillEngine on template + project context
    - Expose resolvedFields, resolving state, and reResolve for project switching
    - Complete resolution within 3 seconds
    - _Requirements: 2.6, 4.2, 4.3_

  - [x] 8.4 Create useFormDrafts hook
    - Create `src/hooks/useFormDrafts.ts`
    - Fetch user's drafts organized by project, sorted by last-modified
    - Implement deleteDraft and stale draft filtering (180 days)
    - Limit to 50 drafts per user
    - _Requirements: 7.3, 7.4, 7.6, 7.7_

- [x] 9. Implement UI components
  - [x] 9.1 Create FormSystemWorkspace and FormTemplateLibrary components
    - Create `src/components/forms/FormSystemWorkspace.tsx` as main workspace (workspace template pattern with Hero → Stat Row → Modules → Panels)
    - Accept `user: UserProfile` prop, integrate with Tool Nav via toolNavRegistry.ts
    - Implement tab navigation: Template Library, Form Editor, Drafts, Export/Sign, Audit Trail
    - Create `src/components/forms/FormTemplateLibrary.tsx` with search/filter/select, category grouping, municipality filter, "Recommended for this stage" section
    - Display "no templates match" message with filter broadening suggestion when zero results
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 9.2 Create FormEditor and FormFieldRenderer components
    - Create `src/components/forms/FormEditor.tsx` with section-based layout, field rendering, and auto-fill indicators
    - Create `src/components/forms/FormFieldRenderer.tsx` dispatching FieldType to appropriate input components (text, textarea, number, date, select, multi_select, radio, checkbox, id_number, sacap_reg, erf_number, address, phone, email)
    - Create `src/components/forms/AutoFillIndicator.tsx` showing auto-fill vs manual visual badge, with revert action
    - Implement inline validation error display on blur
    - Implement conditional sections (e.g., company resolution only if juristic person)
    - _Requirements: 2.4, 3.1, 3.2, 3.3, 13.1, 13.4, 14.1, 14.2, 14.4, 14.5, 15.5_

  - [x] 9.3 Create FormProjectSelector component
    - Create `src/components/forms/FormProjectSelector.tsx`
    - Show all projects user is a team member of
    - Implement search filter when list exceeds 10 projects
    - Handle no-projects state (disable selector, show message, allow manual-only)
    - Implement project context switching with re-resolution summary
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 9.4 Create FormDraftsList and auto-save components
    - Create `src/components/forms/FormDraftsList.tsx` displaying drafts by project with last-modified timestamps
    - Implement 30-second debounced auto-save
    - Implement localStorage fallback on save failure with notification and 60-second retry
    - Implement draft resume restoring all field values, overrides, and cursor position
    - Implement stale draft flagging (180 days) and explicit delete with confirmation
    - Persist draft on navigate-away and tab close
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 9.5 Create FormExportDialog and FormSignatureCapture components
    - Create `src/components/forms/FormExportDialog.tsx` with export options, validation summary (incomplete fields by label and section), proceed/cancel choice
    - Create `src/components/forms/FormSignatureCapture.tsx` with signature pad canvas, credential validation display, sequential signing order tracking
    - Display outstanding signature requirements with signatory name and role
    - _Requirements: 5.1, 5.2, 5.3, 12.1, 12.2, 12.4, 12.5_

  - [x] 9.6 Create FormAuditViewer, FormCollaboratorPresence, and FormApprovalWorkflow components
    - Create `src/components/forms/FormAuditViewer.tsx` with chronological timeline of audit events (type, timestamp, user, details)
    - Create `src/components/forms/FormCollaboratorPresence.tsx` showing active collaborator avatars and currently locked fields
    - Create `src/components/forms/FormApprovalWorkflow.tsx` displaying approval chain status, approval/denial actions
    - Audit display within 3 seconds of request
    - _Requirements: 6.6, 8.5, 9.3_

- [x] 10. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Registration, navigation, and integration wiring
  - [x] 11.1 Register Form System in navigation and App.tsx
    - Add Tool Nav config in `src/navigation/toolNavRegistry.ts` with sections: Forms (Template Library, My Drafts, Recent Forms) and Management (Export Queue, Approvals, Audit Trail)
    - Add lazy-loaded route in `App.tsx` for FormSystemWorkspace
    - Register in `architexNavigationConfig.ts` under Module 4 (Compliance + Municipal Readiness) and accessible from Project Passport
    - Configure role-based visibility per permission matrix
    - _Requirements: 9.1, 9.2, 9.4, 9.6, 10.5_

  - [x] 11.2 Wire platform integration endpoints
    - Mount `forms-api-router.ts` in the Express server (`server.ts` and `api-server.ts`)
    - Wire Document Register integration on export
    - Wire Municipal Readiness update on municipal form export
    - Wire Project Passport record on export
    - Wire Action Centre inbox items on status transitions
    - Implement retry queue for failed integration writes
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [ ]* 11.3 Write integration tests for full form workflow
    - Test: select template → auto-fill → manual override → sign → export PDF → Document Register entry
    - Test: multi-user collaboration with field locking visible to both users
    - Test: draft save/resume across simulated page reload
    - Test: lifecycle stage change → recommended template update
    - _Requirements: 2.1, 3.2, 5.1, 7.3, 8.2, 10.6, 11.1_

- [x] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The Form System workspace follows the Architex workspace template pattern (Hero → Stat Row → Modules → Panels)
- All components render inside the AppShell 3-column grid using CSS token system
- Services use Firestore transactions for atomic audit trail writes
- Real-time collaboration uses Firestore onSnapshot listeners

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.6", "2.8"] },
    { "id": 2, "tasks": ["2.3", "2.4", "2.7", "2.9", "2.10"] },
    { "id": 3, "tasks": ["2.5", "4.1", "4.3"] },
    { "id": 4, "tasks": ["4.2", "4.4", "5.1", "5.2"] },
    { "id": 5, "tasks": ["5.3", "5.4", "5.5"] },
    { "id": 6, "tasks": ["7.1", "7.2"] },
    { "id": 7, "tasks": ["7.3", "8.1", "8.2", "8.3", "8.4"] },
    { "id": 8, "tasks": ["9.1", "9.2", "9.3", "9.4", "9.5", "9.6"] },
    { "id": 9, "tasks": ["11.1", "11.2"] },
    { "id": 10, "tasks": ["11.3"] }
  ]
}
```
