/**
 * AI Copilot Guardrail Filter
 *
 * Content safety, response truncation, disclaimer appending, and copyright
 * compliance enforcement for all Copilot (Wingman) AI responses.
 *
 * Guardrails applied in order:
 * 1. Content safety filter (profanity, discriminatory language, PII)
 * 2. Copyright compliance check (max 15 consecutive words from contract forms)
 * 3. Response truncation (8000 chars default)
 * 4. Disclaimer appending
 *
 * @module copilotGuardrailFilter
 */

// ─── Constants ─────────────────────────────────────────────────────────────

const DEFAULT_MAX_LENGTH = 8000;
const TRUNCATION_INDICATOR = '... [response truncated]';
const DISCLAIMER = '\n\nAI-generated content. Review before professional use.';
const MAX_CONSECUTIVE_COPYRIGHT_WORDS = 15;

// ─── Profanity & Discriminatory Language Patterns ──────────────────────────

/**
 * Common profanity/slur word list for content safety detection.
 * Uses word boundaries to avoid false positives on substrings.
 */
const PROFANITY_PATTERNS: RegExp[] = [
  /\bfuck\w*/i,
  /\bshit\w*/i,
  /\bass(?:hole|hat)\b/i,
  /\bbitch\w*/i,
  /\bdamn\w*/i,
  /\bbastard\w*/i,
  /\bcrap\b/i,
  /\bcock(?:sucker)?\b/i,
  /\bdick(?:head)?\b/i,
  /\bpiss\w*/i,
  /\bwhor[e]?\w*/i,
  /\bcunt\w*/i,
  /\btw[a]t\b/i,
  /\bwank\w*/i,
  /\bbollocks\b/i,
];

/**
 * Discriminatory language patterns covering slurs and hate speech.
 */
const DISCRIMINATORY_PATTERNS: RegExp[] = [
  /\bn[i1]gg[ae3]r?\w*/i,
  /\bk[a4]ff[i1]r\w*/i,
  /\bf[a4]gg?[o0]t\w*/i,
  /\bret[a4]rd\w*/i,
  /\bsp[i1]c\b/i,
  /\bch[i1]nk\b/i,
  /\bgook\b/i,
  /\bwetback\b/i,
  /\btr[a4]nn[yi1e]\w*/i,
  /\bdyke\b/i,
  /\bcoon\b/i,
  /\bsavage\s+(race|people|tribe)/i,
  /\bsubhuman\b/i,
];

// ─── PII Detection Patterns ───────────────────────────────────────────────

/**
 * Email address pattern.
 */
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/;

/**
 * Phone number patterns (international + SA formats).
 * Matches: +27 XX XXX XXXX, 0XX XXX XXXX, (0XX) XXX-XXXX, etc.
 */
const PHONE_PATTERNS: RegExp[] = [
  /\b\+?\d{1,3}[\s\-]?\(?\d{2,3}\)?[\s\-]?\d{3}[\s\-]?\d{4}\b/,
  /\b0\d{2}[\s\-]?\d{3}[\s\-]?\d{4}\b/,
  /\b\+27[\s\-]?\d{2}[\s\-]?\d{3}[\s\-]?\d{4}\b/,
];

/**
 * South African ID number pattern (13 digits: YYMMDD SSSS C A Z).
 */
const SA_ID_PATTERN = /\b\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{4}[01]\d{2}\b/;

// ─── Copyright / Legal Language Patterns ──────────────────────────────────

/**
 * Patterns indicating legal/contract language sequences that likely originate
 * from copyrighted contract forms (JBCC, NEC, FIDIC, GCC).
 *
 * These are heuristic triggers — we flag sequences of 15+ consecutive words
 * that match common contract phrasing structures.
 */
const LEGAL_PHRASE_INDICATORS: RegExp[] = [
  /\b(?:the\s+)?contractor\s+shall\s+(?:be\s+(?:liable|responsible|entitled)|not\s+be\s+(?:liable|responsible|entitled)|indemnify|give\s+notice|provide|ensure|comply)/i,
  /\b(?:the\s+)?employer\s+shall\s+(?:be\s+(?:liable|responsible|entitled)|not\s+be\s+(?:liable|responsible|entitled)|pay|give\s+notice|provide|ensure)/i,
  /\bnotwithstanding\s+(?:any(?:thing)?|the\s+(?:provisions|foregoing))\s+(?:contained|herein|in\s+(?:this|these|the))/i,
  /\bsubject\s+to\s+(?:the\s+)?(?:provisions|terms|conditions)\s+of\s+(?:this|the|clause)/i,
  /\bwithout\s+prejudice\s+to\s+(?:the\s+)?(?:generality|rights|provisions|foregoing)/i,
  /\bin\s+terms\s+of\s+clause\s+\d+/i,
  /\bfor\s+the\s+purposes\s+of\s+this\s+(?:agreement|contract|clause|sub-?clause)/i,
  /\bsave\s+(?:as\s+)?(?:expressly|otherwise)\s+(?:provided|stated|agreed)/i,
  /\bthe\s+(?:principal\s+)?agent\s+shall\s+(?:issue|certify|determine|instruct|approve)/i,
  /\bpractical\s+completion\s+shall\s+be\s+deemed\s+to\s+have\s+(?:been\s+)?achieved/i,
];

// ─── Content Safety Filter ─────────────────────────────────────────────────

export interface ContentFilterResult {
  safe: boolean;
  filtered: string;
  flags: string[];
}

/**
 * Checks content for profanity, discriminatory language, and third-party PII.
 *
 * Returns:
 * - `safe: true` if no issues detected, `filtered` = original content
 * - `safe: false` if issues found, `filtered` = content with problematic sections redacted,
 *   `flags` listing what was detected
 */
export function filterContent(content: string): ContentFilterResult {
  const flags: string[] = [];
  let filtered = content;
  let safe = true;

  // Check profanity
  for (const pattern of PROFANITY_PATTERNS) {
    if (pattern.test(content)) {
      flags.push('profanity');
      safe = false;
      break;
    }
  }

  // Check discriminatory language
  for (const pattern of DISCRIMINATORY_PATTERNS) {
    if (pattern.test(content)) {
      flags.push('discriminatory_language');
      safe = false;
      break;
    }
  }

  // Check PII — email
  if (EMAIL_PATTERN.test(content)) {
    flags.push('pii_email');
    safe = false;
  }

  // Check PII — phone numbers
  for (const pattern of PHONE_PATTERNS) {
    if (pattern.test(content)) {
      flags.push('pii_phone');
      safe = false;
      break;
    }
  }

  // Check PII — SA ID numbers
  if (SA_ID_PATTERN.test(content)) {
    flags.push('pii_id_number');
    safe = false;
  }

  // Redact problematic content if unsafe
  if (!safe) {
    filtered = redactContent(filtered, flags);
  }

  return { safe, filtered, flags };
}

/**
 * Redacts detected problematic content from the string.
 */
function redactContent(content: string, flags: string[]): string {
  let result = content;

  if (flags.includes('profanity')) {
    for (const pattern of PROFANITY_PATTERNS) {
      result = result.replace(new RegExp(pattern.source, 'gi'), '[redacted]');
    }
  }

  if (flags.includes('discriminatory_language')) {
    for (const pattern of DISCRIMINATORY_PATTERNS) {
      result = result.replace(new RegExp(pattern.source, 'gi'), '[redacted]');
    }
  }

  if (flags.includes('pii_email')) {
    result = result.replace(new RegExp(EMAIL_PATTERN.source, 'g'), '[email redacted]');
  }

  if (flags.includes('pii_phone')) {
    for (const pattern of PHONE_PATTERNS) {
      result = result.replace(new RegExp(pattern.source, 'g'), '[phone redacted]');
    }
  }

  if (flags.includes('pii_id_number')) {
    result = result.replace(new RegExp(SA_ID_PATTERN.source, 'g'), '[id redacted]');
  }

  return result;
}

// ─── Response Truncation ───────────────────────────────────────────────────

export interface TruncationResult {
  content: string;
  truncated: boolean;
}

/**
 * Truncates a response if it exceeds maxLength characters.
 *
 * - Default maxLength = 8000
 * - Truncates at the nearest word boundary before the limit
 * - Appends "... [response truncated]" indicator when truncated
 */
export function truncateResponse(
  content: string,
  maxLength: number = DEFAULT_MAX_LENGTH
): TruncationResult {
  if (content.length <= maxLength) {
    return { content, truncated: false };
  }

  // Find the nearest word boundary before the limit
  // Leave space for the truncation indicator
  const truncateAt = maxLength - TRUNCATION_INDICATOR.length;

  if (truncateAt <= 0) {
    return { content: TRUNCATION_INDICATOR, truncated: true };
  }

  // Find the last space at or before truncateAt
  let cutPoint = content.lastIndexOf(' ', truncateAt);

  // If no space found (single very long word), cut at the limit directly
  if (cutPoint <= 0) {
    cutPoint = truncateAt;
  }

  const truncated = content.slice(0, cutPoint) + TRUNCATION_INDICATOR;
  return { content: truncated, truncated: true };
}

// ─── Disclaimer Appending ──────────────────────────────────────────────────

/**
 * Appends the standard AI-generated content disclaimer to any response.
 * Always appends regardless of content type.
 */
export function appendDisclaimer(content: string): string {
  return content + DISCLAIMER;
}

// ─── Copyright Compliance Check ────────────────────────────────────────────

export interface CopyrightComplianceResult {
  compliant: boolean;
  violations: string[];
}

/**
 * Detects if response contains more than 15 consecutive words that match
 * known contract form language patterns.
 *
 * This is a heuristic check — looks for sequences of legal/contract language
 * that appear to be direct quotes from copyrighted contract forms (JBCC, NEC, FIDIC, GCC).
 */
export function checkCopyrightCompliance(content: string): CopyrightComplianceResult {
  const violations: string[] = [];

  // Split content into sentences for analysis
  const sentences = content.split(/[.!?;]\s+/);

  for (const sentence of sentences) {
    // Check each sentence against legal phrase indicators
    for (const pattern of LEGAL_PHRASE_INDICATORS) {
      const match = sentence.match(pattern);
      if (match) {
        // Count words in the sentence from the match point onwards
        const matchIndex = sentence.indexOf(match[0]);
        const fromMatch = sentence.slice(matchIndex);
        const words = fromMatch.trim().split(/\s+/);

        if (words.length > MAX_CONSECUTIVE_COPYRIGHT_WORDS) {
          violations.push(words.slice(0, MAX_CONSECUTIVE_COPYRIGHT_WORDS + 1).join(' '));
        }
      }
    }
  }

  return {
    compliant: violations.length === 0,
    violations,
  };
}

// ─── Orchestrator ──────────────────────────────────────────────────────────

export interface GuardrailResult {
  content: string;
  safe: boolean;
  truncated: boolean;
  flags: string[];
}

/**
 * Applies all guardrails in order:
 * 1. Content safety filter
 * 2. Copyright compliance check (adds flag if violated)
 * 3. Truncation
 * 4. Disclaimer appending
 *
 * Returns the fully processed content with metadata about what was applied.
 */
export function applyGuardrails(content: string): GuardrailResult {
  // 1. Content safety filter
  const filterResult = filterContent(content);
  let processedContent = filterResult.filtered;
  const flags = [...filterResult.flags];

  // 2. Copyright compliance check
  const copyrightResult = checkCopyrightCompliance(processedContent);
  if (!copyrightResult.compliant) {
    flags.push('copyright_violation');
  }

  // 3. Truncation
  const truncationResult = truncateResponse(processedContent);
  processedContent = truncationResult.content;

  // 4. Disclaimer appending
  processedContent = appendDisclaimer(processedContent);

  return {
    content: processedContent,
    safe: filterResult.safe,
    truncated: truncationResult.truncated,
    flags,
  };
}
