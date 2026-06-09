/**
 * Readiness Score Service Tests
 * Part of Pack 6: Municipal Submission Readiness
 */
import { describe, test, expect } from '@jest/globals';
import {
  assessReadiness,
  getCategoryScoreBreakdown,
  buildProfessionalTeamChecks,
} from '../readinessScoreService';
import type { ReadinessCheck } from '@/types/municipalSubmissionReadiness';

const allCompleteChecks: ReadinessCheck[] = [
  { id: 'c1', category: 'property_and_municipal_facts', label: 'Municipality', status: 'complete', owner: 'municipal_coordinator' },
  { id: 'c2', category: 'land_use_and_zoning', label: 'Zoning confirmed', status: 'complete', owner: 'town_planner' },
  { id: 'c3', category: 'client_authority', label: 'Client authority', status: 'complete', owner: 'client' },
];

describe('assessReadiness', () => {
  test('100% score when all checks complete', () => {
    const result = assessReadiness(allCompleteChecks);
    expect(result.score).toBe(100);
    expect(result.readyForProfessionalSubmissionReview).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  test('0% score when nothing complete and everything missing', () => {
    const checks: ReadinessCheck[] = [
      { id: 'c1', category: 'property_and_municipal_facts', label: 'Municipality', status: 'missing', owner: 'municipal_coordinator' },
    ];
    const result = assessReadiness(checks);
    expect(result.score).toBe(0);
    expect(result.readyForProfessionalSubmissionReview).toBe(false);
  });

  test('partially complete score', () => {
    const checks: ReadinessCheck[] = [
      { id: 'c1', category: 'property_and_municipal_facts', label: 'A', status: 'complete', owner: 'client' },
      { id: 'c2', category: 'property_and_municipal_facts', label: 'B', status: 'missing', owner: 'client' },
      { id: 'c3', category: 'property_and_municipal_facts', label: 'C', status: 'requires_professional_review', owner: 'architect' },
      { id: 'c4', category: 'property_and_municipal_facts', label: 'D', status: 'complete', owner: 'client' },
    ];
    const result = assessReadiness(checks);
    expect(result.score).toBe(50);
  });

  test('not_applicable checks excluded from scoring', () => {
    const checks: ReadinessCheck[] = [
      { id: 'c1', category: 'property_and_municipal_facts', label: 'A', status: 'complete', owner: 'client' },
      { id: 'c2', category: 'property_and_municipal_facts', label: 'N/A', status: 'not_applicable', owner: 'fire_consultant' },
    ];
    const result = assessReadiness(checks);
    expect(result.score).toBe(100);
  });

  test('blockers listed when items missing', () => {
    const checks: ReadinessCheck[] = [
      { id: 'c1', category: 'client_authority', label: 'Client consent form', status: 'missing', owner: 'client' },
    ];
    const result = assessReadiness(checks);
    expect(result.blockers.length).toBeGreaterThan(0);
    expect(result.blockers[0]).toContain('Client consent form');
    expect(result.blockers[0]).toContain('client');
  });

  test('not ready when more than 3 items need professional review', () => {
    const checks: ReadinessCheck[] = [
      { id: 'c1', category: 'nbr_sans_advisory_precheck', label: 'Review A', status: 'requires_professional_review', owner: 'structural_engineer' },
      { id: 'c2', category: 'nbr_sans_advisory_precheck', label: 'Review B', status: 'requires_professional_review', owner: 'structural_engineer' },
      { id: 'c3', category: 'nbr_sans_advisory_precheck', label: 'Review C', status: 'requires_professional_review', owner: 'architect' },
      { id: 'c4', category: 'nbr_sans_advisory_precheck', label: 'Review D', status: 'requires_professional_review', owner: 'civil_engineer' },
    ];
    const result = assessReadiness(checks);
    expect(result.readyForProfessionalSubmissionReview).toBe(false);
  });

  test('ready when 3 or fewer review items and no blockers', () => {
    const checks: ReadinessCheck[] = [
      { id: 'c1', category: 'nbr_sans_advisory_precheck', label: 'Review A', status: 'requires_professional_review', owner: 'structural_engineer' },
      { id: 'c2', category: 'nbr_sans_advisory_precheck', label: 'Review B', status: 'requires_professional_review', owner: 'structural_engineer' },
      { id: 'c3', category: 'nbr_sans_advisory_precheck', label: 'Review C', status: 'requires_professional_review', owner: 'architect' },
      { id: 'c4', category: 'client_authority', label: 'Auth', status: 'complete', owner: 'client' },
    ];
    const result = assessReadiness(checks);
    expect(result.readyForProfessionalSubmissionReview).toBe(true);
  });

  test('category scores calculated correctly', () => {
    const checks: ReadinessCheck[] = [
      { id: 'c1', category: 'property_and_municipal_facts', label: 'A', status: 'complete', owner: 'client' },
      { id: 'c2', category: 'property_and_municipal_facts', label: 'B', status: 'missing', owner: 'client' },
      { id: 'c3', category: 'land_use_and_zoning', label: 'C', status: 'complete', owner: 'town_planner' },
    ];
    const result = assessReadiness(checks);
    expect(result.categoryScores.property_and_municipal_facts.score).toBe(50);
    expect(result.categoryScores.land_use_and_zoning.score).toBe(100);
  });

  test('empty category has score 100', () => {
    const result = assessReadiness(allCompleteChecks);
    // Categories with no applicable checks get 100
    expect(result.categoryScores.professional_signoffs.score).toBe(100);
    expect(result.categoryScores.professional_signoffs.total).toBe(0);
  });

  test('all 8 categories present in category scores', () => {
    const result = assessReadiness(allCompleteChecks);
    const categories = [
      'property_and_municipal_facts',
      'land_use_and_zoning',
      'professional_team',
      'nbr_sans_advisory_precheck',
      'drawing_register',
      'supporting_documents',
      'professional_signoffs',
      'client_authority',
    ];
    for (const cat of categories) {
      expect(result.categoryScores[cat]).toBeDefined();
    }
  });
});

describe('getCategoryScoreBreakdown', () => {
  test('returns 8 category entries', () => {
    const assessment = assessReadiness(allCompleteChecks);
    const breakdown = getCategoryScoreBreakdown(assessment);
    expect(breakdown).toHaveLength(8);
  });

  test('each entry has label, score, total, complete fields', () => {
    const assessment = assessReadiness(allCompleteChecks);
    const breakdown = getCategoryScoreBreakdown(assessment);
    for (const entry of breakdown) {
      expect(entry.category).toBeDefined();
      expect(entry.label).toBeDefined();
      expect(typeof entry.score).toBe('number');
      expect(typeof entry.total).toBe('number');
      expect(typeof entry.complete).toBe('number');
    }
  });
});

describe('buildProfessionalTeamChecks', () => {
  test('creates check for each route', () => {
    const routes = [
      { discipline: 'architect', status: 'required' },
      { discipline: 'structural_engineer', status: 'not_currently_required' },
    ];
    const checks = buildProfessionalTeamChecks(routes);
    expect(checks).toHaveLength(2);
  });

  test('required route → requires_professional_review status', () => {
    const checks = buildProfessionalTeamChecks([
      { discipline: 'architect', status: 'required' },
    ]);
    expect(checks[0].status).toBe('requires_professional_review');
  });

  test('not_currently_required route → not_applicable status', () => {
    const checks = buildProfessionalTeamChecks([
      { discipline: 'heritage_practitioner', status: 'not_currently_required' },
    ]);
    expect(checks[0].status).toBe('not_applicable');
  });

  test('check category is professional_team', () => {
    const checks = buildProfessionalTeamChecks([
      { discipline: 'architect', status: 'required' },
    ]);
    expect(checks[0].category).toBe('professional_team');
  });

  test('discipline name formatted in label', () => {
    const checks = buildProfessionalTeamChecks([
      { discipline: 'structural_engineer', status: 'required' },
    ]);
    expect(checks[0].label).toBe('structural engineer');
  });
});
