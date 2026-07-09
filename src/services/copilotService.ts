/**
 * AI Copilot Service â€” Capability Access Control & Message Orchestration
 *
 * Orchestrates role-based capability scoping for the Copilot (Wingman) system.
 * Professional roles are granted access to universal + role-specific capabilities.
 * platform_admin-only users are denied all Copilot capabilities.
 *
 * Also orchestrates the full message processing pipeline:
 * rate limit â†’ validate prompt â†’ validate capability â†’ assemble context â†’
 * call Gemini â†’ apply guardrails â†’ create provenance â†’ persist message â†’ respond.
 *
 * @module copilotService
 * @requirements 2.1â€“2.11, 3.5, 4.2, 12.1, 12.4, 12.8
 */

import type { UserRole } from '@/types';
import type { CopilotCapability, CopilotMessage, CopilotResponse, ConversationThread, CopilotProjectContext, RFIDraftInput, RFIDraftOutput, NarrativeInput, NarrativeOutput, ComplianceGap, ComplianceGapReport, ComplianceGapCategory, ComplianceGapSeverity, StatusSummary, ClauseExplanationInput, ClauseExplanationOutput } from '@/services/copilotTypes';

import { CAPABILITY_ROLE_MAP, UNIVERSAL_CAPABILITIES } from '@/services/copilotTypes';
import { checkRateLimit, recordRequest } from '@/services/copilotRateLimiter';
import { CopilotMessageInputSchema, RFIDraftInputSchema, NarrativeInputSchema, ClauseExplanationInputSchema } from '@/lib/copilotSchemas';
import { assembleContext } from '@/services/copilotContextAssembler';
import type { ContextDataSources } from '@/services/copilotContextAssembler';
import { applyGuardrails, checkCopyrightCompliance } from '@/services/copilotGuardrailFilter';
import { createProvenanceRecord } from '@/services/provenanceService';
import { callGeminiProxy } from '@/services/geminiService';
import { adminDb } from '@/lib/firebase-admin';
import { canUserPerform } from '@/services/permissionService';
import type { AuthzUser, ProjectAccessContext } from '@/services/permissionService';

/** All professional roles that have Copilot access (everything except platform_admin). */
const PROFESSIONAL_ROLES: UserRole[] = [
  'client',
  'architect',
  'freelancer',
  'bep',
  'contractor',
  'subcontractor',
  'supplier',
  'engineer',
  'quantity_surveyor',
  'town_planner',
  'energy_professional',
  'fire_engineer',
  'site_manager',
  'developer',
  'firm_admin',
  'land_surveyor',
  'health_safety',
];

/** All valid capability strings for quick lookup. */
const VALID_CAPABILITIES = new Set<string>(Object.keys(CAPABILITY_ROLE_MAP));

/**
 * Determines whether a role is a professional role (i.e. not platform_admin).
 */
function isProfessionalRole(role: UserRole): boolean {
  return role !== 'platform_admin';
}

/**
 * Returns the full list of CopilotCapability values available to a given role.
 *
 * - For platform_admin-only users â†’ returns empty array (no Copilot access).
 * - For professional roles â†’ returns universal capabilities + any role-specific
 *   capabilities where the role appears in CAPABILITY_ROLE_MAP.
 * - For dual-role users (platform_admin + professional role), pass the professional role.
 */
export function getCapabilitiesForRole(role: UserRole): CopilotCapability[] {
  if (!isProfessionalRole(role)) {
    return [];
  }

  const capabilities: CopilotCapability[] = [...UNIVERSAL_CAPABILITIES];

  for (const [capability, allowedRoles] of Object.entries(CAPABILITY_ROLE_MAP)) {
    // Skip universal capabilities (already included)
    if (UNIVERSAL_CAPABILITIES.includes(capability as CopilotCapability)) {
      continue;
    }
    // Role-scoped: check if the user's role is in the allowed list
    if (allowedRoles.includes(role)) {
      capabilities.push(capability as CopilotCapability);
    }
  }

  return capabilities;
}

/**
 * Validates whether a user's role grants access to a specific capability.
 *
 * Access control logic:
 * 1. platform_admin-only â†’ deny with professional role required message
 * 2. Unrecognized capability string â†’ deny with generic "unrecognized" message
 * 3. Universal capability â†’ allow for any professional role
 * 4. Role-scoped capability â†’ check CAPABILITY_ROLE_MAP
 * 5. Denied (capability exists but role lacks access) â†’ generic "not available for your role" message
 *
 * Error messages never reveal which roles have access (security by obscurity for role mappings).
 */
export function validateCapabilityAccess(
  role: UserRole,
  capability: string
): { allowed: boolean; error?: string } {
  // 1. Deny platform_admin-only users
  if (!isProfessionalRole(role)) {
    return {
      allowed: false,
      error: 'Copilot capabilities require a professional role.',
    };
  }

  // 2. Deny unrecognized capabilities
  if (!VALID_CAPABILITIES.has(capability)) {
    return {
      allowed: false,
      error: 'The requested capability is unrecognized.',
    };
  }

  const typedCapability = capability as CopilotCapability;
  const allowedRoles = CAPABILITY_ROLE_MAP[typedCapability];

  // 3. Universal capability (empty array in map) â†’ allow any professional role
  if (allowedRoles.length === 0) {
    return { allowed: true };
  }

  // 4. Role-scoped: check if user's role is in the allowed list
  if (allowedRoles.includes(role)) {
    return { allowed: true };
  }

  // 5. Denied â€” capability exists but role doesn't have access
  return {
    allowed: false,
    error: 'This capability is not available for your role.',
  };
}

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const GEMINI_MODEL_ID = 'gemini-1.5-pro';

const SYSTEM_PROMPT_PREFIX = `You are Wingman, the AI assistant for Architex OS â€” a built environment project management platform. You help professionals with construction projects by providing role-aware, project-context-grounded responses.

Rules:
- Be concise, professional, and grounded in the project data provided.
- Never fabricate project-specific facts not present in the context.
- Always use advisory language for compliance topics.
- Never reproduce more than 15 consecutive words from copyrighted contract forms.

Project Context (JSON â€” not visible to user):
`;

// â”€â”€â”€ Process Message Params â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface ProcessMessageParams {
  userId: string;
  projectId: string;
  threadId: string;
  prompt: string;
  capability: string;
  /** User's professional role for access control */
  role: UserRole;
  /** Optional injectable data sources for context assembly (testing support) */
  dataSources?: ContextDataSources;
  /** Optional injectable Gemini call function (testing/mocking support) */
  callAI?: (systemPrompt: string, userPrompt: string) => Promise<string>;
  /** Optional injectable Firestore persistence (testing/mocking support) */
  persistMessage?: (message: CopilotMessage, projectId: string) => Promise<void>;
}

// â”€â”€â”€ Default Firestore Persistence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function defaultPersistMessage(message: CopilotMessage, projectId: string): Promise<void> {
  const docRef = adminDb
    .collection(`projects/${projectId}/copilot_threads/${message.threadId}/messages`)
    .doc(message.id);
  await docRef.set(message);

  // Update thread lastMessageAt and messageCount
  const threadRef = adminDb.doc(`projects/${projectId}/copilot_threads/${message.threadId}`);
  const threadSnap = await threadRef.get();
  if (threadSnap.exists) {
    const threadData = threadSnap.data();
    await threadRef.update({
      lastMessageAt: message.timestamp,
      messageCount: (threadData?.messageCount ?? 0) + 1,
      updatedAt: message.timestamp,
    });
  }
}

// â”€â”€â”€ Default Context Data Sources (stub) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getDefaultDataSources(): ContextDataSources {
  return {
    getProjectPassport: async () => null,
    getDocumentRegister: async () => [],
    getPendingInboxActions: async () => [],
    getRecentAuditTrail: async () => [],
    getUserContext: async () => null,
    getProjectAccessContext: async () => null,
  };
}

// â”€â”€â”€ Helper: Build Empty Message â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function buildEmptyMessage(threadId: string): CopilotMessage {
  return {
    id: '',
    threadId,
    role: 'assistant',
    content: '',
    timestamp: new Date().toISOString(),
    capability: null,
    provenanceId: null,
    truncated: false,
  };
}

// â”€â”€â”€ Helper: Build Error Response â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function buildErrorResponse(
  threadId: string,
  code: CopilotResponse['error'] extends undefined ? never : NonNullable<CopilotResponse['error']>['code'],
  message: string,
  retryAfterMinutes?: number
): CopilotResponse {
  return {
    message: buildEmptyMessage(threadId),
    provenanceId: '',
    error: {
      code,
      message,
      ...(retryAfterMinutes !== undefined ? { retryAfterMinutes } : {}),
    },
  };
}

// â”€â”€â”€ processMessage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Orchestrates the full Copilot message processing pipeline.
 *
 * Flow:
 * 1. Check rate limit (deny with retryAfterMinutes if exceeded)
 * 2. Validate prompt (3â€“4000 chars, non-whitespace-only)
 * 3. Validate capability access (role-based)
 * 4. Assemble project context
 * 5. Build system prompt with project context JSON
 * 6. Call Gemini AI proxy
 * 7. Apply guardrails (safety filter, truncation, disclaimer)
 * 8. Create provenance record
 * 9. Persist message to thread in Firestore
 * 10. Record rate limit usage
 * 11. Return CopilotResponse envelope
 *
 * @requirements 3.5, 4.2, 12.1, 12.4, 12.8
 */
export async function processMessage(params: ProcessMessageParams): Promise<CopilotResponse> {
  const {
    userId,
    projectId,
    threadId,
    prompt,
    capability,
    role,
    dataSources,
    callAI,
    persistMessage,
  } = params;

  // 1. Check rate limit
  const rateLimitResult = checkRateLimit(userId);
  if (!rateLimitResult.allowed) {
    return buildErrorResponse(
      threadId,
      'rate_limited',
      'Rate limit exceeded. Please wait before sending another message.',
      rateLimitResult.retryAfterMinutes
    );
  }

  // 2. Validate prompt
  const promptValidation = CopilotMessageInputSchema.safeParse({ prompt });
  if (!promptValidation.success) {
    const firstError = promptValidation.error.errors[0]?.message ?? 'Invalid prompt.';
    return buildErrorResponse(threadId, 'validation_error', firstError);
  }

  // 3. Validate capability access
  const capabilityCheck = validateCapabilityAccess(role, capability);
  if (!capabilityCheck.allowed) {
    return buildErrorResponse(
      threadId,
      'capability_denied',
      capabilityCheck.error ?? 'Capability access denied.'
    );
  }

  // 4. Assemble project context
  const sources = dataSources ?? getDefaultDataSources();
  let contextJson: string;
  try {
    const projectContext = await assembleContext(projectId, userId);
    contextJson = JSON.stringify(projectContext);
  } catch {
    // If context assembly fails entirely, proceed with empty context
    contextJson = JSON.stringify({ unavailableSources: ['all'] });
  }

  // 5. Build system prompt with project context JSON (not user-visible)
  const systemPrompt = SYSTEM_PROMPT_PREFIX + contextJson;

  // 6. Call Gemini AI proxy
  let rawResponse: string;
  try {
    const aiCall = callAI ?? callGeminiProxy;
    rawResponse = await aiCall(systemPrompt, prompt);
  } catch {
    return buildErrorResponse(
      threadId,
      'service_unavailable',
      'The AI service is temporarily unavailable. Please try again.'
    );
  }

  if (!rawResponse) {
    return buildErrorResponse(
      threadId,
      'service_unavailable',
      'The AI service returned an empty response. Please try again.'
    );
  }

  // 7. Apply guardrails (safety filter, truncation, disclaimer)
  const guardrailResult = applyGuardrails(rawResponse);

  // If content flagged as containing profanity or discriminatory language, return policy error
  if (!guardrailResult.safe && (guardrailResult.flags.includes('profanity') || guardrailResult.flags.includes('discriminatory_language'))) {
    return buildErrorResponse(
      threadId,
      'content_policy',
      'The response was flagged by our content safety filter and cannot be delivered.'
    );
  }

  // 8. Create provenance record
  const now = new Date().toISOString();
  const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  let provenanceId = '';
  try {
    const provenanceRecord = await createProvenanceRecord({
      projectId,
      threadId,
      messageId,
      modelId: GEMINI_MODEL_ID,
      generatedAt: now,
      acceptedBy: userId,
      acceptedAt: now,
      source: 'internal',
      capability: capability as CopilotCapability,
      confidence: null,
    });
    provenanceId = provenanceRecord.id;
  } catch {
    // Provenance creation failure should not block the response delivery
    // but we log the issue (in production, this would go to an error tracker)
    provenanceId = '';
  }

  // 9. Build and persist message to thread in Firestore
  const assistantMessage: CopilotMessage = {
    id: messageId,
    threadId,
    role: 'assistant',
    content: guardrailResult.content.slice(0, 10_000), // Enforce max 10,000 chars
    timestamp: now,
    capability: capability as CopilotCapability,
    provenanceId: provenanceId || null,
    truncated: guardrailResult.truncated,
  };

  try {
    const persist = persistMessage ?? defaultPersistMessage;
    await persist(assistantMessage, projectId);
  } catch {
    // Persistence failure â€” message still returned to user but not saved
    // The client can retry the save later (Requirement 4.8)
  }

  // 10. Record the rate limit usage
  recordRequest(userId);

  // 11. Return CopilotResponse envelope
  return {
    message: assistantMessage,
    provenanceId,
  };
}


// â”€â”€â”€ Thread CRUD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Maximum threads per user per project. */
const MAX_THREADS_PER_USER = 100;

/** Maximum threads returned in a list call. */
const THREAD_LIST_LIMIT = 50;

/** Messages per page in getMessages. */
const MESSAGES_PER_PAGE = 50;

/** Days of inactivity before auto-archiving. */
const AUTO_ARCHIVE_DAYS = 90;

/**
 * Generates a thread title from the first message content.
 * Truncates to at most 60 characters at the nearest word boundary.
 */
export function generateThreadTitle(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= 60) {
    return trimmed;
  }

  // Find the last space at or before position 60
  const truncated = trimmed.slice(0, 60);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace <= 0) {
    // No space found â€” return full 60 chars
    return truncated;
  }

  return truncated.slice(0, lastSpace);
}

/**
 * Checks whether a thread's lastMessageAt is older than 90 days.
 */
function isStaleThread(lastMessageAt: string): boolean {
  const lastMessage = new Date(lastMessageAt);
  const now = new Date();
  const diffMs = now.getTime() - lastMessage.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= AUTO_ARCHIVE_DAYS;
}

/**
 * Checks whether a user has permission to read a thread they don't own.
 * Returns true if the user has `project:manage_members` permission on the project.
 */
function hasManageMembersPermission(
  userId: string,
  role: UserRole,
  project?: ProjectAccessContext | null
): boolean {
  const authzUser: AuthzUser = { uid: userId, role };
  return canUserPerform(authzUser, 'project:manage_members', project);
}

/**
 * Creates a new conversation thread for a user in a project.
 *
 * - Auto-generates title from first message content (60 chars, word boundary) when not provided
 * - Enforces 100-thread limit per user per project
 *
 * @requirements 4.1, 4.4, 4.9
 */
export async function createThread(
  projectId: string,
  userId: string,
  title?: string
): Promise<ConversationThread> {
  // Enforce 100-thread limit
  const threadsRef = adminDb.collection(`projects/${projectId}/copilot_threads`);
  const userThreadsSnap = await threadsRef
    .where('ownerUid', '==', userId)
    .get();

  if (userThreadsSnap.size >= MAX_THREADS_PER_USER) {
    const error = new Error(
      'Thread limit reached. You can have at most 100 conversation threads per project.'
    );
    (error as Error & { status?: number }).status = 400;
    throw error;
  }

  const now = new Date().toISOString();
  const threadTitle = title || 'New Conversation';

  const newThreadRef = threadsRef.doc();
  const thread: ConversationThread = {
    id: newThreadRef.id,
    projectId,
    ownerUid: userId,
    title: threadTitle.slice(0, 100), // enforce max 100 chars
    status: 'active',
    messageCount: 0,
    lastMessageAt: now,
    createdAt: now,
    updatedAt: now,
  };

  await newThreadRef.set(thread);
  return thread;
}

/**
 * Lists conversation threads for a user in a project.
 *
 * - Filters out archived threads
 * - Sorts by lastMessageAt descending
 * - Limits to 50 threads
 * - Auto-archives threads with no messages for 90 days
 *
 * @requirements 4.3, 4.6
 */
export async function listThreads(
  projectId: string,
  userId: string
): Promise<ConversationThread[]> {
  const threadsRef = adminDb.collection(`projects/${projectId}/copilot_threads`);
  const snapshot = await threadsRef
    .where('ownerUid', '==', userId)
    .where('status', '==', 'active')
    .orderBy('lastMessageAt', 'desc')
    .limit(THREAD_LIST_LIMIT)
    .get();

  const threads: ConversationThread[] = [];
  const archiveBatch = adminDb.batch();
  let hasArchives = false;

  for (const doc of snapshot.docs) {
    const data = doc.data() as ConversationThread;

    // Auto-archive stale threads (no messages for 90 days)
    if (isStaleThread(data.lastMessageAt)) {
      archiveBatch.update(doc.ref, {
        status: 'archived',
        updatedAt: new Date().toISOString(),
      });
      hasArchives = true;
      continue;
    }

    threads.push(data);
  }

  // Commit archive updates if any
  if (hasArchives) {
    await archiveBatch.commit();
  }

  return threads;
}

/**
 * Gets paginated messages for a thread.
 *
 * - 50 messages per page
 * - Enforces owner-only access (or `project:manage_members` permission)
 *
 * @requirements 4.2, 4.5
 */
export async function getMessages(
  threadId: string,
  projectId: string,
  page: number = 1,
  requestingUserId?: string,
  requestingRole?: UserRole,
  projectContext?: ProjectAccessContext | null
): Promise<{ messages: CopilotMessage[]; hasMore: boolean }> {
  // Check thread access
  if (requestingUserId && requestingRole) {
    const threadRef = adminDb.doc(`projects/${projectId}/copilot_threads/${threadId}`);
    const threadSnap = await threadRef.get();

    if (!threadSnap.exists) {
      const error = new Error('Thread not found.');
      (error as Error & { status?: number }).status = 404;
      throw error;
    }

    const threadData = threadSnap.data() as ConversationThread;

    // Owner check: only owner can read, unless user has project:manage_members
    if (
      threadData.ownerUid !== requestingUserId &&
      !hasManageMembersPermission(requestingUserId, requestingRole, projectContext)
    ) {
      const error = new Error('Access denied. You can only read your own threads.');
      (error as Error & { status?: number }).status = 403;
      throw error;
    }
  }

  const messagesRef = adminDb.collection(
    `projects/${projectId}/copilot_threads/${threadId}/messages`
  );

  const offset = (page - 1) * MESSAGES_PER_PAGE;

  // Get one extra to determine if there are more pages
  const snapshot = await messagesRef
    .orderBy('timestamp', 'desc')
    .offset(offset)
    .limit(MESSAGES_PER_PAGE + 1)
    .get();

  const messages: CopilotMessage[] = [];
  const docs = snapshot.docs;
  const hasMore = docs.length > MESSAGES_PER_PAGE;

  // Take at most MESSAGES_PER_PAGE
  const resultDocs = hasMore ? docs.slice(0, MESSAGES_PER_PAGE) : docs;
  for (const doc of resultDocs) {
    messages.push(doc.data() as CopilotMessage);
  }

  return { messages, hasMore };
}

/**
 * Updates a conversation thread's title or archive status.
 *
 * - Enforces owner-only access
 *
 * @requirements 4.5
 */
export async function updateThread(
  threadId: string,
  projectId: string,
  userId: string,
  updates: { title?: string; status?: 'active' | 'archived' }
): Promise<ConversationThread> {
  const threadRef = adminDb.doc(`projects/${projectId}/copilot_threads/${threadId}`);
  const threadSnap = await threadRef.get();

  if (!threadSnap.exists) {
    const error = new Error('Thread not found.');
    (error as Error & { status?: number }).status = 404;
    throw error;
  }

  const threadData = threadSnap.data() as ConversationThread;

  // Owner check
  if (threadData.ownerUid !== userId) {
    const error = new Error('Access denied. Only the thread owner can update it.');
    (error as Error & { status?: number }).status = 403;
    throw error;
  }

  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = { updatedAt: now };

  if (updates.title !== undefined) {
    updatePayload.title = updates.title.slice(0, 100);
  }

  if (updates.status !== undefined) {
    updatePayload.status = updates.status;
  }

  await threadRef.update(updatePayload);

  return {
    ...threadData,
    ...updatePayload,
    updatedAt: now,
  } as ConversationThread;
}

/**
 * Auto-unarchives a thread when a new message is sent to an archived thread.
 *
 * @requirements 4.7
 */
export async function unarchiveThread(
  threadId: string,
  projectId: string
): Promise<void> {
  const threadRef = adminDb.doc(`projects/${projectId}/copilot_threads/${threadId}`);
  const threadSnap = await threadRef.get();

  if (!threadSnap.exists) {
    const error = new Error('Thread not found.');
    (error as Error & { status?: number }).status = 404;
    throw error;
  }

  const threadData = threadSnap.data() as ConversationThread;

  if (threadData.status === 'archived') {
    await threadRef.update({
      status: 'active',
      updatedAt: new Date().toISOString(),
    });
  }
}


// â”€â”€â”€ Draft RFI Handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Parameters for the draftRfi capability handler.
 * Follows the same dependency-injection pattern as processMessage.
 */
export interface DraftRfiParams {
  userId: string;
  projectId: string;
  input: RFIDraftInput;
  context: CopilotProjectContext;
  /** Optional AI call function (testing/mocking support) */
  callAI?: (systemPrompt: string, userPrompt: string) => Promise<string>;
  /** Optional Firestore query function for existing RFI numbers (testing support) */
  queryHighestRfiNumber?: (projectId: string) => Promise<number>;
}

/** Default response period in days when the project has no custom setting. */
const DEFAULT_RFI_RESPONSE_DAYS = 7;

/**
 * Queries Firestore to find the highest RFI number in a project's RFI register.
 * Returns 0 if no RFIs exist.
 */
async function defaultQueryHighestRfiNumber(projectId: string): Promise<number> {
  const rfisRef = adminDb.collection(`projects/${projectId}/rfis`);
  const snapshot = await rfisRef
    .orderBy('rfiNumber', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) {
    return 0;
  }

  const highestRfi = snapshot.docs[0].data();
  return typeof highestRfi.rfiNumber === 'number' ? highestRfi.rfiNumber : 0;
}

/**
 * Builds the AI system prompt for RFI question body generation.
 */
function buildRfiSystemPrompt(context: CopilotProjectContext): string {
  return `You are a construction RFI drafting assistant for the Architex OS platform. Your task is to expand a user's description into a technically-framed Request for Information (RFI) question body.

Rules:
- Write a formal, technically precise RFI question body (minimum 50 characters).
- Reference project context where relevant: current phase, team members, documents.
- Use South African built environment terminology.
- Do NOT fabricate details not present in the context.
- The output must be ONLY the question body text â€” no preamble, headers, or metadata.
- Be specific about what information or clarification is being requested.

Project Context:
- Project: ${context.passport.projectName}
- Phase: ${context.passport.currentPhase}
- Risk Level: ${context.passport.riskLevel}
- Team: ${context.passport.teamMembers.map(m => `${m.name} (${m.role})`).join(', ') || 'No team members listed'}
- Recent Documents: ${context.documentRegister.slice(0, 5).map(d => d.title).join(', ') || 'None available'}`;
}

/**
 * Builds the user prompt for the AI call to generate the RFI question body.
 */
function buildRfiUserPrompt(input: RFIDraftInput): string {
  let prompt = `Draft an RFI question body for the following:\n\nSubject: ${input.subject}\nDescription: ${input.description}`;

  if (input.drawingReferences && input.drawingReferences.length > 0) {
    prompt += `\nReferenced Drawings: ${input.drawingReferences.join(', ')}`;
  }

  if (input.urgency) {
    prompt += `\nUrgency: ${input.urgency}`;
  }

  return prompt;
}

/**
 * Calculates the suggested RFI deadline as today + response period (default 7 days).
 * Returns an ISO 8601 date string (YYYY-MM-DD).
 */
function calculateRfiDeadline(responseDays: number = DEFAULT_RFI_RESPONSE_DAYS): string {
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + responseDays);
  return deadline.toISOString().split('T')[0];
}

/**
 * Merges user-provided drawing references with any relevant references found in project context.
 */
function mergeDrawingReferences(
  userReferences: string[] | undefined,
  context: CopilotProjectContext
): string[] {
  const refs = new Set<string>(userReferences || []);

  // Look for drawing-type documents in the project context
  for (const doc of context.documentRegister) {
    if (
      doc.type === 'drawing' &&
      (doc.status === 'issued' || doc.status === 'pending_review')
    ) {
      // Only add if not already present and within reasonable limit
      if (refs.size < 20) {
        refs.add(doc.title);
      }
    }
  }

  return Array.from(refs).slice(0, 20);
}

/**
 * Drafts an RFI (Request for Information) using AI to expand the user's description
 * into a technically-framed question body grounded in project context.
 *
 * Flow:
 * 1. Validate input via RFIDraftInputSchema
 * 2. Query highest existing RFI number from Firestore and add 1
 * 3. Determine addressed-to from project lead consultant (or null)
 * 4. Build AI prompt to expand description into question body
 * 5. Call AI to generate the question body (min 50 chars)
 * 6. Merge drawing references (user-provided + context)
 * 7. Calculate suggested deadline (today + 7 days default)
 * 8. Create provenance record
 * 9. Return RFIDraftOutput for editable preview
 *
 * @requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.7, 6.8
 */
export async function draftRfi(params: DraftRfiParams): Promise<RFIDraftOutput> {
  const {
    userId,
    projectId,
    input,
    context,
    callAI,
    queryHighestRfiNumber,
  } = params;

  // 1. Validate input via Zod schema
  const validation = RFIDraftInputSchema.safeParse(input);
  if (!validation.success) {
    const firstError = validation.error.errors[0]?.message ?? 'Invalid RFI input.';
    throw new Error(`Validation failed: ${firstError}`);
  }

  const validatedInput = validation.data as RFIDraftInput;

  // 2. Query highest existing RFI number and calculate next sequential number
  const queryFn = queryHighestRfiNumber ?? defaultQueryHighestRfiNumber;  const highestNumber = await queryFn(projectId);
  const rfiNumber = highestNumber + 1;

  // 3. Determine addressed-to from project lead consultant
  const addressedTo = context.passport.leadProfessional
    ? context.passport.leadProfessional
    : null;

  // 4â€“5. Build prompts and call AI to generate question body
  const systemPrompt = buildRfiSystemPrompt(context);
  const userPrompt = buildRfiUserPrompt(validatedInput);

  let questionBody: string;
  try {
    const aiCall = callAI ?? callGeminiProxy;
    const rawResponse = await aiCall(systemPrompt, userPrompt);
    // Ensure minimum 50 characters; if AI response is too short, pad with the original description
    questionBody = rawResponse.trim();
    if (questionBody.length < 50) {
      questionBody = `${questionBody} â€” ${validatedInput.description}`.slice(0, 2000);
      // Ensure still at least 50 chars
      if (questionBody.length < 50) {
        questionBody = questionBody.padEnd(50, '.');
      }
    }
  } catch {
    // Fallback: use the description directly if AI call fails, ensuring 50 char minimum
    questionBody = validatedInput.description;
    if (questionBody.length < 50) {
      questionBody = questionBody.padEnd(50, '.');
    }
  }

  // 6. Merge user-provided drawing references with context references
  const references = mergeDrawingReferences(validatedInput.drawingReferences, context);

  // 7. Calculate suggested deadline (creation date + default 7 days)
  const suggestedDeadline = calculateRfiDeadline(DEFAULT_RFI_RESPONSE_DAYS);

  // 8. Create provenance record
  const now = new Date().toISOString();
  const messageId = `rfi_draft_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  let provenanceId = '';
  try {
    const provenanceRecord = await createProvenanceRecord({
      projectId,
      threadId: '', // RFI drafts may not have a thread context
      messageId,
      modelId: GEMINI_MODEL_ID,
      generatedAt: now,
      acceptedBy: userId,
      acceptedAt: now,
      source: 'internal',
      capability: 'draft_rfi',
      confidence: null,
    });
    provenanceId = provenanceRecord.id;
  } catch {
    // Provenance creation failure â€” assign empty and proceed
    // The user can still use the draft; provenance is tracked best-effort for drafts
    provenanceId = '';
  }

  // 9. Return RFIDraftOutput for editable preview
  return {
    rfiNumber,
    addressedTo,
    subject: validatedInput.subject,
    questionBody,
    references,
    suggestedDeadline,
    provenanceId,
  };
}


// â”€â”€â”€ Summarise Status Handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Parameters for the summariseStatus capability handler.
 * Follows the same dependency-injection pattern as draftRfi.
 */
export interface SummariseStatusParams {
  userId: string;
  projectId: string;
  role: UserRole;
  context: CopilotProjectContext;
  previousSummary?: StatusSummary | null;
  /** Optional AI call function (testing/mocking support) */
  callAI?: (systemPrompt: string, userPrompt: string) => Promise<string>;
}

/** Status summary generation timeout in milliseconds (10 seconds). */
const STATUS_TIMEOUT_MS = 10_000;

/**
 * Determines the role-priority ordering instruction for the AI prompt.
 * Architects see compliance/municipal items first, QS sees payments/costs,
 * contractors see site progress, all others see risk/approval items first.
 */
function getRoleOrderingInstruction(role: UserRole): string {
  switch (role) {
    case 'architect':
    case 'bep':
    case 'town_planner':
    case 'energy_professional':
    case 'fire_engineer':
      return 'Order role-relevant items first: compliance status, municipal submissions, and design approvals should appear before other items in each section.';
    case 'quantity_surveyor':
      return 'Order role-relevant items first: payment milestones, cost variances, and financial status should appear before other items in each section.';
    case 'contractor':
    case 'site_manager':
    case 'subcontractor':
      return 'Order role-relevant items first: site progress, programme status, and construction milestones should appear before other items in each section.';
    default:
      return 'Order role-relevant items first: risks, approval items, and pending actions should appear before other items in each section.';
  }
}

/**
 * Builds the system prompt for status summary generation.
 * Instructs the AI to produce a structured 4-section summary grounded in project data.
 */
function buildStatusSystemPrompt(
  context: CopilotProjectContext,
  role: UserRole,
  includeFinancials: boolean
): string {
  const roleOrdering = getRoleOrderingInstruction(role);
  const financialInstruction = includeFinancials
    ? 'Include a financial status subsection covering budget, payments, and cost figures where available in the project data.'
    : 'Do NOT include any financial data, budget figures, payment information, or cost references in the summary. Completely exclude all monetary/financial information.';

  return `You are Wingman, the AI assistant for Architex OS. Generate a structured project status summary.

INSTRUCTIONS:
- Produce a natural-language summary of NO MORE than 800 words total across all 4 sections.
- Use ONLY verifiable data points from the project context provided below â€” never fabricate facts.
- Include specific document names, team member names, and calendar dates in ISO 8601 format (YYYY-MM-DD).
- ${roleOrdering}
- ${financialInstruction}
- Use advisory language throughout ("indicates", "appears", "consider").

OUTPUT FORMAT â€” Return EXACTLY this JSON structure (no markdown, no code fences):
{
  "overview": "Section covering: current lifecycle phase, days in current phase, and overall project health.",
  "risks": "Section covering: all active risks with priority medium or above, overdue actions past their due dates.",
  "upcoming": "Section covering: next 3 upcoming milestones by date, and recent team activity from the last 7 days.",
  "blockers": "Section covering: items blocking progress, unresolved dependencies, and critical path concerns."
}

Each section should be 100â€“250 words of natural prose. Include verifiable data points (names, dates, document titles) in every section.

PROJECT CONTEXT:
${JSON.stringify(context)}`;
}

/**
 * Computes a simple hash of the relevant context fields to detect changes.
 * Used for the "no-change since last summary" detection.
 * Uses a fast non-cryptographic hash suitable for browser environments.
 */
function computeContextHash(context: CopilotProjectContext): string {
  const relevantData = {
    phase: context.passport.currentPhase,
    riskLevel: context.passport.riskLevel,
    keyDates: context.passport.keyDates,
    teamMembers: context.passport.teamMembers,
    documents: context.documentRegister.map(d => ({ id: d.id, status: d.status, updatedAt: d.updatedAt })),
    actions: context.pendingActions.map(a => ({ id: a.id, priority: a.priority, dueDate: a.dueDate })),
    audit: context.auditTrail.slice(0, 5).map(e => e.timestamp),
  };
  const str = JSON.stringify(relevantData);
  // Simple FNV-1a-inspired hash for change detection (not cryptographic)
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0') + str.length.toString(16).padStart(8, '0');
}

/**
 * Parses the AI response into the 4 structured sections of a StatusSummary.
 * Falls back to distributing raw text across sections if JSON parsing fails.
 */
function parseStatusResponse(rawResponse: string): { overview: string; risks: string; upcoming: string; blockers: string } {
  // Try to parse as JSON first
  try {
    // Strip any potential markdown fences
    const cleaned = rawResponse
      .replace(/^```json?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
    const parsed = JSON.parse(cleaned);

    if (parsed.overview && parsed.risks && parsed.upcoming && parsed.blockers) {
      return {
        overview: String(parsed.overview).slice(0, 3000),
        risks: String(parsed.risks).slice(0, 3000),
        upcoming: String(parsed.upcoming).slice(0, 3000),
        blockers: String(parsed.blockers).slice(0, 3000),
      };
    }
  } catch {
    // JSON parse failed â€” fall through to text splitting
  }

  // Fallback: try to split by section headers
  const sections = rawResponse.split(/(?:^|\n)(?:#{1,3}\s*)?(?:overview|risks|upcoming|blockers)\s*[:\n]/i);
  if (sections.length >= 5) {
    return {
      overview: sections[1]?.trim().slice(0, 3000) || '',
      risks: sections[2]?.trim().slice(0, 3000) || '',
      upcoming: sections[3]?.trim().slice(0, 3000) || '',
      blockers: sections[4]?.trim().slice(0, 3000) || '',
    };
  }

  // Last fallback: distribute text evenly across sections
  const words = rawResponse.split(/\s+/);
  const quarter = Math.ceil(words.length / 4);
  return {
    overview: words.slice(0, quarter).join(' ').slice(0, 3000),
    risks: words.slice(quarter, quarter * 2).join(' ').slice(0, 3000),
    upcoming: words.slice(quarter * 2, quarter * 3).join(' ').slice(0, 3000),
    blockers: words.slice(quarter * 3).join(' ').slice(0, 3000),
  };
}

/**
 * Generates a structured project status summary using AI, grounded in project context.
 *
 * Flow:
 * 1. Check for sufficient project data (â‰¥2 project records)
 * 2. Detect no-change since last summary (return diff only if unchanged)
 * 3. Check if user has summarise_financials capability
 * 4. Build system prompt with role-tailored ordering instructions
 * 5. Call AI with 10-second timeout enforcement
 * 6. Parse response into 4 structured sections
 * 7. Create provenance record
 * 8. Return StatusSummary
 *
 * @requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8
 */
export async function summariseStatus(params: SummariseStatusParams): Promise<StatusSummary> {
  const {
    userId,
    projectId,
    role,
    context,
    previousSummary,
    callAI,
  } = params;

  // 1. Check for sufficient project data (Requirement 7.7)
  // At least 2 project records should exist (documents or actions)
  const totalRecords = context.documentRegister.length + context.pendingActions.length;
  if (totalRecords < 2 && context.auditTrail.length === 0) {
    return {
      overview: 'Insufficient project data to generate a meaningful summary. Please ensure the project has at least a few documents, actions, or audit records before requesting a status summary.',
      risks: '',
      upcoming: '',
      blockers: '',
      provenanceId: '',
      unchangedSinceLastSummary: false,
    };
  }

  // 2. Detect no-change since last summary (Requirement 7.6)
  const currentHash = computeContextHash(context);
  if (previousSummary && !previousSummary.unchangedSinceLastSummary) {
    // Compare context hash â€” if previous summary has same hash, context hasn't changed
    const prevHash = (previousSummary as StatusSummary & { _contextHash?: string })._contextHash;
    if (prevHash && prevHash === currentHash) {
      return {
        ...previousSummary,
        unchangedSinceLastSummary: true,
      };
    }
  }

  // 3. Check if user has summarise_financials capability (Requirement 7.2)
  const userCapabilities = getCapabilitiesForRole(role);
  const includeFinancials = userCapabilities.includes('summarise_financials');

  // 4. Build system prompt with role-tailored ordering
  const systemPrompt = buildStatusSystemPrompt(context, role, includeFinancials);
  const userPrompt = `Generate a project status summary for project "${context.passport.projectName}" (currently in ${context.passport.currentPhase} phase). The user's role is ${role}.`;

  // 5. Call AI with 10-second timeout enforcement (Requirement 7.8)
  let rawResponse: string;
  try {
    const aiCall = callAI ?? callGeminiProxy;

    const aiPromise = aiCall(systemPrompt, userPrompt);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Status summary generation timed out (10s limit).')), STATUS_TIMEOUT_MS);
    });

    rawResponse = await Promise.race([aiPromise, timeoutPromise]);
  } catch (err) {
    // Timeout or AI error â€” throw meaningful error
    const message = err instanceof Error ? err.message : 'AI service unavailable.';
    throw new Error(`Failed to generate status summary: ${message}`);
  }

  if (!rawResponse || rawResponse.trim().length === 0) {
    throw new Error('Failed to generate status summary: AI returned empty response.');
  }

  // 6. Parse response into 4 structured sections
  const sections = parseStatusResponse(rawResponse);

  // 7. Create provenance record
  const now = new Date().toISOString();
  const messageId = `status_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  let provenanceId = '';
  try {
    const provenanceRecord = await createProvenanceRecord({
      projectId,
      threadId: '',
      messageId,
      modelId: GEMINI_MODEL_ID,
      generatedAt: now,
      acceptedBy: userId,
      acceptedAt: now,
      source: 'internal',
      capability: 'summarise_status',
      confidence: null,
    });
    provenanceId = provenanceRecord.id;
  } catch {
    // Provenance creation failure â€” proceed with empty provenanceId
    provenanceId = '';
  }

  // 8. Return StatusSummary with context hash for future diff detection
  const result: StatusSummary & { _contextHash?: string } = {
    overview: sections.overview,
    risks: sections.risks,
    upcoming: sections.upcoming,
    blockers: sections.blockers,
    provenanceId,
    unchangedSinceLastSummary: false,
    _contextHash: currentHash,
  };

  return result;
}


// â”€â”€â”€ Narrative Generation Handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Parameters for the generateNarrative capability handler.
 * Follows the same dependency-injection pattern as draftRfi.
 */
export interface GenerateNarrativeParams {
  userId: string;
  projectId: string;
  input: NarrativeInput;
  context: CopilotProjectContext;
  /** Optional AI call function (testing/mocking support) */
  callAI?: (systemPrompt: string, userPrompt: string) => Promise<string>;
}

/** Narrative generation timeout in milliseconds (30 seconds). */
const NARRATIVE_TIMEOUT_MS = 30_000;

// â”€â”€â”€ Readability Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Counts the approximate number of syllables in a single word.
 * Uses a heuristic approach: counts vowel groups, adjusting for silent-e
 * and common patterns. Returns at minimum 1 syllable per word.
 */
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length === 0) return 0;
  if (w.length <= 3) return 1;

  let count = 0;
  const vowels = 'aeiouy';
  let prevIsVowel = false;

  for (let i = 0; i < w.length; i++) {
    const isVowel = vowels.includes(w[i]);
    if (isVowel && !prevIsVowel) {
      count++;
    }
    prevIsVowel = isVowel;
  }

  // Adjust for silent-e at end of word
  if (w.endsWith('e') && count > 1) {
    count--;
  }

  // Adjust for common endings that add syllables
  if (w.endsWith('le') && w.length > 2 && !vowels.includes(w[w.length - 3])) {
    count++;
  }

  return Math.max(count, 1);
}

/**
 * Calculates the Flesch-Kincaid grade level for a given text.
 * Formula: 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
 *
 * Returns a grade level number (e.g. 8.2 = 8th grade reading level).
 */
export function calculateReadabilityGrade(text: string): number {
  // Count words
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  if (wordCount === 0) return 0;

  // Count sentences (split by . ! ?)
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const sentenceCount = Math.max(sentences.length, 1);

  // Count total syllables
  let totalSyllables = 0;
  for (const word of words) {
    totalSyllables += countSyllables(word);
  }

  // Flesch-Kincaid grade level formula
  const grade = 0.39 * (wordCount / sentenceCount) + 11.8 * (totalSyllables / wordCount) - 15.59;

  // Round to 1 decimal place and clamp to reasonable range
  return Math.round(Math.max(0, grade) * 10) / 10;
}

/**
 * Counts the number of paragraphs in text (separated by double newlines or single newlines
 * with blank lines between them). Minimum 1 paragraph if text is non-empty.
 */
function countParagraphs(text: string): number {
  if (!text.trim()) return 0;
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  return Math.max(paragraphs.length, 1);
}

/**
 * Counts words in text (splitting on whitespace).
 */
function countWords(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

// â”€â”€â”€ Narrative Prompt Builders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Maps narrative type enum values to human-readable labels.
 */
const NARRATIVE_TYPE_LABELS: Record<string, string> = {
  approach_statement: 'Approach Statement',
  methodology: 'Methodology',
  team_capability: 'Team Capability Statement',
  project_understanding: 'Project Understanding',
  fee_justification: 'Fee Justification',
};

/**
 * Builds the system prompt for narrative generation.
 * Instructs the AI to use SA built environment vocabulary and ground in project context.
 */
function buildNarrativeSystemPrompt(
  input: NarrativeInput,
  context: CopilotProjectContext
): string {
  const narrativeLabel = NARRATIVE_TYPE_LABELS[input.narrativeType] || input.narrativeType;

  return `You are a professional proposal writer for the South African built environment. You are writing a "${narrativeLabel}" section for a professional services proposal.

Target Audience: ${input.targetAudience}
Tone: ${input.tone}

CRITICAL RULES:
- Produce between 200 and 800 words.
- Structure the content in 2 to 6 paragraphs (separated by blank lines).
- Use vocabulary and phrasing consistent with South African built environment procurement documentation.
- Reference CIDB (Construction Industry Development Board), SACAP (South African Council for the Architectural Profession), and ECSA (Engineering Council of South Africa) terminology where relevant to the narrative type.
- Ground the narrative in the project context provided below. Reference actual project details: project name, phase, team members, scope.
- NEVER fabricate firm-specific claims (awards, project count, revenue, certifications) unless that data is explicitly provided in the context.
- Do NOT make up team member names, qualifications, or experience that is not present in the context.
- Write in a professional, ${input.tone} register appropriate for a ${input.targetAudience} audience.
- Output ONLY the narrative text â€” no headers, labels, metadata, or preamble.

Project Context:
- Project Name: ${context.passport.projectName}
- Current Phase: ${context.passport.currentPhase}
- Risk Level: ${context.passport.riskLevel}
- Lead Professional: ${context.passport.leadProfessional || 'Not specified'}
- Team Composition: ${context.passport.teamMembers.length > 0 ? context.passport.teamMembers.map(m => `${m.name} (${m.role})`).join(', ') : 'Not specified'}
- Key Dates: ${context.passport.keyDates.length > 0 ? context.passport.keyDates.map(d => `${d.label}: ${d.date}`).join(', ') : 'Not specified'}
- Recent Documents: ${context.documentRegister.slice(0, 5).map(d => `${d.title} [${d.status}]`).join(', ') || 'None available'}
- Pending Actions: ${context.pendingActions.slice(0, 5).map(a => a.title).join(', ') || 'None'}

User Role: ${context.userContext.role}
User Name: ${context.userContext.displayName || 'Not specified'}`;
}

/**
 * Builds the user prompt for narrative generation.
 */
function buildNarrativeUserPrompt(input: NarrativeInput): string {
  const narrativeLabel = NARRATIVE_TYPE_LABELS[input.narrativeType] || input.narrativeType;
  return `Generate a "${narrativeLabel}" narrative section for a professional proposal. The section should be compelling, grounded in the project context, and suitable for a ${input.targetAudience} audience with a ${input.tone} tone.`;
}

/**
 * Generates a proposal narrative section using AI, grounded in project context
 * and firm profile data.
 *
 * Flow:
 * 1. Validate input via NarrativeInputSchema
 * 2. Build system prompt with narrative type, audience, tone, and project context
 * 3. Call AI with 30-second timeout
 * 4. Count words and paragraphs from response
 * 5. Calculate Flesch-Kincaid readability grade
 * 6. Create provenance record
 * 7. Return NarrativeOutput with content, wordCount, paragraphCount, readabilityGrade, provenanceId
 *
 * @requirements 9.1, 9.2, 9.3, 9.5, 9.6, 9.7
 */
export async function generateNarrative(params: GenerateNarrativeParams): Promise<NarrativeOutput> {
  const {
    userId,
    projectId,
    input,
    context,
    callAI,
  } = params;

  // 1. Validate input via Zod schema
  const validation = NarrativeInputSchema.safeParse(input);
  if (!validation.success) {
    const firstError = validation.error.errors[0]?.message ?? 'Invalid narrative input.';
    throw new Error(`Validation failed: ${firstError}`);
  }

  const validatedInput = validation.data as NarrativeInput;

  // 1b. Check for insufficient project context (no project brief data available)
  // Requirement 9.7: return error if no project brief data is available
  const hasProjectData = context.passport.projectName.trim().length > 0;
  if (!hasProjectData) {
    throw new Error(
      'Narrative generation failed: insufficient project context. No project brief data is available to ground the narrative.'
    );
  }

  // 2. Build system and user prompts
  const systemPrompt = buildNarrativeSystemPrompt(validatedInput, context);
  const userPrompt = buildNarrativeUserPrompt(validatedInput);

  // 3. Call AI with 30-second timeout
  let rawResponse: string;
  try {
    const aiCall = callAI ?? callGeminiProxy;

    const aiPromise = aiCall(systemPrompt, userPrompt);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Narrative generation timed out after 30 seconds.')), NARRATIVE_TIMEOUT_MS);
    });

    rawResponse = await Promise.race([aiPromise, timeoutPromise]);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI service error.';
    if (message.includes('timed out')) {
      throw new Error('Narrative generation failed: timeout exceeding 30 seconds.');
    }
    throw new Error(`Narrative generation failed: ${message}`);
  }

  if (!rawResponse || !rawResponse.trim()) {
    throw new Error('Narrative generation failed: AI returned an empty response.');
  }

  const content = rawResponse.trim();

  // 4. Count words and paragraphs
  const wordCount = countWords(content);
  const paragraphCount = countParagraphs(content);

  // 5. Calculate Flesch-Kincaid readability grade
  const readabilityGrade = calculateReadabilityGrade(content);

  // 6. Create provenance record
  const now = new Date().toISOString();
  const messageId = `narrative_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  let provenanceId = '';
  try {
    const provenanceRecord = await createProvenanceRecord({
      projectId,
      threadId: '', // Narrative generation may not have a thread context
      messageId,
      modelId: GEMINI_MODEL_ID,
      generatedAt: now,
      acceptedBy: userId,
      acceptedAt: now,
      source: 'internal',
      capability: 'generate_narrative',
      confidence: null,
    });
    provenanceId = provenanceRecord.id;
  } catch {
    // Provenance creation failure â€” proceed with empty provenanceId
    provenanceId = '';
  }

  // 7. Return NarrativeOutput
  return {
    content,
    wordCount,
    paragraphCount,
    readabilityGrade,
    provenanceId,
  };
}


// â”€â”€â”€ Flag Compliance Gaps Handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Maximum compliance gaps returned per invocation. */
const MAX_COMPLIANCE_GAPS = 50;

/** Timeout for AI compliance analysis call (10 seconds). */
const COMPLIANCE_AI_TIMEOUT_MS = 10_000;

/** Severity ordering for compliance gap sorting (lower = higher priority). */
const SEVERITY_ORDER: Record<ComplianceGapSeverity, number> = {
  critical: 0,
  warning: 1,
  informational: 2,
};

/** Valid compliance gap categories for parsing validation. */
const VALID_GAP_CATEGORIES: Set<string> = new Set([
  'missing_submission',
  'expired_certification',
  'phase_prerequisite',
  'regulatory_flag',
]);

/** Valid compliance gap severity levels for parsing validation. */
const VALID_GAP_SEVERITIES: Set<string> = new Set([
  'critical',
  'warning',
  'informational',
]);

/**
 * Parameters for the flagCompliance capability handler.
 */
export interface FlagComplianceParams {
  userId: string;
  projectId: string;
  context: CopilotProjectContext;
  /** Optional AI call function (testing/mocking support) */
  callAI?: (systemPrompt: string, userPrompt: string) => Promise<string>;
}

/**
 * Builds the system prompt for compliance gap analysis.
 * Instructs the AI to analyse project data and identify compliance gaps
 * using advisory language and referencing SANS standards.
 */
function buildComplianceSystemPrompt(): string {
  return `You are a compliance advisory assistant for the Architex OS built environment platform. Your task is to analyse project compliance state and identify gaps that may need attention.

IMPORTANT RULES:
- Use ADVISORY language throughout: "this check indicates", "consider addressing", "it appears that"
- NEVER present results as certification, official assessment, or professional sign-off
- Reference specific SANS standards by number (e.g., SANS 10400-K, SANS 10400-N, SANS 10400-T, SANS 10400-C, SANS 10400-XA) where relevant
- Do NOT reproduce copyrighted SANS clause text â€” only reference standard numbers and general subject area
- Each gap must have a suggested remediation action

CATEGORIES (use exactly these values):
- missing_submission: Required document not uploaded per current lifecycle phase requirements
- expired_certification: Validity date has passed the current system date
- phase_prerequisite: Compliance item required before next phase transition
- regulatory_flag: SANS standard or regulation not addressed for current project scope

SEVERITY LEVELS (use exactly these values):
- critical: Blocking progress or exposing significant liability
- warning: Needs attention soon, may become a blocker
- informational: Advisory item for awareness

OUTPUT FORMAT:
Return a JSON array of gap objects. Each object must have:
{
  "category": "<one of the 4 categories above>",
  "severity": "<critical|warning|informational>",
  "title": "<short descriptive title>",
  "detail": "<explanation using advisory language>",
  "sansReference": "<e.g. 'SANS 10400-K' or null if not applicable>",
  "suggestedRemediation": "<actionable next step in advisory language>",
  "resolved": <true if already addressed, false otherwise>
}

Return ONLY the JSON array (no markdown fencing, no preamble). If no gaps are found, return an empty array: []
Maximum 50 items.`;
}

/**
 * Builds the user prompt with project context for compliance analysis.
 */
function buildComplianceUserPrompt(context: CopilotProjectContext): string {
  const parts: string[] = [
    `Analyse the following project state for compliance gaps:\n`,
    `PROJECT PHASE: ${context.passport.currentPhase}`,
    `RISK LEVEL: ${context.passport.riskLevel}`,
    `PROJECT: ${context.passport.projectName}`,
    `LEAD PROFESSIONAL: ${context.passport.leadProfessional || 'Not assigned'}`,
  ];

  // Key dates
  if (context.passport.keyDates.length > 0) {
    parts.push(`\nKEY DATES:`);
    for (const kd of context.passport.keyDates) {
      parts.push(`  - ${kd.label}: ${kd.date}`);
    }
  }

  // Document register summary
  if (context.documentRegister.length > 0) {
    parts.push(`\nDOCUMENT REGISTER (${context.documentRegister.length} items):`);
    for (const doc of context.documentRegister.slice(0, 20)) {
      parts.push(`  - [${doc.status}] ${doc.title} (type: ${doc.type}, updated: ${doc.updatedAt})`);
    }
  } else {
    parts.push(`\nDOCUMENT REGISTER: No documents in register.`);
  }

  // Pending actions
  if (context.pendingActions.length > 0) {
    parts.push(`\nPENDING ACTIONS (${context.pendingActions.length} items):`);
    for (const action of context.pendingActions.slice(0, 15)) {
      parts.push(`  - [${action.priority}] ${action.title} (type: ${action.type}, due: ${action.dueDate || 'no date'})`);
    }
  }

  // Audit trail (recent activity)
  if (context.auditTrail.length > 0) {
    parts.push(`\nRECENT AUDIT TRAIL (${context.auditTrail.length} entries):`);
    for (const entry of context.auditTrail.slice(0, 10)) {
      parts.push(`  - ${entry.action} by ${entry.actor} at ${entry.timestamp}: ${entry.detail}`);
    }
  }

  // Unavailable sources
  if (context.unavailableSources.length > 0) {
    parts.push(`\nUNAVAILABLE DATA SOURCES: ${context.unavailableSources.join(', ')}`);
  }

  return parts.join('\n');
}

/**
 * Parses the AI response into validated ComplianceGap objects.
 * Handles malformed JSON gracefully by returning empty array.
 */
function parseComplianceGaps(rawResponse: string): ComplianceGap[] {
  // Strip potential markdown code fencing
  let cleaned = rawResponse.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const gaps: ComplianceGap[] = [];
  const now = new Date().toISOString();

  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;

    const obj = item as Record<string, unknown>;

    // Validate required fields
    const category = String(obj.category ?? '');
    const severity = String(obj.severity ?? '');
    const title = String(obj.title ?? '');
    const detail = String(obj.detail ?? '');
    const suggestedRemediation = String(obj.suggestedRemediation ?? '');

    if (!VALID_GAP_CATEGORIES.has(category)) continue;
    if (!VALID_GAP_SEVERITIES.has(severity)) continue;
    if (!title || !detail || !suggestedRemediation) continue;

    const sansReference = obj.sansReference && typeof obj.sansReference === 'string'
      ? obj.sansReference
      : null;

    const resolved = typeof obj.resolved === 'boolean' ? obj.resolved : false;

    gaps.push({
      id: `gap_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      category: category as ComplianceGapCategory,
      severity: severity as ComplianceGapSeverity,
      title,
      detail,
      sansReference,
      suggestedRemediation,
      resolved,
      detectedAt: now,
    });
  }

  return gaps;
}

/**
 * Sorts compliance gaps by severity (critical â†’ warning â†’ informational),
 * with resolved items always sorted after all unresolved items.
 */
function sortComplianceGaps(gaps: ComplianceGap[]): ComplianceGap[] {
  return [...gaps].sort((a, b) => {
    // Resolved items go last
    if (a.resolved !== b.resolved) {
      return a.resolved ? 1 : -1;
    }

    // Within same resolved status, sort by severity
    const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severityDiff !== 0) return severityDiff;

    // Within same severity, sort by most recent detection date first
    return b.detectedAt.localeCompare(a.detectedAt);
  });
}

/**
 * Determines whether the project has sufficient compliance data to analyse.
 * Returns true if there are compliance records, documents, or readiness data available.
 */
function hasComplianceData(context: CopilotProjectContext): boolean {
  const hasDocuments = context.documentRegister.length > 0;
  const hasActions = context.pendingActions.length > 0;
  const hasAudit = context.auditTrail.length > 0;

  return hasDocuments || hasActions || hasAudit;
}

/**
 * Checks if compliance-relevant data sources are unavailable due to errors.
 * Returns the list of unavailable sources that are critical for compliance analysis.
 */
function getComplianceDataSourceErrors(context: CopilotProjectContext): string[] {
  const criticalSources = ['complianceRecords', 'readinessChecks', 'documentRegister'];
  return context.unavailableSources.filter(source => criticalSources.includes(source));
}

/**
 * Wraps an AI call with a timeout. Rejects if the call exceeds the specified duration.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`AI call timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

/**
 * Flags compliance gaps for a project using AI analysis of project context.
 *
 * Analyses compliance records, readiness checks, document register, and lifecycle phase
 * to identify gaps categorised as: missing_submission, expired_certification,
 * phase_prerequisite, or regulatory_flag.
 *
 * Flow:
 * 1. Check for data source errors â†’ return error indication if critical sources unavailable
 * 2. Check if project has sufficient compliance data â†’ return advisory message if empty
 * 3. Build system prompt with compliance analysis instructions
 * 4. Build user prompt with project context (phase, documents, readiness state)
 * 5. Call AI with 10-second timeout
 * 6. Parse response into ComplianceGap[] array
 * 7. Sort by severity (criticalâ†’warningâ†’informational), resolved items last
 * 8. Limit to 50 items
 * 9. Create provenance record
 * 10. Return ComplianceGapReport
 *
 * @requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8
 */
export async function flagCompliance(params: FlagComplianceParams): Promise<ComplianceGapReport> {
  const {
    userId,
    projectId,
    context,
    callAI,
  } = params;

  // 1. Check for data source errors
  const dataSourceErrors = getComplianceDataSourceErrors(context);
  if (dataSourceErrors.length > 0) {
    // Requirement 8.8: return error indication specifying which sources unavailable
    const now = new Date().toISOString();
    let provenanceId = '';
    try {
      const provenanceRecord = await createProvenanceRecord({
        projectId,
        threadId: '',
        messageId: `compliance_error_${Date.now()}`,
        modelId: GEMINI_MODEL_ID,
        generatedAt: now,
        acceptedBy: userId,
        acceptedAt: now,
        source: 'internal',
        capability: 'flag_compliance',
        confidence: null,
      });
      provenanceId = provenanceRecord.id;
    } catch {
      provenanceId = '';
    }

    return {
      gaps: [],
      advisoryMessage: `Unable to complete compliance analysis. The following data sources were unavailable: ${dataSourceErrors.join(', ')}. Consider retrying when these sources are accessible.`,
      provenanceId,
    };
  }

  // 2. Check if project has sufficient compliance data
  if (!hasComplianceData(context)) {
    // Requirement 8.7: return empty gaps with advisory message
    const now = new Date().toISOString();
    let provenanceId = '';
    try {
      const provenanceRecord = await createProvenanceRecord({
        projectId,
        threadId: '',
        messageId: `compliance_empty_${Date.now()}`,
        modelId: GEMINI_MODEL_ID,
        generatedAt: now,
        acceptedBy: userId,
        acceptedAt: now,
        source: 'internal',
        capability: 'flag_compliance',
        confidence: null,
      });
      provenanceId = provenanceRecord.id;
    } catch {
      provenanceId = '';
    }

    return {
      gaps: [],
      advisoryMessage: 'No compliance data is currently available for analysis. This check indicates that no compliance records, documents, or readiness check results are present for this project. Consider uploading relevant documents to enable compliance gap detection.',
      provenanceId,
    };
  }

  // 3. Build system prompt
  const systemPrompt = buildComplianceSystemPrompt();

  // 4. Build user prompt with project context
  const userPrompt = buildComplianceUserPrompt(context);

  // 5. Call AI with 10-second timeout
  let rawResponse: string;
  try {
    const aiCall = callAI ?? callGeminiProxy;
    rawResponse = await withTimeout(
      aiCall(systemPrompt, userPrompt),
      COMPLIANCE_AI_TIMEOUT_MS
    );
  } catch {
    // AI call failed or timed out â€” return error indication
    const now = new Date().toISOString();
    let provenanceId = '';
    try {
      const provenanceRecord = await createProvenanceRecord({
        projectId,
        threadId: '',
        messageId: `compliance_timeout_${Date.now()}`,
        modelId: GEMINI_MODEL_ID,
        generatedAt: now,
        acceptedBy: userId,
        acceptedAt: now,
        source: 'internal',
        capability: 'flag_compliance',
        confidence: null,
      });
      provenanceId = provenanceRecord.id;
    } catch {
      provenanceId = '';
    }

    return {
      gaps: [],
      advisoryMessage: 'The compliance analysis could not be completed within the allowed time. Consider retrying the request.',
      provenanceId,
    };
  }

  // 6. Parse AI response into ComplianceGap[] array
  const gaps = parseComplianceGaps(rawResponse);

  // 7. Sort by severity (criticalâ†’warningâ†’informational), resolved items last
  const sortedGaps = sortComplianceGaps(gaps);

  // 8. Limit to 50 items
  const limitedGaps = sortedGaps.slice(0, MAX_COMPLIANCE_GAPS);

  // 9. Create provenance record
  const now = new Date().toISOString();
  const messageId = `compliance_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  let provenanceId = '';
  try {
    const provenanceRecord = await createProvenanceRecord({
      projectId,
      threadId: '',
      messageId,
      modelId: GEMINI_MODEL_ID,
      generatedAt: now,
      acceptedBy: userId,
      acceptedAt: now,
      source: 'internal',
      capability: 'flag_compliance',
      confidence: null,
    });
    provenanceId = provenanceRecord.id;
  } catch {
    provenanceId = '';
  }

  // 10. Return ComplianceGapReport
  return {
    gaps: limitedGaps,
    advisoryMessage: null,
    provenanceId,
  };
}


// â”€â”€â”€ Explain Clause â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Timeout duration for clause explanation requests (15 seconds). */
const CLAUSE_EXPLANATION_TIMEOUT_MS = 15_000;

/** Legal disclaimer appended to every clause explanation. */
const CLAUSE_DISCLAIMER =
  'This is AI-generated guidance and does not constitute legal advice. Consult a legal professional for binding interpretations.';

/**
 * Explains a contract clause in plain language.
 *
 * Generates a 150â€“600 word explanation covering:
 * - What the clause means
 * - Who it applies to
 * - What obligations it creates
 * - Common practical implications
 * - How it interacts with related clauses
 *
 * Enforces:
 * - Max 15 consecutive copyrighted words (JBCC, NEC, FIDIC, GCC)
 * - Legal disclaimer always appended
 * - 15-second timeout
 * - Contextualisation with project contract if available
 * - Clarification request if clause/contract type unidentifiable
 *
 * @requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8
 */
export async function explainClause(
  projectId: string,
  userId: string,
  input: ClauseExplanationInput,
  context?: CopilotProjectContext | null
): Promise<ClauseExplanationOutput> {
  // 1. Validate input using schema
  const validation = ClauseExplanationInputSchema.safeParse(input);
  if (!validation.success) {
    const firstError = validation.error.errors[0]?.message ?? 'Invalid clause explanation input.';
    throw new Error(firstError);
  }

  const { clauseText, contractType } = validation.data;

  // 2. Determine if we can contextualise with project contract info
  let contextualised = false;
  let projectContractInfo = '';

  if (context?.passport) {
    // Check if the project has contract-related information we can use
    const passport = context.passport;
    if (passport.projectName) {
      projectContractInfo += `Project: ${passport.projectName}. `;
      projectContractInfo += `Phase: ${passport.currentPhase}. `;
      if (passport.teamMembers && passport.teamMembers.length > 0) {
        const parties = passport.teamMembers.map((m) => `${m.name} (${m.role})`).join(', ');
        projectContractInfo += `Parties: ${parties}. `;
      }
      if (passport.keyDates && passport.keyDates.length > 0) {
        const dates = passport.keyDates.map((d) => `${d.label}: ${d.date}`).join(', ');
        projectContractInfo += `Key dates: ${dates}. `;
      }
      contextualised = true;
    }
  }

  // 3. Build the system prompt for clause explanation
  const contractTypeLabel = contractType ?? 'unspecified';
  let systemPrompt = `You are a built-environment contract advisor for Architex OS. Your task is to explain a contract clause in plain language.

Instructions:
- Explain what the clause means in practical terms.
- Identify who the clause applies to (employer, contractor, principal agent, etc.).
- Describe the obligations it creates for each party.
- Explain common practical implications for built environment professionals.
- Note how it interacts with related clauses where relevant.
- Use advisory language only â€” never state anything as legally binding.
- Never reproduce more than 15 consecutive words from copyrighted contract forms (JBCC, NEC, FIDIC, GCC). Paraphrase and explain the intent instead.
- Your explanation must be between 150 and 600 words.
- If you cannot identify the clause or determine the contract type from the input, respond with a clarification request explaining what additional information you need (e.g., contract type, edition, or clause number).

Contract type: ${contractTypeLabel}
`;

  if (contextualised && projectContractInfo) {
    systemPrompt += `\nProject context for personalised explanation:\n${projectContractInfo}\nContextualise the explanation using the project parties and dates where relevant.\n`;
  }

  const userPrompt = `Please explain the following contract clause:\n\n"${clauseText}"`;

  // 4. Call Gemini with 15-second timeout
  let rawResponse: string;
  try {
    rawResponse = await Promise.race([
      callGeminiProxy(systemPrompt, userPrompt),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Clause explanation timed out after 15 seconds.')), CLAUSE_EXPLANATION_TIMEOUT_MS)
      ),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI service unavailable.';
    throw new Error(message);
  }

  if (!rawResponse || rawResponse.trim().length === 0) {
    throw new Error('The AI service returned an empty response. Please try again.');
  }

  // 5. Check if the response is a clarification request
  const clarificationIndicators = [
    'could you please clarify',
    'please specify',
    'i need more information',
    'which contract type',
    'could you provide',
    'please provide',
    'unable to identify',
    'cannot determine',
    'which edition',
    'what contract form',
  ];
  const lowerResponse = rawResponse.toLowerCase();
  const isClarificationRequest = clarificationIndicators.some((indicator) =>
    lowerResponse.includes(indicator)
  );

  if (isClarificationRequest) {
    // Return clarification response â€” still include disclaimer and provenance
    const now = new Date().toISOString();
    const messageId = `clause_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    let provenanceId = '';
    try {
      const provenanceRecord = await createProvenanceRecord({
        projectId,
        threadId: '',
        messageId,
        modelId: GEMINI_MODEL_ID,
        generatedAt: now,
        acceptedBy: userId,
        acceptedAt: now,
        source: 'internal',
        capability: 'explain_clause',
        confidence: null,
      });
      provenanceId = provenanceRecord.id;
    } catch {
      provenanceId = '';
    }

    return {
      explanation: rawResponse.trim(),
      disclaimer: CLAUSE_DISCLAIMER,
      contextualised: false,
      provenanceId,
    };
  }

  // 6. Check copyright compliance â€” if violation found, regenerate with stricter instruction
  let finalResponse = rawResponse;
  const copyrightCheck = checkCopyrightCompliance(finalResponse);

  if (!copyrightCheck.compliant) {
    // Attempt regeneration with stricter instruction
    const strictPrompt = systemPrompt + '\n\nCRITICAL: Your previous response contained sequences that appear to be verbatim contract text. You MUST paraphrase all contract language. Do not quote more than 15 consecutive words from any contract form.';

    try {
      const regenerated = await Promise.race([
        callGeminiProxy(strictPrompt, userPrompt),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Regeneration timed out.')), CLAUSE_EXPLANATION_TIMEOUT_MS)
        ),
      ]);

      if (regenerated && regenerated.trim().length > 0) {
        const recheck = checkCopyrightCompliance(regenerated);
        if (recheck.compliant) {
          finalResponse = regenerated;
        } else {
          // Strip violating sequences as a last resort
          finalResponse = stripCopyrightViolations(finalResponse, copyrightCheck.violations);
        }
      }
    } catch {
      // If regeneration fails, strip violations from original
      finalResponse = stripCopyrightViolations(finalResponse, copyrightCheck.violations);
    }
  }

  // 7. Create provenance record
  const now = new Date().toISOString();
  const messageId = `clause_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  let provenanceId = '';
  try {
    const provenanceRecord = await createProvenanceRecord({
      projectId,
      threadId: '',
      messageId,
      modelId: GEMINI_MODEL_ID,
      generatedAt: now,
      acceptedBy: userId,
      acceptedAt: now,
      source: 'internal',
      capability: 'explain_clause',
      confidence: null,
    });
    provenanceId = provenanceRecord.id;
  } catch {
    provenanceId = '';
  }

  // 8. Return structured output
  return {
    explanation: finalResponse.trim(),
    disclaimer: CLAUSE_DISCLAIMER,
    contextualised,
    provenanceId,
  };
}

/**
 * Strips copyright-violating sequences from content by replacing them
 * with a paraphrasing note.
 */
function stripCopyrightViolations(content: string, violations: string[]): string {
  let result = content;
  for (const violation of violations) {
    if (result.includes(violation)) {
      result = result.replace(violation, '[paraphrased â€” see explanation above]');
    }
  }
  return result;
}


// ─── Finalise / Spine Write-Back Actions ───────────────────────────────────
// Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8
// All spine writes require explicit user confirmation (no auto-writes).
// All spine writes create audit trail entries.
// Handle write failures: retain draft, display error, allow retry.

export interface FinaliseResult {
  success: boolean;
  id?: string;
  ids?: string[];
  error?: string;
}

interface AuditTrailEntry {
  actor: string;
  actionType: string;
  projectId: string;
  sourceId: string;
  timestamp: string;
  detail?: string;
}

/**
 * Writes an audit trail entry to the project's audit_trail collection.
 */
async function writeAuditTrailEntry(entry: AuditTrailEntry): Promise<void> {
  const ref = adminDb.collection(`projects/${entry.projectId}/audit_trail`);
  await ref.add({
    ...entry,
    createdAt: entry.timestamp,
  });
}

/**
 * Finalises an RFI draft — writes to the project's RFI register,
 * creates an inbox action for the addressee, and logs to audit trail.
 *
 * @requirements 13.1, 13.4, 13.5, 13.7
 */
export async function finaliseRfi(params: {
  projectId: string;
  threadId: string;
  messageId: string;
  userId: string;
  rfiData: RFIDraftOutput;
}): Promise<FinaliseResult> {
  const { projectId, threadId, messageId, userId, rfiData } = params;
  const now = new Date().toISOString();

  try {
    // Validate addressed-to is present (requirement 6.7)
    if (!rfiData.addressedTo) {
      return { success: false, error: 'An addressee is required before finalising the RFI.' };
    }

    // Write RFI to register
    const rfisRef = adminDb.collection(`projects/${projectId}/rfis`);
    const rfiDocRef = rfisRef.doc();
    const rfiId = rfiDocRef.id;

    await rfiDocRef.set({
      id: rfiId,
      projectId,
      rfiNumber: rfiData.rfiNumber,
      addressedTo: rfiData.addressedTo,
      subject: rfiData.subject,
      questionBody: rfiData.questionBody,
      references: rfiData.references,
      suggestedDeadline: rfiData.suggestedDeadline,
      status: 'open',
      createdBy: userId,
      provenanceId: rfiData.provenanceId,
      sourceThreadId: threadId,
      sourceMessageId: messageId,
      createdAt: now,
      updatedAt: now,
    });

    // Create inbox action for the addressee (document_request type)
    const inboxRef = adminDb.collection(`projects/${projectId}/inbox_actions`);
    await inboxRef.add({
      type: 'document_request',
      title: `RFI #${rfiData.rfiNumber}: ${rfiData.subject}`,
      assignedTo: rfiData.addressedTo,
      createdBy: userId,
      projectId,
      referenceId: rfiId,
      referenceType: 'rfi',
      priority: 'medium',
      status: 'open',
      dueDate: rfiData.suggestedDeadline,
      createdAt: now,
    });

    // Audit trail entry
    await writeAuditTrailEntry({
      actor: userId,
      actionType: 'copilot.finalise_rfi',
      projectId,
      sourceId: messageId,
      timestamp: now,
      detail: `Finalised RFI #${rfiData.rfiNumber}: ${rfiData.subject}`,
    });

    return { success: true, id: rfiId };
  } catch (error) {
    return {
      success: false,
      error: `Failed to finalise RFI: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Accepts compliance gaps — creates a WorkflowEvent per gap (risk_detected)
 * and surfaces them in the Action Centre.
 *
 * @requirements 13.2, 13.4, 13.5, 13.7
 */
export async function acceptComplianceGaps(params: {
  projectId: string;
  threadId: string;
  messageId: string;
  userId: string;
  gaps: ComplianceGap[];
}): Promise<FinaliseResult> {
  const { projectId, threadId, messageId, userId, gaps } = params;
  const now = new Date().toISOString();

  try {
    const eventIds: string[] = [];
    const eventsRef = adminDb.collection(`projects/${projectId}/workflow_events`);

    for (const gap of gaps) {
      const eventDocRef = eventsRef.doc();
      const eventId = eventDocRef.id;

      await eventDocRef.set({
        id: eventId,
        projectId,
        type: 'risk_detected',
        title: gap.title,
        detail: gap.detail,
        category: gap.category,
        severity: gap.severity,
        sansReference: gap.sansReference,
        suggestedRemediation: gap.suggestedRemediation,
        resolved: gap.resolved,
        sourceThreadId: threadId,
        sourceMessageId: messageId,
        createdBy: userId,
        status: 'open',
        createdAt: now,
      });

      eventIds.push(eventId);
    }

    // Audit trail entry
    await writeAuditTrailEntry({
      actor: userId,
      actionType: 'copilot.accept_compliance_gaps',
      projectId,
      sourceId: messageId,
      timestamp: now,
      detail: `Accepted ${gaps.length} compliance gap(s) as workflow events.`,
    });

    return { success: true, ids: eventIds };
  } catch (error) {
    return {
      success: false,
      error: `Failed to accept compliance gaps: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Exports a status summary — persists as a ProjectRecord (ai_status_summary)
 * in the project's records collection.
 *
 * @requirements 13.3, 13.4, 13.5, 13.7
 */
export async function exportStatusSummary(params: {
  projectId: string;
  threadId: string;
  messageId: string;
  userId: string;
  summary: StatusSummary;
}): Promise<FinaliseResult> {
  const { projectId, threadId, messageId, userId, summary } = params;
  const now = new Date().toISOString();

  try {
    const recordsRef = adminDb.collection(`projects/${projectId}/records`);
    const recordDocRef = recordsRef.doc();
    const recordId = recordDocRef.id;

    await recordDocRef.set({
      id: recordId,
      projectId,
      recordType: 'ai_status_summary',
      overview: summary.overview,
      risks: summary.risks,
      upcoming: summary.upcoming,
      blockers: summary.blockers,
      provenanceId: summary.provenanceId,
      unchangedSinceLastSummary: summary.unchangedSinceLastSummary,
      sourceThreadId: threadId,
      sourceMessageId: messageId,
      createdBy: userId,
      createdAt: now,
    });

    // Audit trail entry
    await writeAuditTrailEntry({
      actor: userId,
      actionType: 'copilot.export_status_summary',
      projectId,
      sourceId: messageId,
      timestamp: now,
      detail: 'Exported AI-generated status summary as project record.',
    });

    return { success: true, id: recordId };
  } catch (error) {
    return {
      success: false,
      error: `Failed to export status summary: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Accepts a narrative — creates a draft document in the project's document register.
 *
 * @requirements 13.3, 13.4, 13.5, 13.7
 */
export async function acceptNarrative(params: {
  projectId: string;
  threadId: string;
  messageId: string;
  userId: string;
  narrative: NarrativeOutput;
}): Promise<FinaliseResult> {
  const { projectId, threadId, messageId, userId, narrative } = params;
  const now = new Date().toISOString();

  try {
    const documentsRef = adminDb.collection(`projects/${projectId}/documents`);
    const docRef = documentsRef.doc();
    const documentId = docRef.id;

    await docRef.set({
      id: documentId,
      projectId,
      title: 'AI-Generated Narrative',
      content: narrative.content,
      status: 'draft',
      documentType: 'narrative',
      wordCount: narrative.wordCount,
      paragraphCount: narrative.paragraphCount,
      readabilityGrade: narrative.readabilityGrade,
      provenanceId: narrative.provenanceId,
      ai_generated: true,
      sourceThreadId: threadId,
      sourceMessageId: messageId,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    // Audit trail entry
    await writeAuditTrailEntry({
      actor: userId,
      actionType: 'copilot.accept_narrative',
      projectId,
      sourceId: messageId,
      timestamp: now,
      detail: `Accepted AI-generated narrative (${narrative.wordCount} words) as draft document.`,
    });

    return { success: true, id: documentId };
  } catch (error) {
    return {
      success: false,
      error: `Failed to accept narrative: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
