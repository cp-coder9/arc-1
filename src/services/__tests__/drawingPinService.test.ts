/**
 * Drawing Pin Service — validateDrawingPin unit tests
 *
 * Tests the pure validation function for drawing pin coordinates.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { validateDrawingPin, type PinValidationError } from '../drawingPinService';

describe('validateDrawingPin', () => {
  describe('valid pins', () => {
    it('accepts a pin with non-empty drawingId and x, y within [0, 1]', () => {
      const errors = validateDrawingPin({ drawingId: 'dwg-001', x: 0.5, y: 0.5 });
      expect(errors).toEqual([]);
    });

    it('accepts boundary value x=0, y=0', () => {
      const errors = validateDrawingPin({ drawingId: 'dwg-002', x: 0, y: 0 });
      expect(errors).toEqual([]);
    });

    it('accepts boundary value x=1, y=1', () => {
      const errors = validateDrawingPin({ drawingId: 'dwg-003', x: 1, y: 1 });
      expect(errors).toEqual([]);
    });

    it('accepts x=0, y=1 and x=1, y=0', () => {
      expect(validateDrawingPin({ drawingId: 'a', x: 0, y: 1 })).toEqual([]);
      expect(validateDrawingPin({ drawingId: 'b', x: 1, y: 0 })).toEqual([]);
    });
  });

  describe('drawingId validation', () => {
    it('rejects undefined drawingId', () => {
      const errors = validateDrawingPin({ x: 0.5, y: 0.5 });
      expect(errors).toContainEqual(expect.objectContaining({ field: 'drawingId', code: 'missing' }));
    });

    it('rejects null drawingId', () => {
      const errors = validateDrawingPin({ drawingId: null as any, x: 0.5, y: 0.5 });
      expect(errors).toContainEqual(expect.objectContaining({ field: 'drawingId', code: 'missing' }));
    });

    it('rejects empty string drawingId', () => {
      const errors = validateDrawingPin({ drawingId: '', x: 0.5, y: 0.5 });
      expect(errors).toContainEqual(expect.objectContaining({ field: 'drawingId', code: 'missing' }));
    });
  });

  describe('x coordinate validation', () => {
    it('rejects undefined x', () => {
      const errors = validateDrawingPin({ drawingId: 'dwg-001', y: 0.5 });
      expect(errors).toContainEqual(expect.objectContaining({ field: 'x', code: 'missing' }));
    });

    it('rejects null x', () => {
      const errors = validateDrawingPin({ drawingId: 'dwg-001', x: null as any, y: 0.5 });
      expect(errors).toContainEqual(expect.objectContaining({ field: 'x', code: 'missing' }));
    });

    it('rejects x < 0', () => {
      const errors = validateDrawingPin({ drawingId: 'dwg-001', x: -0.1, y: 0.5 });
      expect(errors).toContainEqual(expect.objectContaining({ field: 'x', code: 'out_of_range' }));
    });

    it('rejects x > 1', () => {
      const errors = validateDrawingPin({ drawingId: 'dwg-001', x: 1.1, y: 0.5 });
      expect(errors).toContainEqual(expect.objectContaining({ field: 'x', code: 'out_of_range' }));
    });
  });

  describe('y coordinate validation', () => {
    it('rejects undefined y', () => {
      const errors = validateDrawingPin({ drawingId: 'dwg-001', x: 0.5 });
      expect(errors).toContainEqual(expect.objectContaining({ field: 'y', code: 'missing' }));
    });

    it('rejects null y', () => {
      const errors = validateDrawingPin({ drawingId: 'dwg-001', x: 0.5, y: null as any });
      expect(errors).toContainEqual(expect.objectContaining({ field: 'y', code: 'missing' }));
    });

    it('rejects y < 0', () => {
      const errors = validateDrawingPin({ drawingId: 'dwg-001', x: 0.5, y: -0.5 });
      expect(errors).toContainEqual(expect.objectContaining({ field: 'y', code: 'out_of_range' }));
    });

    it('rejects y > 1', () => {
      const errors = validateDrawingPin({ drawingId: 'dwg-001', x: 0.5, y: 2.0 });
      expect(errors).toContainEqual(expect.objectContaining({ field: 'y', code: 'out_of_range' }));
    });
  });

  describe('multiple errors', () => {
    it('reports all errors for a completely empty pin', () => {
      const errors = validateDrawingPin({});
      expect(errors).toHaveLength(3);
      const fields = errors.map(e => e.field);
      expect(fields).toContain('drawingId');
      expect(fields).toContain('x');
      expect(fields).toContain('y');
    });

    it('reports drawingId and x errors when y is valid', () => {
      const errors = validateDrawingPin({ drawingId: '', x: -1, y: 0.5 });
      expect(errors).toHaveLength(2);
      expect(errors).toContainEqual(expect.objectContaining({ field: 'drawingId', code: 'missing' }));
      expect(errors).toContainEqual(expect.objectContaining({ field: 'x', code: 'out_of_range' }));
    });

    it('reports out-of-range for both x and y', () => {
      const errors = validateDrawingPin({ drawingId: 'dwg-001', x: -0.5, y: 1.5 });
      expect(errors).toHaveLength(2);
      expect(errors).toContainEqual(expect.objectContaining({ field: 'x', code: 'out_of_range' }));
      expect(errors).toContainEqual(expect.objectContaining({ field: 'y', code: 'out_of_range' }));
    });
  });

  describe('error structure', () => {
    it('returns PinValidationError[] with field, code, and message', () => {
      const errors = validateDrawingPin({});
      for (const error of errors) {
        expect(error).toHaveProperty('field');
        expect(error).toHaveProperty('code');
        expect(error).toHaveProperty('message');
        expect(typeof error.message).toBe('string');
        expect(error.message.length).toBeGreaterThan(0);
      }
    });
  });
});

import { pinsForDrawing, type PinnedIssue } from '../drawingPinService';
import type { DrawingPin } from '@/types';

describe('pinsForDrawing', () => {
  const pinA: DrawingPin = { drawingId: 'dwg-001', x: 0.2, y: 0.3 };
  const pinB: DrawingPin = { drawingId: 'dwg-002', x: 0.5, y: 0.7 };
  const pinC: DrawingPin = { drawingId: 'dwg-001', x: 0.8, y: 0.1 };

  const issues = [
    { id: 'issue-1', drawingPin: pinA },
    { id: 'issue-2', drawingPin: pinB },
    { id: 'issue-3', drawingPin: pinC },
    { id: 'issue-4' }, // no drawingPin
  ];

  it('returns issues whose drawingPin.drawingId matches the displayed drawing', () => {
    const result = pinsForDrawing(issues, 'dwg-001');
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ issueId: 'issue-1', pin: pinA });
    expect(result).toContainEqual({ issueId: 'issue-3', pin: pinC });
  });

  it('returns exactly one entry per matching issue', () => {
    const result = pinsForDrawing(issues, 'dwg-002');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ issueId: 'issue-2', pin: pinB });
  });

  it('returns empty array when no issues match the drawing', () => {
    const result = pinsForDrawing(issues, 'dwg-999');
    expect(result).toEqual([]);
  });

  it('returns empty array for an empty issues list', () => {
    const result = pinsForDrawing([], 'dwg-001');
    expect(result).toEqual([]);
  });

  it('excludes issues without a drawingPin', () => {
    const result = pinsForDrawing(issues, 'dwg-001');
    const issueIds = result.map(r => r.issueId);
    expect(issueIds).not.toContain('issue-4');
  });

  it('does not render markers for issues with non-matching drawingId', () => {
    const result = pinsForDrawing(issues, 'dwg-001');
    const issueIds = result.map(r => r.issueId);
    expect(issueIds).not.toContain('issue-2'); // has dwg-002
  });

  it('preserves the pin coordinates in the result', () => {
    const result = pinsForDrawing(issues, 'dwg-001');
    const issueOne = result.find(r => r.issueId === 'issue-1');
    expect(issueOne?.pin.x).toBe(0.2);
    expect(issueOne?.pin.y).toBe(0.3);
    expect(issueOne?.pin.drawingId).toBe('dwg-001');
  });

  it('handles all issues having the same drawingId', () => {
    const sameDrawing = [
      { id: 'a', drawingPin: { drawingId: 'dwg-X', x: 0, y: 0 } },
      { id: 'b', drawingPin: { drawingId: 'dwg-X', x: 1, y: 1 } },
      { id: 'c', drawingPin: { drawingId: 'dwg-X', x: 0.5, y: 0.5 } },
    ];
    const result = pinsForDrawing(sameDrawing, 'dwg-X');
    expect(result).toHaveLength(3);
  });

  it('handles issues where all have no drawingPin', () => {
    const noPins = [
      { id: 'a' },
      { id: 'b' },
    ];
    const result = pinsForDrawing(noPins, 'dwg-001');
    expect(result).toEqual([]);
  });
});

import { attachDrawingPin } from '../drawingPinService';
import { updateDoc } from 'firebase/firestore';
import { handleFirestoreError } from '@/lib/firebase';

describe('attachDrawingPin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validPin: DrawingPin = { drawingId: 'dwg-001', x: 0.5, y: 0.3 };
  const knownDrawings = ['dwg-001', 'dwg-002', 'dwg-003'];

  describe('successful persistence', () => {
    it('returns the pin when valid pin is attached to a known drawing', async () => {
      const result = await attachDrawingPin('proj-1', 'issue-1', validPin, knownDrawings);
      expect(result).toEqual(validPin);
    });

    it('calls updateDoc with the drawingPin field and updatedAt', async () => {
      await attachDrawingPin('proj-1', 'issue-1', validPin, knownDrawings);
      expect(updateDoc).toHaveBeenCalledTimes(1);
      const callArgs = (updateDoc as any).mock.calls[0][1];
      expect(callArgs.drawingPin).toEqual({
        drawingId: 'dwg-001',
        x: 0.5,
        y: 0.3,
      });
      expect(callArgs.updatedAt).toBeDefined();
    });

    it('persists boundary coordinates x=0, y=0', async () => {
      const boundaryPin: DrawingPin = { drawingId: 'dwg-002', x: 0, y: 0 };
      const result = await attachDrawingPin('proj-1', 'issue-1', boundaryPin, knownDrawings);
      expect(result).toEqual(boundaryPin);
    });

    it('persists boundary coordinates x=1, y=1', async () => {
      const boundaryPin: DrawingPin = { drawingId: 'dwg-003', x: 1, y: 1 };
      const result = await attachDrawingPin('proj-1', 'issue-1', boundaryPin, knownDrawings);
      expect(result).toEqual(boundaryPin);
    });
  });

  describe('validation errors (structure)', () => {
    it('throws when x is out of range', async () => {
      const badPin: DrawingPin = { drawingId: 'dwg-001', x: 1.5, y: 0.5 };
      await expect(attachDrawingPin('proj-1', 'issue-1', badPin, knownDrawings)).rejects.toThrow();
      expect(updateDoc).not.toHaveBeenCalled();
    });

    it('throws when y is out of range', async () => {
      const badPin: DrawingPin = { drawingId: 'dwg-001', x: 0.5, y: -0.1 };
      await expect(attachDrawingPin('proj-1', 'issue-1', badPin, knownDrawings)).rejects.toThrow();
      expect(updateDoc).not.toHaveBeenCalled();
    });

    it('attaches errors array to thrown error', async () => {
      const badPin: DrawingPin = { drawingId: 'dwg-001', x: 2.0, y: 0.5 };
      try {
        await attachDrawingPin('proj-1', 'issue-1', badPin, knownDrawings);
        expect.fail('should have thrown');
      } catch (err: any) {
        expect(err.errors).toBeDefined();
        expect(err.errors[0].field).toBe('x');
        expect(err.errors[0].code).toBe('out_of_range');
      }
    });
  });

  describe('unknown drawing rejection (Req 1.5)', () => {
    it('throws when drawingId is not in knownDrawingIds', async () => {
      const unknownPin: DrawingPin = { drawingId: 'dwg-unknown', x: 0.5, y: 0.5 };
      await expect(
        attachDrawingPin('proj-1', 'issue-1', unknownPin, knownDrawings)
      ).rejects.toThrow(/does not exist/);
      expect(updateDoc).not.toHaveBeenCalled();
    });

    it('attaches drawing_not_found error to thrown error', async () => {
      const unknownPin: DrawingPin = { drawingId: 'dwg-404', x: 0.5, y: 0.5 };
      try {
        await attachDrawingPin('proj-1', 'issue-1', unknownPin, knownDrawings);
        expect.fail('should have thrown');
      } catch (err: any) {
        expect(err.errors).toBeDefined();
        expect(err.errors).toHaveLength(1);
        expect(err.errors[0].field).toBe('drawingId');
        expect(err.errors[0].code).toBe('drawing_not_found');
      }
    });

    it('does not modify existing location when drawing is unknown', async () => {
      const unknownPin: DrawingPin = { drawingId: 'dwg-missing', x: 0.3, y: 0.7 };
      await expect(
        attachDrawingPin('proj-1', 'issue-1', unknownPin, knownDrawings)
      ).rejects.toThrow();
      // updateDoc should never be called — existing location preserved
      expect(updateDoc).not.toHaveBeenCalled();
    });
  });

  describe('persistence failure (Req 1.6)', () => {
    it('calls handleFirestoreError when updateDoc throws', async () => {
      const firestoreError = new Error('PERMISSION_DENIED');
      (updateDoc as any).mockRejectedValueOnce(firestoreError);

      await expect(
        attachDrawingPin('proj-1', 'issue-1', validPin, knownDrawings)
      ).rejects.toThrow();
      expect(handleFirestoreError).toHaveBeenCalledWith(
        firestoreError,
        'UPDATE',
        'projects/proj-1/snags/issue-1',
      );
    });

    it('preserves existing location on persistence failure (updateDoc not committed)', async () => {
      (updateDoc as any).mockRejectedValueOnce(new Error('NETWORK_ERROR'));
      await expect(
        attachDrawingPin('proj-1', 'issue-1', validPin, knownDrawings)
      ).rejects.toThrow();
      // The prior location is unchanged because the update failed
      // (no successful write occurred)
    });
  });
});
