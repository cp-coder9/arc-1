import { z } from 'zod';

// --------------------------------------------------------------------------
// Concrete Beam Design (SANS 10100-1 §4.3.3)
// --------------------------------------------------------------------------

export const concreteBeamInputSchema = z.object({
  b: z.number().positive().max(2000, 'Max width 2000mm'), // mm
  h: z.number().positive().max(3000, 'Max depth 3000mm'), // mm
  d: z.number().positive().max(2950, 'Max effective depth 2950mm'), // mm
  As: z.number().positive().max(50000, 'Max rebar area 50000mm²'), // mm²
  fy: z.enum(['250', '450', '500']),
  fcu: z.enum(['25', '30', '35', '40', '50']),
  span: z.number().positive().max(20, 'Max span 20m'), // m
  appliedMoment: z.number().positive(), // kNm
});
export type ConcreteBeamInput = z.infer<typeof concreteBeamInputSchema>;
export const CONCRETE_BEAM_DEFAULTS: ConcreteBeamInput = { b: 300, h: 600, d: 550, As: 1570, fy: '450', fcu: '30', span: 6, appliedMoment: 150 };

// --------------------------------------------------------------------------
// Slab Design (SANS 10100-1)
// --------------------------------------------------------------------------

export const concreteSlabInputSchema = z.object({
  spanType: z.enum(['one-way', 'two-way']),
  lx: z.number().positive().max(12, 'Max short span 12m'), // m (short span)
  ly: z.number().positive().max(20, 'Max long span 20m').optional(), // m (long span, required for two-way)
  h: z.number().positive().max(500, 'Max slab depth 500mm'), // mm
  fy: z.enum(['250', '450', '500']),
  fcu: z.enum(['25', '30', '35', '40', '50']),
  imposedLoad: z.number().positive().max(25, 'Max imposed load 25 kN/m²'), // kN/m²
  permanentLoad: z.number().positive().max(30, 'Max permanent load 30 kN/m²'), // kN/m²
});
export type ConcreteSlabInput = z.infer<typeof concreteSlabInputSchema>;
export const CONCRETE_SLAB_DEFAULTS: ConcreteSlabInput = { spanType: 'one-way', lx: 4, ly: 6, h: 200, fy: '450', fcu: '30', imposedLoad: 2.5, permanentLoad: 5.0 };

// --------------------------------------------------------------------------
// Column Design (SANS 10100-1 §4.7)
// --------------------------------------------------------------------------

export const concreteColumnInputSchema = z.object({
  b: z.number().positive().max(1500, 'Max column width 1500mm'), // mm
  h: z.number().positive().max(1500, 'Max column depth 1500mm'), // mm
  length: z.number().positive().max(20, 'Max column length 20m'), // m
  effectiveLengthFactor: z.enum(['0.75', '1.0', '1.2', '1.5', '2.0']),
  fcu: z.enum(['25', '30', '35', '40', '50']),
  fy: z.enum(['250', '450', '500']),
  axialLoad: z.number().positive(), // kN
  moment: z.number().min(0), // kNm (can be zero for axially loaded columns)
});
export type ConcreteColumnInput = z.infer<typeof concreteColumnInputSchema>;
export const CONCRETE_COLUMN_DEFAULTS: ConcreteColumnInput = { b: 400, h: 400, length: 3.5, effectiveLengthFactor: '1.0', fcu: '30', fy: '450', axialLoad: 1500, moment: 80 };

// --------------------------------------------------------------------------
// Anchorage and Lap Length (SANS 10100-1 §5.8)
// --------------------------------------------------------------------------

export const concreteAnchorageInputSchema = z.object({
  barDiameter: z.enum(['8', '10', '12', '16', '20', '25', '32', '40']),
  fy: z.enum(['250', '450', '500']),
  fcu: z.enum(['25', '30', '35', '40', '50']),
  cover: z.number().positive().max(100, 'Max cover 100mm'), // mm
  barSpacing: z.number().positive().max(500, 'Max bar spacing 500mm'), // mm
  confinement: z.enum(['confined', 'unconfined']),
  lapType: z.enum(['tension', 'compression']),
});
export type ConcreteAnchorageInput = z.infer<typeof concreteAnchorageInputSchema>;
export const CONCRETE_ANCHORAGE_DEFAULTS: ConcreteAnchorageInput = { barDiameter: '16', fy: '450', fcu: '30', cover: 40, barSpacing: 150, confinement: 'confined', lapType: 'tension' };

// --------------------------------------------------------------------------
// Crack Width (SANS 10100-1 §3.8 — acr method)
// --------------------------------------------------------------------------

export const concreteCrackWidthInputSchema = z.object({
  b: z.number().positive().max(2000, 'Max width 2000mm'), // mm
  h: z.number().positive().max(3000, 'Max depth 3000mm'), // mm
  d: z.number().positive().max(2950, 'Max effective depth 2950mm'), // mm
  As: z.number().positive().max(50000, 'Max rebar area 50000mm²'), // mm²
  barDiameter: z.enum(['8', '10', '12', '16', '20', '25', '32', '40']),
  barSpacing: z.number().positive().max(500, 'Max bar spacing 500mm'), // mm
  cover: z.number().positive().max(100, 'Max cover 100mm'), // mm
  moment: z.number().positive(), // kNm (service moment)
  fcu: z.enum(['25', '30', '35', '40', '50']),
  fy: z.enum(['250', '450', '500']),
});
export type ConcreteCrackWidthInput = z.infer<typeof concreteCrackWidthInputSchema>;
export const CONCRETE_CRACK_WIDTH_DEFAULTS: ConcreteCrackWidthInput = { b: 300, h: 600, d: 550, As: 1570, barDiameter: '16', barSpacing: 150, cover: 40, moment: 100, fcu: '30', fy: '450' };

// --------------------------------------------------------------------------
// Minimum Reinforcement (SANS 10100-1 Table 13)
// --------------------------------------------------------------------------

export const concreteMinRebarInputSchema = z.object({
  sectionType: z.enum(['beam', 'slab', 'column']),
  b: z.number().positive().max(2000, 'Max width 2000mm'), // mm
  h: z.number().positive().max(3000, 'Max depth 3000mm'), // mm
  fcu: z.enum(['25', '30', '35', '40', '50']),
  fy: z.enum(['250', '450', '500']),
});
export type ConcreteMinRebarInput = z.infer<typeof concreteMinRebarInputSchema>;
export const CONCRETE_MIN_REBAR_DEFAULTS: ConcreteMinRebarInput = { sectionType: 'beam', b: 300, h: 600, fcu: '30', fy: '450' };
