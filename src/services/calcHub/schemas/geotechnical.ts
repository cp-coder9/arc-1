import { z } from 'zod';

// --- Bearing Capacity ---

export const bearingCapacityInputSchema = z.object({
  frictionAngle: z.number().min(0).max(45), // degrees
  cohesion: z.number().min(0), // kPa
  unitWeight: z.number().positive(), // kN/m³
  foundationDepth: z.number().positive(), // m
  foundationWidth: z.number().positive(), // m
  waterTable: z.number().min(0), // m below surface
  method: z.enum(['terzaghi', 'meyerhof']),
  factorOfSafety: z.number().positive().default(3),
});
export type BearingCapacityInput = z.infer<typeof bearingCapacityInputSchema>;
export const BEARING_CAPACITY_DEFAULTS: BearingCapacityInput = { frictionAngle: 30, cohesion: 0, unitWeight: 18, foundationDepth: 1.5, foundationWidth: 2.0, waterTable: 5.0, method: 'terzaghi', factorOfSafety: 3 };

// --- Pad Footing ---

export const padFootingInputSchema = z.object({
  columnLoad: z.number().positive(), // kN
  columnWidth: z.number().positive(), // mm
  columnDepth: z.number().positive(), // mm
  allowableBearing: z.number().positive(), // kPa
  fcu: z.number().positive().max(50), // MPa — concrete grade
  fy: z.number().positive().default(450), // MPa — rebar yield strength
  soilUnitWeight: z.number().positive(), // kN/m³
});
export type PadFootingInput = z.infer<typeof padFootingInputSchema>;
export const PAD_FOOTING_DEFAULTS: PadFootingInput = { columnLoad: 800, columnWidth: 400, columnDepth: 400, allowableBearing: 150, fcu: 30, fy: 450, soilUnitWeight: 18 };

// --- Retaining Wall ---

export const retainingWallInputSchema = z.object({
  wallHeight: z.number().positive().max(12, 'Max wall height 12m'), // m
  stemThickness: z.number().positive(), // mm
  baseWidth: z.number().positive(), // m
  toeLength: z.number().positive(), // m
  heelLength: z.number().positive(), // m
  soilFrictionAngle: z.number().min(0).max(45), // degrees
  soilUnitWeight: z.number().positive(), // kN/m³
  surcharge: z.number().min(0), // kPa
  soilCohesion: z.number().min(0), // kPa
  method: z.enum(['rankine', 'coulomb']),
  wallFriction: z.number().min(0).max(45).default(0), // degrees — for Coulomb method
});
export type RetainingWallInput = z.infer<typeof retainingWallInputSchema>;
export const RETAINING_WALL_DEFAULTS: RetainingWallInput = { wallHeight: 3, stemThickness: 300, baseWidth: 2.5, toeLength: 0.8, heelLength: 1.2, soilFrictionAngle: 30, soilUnitWeight: 18, surcharge: 10, soilCohesion: 0, method: 'rankine', wallFriction: 0 };

// --- Pile Capacity ---

const soilLayerSchema = z.object({
  thickness: z.number().positive(), // m
  frictionAngle: z.number().min(0).max(45), // degrees
  cohesion: z.number().min(0), // kPa
  unitWeight: z.number().positive(), // kN/m³
});

export const pileCapacityInputSchema = z.object({
  pileDiameter: z.number().positive().max(2000, 'Max diameter 2000mm'), // mm
  pileLength: z.number().positive().max(50, 'Max length 50m'), // m
  soilLayers: z.array(soilLayerSchema).min(1, 'At least one soil layer required'),
  endBearingFactor: z.number().positive().default(9),
  shaftFrictionFactor: z.number().positive().default(0.5),
});
export type PileCapacityInput = z.infer<typeof pileCapacityInputSchema>;
export const PILE_CAPACITY_DEFAULTS: PileCapacityInput = { pileDiameter: 600, pileLength: 15, soilLayers: [{ thickness: 5, frictionAngle: 28, cohesion: 10, unitWeight: 17 }, { thickness: 10, frictionAngle: 35, cohesion: 0, unitWeight: 19 }], endBearingFactor: 9, shaftFrictionFactor: 0.5 };
