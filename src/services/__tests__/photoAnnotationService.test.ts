/**
 * Photo Annotation Service — serializeAnnotation / deserializeAnnotation unit tests
 *
 * Tests the pure round-trip serialization functions for PhotoAnnotation.
 * Validates: Requirements 2.3, 2.4
 */

import { describe, expect, it } from 'vitest';
import { serializeAnnotation, deserializeAnnotation } from '../photoAnnotationService';
import type { PhotoAnnotation, AnnotationShape } from '@/types';

describe('serializeAnnotation / deserializeAnnotation', () => {
  describe('round-trip preserves shape count, order, type, coordinates, style, text', () => {
    it('round-trips a single arrow shape', () => {
      const annotation: PhotoAnnotation = {
        evidenceId: 'ev-001',
        shapes: [
          {
            id: 'shape-1',
            type: 'arrow',
            points: [{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.9 }],
            style: { color: '#ff0000', strokeWidth: 2 },
          },
        ],
      };

      const serialized = serializeAnnotation(annotation);
      const deserialized = deserializeAnnotation(serialized);

      expect(deserialized).toEqual(annotation);
      expect(deserialized.shapes).toHaveLength(1);
      expect(deserialized.shapes[0].type).toBe('arrow');
      expect(deserialized.shapes[0].points).toEqual([{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.9 }]);
      expect(deserialized.shapes[0].style).toEqual({ color: '#ff0000', strokeWidth: 2 });
    });

    it('round-trips a single text_note shape with text', () => {
      const annotation: PhotoAnnotation = {
        evidenceId: 'ev-002',
        shapes: [
          {
            id: 'shape-2',
            type: 'text_note',
            points: [{ x: 0.5, y: 0.5 }],
            style: { color: '#00ff00', strokeWidth: 1, fontSize: 14 },
            text: 'Crack in foundation',
          },
        ],
      };

      const serialized = serializeAnnotation(annotation);
      const deserialized = deserializeAnnotation(serialized);

      expect(deserialized).toEqual(annotation);
      expect(deserialized.shapes[0].text).toBe('Crack in foundation');
      expect(deserialized.shapes[0].style.fontSize).toBe(14);
    });

    it('round-trips multiple shapes (arrow + text_note) preserving order', () => {
      const shapes: AnnotationShape[] = [
        {
          id: 'shape-a',
          type: 'arrow',
          points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
          style: { color: '#0000ff', strokeWidth: 3 },
        },
        {
          id: 'shape-b',
          type: 'text_note',
          points: [{ x: 0.3, y: 0.7 }],
          style: { color: '#ffffff', strokeWidth: 1, fontSize: 12 },
          text: 'Water damage here',
        },
      ];

      const annotation: PhotoAnnotation = {
        evidenceId: 'ev-003',
        shapes,
        flattenedUri: 'https://blob.vercel-storage.com/flattened-abc123.png',
      };

      const serialized = serializeAnnotation(annotation);
      const deserialized = deserializeAnnotation(serialized);

      // Shape count preserved
      expect(deserialized.shapes).toHaveLength(2);

      // Shape order preserved
      expect(deserialized.shapes[0].id).toBe('shape-a');
      expect(deserialized.shapes[0].type).toBe('arrow');
      expect(deserialized.shapes[1].id).toBe('shape-b');
      expect(deserialized.shapes[1].type).toBe('text_note');

      // All fields preserved
      expect(deserialized).toEqual(annotation);
    });
  });

  describe('empty shapes array', () => {
    it('round-trips an annotation with no shapes', () => {
      const annotation: PhotoAnnotation = {
        evidenceId: 'ev-empty',
        shapes: [],
      };

      const serialized = serializeAnnotation(annotation);
      const deserialized = deserializeAnnotation(serialized);

      expect(deserialized).toEqual(annotation);
      expect(deserialized.shapes).toHaveLength(0);
      expect(deserialized.evidenceId).toBe('ev-empty');
    });
  });

  describe('flattenedUri preservation', () => {
    it('preserves flattenedUri when present', () => {
      const annotation: PhotoAnnotation = {
        evidenceId: 'ev-flat',
        shapes: [
          {
            id: 'shape-f',
            type: 'arrow',
            points: [{ x: 0.2, y: 0.3 }],
            style: { color: '#000000', strokeWidth: 1 },
          },
        ],
        flattenedUri: 'https://blob.vercel-storage.com/rendered-xyz.png',
      };

      const serialized = serializeAnnotation(annotation);
      const deserialized = deserializeAnnotation(serialized);

      expect(deserialized.flattenedUri).toBe('https://blob.vercel-storage.com/rendered-xyz.png');
    });

    it('preserves absence of flattenedUri (undefined)', () => {
      const annotation: PhotoAnnotation = {
        evidenceId: 'ev-no-flat',
        shapes: [],
      };

      const serialized = serializeAnnotation(annotation);
      const deserialized = deserializeAnnotation(serialized);

      expect(deserialized.flattenedUri).toBeUndefined();
    });
  });

  describe('serialization output format', () => {
    it('produces a valid JSON string', () => {
      const annotation: PhotoAnnotation = {
        evidenceId: 'ev-json',
        shapes: [
          {
            id: 's1',
            type: 'arrow',
            points: [{ x: 0.5, y: 0.5 }],
            style: { color: 'red', strokeWidth: 2 },
          },
        ],
      };

      const serialized = serializeAnnotation(annotation);
      expect(() => JSON.parse(serialized)).not.toThrow();
    });

    it('deserializeAnnotation is the inverse of serializeAnnotation', () => {
      const annotation: PhotoAnnotation = {
        evidenceId: 'ev-inverse',
        shapes: [
          {
            id: 'inv-1',
            type: 'text_note',
            points: [{ x: 0.1, y: 0.9 }, { x: 0.4, y: 0.6 }],
            style: { color: '#abcdef', strokeWidth: 4, fontSize: 20 },
            text: 'Important note with special chars: <>&"\'',
          },
        ],
        flattenedUri: 'https://example.com/image.png',
      };

      const result = deserializeAnnotation(serializeAnnotation(annotation));
      expect(result).toEqual(annotation);
    });
  });

  describe('coordinate precision', () => {
    it('preserves floating point coordinates accurately', () => {
      const annotation: PhotoAnnotation = {
        evidenceId: 'ev-precision',
        shapes: [
          {
            id: 'prec-1',
            type: 'arrow',
            points: [
              { x: 0.123456789, y: 0.987654321 },
              { x: 0.000001, y: 0.999999 },
            ],
            style: { color: '#112233', strokeWidth: 1.5 },
          },
        ],
      };

      const deserialized = deserializeAnnotation(serializeAnnotation(annotation));
      expect(deserialized.shapes[0].points[0].x).toBe(0.123456789);
      expect(deserialized.shapes[0].points[0].y).toBe(0.987654321);
      expect(deserialized.shapes[0].points[1].x).toBe(0.000001);
      expect(deserialized.shapes[0].points[1].y).toBe(0.999999);
    });
  });
});


/**
 * Photo Annotation Service — saveAnnotation / loadAnnotation I/O tests
 *
 * Tests the Firestore persistence functions for PhotoAnnotation.
 * Validates: Requirement 2.2
 */

import { saveAnnotation, loadAnnotation } from '../photoAnnotationService';
import { setDoc, getDoc } from 'firebase/firestore';
import { handleFirestoreError } from '@/lib/firebase';

describe('saveAnnotation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists a PhotoAnnotation to Firestore using evidenceId as document ID', async () => {
    const annotation: PhotoAnnotation = {
      evidenceId: 'ev-save-001',
      shapes: [
        {
          id: 'shape-1',
          type: 'arrow',
          points: [{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.9 }],
          style: { color: '#ff0000', strokeWidth: 2 },
        },
      ],
    };

    await saveAnnotation('proj-1', annotation);

    expect(setDoc).toHaveBeenCalledTimes(1);
    const callArgs = (setDoc as any).mock.calls[0][1];
    expect(callArgs.evidenceId).toBe('ev-save-001');
    expect(callArgs.shapes).toEqual(annotation.shapes);
  });

  it('includes flattenedUri when present', async () => {
    const annotation: PhotoAnnotation = {
      evidenceId: 'ev-save-002',
      shapes: [],
      flattenedUri: 'https://blob.vercel-storage.com/rendered.png',
    };

    await saveAnnotation('proj-1', annotation);

    const callArgs = (setDoc as any).mock.calls[0][1];
    expect(callArgs.flattenedUri).toBe('https://blob.vercel-storage.com/rendered.png');
  });

  it('omits flattenedUri when undefined', async () => {
    const annotation: PhotoAnnotation = {
      evidenceId: 'ev-save-003',
      shapes: [],
    };

    await saveAnnotation('proj-1', annotation);

    const callArgs = (setDoc as any).mock.calls[0][1];
    expect(callArgs.flattenedUri).toBeUndefined();
  });

  it('calls handleFirestoreError on persistence failure', async () => {
    const firestoreError = new Error('PERMISSION_DENIED');
    (setDoc as any).mockRejectedValueOnce(firestoreError);

    await expect(
      saveAnnotation('proj-1', {
        evidenceId: 'ev-fail',
        shapes: [],
      })
    ).rejects.toThrow();

    expect(handleFirestoreError).toHaveBeenCalledWith(
      firestoreError,
      'WRITE',
      'projects/proj-1/photo_annotations/ev-fail',
    );
  });
});

describe('loadAnnotation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a PhotoAnnotation when document exists', async () => {
    const storedData: PhotoAnnotation = {
      evidenceId: 'ev-load-001',
      shapes: [
        {
          id: 'shape-1',
          type: 'text_note',
          points: [{ x: 0.5, y: 0.5 }],
          style: { color: '#00ff00', strokeWidth: 1, fontSize: 12 },
          text: 'Crack in wall',
        },
      ],
      flattenedUri: 'https://blob.vercel-storage.com/img.png',
    };

    (getDoc as any).mockResolvedValueOnce({
      exists: () => true,
      data: () => storedData,
    });

    const result = await loadAnnotation('proj-1', 'ev-load-001');
    expect(result).toEqual(storedData);
  });

  it('returns null when no annotation exists for the evidenceId', async () => {
    (getDoc as any).mockResolvedValueOnce({
      exists: () => false,
      data: () => null,
    });

    const result = await loadAnnotation('proj-1', 'ev-missing');
    expect(result).toBeNull();
  });

  it('calls handleFirestoreError on read failure', async () => {
    const firestoreError = new Error('NETWORK_ERROR');
    (getDoc as any).mockRejectedValueOnce(firestoreError);

    await expect(
      loadAnnotation('proj-1', 'ev-err')
    ).rejects.toThrow();

    expect(handleFirestoreError).toHaveBeenCalledWith(
      firestoreError,
      'GET',
      'projects/proj-1/photo_annotations/ev-err',
    );
  });
});
