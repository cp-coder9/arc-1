/**
 * EIA Checker Service — Unit Tests
 *
 * Tests for EIA screening determination logic: assessment type derivation,
 * competent authority identification, geographic validation, and screening
 * report generation.
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8
 */

import { describe, expect, it } from 'vitest';

import type { GeographicContext, SelectedActivity } from '../types';
import { determineAssessmentType, generateScreeningReport } from '../services/eiaChecker';

// ─── Test Fixtures ────────────────────────────────────────────────────────────

const LN1_ACTIVITY: SelectedActivity = {
  listingNotice: 'listing_notice_1',
  activityNumber: '27',
  description: 'Clearance of indigenous vegetation exceeding 1 hectare',
};

const LN2_ACTIVITY: SelectedActivity = {
  listingNotice: 'listing_notice_2',
  activityNumber: '15',
  description: 'Construction of facilities for commercial electricity generation exceeding 20MW',
};

const LN3_ACTIVITY: SelectedActivity = {
  listingNotice: 'listing_notice_3',
  activityNumber: '12',
  description: 'Clearance of vegetation exceeding 300sqm in a sensitive area',
};

const BASE_GEOGRAPHIC: GeographicContext = {
  province: 'Gauteng',
  municipality: 'City of Johannesburg',
  isCoastalZone: false,
  isUrbanArea: true,
  isSensitiveEnvironment: false,
};

const BASE_PROJECT = {
  projectId: 'proj-001',
  projectName: 'Test Development',
};

const BASE_ACTOR = {
  uid: 'user-001',
  displayName: 'John Smith',
};

const FIXED_DATE = new Date('2026-06-15T10:00:00.000Z');

// ─── determineAssessmentType ──────────────────────────────────────────────────

describe('determineAssessmentType', () => {
  describe('Listing Notice 2 present → Scoping & EIR', () => {
    it('returns scoping_and_eir when LN2 activity is selected', () => {
      const result = determineAssessmentType([LN2_ACTIVITY], 'Gauteng');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.assessmentType).toBe('scoping_and_eir');
        expect(result.data.competentAuthority).toBe('DFFE');
      }
    });

    it('returns scoping_and_eir when LN2 is mixed with LN1 and LN3', () => {
      const result = determineAssessmentType(
        [LN1_ACTIVITY, LN2_ACTIVITY, LN3_ACTIVITY],
        'Western Cape',
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.assessmentType).toBe('scoping_and_eir');
        expect(result.data.competentAuthority).toBe('DFFE');
      }
    });

    it('DFFE authority regardless of province when LN2 present', () => {
      const result = determineAssessmentType([LN2_ACTIVITY], 'KwaZulu-Natal');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.competentAuthority).toBe('DFFE');
      }
    });
  });

  describe('LN1/LN3 only → Basic Assessment', () => {
    it('returns basic_assessment when only LN1 activities selected', () => {
      const result = determineAssessmentType([LN1_ACTIVITY], 'Gauteng');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.assessmentType).toBe('basic_assessment');
        expect(result.data.competentAuthority).toBe(
          'Gauteng Department of Agriculture and Rural Development',
        );
      }
    });

    it('returns basic_assessment when only LN3 activities selected', () => {
      const result = determineAssessmentType([LN3_ACTIVITY], 'Western Cape');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.assessmentType).toBe('basic_assessment');
        expect(result.data.competentAuthority).toBe(
          'Western Cape Department of Environmental Affairs and Development Planning',
        );
      }
    });

    it('returns basic_assessment when LN1 and LN3 are mixed', () => {
      const result = determineAssessmentType([LN1_ACTIVITY, LN3_ACTIVITY], 'Eastern Cape');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.assessmentType).toBe('basic_assessment');
        expect(result.data.competentAuthority).toBe(
          'Eastern Cape Department of Economic Development, Environmental Affairs and Tourism',
        );
      }
    });
  });

  describe('no activities → none', () => {
    it('returns none when empty array', () => {
      const result = determineAssessmentType([]);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.assessmentType).toBe('none');
        expect(result.data.competentAuthority).toBe('N/A');
      }
    });

    it('returns none when null/undefined activities', () => {
      const result = determineAssessmentType(null as unknown as SelectedActivity[]);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.assessmentType).toBe('none');
        expect(result.data.competentAuthority).toBe('N/A');
      }
    });
  });

  describe('competent authority derivation by province', () => {
    it.each([
      ['Gauteng', 'Gauteng Department of Agriculture and Rural Development'],
      ['Western Cape', 'Western Cape Department of Environmental Affairs and Development Planning'],
      ['KwaZulu-Natal', 'KwaZulu-Natal Department of Economic Development, Tourism and Environmental Affairs'],
      ['Eastern Cape', 'Eastern Cape Department of Economic Development, Environmental Affairs and Tourism'],
      ['Free State', 'Free State Department of Economic, Small Business Development, Tourism and Environmental Affairs'],
      ['Limpopo', 'Limpopo Department of Economic Development, Environment and Tourism'],
      ['Mpumalanga', 'Mpumalanga Department of Agriculture, Rural Development, Land and Environmental Affairs'],
      ['North West', 'North West Department of Economic Development, Environment, Conservation and Tourism'],
      ['Northern Cape', 'Northern Cape Department of Agriculture, Environmental Affairs, Rural Development and Land Reform'],
    ])('maps %s to correct department', (province, expectedDept) => {
      const result = determineAssessmentType([LN1_ACTIVITY], province);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.competentAuthority).toBe(expectedDept);
      }
    });

    it('falls back to default when province not in lookup', () => {
      const result = determineAssessmentType([LN1_ACTIVITY], 'Unknown Province');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.competentAuthority).toBe('Provincial Environmental Department');
      }
    });

    it('falls back to default when province is not provided', () => {
      const result = determineAssessmentType([LN1_ACTIVITY]);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.competentAuthority).toBe('Provincial Environmental Department');
      }
    });
  });
});

// ─── generateScreeningReport ──────────────────────────────────────────────────

describe('generateScreeningReport', () => {
  describe('successful report generation', () => {
    it('generates complete screening report for LN2 activities', () => {
      const result = generateScreeningReport(
        BASE_PROJECT,
        [LN2_ACTIVITY],
        BASE_GEOGRAPHIC,
        BASE_ACTOR,
        FIXED_DATE,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const report = result.data;
        expect(report.projectId).toBe('proj-001');
        expect(report.projectName).toBe('Test Development');
        expect(report.screeningDate).toBe('2026-06-15');
        expect(report.performedBy).toBe('John Smith');
        expect(report.activitiesSelected).toHaveLength(1);
        expect(report.assessmentType).toBe('scoping_and_eir');
        expect(report.competentAuthority).toBe('DFFE');
        expect(report.geographicContext).toEqual(BASE_GEOGRAPHIC);
        expect(report.id).toMatch(/^scr_/);
        expect(report.createdAt).toBe('2026-06-15T10:00:00.000Z');
      }
    });

    it('generates report for basic assessment (LN1 only)', () => {
      const result = generateScreeningReport(
        BASE_PROJECT,
        [LN1_ACTIVITY],
        { ...BASE_GEOGRAPHIC, province: 'KwaZulu-Natal' },
        BASE_ACTOR,
        FIXED_DATE,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.assessmentType).toBe('basic_assessment');
        expect(result.data.competentAuthority).toBe(
          'KwaZulu-Natal Department of Economic Development, Tourism and Environmental Affairs',
        );
      }
    });

    it('generates report for no assessment when no activities', () => {
      const result = generateScreeningReport(
        BASE_PROJECT,
        [],
        BASE_GEOGRAPHIC,
        BASE_ACTOR,
        FIXED_DATE,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.assessmentType).toBe('none');
        expect(result.data.competentAuthority).toBe('N/A');
      }
    });
  });

  describe('next steps generation', () => {
    it('provides scoping & EIR next steps', () => {
      const result = generateScreeningReport(
        BASE_PROJECT,
        [LN2_ACTIVITY],
        BASE_GEOGRAPHIC,
        BASE_ACTOR,
        FIXED_DATE,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.nextSteps).toContain('Appoint registered EAP');
        expect(result.data.nextSteps).toContain('Prepare Scoping Report');
        expect(result.data.nextSteps).toContain('Submit to DFFE');
      }
    });

    it('provides basic assessment next steps with authority name', () => {
      const result = generateScreeningReport(
        BASE_PROJECT,
        [LN1_ACTIVITY],
        { ...BASE_GEOGRAPHIC, province: 'Gauteng' },
        BASE_ACTOR,
        FIXED_DATE,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.nextSteps).toContain('Appoint registered EAP');
        expect(result.data.nextSteps).toContain('Prepare Basic Assessment Report (BAR)');
        expect(result.data.nextSteps).toContain(
          'Submit to Gauteng Department of Agriculture and Rural Development',
        );
      }
    });

    it('provides "no authorisation required" for none assessment', () => {
      const result = generateScreeningReport(
        BASE_PROJECT,
        [],
        BASE_GEOGRAPHIC,
        BASE_ACTOR,
        FIXED_DATE,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.nextSteps).toContain(
          'No Environmental Authorisation required based on current screening',
        );
      }
    });

    it('adds coastal zone note when applicable', () => {
      const result = generateScreeningReport(
        BASE_PROJECT,
        [LN3_ACTIVITY],
        { ...BASE_GEOGRAPHIC, province: 'Western Cape', isCoastalZone: true },
        BASE_ACTOR,
        FIXED_DATE,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.nextSteps).toContain(
          'Note: Project is in a coastal zone — confirm Listing Notice 3 applicability with EAP',
        );
      }
    });

    it('adds urban area note when applicable', () => {
      const result = generateScreeningReport(
        BASE_PROJECT,
        [LN1_ACTIVITY],
        { ...BASE_GEOGRAPHIC, isUrbanArea: true },
        BASE_ACTOR,
        FIXED_DATE,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.nextSteps).toContain(
          'Note: Project is in an urban area — confirm Listing Notice 3 applicability with EAP',
        );
      }
    });

    it('adds sensitive environment note when applicable', () => {
      const result = generateScreeningReport(
        BASE_PROJECT,
        [LN1_ACTIVITY],
        { ...BASE_GEOGRAPHIC, isSensitiveEnvironment: true },
        BASE_ACTOR,
        FIXED_DATE,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.nextSteps).toContain(
          'Note: Project is in a sensitive environment — confirm Listing Notice 3 applicability with EAP',
        );
      }
    });

    it('does not add geographic notes for "none" assessment type', () => {
      const result = generateScreeningReport(
        BASE_PROJECT,
        [],
        { ...BASE_GEOGRAPHIC, isCoastalZone: true, isSensitiveEnvironment: true },
        BASE_ACTOR,
        FIXED_DATE,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.nextSteps).toHaveLength(1);
        expect(result.data.nextSteps[0]).toBe(
          'No Environmental Authorisation required based on current screening',
        );
      }
    });
  });

  describe('geographic context validation', () => {
    it('rejects when province is missing (empty string)', () => {
      const result = generateScreeningReport(
        BASE_PROJECT,
        [LN1_ACTIVITY],
        { ...BASE_GEOGRAPHIC, province: '' },
        BASE_ACTOR,
        FIXED_DATE,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PROVINCE_REQUIRED');
        expect(result.error.message).toContain('Province is required');
      }
    });

    it('rejects when province is whitespace only', () => {
      const result = generateScreeningReport(
        BASE_PROJECT,
        [LN1_ACTIVITY],
        { ...BASE_GEOGRAPHIC, province: '   ' },
        BASE_ACTOR,
        FIXED_DATE,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PROVINCE_REQUIRED');
      }
    });

    it('succeeds when province is provided', () => {
      const result = generateScreeningReport(
        BASE_PROJECT,
        [LN1_ACTIVITY],
        BASE_GEOGRAPHIC,
        BASE_ACTOR,
        FIXED_DATE,
      );

      expect(result.success).toBe(true);
    });
  });

  describe('report metadata', () => {
    it('generates unique report IDs', () => {
      const result1 = generateScreeningReport(
        BASE_PROJECT,
        [LN1_ACTIVITY],
        BASE_GEOGRAPHIC,
        BASE_ACTOR,
        FIXED_DATE,
      );
      const result2 = generateScreeningReport(
        BASE_PROJECT,
        [LN1_ACTIVITY],
        BASE_GEOGRAPHIC,
        BASE_ACTOR,
        FIXED_DATE,
      );

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      if (result1.success && result2.success) {
        expect(result1.data.id).not.toBe(result2.data.id);
      }
    });

    it('preserves all selected activities in the report', () => {
      const activities = [LN1_ACTIVITY, LN2_ACTIVITY, LN3_ACTIVITY];
      const result = generateScreeningReport(
        BASE_PROJECT,
        activities,
        BASE_GEOGRAPHIC,
        BASE_ACTOR,
        FIXED_DATE,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.activitiesSelected).toHaveLength(3);
        expect(result.data.activitiesSelected).toEqual(activities);
      }
    });
  });
});
