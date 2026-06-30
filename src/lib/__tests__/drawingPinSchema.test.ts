/**
 * drawingPinSchema — Unit tests
 *
 * Validates that the Zod schema enforces the same rules as validateDrawingPin:
 * - drawingId: non-empty string (Req 1.1)
 * - x, y: numbers between 0 and 1 inclusive (Req 1.4)
 */

import { describe, expect, it } from 'vitest';
import { drawingPinSchema } from '../schemas';

describe('drawingPinSchema', () => {
  describe('valid pins', () => {
    it('accepts a pin with non-empty drawingId, x and y within [0, 1]', () => {
      const result = drawingPinSchema.safeParse({ drawingId: 'dwg-001', x: 0.5, y: 0.5 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ drawingId: 'dwg-001', x: 0.5, y: 0.5 });
      }
    });

    it('accepts boundary x=0, y=0', () => {
      const result = drawingPinSchema.safeParse({ drawingId: 'dwg-002', x: 0, y: 0 });
      expect(result.success).toBe(true);
    });

    it('accepts boundary x=1, y=1', () => {
      const result = drawingPinSchema.safeParse({ drawingId: 'dwg-003', x: 1, y: 1 });
      expect(result.success).toBe(true);
    });

    it('accepts x=0, y=1 and x=1, y=0', () => {
      expect(drawingPinSchema.safeParse({ drawingId: 'a', x: 0, y: 1 }).success).toBe(true);
      expect(drawingPinSchema.safeParse({ drawingId: 'b', x: 1, y: 0 }).success).toBe(true);
    });
  });

  describe('drawingId validation', () => {
    it('rejects empty string drawingId', () => {
      const result = drawingPinSchema.safeParse({ drawingId: '', x: 0.5, y: 0.5 });
      expect(result.success).toBe(false);
      if (!result.success) {
        const fields = result.error.issues.map(i => i.path[0]);
        expect(fields).toContain('drawingId');
      }
    });

    it('rejects missing drawingId', () => {
      const result = drawingPinSchema.safeParse({ x: 0.5, y: 0.5 });
      expect(result.success).toBe(false);
    });
  });

  describe('x coordinate validation', () => {
    it('rejects x < 0', () => {
      const result = drawingPinSchema.safeParse({ drawingId: 'dwg-001', x: -0.1, y: 0.5 });
      expect(result.success).toBe(false);
      if (!result.success) {
        const fields = result.error.issues.map(i => i.path[0]);
        expect(fields).toContain('x');
      }
    });

    it('rejects x > 1', () => {
      const result = drawingPinSchema.safeParse({ drawingId: 'dwg-001', x: 1.1, y: 0.5 });
      expect(result.success).toBe(false);
      if (!result.success) {
        const fields = result.error.issues.map(i => i.path[0]);
        expect(fields).toContain('x');
      }
    });

    it('rejects missing x', () => {
      const result = drawingPinSchema.safeParse({ drawingId: 'dwg-001', y: 0.5 });
      expect(result.success).toBe(false);
    });

    it('rejects non-number x', () => {
      const result = drawingPinSchema.safeParse({ drawingId: 'dwg-001', x: 'abc', y: 0.5 });
      expect(result.success).toBe(false);
    });
  });

  describe('y coordinate validation', () => {
    it('rejects y < 0', () => {
      const result = drawingPinSchema.safeParse({ drawingId: 'dwg-001', x: 0.5, y: -0.5 });
      expect(result.success).toBe(false);
      if (!result.success) {
        const fields = result.error.issues.map(i => i.path[0]);
        expect(fields).toContain('y');
      }
    });

    it('rejects y > 1', () => {
      const result = drawingPinSchema.safeParse({ drawingId: 'dwg-001', x: 0.5, y: 2.0 });
      expect(result.success).toBe(false);
      if (!result.success) {
        const fields = result.error.issues.map(i => i.path[0]);
        expect(fields).toContain('y');
      }
    });

    it('rejects missing y', () => {
      const result = drawingPinSchema.safeParse({ drawingId: 'dwg-001', x: 0.5 });
      expect(result.success).toBe(false);
    });

    it('rejects non-number y', () => {
      const result = drawingPinSchema.safeParse({ drawingId: 'dwg-001', x: 0.5, y: null });
      expect(result.success).toBe(false);
    });
  });

  describe('multiple errors', () => {
    it('reports errors for completely empty object', () => {
      const result = drawingPinSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThanOrEqual(3);
      }
    });

    it('reports errors for both invalid coordinates', () => {
      const result = drawingPinSchema.safeParse({ drawingId: 'dwg-001', x: -1, y: 2 });
      expect(result.success).toBe(false);
      if (!result.success) {
        const fields = result.error.issues.map(i => i.path[0]);
        expect(fields).toContain('x');
        expect(fields).toContain('y');
      }
    });
  });
});
