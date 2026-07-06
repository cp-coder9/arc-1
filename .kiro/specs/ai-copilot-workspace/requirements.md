# Requirements Document

## Introduction

Architex has a mature multi-agent AI infrastructure (20+ orchestration files, 5 specialized agents, Gemini integration) but no user-facing AI assistant surface. Professionals currently use external AI tools without structured integration, and AI-generated content entering the system lacks provenance tagging — a liability concern under SANS 17024 certification requirements. This spec defines the AI Copilot Workspace: a role-aware, project-context-aware assistant panel accessible from the Command Centre that can draft RFIs, summarise project status, flag compliance gaps, generate proposal narratives, explain contract clauses, and tag all AI-generated output with provenance metadata. It also defines Bring-Your-Own-AI import endpoints for structured ingestion of externally-generated AI content.

## Glossary

- **Copilot_Panel**: The user-facing AI assistant panel component rendered inside the Architex OS shell as part of the Command Centre module.
- **Copilot_Service**: The backend service (`src/services/copilotService.ts`) that orchestrates AI inference requests, manages conversation context, and enforces role-based capability scoping.
- **Provenance_Record**: A metadata object attached to any AI-generated or AI-assisted content entering the system, recording the AI model, generation timestamp, user who accepted the output, confidence level, and whether it was internally or externally generated.
- **Provenance_Service**: The service responsible for creating, attaching, and querying Provenance_Record objects across all AI outputs in the system.
- **BYOAI_Bridge**: The Bring-Your-Own-AI import layer — API endpoints and UI affordances that allow professionals to submit AI-generated content from external tools into Architex with structured provenance tagging.
- **Copilot_Capability**: A named action the Copilot can perform (e.g., `draft_rfi`, `summarise_status`, `flag_compliance`, `explain_clause`, `generate_narrative`), scoped to specific Professional_Role values.
- **Conversation_Thread**: A persisted sequence of user prompts and Copilot responses within a project context, maintaining continuity across sessions.
- **Project_Context**: The subset of Project Passport data, active documents, team membership, lifecycle phase, and pending actions that the Copilot uses to ground its responses.
- **Professional_Role**: Any of the domain-specific user roles defined in `src/types.ts` (architect, bep, engineer, contractor, quantity_surveyor, town_planner, energy_professional, fire_engineer, site_manager, developer, freelancer, subcontractor, supplier, client, firm_admin).
- **AI_Output**: Any text, structured data, or document content generated wholly or partially by an AI model, whether produced internally by the Copilot or imported via the BYOAI_Bridge.

## Requirements

### Requirement 1: Copilot Panel Rendering and Shell Integration

**User Story:** As a professional user, I want an AI assistant panel accessible from the Command Centre, so that I can interact with AI capabilities without leaving the Architex OS shell.

#### Acceptance Criteria

1. THE Copilot_Panel SHALL render inside the Architex OS authenticated content area as a component within the Command Centre module, inheriting the OS header, breadcrumb, and navigation frame.
2. WHEN a user navigates to the AI Copilot section in Command Centre, THE Copilot_Panel SHALL display a conversation interface containing: a text input field for user messages, a scrollable message history area showing the most recent 50 messages with older messages loadable on demand, and a capability selector presenting the capabilities derived from the user's Professional_Role.
3. THE Copilot_Panel SHALL accept the `user: UserProfile` prop and derive role-based capabilities from the user's Professional_Role, where each Professional_Role maps to a defined set of capability categories.
4. IF a project is currently selected in the user's session, THEN THE Copilot_Panel SHALL display the active project context (project name, phase, team role) in a visible header area above the conversation.
5. IF no project is active in the user's session, THEN THE Copilot_Panel SHALL display a project selector allowing the user to choose from their accessible projects, or to proceed without project context.
6. WHEN the user has no active projects, THE Copilot_Panel SHALL function in a general-assistance mode restricted to non-project-scoped capabilities only (explain contract clauses, general compliance questions), and the capability selector SHALL hide project-scoped capability options.
7. THE Copilot_Panel SHALL persist Conversation_Thread state in memory for the duration of the browser session (from login until logout or browser tab closure), restoring the most recent Conversation_Thread when the user navigates back to the panel within the same session.
8. IF the AI service is unavailable or returns an error when the user submits a message, THEN THE Copilot_Panel SHALL display an inline error indication within the message history area, retain the user's unsent message in the input field, and allow the user to retry submission.
9. THE Copilot_Panel SHALL display a visible indicator distinguishing AI-generated content from user-submitted messages, so that AI output provenance is traceable within the conversation history.

### Requirement 2: Role-Aware Capability Scoping

**User Story:** As a platform architect, I want Copilot capabilities scoped to the user's professional role, so that each discipline sees only relevant AI actions and the system does not produce outputs outside the user's competence.

#### Acceptance Criteria

1. THE Copilot_Service SHALL define the following Copilot_Capability values: `draft_rfi`, `summarise_status`, `flag_compliance`, `generate_narrative`, `explain_clause`, `draft_site_instruction`, `summarise_financials`, `flag_risk`.
2. THE Copilot_Service SHALL map each Copilot_Capability to one or more Professional_Role values that may invoke it, as specified in criteria 4 through 8; Professional_Role values not explicitly listed in criteria 5 through 8 SHALL have access only to the universal capabilities defined in criterion 4.
3. WHEN a user requests a Copilot_Capability that is not mapped to their Professional_Role, THE Copilot_Service SHALL deny the request and return a message indicating the capability is not available for their role, without revealing which roles do have access.
4. THE Copilot_Service SHALL grant `summarise_status`, `flag_risk`, and `explain_clause` to all Professional_Role values, as these are universally useful across disciplines.
5. THE Copilot_Service SHALL grant `draft_rfi` and `draft_site_instruction` to roles involved in construction administration: architect, bep, engineer, site_manager, contractor, quantity_surveyor.
6. THE Copilot_Service SHALL grant `flag_compliance` to roles with regulatory responsibility: architect, bep, engineer, energy_professional, fire_engineer, town_planner.
7. THE Copilot_Service SHALL grant `generate_narrative` to roles that produce written deliverables: architect, bep, engineer, quantity_surveyor, town_planner.
8. THE Copilot_Service SHALL grant `summarise_financials` to roles with financial visibility: architect, bep, quantity_surveyor, contractor, client, firm_admin.
9. IF a user holding only the `platform_admin` role (with no Professional_Role) requests any Copilot_Capability, THEN THE Copilot_Service SHALL deny the request and return a message indicating that Copilot capabilities require a professional role.
10. IF a user requests a capability value that does not match any defined Copilot_Capability in criterion 1, THEN THE Copilot_Service SHALL deny the request and return a message indicating the requested capability is unrecognized.
11. IF a user holds both `platform_admin` and a Professional_Role, THEN THE Copilot_Service SHALL resolve capability access based on the user's Professional_Role mapping, ignoring the `platform_admin` role for capability scoping purposes.

### Requirement 3: Project Context Injection

**User Story:** As a professional user, I want the Copilot to understand my current project context, so that its responses are grounded in real project data rather than generic advice.

#### Acceptance Criteria

1. WHEN a project is selected, THE Copilot_Service SHALL assemble Project_Context by reading the project's Project Passport (phase, team, key dates, risk status), the document register filtered to documents with status `draft`, `pending_review`, or `issued`, the user's pending inbox actions for that project, and the 20 most recent audit trail entries ordered by timestamp descending.
2. THE Copilot_Service SHALL include the user's Professional_Role and their ProjectAccessRole (if any) on the selected project in the Project_Context, so that responses reflect the user's responsibilities and elevation level.
3. THE Copilot_Service SHALL limit Project_Context assembly to data the requesting user has permission to read, respecting existing project-level access controls as evaluated by the Permission_Service.
4. WHEN a project-level state change occurs (phase transition, new document uploaded, team member added or removed, new inbox action created), THE Copilot_Service SHALL invalidate any cached Project_Context for that project and reassemble it from source data before responding to the next user message sent to the Copilot for that project.
5. THE Copilot_Service SHALL pass Project_Context as a JSON object in the AI model's system prompt, not as user-visible conversation content, containing named fields for passport summary, document register summary, pending actions, audit trail entries, and user role context.
6. IF the assembled Project_Context exceeds the AI model's context window token limit, THEN THE Copilot_Service SHALL retain data in this priority order: (1) current phase and risk flags, (2) pending inbox actions, (3) document register summary, (4) audit trail entries — truncating audit trail entries from oldest first until the context fits within the token limit.
7. IF any data source required for Project_Context assembly is unavailable (Firestore read failure, timeout exceeding 5 seconds, or permission denial), THEN THE Copilot_Service SHALL assemble the context from the remaining available sources, include a flag in the system prompt indicating which data sources were unavailable, and proceed with the partial context rather than blocking the user interaction.

### Requirement 4: Conversation Persistence

**User Story:** As a professional user, I want my Copilot conversations saved per project, so that I can resume discussions and reference previous AI outputs.

#### Acceptance Criteria

1. THE Copilot_Service SHALL persist each Conversation_Thread to Firestore under the path `projects/{projectId}/copilot_threads/{threadId}`, storing the creating user's UID as the `ownerUid` field on the thread document.
2. THE Copilot_Service SHALL store each message in a Conversation_Thread with: role (user or assistant), content (maximum 10,000 characters), timestamp (ISO 8601 UTC), Copilot_Capability invoked (if applicable, null otherwise), and Provenance_Record reference (for assistant messages, null for user messages).
3. WHEN the user returns to the Copilot_Panel for a previously used project, THE Copilot_Panel SHALL display a list of the user's Conversation_Thread summaries (thread title, message count, and last message timestamp) ordered by last message timestamp descending, limited to the 50 most recent non-archived threads.
4. THE Copilot_Service SHALL allow a user to create up to 100 Conversation_Thread instances per project, each with a user-provided title (maximum 100 characters) or an auto-generated title derived from the first user message content (first 60 characters, truncated at the nearest word boundary).
5. THE Copilot_Service SHALL enforce that a user can only read their own Conversation_Thread records, except where a user has `project:manage_members` permission, in which case they can read all threads for that project.
6. IF a Conversation_Thread has had no new messages for 90 days, THEN THE Copilot_Service SHALL mark it as archived but retain it for read access.
7. IF a user sends a message to an archived Conversation_Thread, THEN THE Copilot_Service SHALL automatically un-archive the thread, update its status to active, and persist the new message.
8. IF a Firestore write fails when persisting a message to a Conversation_Thread, THEN THE Copilot_Service SHALL retain the unsent message content client-side, display an error indication to the user, and allow the user to retry the send without re-entering the message.
9. IF a user attempts to create a Conversation_Thread that would exceed the 100-thread limit per project, THEN THE Copilot_Service SHALL deny the creation and display an error indication that the thread limit has been reached.

### Requirement 5: AI Output Provenance Tagging

**User Story:** As a professional liable under SANS 17024, I want all AI-generated content tagged with provenance metadata, so that I can distinguish AI-assisted work from human-authored work and demonstrate professional oversight.

#### Acceptance Criteria

1. THE Provenance_Service SHALL create a Provenance_Record for every AI_Output generated by the Copilot_Service, containing: `modelId` (the AI model identifier, maximum 128 characters), `generatedAt` (ISO 8601 timestamp), `acceptedBy` (UID of user who accepted/used the output), `acceptedAt` (ISO 8601 timestamp of acceptance), `source` (literal `internal` or `external`), `capability` (the Copilot_Capability that produced it), and `confidence` (model-reported confidence score as a decimal between 0.00 and 1.00 inclusive, or `null` if unavailable).
2. WHEN a user copies, exports, or inserts Copilot-generated content into a project document, RFI, site instruction, or any other Firestore-persisted project record, THE Provenance_Service SHALL attach the corresponding Provenance_Record to that record.
3. IF the Provenance_Service fails to create or attach a Provenance_Record, THEN THE Provenance_Service SHALL block the AI_Output from being inserted into the target project record and SHALL display an error indication to the user stating that the operation cannot complete without provenance tracking.
4. THE Provenance_Service SHALL store Provenance_Record objects in Firestore at `projects/{projectId}/ai_provenance/{recordId}` with a reference to the source Conversation_Thread message.
5. WHEN a project record has an attached Provenance_Record, THE Copilot_Panel SHALL display a persistent visual indicator (badge or icon) on that record that remains visible without user interaction, distinguishing it from records without AI-generated content.
6. THE Provenance_Service SHALL support querying all AI_Output records for a given project, returning them paginated in batches of at most 200 records, sorted by `generatedAt` descending, for audit and compliance review purposes.
7. THE Provenance_Service SHALL be immutable: once a Provenance_Record is created, it SHALL NOT be modified or deleted.
8. IF a professional attests manual review of an AI_Output, THEN THE Provenance_Service SHALL create a separate `override` record linked to the original Provenance_Record, containing: the attesting user's UID, their Professional_Role, a signed declaration of at least 20 characters describing the review performed, and an ISO 8601 timestamp of attestation.

### Requirement 6: Copilot Capability — Draft RFI

**User Story:** As an architect or site manager, I want the Copilot to draft an RFI based on project context, so that I can issue clarification requests faster with proper technical framing.

#### Acceptance Criteria

1. WHEN a user with `draft_rfi` capability invokes the RFI drafting action, THE Copilot_Service SHALL accept: subject (required, 1–200 characters), description of the issue (required, 1–2000 characters), relevant drawing references (optional, maximum 20 references), and urgency level (optional, one of `low`, `medium`, `high`, or `critical`, defaulting to `medium` if omitted).
2. WHEN the Copilot_Service generates an RFI draft, THE Copilot_Service SHALL produce output including: sequential RFI number (next integer after the highest existing RFI number in the project's register), addressed-to field (defaulting to the project's lead consultant), subject line (echoing the user-provided subject), question body (minimum 50 characters, expanding the user's description into a technically-framed clarification request), references to relevant drawings or specifications (incorporating user-provided references and any additional references found in Project_Context), and a suggested response deadline (calculated as the RFI creation date plus the project's configured response period, defaulting to 7 calendar days).
3. IF the project has no lead consultant assigned, THEN THE Copilot_Service SHALL leave the addressed-to field empty and display a prompt in the editable preview indicating that the user must select an addressee before finalising.
4. THE Copilot_Service SHALL ground the RFI draft in Project_Context — referencing actual project documents, the current lifecycle phase, and team members by name when those team members are listed in the project's active team membership.
5. THE Copilot_Panel SHALL present the generated RFI draft in an editable preview, allowing the user to modify any field before finalising.
6. WHEN the user finalises the RFI draft, THE Copilot_Service SHALL create the RFI record in the project's RFI register at `projects/{projectId}/rfis/` and attach a Provenance_Record indicating AI-assisted generation with `capability: 'draft_rfi'`.
7. IF the user finalises an RFI draft that has an empty addressed-to field, THEN THE Copilot_Service SHALL reject finalisation and display a validation message indicating that an addressee is required.
8. IF the user discards the RFI draft without finalising, THEN THE Copilot_Service SHALL retain the draft in the Conversation_Thread for future reference but SHALL NOT create an RFI record.

### Requirement 7: Copilot Capability — Summarise Project Status

**User Story:** As a project team member, I want the Copilot to summarise the current project status in natural language, so that I can quickly understand where things stand without reading multiple dashboards.

#### Acceptance Criteria

1. WHEN a user invokes `summarise_status`, THE Copilot_Service SHALL generate a natural-language summary of no more than 800 words covering: current lifecycle phase, number of days in that phase, key upcoming milestones (next 3 by date), overdue actions (all items past due date), active risks (all items with priority medium or above), recent team activity (actions from the last 7 calendar days), and financial status (if the user has `summarise_financials` capability).
2. WHEN a user invokes `summarise_status` and the user does NOT have the `summarise_financials` capability, THE Copilot_Service SHALL omit the financial status section entirely from the generated summary and SHALL NOT reference budget, payment, or cost figures.
3. THE Copilot_Service SHALL tailor the summary to the user's Professional_Role by ordering role-relevant items first: compliance and municipal items for architects, payment milestones and cost variances for quantity surveyors, site progress and programme status for contractors, and risk and approval items for all other Professional_Roles.
4. THE Copilot_Service SHALL include verifiable data points from the Project Passport in every summary section, citing at minimum: document names, responsible team member names, and calendar dates (in ISO 8601 format) for each referenced item.
5. THE Copilot_Panel SHALL render the summary with four structured sections (overview, risks, upcoming, blockers) using the platform's card-based layout, with each section rendered as a separate card.
6. WHEN the project status has not changed since the last `summarise_status` invocation in the same Conversation_Thread — where "not changed" means no Project Passport field values, risk evaluations, or record statuses have been updated — THE Copilot_Service SHALL indicate that no changes have occurred since the prior summary and present only the fields that differ rather than a full summary.
7. IF the Project Passport data is unavailable or incomplete (fewer than 2 project records exist), THEN THE Copilot_Service SHALL return an informational message indicating insufficient project data to generate a meaningful summary and SHALL NOT produce a partial or speculative summary.
8. WHEN a user invokes `summarise_status`, THE Copilot_Service SHALL return the summary within 10 seconds of the invocation event.

### Requirement 8: Copilot Capability — Flag Compliance Gaps

**User Story:** As a design professional, I want the Copilot to flag compliance gaps based on current project state, so that I catch missing SANS submissions or expired certifications before they become blockers.

#### Acceptance Criteria

1. WHEN a user with `flag_compliance` capability invokes the compliance flagging action, THE Copilot_Service SHALL analyse the project's compliance records, readiness check results, document register, and lifecycle phase to identify gaps, and SHALL return results within 10 seconds.
2. THE Copilot_Service SHALL categorise compliance gaps as: `missing_submission` (required document not uploaded per the current lifecycle phase's document requirements), `expired_certification` (validity date earlier than the current system date), `phase_prerequisite` (compliance item required before the next phase transition as defined by lifecycle phase rules), and `regulatory_flag` (SANS standard not addressed for current project scope).
3. THE Copilot_Service SHALL reference specific SANS standards (10400-K, 10400-N, 10400-T, 10400-C, 10400-XA, and any other SANS standard enabled in the project's compliance scope) when flagging regulatory gaps, without reproducing copyrighted clause text.
4. THE Copilot_Panel SHALL present compliance gaps as a list sorted by severity (critical first, then warning, then informational) and within the same severity by most recent detection date first, displaying up to 50 gap items per invocation, each with its severity indicator and one suggested remediation action.
5. WHEN a flagged compliance gap has already been addressed (document uploaded, certification renewed) since the last check, THE Copilot_Service SHALL mark it as resolved in the output and sort resolved items after all unresolved items.
6. THE Copilot_Service SHALL use advisory language throughout compliance outputs ("this check indicates", "consider addressing") and SHALL NOT present results as certification or professional sign-off.
7. IF the project has no compliance records, no documents in the register, and no readiness check results, THEN THE Copilot_Service SHALL return an empty gap list with an advisory message indicating that no compliance data is available for analysis.
8. IF the Copilot_Service is unable to retrieve compliance records or readiness check results due to a data source error, THEN THE Copilot_Service SHALL return an error indication specifying which data source was unavailable, without presenting partial results as a complete gap analysis.

### Requirement 9: Copilot Capability — Generate Proposal Narrative

**User Story:** As an architect preparing a proposal, I want the Copilot to generate narrative sections based on project brief and my firm's profile, so that I can produce professional proposals faster.

#### Acceptance Criteria

1. WHEN a user with `generate_narrative` capability invokes narrative generation, THE Copilot_Service SHALL accept: narrative type (approach statement, methodology, team capability, project understanding, fee justification), target audience (client, adjudicator, committee), and tone (formal, conversational, technical).
2. WHEN narrative generation is invoked, THE Copilot_Service SHALL ground the narrative in Project_Context (brief requirements, project scope, team composition) and the user's firm profile data; IF firm profile data is absent or incomplete for referenced fields, THEN THE Copilot_Service SHALL generate the narrative using only available Project_Context data and SHALL NOT fabricate firm-specific details.
3. THE Copilot_Service SHALL produce narrative text of 200–800 words per section, structured with a minimum of 2 and maximum of 6 paragraphs, using vocabulary and phrasing consistent with South African built environment procurement documentation (e.g., CIDB, SACAP, ECSA terminology where relevant to the narrative type).
4. THE Copilot_Panel SHALL present generated narratives in an editable rich-text preview displaying: a live word count, a Flesch-Kincaid readability grade level score, and paragraph count; the preview SHALL support bold, italic, heading, and bullet-list formatting.
5. WHEN the user accepts a generated narrative, THE Copilot_Service SHALL attach a Provenance_Record and make the content available for copy-to-clipboard and for direct insertion into the project's proposal document register as a draft section.
6. THE Copilot_Service SHALL NOT generate narratives that make specific claims about the user's firm (awards, project count, revenue) unless that data exists in the firm's profile.
7. IF narrative generation fails due to AI model error, timeout exceeding 30 seconds, or insufficient Project_Context (no project brief data available), THEN THE Copilot_Service SHALL return an error message indicating the reason for failure and preserve any user-provided input parameters for retry without re-entry.

### Requirement 10: Copilot Capability — Explain Contract Clauses

**User Story:** As any professional user, I want the Copilot to explain contract clauses in plain language, so that I understand my obligations without needing legal counsel for routine interpretations.

#### Acceptance Criteria

1. WHEN a user invokes `explain_clause`, THE Copilot_Service SHALL accept: clause text or reference (required, 1–2000 characters), and optionally the contract type (one of: JBCC, NEC, FIDIC, GCC, or null if unspecified).
2. THE Copilot_Service SHALL generate a plain-language explanation covering: what the clause means, who it applies to, what obligations it creates, common practical implications, and how it interacts with related clauses, structured as a response of 150–600 words.
3. THE Copilot_Service SHALL include a disclaimer appended to every clause explanation: "This is AI-generated guidance and does not constitute legal advice. Consult a legal professional for binding interpretations."
4. THE Copilot_Service SHALL NOT reproduce more than 15 consecutive words from copyrighted contract forms (JBCC, NEC, FIDIC, GCC) — only paraphrase and explain the intent.
5. WHEN a contract clause reference maps to the user's current project contract (if one is recorded in Project Passport), THE Copilot_Service SHALL contextualise the explanation with project-specific party names, dates, and contract value where available.
6. IF the Copilot_Service cannot identify the referenced clause or contract type from the user's input, THEN THE Copilot_Service SHALL return a message requesting clarification (e.g., contract type or edition) rather than generating a speculative explanation.
7. WHEN a user invokes `explain_clause`, THE Copilot_Service SHALL return the explanation within 15 seconds of the invocation event.
8. IF the clause text input exceeds 2000 characters, THEN THE Copilot_Service SHALL reject the request with a validation message indicating the maximum accepted input length.

### Requirement 11: Bring-Your-Own-AI Import Bridge

**User Story:** As a professional who uses external AI tools (ChatGPT, Claude, Gemini web, etc.), I want to import AI-generated content into Architex with proper provenance tagging, so that externally-produced AI outputs are tracked the same as internal ones.

#### Acceptance Criteria

1. THE BYOAI_Bridge SHALL expose an API endpoint `POST /api/projects/{projectId}/ai-imports` that accepts: content (text or structured JSON, treated as opaque payload), external model name (string, 1–100 characters), generation timestamp (ISO 8601 string; if omitted the system SHALL use the server receipt time), content type (one of: `rfi_draft`, `narrative`, `specification`, `analysis`, `general`), and optional metadata object containing `prompt` (string, maximum 5,000 characters) and `externalToolUrl` (valid URL string or omitted).
2. WHEN a BYOAI import is received and passes validation, THE Provenance_Service SHALL create a Provenance_Record with `source: 'external'`, the declared external model name as `modelId`, the importing user's UID as `acceptedBy`, and `capability: null` to indicate externally-generated content.
3. THE Copilot_Panel SHALL provide a dedicated import form accessible via a button labelled for external AI import, presenting input fields for: content (paste area), source model name (required text field), content type (required dropdown), and optional metadata fields (prompt used, external tool URL).
4. IF the importing user does not have write access to the target project, THEN THE BYOAI_Bridge SHALL reject the request and return an authorization error indicating insufficient project permissions without persisting any data.
5. WHEN external AI content is imported successfully, THE BYOAI_Bridge SHALL store it in the project's document register as a draft document with `ai_imported: true` flag and the attached Provenance_Record, and SHALL return the created document ID and Provenance_Record ID in the success response.
6. IF the content field is empty or exceeds 50,000 characters, OR the external model name is empty or exceeds 100 characters, OR the content type is not one of the allowed values, THEN THE BYOAI_Bridge SHALL reject the import and return a validation error indicating which field failed validation.
7. THE BYOAI_Bridge SHALL log all import attempts (successful and rejected) to the project audit trail, recording: importing user UID, timestamp, declared content type, declared model name, success or failure status, and failure reason if applicable.
8. WHEN the BYOAI_Bridge successfully stores an imported document, THE document SHALL remain in `draft` status until the importing user explicitly confirms placement into a project section or document category.
9. IF the `generation timestamp` provided in the request is a future date (more than 5 minutes ahead of server time), THEN THE BYOAI_Bridge SHALL reject the import and return a validation error indicating an invalid timestamp.

### Requirement 12: Copilot Response Quality and Safety

**User Story:** As a platform owner, I want the Copilot to produce safe, accurate, and professionally appropriate responses, so that the platform maintains credibility and does not expose users to harmful AI outputs.

#### Acceptance Criteria

1. THE Copilot_Service SHALL include guardrails in all AI model prompts that prohibit: generating legally binding statements, reproducing copyrighted material verbatim, providing professional certifications or sign-offs, making claims about regulatory compliance that could be mistaken for official assessment.
2. WHEN the AI model returns a response that the Copilot_Service detects contains harmful content (profanity, discriminatory language, personally identifiable information of third parties), THE Copilot_Service SHALL discard the response and return an error message indicating the response could not be delivered due to content policy, without revealing which specific content triggered the filter.
3. THE Copilot_Service SHALL append a standard disclaimer to all Copilot responses: "AI-generated content. Review before professional use."
4. WHEN the Copilot_Service encounters an AI model error (response not received within 30 seconds, rate limit from provider, malformed or empty response body), THE Copilot_Service SHALL return a non-technical error message indicating temporary unavailability that does not expose internal system details, model names, or provider information, and log the error type, timestamp, and user ID for monitoring.
5. THE Copilot_Service SHALL enforce a rate limit of 60 requests per user per hour to prevent abuse and manage API costs.
6. IF a user exceeds the rate limit of 60 requests per hour, THEN THE Copilot_Service SHALL reject subsequent requests with a message indicating the limit has been reached and the number of minutes remaining until the limit resets.
7. IF a user provides a prompt that contains only whitespace, is fewer than 3 characters, or exceeds 4000 characters, THEN THE Copilot_Service SHALL reject the request with a validation message indicating the accepted prompt length range of 3 to 4000 characters.
8. WHEN the Copilot_Service receives a valid prompt and produces a successful response, THE Copilot_Service SHALL return the response within 45 seconds of receiving the request, including the appended disclaimer.
9. THE Copilot_Service SHALL truncate any AI model response that exceeds 8000 characters to 8000 characters and append an indicator that the response was truncated.

### Requirement 13: Integration with Platform Spine

**User Story:** As a platform architect, I want all Copilot outputs to flow back into the platform spine (Project Passport, SpecForge, Action Centre), so that AI-generated content is not siloed in the chat interface.

#### Acceptance Criteria

1. WHEN a user finalises an RFI draft from the Copilot, THE Copilot_Service SHALL write the RFI record to the project's RFI register and generate an inbox action of type `document_request` for the addressed party, with priority derived from the RFI's due date proximity.
2. WHEN a user accepts a compliance gap report from the Copilot, THE Copilot_Service SHALL create one WorkflowEvent entry of type `risk_detected` per identified gap item, each surfacing in the assigned role's Action Centre as a pending item with priority matching the gap severity.
3. WHEN a user exports a status summary from the Copilot, THE Copilot_Service SHALL present a confirmation prompt before saving, and upon user acceptance SHALL persist it as a ProjectRecord in the Project Passport with recordType `ai_status_summary` and the current ISO 8601 timestamp.
4. THE Copilot_Service SHALL write an audit trail entry for every Copilot action that produces a project record, including at minimum: actor UID, action type (one of `rfi_created`, `compliance_gap_flagged`, `document_imported`, `narrative_exported`), target project ID, source object ID, and ISO 8601 timestamp.
5. WHEN the Copilot produces content that references a specification item by ID, THE Copilot_Service SHALL attach the specification item's ID as a `relatedRecordId` on the output ProjectRecord, linking it to the corresponding SpecForge record if one exists in the project's specification register.
6. THE Copilot_Service SHALL NOT create project records or trigger workflow events without explicit user confirmation (the finalise/accept action).
7. IF a spine write operation (RFI register, Project Passport, or WorkflowEvent creation) fails, THEN THE Copilot_Service SHALL retain the draft content in the Copilot session, display an error indication to the user describing which write failed, and allow the user to retry the operation without re-entering data.
8. WHEN the Copilot_Service successfully writes a project record or workflow event to the platform spine, THE Copilot_Service SHALL display a confirmation indication to the user identifying the record type created and the target location (RFI register, Project Passport, or Action Centre).
