import { describe, expect, it } from 'vitest';
import {
  assertCanAuthorTechnicalBrief,
  buildTechnicalBriefInterpretation,
  buildTechnicalBriefRecord,
  splitTechnicalBriefLines,
} from '../technicalBriefService';

const baseInput = {
  opportunityId: 'opp-1',
  briefId: 'brief-1',
  clientId: 'client-1',
  createdBy: 'bep-1',
  createdByRole: 'bep' as const,
  scope: 'Concept design\nMunicipal submission pack',
  deliverables: 'Site plan\nCouncil drawings',
  exclusions: 'Town planning application',
  assumptions: 'Existing plans are accurate',
  consultants: 'Structural engineer\nFire consultant',
  approvalRoute: 'Municipal building plan submission',
  riskLevel: 'high' as const,
  missingInformation: 'Title deed\nSurvey diagram',
  createdAt: '2026-05-20T18:30:00.000Z',
};

describe('technicalBriefService', () => {
  it('splits and trims bounded line inputs', () => {
    expect(splitTechnicalBriefLines(' A \n\n B ')).toEqual(['A', 'B']);
  });

  it('allows BEP, architect, and admin authors only', () => {
    expect(() => assertCanAuthorTechnicalBrief('bep')).not.toThrow();
    expect(() => assertCanAuthorTechnicalBrief('architect')).not.toThrow();
    expect(() => assertCanAuthorTechnicalBrief('admin')).not.toThrow();
    expect(() => assertCanAuthorTechnicalBrief('client')).toThrow(/Only BEP/);
  });

  it('builds review-ready technical brief records with downstream feed metadata', () => {
    const record = buildTechnicalBriefRecord(baseInput);

    expect(record).toMatchObject({
      opportunityId: 'opp-1',
      briefId: 'brief-1',
      professionalScope: ['Concept design', 'Municipal submission pack'],
      deliverables: ['Site plan', 'Council drawings'],
      consultants: ['Structural engineer', 'Fire consultant'],
      status: 'ready_for_review',
      humanReviewRequired: true,
      professionalAccountabilityRequired: true,
      finalizedAt: null,
    });
    expect(record.downstreamFeeds).toEqual([
      'proposal_scope',
      'appointment_contract',
      'project_stage_gates',
      'compliance_checklists',
      'procurement_estimates',
    ]);
  });

  it('requires scope or deliverables and requires both when finalized', () => {
    expect(() => buildTechnicalBriefRecord({ ...baseInput, scope: '', deliverables: '' })).toThrow(/scope or deliverables/);
    expect(() => buildTechnicalBriefRecord({ ...baseInput, scope: 'Scope only', deliverables: '', finalize: true })).toThrow(/both professional scope and deliverables/);
    expect(buildTechnicalBriefRecord({ ...baseInput, finalize: true })).toMatchObject({ status: 'finalized', finalizedAt: baseInput.createdAt });
  });

  it('builds advisory interpretation from human-authored technical brief data', () => {
    const interpretation = buildTechnicalBriefInterpretation({ ...baseInput, title: 'Alteration' });

    expect(interpretation).toMatchObject({
      briefId: 'brief-1',
      clientId: 'client-1',
      advisoryOnly: true,
      model: 'human-authored-technical-brief',
      likelyRequiredProfessionals: ['Structural engineer', 'Fire consultant'],
    });
    expect(interpretation.summary).toContain('Technical interpretation for Alteration');
    expect(interpretation.risks).toEqual(['Risk level marked high', 'Missing information: Title deed', 'Missing information: Survey diagram']);
  });
});
