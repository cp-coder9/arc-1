// XA Verification Service
//
// Manages the verification state of AI-populated fields across the assessment.
// Tracks which fields are verified, unverified, or manually entered,
// and computes the verification summary for the assessment.

import type {
  DataSource,
  TrackedField,
  VerificationSummary,
  XaAssessment,
} from './types';

export interface UnverifiedField {
  path: string;
  label: string;
  value: unknown;
  confidence: number;
  drawingRef: string;
}

/**
 * Service for managing field verification states.
 */
export class XaVerificationService {
  /**
   * Compute the verification summary for an assessment.
   */
  computeSummary(assessment: XaAssessment): VerificationSummary {
    const fields = this.collectAllTrackedFields(assessment);
    const aiFields = fields.filter(f => f.source.type === 'ai');
    const verified = aiFields.filter(f => f.source.type === 'ai' && f.source.verified);
    const unverified = aiFields.filter(f => f.source.type === 'ai' && !f.source.verified);
    const manual = fields.filter(f => f.source.type === 'manual');

    const totalConfidence = aiFields.reduce((s, f) => {
      if (f.source.type === 'ai') return s + f.source.confidence;
      return s;
    }, 0);
    const avgConfidence = aiFields.length > 0 ? Math.round(totalConfidence / aiFields.length) : 0;

    return {
      totalFields: fields.length,
      aiPopulated: aiFields.length,
      verified: verified.length,
      unverified: unverified.length,
      manual: manual.length,
      avgConfidence,
    };
  }

  /**
   * Get all fields that need verification (AI-populated but not yet verified).
   */
  getUnverifiedFields(assessment: XaAssessment): UnverifiedField[] {
    const fields = this.collectAllTrackedFields(assessment);
    return fields
      .filter(f => f.source.type === 'ai' && !f.source.verified)
      .map(f => ({
        path: f.path,
        label: f.label,
        value: f.value,
        confidence: f.source.type === 'ai' ? f.source.confidence : 0,
        drawingRef: f.source.type === 'ai' ? f.source.drawingRef : '',
      }));
  }

  /**
   * Check if assessment is ready for sign-off (all fields verified, no failures unaddressed).
   */
  isReadyForSignoff(assessment: XaAssessment): { ready: boolean; blockers: string[] } {
    const summary = this.computeSummary(assessment);
    const blockers: string[] = [];

    if (summary.unverified > 0) {
      blockers.push(`${summary.unverified} field(s) awaiting verification`);
    }
    if (assessment.overallStatus === 'fail') {
      blockers.push('Assessment has failing components');
    }

    return { ready: blockers.length === 0, blockers };
  }

  /**
   * Collect all tracked fields from the assessment for analysis.
   */
  private collectAllTrackedFields(assessment: XaAssessment): Array<{ path: string; label: string; value: unknown; source: DataSource }> {
    const fields: Array<{ path: string; label: string; value: unknown; source: DataSource }> = [];

    // Basics
    fields.push({ path: 'basics.city', label: 'City', value: assessment.basics.city.value, source: assessment.basics.city.source });
    fields.push({ path: 'basics.climateZone', label: 'Climate Zone', value: assessment.basics.climateZone.value, source: assessment.basics.climateZone.source });
    fields.push({ path: 'basics.occupancyClass', label: 'Occupancy', value: assessment.basics.occupancyClass.value, source: assessment.basics.occupancyClass.source });
    fields.push({ path: 'basics.primaryOrientation', label: 'Orientation', value: assessment.basics.primaryOrientation.value, source: assessment.basics.primaryOrientation.source });

    // Storeys
    for (const storey of assessment.basics.storeys) {
      fields.push({ path: `basics.storeys.${storey.id}.nfa`, label: `${storey.label} NFA`, value: storey.nfa.value, source: storey.nfa.source });
    }

    // Fenestration openings
    for (const storey of assessment.fenestration.storeys) {
      for (const op of storey.openings) {
        fields.push({ path: `fenestration.${storey.storeyId}.${op.id}.shgc`, label: `${op.ref} SHGC`, value: op.shgc.value, source: op.shgc.source });
        fields.push({ path: `fenestration.${storey.storeyId}.${op.id}.uValue`, label: `${op.ref} U-value`, value: op.uValue.value, source: op.uValue.source });
      }
    }

    // Hot water
    fields.push({ path: 'hotWater.technology', label: 'HW Technology', value: assessment.hotWater.technology.value, source: assessment.hotWater.technology.source });
    fields.push({ path: 'hotWater.occupants', label: 'Occupants', value: assessment.hotWater.occupants.value, source: assessment.hotWater.occupants.source });

    // Lighting sensors
    fields.push({ path: 'lighting.sensorCount', label: 'Sensor Count', value: assessment.lighting.sensorCount.value, source: assessment.lighting.sensorCount.source });

    return fields;
  }
}
