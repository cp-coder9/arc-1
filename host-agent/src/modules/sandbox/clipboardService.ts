/**
 * Host Agent — Clipboard Service
 *
 * Manages clipboard transfer policy enforcement during active remote desktop sessions.
 * By default, ALL clipboard transfers are disabled. When a Resource_Owner explicitly
 * enables text-only clipboard in the host configuration, only plain text content
 * up to 4096 characters is permitted — file, image, and rich-text content remains blocked.
 *
 * Responsibilities:
 * - Enforce clipboard policy (disabled or text_only)
 * - Intercept clipboard operations and apply policy rules
 * - Provide clear rejection reasons for blocked content
 *
 * Requirements: 7.3
 */

// ─── Types ──────────────────────────────────────────────────────────────────────

export type ClipboardContentType = 'text' | 'file' | 'image' | 'rich_text';

export type ClipboardPolicy = 'disabled' | 'text_only';

export interface ClipboardContent {
  type: ClipboardContentType;
  data: string | Buffer;
  sizeBytes: number;
}

export interface ClipboardInterceptResult {
  allowed: boolean;
  content?: ClipboardContent;
  reason?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Maximum permitted text length in characters when text-only clipboard is enabled. */
const MAX_TEXT_LENGTH = 4096;

// ─── ClipboardService Class ─────────────────────────────────────────────────────

export class ClipboardService {
  private policy: ClipboardPolicy = 'disabled';

  /**
   * Configure the clipboard policy for the current session.
   *
   * @param policy - 'disabled' blocks all clipboard transfers;
   *   'text_only' permits plain text ≤4096 chars, blocks everything else.
   */
  setPolicy(policy: ClipboardPolicy): void {
    this.policy = policy;
  }

  /**
   * Returns the currently active clipboard policy.
   */
  getPolicy(): ClipboardPolicy {
    return this.policy;
  }

  /**
   * Intercept a clipboard operation and evaluate it against the current policy.
   *
   * @param content - The clipboard content being transferred.
   * @returns An object indicating whether the transfer is allowed, the content
   *   (when allowed), and a rejection reason (when blocked).
   */
  interceptClipboard(content: ClipboardContent): ClipboardInterceptResult {
    // Policy: disabled — block everything
    if (this.policy === 'disabled') {
      return {
        allowed: false,
        reason: 'Clipboard transfer is disabled for this session',
      };
    }

    // Policy: text_only — only plain text within size limit is permitted
    if (content.type !== 'text') {
      return {
        allowed: false,
        reason: `Clipboard content type '${content.type}' is not permitted; only plain text is allowed`,
      };
    }

    // Check text length (character count, not byte size)
    const textData = typeof content.data === 'string' ? content.data : content.data.toString('utf-8');
    if (textData.length > MAX_TEXT_LENGTH) {
      return {
        allowed: false,
        reason: `Text content exceeds maximum length of ${MAX_TEXT_LENGTH} characters (got ${textData.length})`,
      };
    }

    // Text content within limits — allow transfer
    return {
      allowed: true,
      content,
    };
  }
}
