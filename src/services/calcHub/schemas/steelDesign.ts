import { z } from 'zod';

export const steelBeamInputSchema = z.object({
  sectionId: z.string().min(1, 'Select a section'),
  grade: z.enum(['300', '350']),
  span: z.number().positive().max(30, 'Max span 30m'),
  udl: z.number().positive(),
  deflectionLimit: z.number().positive().default(250),
});
export type SteelBeamInput = z.infer<typeof steelBeamInputSchema>;
export const STEEL_BEAM_DEFAULTS: SteelBeamInput = { sectionId: '457x191UB67', grade: '350', span: 6, udl: 25, deflectionLimit: 250 };

export const steelColumnInputSchema = z.object({
  sectionId: z.string().min(1),
  grade: z.enum(['300', '350']),
  effectiveLength: z.number().positive().max(20),
  axialLoad: z.number().positive(),
  effectiveLengthFactor: z.number().min(0.5).max(2.0).default(1.0),
});
export type SteelColumnInput = z.infer<typeof steelColumnInputSchema>;
export const STEEL_COLUMN_DEFAULTS: SteelColumnInput = { sectionId: '305x165UB54', grade: '350', effectiveLength: 4, axialLoad: 500, effectiveLengthFactor: 1.0 };

export const steelBoltInputSchema = z.object({
  boltDiameter: z.enum(['12', '16', '20', '24', '30']),
  boltGrade: z.enum(['4.6', '8.8', '10.9']),
  numBolts: z.number().int().positive().max(20),
  shearPlanes: z.number().int().min(1).max(2).default(1),
  plateThickness: z.number().positive().max(50),
  plateGrade: z.enum(['300', '350']),
  appliedForce: z.number().positive(),
});
export type SteelBoltInput = z.infer<typeof steelBoltInputSchema>;
export const STEEL_BOLT_DEFAULTS: SteelBoltInput = { boltDiameter: '20', boltGrade: '8.8', numBolts: 4, shearPlanes: 1, plateThickness: 10, plateGrade: '350', appliedForce: 200 };

export const steelWeldInputSchema = z.object({
  weldSize: z.number().positive().max(20), // mm (leg length)
  weldLength: z.number().positive().max(5000), // mm
  electrodeGrade: z.enum(['E70XX']).default('E70XX'),
  appliedForce: z.number().positive(), // kN
  angle: z.number().min(0).max(90).default(90), // degrees — load angle to weld axis
});
export type SteelWeldInput = z.infer<typeof steelWeldInputSchema>;
export const STEEL_WELD_DEFAULTS: SteelWeldInput = { weldSize: 6, weldLength: 200, electrodeGrade: 'E70XX', appliedForce: 150, angle: 90 };

export const steelBasePlateInputSchema = z.object({
  columnSectionId: z.string().min(1),
  axialLoad: z.number().positive(), // kN
  concreteGrade: z.enum(['25', '30', '35', '40']),
  plateGrade: z.enum(['300', '350']),
  basePlateLength: z.number().positive().max(1000), // mm
  basePlateWidth: z.number().positive().max(1000), // mm
});
export type SteelBasePlateInput = z.infer<typeof steelBasePlateInputSchema>;
export const STEEL_BASE_PLATE_DEFAULTS: SteelBasePlateInput = { columnSectionId: '305x165UB54', axialLoad: 500, concreteGrade: '30', plateGrade: '300', basePlateLength: 400, basePlateWidth: 400 };

export const profileComparatorInputSchema = z.object({
  sectionIds: z.array(z.string().min(1)).min(2).max(6),
});
export type ProfileComparatorInput = z.infer<typeof profileComparatorInputSchema>;
export const PROFILE_COMPARATOR_DEFAULTS: ProfileComparatorInput = { sectionIds: ['457x191UB67', '457x191UB74'] };
