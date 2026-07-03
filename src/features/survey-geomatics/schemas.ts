/**
 * Survey & Geomatics Module — Zod Validation Schemas
 *
 * Validation schemas for survey instructions, SG diagrams,
 * beacons, boundary lines, and as-built comparisons.
 *
 * Requirements: 16.5, 17.11, 18.1, 18.7, 18.8, 19.2
 */

import { z } from 'zod';

// ─── Survey Instruction Schema ────────────────────────────────────────────────

export const surveyInstructionSchema = z.object({
  surveyType: z.enum([
    'boundary_determination',
    'topographic_survey',
    'as_built_survey',
    'sectional_title_survey',
    'subdivision_survey',
    'consolidation_survey',
    'general_purposes_diagram',
  ]),
  propertyDescription: z.string().min(1).max(500),
  scopeOfWork: z.string().min(1).max(2000),
  appointedSurveyorName: z.string().min(1).max(200),
  appointedSurveyorPLATO: z.string().min(1).max(20),
  appointedSurveyorId: z.string().optional(),
  requiredCompletionDate: z.string().date(),
  linkedDocuments: z.array(z.string()).max(20).default([]),
  linkedTownPlanningAppId: z.string().optional(),
});

// ─── SG Diagram Schema ───────────────────────────────────────────────────────

/**
 * Unique reference per project is validated at the service layer
 * (requires async database lookup).
 */
export const sgDiagramSchema = z.object({
  diagramReference: z.string().min(1).max(50),
  diagramType: z.enum(['general_plan', 'sectional_title', 'subdivision', 'consolidation', 'servitude']),
  linkedSurveyInstructionId: z.string().min(1),
  propertyDescription: z.string().min(1).max(200),
  lodgementDate: z.string().date(),
  lodgementOffice: z.enum([
    'Cape Town',
    'Pretoria',
    'Pietermaritzburg',
    'Bloemfontein',
    "King William's Town",
    'Mthatha',
  ]),
  surveyorName: z.string().min(1).max(200),
  surveyorPLATO: z.string().min(1).max(20),
  expectedProcessingDays: z.number().int().min(1).max(365).default(60),
});

// ─── Beacon Schema ────────────────────────────────────────────────────────────

/**
 * Beacon coordinates are validated based on the selected coordinate system:
 * - WGS84: latitude and longitude are required (SA geographic bounds)
 * - Hartebeesthoek94: yCoordinate and xCoordinate are required (Lo system)
 *
 * SA geographic bounds: latitude -35.0 to -22.0, longitude 16.0 to 33.0
 */
export const beaconSchema = z.object({
  identifier: z.string().min(1).max(50).regex(/^[a-zA-Z0-9\-_]+$/),
  beaconType: z.enum(['iron_peg', 'concrete_block', 'nail_in_tar', 'reference_mark', 'trigonometric_beacon', 'other']),
  coordinateSystem: z.enum(['WGS84', 'Hartebeesthoek94']),
  latitude: z.number().min(-35.0).max(-22.0).optional(),
  longitude: z.number().min(16.0).max(33.0).optional(),
  yCoordinate: z.number().optional(),
  xCoordinate: z.number().optional(),
  condition: z.enum(['intact', 'damaged', 'missing', 'replaced']),
  dateLastInspected: z.string().date(),
  linkedDiagramRef: z.string().optional(),
  notes: z.string().max(500).optional(),
}).refine(data => {
  if (data.coordinateSystem === 'WGS84') {
    return data.latitude !== undefined && data.longitude !== undefined;
  }
  return data.yCoordinate !== undefined && data.xCoordinate !== undefined;
}, { message: 'Coordinates required for selected coordinate system' });

// ─── Measurement Pair Schema ──────────────────────────────────────────────────

/**
 * Measurement range: 0.001–99999.999 metres
 * Tolerance range: 0.001–1.000 metres (default 50mm)
 */
export const measurementPairSchema = z.object({
  dimensionDescription: z.string().min(1).max(200),
  approvedDimension: z.number().min(0.001).max(99999.999),
  asBuiltDimension: z.number().min(0.001).max(99999.999),
  toleranceThreshold: z.number().min(0.001).max(1.000).default(0.050),
});

// ─── Boundary Line Schema ─────────────────────────────────────────────────────

export const boundaryLineSchema = z.object({
  parcelIdentifier: z.string().min(1),
  beaconSequence: z.array(z.string()).min(2),
});

// ─── Inferred Input Types ─────────────────────────────────────────────────────

/** Validated input type for survey instruction creation. */
export type SurveyInstructionInput = z.infer<typeof surveyInstructionSchema>;

/** Validated input type for SG diagram registration. */
export type SGDiagramInput = z.infer<typeof sgDiagramSchema>;

/** Validated input type for beacon registration. */
export type BeaconInput = z.infer<typeof beaconSchema>;

/** Validated input type for measurement pair entry. */
export type MeasurementPairInput = z.infer<typeof measurementPairSchema>;

/** Validated input type for boundary line definition. */
export type BoundaryLineInput = z.infer<typeof boundaryLineSchema>;
