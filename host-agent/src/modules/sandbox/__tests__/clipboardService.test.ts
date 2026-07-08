/**
 * Tests for ClipboardService
 *
 * Validates clipboard policy enforcement: default disabled state, text-only mode
 * with size limits, and blocking of non-text content types.
 *
 * Requirements: 7.3
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ClipboardService,
  type ClipboardContent,
  type ClipboardPolicy,
} from '../clipboardService';

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('ClipboardService', () => {
  let service: ClipboardService;

  beforeEach(() => {
    service = new ClipboardService();
  });

  // ─── Default Policy ─────────────────────────────────────────────────────────

  describe('default policy', () => {
    it('should default to disabled policy', () => {
      expect(service.getPolicy()).toBe('disabled');
    });

    it('should block all clipboard transfers when disabled', () => {
      const content: ClipboardContent = {
        type: 'text',
        data: 'hello',
        sizeBytes: 5,
      };

      const result = service.interceptClipboard(content);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('disabled');
      expect(result.content).toBeUndefined();
    });

    it('should block file content when disabled', () => {
      const content: ClipboardContent = {
        type: 'file',
        data: Buffer.from('file-data'),
        sizeBytes: 9,
      };

      const result = service.interceptClipboard(content);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('disabled');
    });

    it('should block image content when disabled', () => {
      const content: ClipboardContent = {
        type: 'image',
        data: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        sizeBytes: 4,
      };

      const result = service.interceptClipboard(content);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('disabled');
    });

    it('should block rich_text content when disabled', () => {
      const content: ClipboardContent = {
        type: 'rich_text',
        data: '<b>bold</b>',
        sizeBytes: 11,
      };

      const result = service.interceptClipboard(content);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('disabled');
    });
  });

  // ─── Policy Configuration ──────────────────────────────────────────────────

  describe('setPolicy / getPolicy', () => {
    it('should allow setting policy to text_only', () => {
      service.setPolicy('text_only');
      expect(service.getPolicy()).toBe('text_only');
    });

    it('should allow setting policy to disabled', () => {
      service.setPolicy('text_only');
      service.setPolicy('disabled');
      expect(service.getPolicy()).toBe('disabled');
    });

    it('should reflect the most recent policy set', () => {
      service.setPolicy('text_only');
      service.setPolicy('disabled');
      service.setPolicy('text_only');
      expect(service.getPolicy()).toBe('text_only');
    });
  });

  // ─── Text-Only Policy: Allowed Transfers ────────────────────────────────────

  describe('text_only policy — allowed transfers', () => {
    beforeEach(() => {
      service.setPolicy('text_only');
    });

    it('should allow plain text within 4096 characters', () => {
      const content: ClipboardContent = {
        type: 'text',
        data: 'Hello, world!',
        sizeBytes: 13,
      };

      const result = service.interceptClipboard(content);

      expect(result.allowed).toBe(true);
      expect(result.content).toEqual(content);
      expect(result.reason).toBeUndefined();
    });

    it('should allow text exactly at the 4096 character limit', () => {
      const text = 'a'.repeat(4096);
      const content: ClipboardContent = {
        type: 'text',
        data: text,
        sizeBytes: 4096,
      };

      const result = service.interceptClipboard(content);

      expect(result.allowed).toBe(true);
      expect(result.content).toEqual(content);
    });

    it('should allow empty text', () => {
      const content: ClipboardContent = {
        type: 'text',
        data: '',
        sizeBytes: 0,
      };

      const result = service.interceptClipboard(content);

      expect(result.allowed).toBe(true);
      expect(result.content).toEqual(content);
    });

    it('should allow text content provided as a Buffer', () => {
      const text = 'Buffer text content';
      const content: ClipboardContent = {
        type: 'text',
        data: Buffer.from(text, 'utf-8'),
        sizeBytes: Buffer.byteLength(text, 'utf-8'),
      };

      const result = service.interceptClipboard(content);

      expect(result.allowed).toBe(true);
      expect(result.content).toEqual(content);
    });
  });

  // ─── Text-Only Policy: Blocked Transfers ────────────────────────────────────

  describe('text_only policy — blocked transfers', () => {
    beforeEach(() => {
      service.setPolicy('text_only');
    });

    it('should block text exceeding 4096 characters', () => {
      const text = 'a'.repeat(4097);
      const content: ClipboardContent = {
        type: 'text',
        data: text,
        sizeBytes: 4097,
      };

      const result = service.interceptClipboard(content);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('4096');
      expect(result.reason).toContain('4097');
      expect(result.content).toBeUndefined();
    });

    it('should block file clipboard content', () => {
      const content: ClipboardContent = {
        type: 'file',
        data: Buffer.from('file-data'),
        sizeBytes: 9,
      };

      const result = service.interceptClipboard(content);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('file');
      expect(result.reason).toContain('not permitted');
    });

    it('should block image clipboard content', () => {
      const content: ClipboardContent = {
        type: 'image',
        data: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        sizeBytes: 4,
      };

      const result = service.interceptClipboard(content);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('image');
      expect(result.reason).toContain('not permitted');
    });

    it('should block rich_text clipboard content', () => {
      const content: ClipboardContent = {
        type: 'rich_text',
        data: '<b>formatted</b>',
        sizeBytes: 16,
      };

      const result = service.interceptClipboard(content);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('rich_text');
      expect(result.reason).toContain('not permitted');
    });

    it('should block large text provided as a Buffer exceeding character limit', () => {
      const text = 'x'.repeat(5000);
      const content: ClipboardContent = {
        type: 'text',
        data: Buffer.from(text, 'utf-8'),
        sizeBytes: Buffer.byteLength(text, 'utf-8'),
      };

      const result = service.interceptClipboard(content);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('exceeds maximum length');
    });
  });

  // ─── Policy Transition Behaviour ───────────────────────────────────────────

  describe('policy transitions', () => {
    it('should enforce new policy immediately after setPolicy', () => {
      const textContent: ClipboardContent = {
        type: 'text',
        data: 'test',
        sizeBytes: 4,
      };

      // Initially disabled — should block
      expect(service.interceptClipboard(textContent).allowed).toBe(false);

      // Enable text_only — should allow
      service.setPolicy('text_only');
      expect(service.interceptClipboard(textContent).allowed).toBe(true);

      // Back to disabled — should block again
      service.setPolicy('disabled');
      expect(service.interceptClipboard(textContent).allowed).toBe(false);
    });
  });
});
