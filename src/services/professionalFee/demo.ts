import { FeeCalculatorEngine } from './feeEngine';
import { ProfessionProfileRegistry } from './profiles';
import { ProfessionFeeService } from './professionFeeService';
import { ProposalBuilderService } from './proposalBuilder';
import { TermsLibraryService } from './terms';
import { toAppointmentDraft, toInboxEvent, toProjectRecord } from './adapters';
import { FeeGuideUpdateService, FeeGuideWatchRegistry } from './guidelineUpdateService';

export function runDemo() {
  const profiles = new ProfessionProfileRegistry();
  const feeService = new ProfessionFeeService(profiles, new FeeCalculatorEngine());
  const proposalBuilder = new ProposalBuilderService(new TermsLibraryService());

  const profile = profiles.get('architect');
  const selectedStages = Object.fromEntries(profile.stages.map((s) => [s.id, { applicable: true, reductionPercentage: s.id === 's6' ? 0.25 : 0 }]));
  const architectCalc = feeService.calculate({
    profession: 'architect', projectValue: 3500000, complexityId: 'high', workCategorySplits: { new: 0.7, alteration: 0.2, specialist: 0.1 }, selectedStages,
    disbursements: [{ label: 'Travel and printing allowance', amount: 8500 }], statutoryFees: [{ label: 'Municipal submission allowance', amount: 12000 }],
    discount: { percentage: 0.05, reason: 'founding-client commercial adjustment' }, vatApplicable: true,
  });
  const draft = proposalBuilder.buildDraft({
    project: { name: 'Orchard House Alterations', clientName: 'Demo Client', location: 'Cape Town', description: 'Residential alterations with heritage-sensitive interface.' },
    professional: { name: 'Demo Architect', company: 'Demo Practice', email: 'demo@example.com', registrationNumber: 'SACAP-PLACEHOLDER' },
    calculation: architectCalc, assumptions: ['Verified source tables to replace demo seed before production issue.', 'Scope limited to selected stages and deliverables.'],
    exclusions: ['Specialist engineering appointments unless separately listed.', 'Municipal approval outcome guarantee.'],
    notes: architectCalc.warnings, validityDays: 30, selectedTermsTemplateIds: profile.defaultTermsTemplateIds,
    customTerms: ['Client to confirm budget before Stage 3 proceeds.'],
  });
  const issued = proposalBuilder.issue(draft);

  const structuralProfile = profiles.get('structuralEngineer');
  const structuralStages = Object.fromEntries(structuralProfile.stages.map((s) => [s.id, { applicable: true, reductionPercentage: 0 }]));
  const structuralCalc = feeService.calculate({ profession: 'structuralEngineer', projectValue: 3500000, complexityId: 'medium', workCategorySplits: { new: 1, alteration: 0, specialist: 0 }, selectedStages: structuralStages, vatApplicable: true });

  const plannerUi = feeService.getUiModel('townPlanner');

  const watchRegistry = new FeeGuideWatchRegistry();
  const updateService = new FeeGuideUpdateService(watchRegistry);
  updateService.scanTextSnapshots({
    'sacap-fees': 'SACAP current professional fees guideline IDoW board notice baseline',
    'ecsa-fees': 'ECSA current professional services guideline fees baseline',
  });
  const detectedGuideUpdates = updateService.scanTextSnapshots({
    'sacap-fees': 'SACAP NEW professional fees guideline IDoW board notice update published',
    'ecsa-fees': 'ECSA current professional services guideline fees baseline',
  });
  const approvedSourceVersion = updateService.approveCandidate({
    candidate: detectedGuideUpdates[0],
    approvedBy: 'admin-demo',
    approvedAt: new Date().toISOString(),
    sourceTitle: 'SACAP approved updated professional fee guideline - demo approval record',
    effectiveDate: '2026-07-01',
    notes: 'Demo approval path. Production requires human verification of official source before activation.',
  });

  return {
    professionsSupported: profiles.list().length,
    architectUiStyle: feeService.getUiModel('architect').uiStyle,
    architectGuidelineFee: architectCalc.guidelineProfessionalFee,
    architectProposalTotalInclVat: architectCalc.totalInclVat,
    proposalStatus: issued.status,
    proposalAuditHash: issued.auditHash,
    termsClauses: issued.terms.length,
    structuralEngineerTotalInclVat: structuralCalc.totalInclVat,
    plannerUiStyle: plannerUi.uiStyle,
    feeGuideWatchSources: watchRegistry.list().length,
    detectedGuideUpdates: detectedGuideUpdates.length,
    approvedSourceStatus: approvedSourceVersion.status,
    approvedSourceVersionId: approvedSourceVersion.id,
    projectRecord: toProjectRecord(issued),
    inboxEvent: toInboxEvent(issued),
    appointmentDraftStatus: toAppointmentDraft(issued).status,
  };
}
