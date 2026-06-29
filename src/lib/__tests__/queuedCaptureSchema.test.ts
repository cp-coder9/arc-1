/**
 * queuedCaptureSchema — Unit tests
 *
 * Validates that the Zod schema enforces the QueuedCapture type contract:
 * - clientId: non-empty string (idempotency key)
 * - kind: one of 'field_issue', 'photo_annotation', 'checklist_response'
 * - payload: any value (z.unknown)
 * - createdAt: non-empty string (ISO 8601)
 * - attempts: non-negative integer
 * - status: one of 'queued', 'failed'
 *
 * Acceptance: Schema validates queue entries per Req 4.7, 4.12
 */

import { describe, expect, it } from 'vitest';
import { queuedCaptureSchema } from '../schemas';

function validCapture() {
  return {
    clientId: 'capture-uuid-001',
    kind: 'field_issue' as const,
    payload: { description: 'Crack in north wall' },
    createdAt: '2026-06-15T08:30:00.000Z',
    attempts: 0,
    status: 'queued' as const,
  };
}

describe('queuedCaptureSchema', () => {
  describe('valid entries', () => {
    it('accepts a fully valid queued capture', () => {
      const result = queuedCaptureSchema.safeParse(validCapture());
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.clientId).toBe('capture-uuid-001');
        expect(result.data.kind).toBe('field_issue');
        expect(result.data.attempts).toBe(0);
        expect(result.data.status).toBe('queued');
      }
    });

    it('accepts kind=photo_annotation', () => {
      const result = queuedCaptureSchema.safeParse({ ...validCapture(), kind: 'photo_annotation' });
      expect(result.success).toBe(true);
    });

    it('accepts kind=checklist_response', () => {
      const result = queuedCaptureSchema.safeParse({ ...validCapture(), kind: 'checklist_response' });
      expect(result.success).toBe(true);
    });

    it('accepts status=failed', () => {
      const result = queuedCaptureSchema.safeParse({ ...validCapture(), status: 'failed', attempts: 5 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('failed');
        expect(result.data.attempts).toBe(5);
      }
    });

    it('accepts null payload', () => {
      const result = queuedCaptureSchema.safeParse({ ...validCapture(), payload: null });
      expect(result.success).toBe(true);
    });

    it('accepts complex object payload', () => {
      const payload = { nested: { deep: true }, items: [1, 2, 3] };
      const result = queuedCaptureSchema.safeParse({ ...validCapture(), payload });
      expect(result.success).toBe(true);
    });

    it('accepts undefined payload', () => {
      const capture = { ...validCapture() };
      delete (capture as Record<string, unknown>).payload;
      const result = queuedCaptureSchema.safeParse(capture);
      expect(result.success).toBe(true);
    });

    it('accepts attempts=0 (fresh capture)', () => {
      const result = queuedCaptureSchema.safeParse({ ...validCapture(), attempts: 0 });
      expect(result.success).toBe(true);
    });
  });

  describe('clientId validation', () => {
    it('rejects empty string clientId', () => {
      const result = queuedCaptureSchema.safeParse({ ...validCapture(), clientId: '' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const fields = result.error.issues.map(i => i.path[0]);
        expect(fields).toContain('clientId');
      }
    });

    it('rejects missing clientId', () => {
      const { clientId: _, ...rest } = validCapture();
      const result = queuedCaptureSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });
  });

  describe('kind validation', () => {
    it('rejects an invalid kind value', () => {
      const result = queuedCaptureSchema.safeParse({ ...validCapture(), kind: 'unknown_type' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const fields = result.error.issues.map(i => i.path[0]);
        expect(fields).toContain('kind');
      }
    });

    it('rejects missing kind', () => {
      const { kind: _, ...rest } = validCapture();
      const result = queuedCaptureSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });
  });

  describe('createdAt validation', () => {
    it('rejects empty string createdAt', () => {
      const result = queuedCaptureSchema.safeParse({ ...validCapture(), createdAt: '' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const fields = result.error.issues.map(i => i.path[0]);
        expect(fields).toContain('createdAt');
      }
    });

    it('rejects missing createdAt', () => {
      const { createdAt: _, ...rest } = validCapture();
      const result = queuedCaptureSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('accepts any non-empty string (ISO 8601 format not enforced by schema)', () => {
      const result = queuedCaptureSchema.safeParse({ ...validCapture(), createdAt: '2026-06-15' });
      expect(result.success).toBe(true);
    });
  });

  describe('attempts validation', () => {
    it('rejects negative attempts', () => {
      const result = queuedCaptureSchema.safeParse({ ...validCapture(), attempts: -1 });
      expect(result.success).toBe(false);
      if (!result.success) {
        const fields = result.error.issues.map(i => i.path[0]);
        expect(fields).toContain('attempts');
      }
    });

    it('rejects non-integer attempts', () => {
      const result = queuedCaptureSchema.safeParse({ ...validCapture(), attempts: 2.5 });
      expect(result.success).toBe(false);
      if (!result.success) {
        const fields = result.error.issues.map(i => i.path[0]);
        expect(fields).toContain('attempts');
      }
    });

    it('rejects missing attempts', () => {
      const { attempts: _, ...rest } = validCapture();
      const result = queuedCaptureSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('accepts integer attempts >= 0', () => {
      expect(queuedCaptureSchema.safeParse({ ...validCapture(), attempts: 0 }).success).toBe(true);
      expect(queuedCaptureSchema.safeParse({ ...validCapture(), attempts: 3 }).success).toBe(true);
      expect(queuedCaptureSchema.safeParse({ ...validCapture(), attempts: 5 }).success).toBe(true);
    });
  });

  describe('status validation', () => {
    it('rejects an invalid status value', () => {
      const result = queuedCaptureSchema.safeParse({ ...validCapture(), status: 'pending' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const fields = result.error.issues.map(i => i.path[0]);
        expect(fields).toContain('status');
      }
    });

    it('rejects missing status', () => {
      const { status: _, ...rest } = validCapture();
      const result = queuedCaptureSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });
  });

  describe('multiple errors', () => {
    it('reports errors for completely empty object', () => {
      const result = queuedCaptureSchema.safeParse({});
      expect(result.success).toBe(false);
      if (!result.success) {
        // Should report missing clientId, kind, createdAt, attempts, status
        expect(result.error.issues.length).toBeGreaterThanOrEqual(5);
      }
    });

    it('reports errors for multiple invalid fields', () => {
      const result = queuedCaptureSchema.safeParse({
        clientId: '',
        kind: 'invalid',
        payload: 'anything',
        createdAt: '',
        attempts: -1,
        status: 'unknown',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const fields = result.error.issues.map(i => i.path[0]);
        expect(fields).toContain('clientId');
        expect(fields).toContain('kind');
        expect(fields).toContain('createdAt');
        expect(fields).toContain('attempts');
        expect(fields).toContain('status');
      }
    });
  });
});
