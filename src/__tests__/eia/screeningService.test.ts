import { describe, expect, it } from 'vitest';

import {
  determineRecommendation,
  evaluateListingNotice1,
  evaluateListingNotice2,
  evaluateListingNotice3,
  runScreening,
} from '@/services/eia/screeningService';
import type { ScreeningInput, TriggeredActivity } from '@/services/eia/eiaTypes';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeValidInput(overrides?: Partial<ScreeningInput>): ScreeningInput {
  return {
    activityType: 'residential',
    totalSiteArea: 5000,
    developmentFootprint: 500,
    province: 'Gauteng',
    municipality: 'City of Johannesburg',
    proximityWatercourse: 500,
    proximityCoastal: 5000,
    proximityProtectedArea: 1000,
    landUseZone: 'residential',
    withinListedGeographicArea: false,
    ...overrides,
  };
}

// ─── runScreening ────────────────────────────────────────────────────────────

describe('runScreening', () => {
  it('returns no_eia_required when no activities are triggered', () => {
    const input = makeValidInput({
      developmentFootprint: 500,
      totalSiteArea: 500,
      proximityWatercourse: 500,
      proximityCoastal: 5000,
      proximityProtectedArea: 1000,
      withinListedGeographicArea: false,
    });

    const result = runScreening(input);

    expect(result.recommendation).toBe('no_eia_required');
    expect(result.triggeredActivities).toHaveLength(0);
    expect(result.advisoryText).toContain('indicative only');
    expect(result.advisoryText).toContain('Competent Authority');
  });

  it('returns basic_assessment when LN1 activity is triggered', () => {
    const input = makeValidInput({
      developmentFootprint: 15_000, // triggers Activity 27 (≥10,000 and <200,000)
      totalSiteArea: 15_000,       // triggers Activity 28
    });

    const result = runScreening(input);

    expect(result.recommendation).toBe('basic_assessment');
    expect(result.triggeredActivities.length).toBeGreaterThan(0);
    expect(result.triggeredActivities.some(a => a.listingNotice === 'GN_R983')).toBe(true);
  });

  it('returns full_scoping_eia when LN2 activity is triggered', () => {
    const input = makeValidInput({
      developmentFootprint: 250_000, // triggers LN2 Activity 15 (≥200,000)
    });

    const result = runScreening(input);

    expect(result.recommendation).toBe('full_scoping_eia');
    expect(result.triggeredActivities.some(a => a.listingNotice === 'GN_R984')).toBe(true);
  });

  it('returns full_scoping_eia even when LN1 and LN3 are also triggered', () => {
    const input = makeValidInput({
      developmentFootprint: 250_000, // triggers LN2 Activity 15
      proximityWatercourse: 10,      // triggers LN1 Activity 19
      withinListedGeographicArea: true, // enables LN3 rules
    });

    const result = runScreening(input);

    expect(result.recommendation).toBe('full_scoping_eia');
    // Should have activities from multiple listing notices
    expect(result.triggeredActivities.some(a => a.listingNotice === 'GN_R984')).toBe(true);
    expect(result.triggeredActivities.some(a => a.listingNotice === 'GN_R983')).toBe(true);
  });

  it('includes correct fields in triggered activity output', () => {
    const input = makeValidInput({
      developmentFootprint: 15_000, // triggers Activity 27
    });

    const result = runScreening(input);
    const triggered = result.triggeredActivities.find(
      a => a.activityNumber === 'Activity 27'
    );

    expect(triggered).toBeDefined();
    expect(triggered!.listingNotice).toBe('GN_R983');
    expect(triggered!.description).toContain('clearance');
    expect(triggered!.triggeringAttribute).toBe('developmentFootprint');
    expect(triggered!.triggeringValue).toBe(15_000);
    expect(triggered!.thresholdValue).toBeDefined();
  });

  it('attaches advisory disclaimer text to every result', () => {
    const input = makeValidInput();
    const result = runScreening(input);

    expect(result.advisoryText).toBe(
      'This screening result is indicative only. The applicant must confirm with the Competent Authority whether an Environmental Authorization is required.'
    );
  });

  it('includes valid id, screenedAt timestamp, and input in result', () => {
    const input = makeValidInput();
    const result = runScreening(input, { projectId: 'proj-123', screenedBy: 'user-abc' });

    expect(result.id).toBeDefined();
    expect(result.id.length).toBeGreaterThan(0);
    expect(result.projectId).toBe('proj-123');
    expect(result.screenedBy).toBe('user-abc');
    expect(result.screenedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.input).toEqual(input);
  });

  it('throws validation error for missing required fields', () => {
    const input = {
      activityType: '',
      totalSiteArea: 0,
      developmentFootprint: 0,
      province: '',
      municipality: '',
      proximityWatercourse: -1,
      proximityCoastal: -1,
      proximityProtectedArea: -1,
      landUseZone: '',
      withinListedGeographicArea: false,
    } as ScreeningInput;

    expect(() => runScreening(input)).toThrow('Validation failed');
  });

  it('throws validation error with field-level messages for out-of-range values', () => {
    const input = makeValidInput({
      totalSiteArea: 0,           // below min of 1
      developmentFootprint: 1_000_000_000, // above max of 999,999,999
    });

    expect(() => runScreening(input)).toThrow('Validation failed');
    try {
      runScreening(input);
    } catch (e: any) {
      expect(e.message).toContain('totalSiteArea');
      expect(e.message).toContain('developmentFootprint');
    }
  });
});

// ─── determineRecommendation ─────────────────────────────────────────────────

describe('determineRecommendation', () => {
  it('returns no_eia_required when no activities triggered', () => {
    expect(determineRecommendation([])).toBe('no_eia_required');
  });

  it('returns basic_assessment when only LN1 activities triggered', () => {
    const triggered: TriggeredActivity[] = [
      {
        listingNotice: 'GN_R983',
        activityNumber: 'Activity 27',
        description: 'Test',
        triggeringAttribute: 'developmentFootprint',
        triggeringValue: 15000,
        thresholdValue: '≥10,000 m²',
      },
    ];

    expect(determineRecommendation(triggered)).toBe('basic_assessment');
  });

  it('returns basic_assessment when only LN3 activities triggered', () => {
    const triggered: TriggeredActivity[] = [
      {
        listingNotice: 'GN_R985',
        activityNumber: 'Activity 12',
        description: 'Test',
        triggeringAttribute: 'developmentFootprint',
        triggeringValue: 500,
        thresholdValue: '≥300 m²',
      },
    ];

    expect(determineRecommendation(triggered)).toBe('basic_assessment');
  });

  it('returns full_scoping_eia when LN2 triggered regardless of others', () => {
    const triggered: TriggeredActivity[] = [
      {
        listingNotice: 'GN_R983',
        activityNumber: 'Activity 27',
        description: 'Test LN1',
        triggeringAttribute: 'developmentFootprint',
        triggeringValue: 15000,
        thresholdValue: '≥10,000 m²',
      },
      {
        listingNotice: 'GN_R984',
        activityNumber: 'Activity 15',
        description: 'Test LN2',
        triggeringAttribute: 'developmentFootprint',
        triggeringValue: 250000,
        thresholdValue: '≥200,000 m²',
      },
    ];

    expect(determineRecommendation(triggered)).toBe('full_scoping_eia');
  });
});

// ─── evaluateListingNotice1 ──────────────────────────────────────────────────

describe('evaluateListingNotice1', () => {
  it('triggers Activity 27 when footprint ≥ 10,000 and < 200,000', () => {
    const input = makeValidInput({ developmentFootprint: 50_000 });
    const results = evaluateListingNotice1(input);

    const activity27 = results.find(r => r.activityNumber === 'Activity 27');
    expect(activity27).toBeDefined();
    expect(activity27!.listingNotice).toBe('GN_R983');
  });

  it('does not trigger Activity 27 when footprint < 10,000', () => {
    const input = makeValidInput({ developmentFootprint: 5_000 });
    const results = evaluateListingNotice1(input);

    const activity27 = results.find(r => r.activityNumber === 'Activity 27');
    expect(activity27).toBeUndefined();
  });

  it('triggers Activity 19 when proximity to watercourse ≤ 32m', () => {
    const input = makeValidInput({ proximityWatercourse: 20 });
    const results = evaluateListingNotice1(input);

    const activity19 = results.find(r => r.activityNumber === 'Activity 19');
    expect(activity19).toBeDefined();
  });

  it('does not trigger Activity 19 when proximity to watercourse > 32m', () => {
    const input = makeValidInput({ proximityWatercourse: 50 });
    const results = evaluateListingNotice1(input);

    const activity19 = results.find(r => r.activityNumber === 'Activity 19');
    expect(activity19).toBeUndefined();
  });
});

// ─── evaluateListingNotice2 ──────────────────────────────────────────────────

describe('evaluateListingNotice2', () => {
  it('triggers Activity 15 when footprint ≥ 200,000', () => {
    const input = makeValidInput({ developmentFootprint: 200_000 });
    const results = evaluateListingNotice2(input);

    const activity15 = results.find(r => r.activityNumber === 'Activity 15');
    expect(activity15).toBeDefined();
    expect(activity15!.listingNotice).toBe('GN_R984');
  });

  it('does not trigger Activity 15 when footprint < 200,000', () => {
    const input = makeValidInput({ developmentFootprint: 100_000 });
    const results = evaluateListingNotice2(input);

    const activity15 = results.find(r => r.activityNumber === 'Activity 15');
    expect(activity15).toBeUndefined();
  });

  it('triggers Activity 6 for industrial activity with footprint ≥ 1,000', () => {
    const input = makeValidInput({
      activityType: 'industrial',
      developmentFootprint: 1_500,
    });
    const results = evaluateListingNotice2(input);

    const activity6 = results.find(r => r.activityNumber === 'Activity 6');
    expect(activity6).toBeDefined();
  });
});

// ─── evaluateListingNotice3 ──────────────────────────────────────────────────

describe('evaluateListingNotice3', () => {
  it('triggers Activity 12 in listed geographic area with footprint ≥ 300', () => {
    const input = makeValidInput({
      withinListedGeographicArea: true,
      developmentFootprint: 500,
    });
    const results = evaluateListingNotice3(input);

    const activity12 = results.find(r => r.activityNumber === 'Activity 12');
    expect(activity12).toBeDefined();
    expect(activity12!.listingNotice).toBe('GN_R985');
  });

  it('does not trigger Activity 12 outside listed geographic area', () => {
    const input = makeValidInput({
      withinListedGeographicArea: false,
      developmentFootprint: 500,
    });
    const results = evaluateListingNotice3(input);

    const activity12 = results.find(r => r.activityNumber === 'Activity 12');
    expect(activity12).toBeUndefined();
  });

  it('triggers Activity 14 in listed area within 32m of watercourse with footprint ≥ 10', () => {
    const input = makeValidInput({
      withinListedGeographicArea: true,
      proximityWatercourse: 20,
      developmentFootprint: 50,
    });
    const results = evaluateListingNotice3(input);

    const activity14 = results.find(r => r.activityNumber === 'Activity 14');
    expect(activity14).toBeDefined();
  });

  it('does not trigger when not in listed geographic area', () => {
    const input = makeValidInput({
      withinListedGeographicArea: false,
      proximityWatercourse: 20,
      developmentFootprint: 50,
    });
    const results = evaluateListingNotice3(input);

    // Most LN3 rules require withinListedGeographicArea
    expect(results.length).toBe(0);
  });
});
