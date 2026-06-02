import {
  AI_HUMAN_SIGNOFF_REQUIREMENTS,
  CLOSEOUT_HANDOVER_REQUIREMENTS,
  LIFECYCLE_STAGE_GATES,
  NEXT_BEST_ACTION_SIGNALS,
  PRD_ROLE_PATH_REQUIREMENTS,
  STATUTORY_PROVIDER_REQUIREMENTS,
  projectAiHumanSignoffReadiness,
  projectCloseoutHandoverReadiness,
  projectLifecycleGateReadiness,
  projectNextBestActionReadiness,
  projectRolePathUatReadiness,
  projectStatutoryProviderReadiness,
  rankNextBestActions,
} from '../prdCompletionReadinessService';

describe('prdCompletionReadinessService', () => {
  it('projects complete role path UAT coverage across all PRD roles', () => {
    const implemented = Object.fromEntries(
      Object.entries(PRD_ROLE_PATH_REQUIREMENTS).map(([role, requirements]) => [role, [...requirements]]),
    );

    expect(projectRolePathUatReadiness(implemented).status).toBe('ready');
    expect(projectRolePathUatReadiness({ client: ['guided_brief'] }).blockers).toContain('client:proposal_comparison');
  });

  it('keeps statutory provider integrations provider-gated until credentials and terms exist', () => {
    const implemented = [...STATUTORY_PROVIDER_REQUIREMENTS];
    const blocked = projectStatutoryProviderReadiness(implemented, []);

    expect(blocked.status).toBe('blocked');
    expect(blocked.blockers[0]).toContain('provider credentials/terms required');
    expect(projectStatutoryProviderReadiness(implemented, implemented).status).toBe('ready');
  });

  it('ranks next-best-actions and validates signal coverage', () => {
    expect(rankNextBestActions(['payment_due', 'blocked_stage_gate', 'unresolved_ai_issue'])).toEqual([
      'blocked_stage_gate',
      'payment_due',
      'unresolved_ai_issue',
    ]);
    expect(projectNextBestActionReadiness([...NEXT_BEST_ACTION_SIGNALS]).status).toBe('ready');
  });

  it('validates unified lifecycle, AI signoff, and closeout handover readiness', () => {
    expect(projectLifecycleGateReadiness([...LIFECYCLE_STAGE_GATES]).status).toBe('ready');
    expect(projectAiHumanSignoffReadiness([...AI_HUMAN_SIGNOFF_REQUIREMENTS]).status).toBe('ready');
    expect(projectCloseoutHandoverReadiness([...CLOSEOUT_HANDOVER_REQUIREMENTS]).status).toBe('ready');

    expect(projectLifecycleGateReadiness(['brief']).blockers).toContain('appoint');
    expect(projectAiHumanSignoffReadiness(['source_evidence']).blockers).toContain('confidence_score');
    expect(projectCloseoutHandoverReadiness(['snag_evidence']).blockers).toContain('retention_release_gate');
  });
});
