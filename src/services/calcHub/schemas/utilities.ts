import { z } from 'zod';
import type { UnitCategory } from '../data/unitConversions';

// ----------------------------------------------------------------------------
// Utilities Schemas — Unit Conversion, Material Lookup, Section Properties
//
// Design reference: .kiro/specs/engineers-calculation-hub/design.md
// Requirements: 18.1, 18.2, 18.3
// ----------------------------------------------------------------------------

/** All valid unit categories (mirroring UnitCategory type from data) */
const UNIT_CATEGORIES: [UnitCategory, ...UnitCategory[]] = [
  'length', 'area', 'volume', 'mass', 'force',
  'pressure', 'moment', 'velocity', 'flow', 'temperature',
  'density', 'power', 'energy', 'angle', 'time',
  'acceleration', 'torque', 'stress',
];

// --- Unit Conversion ---

export const unitConversionInputSchema = z.object({
  /** Numeric value to convert */
  value: z.number(),
  /** Source unit symbol (e.g., 'mm', 'kN', '°C') */
  fromUnit: z.string().min(1),
  /** Target unit symbol */
  toUnit: z.string().min(1),
  /** Unit category */
  category: z.enum(UNIT_CATEGORIES),
});
export type UnitConversionInput = z.infer<typeof unitConversionInputSchema>;
export const UNIT_CONVERSION_DEFAULTS: UnitConversionInput = {
  value: 1000,
  fromUnit: 'mm',
  toUnit: 'm',
  category: 'length',
};

// --- Material Density Lookup ---

export const materialDensityLookupSchema = z.object({
  /** Material name to look up (case-insensitive) */
  materialName: z.string().min(1),
});
export type MaterialDensityLookupInput = z.infer<typeof materialDensityLookupSchema>;
export const MATERIAL_DENSITY_LOOKUP_DEFAULTS: MaterialDensityLookupInput = {
  materialName: 'structural steel',
};

// --- Section Properties Calculator ---

export const sectionPropertiesInputSchema = z.object({
  /** Cross-section shape */
  shape: z.enum(['rectangle', 'circle', 'i_section', 't_section', 'l_section']),
  /** Overall width (mm) — used for rectangle, I, T, L */
  width: z.number().positive(),
  /** Overall height/depth (mm) — used for rectangle, I, T, L */
  height: z.number().positive(),
  /** Flange width (mm) — for I-section and T-section */
  flangeWidth: z.number().positive().optional(),
  /** Flange thickness (mm) — for I-section and T-section */
  flangeThickness: z.number().positive().optional(),
  /** Web thickness (mm) — for I-section, T-section, and L-section */
  webThickness: z.number().positive().optional(),
});
export type SectionPropertiesInput = z.infer<typeof sectionPropertiesInputSchema>;
export const SECTION_PROPERTIES_DEFAULTS: SectionPropertiesInput = {
  shape: 'rectangle',
  width: 300,
  height: 500,
};
