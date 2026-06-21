import type { FormChecklistInput, Verdict } from './types';

export class SansFormsRegistry {
  private forms = [
    { id: 'A1', name: 'Application for Approval checklist', parts: ['A'], evidence: ['owner details', 'property description', 'plans', 'professional details'] },
    { id: 'A19', name: 'Competent Person appointment/undertaking', parts: ['A'], evidence: ['competent person details', 'discipline', 'signature', 'registration reference'] },
    { id: 'XA', name: 'Energy usage / XA compliance evidence', parts: ['XA'], evidence: ['fenestration report', 'R-value report', 'hot-water notes', 'lighting/AC where applicable'] },
    { id: 'T', name: 'Fire protection pre-check', parts: ['T'], evidence: ['occupancy', 'escape routes', 'fire notes', 'competent person if required'] },
    { id: 'S', name: 'Facilities for persons with disabilities pre-check', parts: ['S'], evidence: ['access route', 'sanitary facilities', 'parking/ramp/lift notes'] },
  ];

  build(input: FormChecklistInput) {
    const selected = this.forms.filter((f) => input.parts.includes(f.parts[0]) || input.parts.includes(f.id));
    const requiredEvidence = [...new Set(selected.flatMap((f) => f.evidence))];
    const warnings = input.includesCompetentPersons
      ? []
      : selected.some((f) => f.id === 'A19')
        ? ['Competent person form selected but no competent persons marked.']
        : [];
    const verdict: Verdict = warnings.length ? 'watch' : 'pass';
    return { project: input.project, forms: selected, requiredEvidence, warnings, verdict };
  }
}
