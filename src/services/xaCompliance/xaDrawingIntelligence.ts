// XA Drawing Intelligence Service
//
// AI-guided extraction of compliance data from project drawings.
// Connects to Drawing Register, scans drawings via Gemini AI, and returns
// structured data with confidence scores for human verification.
//
// In production this calls the Gemini AI service; in this implementation
// we define the interface and provide mock responses for the review build.

import type {
  ClimateZone,
  DataSource,
  DrawingSource,
  FenestrationOpening,
  HotWaterTechnology,
  Orientation,
  RoofLayer,
  ShadingOpening,
  StoreyDefinition,
  TrackedField,
  WallLayer,
} from './types';

/** Result of AI scanning a project drawing */
export interface DrawingScanResult {
  drawingId: string;
  drawingName: string;
  scannedAt: string;
  extractedFields: ExtractedField[];
}

export interface ExtractedField {
  fieldPath: string; // e.g. 'basics.city', 'fenestration.storeys[0].openings[0].widthMm'
  value: unknown;
  confidence: number; // 0–100
  sourceLocation: string; // e.g. 'Page 3, Window Schedule'
  drawingRef: string;
}

/** What AI can extract from different drawing types */
export interface ProjectBasicsExtraction {
  city?: { value: string; confidence: number };
  climateZone?: { value: ClimateZone; confidence: number };
  orientation?: { value: Orientation; confidence: number };
  storeys?: { value: StoreyDefinition[]; confidence: number };
}

export interface FenestrationExtraction {
  openings: Array<{
    ref: string;
    storeyIndex: number;
    orientation: Orientation;
    widthMm: number;
    heightMm: number;
    uValue?: number;
    shgc?: number;
    confidence: number;
  }>;
}

export interface ShadingExtraction {
  openings: Array<{
    ref: string;
    orientation: Orientation;
    heightMm: number;
    projectionMm: number;
    confidence: number;
  }>;
}

export interface MechanicalExtraction {
  hotWaterTechnology?: { value: HotWaterTechnology; confidence: number };
  supplementaryElectricPct?: { value: number; confidence: number };
  eer?: { value: number; confidence: number };
  occupants?: { value: number; confidence: number };
}

export interface ElectricalExtraction {
  lightingFixtures: Array<{
    zone: string;
    wattage: number;
    qty: number;
    confidence: number;
  }>;
  sensorCount?: { value: number; confidence: number };
}

export interface RoofExtraction {
  layers: Array<{
    name: string;
    rValue: number;
    confidence: number;
  }>;
}

/**
 * Service that orchestrates AI drawing analysis for XA compliance data.
 * Integrates with the Drawing Register to access project drawings.
 */
export class XaDrawingIntelligenceService {
  /**
   * Scan a drawing and extract XA-relevant data.
   * In production: calls Gemini AI with the drawing image/PDF.
   * Returns structured data with confidence scores.
   */
  async scanDrawing(drawingId: string, drawingName: string): Promise<DrawingScanResult> {
    // In production this would call:
    // const result = await geminiService.analyzeDrawing(drawingId, XA_EXTRACTION_PROMPT);
    // For now, return the interface shape — mock data is in the factory.
    return {
      drawingId,
      drawingName,
      scannedAt: new Date().toISOString(),
      extractedFields: [],
    };
  }

  /** Create a tracked field from AI extraction */
  static createAiField<T>(value: T, drawingRef: string, confidence: number): TrackedField<T> {
    return {
      value,
      source: { type: 'ai', drawingRef, confidence, verified: false },
    };
  }

  /** Create a tracked field from manual entry */
  static createManualField<T>(value: T, userId: string): TrackedField<T> {
    return {
      value,
      source: { type: 'manual', enteredBy: userId, enteredAt: new Date().toISOString() },
    };
  }

  /** Create a tracked field from Project Passport */
  static createPassportField<T>(value: T, field: string): TrackedField<T> {
    return {
      value,
      source: { type: 'passport', field },
    };
  }

  /** Mark a field as verified */
  static verifyField<T>(field: TrackedField<T>, userId: string): TrackedField<T> {
    if (field.source.type === 'ai') {
      return {
        ...field,
        source: { ...field.source, verified: true, verifiedBy: userId, verifiedAt: new Date().toISOString() },
      };
    }
    return field;
  }

  /** Calculate average confidence for a set of drawing sources */
  static calculateAvgConfidence(sources: DrawingSource[]): number {
    // In practice this aggregates confidence from all extracted fields
    return 87; // Placeholder — real impl averages across all AI fields
  }
}
