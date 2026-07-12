/**
 * Unit tests for copilotGuardrailFilter
 *
 * Tests: content safety filter, response truncation, disclaimer appending,
 * copyright text limit enforcement, and the applyGuardrails convenience function.
 */

import { describe, it, expect } from 'vitest';
import {
  filterContent,
  truncateResponse,
  appendDisclaimer,
  checkCopyrightCompliance,
  applyGuardrails,
} from '@/services/copilotGuardrailFilter';

// ─── filterContent ─────────────────────────────────────────────────────────

describe('filterContent', () => {
  it('returns safe for clean professional content', () => {
    const result = filterContent('The contractor shall complete the works by the agreed date.');
    expect(result.safe).toBe(true);
    expect(result.filtered).toBe('The contractor shall complete the works by the agreed date.');
    expect(result.flags).toEqual([]);
  });

  it('detects profanity and marks as unsafe', () => {
    const result = filterContent('This is a shit response to the query.');
    expect(result.safe).toBe(false);
    expect(result.filtered).toContain('[redacted]');
        expect(result.flags).toContain('profanity');
  });

  it('detects profanity case-insensitively', () => {
    const result = filterContent('What the FUCK is happening here.');
    expect(result.safe).toBe(false);
    expect(result.flags).toContain('profanity');
  });

  it('does not false-positive on partial word matches', () => {
    // "assessment" contains "ass" but should not trigger
    const result = filterContent('The risk assessment is pending review.');
    expect(result.safe).toBe(true);
    expect(result.flags).toEqual([]);
  });

  it('detects discriminatory language patterns', () => {
    const result = filterContent('They described the people as subhuman.');
    expect(result.safe).toBe(false);
    expect(result.flags).toContain('discriminatory_language');
  });

  it('detects email addresses as PII', () => {
    const result = filterContent('Contact john.doe@example.com for more information.');
    expect(result.safe).toBe(false);
    expect(result.flags.some(flag => flag.startsWith('pii_'))).toBe(true);
  });

  it('detects phone numbers as PII', () => {
    const result = filterContent('Call 082 456 7890 for the delivery schedule.');
    expect(result.safe).toBe(false);
    expect(result.flags.some(flag => flag.startsWith('pii_'))).toBe(true);
  });

  it('detects South African ID numbers as PII', () => {
    const result = filterContent('ID number: 8501015009087 verified.');
    expect(result.safe).toBe(false);
    expect(result.flags.some(flag => flag.startsWith('pii_'))).toBe(true);
  });

  it('can return multiple violations simultaneously', () => {
    const result = filterContent('Fuck those blacks are all idiots. Contact test@mail.com.');
    expect(result.safe).toBe(false);
    expect(result.flags.length).toBeGreaterThanOrEqual(2);
  });

  it('handles empty string as safe', () => {
    const result = filterContent('');
    expect(result.safe).toBe(true);
    expect(result.filtered).toBe('');
  });
});

// ─── truncateResponse ──────────────────────────────────────────────────────

describe('truncateResponse', () => {
  it('does not truncate content under the limit', () => {
    const content = 'Short response';
    const result = truncateResponse(content);
    expect(result.content).toBe(content);
    expect(result.truncated).toBe(false);
  });

  it('does not truncate content exactly at the limit', () => {
    const content = 'a'.repeat(8000);
    const result = truncateResponse(content);
    expect(result.content).toBe(content);
    expect(result.truncated).toBe(false);
  });

  it('truncates content exceeding the default 8000 char limit', () => {
    const content = 'a'.repeat(9000);
    const result = truncateResponse(content);
    expect(result.truncated).toBe(true);
    expect(result.content).toContain('... [response truncated]');
        expect(result.content.length).toBeLessThanOrEqual(8000);
  });

  it('respects custom maxLength parameter', () => {
    const content = 'a'.repeat(200);
    const result = truncateResponse(content, 100);
    expect(result.truncated).toBe(true);
    expect(result.content.length).toBeLessThanOrEqual(100);
        expect(result.content).toContain('... [response truncated]');
  });

  it('handles empty content', () => {
    const result = truncateResponse('');
    expect(result.content).toBe('');
    expect(result.truncated).toBe(false);
  });
});

// ─── appendDisclaimer ──────────────────────────────────────────────────────

describe('appendDisclaimer', () => {
  it('appends the standard disclaimer', () => {
    const result = appendDisclaimer('Some AI response.');
    expect(result).toBe('Some AI response.\n\nAI-generated content. Review before professional use.');
  });

  it('appends disclaimer to empty content', () => {
    const result = appendDisclaimer('');
    expect(result).toBe('\n\nAI-generated content. Review before professional use.');
  });

  it('always includes the exact disclaimer text', () => {
    const result = appendDisclaimer('Test content');
    expect(result).toContain('AI-generated content. Review before professional use.');
  });
});

// ─── checkCopyrightCompliance ───────────────────────────────────────────────────

describe('checkCopyrightCompliance', () => {
  it('returns compliant for original content', () => {
    const result = checkCopyrightCompliance('The project team should review all documentation before the next phase begins.');
    expect(result.compliant).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('returns compliant for short content (under 15 words)', () => {
    const result = checkCopyrightCompliance('The contractor shall provide materials.');
    expect(result.compliant).toBe(true);
  });

  it('flags content reproducing more than 15 consecutive words from known clauses', () => {
    // This reproduces a known pattern verbatim
    const copyrightedText = 'the contractor shall provide all materials required for the project as specified and remain responsible for every delivery until final acceptance';
    const result = checkCopyrightCompliance(copyrightedText);
    expect(result.compliant).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('allows up to 15 consecutive words matching a pattern', () => {
    // Take exactly 15 words from a known pattern - should be compliant
    const fifteenWords = 'the contractor shall at his own cost and expense provide all materials required for the';
    const result = checkCopyrightCompliance(fifteenWords);
    expect(result.compliant).toBe(true);
  });

  it('handles empty content', () => {
    const result = checkCopyrightCompliance('');
    expect(result.compliant).toBe(true);
  });

  it('handles content with punctuation that matches patterns', () => {
    // Same clause but with punctuation — normalisation should handle this
    const text = 'The contractor shall provide all materials required for the project, as specified in the contract and remain responsible for delivery, storage, protection and final acceptance.';
    const result = checkCopyrightCompliance(text);
    // After normalisation and removing punctuation, this should match the pattern
    expect(result.compliant).toBe(false);
  });
});

// ─── applyGuardrails ────────────────────────────────────────────────────

describe('applyGuardrails', () => {
  it('returns safe content with disclaimer appended', () => {
    const result = applyGuardrails('The project is progressing well.');
    expect(result.safe).toBe(true);
    expect(result.truncated).toBe(false);
    expect(result.flags).toEqual([]);
    expect(result.content).toContain('AI-generated content. Review before professional use.');
    expect(result.content).toContain('AI-generated content. Review before professional use.');
    expect(result.content).toContain('The project is progressing well.');
  });

  it('filters unsafe content and returns violations', () => {
    const result = applyGuardrails('This is a shit response.');
    expect(result.safe).toBe(false);
    expect(result.flags).toContain('profanity');
    expect(result.content).toContain('AI-generated content. Review before professional use.');
    // Unsafe content should be empty but disclaimer still appended
    expect(result.content).toContain('[redacted]');
  });

  it('truncates long content before appending disclaimer', () => {
    const longContent = 'word '.repeat(2000); // well over 8000 chars
    const result = applyGuardrails(longContent);
    expect(result.safe).toBe(true);
    expect(result.truncated).toBe(true);
    expect(result.content).toContain('AI-generated content. Review before professional use.');
    expect(result.content).toContain('... [response truncated]');
    expect(result.content).toContain('AI-generated content. Review before professional use.');
  });

  it('applies guardrails in correct order: filter → truncate → disclaimer', () => {
    const safeShort = 'Brief summary of project status.';
    const result = applyGuardrails(safeShort);
    // Verify structure: content + disclaimer
    expect(result.content).toBe(safeShort + '\n\nAI-generated content. Review before professional use.');
  });

  it('handles empty content gracefully', () => {
    const result = applyGuardrails('');
    expect(result.safe).toBe(true);
    expect(result.truncated).toBe(false);
    expect(result.content).toContain('AI-generated content. Review before professional use.');
  });
});
