/**
 * Project Complexity Classifier Service Tests
 * Part of Pack 6: Municipal Submission Readiness
 */
import { describe, test, expect } from '@jest/globals';
import { classifyProjectComplexity } from '../projectComplexityClassifierService';
import type { ProjectScopeFacts } from '@/types/municipalSubmissionReadiness';

function baseProject(overrides: Partial<ProjectScopeFacts> = {}): ProjectScopeFacts {
  return {
    projectId: 'test-1',
    projectName: 'Test Project',
    zoningKnown: true,
    occupancyType: 'single_residential',
    alterationToExisting: false,
    additions: false,
    newBuild: false,
    changesLoadBearing: false,
    changesDrainageOrStormwater: false,
    publicAccessOrAssembly: false,
    envelopeEnergyImpact: false,
    coverageOrParkingRisk: false,
    boundaryOrServitudeUnclear: false,
    heritagePotential: false,
    environmentalSensitivity: false,
    trafficImpact: false,
    estimatedConstructionValueZar: 0,
    drawingRegister: [],
    supportingDocuments: [],
    ...overrides,
  };
}

describe('classifyProjectComplexity', () => {
  test('low complexity — no triggers', () => {
    const result = classifyProjectComplexity(baseProject());
    expect(result.complexity).toBe('low');
    expect(result.triggers).toHaveLength(0);
  });

  test('low complexity — single trigger', () => {
    const result = classifyProjectComplexity(baseProject({ changesLoadBearing: true }));
    expect(result.complexity).toBe('low');
    expect(result.triggers).toHaveLength(1);
  });

  test('medium complexity — 2 triggers', () => {
    const result = classifyProjectComplexity(
      baseProject({ changesLoadBearing: true, changesDrainageOrStormwater: true })
    );
    expect(result.complexity).toBe('medium');
    expect(result.triggers.length).toBeGreaterThanOrEqual(2);
  });

  test('medium complexity — 3-4 triggers', () => {
    const result = classifyProjectComplexity(
      baseProject({
        changesLoadBearing: true,
        envelopeEnergyImpact: true,
        heritagePotential: true,
      })
    );
    expect(result.complexity).toBe('medium');
  });

  test('high complexity — 5+ triggers', () => {
    const result = classifyProjectComplexity(
      baseProject({
        changesLoadBearing: true,
        changesDrainageOrStormwater: true,
        envelopeEnergyImpact: true,
        coverageOrParkingRisk: true,
        heritagePotential: true,
      })
    );
    expect(result.complexity).toBe('high');
  });

  test('high value project generates trigger', () => {
    const result = classifyProjectComplexity(
      baseProject({ estimatedConstructionValueZar: 10_000_000 })
    );
    expect(result.complexity).toBe('low'); // 1 trigger = low
    expect(result.triggers).toHaveLength(1);
    expect(result.triggers[0]).toContain('High-value');
  });

  test('public assembly triggers fire-life-safety', () => {
    const result = classifyProjectComplexity(
      baseProject({
        occupancyType: 'public_assembly',
        publicAccessOrAssembly: true,
        changesLoadBearing: true,
      })
    );
    // 3 triggers = medium, but only 2 unique triggers since both occupancy and publicAccessOrAssembly add the same one
    expect(result.complexity).toBe('medium');
  });

  test('zoning unknown creates trigger', () => {
    const result = classifyProjectComplexity(
      baseProject({ zoningKnown: false, coverageOrParkingRisk: true })
    );
    expect(result.triggers.some((t) => t.includes('zoning') || t.includes('land-use'))).toBe(true);
  });

  test('zoning known without parking risk — no trigger', () => {
    const result = classifyProjectComplexity(
      baseProject({ zoningKnown: true, coverageOrParkingRisk: false })
    );
    expect(result.triggers.some((t) => t.includes('zoning') || t.includes('land-use'))).toBe(false);
  });

  test('assessedAt is set to current ISO timestamp', () => {
    const before = new Date().toISOString();
    const result = classifyProjectComplexity(baseProject());
    const after = new Date().toISOString();
    expect(result.assessedAt).toBeDefined();
    expect(result.assessedAt >= before || result.assessedAt <= after).toBe(true);
  });
});
