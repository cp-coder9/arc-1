/**
 * Municipal Submission Readiness — Unified Service Tests
 * End-to-end pipeline tests for Pack 6
 */
import { describe, test, expect } from '@jest/globals';
import {
  assessMunicipalSubmissionReadiness,
  buildScopeFactsFromProject,
} from '../municipalSubmissionReadinessService';
import type { ProjectScopeFacts } from '@/types/municipalSubmissionReadiness';

const sampleProject: ProjectScopeFacts = {
  projectId: 'test-parkview-002',
  projectName: 'Parkview Alterations and Additions',
  municipality: 'City of Johannesburg',
  province: 'Gauteng',
  propertyDescription: 'Alterations/additions to existing dwelling',
  erfNumber: 'Erf 1234 Parkview',
  zoningKnown: false,
  occupancyType: 'single_residential',
  alterationToExisting: true,
  additions: true,
  newBuild: false,
  changesLoadBearing: true,
  changesDrainageOrStormwater: true,
  publicAccessOrAssembly: false,
  envelopeEnergyImpact: true,
  coverageOrParkingRisk: true,
  boundaryOrServitudeUnclear: true,
  heritagePotential: false,
  environmentalSensitivity: false,
  trafficImpact: false,
  estimatedConstructionValueZar: 2_800_000,
  drawingRegister: [
    { kind: 'site_plan', revision: 'A', status: 'checked' },
    { kind: 'floor_plan', revision: 'A', status: 'checked' },
    { kind: 'elevation', revision: 'A', status: 'draft' },
    { kind: 'section', revision: 'A', status: 'draft' },
    { kind: 'structural_drawing', revision: 'P1', status: 'draft' },
  ],
  supportingDocuments: [
    { kind: 'appointment_record', status: 'available' },
    { kind: 'client_authority', status: 'missing' },
    { kind: 'title_deed', status: 'requested' },
    { kind: 'sg_diagram', status: 'missing' },
    { kind: 'zoning_certificate', status: 'missing' },
  ],
};

describe('assessMunicipalSubmissionReadiness', () => {
  test('full pipeline returns complete result', () => {
    const result = assessMunicipalSubmissionReadiness(sampleProject);

    expect(result.projectId).toBe('test-parkview-002');
    expect(result.projectName).toBe('Parkview Alterations and Additions');
    expect(result.assessedAt).toBeDefined();
  });

  test('complexity is classified', () => {
    const result = assessMunicipalSubmissionReadiness(sampleProject);
    // With 6+ triggers, this should be high
    expect(result.complexity.complexity).toBeDefined();
    expect(result.complexity.triggers.length).toBeGreaterThan(0);
  });

  test('professional routes are generated', () => {
    const result = assessMunicipalSubmissionReadiness(sampleProject);
    expect(result.professionalRoutes).toHaveLength(14);

    const required = result.professionalRoutes.filter((r) => r.status === 'required');
    expect(required.length).toBeGreaterThan(4); // always-required + triggers
  });

  test('readiness checks cover multiple categories', () => {
    const result = assessMunicipalSubmissionReadiness(sampleProject);
    const categories = new Set(result.checks.map((c) => c.category));
    // Should have checks across multiple categories
    expect(categories.size).toBeGreaterThanOrEqual(4);
  });

  test('readiness assessment includes score and blockers', () => {
    const result = assessMunicipalSubmissionReadiness(sampleProject);
    expect(result.readiness.score).toBeGreaterThanOrEqual(0);
    expect(result.readiness.score).toBeLessThanOrEqual(100);
    expect(Array.isArray(result.readiness.blockers)).toBe(true);
    expect(result.readiness.readyForProfessionalSubmissionReview).toBeDefined();
  });

  test('evidence pack items generated', () => {
    const result = assessMunicipalSubmissionReadiness(sampleProject);
    expect(result.evidencePack.length).toBeGreaterThan(0);

    const included = result.evidencePack.filter((e) => e.status === 'included');
    expect(included.length).toBeGreaterThan(0);
  });

  test('inbox events include routing events and readiness notification', () => {
    const result = assessMunicipalSubmissionReadiness(sampleProject);
    expect(result.inboxEvents.length).toBeGreaterThan(0);

    // Should have events for required disciplines
    const actionRequired = result.inboxEvents.filter(
      (e) => e.severity === 'action_required'
    );
    expect(actionRequired.length).toBeGreaterThan(0);
  });

  test('agent recommendations include blocker and routing recs', () => {
    const result = assessMunicipalSubmissionReadiness(sampleProject);
    expect(result.recommendations.length).toBeGreaterThan(0);

    // Blockers should generate a recommendation
    const hasBlockerRec = result.recommendations.some(
      (r) => r.id === 'rec-clear-blockers'
    );
    expect(hasBlockerRec).toBe(true);
  });

  test('audit trail has 3 records', () => {
    const result = assessMunicipalSubmissionReadiness(sampleProject);
    expect(result.auditTrail).toHaveLength(3);
    expect(result.auditTrail[0].action).toBe('project_complexity_classified');
    expect(result.auditTrail[1].action).toBe('municipal_readiness_assessed');
    expect(result.auditTrail[2].action).toBe('human_approval_required');
  });

  test('simple project has higher readiness score', () => {
    const simpleProject: ProjectScopeFacts = {
      ...sampleProject,
      changesLoadBearing: false,
      changesDrainageOrStormwater: false,
      envelopeEnergyImpact: false,
      coverageOrParkingRisk: false,
      boundaryOrServitudeUnclear: false,
      zoningKnown: true,
      drawingRegister: [
        { kind: 'site_plan', revision: 'A', status: 'signed_off' },
        { kind: 'floor_plan', revision: 'A', status: 'signed_off' },
        { kind: 'elevation', revision: 'A', status: 'signed_off' },
        { kind: 'section', revision: 'A', status: 'signed_off' },
      ],
      supportingDocuments: [
        { kind: 'client_authority', status: 'available' },
        { kind: 'title_deed', status: 'available' },
        { kind: 'sg_diagram', status: 'available' },
        { kind: 'zoning_certificate', status: 'available' },
        { kind: 'appointment_record', status: 'available' },
      ],
    };

    const simpleResult = assessMunicipalSubmissionReadiness(simpleProject);
    const complexResult = assessMunicipalSubmissionReadiness(sampleProject);

    expect(simpleResult.readiness.score).toBeGreaterThan(complexResult.readiness.score);
  });
});

describe('buildScopeFactsFromProject', () => {
  test('builds scope facts from minimal input', () => {
    const result = buildScopeFactsFromProject({
      projectId: 'p1',
      projectName: 'Test',
    });
    expect(result.projectId).toBe('p1');
    expect(result.projectName).toBe('Test');
    expect(result.zoningKnown).toBe(false);
    expect(result.occupancyType).toBe('single_residential');
  });

  test('defaults all booleans to false', () => {
    const result = buildScopeFactsFromProject({
      projectId: 'p1',
      projectName: 'Test',
    });
    expect(result.changesLoadBearing).toBe(false);
    expect(result.heritagePotential).toBe(false);
    expect(result.trafficImpact).toBe(false);
  });

  test('preserves provided values', () => {
    const result = buildScopeFactsFromProject({
      projectId: 'p1',
      projectName: 'Test',
      municipality: 'CoJ',
      changesLoadBearing: true,
      envelopeEnergyImpact: true,
      estimatedConstructionValueZar: 5_000_000,
    });
    expect(result.municipality).toBe('CoJ');
    expect(result.changesLoadBearing).toBe(true);
    expect(result.envelopeEnergyImpact).toBe(true);
    expect(result.estimatedConstructionValueZar).toBe(5_000_000);
  });

  test('drawing register and supporting docs default to empty arrays', () => {
    const result = buildScopeFactsFromProject({
      projectId: 'p1',
      projectName: 'Test',
    });
    expect(result.drawingRegister).toEqual([]);
    expect(result.supportingDocuments).toEqual([]);
  });
});
