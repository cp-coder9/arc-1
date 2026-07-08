import { describe, it, expect } from 'vitest';
import {
  findZoneDefinition,
  listZones,
  validateLandUse,
  calculateRequiredParking,
} from '@/services/municipal-workspace/landUseSchemeService';
import type { LandUseCheckInput } from '@/types/municipalWorkspace';

describe('landUseSchemeService', () => {
  describe('findZoneDefinition', () => {
    it('returns a non-null ZoneDefinition with correct zoneCode for COJ R1', () => {
      const zone = findZoneDefinition('COJ', 'R1');
      expect(zone).not.toBeNull();
      expect(zone!.zoneCode).toBe('R1');
      expect(zone!.municipalityId).toBe('COJ');
    });

    it('returns null for an invalid zone code', () => {
      const zone = findZoneDefinition('COJ', 'INVALID');
      expect(zone).toBeNull();
    });
  });

  describe('listZones', () => {
    it('returns an array of at least 5 zones for COJ', () => {
      const zones = listZones('COJ');
      expect(zones.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('validateLandUse', () => {
    it('returns pass when all parameters are within R1 limits', () => {
      const input: LandUseCheckInput = {
        municipalityId: 'COJ',
        zoneCode: 'R1',
        proposedCoverage: 40,
        proposedFAR: 0.4,
        proposedHeight: 7,
        proposedSetbacks: { front: 6, rear: 4, sides: 2 },
        proposedParkingBays: 2,
        proposedLandUse: 'dwelling house',
        dwellingUnits: 1,
        erfArea: 800,
      };

      const result = validateLandUse(input);
      expect(result.status).toBe('pass');
      expect(result.checks.every((c) => c.status === 'pass')).toBe(true);
    });

    it('returns fail when coverage exceeds limit', () => {
      const input: LandUseCheckInput = {
        municipalityId: 'COJ',
        zoneCode: 'R1',
        proposedCoverage: 65, // exceeds 50% max for R1
        proposedFAR: 0.4,
        proposedHeight: 7,
        proposedSetbacks: { front: 6, rear: 4, sides: 2 },
        proposedParkingBays: 2,
        proposedLandUse: 'dwelling house',
        dwellingUnits: 1,
        erfArea: 800,
      };

      const result = validateLandUse(input);
      expect(result.status).toBe('fail');
      const coverageCheck = result.checks.find((c) => c.parameter === 'Coverage');
      expect(coverageCheck).toBeDefined();
      expect(coverageCheck!.status).toBe('fail');
      expect(coverageCheck!.excess).toBe(15);
    });
  });

  describe('calculateRequiredParking', () => {
    it('returns correct bay count for a dwelling house in R1', () => {
      const zone = findZoneDefinition('COJ', 'R1');
      expect(zone).not.toBeNull();
      // R1 dwelling house: 2 bays per dwelling unit, 1 unit = 2 bays
      const bays = calculateRequiredParking(zone!, 'dwelling house', 1);
      expect(bays).toBe(2);
    });
  });
});
