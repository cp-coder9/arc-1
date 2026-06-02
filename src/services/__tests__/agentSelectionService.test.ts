import { describe, expect, it } from 'vitest';
import { inferDefaultMode, resolveAgentsForMode } from '../agentSelectionService';

describe('agentSelectionService', () => {
  it('returns specialist agents for each execution mode without orchestration-only stages', () => {
    expect(resolveAgentsForMode('basic_ai_screen')).toEqual([
      'architectural_completeness',
      'sans_10400_general',
      'envelope_materials',
    ]);

    expect(resolveAgentsForMode('engineering_coordination')).toEqual([
      'structural_trigger',
      'foundation_geotech',
      'drainage_stormwater',
      'electrical_services',
    ]);

    expect(resolveAgentsForMode('full_professional_review')).not.toContain('orchestrator');
    expect(resolveAgentsForMode('full_professional_review')).not.toContain('professional_signoff');
  });

  it('adds scoped discipline agents while preserving mode order and de-duplicating roles', () => {
    expect(resolveAgentsForMode('council_readiness', {
      disciplines: ['architecture', 'structure', 'planning', 'coordination'],
    })).toEqual([
      'architectural_completeness',
      'council_submission',
      'planning_zoning',
      'drainage_stormwater',
      'envelope_materials',
      'structural_trigger',
      'foundation_geotech',
    ]);
  });

  it('falls back to the basic AI screen agent set for unknown runtime modes', () => {
    expect(resolveAgentsForMode('unknown_mode' as Parameters<typeof resolveAgentsForMode>[0])).toEqual([
      'architectural_completeness',
      'sans_10400_general',
      'envelope_materials',
    ]);
  });

  it('infers resubmission, full review, and basic modes from submission signals', () => {
    expect(inferDefaultMode({ previousFindings: [{ id: 'finding-1' }] as Parameters<typeof inferDefaultMode>[0]['previousFindings'] })).toBe('resubmission_delta_review');
    expect(inferDefaultMode({ findings: [{ id: 'finding-2' }] as Parameters<typeof inferDefaultMode>[0]['findings'] })).toBe('resubmission_delta_review');
    expect(inferDefaultMode({ files: ['plan-a.pdf', 'plan-b.pdf'] })).toBe('full_professional_review');
    expect(inferDefaultMode({ files: ['plan-a.pdf'] })).toBe('basic_ai_screen');
    expect(inferDefaultMode()).toBe('basic_ai_screen');
  });
});
