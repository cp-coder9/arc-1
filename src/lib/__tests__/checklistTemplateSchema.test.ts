/**
 * checklistTemplateSchema — Unit tests
 *
 * Validates that the Zod schema enforces the same rules as validateTemplate:
 * - items: array of 1–200 checklist items (Req 3.1)
 * - item.prompt: 1–500 characters (Req 3.1, 3.7)
 * - item.responseType: enum of 'pass_fail_na' | 'numeric' | 'text' (Req 3.1, 3.7)
 * - item.id: non-empty string
 * - item.order: non-negative integer
 * - projectId, title, createdBy: non-empty strings
 * - id, createdAt: optional strings
 */

import { describe, expect, it } from 'vitest';
import { checklistTemplateSchema, checklistItemSchema } from '../schemas';

function makeItem(overrides: Partial<{ id: string; prompt: string; responseType: string; order: number }> = {}) {
  return {
    id: overrides.id ?? 'item-1',
    prompt: overrides.prompt ?? 'Check this item',
    responseType: overrides.responseType ?? 'pass_fail_na',
    order: overrides.order ?? 0,
  };
}

function makeTemplate(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    projectId: 'proj-1',
    title: 'Inspection Template',
    items: [makeItem()],
    createdBy: 'user-1',
    ...overrides,
  };
}

describe('checklistItemSchema', () => {
  it('accepts a valid item', () => {
    const result = checklistItemSchema.safeParse(makeItem());
    expect(result.success).toBe(true);
  });

  it('rejects empty id', () => {
    const result = checklistItemSchema.safeParse(makeItem({ id: '' }));
    expect(result.success).toBe(false);
  });

  it('rejects empty prompt', () => {
    const result = checklistItemSchema.safeParse(makeItem({ prompt: '' }));
    expect(result.success).toBe(false);
  });

  it('rejects prompt longer than 500 characters', () => {
    const result = checklistItemSchema.safeParse(makeItem({ prompt: 'x'.repeat(501) }));
    expect(result.success).toBe(false);
  });

  it('accepts prompt of exactly 500 characters', () => {
    const result = checklistItemSchema.safeParse(makeItem({ prompt: 'x'.repeat(500) }));
    expect(result.success).toBe(true);
  });

  it('accepts prompt of exactly 1 character', () => {
    const result = checklistItemSchema.safeParse(makeItem({ prompt: 'A' }));
    expect(result.success).toBe(true);
  });

  it('rejects invalid responseType', () => {
    const result = checklistItemSchema.safeParse(makeItem({ responseType: 'boolean' }));
    expect(result.success).toBe(false);
  });

  it('accepts all valid responseType values', () => {
    for (const rt of ['pass_fail_na', 'numeric', 'text']) {
      const result = checklistItemSchema.safeParse(makeItem({ responseType: rt }));
      expect(result.success).toBe(true);
    }
  });

  it('rejects negative order', () => {
    const result = checklistItemSchema.safeParse(makeItem({ order: -1 }));
    expect(result.success).toBe(false);
  });

  it('rejects non-integer order', () => {
    const result = checklistItemSchema.safeParse(makeItem({ order: 1.5 }));
    expect(result.success).toBe(false);
  });

  it('accepts order = 0', () => {
    const result = checklistItemSchema.safeParse(makeItem({ order: 0 }));
    expect(result.success).toBe(true);
  });
});

describe('checklistTemplateSchema', () => {
  describe('valid templates', () => {
    it('accepts a template with 1 valid item', () => {
      const result = checklistTemplateSchema.safeParse(makeTemplate());
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(1);
        expect(result.data.projectId).toBe('proj-1');
      }
    });

    it('accepts a template with 200 items (max)', () => {
      const items = Array.from({ length: 200 }, (_, i) =>
        makeItem({ id: `item-${i}`, prompt: `Check item ${i}`, order: i })
      );
      const result = checklistTemplateSchema.safeParse(makeTemplate({ items }));
      expect(result.success).toBe(true);
    });

    it('accepts all three response types across items', () => {
      const items = [
        makeItem({ id: '1', responseType: 'pass_fail_na', order: 0 }),
        makeItem({ id: '2', responseType: 'numeric', order: 1 }),
        makeItem({ id: '3', responseType: 'text', order: 2 }),
      ];
      const result = checklistTemplateSchema.safeParse(makeTemplate({ items }));
      expect(result.success).toBe(true);
    });

    it('accepts optional id field', () => {
      const result = checklistTemplateSchema.safeParse(makeTemplate({ id: 'tpl-1' }));
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('tpl-1');
      }
    });

    it('accepts template without id field', () => {
      const result = checklistTemplateSchema.safeParse(makeTemplate());
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBeUndefined();
      }
    });

    it('accepts optional createdAt field', () => {
      const result = checklistTemplateSchema.safeParse(makeTemplate({ createdAt: '2026-01-01T00:00:00Z' }));
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.createdAt).toBe('2026-01-01T00:00:00Z');
      }
    });
  });

  describe('items array validation', () => {
    it('rejects empty items array', () => {
      const result = checklistTemplateSchema.safeParse(makeTemplate({ items: [] }));
      expect(result.success).toBe(false);
      if (!result.success) {
        const itemsIssue = result.error.issues.find(i => i.path.includes('items'));
        expect(itemsIssue).toBeDefined();
      }
    });

    it('rejects more than 200 items', () => {
      const items = Array.from({ length: 201 }, (_, i) =>
        makeItem({ id: `item-${i}`, prompt: `Item ${i}`, order: i })
      );
      const result = checklistTemplateSchema.safeParse(makeTemplate({ items }));
      expect(result.success).toBe(false);
      if (!result.success) {
        const itemsIssue = result.error.issues.find(i => i.path.includes('items'));
        expect(itemsIssue).toBeDefined();
      }
    });

    it('rejects missing items field', () => {
      const { items: _removed, ...noItems } = makeTemplate();
      const result = checklistTemplateSchema.safeParse(noItems);
      expect(result.success).toBe(false);
    });
  });

  describe('item prompt validation', () => {
    it('rejects empty prompt in an item', () => {
      const result = checklistTemplateSchema.safeParse(
        makeTemplate({ items: [makeItem({ prompt: '' })] })
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const promptIssue = result.error.issues.find(i =>
          i.path.includes('prompt') || i.path.some(p => String(p).includes('prompt'))
        );
        expect(promptIssue).toBeDefined();
      }
    });

    it('rejects prompt longer than 500 characters', () => {
      const result = checklistTemplateSchema.safeParse(
        makeTemplate({ items: [makeItem({ prompt: 'x'.repeat(501) })] })
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const promptIssue = result.error.issues.find(i =>
          i.path.includes('prompt') || i.path.some(p => String(p).includes('prompt'))
        );
        expect(promptIssue).toBeDefined();
      }
    });
  });

  describe('item responseType validation', () => {
    it('rejects invalid responseType', () => {
      const result = checklistTemplateSchema.safeParse(
        makeTemplate({ items: [makeItem({ responseType: 'invalid' })] })
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const rtIssue = result.error.issues.find(i =>
          i.path.includes('responseType') || i.path.some(p => String(p).includes('responseType'))
        );
        expect(rtIssue).toBeDefined();
      }
    });

    it('rejects undefined responseType', () => {
      const item = { id: 'item-1', prompt: 'Check this', order: 0 };
      const result = checklistTemplateSchema.safeParse(
        makeTemplate({ items: [item] })
      );
      expect(result.success).toBe(false);
    });
  });

  describe('required fields validation', () => {
    it('rejects empty projectId', () => {
      const result = checklistTemplateSchema.safeParse(makeTemplate({ projectId: '' }));
      expect(result.success).toBe(false);
    });

    it('rejects missing projectId', () => {
      const { projectId: _removed, ...noProject } = makeTemplate();
      const result = checklistTemplateSchema.safeParse(noProject);
      expect(result.success).toBe(false);
    });

    it('rejects empty title', () => {
      const result = checklistTemplateSchema.safeParse(makeTemplate({ title: '' }));
      expect(result.success).toBe(false);
    });

    it('rejects missing title', () => {
      const { title: _removed, ...noTitle } = makeTemplate();
      const result = checklistTemplateSchema.safeParse(noTitle);
      expect(result.success).toBe(false);
    });

    it('rejects empty createdBy', () => {
      const result = checklistTemplateSchema.safeParse(makeTemplate({ createdBy: '' }));
      expect(result.success).toBe(false);
    });

    it('rejects missing createdBy', () => {
      const { createdBy: _removed, ...noCreatedBy } = makeTemplate();
      const result = checklistTemplateSchema.safeParse(noCreatedBy);
      expect(result.success).toBe(false);
    });
  });

  describe('multiple validation errors', () => {
    it('reports errors for invalid items within the array', () => {
      const items = [
        makeItem({ id: '1', prompt: '', order: 0 }),
        makeItem({ id: '2', prompt: 'x'.repeat(501), responseType: 'invalid', order: 1 }),
      ];
      const result = checklistTemplateSchema.safeParse(makeTemplate({ items }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThanOrEqual(2);
      }
    });
  });
});
