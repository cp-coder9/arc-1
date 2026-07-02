import { z } from 'zod';

// ----------------------------------------------------------------------------
// Electrical Schemas — SANS 10142-1
//
// Design reference: .kiro/specs/engineers-calculation-hub/design.md
// Requirements: 16.1, 16.2, 16.3, 16.4
// ----------------------------------------------------------------------------

// --- Cable Sizing ---

export const cableSizingInputSchema = z.object({
  /** Design current (A) */
  current: z.number().positive(),
  /** Cable run length (m) */
  length: z.number().positive(),
  /** System voltage (V) */
  voltage: z.enum(['230', '400']),
  /** Power factor (0.8–1.0) */
  powerFactor: z.number().min(0.8).max(1.0).default(0.9),
  /** Installation method per SANS 10142-1 */
  installMethod: z.enum(['clipped', 'tray', 'conduit', 'buried']),
  /** Ambient temperature (°C) — SA default 30°C */
  ambientTemp: z.number().min(-10).max(60).default(30),
  /** Grouping derating factor (0.5–1.0) */
  groupingFactor: z.number().min(0.5).max(1.0).default(1.0),
  /** Maximum allowable voltage drop (%) */
  maxVoltageDrop: z.number().positive().max(10).default(5),
});
export type CableSizingInput = z.infer<typeof cableSizingInputSchema>;
export const CABLE_SIZING_DEFAULTS: CableSizingInput = {
  current: 32,
  length: 25,
  voltage: '230',
  powerFactor: 0.9,
  installMethod: 'clipped',
  ambientTemp: 30,
  groupingFactor: 1.0,
  maxVoltageDrop: 5,
};

// --- Voltage Drop ---

export const voltageDropInputSchema = z.object({
  /** Design current (A) */
  current: z.number().positive(),
  /** Cable run length (m) */
  length: z.number().positive(),
  /** Cable cross-sectional area (mm²) */
  cableSize: z.enum(['1.5', '2.5', '4', '6', '10', '16', '25', '35', '50', '70', '95', '120']),
  /** System voltage (V) */
  voltage: z.enum(['230', '400']),
  /** Power factor */
  powerFactor: z.number().min(0.8).max(1.0).default(0.9),
});
export type VoltageDropInput = z.infer<typeof voltageDropInputSchema>;
export const VOLTAGE_DROP_DEFAULTS: VoltageDropInput = {
  current: 20,
  length: 30,
  cableSize: '4',
  voltage: '230',
  powerFactor: 0.9,
};

// --- Short Circuit ---

export const shortCircuitInputSchema = z.object({
  /** Supply voltage (V) */
  supplyVoltage: z.enum(['230', '400', '11000']),
  /** Transformer rating (kVA) */
  transformerRating: z.number().positive(),
  /** Transformer impedance (%) — typical 5% */
  transformerImpedance: z.number().positive().max(20).default(5),
  /** Cable length from transformer (m) */
  cableLength: z.number().positive(),
  /** Cable cross-sectional area (mm²) */
  cableSize: z.number().positive(),
});
export type ShortCircuitInput = z.infer<typeof shortCircuitInputSchema>;
export const SHORT_CIRCUIT_DEFAULTS: ShortCircuitInput = {
  supplyVoltage: '400',
  transformerRating: 200,
  transformerImpedance: 5,
  cableLength: 50,
  cableSize: 25,
};

// --- Maximum Demand ---

/** A single circuit entry for maximum demand calculation */
export const maxDemandCircuitSchema = z.object({
  /** Circuit description */
  description: z.string().min(1),
  /** Connected load (kW) */
  connectedLoad: z.number().positive(),
  /** Diversity factor (0–1) per SANS 10142-1 Table 1 */
  diversityFactor: z.number().min(0).max(1),
});

export const maxDemandInputSchema = z.object({
  /** Array of circuits with connected loads and diversity factors */
  circuits: z.array(maxDemandCircuitSchema).min(1),
});
export type MaxDemandInput = z.infer<typeof maxDemandInputSchema>;
export const MAX_DEMAND_DEFAULTS: MaxDemandInput = {
  circuits: [
    { description: 'Lighting', connectedLoad: 5, diversityFactor: 0.66 },
    { description: 'Socket outlets', connectedLoad: 10, diversityFactor: 0.4 },
    { description: 'Geyser', connectedLoad: 3, diversityFactor: 1.0 },
    { description: 'Stove', connectedLoad: 8, diversityFactor: 0.8 },
  ],
};
