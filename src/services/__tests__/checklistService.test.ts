/**
 * Checklist Service — validateTemplate unit tests
 *
 * Tests the pure validation function for checklist templates.
 * Validates: Requirements 3.1, 3.7
 */

import { describe, expect, it } from 'vitest';
import { validateTemplate, validateResponse, computeCounts, serializeTemplate, deserializeTemplate, failedItemToIssue, type TemplateValidationError } from '../checklistService';
import type { ChecklistTemplate, ChecklistItem, ChecklistInstance, ChecklistResponse } from '@/types';

function makeItem(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  return {
    id: 'item-1',
    prompt: 'Check wall alignment',
    responseType: 'pass_fail_na',
    order: 0,
    ...overrides,
  };
}

function makeTemplate(overrides: Partial<ChecklistTemplate> = {}): Partial<ChecklistTemplate> {
  return {
    id: 'tpl-1',
    projectId: 'proj-1',
    title: 'Structural Inspection',
    items: [makeItem()],
    createdBy: 'user-1',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('validateTemplate', () => {
  describe('valid templates', () => {
    it('accepts a template with 1 valid item', () => {
      const errors = validateTemplate(makeTemplate());
      expect(errors).toEqual([]);
    });

    it('accepts a template with 200 items', () => {
      const items = Array.from({ length: 200 }, (_, i) =>
        makeItem({ id: `item-${i}`, prompt: `Check item ${i}`, order: i })
      );
      const errors = validateTemplate(makeTemplate({ items }));
      expect(errors).toEqual([]);
    });

    it('accepts all valid response types', () => {
      const items: ChecklistItem[] = [
        makeItem({ id: '1', responseType: 'pass_fail_na', order: 0 }),
        makeItem({ id: '2', responseType: 'numeric', order: 1 }),
        makeItem({ id: '3', responseType: 'text', order: 2 }),
      ];
      const errors = validateTemplate(makeTemplate({ items }));
      expect(errors).toEqual([]);
    });

    it('accepts a prompt of exactly 1 character', () => {
      const errors = validateTemplate(makeTemplate({ items: [makeItem({ prompt: 'A' })] }));
      expect(errors).toEqual([]);
    });

    it('accepts a prompt of exactly 500 characters', () => {
      const prompt = 'x'.repeat(500);
      const errors = validateTemplate(makeTemplate({ items: [makeItem({ prompt })] }));
      expect(errors).toEqual([]);
    });
  });

  describe('items array validation', () => {
    it('rejects undefined items', () => {
      const errors = validateTemplate({ id: 'tpl-1', projectId: 'p', title: 't', createdBy: 'u', createdAt: 'c' });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({ field: 'items', code: 'required' });
    });

    it('rejects null items', () => {
      const errors = validateTemplate(makeTemplate({ items: null as any }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({ field: 'items', code: 'required' });
    });

    it('rejects empty items array', () => {
      const errors = validateTemplate(makeTemplate({ items: [] }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({ field: 'items', code: 'required' });
    });

    it('rejects more than 200 items', () => {
      const items = Array.from({ length: 201 }, (_, i) =>
        makeItem({ id: `item-${i}`, prompt: `Item ${i}`, order: i })
      );
      const errors = validateTemplate(makeTemplate({ items }));
      expect(errors.some(e => e.field === 'items' && e.code === 'too_many')).toBe(true);
    });
  });

  describe('item prompt validation', () => {
    it('rejects empty prompt', () => {
      const errors = validateTemplate(makeTemplate({ items: [makeItem({ prompt: '' })] }));
      expect(errors).toContainEqual(
        expect.objectContaining({ field: 'items[0].prompt', code: 'too_short' })
      );
    });

    it('rejects whitespace-only prompt', () => {
      const errors = validateTemplate(makeTemplate({ items: [makeItem({ prompt: '   ' })] }));
      expect(errors).toContainEqual(
        expect.objectContaining({ field: 'items[0].prompt', code: 'too_short' })
      );
    });

    it('rejects prompt longer than 500 characters', () => {
      const prompt = 'x'.repeat(501);
      const errors = validateTemplate(makeTemplate({ items: [makeItem({ prompt })] }));
      expect(errors).toContainEqual(
        expect.objectContaining({ field: 'items[0].prompt', code: 'too_long' })
      );
    });

    it('reports correct index for invalid prompts in multi-item templates', () => {
      const items = [
        makeItem({ id: '1', prompt: 'Valid', order: 0 }),
        makeItem({ id: '2', prompt: '', order: 1 }),
        makeItem({ id: '3', prompt: 'Also valid', order: 2 }),
      ];
      const errors = validateTemplate(makeTemplate({ items }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({ field: 'items[1].prompt', code: 'too_short' });
    });
  });

  describe('item responseType validation', () => {
    it('rejects invalid responseType', () => {
      const errors = validateTemplate(makeTemplate({
        items: [makeItem({ responseType: 'invalid' as any })],
      }));
      expect(errors).toContainEqual(
        expect.objectContaining({ field: 'items[0].responseType', code: 'invalid_value' })
      );
    });

    it('rejects undefined responseType', () => {
      const errors = validateTemplate(makeTemplate({
        items: [makeItem({ responseType: undefined as any })],
      }));
      expect(errors).toContainEqual(
        expect.objectContaining({ field: 'items[0].responseType', code: 'invalid_value' })
      );
    });

    it('reports correct index for invalid responseType', () => {
      const items = [
        makeItem({ id: '1', responseType: 'numeric', order: 0 }),
        makeItem({ id: '2', responseType: 'text', order: 1 }),
        makeItem({ id: '3', responseType: 'boolean' as any, order: 2 }),
      ];
      const errors = validateTemplate(makeTemplate({ items }));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({ field: 'items[2].responseType', code: 'invalid_value' });
    });
  });

  describe('multiple errors', () => {
    it('returns all errors for a template with multiple invalid items', () => {
      const items = [
        makeItem({ id: '1', prompt: '', responseType: 'invalid' as any, order: 0 }),
        makeItem({ id: '2', prompt: 'x'.repeat(501), responseType: 'pass_fail_na', order: 1 }),
      ];
      const errors = validateTemplate(makeTemplate({ items }));
      expect(errors.length).toBeGreaterThanOrEqual(3);
      expect(errors).toContainEqual(expect.objectContaining({ field: 'items[0].prompt', code: 'too_short' }));
      expect(errors).toContainEqual(expect.objectContaining({ field: 'items[0].responseType', code: 'invalid_value' }));
      expect(errors).toContainEqual(expect.objectContaining({ field: 'items[1].prompt', code: 'too_long' }));
    });
  });
});


/**
 * validateResponse unit tests
 *
 * Tests the pure validation function for checklist item responses.
 * Validates: Requirements 3.3, 3.8
 */
describe('validateResponse', () => {
  describe('pass_fail_na response type', () => {
    const item: ChecklistItem = { id: 'i1', prompt: 'Check alignment', responseType: 'pass_fail_na', order: 0 };

    it('accepts "pass"', () => {
      expect(validateResponse(item, 'pass')).toBe(true);
    });

    it('accepts "fail"', () => {
      expect(validateResponse(item, 'fail')).toBe(true);
    });

    it('accepts "na"', () => {
      expect(validateResponse(item, 'na')).toBe(true);
    });

    it('rejects an invalid string value', () => {
      expect(validateResponse(item, 'maybe')).toBe(false);
    });

    it('rejects a number value', () => {
      expect(validateResponse(item, 42)).toBe(false);
    });

    it('rejects null', () => {
      expect(validateResponse(item, null)).toBe(false);
    });

    it('rejects undefined', () => {
      expect(validateResponse(item, undefined)).toBe(false);
    });

    it('rejects an empty string', () => {
      expect(validateResponse(item, '')).toBe(false);
    });
  });

  describe('numeric response type', () => {
    const item: ChecklistItem = { id: 'i2', prompt: 'Measure thickness (mm)', responseType: 'numeric', order: 1 };

    it('accepts a positive integer', () => {
      expect(validateResponse(item, 10)).toBe(true);
    });

    it('accepts zero', () => {
      expect(validateResponse(item, 0)).toBe(true);
    });

    it('accepts a negative number', () => {
      expect(validateResponse(item, -5.5)).toBe(true);
    });

    it('accepts Infinity', () => {
      expect(validateResponse(item, Infinity)).toBe(true);
    });

    it('rejects NaN', () => {
      expect(validateResponse(item, NaN)).toBe(false);
    });

    it('rejects a numeric string', () => {
      expect(validateResponse(item, '42')).toBe(false);
    });

    it('rejects null', () => {
      expect(validateResponse(item, null)).toBe(false);
    });

    it('rejects undefined', () => {
      expect(validateResponse(item, undefined)).toBe(false);
    });
  });

  describe('text response type', () => {
    const item: ChecklistItem = { id: 'i3', prompt: 'Describe condition', responseType: 'text', order: 2 };

    it('accepts a short string', () => {
      expect(validateResponse(item, 'Minor crack noted')).toBe(true);
    });

    it('accepts an empty string', () => {
      expect(validateResponse(item, '')).toBe(true);
    });

    it('accepts a string of exactly 1000 characters', () => {
      expect(validateResponse(item, 'a'.repeat(1000))).toBe(true);
    });

    it('rejects a string exceeding 1000 characters', () => {
      expect(validateResponse(item, 'a'.repeat(1001))).toBe(false);
    });

    it('rejects a number', () => {
      expect(validateResponse(item, 99)).toBe(false);
    });

    it('rejects null', () => {
      expect(validateResponse(item, null)).toBe(false);
    });

    it('rejects undefined', () => {
      expect(validateResponse(item, undefined)).toBe(false);
    });

    it('rejects a boolean', () => {
      expect(validateResponse(item, true)).toBe(false);
    });
  });
});



/**
 * computeCounts unit tests
 *
 * Tests the pure count computation function for checklist instances.
 * Validates: Requirements 3.5, 3.10
 */
describe('computeCounts', () => {
  function makeInstance(overrides: Partial<ChecklistInstance> = {}): ChecklistInstance {
    return {
      id: 'inst-1',
      templateId: 'tpl-1',
      projectId: 'proj-1',
      location: 'Ground floor',
      items: [],
      responses: [],
      status: 'in_progress',
      ...overrides,
    };
  }

  it('returns all zeros for an instance with no items', () => {
    const result = computeCounts(makeInstance());
    expect(result).toEqual({ passCount: 0, failCount: 0, naCount: 0 });
  });

  it('counts pass responses for pass_fail_na items', () => {
    const items: ChecklistItem[] = [
      { id: 'a', prompt: 'Check A', responseType: 'pass_fail_na', order: 0 },
      { id: 'b', prompt: 'Check B', responseType: 'pass_fail_na', order: 1 },
    ];
    const responses: ChecklistResponse[] = [
      { itemId: 'a', value: 'pass' },
      { itemId: 'b', value: 'pass' },
    ];
    const result = computeCounts(makeInstance({ items, responses }));
    expect(result).toEqual({ passCount: 2, failCount: 0, naCount: 0 });
  });

  it('counts fail responses for pass_fail_na items', () => {
    const items: ChecklistItem[] = [
      { id: 'a', prompt: 'Check A', responseType: 'pass_fail_na', order: 0 },
      { id: 'b', prompt: 'Check B', responseType: 'pass_fail_na', order: 1 },
    ];
    const responses: ChecklistResponse[] = [
      { itemId: 'a', value: 'fail' },
      { itemId: 'b', value: 'fail' },
    ];
    const result = computeCounts(makeInstance({ items, responses }));
    expect(result).toEqual({ passCount: 0, failCount: 2, naCount: 0 });
  });

  it('counts na responses for pass_fail_na items', () => {
    const items: ChecklistItem[] = [
      { id: 'a', prompt: 'Check A', responseType: 'pass_fail_na', order: 0 },
    ];
    const responses: ChecklistResponse[] = [
      { itemId: 'a', value: 'na' },
    ];
    const result = computeCounts(makeInstance({ items, responses }));
    expect(result).toEqual({ passCount: 0, failCount: 0, naCount: 1 });
  });

  it('counts a mix of pass, fail, and na correctly', () => {
    const items: ChecklistItem[] = [
      { id: 'a', prompt: 'Check A', responseType: 'pass_fail_na', order: 0 },
      { id: 'b', prompt: 'Check B', responseType: 'pass_fail_na', order: 1 },
      { id: 'c', prompt: 'Check C', responseType: 'pass_fail_na', order: 2 },
      { id: 'd', prompt: 'Check D', responseType: 'pass_fail_na', order: 3 },
    ];
    const responses: ChecklistResponse[] = [
      { itemId: 'a', value: 'pass' },
      { itemId: 'b', value: 'fail' },
      { itemId: 'c', value: 'na' },
      { itemId: 'd', value: 'pass' },
    ];
    const result = computeCounts(makeInstance({ items, responses }));
    expect(result).toEqual({ passCount: 2, failCount: 1, naCount: 1 });
  });

  it('sum of counts equals number of pass_fail_na items with responses', () => {
    const items: ChecklistItem[] = [
      { id: 'a', prompt: 'Check A', responseType: 'pass_fail_na', order: 0 },
      { id: 'b', prompt: 'Check B', responseType: 'pass_fail_na', order: 1 },
      { id: 'c', prompt: 'Check C', responseType: 'pass_fail_na', order: 2 },
    ];
    const responses: ChecklistResponse[] = [
      { itemId: 'a', value: 'pass' },
      { itemId: 'b', value: 'fail' },
      { itemId: 'c', value: 'na' },
    ];
    const result = computeCounts(makeInstance({ items, responses }));
    expect(result.passCount + result.failCount + result.naCount).toBe(3);
  });

  it('ignores numeric items completely', () => {
    const items: ChecklistItem[] = [
      { id: 'a', prompt: 'Check A', responseType: 'pass_fail_na', order: 0 },
      { id: 'b', prompt: 'Measure B', responseType: 'numeric', order: 1 },
    ];
    const responses: ChecklistResponse[] = [
      { itemId: 'a', value: 'pass' },
      { itemId: 'b', value: 42 },
    ];
    const result = computeCounts(makeInstance({ items, responses }));
    expect(result).toEqual({ passCount: 1, failCount: 0, naCount: 0 });
  });

  it('ignores text items completely', () => {
    const items: ChecklistItem[] = [
      { id: 'a', prompt: 'Check A', responseType: 'pass_fail_na', order: 0 },
      { id: 'b', prompt: 'Describe B', responseType: 'text', order: 1 },
    ];
    const responses: ChecklistResponse[] = [
      { itemId: 'a', value: 'fail' },
      { itemId: 'b', value: 'Some description' },
    ];
    const result = computeCounts(makeInstance({ items, responses }));
    expect(result).toEqual({ passCount: 0, failCount: 1, naCount: 0 });
  });

  it('ignores pass_fail_na items that have no recorded response', () => {
    const items: ChecklistItem[] = [
      { id: 'a', prompt: 'Check A', responseType: 'pass_fail_na', order: 0 },
      { id: 'b', prompt: 'Check B', responseType: 'pass_fail_na', order: 1 },
    ];
    const responses: ChecklistResponse[] = [
      { itemId: 'a', value: 'pass' },
      // no response for item 'b'
    ];
    const result = computeCounts(makeInstance({ items, responses }));
    expect(result).toEqual({ passCount: 1, failCount: 0, naCount: 0 });
  });

  it('handles a mixed instance with all response types', () => {
    const items: ChecklistItem[] = [
      { id: 'a', prompt: 'Check alignment', responseType: 'pass_fail_na', order: 0 },
      { id: 'b', prompt: 'Measure width', responseType: 'numeric', order: 1 },
      { id: 'c', prompt: 'Check finish', responseType: 'pass_fail_na', order: 2 },
      { id: 'd', prompt: 'Describe condition', responseType: 'text', order: 3 },
      { id: 'e', prompt: 'Check level', responseType: 'pass_fail_na', order: 4 },
    ];
    const responses: ChecklistResponse[] = [
      { itemId: 'a', value: 'pass' },
      { itemId: 'b', value: 150 },
      { itemId: 'c', value: 'fail' },
      { itemId: 'd', value: 'Minor scratches noted' },
      { itemId: 'e', value: 'na' },
    ];
    const result = computeCounts(makeInstance({ items, responses }));
    expect(result).toEqual({ passCount: 1, failCount: 1, naCount: 1 });
    // Sum equals number of pass_fail_na items with responses (3)
    expect(result.passCount + result.failCount + result.naCount).toBe(3);
  });
});



/**
 * serializeTemplate / deserializeTemplate unit tests
 *
 * Tests the pure round-trip serialization functions for checklist templates.
 * Validates: Requirements 3.6, 3.11
 */
describe('serializeTemplate / deserializeTemplate', () => {
  function makeFullTemplate(overrides: Partial<ChecklistTemplate> = {}): ChecklistTemplate {
    return {
      id: 'tpl-1',
      projectId: 'proj-1',
      title: 'Structural Inspection',
      items: [
        { id: 'item-1', prompt: 'Check wall alignment', responseType: 'pass_fail_na', order: 0 },
        { id: 'item-2', prompt: 'Measure thickness (mm)', responseType: 'numeric', order: 1 },
        { id: 'item-3', prompt: 'Describe condition', responseType: 'text', order: 2 },
      ],
      createdBy: 'user-1',
      createdAt: '2026-01-15T10:30:00Z',
      ...overrides,
    };
  }

  describe('round-trip preserves all fields', () => {
    it('round-trips a template with multiple items', () => {
      const original = makeFullTemplate();
      const roundTripped = deserializeTemplate(serializeTemplate(original));
      expect(roundTripped).toEqual(original);
    });

    it('preserves item count', () => {
      const original = makeFullTemplate();
      const roundTripped = deserializeTemplate(serializeTemplate(original));
      expect(roundTripped.items.length).toBe(original.items.length);
    });

    it('preserves item order', () => {
      const original = makeFullTemplate();
      const roundTripped = deserializeTemplate(serializeTemplate(original));
      for (let i = 0; i < original.items.length; i++) {
        expect(roundTripped.items[i].order).toBe(original.items[i].order);
        expect(roundTripped.items[i].id).toBe(original.items[i].id);
      }
    });

    it('preserves each item id, prompt, responseType, and order', () => {
      const original = makeFullTemplate();
      const roundTripped = deserializeTemplate(serializeTemplate(original));
      for (let i = 0; i < original.items.length; i++) {
        expect(roundTripped.items[i].id).toBe(original.items[i].id);
        expect(roundTripped.items[i].prompt).toBe(original.items[i].prompt);
        expect(roundTripped.items[i].responseType).toBe(original.items[i].responseType);
        expect(roundTripped.items[i].order).toBe(original.items[i].order);
      }
    });

    it('preserves template-level fields: id, projectId, title, createdBy, createdAt', () => {
      const original = makeFullTemplate();
      const roundTripped = deserializeTemplate(serializeTemplate(original));
      expect(roundTripped.id).toBe(original.id);
      expect(roundTripped.projectId).toBe(original.projectId);
      expect(roundTripped.title).toBe(original.title);
      expect(roundTripped.createdBy).toBe(original.createdBy);
      expect(roundTripped.createdAt).toBe(original.createdAt);
    });
  });

  describe('edge cases', () => {
    it('round-trips a template with a single item', () => {
      const original = makeFullTemplate({
        items: [{ id: 'only-one', prompt: 'Solo check', responseType: 'pass_fail_na', order: 0 }],
      });
      const roundTripped = deserializeTemplate(serializeTemplate(original));
      expect(roundTripped).toEqual(original);
    });

    it('round-trips a template with 200 items (max count)', () => {
      const items: ChecklistItem[] = Array.from({ length: 200 }, (_, i) => ({
        id: `item-${i}`,
        prompt: `Check item number ${i}`,
        responseType: (['pass_fail_na', 'numeric', 'text'] as const)[i % 3],
        order: i,
      }));
      const original = makeFullTemplate({ items });
      const roundTripped = deserializeTemplate(serializeTemplate(original));
      expect(roundTripped).toEqual(original);
      expect(roundTripped.items.length).toBe(200);
    });

    it('round-trips a template with special characters in prompts', () => {
      const original = makeFullTemplate({
        items: [
          { id: 'sp-1', prompt: 'Check "quoted" value & <angle> brackets', responseType: 'text', order: 0 },
          { id: 'sp-2', prompt: 'Newline\nin\nprompt', responseType: 'pass_fail_na', order: 1 },
          { id: 'sp-3', prompt: 'Unicode: café → naïve', responseType: 'numeric', order: 2 },
        ],
      });
      const roundTripped = deserializeTemplate(serializeTemplate(original));
      expect(roundTripped).toEqual(original);
    });

    it('round-trips a template with a maximum-length prompt (500 chars)', () => {
      const longPrompt = 'x'.repeat(500);
      const original = makeFullTemplate({
        items: [{ id: 'long-1', prompt: longPrompt, responseType: 'pass_fail_na', order: 0 }],
      });
      const roundTripped = deserializeTemplate(serializeTemplate(original));
      expect(roundTripped.items[0].prompt).toBe(longPrompt);
      expect(roundTripped.items[0].prompt.length).toBe(500);
    });
  });

  describe('serialization output', () => {
    it('produces a valid JSON string', () => {
      const original = makeFullTemplate();
      const serialized = serializeTemplate(original);
      expect(() => JSON.parse(serialized)).not.toThrow();
    });

    it('produces a string type', () => {
      const original = makeFullTemplate();
      const serialized = serializeTemplate(original);
      expect(typeof serialized).toBe('string');
    });
  });

  describe('deserialization', () => {
    it('returns a ChecklistTemplate-shaped object from valid JSON', () => {
      const original = makeFullTemplate();
      const serialized = serializeTemplate(original);
      const result = deserializeTemplate(serialized);
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('projectId');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('createdBy');
      expect(result).toHaveProperty('createdAt');
      expect(Array.isArray(result.items)).toBe(true);
    });
  });
});



/**
 * failedItemToIssue unit tests
 *
 * Tests the pure conversion function from a failed checklist item to a FieldIssueDraft.
 * Validates: Requirements 3.4, 3.9
 */
describe('failedItemToIssue', () => {
  function makeInstance(overrides: Partial<ChecklistInstance> = {}): ChecklistInstance {
    return {
      id: 'inst-100',
      templateId: 'tpl-1',
      projectId: 'proj-1',
      location: 'Level 2 — East Wing',
      items: [
        { id: 'item-a', prompt: 'Check wall DPC continuity', responseType: 'pass_fail_na', order: 0 },
        { id: 'item-b', prompt: 'Measure slab thickness (mm)', responseType: 'numeric', order: 1 },
        { id: 'item-c', prompt: 'Verify fire door seal integrity', responseType: 'pass_fail_na', order: 2 },
      ],
      responses: [
        { itemId: 'item-a', value: 'fail' },
        { itemId: 'item-b', value: 120 },
        { itemId: 'item-c', value: 'pass' },
      ],
      status: 'in_progress',
      ...overrides,
    };
  }

  it('converts a failed item to a FieldIssueDraft with correct prompt', () => {
    const instance = makeInstance();
    const draft = failedItemToIssue(instance, 'item-a');
    expect(draft.prompt).toBe('Check wall DPC continuity');
  });

  it('carries the correct checklistRef with instanceId and itemId', () => {
    const instance = makeInstance();
    const draft = failedItemToIssue(instance, 'item-a');
    expect(draft.checklistRef).toEqual({ instanceId: 'inst-100', itemId: 'item-a' });
  });

  it('sets evidenceIds to an empty array', () => {
    const instance = makeInstance();
    const draft = failedItemToIssue(instance, 'item-a');
    expect(draft.evidenceIds).toEqual([]);
  });

  it('uses the instance location', () => {
    const instance = makeInstance();
    const draft = failedItemToIssue(instance, 'item-a');
    expect(draft.location).toBe('Level 2 — East Wing');
  });

  it('defaults severity to medium', () => {
    const instance = makeInstance();
    const draft = failedItemToIssue(instance, 'item-a');
    expect(draft.severity).toBe('medium');
  });

  it('works for any item in the list (not just the first)', () => {
    const instance = makeInstance();
    const draft = failedItemToIssue(instance, 'item-c');
    expect(draft.prompt).toBe('Verify fire door seal integrity');
    expect(draft.checklistRef).toEqual({ instanceId: 'inst-100', itemId: 'item-c' });
  });

  it('throws if itemId is not found in instance', () => {
    const instance = makeInstance();
    expect(() => failedItemToIssue(instance, 'non-existent')).toThrow();
  });

  it('throws with a descriptive error message for missing item', () => {
    const instance = makeInstance();
    expect(() => failedItemToIssue(instance, 'bad-id')).toThrow(
      'Checklist item "bad-id" not found in instance "inst-100"'
    );
  });

  it('returns all required FieldIssueDraft fields', () => {
    const instance = makeInstance();
    const draft = failedItemToIssue(instance, 'item-a');
    expect(draft).toHaveProperty('prompt');
    expect(draft).toHaveProperty('checklistRef');
    expect(draft).toHaveProperty('evidenceIds');
    expect(draft).toHaveProperty('location');
    expect(draft).toHaveProperty('severity');
  });
});



/**
 * createTemplate I/O function unit tests
 *
 * Tests the Firestore persistence function for checklist templates.
 * Validates: Requirements 3.1, 3.7
 */
import { vi, beforeEach } from 'vitest';
import * as firestore from 'firebase/firestore';

const addDocMock = vi.mocked(firestore.addDoc) as any;
const collectionMock = vi.mocked(firestore.collection) as any;

vi.mock('@/lib/firebase', () => ({
  db: { name: 'mock-db' },
  OperationType: {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    LIST: 'list',
    GET: 'get',
    WRITE: 'write',
  },
  handleFirestoreError: vi.fn((error: unknown) => { throw error; }),
}));

vi.mock('@/demo-seed/demoFirestore', () => ({
  getDemoCol: vi.fn((...segments: string[]) => ({ type: 'collection', path: segments })),
  getDemoDoc: vi.fn((...segments: string[]) => ({ type: 'document', path: segments })),
}));

describe('createTemplate (I/O)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addDocMock.mockResolvedValue({ id: 'generated-tpl-id-001' });
  });

  it('persists a valid template and returns it with generated id and createdAt', async () => {
    const { createTemplate } = await import('../checklistService');

    const input = {
      projectId: 'proj-1',
      title: 'Fire Safety Inspection',
      items: [
        { id: 'item-1', prompt: 'Check fire door seals', responseType: 'pass_fail_na' as const, order: 0 },
        { id: 'item-2', prompt: 'Measure escape route width', responseType: 'numeric' as const, order: 1 },
      ],
      createdBy: 'user-bep-1',
    };

    const result = await createTemplate(input);

    expect(result.id).toBe('generated-tpl-id-001');
    expect(result.projectId).toBe('proj-1');
    expect(result.title).toBe('Fire Safety Inspection');
    expect(result.items).toEqual(input.items);
    expect(result.createdBy).toBe('user-bep-1');
    expect(result.createdAt).toBeDefined();
    // createdAt should be a valid ISO timestamp
    expect(new Date(result.createdAt).toISOString()).toBe(result.createdAt);
  });

  it('calls addDoc with the correct Firestore collection path', async () => {
    const { createTemplate } = await import('../checklistService');
    const { getDemoCol } = await import('@/demo-seed/demoFirestore');

    const input = {
      projectId: 'proj-42',
      title: 'Structural Check',
      items: [{ id: 'item-1', prompt: 'Check alignment', responseType: 'pass_fail_na' as const, order: 0 }],
      createdBy: 'user-eng-1',
    };

    await createTemplate(input);

    expect(getDemoCol).toHaveBeenCalledWith('projects', 'proj-42', 'checklist_templates');
    expect(addDocMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        projectId: 'proj-42',
        title: 'Structural Check',
        items: input.items,
        createdBy: 'user-eng-1',
      }),
    );
  });

  it('assigns createdAt as current ISO timestamp', async () => {
    const { createTemplate } = await import('../checklistService');

    const before = new Date().toISOString();
    const result = await createTemplate({
      projectId: 'proj-1',
      title: 'Test',
      items: [{ id: 'i1', prompt: 'Check something', responseType: 'text' as const, order: 0 }],
      createdBy: 'user-1',
    });
    const after = new Date().toISOString();

    expect(result.createdAt >= before).toBe(true);
    expect(result.createdAt <= after).toBe(true);
  });

  it('throws validation error for invalid template (no items)', async () => {
    const { createTemplate } = await import('../checklistService');

    await expect(
      createTemplate({
        projectId: 'proj-1',
        title: 'Empty Template',
        items: [],
        createdBy: 'user-1',
      }),
    ).rejects.toThrow('Template validation failed');
  });

  it('throws validation error for invalid item prompt', async () => {
    const { createTemplate } = await import('../checklistService');

    await expect(
      createTemplate({
        projectId: 'proj-1',
        title: 'Bad Template',
        items: [{ id: 'i1', prompt: '', responseType: 'pass_fail_na' as const, order: 0 }],
        createdBy: 'user-1',
      }),
    ).rejects.toThrow('Template validation failed');
  });

  it('does not call addDoc when validation fails', async () => {
    const { createTemplate } = await import('../checklistService');

    try {
      await createTemplate({
        projectId: 'proj-1',
        title: 'Bad',
        items: [],
        createdBy: 'user-1',
      });
    } catch {
      // expected
    }

    expect(addDocMock).not.toHaveBeenCalled();
  });

  it('propagates Firestore errors through handleFirestoreError', async () => {
    addDocMock.mockRejectedValue(new Error('PERMISSION_DENIED'));

    const { createTemplate } = await import('../checklistService');

    await expect(
      createTemplate({
        projectId: 'proj-1',
        title: 'Valid Template',
        items: [{ id: 'i1', prompt: 'Check wall', responseType: 'pass_fail_na' as const, order: 0 }],
        createdBy: 'user-1',
      }),
    ).rejects.toThrow('PERMISSION_DENIED');
  });
});


/**
 * startInstance I/O function unit tests
 *
 * Tests the Firestore persistence function for creating a checklist instance from a template.
 * Validates: Requirements 3.2, 3.7
 */
const getDocMock = vi.mocked(firestore.getDoc) as any;
const updateDocMockTop = vi.mocked(firestore.updateDoc) as any;

// Helper to create a mock Firestore snapshot
function snap(id: string, data: Record<string, unknown> | null) {
  return {
    id,
    exists: () => data !== null,
    data: () => data,
  };
}

describe('startInstance (I/O)', () => {
  const templateItems = [
    { id: 'item-1', prompt: 'Check wall alignment', responseType: 'pass_fail_na', order: 0 },
    { id: 'item-2', prompt: 'Measure slab thickness', responseType: 'numeric', order: 1 },
    { id: 'item-3', prompt: 'Describe surface condition', responseType: 'text', order: 2 },
  ];

  const templateData = {
    projectId: 'proj-1',
    title: 'Structural Inspection',
    items: templateItems,
    createdBy: 'user-bep-1',
    createdAt: '2026-01-15T10:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    addDocMock.mockResolvedValue({ id: 'generated-inst-id-001' });
    getDocMock.mockResolvedValue(snap('tpl-1', templateData));
  });

  it('creates an instance from a valid template and returns it', async () => {
    const { startInstance } = await import('../checklistService');

    const result = await startInstance('tpl-1', 'proj-1', 'Ground floor — East Wing');

    expect(result.id).toBe('generated-inst-id-001');
    expect(result.templateId).toBe('tpl-1');
    expect(result.projectId).toBe('proj-1');
    expect(result.location).toBe('Ground floor — East Wing');
    expect(result.status).toBe('in_progress');
    expect(result.responses).toEqual([]);
  });

  it('copies template items in order', async () => {
    const { startInstance } = await import('../checklistService');

    const result = await startInstance('tpl-1', 'proj-1', 'Level 2');

    expect(result.items).toHaveLength(3);
    expect(result.items[0]).toEqual({ id: 'item-1', prompt: 'Check wall alignment', responseType: 'pass_fail_na', order: 0 });
    expect(result.items[1]).toEqual({ id: 'item-2', prompt: 'Measure slab thickness', responseType: 'numeric', order: 1 });
    expect(result.items[2]).toEqual({ id: 'item-3', prompt: 'Describe surface condition', responseType: 'text', order: 2 });
  });

  it('instance items match template items exactly in count and definition', async () => {
    const { startInstance } = await import('../checklistService');

    const result = await startInstance('tpl-1', 'proj-1', 'Roof');

    expect(result.items.length).toBe(templateItems.length);
    for (let i = 0; i < templateItems.length; i++) {
      expect(result.items[i].id).toBe(templateItems[i].id);
      expect(result.items[i].prompt).toBe(templateItems[i].prompt);
      expect(result.items[i].responseType).toBe(templateItems[i].responseType);
      expect(result.items[i].order).toBe(templateItems[i].order);
    }
  });

  it('initializes responses as empty array', async () => {
    const { startInstance } = await import('../checklistService');

    const result = await startInstance('tpl-1', 'proj-1', 'Basement');

    expect(result.responses).toEqual([]);
    expect(result.responses).toHaveLength(0);
  });

  it('calls getDemoDoc with correct template path', async () => {
    const { startInstance } = await import('../checklistService');
    const { getDemoDoc } = await import('@/demo-seed/demoFirestore');

    await startInstance('tpl-42', 'proj-7', 'Site entrance');

    expect(getDemoDoc).toHaveBeenCalledWith('projects', 'proj-7', 'checklist_templates', 'tpl-42');
  });

  it('calls addDoc with the correct instances collection path', async () => {
    const { startInstance } = await import('../checklistService');
    const { getDemoCol } = await import('@/demo-seed/demoFirestore');

    await startInstance('tpl-1', 'proj-1', 'Level 3');

    expect(getDemoCol).toHaveBeenCalledWith('projects', 'proj-1', 'checklist_instances');
  });

  it('persists correct payload via addDoc', async () => {
    const { startInstance } = await import('../checklistService');

    await startInstance('tpl-1', 'proj-1', 'Parking garage');

    expect(addDocMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        templateId: 'tpl-1',
        projectId: 'proj-1',
        location: 'Parking garage',
        items: templateItems,
        responses: [],
        status: 'in_progress',
      }),
    );
  });

  it('throws when template is not found', async () => {
    getDocMock.mockResolvedValue(snap('missing-tpl', null));

    const { startInstance } = await import('../checklistService');

    await expect(
      startInstance('missing-tpl', 'proj-1', 'Roof')
    ).rejects.toThrow('Checklist template "missing-tpl" not found in project "proj-1"');
  });

  it('does not call addDoc when template is not found', async () => {
    getDocMock.mockResolvedValue(snap('bad-id', null));

    const { startInstance } = await import('../checklistService');

    try {
      await startInstance('bad-id', 'proj-1', 'Roof');
    } catch {
      // expected
    }

    expect(addDocMock).not.toHaveBeenCalled();
  });

  it('propagates Firestore write errors through handleFirestoreError', async () => {
    addDocMock.mockRejectedValue(new Error('PERMISSION_DENIED'));

    const { startInstance } = await import('../checklistService');

    await expect(
      startInstance('tpl-1', 'proj-1', 'Level 1')
    ).rejects.toThrow('PERMISSION_DENIED');
  });
});


/**
 * recordResponse I/O function unit tests
 *
 * Tests the Firestore persistence function for recording a response to a checklist instance item.
 * Validates: Requirements 3.3, 3.8
 */
const updateDocMock = vi.mocked(firestore.updateDoc) as any;

describe('recordResponse (I/O)', () => {
  const instanceItems = [
    { id: 'item-1', prompt: 'Check wall alignment', responseType: 'pass_fail_na', order: 0 },
    { id: 'item-2', prompt: 'Measure slab thickness', responseType: 'numeric', order: 1 },
    { id: 'item-3', prompt: 'Describe surface condition', responseType: 'text', order: 2 },
  ];

  const instanceData = {
    templateId: 'tpl-1',
    projectId: 'proj-1',
    location: 'Ground floor',
    items: instanceItems,
    responses: [],
    status: 'in_progress',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getDocMock.mockResolvedValue(snap('inst-1', instanceData));
    updateDocMock.mockResolvedValue(undefined);
  });

  it('records a valid pass_fail_na response and returns updated instance', async () => {
    const { recordResponse } = await import('../checklistService');

    const result = await recordResponse('proj-1', 'inst-1', 'item-1', 'pass');

    expect(result.id).toBe('inst-1');
    expect(result.responses).toHaveLength(1);
    expect(result.responses[0]).toEqual({ itemId: 'item-1', value: 'pass' });
  });

  it('records a valid numeric response', async () => {
    const { recordResponse } = await import('../checklistService');

    const result = await recordResponse('proj-1', 'inst-1', 'item-2', 42);

    expect(result.responses).toHaveLength(1);
    expect(result.responses[0]).toEqual({ itemId: 'item-2', value: 42 });
  });

  it('records a valid text response', async () => {
    const { recordResponse } = await import('../checklistService');

    const result = await recordResponse('proj-1', 'inst-1', 'item-3', 'Minor crack noted');

    expect(result.responses).toHaveLength(1);
    expect(result.responses[0]).toEqual({ itemId: 'item-3', value: 'Minor crack noted' });
  });

  it('upserts an existing response (replaces by itemId)', async () => {
    const instanceWithResponse = {
      ...instanceData,
      responses: [{ itemId: 'item-1', value: 'fail' }],
    };
    getDocMock.mockResolvedValue(snap('inst-1', instanceWithResponse));

    const { recordResponse } = await import('../checklistService');

    const result = await recordResponse('proj-1', 'inst-1', 'item-1', 'pass');

    expect(result.responses).toHaveLength(1);
    expect(result.responses[0]).toEqual({ itemId: 'item-1', value: 'pass' });
  });

  it('preserves other responses when adding a new one', async () => {
    const instanceWithExisting = {
      ...instanceData,
      responses: [{ itemId: 'item-1', value: 'pass' }],
    };
    getDocMock.mockResolvedValue(snap('inst-1', instanceWithExisting));

    const { recordResponse } = await import('../checklistService');

    const result = await recordResponse('proj-1', 'inst-1', 'item-2', 100);

    expect(result.responses).toHaveLength(2);
    expect(result.responses[0]).toEqual({ itemId: 'item-1', value: 'pass' });
    expect(result.responses[1]).toEqual({ itemId: 'item-2', value: 100 });
  });

  it('calls getDemoDoc with correct instance path', async () => {
    const { recordResponse } = await import('../checklistService');
    const { getDemoDoc } = await import('@/demo-seed/demoFirestore');

    await recordResponse('proj-7', 'inst-99', 'item-1', 'na');

    expect(getDemoDoc).toHaveBeenCalledWith('projects', 'proj-7', 'checklist_instances', 'inst-99');
  });

  it('calls updateDoc with the updated responses array', async () => {
    const { recordResponse } = await import('../checklistService');

    await recordResponse('proj-1', 'inst-1', 'item-1', 'fail');

    expect(updateDocMock).toHaveBeenCalledTimes(1);
    expect(updateDocMock).toHaveBeenCalledWith(
      expect.anything(),
      { responses: [{ itemId: 'item-1', value: 'fail' }] },
    );
  });

  it('throws when instance is not found', async () => {
    getDocMock.mockResolvedValue(snap('missing-inst', null));

    const { recordResponse } = await import('../checklistService');

    await expect(
      recordResponse('proj-1', 'missing-inst', 'item-1', 'pass')
    ).rejects.toThrow('Checklist instance "missing-inst" not found in project "proj-1"');
  });

  it('throws when itemId is not found in instance', async () => {
    const { recordResponse } = await import('../checklistService');

    await expect(
      recordResponse('proj-1', 'inst-1', 'non-existent-item', 'pass')
    ).rejects.toThrow('Checklist item "non-existent-item" not found in instance "inst-1"');
  });

  it('throws for invalid response (wrong type for pass_fail_na)', async () => {
    const { recordResponse } = await import('../checklistService');

    await expect(
      recordResponse('proj-1', 'inst-1', 'item-1', 'invalid_value')
    ).rejects.toThrow('Invalid response for item "item-1": expected response type "pass_fail_na"');
  });

  it('throws for invalid response (string for numeric item)', async () => {
    const { recordResponse } = await import('../checklistService');

    await expect(
      recordResponse('proj-1', 'inst-1', 'item-2', 'not_a_number')
    ).rejects.toThrow('Invalid response for item "item-2": expected response type "numeric"');
  });

  it('throws for invalid response (text exceeding 1000 chars)', async () => {
    const { recordResponse } = await import('../checklistService');

    await expect(
      recordResponse('proj-1', 'inst-1', 'item-3', 'x'.repeat(1001))
    ).rejects.toThrow('Invalid response for item "item-3": expected response type "text"');
  });

  it('does not call updateDoc when validation fails', async () => {
    const { recordResponse } = await import('../checklistService');

    try {
      await recordResponse('proj-1', 'inst-1', 'item-1', 999);
    } catch {
      // expected
    }

    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it('does not call updateDoc when item is not found', async () => {
    const { recordResponse } = await import('../checklistService');

    try {
      await recordResponse('proj-1', 'inst-1', 'bad-id', 'pass');
    } catch {
      // expected
    }

    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it('leaves existing responses unchanged when validation fails', async () => {
    const instanceWithResponse = {
      ...instanceData,
      responses: [{ itemId: 'item-1', value: 'pass' }],
    };
    getDocMock.mockResolvedValue(snap('inst-1', instanceWithResponse));

    const { recordResponse } = await import('../checklistService');

    await expect(
      recordResponse('proj-1', 'inst-1', 'item-1', 42)
    ).rejects.toThrow();

    // updateDoc should not be called — existing response preserved
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it('propagates Firestore update errors through handleFirestoreError', async () => {
    updateDocMock.mockRejectedValue(new Error('PERMISSION_DENIED'));

    const { recordResponse } = await import('../checklistService');

    await expect(
      recordResponse('proj-1', 'inst-1', 'item-1', 'pass')
    ).rejects.toThrow('PERMISSION_DENIED');
  });
});



/**
 * completeInstance I/O function unit tests
 *
 * Tests the Firestore persistence function for completing a checklist instance with computed counts.
 * Validates: Requirements 3.5
 */
describe('completeInstance (I/O)', () => {
  const instanceItems = [
    { id: 'item-1', prompt: 'Check wall alignment', responseType: 'pass_fail_na', order: 0 },
    { id: 'item-2', prompt: 'Measure slab thickness', responseType: 'numeric', order: 1 },
    { id: 'item-3', prompt: 'Check fire door seals', responseType: 'pass_fail_na', order: 2 },
    { id: 'item-4', prompt: 'Verify level', responseType: 'pass_fail_na', order: 3 },
  ];

  const instanceData = {
    templateId: 'tpl-1',
    projectId: 'proj-1',
    location: 'Ground floor — East Wing',
    items: instanceItems,
    responses: [
      { itemId: 'item-1', value: 'pass' },
      { itemId: 'item-2', value: 150 },
      { itemId: 'item-3', value: 'fail' },
      { itemId: 'item-4', value: 'na' },
    ],
    status: 'in_progress',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getDocMock.mockResolvedValue(snap('inst-1', instanceData));
    updateDocMockTop.mockResolvedValue(undefined);
  });

  it('computes counts and marks instance as completed', async () => {
    const { completeInstance } = await import('../checklistService');

    const result = await completeInstance('proj-1', 'inst-1');

    expect(result.status).toBe('completed');
    expect(result.passCount).toBe(1);
    expect(result.failCount).toBe(1);
    expect(result.naCount).toBe(1);
  });

  it('returns the full instance with id, items, and responses', async () => {
    const { completeInstance } = await import('../checklistService');

    const result = await completeInstance('proj-1', 'inst-1');

    expect(result.id).toBe('inst-1');
    expect(result.templateId).toBe('tpl-1');
    expect(result.projectId).toBe('proj-1');
    expect(result.location).toBe('Ground floor — East Wing');
    expect(result.items).toHaveLength(4);
    expect(result.responses).toHaveLength(4);
  });

  it('persists status, passCount, failCount, naCount via updateDoc', async () => {
    const { completeInstance } = await import('../checklistService');

    await completeInstance('proj-1', 'inst-1');

    expect(updateDocMockTop).toHaveBeenCalledTimes(1);
    expect(updateDocMockTop).toHaveBeenCalledWith(
      expect.anything(),
      {
        status: 'completed',
        passCount: 1,
        failCount: 1,
        naCount: 1,
      },
    );
  });

  it('calls getDemoDoc with correct instance path', async () => {
    const { completeInstance } = await import('../checklistService');
    const { getDemoDoc } = await import('@/demo-seed/demoFirestore');

    await completeInstance('proj-7', 'inst-99');

    expect(getDemoDoc).toHaveBeenCalledWith('projects', 'proj-7', 'checklist_instances', 'inst-99');
  });

  it('throws when instance is not found', async () => {
    getDocMock.mockResolvedValue(snap('missing-inst', null));

    const { completeInstance } = await import('../checklistService');

    await expect(
      completeInstance('proj-1', 'missing-inst')
    ).rejects.toThrow('Checklist instance "missing-inst" not found in project "proj-1"');
  });

  it('does not call updateDoc when instance is not found', async () => {
    getDocMock.mockResolvedValue(snap('bad-id', null));

    const { completeInstance } = await import('../checklistService');

    try {
      await completeInstance('proj-1', 'bad-id');
    } catch {
      // expected
    }

    expect(updateDocMockTop).not.toHaveBeenCalled();
  });

  it('computes all zeros when no pass_fail_na responses are recorded', async () => {
    const noResponseInstance = {
      ...instanceData,
      items: [
        { id: 'item-1', prompt: 'Measure width', responseType: 'numeric', order: 0 },
        { id: 'item-2', prompt: 'Describe condition', responseType: 'text', order: 1 },
      ],
      responses: [
        { itemId: 'item-1', value: 42 },
        { itemId: 'item-2', value: 'Good condition' },
      ],
    };
    getDocMock.mockResolvedValue(snap('inst-2', noResponseInstance));

    const { completeInstance } = await import('../checklistService');

    const result = await completeInstance('proj-1', 'inst-2');

    expect(result.passCount).toBe(0);
    expect(result.failCount).toBe(0);
    expect(result.naCount).toBe(0);
    expect(result.status).toBe('completed');
  });

  it('handles instance with all pass responses', async () => {
    const allPassInstance = {
      ...instanceData,
      items: [
        { id: 'a', prompt: 'Check A', responseType: 'pass_fail_na', order: 0 },
        { id: 'b', prompt: 'Check B', responseType: 'pass_fail_na', order: 1 },
        { id: 'c', prompt: 'Check C', responseType: 'pass_fail_na', order: 2 },
      ],
      responses: [
        { itemId: 'a', value: 'pass' },
        { itemId: 'b', value: 'pass' },
        { itemId: 'c', value: 'pass' },
      ],
    };
    getDocMock.mockResolvedValue(snap('inst-3', allPassInstance));

    const { completeInstance } = await import('../checklistService');

    const result = await completeInstance('proj-1', 'inst-3');

    expect(result.passCount).toBe(3);
    expect(result.failCount).toBe(0);
    expect(result.naCount).toBe(0);
  });

  it('propagates Firestore update errors through handleFirestoreError', async () => {
    updateDocMockTop.mockRejectedValue(new Error('PERMISSION_DENIED'));

    const { completeInstance } = await import('../checklistService');

    await expect(
      completeInstance('proj-1', 'inst-1')
    ).rejects.toThrow('PERMISSION_DENIED');
  });
});
