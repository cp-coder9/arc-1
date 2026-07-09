/**
 * AI Copilot Workspace — Shared Types
 *
 * Type definitions for the Copilot service layer, provenance system,
 * and BYOAI bridge. Used across CopilotService, ProvenanceService,
 * BYOAIBridgeService, and the CopilotPanel UI.
 *
 * Validates: Requirements 2.1, 2.4, 2.5, 2.6, 2.7, 2.8, 4.2, 5.1, 11.1
 */

import type { UserRole, ProjectAccessRole } from '@/types';
import type { ProjectPhase, Priority, RecordStatus } from '@/services/lifecycleTypes';

// ─── Capability System ─────────────────────────────────────────────────────

export type CopilotCapability =
  | 'draft_rfi'
  | 'summarise_status'
  | 'flag_compliance'
  | 'generate_narrative'
  | 'explain_clause'
  | 'draft_site_instruction'
  | 'summarise_financials'
  | 'flag_risk';

export type CopilotSource = 'internal' | 'external';

export type BYOAIContentType =
  | 'rfi_draft'
  | 'narrative'
  | 'specification'
  | 'analysis'
  | 'general';

export type ComplianceGapCategory =
  | 'missing_submission'
  | 'expired_certification'
  | 'phase_prerequisite'
  | 'regulatory_flag';

export type ComplianceGapSeverity = 'critical' | 'warning' | 'informational';

export type NarrativeType =
  | 'approach_statement'
  | 'methodology'
  | 'team_capability'
  | 'project_understanding'
  | 'fee_justification';

export type NarrativeTone = 'formal' | 'conversational' | 'technical';

export type NarrativeAudience = 'client' | 'adjudicator' | 'committee';

export type ContractType = 'JBCC' | 'NEC' | 'FIDIC' | 'GCC';

export type RFIUrgency = 'low' | 'medium' | 'high' | 'critical';

// ─── Capability-Role Mapping ───────────────────────────────────────────────

/**
 * Maps each CopilotCapability to the Professional_Roles permitted to invoke it.
 * An empty array means the capability is universal (all Professional_Roles
 * except platform_admin-only users).
 */
export const CAPABILITY_ROLE_MAP: Record<CopilotCapability, UserRole[]> = {
  summarise_status: [],       // universal — all professional roles
  flag_risk: [],              // universal — all professional roles
  explain_clause: [],         // universal — all professional roles
  draft_rfi: ['architect', 'bep', 'engineer', 'site_manager', 'contractor', 'quantity_surveyor'],
  draft_site_instruction: ['architect', 'bep', 'engineer', 'site_manager', 'contractor', 'quantity_surveyor'],
  flag_compliance: ['architect', 'bep', 'engineer', 'energy_professional', 'fire_engineer', 'town_planner'],
  generate_narrative: ['architect', 'bep', 'engineer', 'quantity_surveyor', 'town_planner'],
  summarise_financials: ['architect', 'bep', 'quantity_surveyor', 'contractor', 'client', 'firm_admin'],
};

/**
 * Capabilities available to every Professional_Role user.
 * These have empty arrays in CAPABILITY_ROLE_MAP.
 */
export const UNIVERSAL_CAPABILITIES: CopilotCapability[] = [
  'summarise_status',
  'flag_risk',
  'explain_clause',
];

// ─── Conversation Thread & Messages ────────────────────────────────────────

export interface ConversationThread {
  id: string;
  projectId: string;
  ownerUid: string;
  title: string;               // max 100 chars
  status: 'active' | 'archived';
  messageCount: number;
  lastMessageAt: string;       // ISO 8601 UTC
  createdAt: string;           // ISO 8601 UTC
  updatedAt: string;           // ISO 8601 UTC
}

export interface CopilotMessage {
  id: string;
  threadId: string;
  role: 'user' | 'assistant';
  content: string;             // max 10,000 chars
  timestamp: string;           // ISO 8601 UTC
  capability: CopilotCapability | null;
  provenanceId: string | null; // only for assistant messages
  truncated: boolean;          // true if response was cut at 8000 chars
}

// ─── Provenance Records ────────────────────────────────────────────────────

export interface ProvenanceRecord {
  id: string;
  projectId: string;
  threadId: string;
  messageId: string;
  modelId: string;              // max 128 chars (e.g. "gemini-1.5-pro")
  generatedAt: string;          // ISO 8601 UTC
  acceptedBy: string;           // UID of accepting user
  acceptedAt: string;           // ISO 8601 UTC
  source: CopilotSource;        // 'internal' | 'external'
  capability: CopilotCapability | null;
  confidence: number | null;    // 0.00–1.00 or null
  targetRecordId: string | null; // populated when attached to project record
  targetRecordType: string | null;
}

export interface ProvenanceOverride {
  id: string;
  provenanceRecordId: string;
  attestedBy: string;           // UID
  attestedRole: UserRole;       // Professional_Role of attester
  declaration: string;          // min 20 chars describing review performed
  attestedAt: string;           // ISO 8601 UTC
}

// ─── Project Context (System Prompt Payload) ───────────────────────────────

export interface CopilotProjectContext {
  passport: {
    projectName: string;
    currentPhase: ProjectPhase;
    riskLevel: Priority;
    leadProfessional: string;
    keyDates: Array<{ label: string; date: string }>;
    teamMembers: Array<{ name: string; role: string }>;
  };
  documentRegister: Array<{
    id: string;
    title: string;
    status: RecordStatus;
    type: string;
    updatedAt: string;
  }>;
  pendingActions: Array<{
    id: string;
    title: string;
    priority: Priority;
    dueDate: string | null;
    type: string;
  }>;
  auditTrail: Array<{
    action: string;
    actor: string;
    timestamp: string;
    detail: string;
  }>;
  userContext: {
    role: UserRole;
    projectAccessRole: ProjectAccessRole | null;
    displayName: string;
  };
  unavailableSources: string[]; // e.g. ['auditTrail'] if source timed out
}

// ─── BYOAI Import ──────────────────────────────────────────────────────────

export interface BYOAIImportRequest {
  content: string;               // 1–50,000 chars (opaque payload)
  externalModelName: string;     // 1–100 chars
  generationTimestamp?: string;  // ISO 8601, defaults to server time
  contentType: BYOAIContentType;
  metadata?: {
    prompt?: string;             // max 5,000 chars
    externalToolUrl?: string;    // valid URL
  };
}

export interface BYOAIImportResponse {
  documentId: string;
  provenanceRecordId: string;
  status: 'imported';
}

// ─── RFI Draft ─────────────────────────────────────────────────────────────

export interface RFIDraftInput {
  subject: string;               // 1–200 chars
  description: string;           // 1–2000 chars
  drawingReferences?: string[];  // max 20 items
  urgency?: RFIUrgency;         // defaults to 'medium'
}

export interface RFIDraftOutput {
  rfiNumber: number;
  addressedTo: string | null;
  subject: string;
  questionBody: string;          // min 50 chars
  references: string[];
  suggestedDeadline: string;     // ISO 8601 date
  provenanceId: string;
}

// ─── Compliance Gap Report ─────────────────────────────────────────────────

export interface ComplianceGap {
  id: string;
  category: ComplianceGapCategory;
  severity: ComplianceGapSeverity;
  title: string;
  detail: string;
  sansReference: string | null;   // e.g. "SANS 10400-K"
  suggestedRemediation: string;
  resolved: boolean;
  detectedAt: string;
}

export interface ComplianceGapReport {
  gaps: ComplianceGap[];          // max 50 items, sorted severity desc
  advisoryMessage: string | null; // present if no data available
  provenanceId: string;
}

// ─── Narrative Generation ──────────────────────────────────────────────────

export interface NarrativeInput {
  narrativeType: NarrativeType;
  targetAudience: NarrativeAudience;
  tone: NarrativeTone;
}

export interface NarrativeOutput {
  content: string;                // 200–800 words, 2–6 paragraphs
  wordCount: number;
  paragraphCount: number;
  readabilityGrade: number;       // Flesch-Kincaid grade level
  provenanceId: string;
}

// ─── Clause Explanation ────────────────────────────────────────────────────

export interface ClauseExplanationInput {
  clauseText: string;             // 1–2000 chars
  contractType?: ContractType;
}

export interface ClauseExplanationOutput {
  explanation: string;            // 150–600 words
  disclaimer: string;             // always appended
  contextualised: boolean;        // true if project contract was referenced
  provenanceId: string;
}

// ─── Rate Limiting ─────────────────────────────────────────────────────────

export interface RateLimitState {
  userId: string;
  windowStart: string;            // ISO 8601 UTC
  requestCount: number;
  maxRequests: 60;
  windowDurationMinutes: 60;
}

// ─── Copilot Response Envelope ─────────────────────────────────────────────

export interface CopilotResponse {
  message: CopilotMessage;
  provenanceId: string;
  structuredOutput?: RFIDraftOutput | ComplianceGapReport | NarrativeOutput | ClauseExplanationOutput | StatusSummary;
  error?: {
    code: 'rate_limited' | 'capability_denied' | 'validation_error' | 'service_unavailable' | 'content_policy';
    message: string;
    retryAfterMinutes?: number;
  };
}

export interface StatusSummary {
  overview: string;
  risks: string;
  upcoming: string;
  blockers: string;
  provenanceId: string;
  unchangedSinceLastSummary: boolean;
}
