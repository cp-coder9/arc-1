/**
 * checklistResponseSchema — Unit tests
 *
 * Validates that the Zod schema enforces response validation rules:
 * - itemId: non-empty string
 * - value: 'pass' | 'fail' | 'na' (pass_fail_na), a number (numeric), or a string ≤ 1000 chars (text)
 * - Validates: Requirements 3.3, 3.8
 */

import { describe, expect, it } from 'vitest';
import { checklistResponseSchema } from '../schemas';

describe('checklistResponseSchema', () => {
  describe('itemId validation', () => {
    it('accepts a non-empty itemId', () => {
      const result = checklistResponseSchema.safeParse({ itemId: 'item-1', value: 'pass' });
      expect(result.success).toBe(true);
    });

    it('rejects an empty itemId', () => {
      const result = checklistResponseSchema.safeParse({ itemId: '', value: 'pass' });
      expect(result.success).toBe(false);
    });

    it('rejects missing itemId', () => {
      const result = checklistResponseSchema.safeParse({ value: 'pass' });
      expect(result.success).toBe(false);
    });
  });

  describe('pass_fail_na responses', () => {
    it('accepts "pass"', () => {
      const result = checklistResponseSchema.safeParse({ itemId: 'item-1', value: 'pass' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.value).toBe('pass');
    });

    it('accepts "fail"', () => {
      const result = checklistResponseSchema.safeParse({ itemId: 'item-1', value: 'fail' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.value).toBe('fail');
    });

    it('accepts "na"', () => {
      const result = checklistResponseSchema.safeParse({ itemId: 'item-1', value: 'na' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.value).toBe('na');
    });
  });

  describe('numeric responses', () => {
    it('accepts a positive integer', () => {
      const result = checklistResponseSchema.safeParse({ itemId: 'item-1', value: 42 });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.value).toBe(42);
    });

    it('accepts zero', () => {
      const result = checklistResponseSchema.safeParse({ itemId: 'item-1', value: 0 });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.value).toBe(0);
    });

    it('accepts a negative number', () => {
      const result = checklistResponseSchema.safeParse({ itemId: 'item-1', value: -5 });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.value).toBe(-5);
    });

    it('accepts a decimal number', () => {
      const result = checklistResponseSchema.safeParse({ itemId: 'item-1', value: 3.14 });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.value).toBe(3.14);
    });
  });

  describe('text responses', () => {
    it('accepts a short text string', () => {
      const result = checklistResponseSchema.safeParse({ itemId: 'item-1', value: 'Some observation' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.value).toBe('Some observation');
    });

    it('accepts text of exactly 1000 characters', () => {
      const text = 'x'.repeat(1000);
      const result = checklistResponseSchema.safeParse({ itemId: 'item-1', value: text });
      expect(result.success).toBe(true);
    });

    it('rejects text exceeding 1000 characters', () => {
      const text = 'x'.repeat(1001);
      const result = checklistResponseSchema.safeParse({ itemId: 'item-1', value: text });
      expect(result.success).toBe(false);
    });

    it('accepts an empty string as a text response', () => {
      // Empty string is valid text (min not specified for response text)
      const result = checklistResponseSchema.safeParse({ itemId: 'item-1', value: '' });
      expect(result.success).toBe(true);
    });
  });

  describe('invalid responses', () => {
    it('rejects a boolean value', () => {
      const result = checklistResponseSchema.safeParse({ itemId: 'item-1', value: true });
      expect(result.success).toBe(false);
    });

    it('rejects null value', () => {
      const result = checklistResponseSchema.safeParse({ itemId: 'item-1', value: null });
      expect(result.success).toBe(false);
    });

    it('rejects undefined value', () => {
      const result = checklistResponseSchema.safeParse({ itemId: 'item-1', value: undefined });
      expect(result.success).toBe(false);
    });

    it('rejects missing value field', () => {
      const result = checklistResponseSchema.safeParse({ itemId: 'item-1' });
      expect(result.success).toBe(false);
    });

    it('rejects an array value', () => {
      const result = checklistResponseSchema.safeParse({ itemId: 'item-1', value: ['pass'] });
      expect(result.success).toBe(false);
    });

    it('rejects an object value', () => {
      const result = checklistResponseSchema.safeParse({ itemId: 'item-1', value: { result: 'pass' } });
      expect(result.success).toBe(false);
    });
  });
});
