import { describe, expect, it } from 'vitest';
import { evaluateDemolitionWasteReadiness } from '../demolitionWasteReadinessService';
import { evaluateHeritageImpactReadiness } from '../heritageImpactReadinessService';
import { evaluateLabTestingReadiness } from '../labTestingReadinessService';
import { evaluateFicaReportingReadiness } from '../ficaReportingReadinessService';
import { evaluateEscrowStateTransition } from '../escrowStateMachineReadinessService';
import { evaluateHaDrReadiness } from '../haDrReadinessService';
import { evaluateIntegrationRegistry } from '../integrationRegistryService';

describe('PRD section 53-60 readiness services', () => {
  it('blocks demolition until asbestos, AIA, permit, and waste evidence are complete', () => {
    const result = evaluateDemolitionWasteReadiness({ demolitionPlanned: true, structureYearBuilt: 1985, acmDetected: true, evidence: { demolitionPermitRef: 'permit.pdf' }, checks: { councilPermitReady: true } });
    expect(result.status).toBe('blocked');
    expect(result.asbestosAuditRequired).toBe(true);
    expect(result.aiaGateRequired).toBe(true);
    expect(result.missingEvidence).toContain('registered AIA asbestos contractor reference');
    expect(result.blockers).toContain('Site access must be restricted while ACM abatement is unresolved.');
    expect(result.audit.noAutomaticSiteAccessApproval).toBe(true);
  });

  it('marks demolition/waste pack ready only with human-review evidence', () => {
    const result = evaluateDemolitionWasteReadiness({ demolitionPlanned: true, structureYearBuilt: 2020, evidence: { demolitionPermitRef: 'permit', wasteManagementPlanRef: 'wmp', generalWasteDisposalCertificateRef: 'dump', recyclingLogRef: 'recycle' }, checks: { councilPermitReady: true, wastePlanApproved: true, disposalEvidenceComplete: true } });
    expect(result.status).toBe('ready_for_human_review');
    expect(result.nextAction.label).toBe('Approve demolition and waste readiness pack');
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('detects NHRA Section 38 HIA triggers and proof blockers', () => {
    const result = evaluateHeritageImpactReadiness({ linearDevelopmentMeters: 350, siteCharacterChangeSqm: 6000, evidence: { spatialOverlayRef: 'gis' }, checks: { overlayScanComplete: true } });
    expect(result.required).toBe(true);
    expect(result.triggers.linearDevelopment).toBe(true);
    expect(result.triggers.siteCharacterChange).toBe(true);
    expect(result.status).toBe('blocked');
    expect(result.missingEvidence).toContain('SAHRA/PHRA proof tracking reference');
    expect(result.audit.noAutomaticAuthoritySubmission).toBe(true);
  });

  it('links failed lab tests to NCR/rectification workflow', () => {
    const result = evaluateLabTestingReadiness({ earthworksOrFoundations: true, structuralConcreteCast: true, evidence: { sanasLabRef: 'lab', dcpResultsRef: 'dcp', modAashtoRef: 'mod', cubeSamplingRef: 'cube', sevenDayCertificateRef: '7d', twentyEightDayCertificateRef: '28d' }, results: { compactionPassed: true, requiredMpa: 30, twentyEightDayMpa: 24, engineerApproved: false } });
    expect(result.status).toBe('blocked');
    expect(result.failedStrength).toBe(true);
    expect(result.blockers).toContain('Failed concrete test must be linked to an NCR/rectification workflow.');
    expect(result.audit.noAutomaticStructuralApproval).toBe(true);
  });

  it('flags CTR, suspicious transactions, and payment splitting for admin queue', () => {
    const result = evaluateFicaReportingReadiness({ accountableInstitutionRegistered: true, transactions: [ { id: 't1', amount: 25_000, payerId: 'payer-1', payeeId: 'arch-1', createdAt: '2026-05-27T08:00:00Z' }, { id: 't2', amount: 26_000, payerId: 'payer-1', payeeId: 'arch-1', createdAt: '2026-05-27T09:00:00Z' }, { id: 't3', amount: 75_000, payerId: 'payer-2', payeeId: 'arch-1', createdAt: '2026-05-27T10:00:00Z', flagged: true } ], evidence: { kycPackRef: 'kyc', sourceOfFundsRef: 'sof', mlroReviewRef: 'mlro' }, reportState: 'queued_for_mlro_review' });
    expect(result.reportingRequired).toBe(true);
    expect(result.ctrTransactions).toEqual(['t3']);
    expect(result.suspiciousTransactions).toContain('t3');
    expect(result.status).toBe('ready_for_admin_queue');
    expect(result.audit.noAutomaticRegulatorReport).toBe(true);
  });

  it('maps Solidity escrow spec to internal TypeScript state transition guards', () => {
    expect(evaluateEscrowStateTransition({ from: 'funded', to: 'released', funded: true }).allowed).toBe(false);
    const release = evaluateEscrowStateTransition({ from: 'admin_review', to: 'released', clientApproved: true, adminApproved: true });
    expect(release.allowed).toBe(true);
    expect(release.solidityInScope).toBe(false);
    expect(release.audit.noBlockchainExecution).toBe(true);
  });

  it('blocks HA/DR readiness without RPO/RTO, backup, restore, monitoring, and failover evidence', () => {
    const result = evaluateHaDrReadiness({ rpoMinutes: 120, rtoMinutes: 300, backupScheduleRef: 'daily' });
    expect(result.status).toBe('blocked');
    expect(result.missingEvidence).toContain('restore rehearsal evidence');
    expect(result.blockers).toContain('RPO target exceeds the recommended 60-minute production readiness threshold.');
  });

  it('classifies strategic integrations and enforces owner credentials terms and tests', () => {
    const result = evaluateIntegrationRegistry([
      { key: 'payfast', name: 'PayFast', status: 'live', owner: 'finance', credentialsRef: 'secret://payfast', termsRef: 'terms://payfast', testStatus: 'passing' },
      { key: 'sahra', name: 'SAHRA', status: 'future' },
      { key: 'vercel-blob', name: 'Vercel Blob', status: 'provider_gated', owner: 'platform', termsRef: 'terms://vercel' },
    ]);
    expect(result.byStatus).toMatchObject({ live: 1, future: 1, provider_gated: 1 });
    expect(result.status).toBe('blocked');
    expect(result.blockers).toContain('sahra is missing an owner.');
    expect(result.blockers).toContain('vercel-blob requires credential reference for provider_gated integration.');
  });
});
