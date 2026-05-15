import { describe, expect, it } from 'vitest';
import { assertBriefPublishable, buildBriefInterpretation, buildProjectAttachmentMetadata, buildProjectBrief } from '../briefWorkflowService';

describe('briefWorkflowService', () => {
  it('builds client-owned project briefs and rejects impersonation', () => {
    const brief = buildProjectBrief({ clientId: 'client-1', createdBy: 'client-1', title: 'Alteration', description: 'Need a residential alteration', budgetRange: { min: 10, max: 20 } });
    expect(brief).toMatchObject({ clientId: 'client-1', status: 'submitted', title: 'Alteration', budgetRange: { min: 10, max: 20, currency: 'ZAR' } });
    expect(() => buildProjectBrief({ clientId: 'client-1', createdBy: 'other', title: 'Alteration', description: 'Need a residential alteration' })).toThrow(/client owner/);
  });

  it('sanitizes brief inputs and rejects inverted budgets', () => {
    const brief = buildProjectBrief({
      clientId: 'client-1',
      createdBy: 'client-1',
      title: '  Alteration  ',
      description: '  Need a residential alteration  ',
      requirements: ['  survey  ', '', 'concept design'],
      propertyDetails: { erf: '123', nested: { ignored: true }, listed: ['ignored'], vacant: null },
      budgetRange: { min: -10, max: 50, currency: 'USD' },
    });

    expect(brief).toMatchObject({
      title: 'Alteration',
      description: 'Need a residential alteration',
      requirements: ['survey', 'concept design'],
      propertyDetails: { erf: '123', vacant: null },
      budgetRange: { max: 50, currency: 'USD' },
    });
    expect(() => buildProjectBrief({ clientId: 'client-1', createdBy: 'client-1', title: 'A', description: 'B', budgetRange: { min: 100, max: 50 } })).toThrow(/Budget minimum/);
  });

  it('builds attachment metadata with HTTPS evidence URLs', () => {
    expect(buildProjectAttachmentMetadata({ briefId: 'brief-1', clientId: 'client-1', uploadedBy: 'client-1', fileName: 'survey.pdf', fileUrl: 'https://blob.example/survey.pdf' })).toMatchObject({
      briefId: 'brief-1',
      storageProvider: 'vercel_blob',
    });
    expect(() => buildProjectAttachmentMetadata({ briefId: 'brief-1', clientId: 'client-1', uploadedBy: 'client-1', fileName: 'survey.pdf', fileUrl: 'http://insecure.example/survey.pdf' })).toThrow(/HTTPS/);
  });

  it('persists advisory-only interpretations with evidence and limitations', () => {
    const interpretation = buildBriefInterpretation({ briefId: 'brief-1', clientId: 'client-1', createdBy: 'client-1', createdByRole: 'client', summary: 'Likely needs an architect', sourceAttachmentIds: ['attachment-1'], confidence: 2 });
    expect(interpretation.advisoryOnly).toBe(true);
    expect(interpretation.confidence).toBe(1);
    expect(interpretation.limitations.length).toBeGreaterThan(0);
    expect(interpretation.sourceAttachmentIds).toEqual(['attachment-1']);
  });

  it('clamps negative interpretation confidence and trims bounded lists', () => {
    const interpretation = buildBriefInterpretation({
      briefId: 'brief-1',
      clientId: 'client-1',
      createdBy: 'client-1',
      createdByRole: 'client',
      summary: '  Likely needs an architect  ',
      likelyRequiredProfessionals: [' architect ', '', 'engineer'],
      risks: Array.from({ length: 35 }, (_, index) => ` risk-${index} `),
      confidence: -0.5,
    });

    expect(interpretation.summary).toBe('Likely needs an architect');
    expect(interpretation.confidence).toBe(0);
    expect(interpretation.likelyRequiredProfessionals).toEqual(['architect', 'engineer']);
    expect(interpretation.risks).toHaveLength(30);
  });

  it('asserts publishable brief status', () => {
    expect(() => assertBriefPublishable({ clientId: 'client-1', title: 'Alteration', description: 'Scope', status: 'submitted' })).not.toThrow();
    expect(() => assertBriefPublishable({ clientId: 'client-1', title: 'Alteration', description: 'Scope', status: 'appointed' })).toThrow(/draft or submitted/);
  });
});
