# Implementation Plan: AI Copilot Workspace (Wingman)

## Overview

Implements the AI Copilot Workspace — a role-aware, project-context-aware conversational AI assistant panel ("Wingman") within the Architex OS Command Centre. The implementation builds foundational types and services first, then API endpoints, then UI components, then property-based tests, and finally platform spine integration wiring.

## Tasks

- [x] 1. Define core types and capability system
  - [x] 1.1 Create shared types file `src/services/copilotTypes.ts`
    - Define all TypeScript types: `CopilotCapability`, `CopilotSource`, `BYOAIContentType`, `ComplianceGapCategory`, `ComplianceGapSeverity`, `NarrativeType`, `NarrativeTone`, `NarrativeAudience`, `ContractType`, `RFIUrgency`
    - Define interfaces: `ConversationThread`, `CopilotMessage`, `ProvenanceRecord`, `ProvenanceOverride`, `CopilotProjectContext`, `BYOAIImportRequest`, `BYOAIImportResponse`, `RFIDraftInput`, `RFIDraftOutput`, `ComplianceGap`, `ComplianceGapReport`, `NarrativeInput`, `NarrativeOutput`, `ClauseExplanationInput`, `ClauseExplanationOutput`, `RateLimitState`, `CopilotResponse`, `StatusSummary`
    - Define `CAPABILITY_ROLE_MAP` constant mapping capabilities to roles
    - Define `UNIVERSAL_CAPABILITIES` array
    - _Requirements: 2.1, 2.4, 2.5, 2.6, 2.7, 2.8, 4.2, 5.1, 11.1_

  - [x] 1.2 Create Zod validation schemas in `src/lib/copilotSchemas.ts`
    - Schema for message input (prompt 3–4000 chars, non-whitespace-only)
    - Schema for RFI draft input (subject 1–200, description 1–2000, max 20 references, urgency enum)
    - Schema for BYOAI import request (content 1–50000, model name 1–100, content type enum, timestamp validation)
    - Schema for narrative input (type, audience, tone enums)
    - Schema for clause explanation input (text 1–2000, optional contract type)
    - Schema for thread creation (title max 100 chars)
    - _Requirements: 6.1, 9.1, 10.1, 11.1, 11.6, 11.9, 12.7_

- [x] 2. Implement CopilotService core
  - [x] 2.1 Create `src/services/copilotService.ts` — capability access control
    - Implement `getCapabilitiesForRole(role: UserRole): CopilotCapability[]`
    - Implement `validateCapabilityAccess(role: UserRole, capability: string): { allowed: boolean; error?: string }`
    - Deny `platform_admin`-only users with appropriate message
    - Deny unrecognized capabilities without revealing role mappings
    - Handle dual-role users (platform_admin + professional role)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11_

  - [x] 2.2 Write property tests for capability access control
    - **Property 1: Capability Access Control**
    - **Property 2: No-Project Capability Restriction**
    - File: `src/services/__tests__/copilotCapabilities.property.test.ts`
    - **Validates: Requirements 2.1–2.11, 1.6**

  - [x] 2.3 Implement rate limiter in `src/services/copilotRateLimiter.ts`
    - Sliding window implementation (60 requests per user per 60-minute window)
    - Track per-user request counts with window start timestamps
    - Return `retryAfterMinutes` when limit exceeded
    - _Requirements: 12.5, 12.6_

  - [x] 2.4 Implement guardrail filter in `src/services/copilotGuardrailFilter.ts`
    - Content safety filter (profanity, discriminatory language, third-party PII detection)
    - Response truncation at 8000 chars with truncation indicator
    - Disclaimer appending: "AI-generated content. Review before professional use."
    - Copyright text limit enforcement (max 15 consecutive words from contract forms)
    - _Requirements: 12.1, 12.2, 12.3, 12.9, 10.4_

  - [x] 2.5 Write property tests for validation and guardrails
    - **Property 26: Prompt Validation**
    - **Property 27: Response Truncation**
    - **Property 17: Disclaimer Invariant**
    - **Property 18: Copyrighted Text Limit**
    - File: `src/services/__tests__/copilotValidation.property.test.ts`
    - **Validates: Requirements 12.7, 12.9, 12.3, 10.4**

- [x] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement ContextAssembler
  - [x] 4.1 Create `src/services/copilotContextAssembler.ts`
    - Implement `assembleContext(projectId: string, userId: string): Promise<CopilotProjectContext>`
    - Read Project Passport (phase, team, dates, risk) via `projectPassportService`
    - Filter document register (draft/pending_review/issued) via `documentRegisterService`
    - Read user's pending inbox actions
    - Read 20 most recent audit trail entries via `auditTrailService`
    - Enforce permission-scoped data access via `permissionService`
    - Handle partial context (flag unavailable sources, proceed with available data)
    - Token budget management: priority-based truncation (phase+risk → inbox → docs → audit)
    - Cache invalidation on project state changes
    - 5-second timeout per data source
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 4.2 Write property tests for context assembly
    - **Property 3: Context Permission Scoping**
    - **Property 4: Context Token Truncation Priority**
    - File: `src/services/__tests__/copilotAccessControl.property.test.ts`
    - **Validates: Requirements 3.3, 3.6**

- [x] 5. Implement ProvenanceService
  - [x] 5.1 Create `src/services/provenanceService.ts`
    - Implement `createProvenanceRecord(params): Promise<ProvenanceRecord>` — writes to `projects/{projectId}/ai_provenance/{recordId}`
    - Implement `attachProvenanceToRecord(provenanceId, targetRecordId, targetRecordType): Promise<void>` — blocks insertion if provenance creation fails
    - Implement `createOverride(provenanceRecordId, attestation): Promise<ProvenanceOverride>` — validates declaration ≥20 chars
    - Implement `queryByProject(projectId, pagination): Promise<PaginatedResult<ProvenanceRecord>>` — paginated (max 200), sorted by generatedAt desc
    - Enforce immutability: reject all update/delete operations
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 5.7, 5.8_

  - [x] 5.2 Write property tests for provenance service
    - **Property 9: Provenance Record Creation Invariant**
    - **Property 10: Provenance Failure Blocks Record Insertion**
    - **Property 11: Provenance Immutability**
    - **Property 12: Provenance Override Structure**
    - File: `src/services/__tests__/provenanceService.property.test.ts`
    - **Validates: Requirements 5.1, 5.3, 5.7, 5.8**

- [x] 6. Implement BYOAIBridgeService
  - [x] 6.1 Create `src/services/byoaiBridgeService.ts`
    - Implement `importContent(projectId, userId, request: BYOAIImportRequest): Promise<BYOAIImportResponse>`
    - Validate payload (content length, model name, content type, timestamp not >5min future)
    - Check user's project write access
    - Create provenance record with `source: 'external'`, `capability: null`
    - Store as draft document in project document register with `ai_imported: true`
    - Log all attempts (success/failure) to audit trail
    - Return documentId and provenanceRecordId on success
    - _Requirements: 11.1, 11.2, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9_

  - [x] 6.2 Write property tests for BYOAI bridge
    - **Property 19: BYOAI Import Validation**
    - **Property 20: BYOAI Import Provenance**
    - **Property 21: BYOAI Access Control**
    - **Property 22: Import Audit Trail Completeness**
    - File: `src/services/__tests__/byoaiBridge.property.test.ts`
    - **Validates: Requirements 11.1, 11.2, 11.4, 11.6, 11.7, 11.9**

- [x] 7. Implement CopilotService — AI inference and conversation management
  - [x] 7.1 Implement `processMessage()` in `copilotService.ts`
    - Accept `(userId, projectId, threadId, prompt, capability)` params
    - Validate rate limit → validate prompt → validate capability access
    - Call `contextAssembler.assembleContext()` for project context
    - Build system prompt with project context JSON (not user-visible)
    - Call `geminiService.callGeminiProxy()` with system prompt + user prompt
    - Apply guardrails (safety filter, truncation, disclaimer)
    - Create provenance record via `provenanceService`
    - Persist message to thread in Firestore
    - Return `CopilotResponse` envelope
    - _Requirements: 3.5, 4.2, 12.1, 12.4, 12.8_

  - [x] 7.2 Implement conversation thread CRUD in `copilotService.ts`
    - `createThread(projectId, userId, title?)` — auto-generate title from first message (60 chars, word boundary)
    - `listThreads(projectId, userId)` — filter non-archived, sort by lastMessageAt desc, limit 50
    - `getMessages(threadId, pagination)` — paginated, 50 per page
    - `updateThread(threadId, userId, updates)` — title, archive status
    - `unarchiveThread(threadId)` — auto-unarchive on new message to archived thread
    - Enforce 100-thread limit per project per user
    - Enforce owner-only access (except `project:manage_members` permission)
    - Auto-archive threads with no messages for 90 days
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_

  - [x] 7.3 Write property tests for thread management and safety
    - **Property 5: Message Structure Invariant**
    - **Property 6: Thread List Ordering and Filtering**
    - **Property 7: Thread Title Auto-Generation**
    - **Property 8: Thread Access Control**
    - **Property 23: Harmful Content Filter**
    - **Property 24: Error Message Opacity**
    - **Property 25: Rate Limit Enforcement**
    - File: `src/services/__tests__/copilotSafety.property.test.ts`
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.5, 12.2, 12.4, 12.5**

- [x] 8. Implement capability-specific handlers
  - [x] 8.1 Implement `draftRfi()` handler in `copilotService.ts`
    - Accept `RFIDraftInput`, validate via Zod schema
    - Generate sequential RFI number (next after highest existing)
    - Default addressed-to to project lead consultant (empty if none assigned)
    - Ground in project context (documents, phase, team members)
    - Generate question body ≥50 chars expanding user description
    - Calculate suggested deadline (creation date + project response period, default 7 days)
    - Return `RFIDraftOutput` for editable preview
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.7, 6.8_

  - [x] 8.2 Implement `summariseStatus()` handler in `copilotService.ts`
    - Generate natural-language summary ≤800 words
    - Cover: lifecycle phase, days in phase, next 3 milestones, overdue actions, active risks, recent activity (7 days)
    - Conditionally include financials (only if user has `summarise_financials` capability)
    - Tailor ordering by role (compliance for architects, payments for QS, site progress for contractors)
    - Include verifiable data points (document names, team names, ISO dates)
    - Detect no-change since last summary → return diff only
    - Return `StatusSummary` with 4 structured sections (overview, risks, upcoming, blockers)
    - 10-second timeout enforcement
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

  - [x] 8.3 Implement `flagCompliance()` handler in `copilotService.ts`
    - Analyse compliance records, readiness checks, document register, lifecycle phase
    - Categorise gaps: `missing_submission`, `expired_certification`, `phase_prerequisite`, `regulatory_flag`
    - Reference specific SANS standards without reproducing clause text
    - Sort by severity (critical → warning → informational), resolved items last
    - Max 50 items, each with suggested remediation
    - Use advisory language throughout
    - 10-second timeout enforcement
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

  - [x] 8.4 Implement `generateNarrative()` handler in `copilotService.ts`
    - Accept `NarrativeInput` (type, audience, tone)
    - Ground in project context and firm profile data
    - Produce 200–800 words, 2–6 paragraphs
    - Use South African built environment vocabulary (CIDB, SACAP, ECSA)
    - Never fabricate firm-specific details
    - Return `NarrativeOutput` with word count, paragraph count, readability grade
    - 30-second timeout
    - _Requirements: 9.1, 9.2, 9.3, 9.5, 9.6, 9.7_

  - [x] 8.5 Implement `explainClause()` handler in `copilotService.ts`
    - Accept `ClauseExplanationInput` (text 1–2000 chars, optional contract type)
    - Generate 150–600 word explanation (meaning, applies to, obligations, implications, related clauses)
    - Always append legal disclaimer
    - Enforce max 15 consecutive copyrighted words
    - Contextualise with project contract if available in Project Passport
    - Request clarification if clause/contract type unidentifiable
    - 15-second timeout
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_

  - [x] 8.6 Write property tests for capability outputs
    - **Property 13: RFI Draft Validation**
    - **Property 14: Financial Data Exclusion**
    - **Property 15: Compliance Gap Sorting**
    - **Property 16: Compliance Gap Category Validity**
    - **Property 28: Spine Write Confirmation Gate**
    - **Property 29: Spine Write Audit Trail**
    - File: `src/services/__tests__/copilotOutput.property.test.ts`
    - **Validates: Requirements 6.1, 6.2, 7.2, 8.4, 8.5, 8.2, 13.6, 13.4**

- [x] 9. Checkpoint — Ensure all service tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement API endpoints
  - [x] 10.1 Add Copilot API routes to `src/lib/api-router.ts`
    - `POST /api/copilot/message` — send message, receive AI response (auth required)
    - `GET /api/copilot/threads?projectId=X` — list user's threads (auth + project membership)
    - `POST /api/copilot/threads` — create new thread (auth + project membership)
    - `GET /api/copilot/threads/:threadId/messages` — get messages paginated (auth + owner/manage_members)
    - `PATCH /api/copilot/threads/:threadId` — update thread title/archive (auth + owner)
    - `POST /api/copilot/threads/:threadId/finalise` — finalise structured output → spine write (auth + owner)
    - `GET /api/copilot/capabilities` — get capabilities for current user's role (auth)
    - `GET /api/provenance/project/:projectId` — query provenance records paginated (auth + project membership)
    - `POST /api/provenance/override` — create professional attestation (auth + project membership)
    - `POST /api/projects/:projectId/ai-imports` — BYOAI import (auth + project write access)
    - All endpoints validate Firebase Auth token
    - _Requirements: 1.1, 4.1, 4.3, 5.6, 11.1, 13.1, 13.2, 13.3_

  - [x] 10.2 Write unit tests for API endpoint validation and error responses
    - Test auth token validation on all endpoints
    - Test capability denial responses (403, no role leak)
    - Test rate limit responses (429 with retryAfterMinutes)
    - Test validation errors (400 with field-specific messages)
    - Test BYOAI authorization rejection (403)
    - _Requirements: 2.3, 11.4, 12.5, 12.7_

- [x] 11. Implement spine write-back handlers
  - [x] 11.1 Implement finalise actions in `copilotService.ts`
    - `finaliseRfi(threadId, messageId, userId)` — write RFI to register, create inbox action (`document_request`), create audit trail entry
    - `acceptComplianceGaps(threadId, messageId, userId)` — create WorkflowEvent per gap (`risk_detected`), surface in Action Centre
    - `exportStatusSummary(threadId, messageId, userId)` — confirmation prompt, persist as ProjectRecord (`ai_status_summary`)
    - `acceptNarrative(threadId, messageId, userId)` — create draft document, copy-to-clipboard support
    - All require explicit user confirmation (no auto-writes)
    - All create audit trail entries (actor, action type, project ID, source ID, timestamp)
    - Handle write failures: retain draft, display error, allow retry
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8_

- [x] 12. Implement UI components — CopilotPanel root and navigation registration
  - [x] 12.1 Create `src/components/CopilotPanel.tsx`
    - Accept `user: UserProfile` and optional `projectId` props
    - Render inside AppShell content area (Command Centre module)
    - Hero section with Wingman branding (eyebrow: "WINGMAN", h1, sub)
    - Display active project context header (project name, phase, team role) when project selected
    - Display project selector when no project active
    - General-assistance mode (non-project-scoped capabilities only) when no projects
    - Manage active thread selection state
    - Session-scoped conversation persistence (in-memory, restore on re-navigate)
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 1.7_

  - [x] 12.2 Register Wingman in navigation system
    - Add Tool Nav config in `src/navigation/toolNavRegistry.ts` (title: "Wingman")
    - Add nav entry in `src/navigation/architexNavigationConfig.ts` under Command Centre
    - Add lazy-loaded route in `src/App.tsx` via `lazyWithChunkRetry`
    - Breadcrumb: "Wingman"
    - Accessible to all professional roles
    - _Requirements: 1.1_

- [x] 13. Implement UI components — Conversation and messaging
  - [x] 13.1 Create `src/components/copilot/ThreadList.tsx`
    - Display thread summaries (title, message count, last message timestamp)
    - Sort by last message timestamp descending, limit 50 non-archived
    - "New Thread" button (enforces 100-thread limit with error indication)
    - _Requirements: 4.3, 4.9_

  - [x] 13.2 Create `src/components/copilot/ConversationView.tsx`
    - Scrollable message history (50 visible, older loadable on demand)
    - Visual distinction between user and assistant messages
    - Provenance badge on AI responses (persistent visual indicator)
    - Capability selector dropdown (placeholder: "Ask your Wingman...")
    - Text input field with retry on error
    - Retain unsent message on error, allow retry
    - Inline error indication on AI service failure
    - _Requirements: 1.2, 1.8, 1.9, 5.5_

  - [x] 13.3 Create `src/components/copilot/MessageHistory.tsx`
    - Render `UserMessage` and `AssistantMessage` sub-components
    - `AssistantMessage` includes `ProvenanceBadge` and `DisclaimerTag`
    - Bird icon avatar for assistant messages (Wingman identity)
    - Load more button for messages beyond initial 50
    - _Requirements: 1.2, 1.9, 5.5, 12.3_

  - [x] 13.4 Create `src/components/copilot/EditablePreview.tsx`
    - Inline editable view for structured outputs (RFI, narrative, compliance, status)
    - Field-level editing before finalisation
    - Finalise button triggers spine write-back
    - Discard button retains draft in thread without write
    - `RFIForm` sub-component (all fields editable, addressed-to validation)
    - `NarrativePreview` sub-component (rich-text, word count, readability grade, paragraph count)
    - `ComplianceGapList` sub-component (sorted by severity, remediation actions)
    - `StatusSummaryCards` sub-component (4 cards: overview, risks, upcoming, blockers)
    - _Requirements: 6.5, 6.6, 6.7, 7.5, 8.4, 9.4_

- [x] 14. Implement UI components — BYOAI Import Panel
  - [x] 14.1 Create `src/components/copilot/ImportPanel.tsx`
    - Button labelled for external AI import (Wingman branding)
    - Import form with: content paste area, source model name (required), content type dropdown (required), optional metadata fields (prompt, external tool URL)
    - Validation feedback (field-specific error messages)
    - Success response showing created document ID and provenance record ID
    - _Requirements: 11.3, 11.5, 11.6_

- [x] 15. Implement Wingman bird animations
  - [x] 15.1 Create `src/components/copilot/WingmanBird.tsx`
    - Origami bird SVG component using framer-motion
    - Animation states: idle (gentle breathing, blink), thinking (head tilt, bobbing), working (pecking, glancing), success (wing lift, nod), waiting (quietly watching)
    - Context-aware animations (reviewing drawings, preparing reports, checking compliance, searching project info, generating brief)
    - Replace spinner/loading indicators with bird state
    - Subtle, elegant, fast animations — no cartoon styling
    - Reinforce origami identity
    - _Requirements: (Wingman brand identity — design spec)_

- [x] 16. Checkpoint — Ensure all tests pass, UI renders correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Create design workshop sample HTML
  - [x] 17.1 Create `AI_COPILOT_WORKSPACE_WINGMAN_SAMPLE.html`
    - Self-contained HTML with Architex theme tokens
    - Demonstrate CopilotPanel layout within AppShell grid context
    - Show: thread list, conversation view, message history, editable preview, import panel
    - Include Wingman bird placeholder and empty state
    - Use realistic sample data (thread titles, messages, RFI draft, compliance gaps)
    - Follow workspace-template pattern (Hero → Content)
    - _Requirements: (Design workshop steering rule)_

- [x] 18. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (29 properties across 7 test files)
- Unit tests validate specific examples and edge cases
- All code-level identifiers use `copilot`/`Copilot` internally; user-facing text uses "Wingman" branding
- Implementation language: TypeScript (React 19 + Express 5), matching the design document
- Integration with existing services: geminiService, projectPassportService, lifecycleEngine, riskEngine, documentRegisterService, auditTrailService, eventRoutingService, inboxEventAdapter, agentIdentityService, readinessCheckService, permissionService

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.3", "2.4"] },
    { "id": 2, "tasks": ["2.2", "2.5", "4.1", "5.1"] },
    { "id": 3, "tasks": ["4.2", "5.2", "6.1"] },
    { "id": 4, "tasks": ["6.2", "7.1", "7.2"] },
    { "id": 5, "tasks": ["7.3", "8.1", "8.2", "8.3", "8.4", "8.5"] },
    { "id": 6, "tasks": ["8.6", "10.1", "11.1"] },
    { "id": 7, "tasks": ["10.2", "12.1", "12.2"] },
    { "id": 8, "tasks": ["13.1", "13.2", "13.3", "13.4"] },
    { "id": 9, "tasks": ["14.1", "15.1"] },
    { "id": 10, "tasks": ["17.1"] }
  ]
}
```
