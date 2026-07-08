/**
 * Zod validation schemas for the AI Copilot Workspace (Wingman)
 * Covers message input, RFI drafts, BYOAI imports, narratives, clause explanations, and threads.
 * Requirements: 6.1, 9.1, 10.1, 11.1, 11.6, 11.9, 12.7
 */

import { z } from 'zod';

// ─── Enum Schemas ──────────────────────────────────────────────────────────

export const RFIUrgencyEnum = z.enum(['low', 'medium', 'high', 'critical']);

export const BYOAIContentTypeEnum = z.enum([
  'rfi_draft',
  'narrative',
  'specification',
  'analysis',
  'general',
]);

export const NarrativeTypeEnum = z.enum([
  'approach_statement',
  'methodology',
  'team_capability',
  'project_understanding',
  'fee_justification',
]);

export const NarrativeAudienceEnum = z.enum(['client', 'adjudicator', 'committee']);

export const NarrativeToneEnum = z.enum(['formal', 'conversational', 'technical']);

export const ContractTypeEnum = z.enum(['JBCC', 'NEC', 'FIDIC', 'GCC']);

// ─── Message Input Schema ──────────────────────────────────────────────────
// Requirement 12.7: Prompt validation — 3–4000 chars, non-whitespace-only

export const CopilotMessageInputSchema = z.object({
  prompt: z
    .string()
    .min(3, 'Prompt must be at least 3 characters')
    .max(4000, 'Prompt must not exceed 4000 characters')
    .refine((val) => val.trim().length >= 3, {
      message: 'Prompt must contain at least 3 non-whitespace characters',
    }),
});

// ─── RFI Draft Input Schema ────────────────────────────────────────────────
// Requirement 6.1: subject 1–200, description 1–2000, max 20 references, urgency enum

export const RFIDraftInputSchema = z.object({
  subject: z
    .string()
    .min(1, 'Subject is required')
    .max(200, 'Subject must not exceed 200 characters'),
  description: z
    .string()
    .min(1, 'Description is required')
    .max(2000, 'Description must not exceed 2000 characters'),
  drawingReferences: z
    .array(z.string().min(1, 'Drawing reference must not be empty'))
    .max(20, 'Maximum 20 drawing references allowed')
    .optional(),
  urgency: RFIUrgencyEnum.optional(),
});

// ─── BYOAI Import Request Schema ──────────────────────────────────────────
// Requirements 11.1, 11.6, 11.9: content 1–50000, model name 1–100,
// content type enum, timestamp validation (not >5 min in future)

export const BYOAIImportRequestSchema = z.object({
  content: z
    .string()
    .min(1, 'Content is required')
    .max(50000, 'Content must not exceed 50000 characters'),
  externalModelName: z
    .string()
    .min(1, 'External model name is required')
    .max(100, 'External model name must not exceed 100 characters'),
  generationTimestamp: z
    .string()
    .datetime({ message: 'Generation timestamp must be a valid ISO 8601 date-time string' })
    .refine(
      (val) => {
        const timestamp = new Date(val).getTime();
        const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000;
        return timestamp <= fiveMinutesFromNow;
      },
      { message: 'Generation timestamp must not be more than 5 minutes in the future' }
    )
    .optional(),
  contentType: BYOAIContentTypeEnum,
  metadata: z
    .object({
      prompt: z
        .string()
        .max(5000, 'Prompt metadata must not exceed 5000 characters')
        .optional(),
      externalToolUrl: z
        .string()
        .url('External tool URL must be a valid URL')
        .optional(),
    })
    .optional(),
});

// ─── Narrative Input Schema ────────────────────────────────────────────────
// Requirement 9.1: type, audience, tone enums

export const NarrativeInputSchema = z.object({
  narrativeType: NarrativeTypeEnum,
  targetAudience: NarrativeAudienceEnum,
  tone: NarrativeToneEnum,
});

// ─── Clause Explanation Input Schema ───────────────────────────────────────
// Requirement 10.1: text 1–2000, optional contract type

export const ClauseExplanationInputSchema = z.object({
  clauseText: z
    .string()
    .min(1, 'Clause text is required')
    .max(2000, 'Clause text must not exceed 2000 characters'),
  contractType: ContractTypeEnum.optional(),
});

// ─── Thread Creation Schema ────────────────────────────────────────────────
// Requirement 4.4: title max 100 chars (optional — auto-generated if omitted)

export const ThreadCreationSchema = z.object({
  title: z
    .string()
    .max(100, 'Thread title must not exceed 100 characters')
    .optional(),
});

// ─── Inferred Types ────────────────────────────────────────────────────────

export type MessageInput = z.infer<typeof CopilotMessageInputSchema>;
export type RFIDraftInput = z.infer<typeof RFIDraftInputSchema>;
export type BYOAIImportRequest = z.infer<typeof BYOAIImportRequestSchema>;
export type NarrativeInput = z.infer<typeof NarrativeInputSchema>;
export type ClauseExplanationInput = z.infer<typeof ClauseExplanationInputSchema>;
export type ThreadCreation = z.infer<typeof ThreadCreationSchema>;
