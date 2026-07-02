import { z } from 'zod';

// --- Timber Beam ---

export const timberBeamInputSchema = z.object({
  width: z.number().positive().max(300, 'Max width 300mm'), // mm
  depth: z.number().positive().max(600, 'Max depth 600mm'), // mm
  span: z.number().positive().max(12, 'Max span 12m'), // m
  udl: z.number().positive(), // kN/m
  timberGrade: z.enum(['5', '7', '10', '14']),
  loadDuration: z.enum(['permanent', 'medium', 'short', 'instant']),
  deflectionLimit: z.number().positive().default(300), // span/deflectionLimit
});
export type TimberBeamInput = z.infer<typeof timberBeamInputSchema>;
export const TIMBER_BEAM_DEFAULTS: TimberBeamInput = { width: 38, depth: 228, span: 4, udl: 5, timberGrade: '5', loadDuration: 'medium', deflectionLimit: 300 };

// --- Timber Column ---

export const timberColumnInputSchema = z.object({
  width: z.number().positive().max(300, 'Max width 300mm'), // mm
  depth: z.number().positive().max(300, 'Max depth 300mm'), // mm
  length: z.number().positive().max(6, 'Max length 6m'), // m
  axialLoad: z.number().positive(), // kN
  timberGrade: z.enum(['5', '7', '10', '14']),
  effectiveLengthFactor: z.number().min(0.5).max(2.0).default(1.0),
  loadDuration: z.enum(['permanent', 'medium', 'short', 'instant']),
});
export type TimberColumnInput = z.infer<typeof timberColumnInputSchema>;
export const TIMBER_COLUMN_DEFAULTS: TimberColumnInput = { width: 114, depth: 114, length: 3, axialLoad: 50, timberGrade: '5', effectiveLengthFactor: 1.0, loadDuration: 'medium' };

// --- Timber Connection ---

export const timberConnectionInputSchema = z.object({
  connectionType: z.enum(['bolt', 'nail']),
  fastenerDiameter: z.number().positive().max(24, 'Max diameter 24mm'), // mm
  numFasteners: z.number().int().positive().max(50),
  shearType: z.enum(['single', 'double']),
  memberThickness: z.number().positive().max(300, 'Max thickness 300mm'), // mm
  timberGrade: z.enum(['5', '7', '10', '14']),
  appliedForce: z.number().positive(), // kN
});
export type TimberConnectionInput = z.infer<typeof timberConnectionInputSchema>;
export const TIMBER_CONNECTION_DEFAULTS: TimberConnectionInput = { connectionType: 'bolt', fastenerDiameter: 12, numFasteners: 4, shearType: 'single', memberThickness: 38, timberGrade: '5', appliedForce: 20 };
