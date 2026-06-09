/**
 * Professional Team Router Service Tests
 * Part of Pack 6: Municipal Submission Readiness
 */
import { describe, test, expect } from '@jest/globals';
import {
  routeProfessionalTeam,
  formatRoutingDecision,
  getRequiredDisciplines,
} from '../professionalTeamRouterService';
import { classifyProjectComplexity } from '../projectComplexityClassifierService';
import type { ProjectScopeFacts, ProfessionalRoutingDecision } from '@/types/municipalSubmissionReadiness';

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

function route(p: ProjectScopeFacts): ProfessionalRoutingDecision[] {
  return routeProfessionalTeam(p, classifyProjectComplexity(p));
}

describe('routeProfessionalTeam', () => {
  test('always-required disciplines', () => {
    const routes = route(baseProject());
    const alwaysRequired = ['client', 'lead_professional', 'architect', 'municipal_coordinator'];
    for (const d of alwaysRequired) {
      const r = routes.find((r) => r.discipline === d);
      expect(r).toBeDefined();
      expect(r!.status).toBe('required');
    }
  });

  test('structural engineer required when load-bearing changes', () => {
    const routes = route(baseProject({ changesLoadBearing: true }));
    const se = routes.find((r) => r.discipline === 'structural_engineer');
    expect(se!.status).toBe('required');
    expect(se!.reason).toContain('load-bearing');
  });

  test('structural engineer NOT required without load-bearing trigger', () => {
    const routes = route(baseProject({ changesLoadBearing: false }));
    const se = routes.find((r) => r.discipline === 'structural_engineer');
    expect(se!.status).toBe('not_currently_required');
  });

  test('civil engineer required when drainage changes', () => {
    const routes = route(baseProject({ changesDrainageOrStormwater: true }));
    const ce = routes.find((r) => r.discipline === 'civil_engineer');
    expect(ce!.status).toBe('required');
  });

  test('town planner required when zoning unknown', () => {
    const routes = route(baseProject({ zoningKnown: false }));
    const tp = routes.find((r) => r.discipline === 'town_planner');
    expect(tp!.status).toBe('required');
  });

  test('town planner required when coverage risk', () => {
    const routes = route(baseProject({ coverageOrParkingRisk: true }));
    const tp = routes.find((r) => r.discipline === 'town_planner');
    expect(tp!.status).toBe('required');
  });

  test('town planner NOT required when zoning known and no risk', () => {
    const routes = route(baseProject({ zoningKnown: true, coverageOrParkingRisk: false }));
    const tp = routes.find((r) => r.discipline === 'town_planner');
    expect(tp!.status).toBe('not_currently_required');
  });

  test('land surveyor required when boundary unclear', () => {
    const routes = route(baseProject({ boundaryOrServitudeUnclear: true }));
    const ls = routes.find((r) => r.discipline === 'land_surveyor');
    expect(ls!.status).toBe('required');
  });

  test('fire consultant required for public assembly', () => {
    const routes = route(baseProject({ occupancyType: 'public_assembly' }));
    const fc = routes.find((r) => r.discipline === 'fire_consultant');
    expect(fc!.status).toBe('required');
  });

  test('fire consultant optional by default (no hard trigger)', () => {
    const routes = route(baseProject());
    const fc = routes.find((r) => r.discipline === 'fire_consultant');
    expect(fc!.status).toBe('optional');
  });

  test('energy consultant required with envelope impact', () => {
    const routes = route(baseProject({ envelopeEnergyImpact: true }));
    const ec = routes.find((r) => r.discipline === 'energy_consultant');
    expect(ec!.status).toBe('required');
  });

  test('heritage practitioner triggered', () => {
    const routes = route(baseProject({ heritagePotential: true }));
    const hp = routes.find((r) => r.discipline === 'heritage_practitioner');
    expect(hp!.status).toBe('required');
  });

  test('environmental practitioner triggered', () => {
    const routes = route(baseProject({ environmentalSensitivity: true }));
    const ep = routes.find((r) => r.discipline === 'environmental_practitioner');
    expect(ep!.status).toBe('required');
  });

  test('traffic engineer triggered', () => {
    const routes = route(baseProject({ trafficImpact: true }));
    const te = routes.find((r) => r.discipline === 'traffic_engineer');
    expect(te!.status).toBe('required');
  });

  test('quantity surveyor optional for medium complexity', () => {
    const routes = route(
      baseProject({ changesLoadBearing: true, envelopeEnergyImpact: true })
    );
    const qs = routes.find((r) => r.discipline === 'quantity_surveyor');
    expect(qs!.status).toBe('optional');
  });

  test('quantity surveyor not required for low complexity', () => {
    const routes = route(baseProject());
    const qs = routes.find((r) => r.discipline === 'quantity_surveyor');
    expect(qs!.status).toBe('not_currently_required');
  });

  test('all 14 disciplines have routing decisions', () => {
    const routes = route(baseProject());
    expect(routes).toHaveLength(14);
  });

  test('formatRoutingDecision includes discipline and reason', () => {
    const r = route(baseProject())[0];
    const formatted = formatRoutingDecision(r);
    expect(formatted).toContain(r.discipline.replace(/_/g, ' '));
  });

  test('getRequiredDisciplines filters correctly', () => {
    const routes = route(baseProject());
    const required = getRequiredDisciplines(routes);
    expect(required).toContain('client');
    expect(required).toContain('lead_professional');
    expect(required).toContain('architect');
    expect(required).not.toContain('heritage_practitioner');
  });
});
