/**
 * Tests for South African Construction Context Service
 *
 * Validates SACAP stage mapping, NHBRC checklists, and municipal submission checklists.
 */

import { describe, it, expect } from 'vitest';
import {
  mapToSACAPStage,
  getNHBRCChecklist,
  getMunicipalSubmissionChecklist,
  getArchitexStages,
  getNHBRCStageNumbers,
  getNHBRCStageLabel,
  getSupportedMunicipalities,
  getSupportedSubmissionTypes,
  type ArchitexStage,
  type NHBRCStageNumber,
} from './saContextService';

// ── mapToSACAPStage ──────────────────────────────────────────────────────────────

describe('mapToSACAPStage', () => {
  it('maps "brief" to Stage 1 - Inception', () => {
    expect(mapToSACAPStage('brief')).toBe('Stage 1 - Inception');
  });

  it('maps "appoint" to Stage 2 - Concept & Viability', () => {
    expect(mapToSACAPStage('appoint')).toBe('Stage 2 - Concept & Viability');
  });

  it('maps "design" to Stage 3 - Design Development', () => {
    expect(mapToSACAPStage('design')).toBe('Stage 3 - Design Development');
  });

  it('maps "comply" to Stage 4 - Documentation & Procurement', () => {
    expect(mapToSACAPStage('comply')).toBe('Stage 4 - Documentation & Procurement');
  });

  it('maps "procure" to Stage 4 - Documentation & Procurement', () => {
    expect(mapToSACAPStage('procure')).toBe('Stage 4 - Documentation & Procurement');
  });

  it('maps "build" to Stage 5 - Construction', () => {
    expect(mapToSACAPStage('build')).toBe('Stage 5 - Construction');
  });

  it('maps "pay" to Stage 5 - Construction', () => {
    expect(mapToSACAPStage('pay')).toBe('Stage 5 - Construction');
  });

  it('maps "closeout" to Stage 6 - Closeout', () => {
    expect(mapToSACAPStage('closeout')).toBe('Stage 6 - Closeout');
  });

  it('is deterministic — same input always produces same output', () => {
    const stages = getArchitexStages();
    for (const stage of stages) {
      const result1 = mapToSACAPStage(stage);
      const result2 = mapToSACAPStage(stage);
      expect(result1).toBe(result2);
    }
  });

  it('throws for invalid stage input', () => {
    expect(() => mapToSACAPStage('invalid' as ArchitexStage)).toThrow(
      /Invalid Architex stage/,
    );
  });

  it('covers all 8 Architex stages', () => {
    const stages = getArchitexStages();
    expect(stages).toHaveLength(8);
    for (const stage of stages) {
      expect(() => mapToSACAPStage(stage)).not.toThrow();
    }
  });
});

// ── getNHBRCChecklist ────────────────────────────────────────────────────────────

describe('getNHBRCChecklist', () => {
  it('returns a non-empty array for each valid stage (1-7)', () => {
    for (let stage = 1; stage <= 7; stage++) {
      const checklist = getNHBRCChecklist(stage as NHBRCStageNumber);
      expect(checklist.length).toBeGreaterThan(0);
      expect(Array.isArray(checklist)).toBe(true);
    }
  });

  it('returns strings in the checklist', () => {
    const checklist = getNHBRCChecklist(1);
    for (const item of checklist) {
      expect(typeof item).toBe('string');
      expect(item.length).toBeGreaterThan(0);
    }
  });

  it('returns a fresh copy each time (not a reference)', () => {
    const checklist1 = getNHBRCChecklist(1);
    const checklist2 = getNHBRCChecklist(1);
    expect(checklist1).toEqual(checklist2);
    expect(checklist1).not.toBe(checklist2);
  });

  it('stage 1 (Foundation) includes foundation-related items', () => {
    const checklist = getNHBRCChecklist(1);
    expect(checklist.some((item) => item.toLowerCase().includes('foundation'))).toBe(true);
  });

  it('stage 4 (Roof) includes roof-related items', () => {
    const checklist = getNHBRCChecklist(4);
    expect(checklist.some((item) => item.toLowerCase().includes('roof'))).toBe(true);
  });

  it('stage 7 (Practical Completion) includes handover/occupancy items', () => {
    const checklist = getNHBRCChecklist(7);
    expect(
      checklist.some(
        (item) =>
          item.toLowerCase().includes('occupancy') ||
          item.toLowerCase().includes('handover'),
      ),
    ).toBe(true);
  });

  it('throws for stage 0', () => {
    expect(() => getNHBRCChecklist(0 as NHBRCStageNumber)).toThrow(
      /Invalid NHBRC stage/,
    );
  });

  it('throws for stage 8', () => {
    expect(() => getNHBRCChecklist(8 as NHBRCStageNumber)).toThrow(
      /Invalid NHBRC stage/,
    );
  });

  it('throws for non-integer stage', () => {
    expect(() => getNHBRCChecklist(1.5 as NHBRCStageNumber)).toThrow(
      /Invalid NHBRC stage/,
    );
  });
});

// ── getMunicipalSubmissionChecklist ───────────────────────────────────────────────

describe('getMunicipalSubmissionChecklist', () => {
  it('returns a checklist for known municipality and type', () => {
    const checklist = getMunicipalSubmissionChecklist('City of Cape Town', 'building plan');
    expect(checklist.length).toBeGreaterThan(0);
  });

  it('is case-insensitive for municipality name', () => {
    const upper = getMunicipalSubmissionChecklist('CITY OF CAPE TOWN', 'building plan');
    const lower = getMunicipalSubmissionChecklist('city of cape town', 'building plan');
    const mixed = getMunicipalSubmissionChecklist('City Of Cape Town', 'building plan');
    expect(upper).toEqual(lower);
    expect(lower).toEqual(mixed);
  });

  it('is case-insensitive for submission type', () => {
    const upper = getMunicipalSubmissionChecklist('City of Cape Town', 'BUILDING PLAN');
    const lower = getMunicipalSubmissionChecklist('City of Cape Town', 'building plan');
    expect(upper).toEqual(lower);
  });

  it('trims whitespace from inputs', () => {
    const trimmed = getMunicipalSubmissionChecklist('City of Cape Town', 'building plan');
    const untrimmed = getMunicipalSubmissionChecklist('  City of Cape Town  ', '  building plan  ');
    expect(trimmed).toEqual(untrimmed);
  });

  it('falls back to generic checklist for unknown municipality', () => {
    const checklist = getMunicipalSubmissionChecklist('Unknown Municipality', 'building plan');
    expect(checklist.length).toBeGreaterThan(0);
  });

  it('returns municipality-specific items for known municipalities', () => {
    const ctChecklist = getMunicipalSubmissionChecklist('City of Cape Town', 'building plan');
    const jhbChecklist = getMunicipalSubmissionChecklist('City of Johannesburg', 'building plan');
    // They should differ since they are municipality-specific
    expect(ctChecklist).not.toEqual(jhbChecklist);
  });

  it('supports occupancy certificate type', () => {
    const checklist = getMunicipalSubmissionChecklist('City of Cape Town', 'occupancy certificate');
    expect(checklist.length).toBeGreaterThan(0);
    expect(checklist.some((item) => item.toLowerCase().includes('electrical'))).toBe(true);
  });

  it('supports rezoning type', () => {
    const checklist = getMunicipalSubmissionChecklist('eThekwini', 'rezoning');
    expect(checklist.length).toBeGreaterThan(0);
  });

  it('throws for unknown submission type', () => {
    expect(() =>
      getMunicipalSubmissionChecklist('City of Cape Town', 'unknown type'),
    ).toThrow(/Unknown submission type/);
  });

  it('returns a fresh copy each time (not a reference)', () => {
    const checklist1 = getMunicipalSubmissionChecklist('City of Cape Town', 'building plan');
    const checklist2 = getMunicipalSubmissionChecklist('City of Cape Town', 'building plan');
    expect(checklist1).toEqual(checklist2);
    expect(checklist1).not.toBe(checklist2);
  });
});

// ── Utility Functions ────────────────────────────────────────────────────────────

describe('getArchitexStages', () => {
  it('returns all 8 Architex stages', () => {
    const stages = getArchitexStages();
    expect(stages).toHaveLength(8);
    expect(stages).toEqual([
      'brief',
      'appoint',
      'design',
      'comply',
      'procure',
      'build',
      'pay',
      'closeout',
    ]);
  });
});

describe('getNHBRCStageNumbers', () => {
  it('returns stages 1 through 7', () => {
    const stages = getNHBRCStageNumbers();
    expect(stages).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('getNHBRCStageLabel', () => {
  it('returns correct labels for all stages', () => {
    expect(getNHBRCStageLabel(1)).toBe('Foundation');
    expect(getNHBRCStageLabel(2)).toBe('Substructure');
    expect(getNHBRCStageLabel(3)).toBe('Frame');
    expect(getNHBRCStageLabel(4)).toBe('Roof');
    expect(getNHBRCStageLabel(5)).toBe('Waterproofing');
    expect(getNHBRCStageLabel(6)).toBe('Finishes');
    expect(getNHBRCStageLabel(7)).toBe('Practical Completion');
  });

  it('throws for invalid stage numbers', () => {
    expect(() => getNHBRCStageLabel(0 as NHBRCStageNumber)).toThrow();
    expect(() => getNHBRCStageLabel(8 as NHBRCStageNumber)).toThrow();
  });
});

describe('getSupportedMunicipalities', () => {
  it('returns an array of municipality names', () => {
    const municipalities = getSupportedMunicipalities();
    expect(municipalities.length).toBeGreaterThan(0);
    expect(municipalities).toContain('city of cape town');
    expect(municipalities).toContain('city of johannesburg');
    expect(municipalities).toContain('ethekwini');
    expect(municipalities).toContain('city of tshwane');
  });
});

describe('getSupportedSubmissionTypes', () => {
  it('returns supported submission types', () => {
    const types = getSupportedSubmissionTypes();
    expect(types).toContain('building plan');
    expect(types).toContain('occupancy certificate');
    expect(types).toContain('rezoning');
  });
});
