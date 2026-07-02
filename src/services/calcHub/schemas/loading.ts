import { z } from 'zod';

// --- Wind Load (SANS 10160-3) ---

export const windLoadInputSchema = z.object({
  basicWindSpeed: z.number().positive().max(60, 'Max 60 m/s').default(40), // m/s — SA default ~40 m/s
  terrainCategory: z.enum(['1', '2', '3', '4']),
  topographyFactor: z.number().positive().max(2.0).default(1.0),
  buildingHeight: z.number().positive().max(200, 'Max height 200m'), // m
  buildingWidth: z.number().positive(), // m
  buildingDepth: z.number().positive(), // m
  roofAngle: z.number().min(0).max(90), // degrees
});
export type WindLoadInput = z.infer<typeof windLoadInputSchema>;
export const WIND_LOAD_DEFAULTS: WindLoadInput = { basicWindSpeed: 40, terrainCategory: '2', topographyFactor: 1.0, buildingHeight: 10, buildingWidth: 20, buildingDepth: 12, roofAngle: 15 };

// --- Seismic Load (SANS 10160-4) ---

export const seismicLoadInputSchema = z.object({
  groundType: z.enum(['1', '2', '3', '4']),
  importanceFactor: z.number().positive().max(2.0).default(1.0),
  behaviourFactor: z.number().positive().max(8, 'Max behaviour factor 8'),
  buildingWeight: z.number().positive(), // kN
  buildingHeight: z.number().positive(), // m
  numStoreys: z.number().int().positive().max(60),
  naturalPeriod: z.number().positive(), // seconds
});
export type SeismicLoadInput = z.infer<typeof seismicLoadInputSchema>;
export const SEISMIC_LOAD_DEFAULTS: SeismicLoadInput = { groundType: '1', importanceFactor: 1.0, behaviourFactor: 5, buildingWeight: 5000, buildingHeight: 12, numStoreys: 4, naturalPeriod: 0.5 };

// --- Load Combinations (SANS 10160-1) ---

export const loadCombinationInputSchema = z.object({
  deadLoad: z.number().min(0), // kN/m² or kN
  liveLoad: z.number().min(0), // kN/m² or kN
  windLoad: z.number().min(0), // kN/m² or kN
  seismicLoad: z.number().min(0).optional(), // kN/m² or kN — optional
});
export type LoadCombinationInput = z.infer<typeof loadCombinationInputSchema>;
export const LOAD_COMBINATION_DEFAULTS: LoadCombinationInput = { deadLoad: 5, liveLoad: 2.5, windLoad: 1.2, seismicLoad: undefined };

// --- Imposed Load Lookup (SANS 10160-2) ---

export const imposedLoadLookupSchema = z.object({
  occupancyCategory: z.enum([
    'residential_domestic',
    'residential_dormitory',
    'office_general',
    'office_filing',
    'retail_general',
    'retail_dense',
    'assembly_fixed_seating',
    'assembly_without_seating',
    'industrial_light',
    'industrial_heavy',
    'storage_light',
    'storage_heavy',
    'parking_light_vehicles',
    'parking_heavy_vehicles',
    'hospital_wards',
    'hospital_operating',
    'educational_classrooms',
    'educational_corridors',
    'hotel_guest_rooms',
    'hotel_public_areas',
    'balconies',
    'stairs_and_landings',
    'roofs_accessible',
    'roofs_non_accessible',
  ]),
});
export type ImposedLoadLookupInput = z.infer<typeof imposedLoadLookupSchema>;
export const IMPOSED_LOAD_LOOKUP_DEFAULTS: ImposedLoadLookupInput = { occupancyCategory: 'office_general' };
