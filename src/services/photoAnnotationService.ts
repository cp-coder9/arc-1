import type { PhotoAnnotation } from '@/types';
import { setDoc, getDoc } from 'firebase/firestore';
import { getDemoDoc } from '@/demo-seed/demoFirestore';
import { handleFirestoreError, OperationType } from '@/lib/firebase';

/**
 * Photo Annotation Service — Structured photo markup + flattened render reference.
 *
 * Pure functions for serialization/deserialization (round-trip safe).
 * I/O functions for Firestore persistence.
 */

const PROJECTS_COL = 'projects';
const PHOTO_ANNOTATIONS_COL = 'photo_annotations';

/**
 * Pure: serialize a PhotoAnnotation to a JSON string.
 *
 * The resulting string preserves all fields: evidenceId, shapes (count, order),
 * each shape's id, type, points (x,y coordinates), style (color, strokeWidth, fontSize),
 * text, and flattenedUri.
 */
export function serializeAnnotation(a: PhotoAnnotation): string {
  return JSON.stringify(a);
}

/**
 * Pure: deserialize a JSON string back to a PhotoAnnotation.
 *
 * Round-trip with serializeAnnotation: for any valid PhotoAnnotation `a`,
 * deserializeAnnotation(serializeAnnotation(a)) yields an annotation equivalent
 * to the original in shape count, shape order, and every shape's type, position
 * coordinates, and style attributes.
 */
export function deserializeAnnotation(raw: string): PhotoAnnotation {
  return JSON.parse(raw) as PhotoAnnotation;
}

/**
 * I/O: Persist a PhotoAnnotation to Firestore `photo_annotations` collection.
 *
 * Uses the annotation's `evidenceId` as the document ID so it can be loaded
 * by evidenceId later (one annotation per evidence record).
 *
 * Collection path: `projects/{projectId}/photo_annotations/{evidenceId}`
 *
 * @throws Error (via handleFirestoreError) on persistence failure
 */
export async function saveAnnotation(projectId: string, a: PhotoAnnotation): Promise<void> {
  try {
    const docRef = getDemoDoc(PROJECTS_COL, projectId, PHOTO_ANNOTATIONS_COL, a.evidenceId);
    await setDoc(docRef, {
      evidenceId: a.evidenceId,
      shapes: a.shapes,
      ...(a.flattenedUri !== undefined && { flattenedUri: a.flattenedUri }),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `${PROJECTS_COL}/${projectId}/${PHOTO_ANNOTATIONS_COL}/${a.evidenceId}`,
    );
    // handleFirestoreError always throws, but TypeScript needs this
    throw error;
  }
}

/**
 * I/O: Load a PhotoAnnotation from Firestore by evidenceId.
 *
 * Returns null if no annotation exists for the given evidenceId.
 *
 * @throws Error (via handleFirestoreError) on read failure
 */
export async function loadAnnotation(projectId: string, evidenceId: string): Promise<PhotoAnnotation | null> {
  try {
    const docRef = getDemoDoc(PROJECTS_COL, projectId, PHOTO_ANNOTATIONS_COL, evidenceId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return snap.data() as PhotoAnnotation;
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.GET,
      `${PROJECTS_COL}/${projectId}/${PHOTO_ANNOTATIONS_COL}/${evidenceId}`,
    );
    // handleFirestoreError always throws, but TypeScript needs this
    throw error;
  }
}
