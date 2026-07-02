import { z } from 'zod';

// --- Travel Distance Check (SANS 10400-T) ---
export const travelDistanceInputSchema = z.object({
  buildingClassification: z.string().min(1, 'Required'),
  measuredDistance: z.number().positive('Must be positive'), // m
  sprinklered: z.boolean(),
});
export type TravelDistanceInput = z.infer<typeof travelDistanceInputSchema>;
export const TRAVEL_DISTANCE_DEFAULTS: TravelDistanceInput = { buildingClassification: 'A1', measuredDistance: 30, sprinklered: false };

// --- Exit Width Calculation ---
export const exitWidthInputSchema = z.object({
  occupantLoad: z.number().int().positive('Must be positive'),
  numExits: z.number().int().min(1, 'Min 1 exit').max(8, 'Max 8 exits'),
  doorLeafWidth: z.number().positive().default(850), // mm
});
export type ExitWidthInput = z.infer<typeof exitWidthInputSchema>;
export const EXIT_WIDTH_DEFAULTS: ExitWidthInput = { occupantLoad: 200, numExits: 2, doorLeafWidth: 850 };

// --- Occupant Load Calculation ---
export const occupantLoadInputSchema = z.object({
  floorArea: z.number().positive('Must be positive'), // m²
  useClassification: z.enum([
    'assembly_fixed_seating',
    'assembly_standing',
    'business',
    'educational',
    'high_hazard',
    'industrial',
    'institutional_sleeping',
    'institutional_day_care',
    'mercantile',
    'residential',
    'storage',
  ]),
});
export type OccupantLoadInput = z.infer<typeof occupantLoadInputSchema>;
export const OCCUPANT_LOAD_DEFAULTS: OccupantLoadInput = { floorArea: 500, useClassification: 'business' };

// --- Fire Resistance Rating ---
export const fireRatingInputSchema = z.object({
  buildingType: z.enum(['structural', 'compartment_wall', 'floor']),
  buildingHeight: z.number().positive('Must be positive'), // m
  occupancyClassification: z.string().min(1, 'Required'),
});
export type FireRatingInput = z.infer<typeof fireRatingInputSchema>;
export const FIRE_RATING_DEFAULTS: FireRatingInput = { buildingType: 'structural', buildingHeight: 12, occupancyClassification: 'A1' };

// --- Fire Flow Rate ---
export const fireFlowInputSchema = z.object({
  buildingArea: z.number().positive('Must be positive'), // m²
  occupancyType: z.enum(['low', 'moderate', 'high']),
  constructionType: z.enum(['fire_resistant', 'non_combustible', 'combustible']),
});
export type FireFlowInput = z.infer<typeof fireFlowInputSchema>;
export const FIRE_FLOW_DEFAULTS: FireFlowInput = { buildingArea: 1200, occupancyType: 'moderate', constructionType: 'non_combustible' };

// --- Hydrant Spacing ---
export const hydrantSpacingInputSchema = z.object({
  riskCategory: z.enum(['low', 'moderate', 'high']),
  proposedSpacing: z.number().positive('Must be positive'), // m
});
export type HydrantSpacingInput = z.infer<typeof hydrantSpacingInputSchema>;
export const HYDRANT_SPACING_DEFAULTS: HydrantSpacingInput = { riskCategory: 'moderate', proposedSpacing: 90 };

// --- Fire Pump Sizing ---
export const firePumpInputSchema = z.object({
  systemDemandFlow: z.number().positive('Must be positive'), // L/s
  frictionLoss: z.number().positive('Must be positive'), // kPa
  elevationHead: z.number().positive('Must be positive'), // m
  residualPressure: z.number().positive().default(150), // kPa
});
export type FirePumpInput = z.infer<typeof firePumpInputSchema>;
export const FIRE_PUMP_DEFAULTS: FirePumpInput = { systemDemandFlow: 25, frictionLoss: 80, elevationHead: 15, residualPressure: 150 };
