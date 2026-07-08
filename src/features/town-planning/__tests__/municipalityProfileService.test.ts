/**
 * Municipality Profile Service — Unit Tests
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createProfile,
  updateProfile,
  getProfile,
  getProfileByName,
  listProfiles,
  resolveProfile,
  getDefaultProfile,
  getRequiredDocuments,
  getFees,
  getTimeframes,
  _resetStore,
} from '../services/municipalityProfileService';
import { SPLUMA_DEFAULT_TIMEFRAMES } from '../constants';

describe('municipalityProfileService', () => {
  beforeEach(() => {
    _resetStore();
  });

  describe('getDefaultProfile', () => {
    it('returns a profile with name "SPLUMA Default"', () => {
      const profile = getDefaultProfile();
      expect(profile.name).toBe('SPLUMA Default');
      expect(profile.province).toBe('National');
      expect(profile.id).toBe('spluma_default');
    });

    it('contains SPLUMA default timeframes', () => {
      const profile = getDefaultProfile();
      expect(profile.customTimeframes).toHaveLength(3);
      const objection = profile.customTimeframes.find(t => t.deadlineType === 'objection_period');
      expect(objection?.defaultDays).toBe(SPLUMA_DEFAULT_TIMEFRAMES.objectionPeriodDays);
      expect(objection?.municipalityDays).toBe(28);
    });

    it('has empty fee schedule and required forms', () => {
      const profile = getDefaultProfile();
      expect(profile.feeSchedule).toEqual([]);
      expect(profile.requiredForms).toEqual([]);
      expect(profile.processVariations).toEqual([]);
    });
  });

  describe('createProfile', () => {
    it('creates a profile with auto-generated ID and timestamps', () => {
      const profile = createProfile({
        tenantId: 'tenant-1',
        name: 'City of Cape Town',
        province: 'Western Cape',
        contactDetails: { name: 'Planning Dept', email: 'plan@capetown.gov.za', phone: '021-400-1234' },
        landUseSchemeReference: 'CTZS 2012',
        feeSchedule: [],
        requiredForms: [],
        processVariations: [],
        customTimeframes: [],
      });

      expect(profile.id).toBeTruthy();
      expect(profile.id).toContain('muni_profile_');
      expect(profile.createdAt).toBeTruthy();
      expect(profile.updatedAt).toBeTruthy();
      expect(profile.name).toBe('City of Cape Town');
      expect(profile.tenantId).toBe('tenant-1');
    });

    it('stores the profile so it can be retrieved', () => {
      const created = createProfile({
        tenantId: 'tenant-1',
        name: 'eThekwini',
        province: 'KwaZulu-Natal',
        contactDetails: { name: 'Planning', email: 'plan@ethekwini.gov.za', phone: '031-311-1111' },
        landUseSchemeReference: 'eThekwini SDF',
        feeSchedule: [],
        requiredForms: [],
        processVariations: [],
        customTimeframes: [],
      });

      const fetched = getProfile(created.id);
      expect(fetched).toEqual(created);
    });
  });

  describe('updateProfile', () => {
    it('updates fields while preserving createdAt', async () => {
      const created = createProfile({
        tenantId: 'tenant-1',
        name: 'Old Name',
        province: 'Gauteng',
        contactDetails: { name: 'Test', email: 'test@test.com', phone: '000' },
        landUseSchemeReference: 'GP LUS',
        feeSchedule: [],
        requiredForms: [],
        processVariations: [],
        customTimeframes: [],
      });

      // Small delay to ensure updatedAt differs
      await new Promise((r) => setTimeout(r, 5));

      const updated = updateProfile(created.id, { name: 'City of Tshwane' });
      expect(updated.name).toBe('City of Tshwane');
      expect(updated.createdAt).toBe(created.createdAt);
      expect(updated.id).toBe(created.id);
      // updatedAt should be a valid ISO string
      expect(updated.updatedAt).toBeTruthy();
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(created.createdAt).getTime(),
      );
    });

    it('throws when profile not found', () => {
      expect(() => updateProfile('nonexistent', { name: 'X' })).toThrow('Municipality profile not found');
    });
  });

  describe('getProfile', () => {
    it('returns null when not found', () => {
      expect(getProfile('does-not-exist')).toBeNull();
    });
  });

  describe('getProfileByName', () => {
    it('finds a profile by name (case-insensitive)', () => {
      createProfile({
        tenantId: 'tenant-1',
        name: 'City of Johannesburg',
        province: 'Gauteng',
        contactDetails: { name: 'Planning', email: 'p@jhb.gov.za', phone: '011' },
        landUseSchemeReference: 'JHB SDF',
        feeSchedule: [],
        requiredForms: [],
        processVariations: [],
        customTimeframes: [],
      });

      expect(getProfileByName('city of johannesburg')).not.toBeNull();
      expect(getProfileByName('CITY OF JOHANNESBURG')).not.toBeNull();
      expect(getProfileByName('Unknown City')).toBeNull();
    });
  });

  describe('listProfiles', () => {
    it('filters by tenantId', () => {
      createProfile({
        tenantId: 'tenant-a',
        name: 'Profile A',
        province: 'GP',
        contactDetails: { name: 'A', email: 'a@a.com', phone: '1' },
        landUseSchemeReference: 'A',
        feeSchedule: [],
        requiredForms: [],
        processVariations: [],
        customTimeframes: [],
      });
      createProfile({
        tenantId: 'tenant-b',
        name: 'Profile B',
        province: 'WC',
        contactDetails: { name: 'B', email: 'b@b.com', phone: '2' },
        landUseSchemeReference: 'B',
        feeSchedule: [],
        requiredForms: [],
        processVariations: [],
        customTimeframes: [],
      });

      expect(listProfiles('tenant-a')).toHaveLength(1);
      expect(listProfiles('tenant-a')[0].name).toBe('Profile A');
      expect(listProfiles('tenant-b')).toHaveLength(1);
      expect(listProfiles('tenant-c')).toHaveLength(0);
    });
  });

  describe('resolveProfile', () => {
    it('returns the matching profile when found', () => {
      const created = createProfile({
        tenantId: 'tenant-1',
        name: 'Stellenbosch',
        province: 'Western Cape',
        contactDetails: { name: 'S', email: 's@s.com', phone: '3' },
        landUseSchemeReference: 'Stell LUS',
        feeSchedule: [],
        requiredForms: [],
        processVariations: [],
        customTimeframes: [],
      });

      const resolved = resolveProfile(created.id);
      expect(resolved.id).toBe(created.id);
      expect(resolved.name).toBe('Stellenbosch');
    });

    it('falls back to SPLUMA default when not found', () => {
      const resolved = resolveProfile('nonexistent-id');
      expect(resolved.name).toBe('SPLUMA Default');
      expect(resolved.id).toBe('spluma_default');
    });
  });

  describe('getRequiredDocuments', () => {
    it('returns forms matching the application type', () => {
      const profile = createProfile({
        tenantId: 'tenant-1',
        name: 'Test Muni',
        province: 'GP',
        contactDetails: { name: 'T', email: 't@t.com', phone: '0' },
        landUseSchemeReference: 'Test',
        feeSchedule: [],
        requiredForms: [
          {
            id: 'form-1',
            name: 'Rezoning Application',
            applicationType: ['rezoning'],
            isProvincial: false,
            stage: 'submission',
          },
          {
            id: 'form-2',
            name: 'General Form',
            applicationType: ['rezoning', 'subdivision'],
            isProvincial: true,
            stage: 'preparation',
          },
          {
            id: 'form-3',
            name: 'Subdivision Only',
            applicationType: ['subdivision'],
            isProvincial: false,
            stage: 'submission',
          },
        ],
        processVariations: [],
        customTimeframes: [],
      });

      const rezoningForms = getRequiredDocuments(profile.id, 'rezoning');
      expect(rezoningForms).toHaveLength(2);

      const subdivisionForms = getRequiredDocuments(profile.id, 'subdivision');
      expect(subdivisionForms).toHaveLength(2);

      const consentForms = getRequiredDocuments(profile.id, 'consent_use');
      expect(consentForms).toHaveLength(0);
    });

    it('returns empty array when profile not found', () => {
      expect(getRequiredDocuments('unknown', 'rezoning')).toEqual([]);
    });
  });

  describe('getFees', () => {
    it('returns fees matching the application type', () => {
      const profile = createProfile({
        tenantId: 'tenant-1',
        name: 'Fee Muni',
        province: 'GP',
        contactDetails: { name: 'F', email: 'f@f.com', phone: '0' },
        landUseSchemeReference: 'F',
        feeSchedule: [
          { applicationType: 'rezoning', description: 'Rezoning fee', amount: 5000, currency: 'ZAR', validFrom: '2025-01-01' },
          { applicationType: 'rezoning', description: 'Advertising fee', amount: 2000, currency: 'ZAR', validFrom: '2025-01-01' },
          { applicationType: 'subdivision', description: 'Subdivision fee', amount: 3000, currency: 'ZAR', validFrom: '2025-01-01' },
        ],
        requiredForms: [],
        processVariations: [],
        customTimeframes: [],
      });

      const rezoningFees = getFees(profile.id, 'rezoning');
      expect(rezoningFees).toHaveLength(2);
      expect(rezoningFees[0].amount).toBe(5000);

      const subdivisionFees = getFees(profile.id, 'subdivision');
      expect(subdivisionFees).toHaveLength(1);

      expect(getFees(profile.id, 'consent_use')).toHaveLength(0);
    });

    it('returns empty array when profile not found', () => {
      expect(getFees('unknown', 'rezoning')).toEqual([]);
    });
  });

  describe('getTimeframes', () => {
    it('returns profile timeframes when configured', () => {
      const profile = createProfile({
        tenantId: 'tenant-1',
        name: 'Custom Muni',
        province: 'WC',
        contactDetails: { name: 'C', email: 'c@c.com', phone: '0' },
        landUseSchemeReference: 'C',
        feeSchedule: [],
        requiredForms: [],
        processVariations: [],
        customTimeframes: [
          { deadlineType: 'objection_period', defaultDays: 28, municipalityDays: 30, statutoryReference: 'Local By-law 12' },
        ],
      });

      const timeframes = getTimeframes(profile.id);
      expect(timeframes).toHaveLength(1);
      expect(timeframes[0].municipalityDays).toBe(30);
    });

    it('returns SPLUMA defaults when profile has no custom timeframes', () => {
      const profile = createProfile({
        tenantId: 'tenant-1',
        name: 'No Custom',
        province: 'GP',
        contactDetails: { name: 'N', email: 'n@n.com', phone: '0' },
        landUseSchemeReference: 'N',
        feeSchedule: [],
        requiredForms: [],
        processVariations: [],
        customTimeframes: [],
      });

      const timeframes = getTimeframes(profile.id);
      expect(timeframes).toHaveLength(3);
      expect(timeframes[0].deadlineType).toBe('objection_period');
    });

    it('returns SPLUMA defaults when profile not found', () => {
      const timeframes = getTimeframes('nonexistent');
      expect(timeframes).toHaveLength(3);
    });
  });
});
