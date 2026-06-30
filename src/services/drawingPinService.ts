import type { DrawingPin } from '@/types';
import { updateDoc } from 'firebase/firestore';
import { getDemoDoc } from '@/demo-seed/demoFirestore';
import { handleFirestoreError, OperationType } from '@/lib/firebase';

/**
 * Drawing Pin Service — Drawing pin validation and persistence.
 *
 * Pure functions for coordinate validation and filtering.
 * I/O functions for atomic persistence.
 */

const PROJECTS_COL = 'projects';
const SNAGS_COL = 'snags';

export interface PinnedIssue {
  issueId: string;
  pin: DrawingPin;
}

export interface PinValidationError {
  field: 'drawingId' | 'x' | 'y';
  code: 'missing' | 'out_of_range' | 'drawing_not_found';
  message: string;
}

/**
 * Pure: validate coordinates and presence (does not check drawing existence).
 *
 * Rules:
 * - If drawingId is undefined, null, or empty string → error field 'drawingId', code 'missing'
 * - If x is undefined or null → error field 'x', code 'missing'
 * - If x is a number but < 0 or > 1 → error field 'x', code 'out_of_range'
 * - Same for y
 * - Returns empty array for valid pins
 */
export function validateDrawingPin(pin: Partial<DrawingPin>): PinValidationError[] {
  const errors: PinValidationError[] = [];

  // Validate drawingId: must be non-empty string
  if (pin.drawingId === undefined || pin.drawingId === null || pin.drawingId === '') {
    errors.push({
      field: 'drawingId',
      code: 'missing',
      message: 'drawingId is required and must be a non-empty string',
    });
  }

  // Validate x: must be present and within 0..1
  if (pin.x === undefined || pin.x === null) {
    errors.push({
      field: 'x',
      code: 'missing',
      message: 'x coordinate is required',
    });
  } else if (typeof pin.x === 'number' && (pin.x < 0 || pin.x > 1)) {
    errors.push({
      field: 'x',
      code: 'out_of_range',
      message: 'x coordinate must be between 0 and 1 inclusive',
    });
  }

  // Validate y: must be present and within 0..1
  if (pin.y === undefined || pin.y === null) {
    errors.push({
      field: 'y',
      code: 'missing',
      message: 'y coordinate is required',
    });
  } else if (typeof pin.y === 'number' && (pin.y < 0 || pin.y > 1)) {
    errors.push({
      field: 'y',
      code: 'out_of_range',
      message: 'y coordinate must be between 0 and 1 inclusive',
    });
  }

  return errors;
}

/**
 * Pure: filter issues whose pin matches a displayed drawing.
 *
 * Takes a list of issues (each with id and optional drawingPin)
 * and returns PinnedIssue[] containing only issues whose
 * `drawingPin.drawingId` === `drawingId`.
 *
 * Returns exactly one entry per matching issue, zero for non-matching.
 */
export function pinsForDrawing(
  issues: Array<{ id: string; drawingPin?: DrawingPin }>,
  drawingId: string,
): PinnedIssue[] {
  const result: PinnedIssue[] = [];

  for (const issue of issues) {
    if (issue.drawingPin && issue.drawingPin.drawingId === drawingId) {
      result.push({
        issueId: issue.id,
        pin: issue.drawingPin,
      });
    }
  }

  return result;
}

/**
 * I/O: validate (incl. drawing existence), then atomically persist drawingId+x+y.
 *
 * Steps:
 * 1. Validate pin structure via validateDrawingPin
 * 2. Check drawingId exists in knownDrawingIds
 * 3. Persist drawingPin field on the snag document
 * 4. On Firestore error, handleFirestoreError — prior location unchanged since we only update on success
 *
 * @throws PinValidationError[] when structure invalid or drawing not found
 * @throws Error (via handleFirestoreError) on persistence failure
 */
export async function attachDrawingPin(
  projectId: string,
  issueId: string,
  pin: DrawingPin,
  knownDrawingIds: string[],
): Promise<DrawingPin> {
  // 1. Validate pin structure
  const errors = validateDrawingPin(pin);
  if (errors.length > 0) {
    const err = new Error(`Drawing pin validation failed: ${errors.map(e => e.message).join('; ')}`);
    (err as unknown as { errors: PinValidationError[] }).errors = errors;
    throw err;
  }

  // 2. Check drawing existence
  if (!knownDrawingIds.includes(pin.drawingId)) {
    const notFoundError: PinValidationError = {
      field: 'drawingId',
      code: 'drawing_not_found',
      message: `Drawing '${pin.drawingId}' does not exist in the project`,
    };
    const err = new Error(notFoundError.message);
    (err as unknown as { errors: PinValidationError[] }).errors = [notFoundError];
    throw err;
  }

  // 3. Persist atomically — only the drawingPin field is updated
  try {
    const docRef = getDemoDoc(PROJECTS_COL, projectId, SNAGS_COL, issueId);
    await updateDoc(docRef, {
      drawingPin: {
        drawingId: pin.drawingId,
        x: pin.x,
        y: pin.y,
      },
      updatedAt: new Date().toISOString(),
    });
    return pin;
  } catch (error) {
    // 4. On failure, handleFirestoreError throws — prior location unchanged
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `${PROJECTS_COL}/${projectId}/${SNAGS_COL}/${issueId}`,
    );
    // handleFirestoreError always throws, but TypeScript needs a return
    throw error;
  }
}
