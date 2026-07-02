import { z } from 'zod';

// ----------------------------------------------------------------------------
// Wet Services Schemas — SANS 10252-1
//
// Design reference: .kiro/specs/engineers-calculation-hub/design.md
// Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8, 17.9
// ----------------------------------------------------------------------------

// --- Cold Water Pipe Sizing ---

export const coldWaterPipeInputSchema = z.object({
  /** Total loading units (positive) */
  loadingUnits: z.number().positive(),
  /** Pipe material */
  pipeMaterial: z.enum(['copper', 'steel', 'pvc']),
  /** Total pipe run length (m) */
  pipeLength: z.number().positive(),
  /** Height above water main (m) */
  heightAboveMain: z.number().min(0),
  /** Available supply pressure (kPa) — SA municipal default ~300 kPa */
  availablePressure: z.number().positive().default(300),
});
export type ColdWaterPipeInput = z.infer<typeof coldWaterPipeInputSchema>;
export const COLD_WATER_PIPE_DEFAULTS: ColdWaterPipeInput = {
  loadingUnits: 30,
  pipeMaterial: 'copper',
  pipeLength: 15,
  heightAboveMain: 6,
  availablePressure: 300,
};

// --- Hot Water Pipe Sizing ---

export const hotWaterPipeInputSchema = z.object({
  /** Total loading units (positive) */
  loadingUnits: z.number().positive(),
  /** Pipe material */
  pipeMaterial: z.enum(['copper', 'steel', 'pvc']),
  /** Total pipe run length (m) */
  pipeLength: z.number().positive(),
  /** Maximum dead leg length (m) — SANS 10252-1 limit */
  maxDeadLeg: z.number().positive().default(3),
});
export type HotWaterPipeInput = z.infer<typeof hotWaterPipeInputSchema>;
export const HOT_WATER_PIPE_DEFAULTS: HotWaterPipeInput = {
  loadingUnits: 20,
  pipeMaterial: 'copper',
  pipeLength: 10,
  maxDeadLeg: 3,
};

// --- Pressure Drop (Hazen-Williams) ---

export const pressureDropInputSchema = z.object({
  /** Flow rate (L/s) */
  flowRate: z.number().positive(),
  /** Internal pipe diameter (mm) */
  pipeDiameter: z.number().positive(),
  /** Pipe run length (m) */
  pipeLength: z.number().positive(),
  /** Hazen-Williams C coefficient — default 120 (copper) */
  hazenWilliamsC: z.number().positive().default(120),
  /** Number of fittings (equivalent length additions) */
  numFittings: z.number().int().min(0).default(0),
});
export type PressureDropInput = z.infer<typeof pressureDropInputSchema>;
export const PRESSURE_DROP_DEFAULTS: PressureDropInput = {
  flowRate: 0.5,
  pipeDiameter: 22,
  pipeLength: 20,
  hazenWilliamsC: 120,
  numFittings: 5,
};

// --- Drainage Pipe Sizing ---

export const drainagePipeInputSchema = z.object({
  /** Total fixture units (positive integer) per SANS 10252-1 Table 4 */
  fixtureUnits: z.number().int().positive(),
  /** Pipe gradient (m/m) — default 0.017 (≈1:60 for 100mm) */
  gradient: z.number().positive().max(0.5).default(0.017),
  /** Pipe material type */
  pipeType: z.enum(['pvc', 'cast_iron']),
});
export type DrainagePipeInput = z.infer<typeof drainagePipeInputSchema>;
export const DRAINAGE_PIPE_DEFAULTS: DrainagePipeInput = {
  fixtureUnits: 12,
  gradient: 0.017,
  pipeType: 'pvc',
};

// --- Vent Pipe Sizing ---

export const ventSizingInputSchema = z.object({
  /** Total fixture units connected (positive integer) */
  fixtureUnits: z.number().int().positive(),
  /** Developed length of vent (m) */
  developedLength: z.number().positive(),
});
export type VentSizingInput = z.infer<typeof ventSizingInputSchema>;
export const VENT_SIZING_DEFAULTS: VentSizingInput = {
  fixtureUnits: 24,
  developedLength: 8,
};

// --- Geyser / Storage Vessel Sizing ---

export const geyserSizingInputSchema = z.object({
  /** Number of occupants (integer) */
  numOccupants: z.number().int().positive(),
  /** Peak demand factor — SA typical 1.5 */
  peakDemandFactor: z.number().positive().default(1.5),
  /** Recovery rate (L/h) — typical electric geyser ~50 L/h */
  recoveryRate: z.number().positive().default(50),
});
export type GeyserSizingInput = z.infer<typeof geyserSizingInputSchema>;
export const GEYSER_SIZING_DEFAULTS: GeyserSizingInput = {
  numOccupants: 4,
  peakDemandFactor: 1.5,
  recoveryRate: 50,
};

// --- Solar Pre-Heat System ---

export const solarPreHeatInputSchema = z.object({
  /** Daily hot water demand (L) */
  dailyHotWaterDemand: z.number().positive(),
  /** Location for solar irradiation data */
  location: z.enum(['johannesburg', 'cape_town', 'durban', 'pretoria']),
  /** Collector efficiency (0.3–0.8) */
  collectorEfficiency: z.number().min(0.3).max(0.8).default(0.6),
  /** Solar irradiation override (kWh/m²/day) — optional, uses location default if omitted */
  solarIrradiation: z.number().positive().optional(),
});
export type SolarPreHeatInput = z.infer<typeof solarPreHeatInputSchema>;
export const SOLAR_PRE_HEAT_DEFAULTS: SolarPreHeatInput = {
  dailyHotWaterDemand: 200,
  location: 'johannesburg',
  collectorEfficiency: 0.6,
};

// --- Circulation Return System ---

export const circulationReturnInputSchema = z.object({
  /** Total pipe run length (m) */
  pipeLength: z.number().positive(),
  /** Pipe internal diameter (mm) */
  pipeDiameter: z.number().positive(),
  /** Insulation thickness (mm) — typical 25mm */
  insulationThickness: z.number().positive().default(25),
  /** Ambient temperature (°C) — SA default 20°C */
  ambientTemp: z.number().min(-10).max(50).default(20),
  /** Flow temperature (°C) — typical 60°C for HW circulation */
  flowTemp: z.number().positive().max(100).default(60),
});
export type CirculationReturnInput = z.infer<typeof circulationReturnInputSchema>;
export const CIRCULATION_RETURN_DEFAULTS: CirculationReturnInput = {
  pipeLength: 30,
  pipeDiameter: 22,
  insulationThickness: 25,
  ambientTemp: 20,
  flowTemp: 60,
};
