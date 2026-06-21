import { id, roundMoney } from './ids';
import { TermsLibraryService } from './terms';
import type { ProposalDocument, ProposalInput } from './types';

export class ProposalBuilderService {
  constructor(private readonly terms: TermsLibraryService) {}

  buildDraft(input: ProposalInput): ProposalDocument {
    const createdAt = new Date().toISOString();
    const terms = this.terms.get(input.selectedTermsTemplateIds, input.customTerms);
    return {
      id: id('proposal'),
      title: `Professional Fee Proposal - ${input.project.name}`,
      status: 'draft',
      project: input.project,
      professional: input.professional,
      totals: input.calculation,
      createdAt,
      terms,
      sections: [
        { heading: 'Project and client details', body: [`Client: ${input.project.clientName}`, `Location: ${input.project.location}`, `Description: ${input.project.description}`] },
        { heading: 'Professional details', body: [`Professional: ${input.professional.name}`, `Company: ${input.professional.company ?? 'not supplied'}`, `Registration: ${input.professional.registrationNumber ?? 'not supplied'}`] },
        { heading: 'Calculator source', body: [`Source/version: ${input.calculation.sourceVersionId}`, `Formula: ${input.calculation.formulaType}`] },
        { heading: 'Fee summary', body: input.calculation.lines.map((l) => `${l.label}: R ${roundMoney(l.amount).toLocaleString('en-ZA')}${l.note ? ` (${l.note})` : ''}`) },
        { heading: 'Assumptions', body: input.assumptions },
        { heading: 'Exclusions', body: input.exclusions },
        { heading: 'Notes', body: input.notes },
        { heading: 'Validity', body: [`This proposal is valid for ${input.validityDays} days unless withdrawn or revised.`] },
      ],
      acceptance: [
        'Accepted by client: __________________ Date: __________',
        'Accepted by professional: _____________ Date: __________',
        'Professional responsibility confirmation required before issue.',
      ],
    };
  }

  issue(draft: ProposalDocument): ProposalDocument {
    const issued: ProposalDocument = { ...draft, status: 'issued' };
    issued.auditHash = fnv1a(JSON.stringify({
      project: issued.project,
      professional: issued.professional,
      totals: issued.totals,
      terms: issued.terms,
      createdAt: issued.createdAt,
    }));
    return issued;
  }
}

function fnv1a(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `proposal-fnv1a32:${(h >>> 0).toString(16).padStart(8, '0')}`;
}
