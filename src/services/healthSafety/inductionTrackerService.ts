/**
 * Induction Tracker Service
 *
 * Manages toolbox talks, safety inductions, attendance tracking,
 * and compliance flagging for daily site safety requirements.
 *
 * Grounded in Construction Regulations 2014 and OHS Act 85 of 1993.
 */

import type { ToolboxTalk, Induction } from './hsTypes';
import { ToolboxTalkSchema, InductionSchema } from './hsSchemas';

/**
 * Records a toolbox talk with all input fields preserved.
 * Validates input against ToolboxTalkSchema, generates a unique ID, and sets createdAt.
 */
export function recordToolboxTalk(
  input: Omit<ToolboxTalk, 'id' | 'createdAt'>
): ToolboxTalk {
  ToolboxTalkSchema.parse(input);

  return {
    ...input,
    id: `hs-talk-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Records a safety induction with all input fields preserved.
 * Validates input against InductionSchema, generates a unique ID, and sets createdAt.
 */
export function recordInduction(
  input: Omit<Induction, 'id' | 'createdAt'>
): Induction {
  InductionSchema.parse(input);

  return {
    ...input,
    id: `hs-ind-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Computes the set of workers who have NOT completed a site induction for the given project.
 * Only considers inductions of type 'site' for the specified projectId.
 *
 * Returns: workforce members who do NOT appear as inducteeId in any matching site induction.
 */
export function getUninductedWorkers(
  projectId: string,
  workforce: string[],
  inductions: Induction[]
): string[] {
  const inductedSet = new Set(
    inductions
      .filter((ind) => ind.projectId === projectId && ind.type === 'site')
      .map((ind) => ind.inducteeId)
  );

  return workforce.filter((workerId) => !inductedSet.has(workerId));
}

/**
 * Returns true if the worker has a site induction record for the given project
 * with acknowledged=true. Returns false otherwise.
 */
export function isWorkerInducted(
  workerId: string,
  projectId: string,
  inductions: Induction[]
): boolean {
  return inductions.some(
    (ind) =>
      ind.inducteeId === workerId &&
      ind.projectId === projectId &&
      ind.type === 'site' &&
      ind.acknowledged === true
  );
}
