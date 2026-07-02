import { z } from 'zod';

// --- Duct Sizing (Round / Rectangular) ---
export const ductSizingInputSchema = z.object({
  airflowRate: z.number().positive('Must be positive'), // L/s
  maxVelocity: z.number().positive().default(6), // m/s
  ductShape: z.enum(['round', 'rectangular']),
  aspectRatio: z.number().positive().default(2), // for rectangular ducts
});
export type DuctSizingInput = z.infer<typeof ductSizingInputSchema>;
export const DUCT_SIZING_DEFAULTS: DuctSizingInput = { airflowRate: 500, maxVelocity: 6, ductShape: 'round', aspectRatio: 2 };

// --- Chilled Water Pipe Sizing ---
export const chilledWaterPipeInputSchema = z.object({
  coolingLoad: z.number().positive('Must be positive'), // kW
  deltaT: z.number().positive().default(5), // °C
  maxVelocity: z.number().positive().default(2.5), // m/s
});
export type ChilledWaterPipeInput = z.infer<typeof chilledWaterPipeInputSchema>;
export const CHILLED_WATER_PIPE_DEFAULTS: ChilledWaterPipeInput = { coolingLoad: 100, deltaT: 5, maxVelocity: 2.5 };

// --- Fan Selection ---
export const fanSelectionInputSchema = z.object({
  airflowRate: z.number().positive('Must be positive'), // L/s
  systemResistance: z.number().positive('Must be positive'), // Pa
  fanEfficiency: z.number().min(0.5, 'Min 0.5').max(0.9, 'Max 0.9').default(0.7),
});
export type FanSelectionInput = z.infer<typeof fanSelectionInputSchema>;
export const FAN_SELECTION_DEFAULTS: FanSelectionInput = { airflowRate: 1000, systemResistance: 250, fanEfficiency: 0.7 };

// --- Heat Gain Calculation ---
export const heatGainInputSchema = z.object({
  wallArea: z.number().nonnegative(), // m²
  roofArea: z.number().nonnegative(), // m²
  glazingArea: z.number().nonnegative(), // m²
  wallUValue: z.number().positive(), // W/(m²·K)
  roofUValue: z.number().positive(), // W/(m²·K)
  glazingUValue: z.number().positive(), // W/(m²·K)
  outdoorTemp: z.number().default(35), // °C (SA summer default)
  indoorTemp: z.number().default(24), // °C
  occupants: z.number().int().nonnegative(),
  lightingWatts: z.number().nonnegative(), // W
  equipmentWatts: z.number().nonnegative(), // W
});
export type HeatGainInput = z.infer<typeof heatGainInputSchema>;
export const HEAT_GAIN_DEFAULTS: HeatGainInput = {
  wallArea: 120,
  roofArea: 80,
  glazingArea: 30,
  wallUValue: 0.5,
  roofUValue: 0.4,
  glazingUValue: 3.5,
  outdoorTemp: 35,
  indoorTemp: 24,
  occupants: 20,
  lightingWatts: 1500,
  equipmentWatts: 3000,
};

// --- Heat Loss Calculation ---
export const heatLossInputSchema = z.object({
  elements: z.array(z.object({
    area: z.number().positive(), // m²
    uValue: z.number().positive(), // W/(m²·K)
  })).min(1, 'At least one element required'),
  ventilationRate: z.number().nonnegative(), // L/s
  indoorTemp: z.number().default(21), // °C
  outdoorTemp: z.number().default(5), // °C (SA winter default)
  volume: z.number().positive(), // m³
});
export type HeatLossInput = z.infer<typeof heatLossInputSchema>;
export const HEAT_LOSS_DEFAULTS: HeatLossInput = {
  elements: [
    { area: 80, uValue: 0.5 },
    { area: 50, uValue: 0.4 },
    { area: 20, uValue: 3.5 },
  ],
  ventilationRate: 50,
  indoorTemp: 21,
  outdoorTemp: 5,
  volume: 200,
};
