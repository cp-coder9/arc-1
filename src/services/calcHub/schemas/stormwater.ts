import { z } from 'zod';

// --- Rational Method (Q = C·I·A / 3.6) ---
export const rationalMethodInputSchema = z.object({
  runoffCoefficient: z.number().min(0, 'Min 0').max(1, 'Max 1'),
  rainfallIntensity: z.number().positive('Must be positive'), // mm/h
  catchmentArea: z.number().positive('Must be positive'), // hectares
});
export type RationalMethodInput = z.infer<typeof rationalMethodInputSchema>;
export const RATIONAL_METHOD_DEFAULTS: RationalMethodInput = { runoffCoefficient: 0.65, rainfallIntensity: 80, catchmentArea: 2.5 };

// --- Pipe Sizing (Manning's equation) ---
export const pipeSizingInputSchema = z.object({
  designFlow: z.number().positive('Must be positive'), // m³/s
  slope: z.number().min(0.001, 'Min slope 0.001 m/m').max(0.1, 'Max slope 0.1 m/m'), // m/m
  roughnessCoefficient: z.number().positive().default(0.013), // Manning's n (PVC default)
  pipeMaterial: z.enum(['pvc', 'concrete', 'steel']),
});
export type PipeSizingInput = z.infer<typeof pipeSizingInputSchema>;
export const PIPE_SIZING_DEFAULTS: PipeSizingInput = { designFlow: 0.15, slope: 0.005, roughnessCoefficient: 0.013, pipeMaterial: 'pvc' };

// --- Attenuation Tank Sizing (Triangular Hydrograph) ---
export const attenuationInputSchema = z.object({
  preDevelopmentPeak: z.number().positive('Must be positive'), // m³/s
  postDevelopmentPeak: z.number().positive('Must be positive'), // m³/s
  allowableOutflow: z.number().positive('Must be positive'), // m³/s
  stormDuration: z.number().positive('Must be positive'), // hours
});
export type AttenuationInput = z.infer<typeof attenuationInputSchema>;
export const ATTENUATION_DEFAULTS: AttenuationInput = { preDevelopmentPeak: 0.25, postDevelopmentPeak: 0.45, allowableOutflow: 0.25, stormDuration: 1.5 };
