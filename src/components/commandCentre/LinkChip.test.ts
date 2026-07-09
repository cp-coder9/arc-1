/**
 * Unit tests for LinkChip — truncateLabel utility function
 *
 * Tests the pure logic of the truncateLabel utility exported from LinkChip.tsx.
 * Property-based tests for the full rendering behavior are in
 * src/__tests__/linkChip.property.test.ts (task 8.3).
 */
import { describe, it, expect } from '@jest/globals';
import { truncateLabel } from './LinkChip';

describe('truncateLabel', () => {
  it('returns full label when length is at maxLength', () => {
    const label = 'a'.repeat(40);
    expect(truncateLabel(label, 40)).toBe(label);
  });

  it('returns full label when length is under maxLength', () => {
    expect(truncateLabel('Short label', 40)).toBe('Short label');
  });

  it('truncates and appends ellipsis when label exceeds maxLength', () => {
    const label = 'a'.repeat(50);
    const result = truncateLabel(label, 40);
    expect(result.length).toBe(40);
    expect(result.endsWith('…')).toBe(true);
  });

  it('truncates at exactly maxLength chars including ellipsis', () => {
    const label = 'Budget Package for New East Wing Extension Phase 2';
    const result = truncateLabel(label, 40);
    expect(result.length).toBe(40);
    expect(result.endsWith('…')).toBe(true);
    // First 39 chars of original + ellipsis
    expect(result).toBe(label.slice(0, 39) + '…');
  });

  it('handles empty string', () => {
    expect(truncateLabel('', 40)).toBe('');
  });

  it('handles single character', () => {
    expect(truncateLabel('A', 40)).toBe('A');
  });

  it('handles label exactly one char over maxLength', () => {
    const label = 'a'.repeat(41);
    const result = truncateLabel(label, 40);
    expect(result.length).toBe(40);
    expect(result.endsWith('…')).toBe(true);
  });

  it('respects custom maxLength', () => {
    const label = 'Hello World!';
    const result = truncateLabel(label, 5);
    expect(result).toBe('Hell…');
    expect(result.length).toBe(5);
  });

  it('uses default maxLength of 40 when not specified', () => {
    const label = 'a'.repeat(45);
    const result = truncateLabel(label);
    expect(result.length).toBe(40);
    expect(result.endsWith('…')).toBe(true);
  });
});
