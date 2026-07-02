import { describe, it, expect } from 'vitest';
import {
  SpecForgeValidationError,
  SpecForgeNotFoundError,
  SpecForgeImmutableError,
  SpecForgeCapabilityError,
} from '../specforgeErrors';
import type { z } from 'zod';

describe('SpecForgeValidationError', () => {
  it('wraps Zod issues and sets correct name and message', () => {
    const issues: z.ZodIssue[] = [
      { code: 'invalid_type', expected: 'string', received: 'number', path: ['title'], message: 'Expected string' },
    ];
    const err = new SpecForgeValidationError(issues);

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('SpecForgeValidationError');
    expect(err.message).toBe('Validation failed');
    expect(err.zodErrors).toBe(issues);
    expect(err.zodErrors).toHaveLength(1);
    expect(err.zodErrors[0].path).toEqual(['title']);
  });
});

describe('SpecForgeNotFoundError', () => {
  it('formats message with resource and id', () => {
    const err = new SpecForgeNotFoundError('SpecItem', 'item-123');

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('SpecForgeNotFoundError');
    expect(err.message).toBe('SpecItem not found: item-123');
    expect(err.resource).toBe('SpecItem');
    expect(err.id).toBe('item-123');
  });
});

describe('SpecForgeImmutableError', () => {
  it('formats message indicating immutability', () => {
    const err = new SpecForgeImmutableError('SpecIssueSnapshot');

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('SpecForgeImmutableError');
    expect(err.message).toBe('SpecIssueSnapshot is immutable and cannot be modified');
    expect(err.resource).toBe('SpecIssueSnapshot');
  });
});

describe('SpecForgeCapabilityError', () => {
  it('formats message with role and capability', () => {
    const err = new SpecForgeCapabilityError('viewer', 'edit_spec');

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('SpecForgeCapabilityError');
    expect(err.message).toBe('Role "viewer" lacks capability: edit_spec');
    expect(err.role).toBe('viewer');
    expect(err.capability).toBe('edit_spec');
  });
});
