import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { classifySection24, reportIncident } from '../incidentReporterService';
import type { InjuryClassification } from '../hsTypes';

/**
 * Property 14: Incident Section 24 classification
 *
 * For any incident with injuryClassification of 'fatality', classifySection24() SHALL return true.
 * For any incident with injuryClassification of 'first_aid', classifySection24() SHALL return false.
 * For any incident with injuryClassification of 'lost_time', classifySection24() SHALL return true.
 * For any incident with injuryClassification of 'medical_treatment', classifySection24() SHALL return false.
 *
 * **Validates: Requirements 7.2**
 */
describe('Property 14: Incident Section 24 classification', () => {
  const classificationArb = fc.constantFrom<InjuryClassification>(
    'fatality',
    'lost_time',
    'medical_treatment',
    'first_aid'
  );

  it('fatality incidents are always Section 24 notifiable', () => {
    fc.assert(
      fc.property(fc.constant('fatality' as InjuryClassification), (classification) => {
        const result = classifySection24({ injuryClassification: classification });
        expect(result).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('first_aid incidents are never Section 24 notifiable', () => {
    fc.assert(
      fc.property(fc.constant('first_aid' as InjuryClassification), (classification) => {
        const result = classifySection24({ injuryClassification: classification });
        expect(result).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('lost_time incidents are always Section 24 notifiable', () => {
    fc.assert(
      fc.property(fc.constant('lost_time' as InjuryClassification), (classification) => {
        const result = classifySection24({ injuryClassification: classification });
        expect(result).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('medical_treatment incidents are never Section 24 notifiable', () => {
    fc.assert(
      fc.property(fc.constant('medical_treatment' as InjuryClassification), (classification) => {
        const result = classifySection24({ injuryClassification: classification });
        expect(result).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('classification is deterministic for any injury type', () => {
    fc.assert(
      fc.property(classificationArb, (classification) => {
        const result1 = classifySection24({ injuryClassification: classification });
        const result2 = classifySection24({ injuryClassification: classification });
        expect(result1).toBe(result2);
      }),
      { numRuns: 200 }
    );
  });

  it('notifiable classifications are exactly fatality and lost_time', () => {
    fc.assert(
      fc.property(classificationArb, (classification) => {
        const result = classifySection24({ injuryClassification: classification });
        const expectedNotifiable = classification === 'fatality' || classification === 'lost_time';
        expect(result).toBe(expectedNotifiable);
      }),
      { numRuns: 200 }
    );
  });

  // ─── reportIncident auto-classification ─────────────────────────────────

  describe('reportIncident auto-classifies Section 24 correctly', () => {
    const incidentInputArb = fc.record({
      projectId: fc.stringMatching(/^proj-[a-z0-9]{3,10}$/),
      date: fc.constant('2025-06-15'),
      time: fc.constant('14:30'),
      location: fc.stringMatching(/^[A-Z][a-z]{2,15} [A-Z]$/),
      personsInvolved: fc.array(fc.stringMatching(/^[a-z]{3,10}$/), { minLength: 1, maxLength: 5 }),
      injuryClassification: classificationArb,
      description: fc.stringMatching(/^[A-Za-z ]{10,50}$/),
      immediateActions: fc.stringMatching(/^[A-Za-z ]{3,30}$/),
      reportedBy: fc.stringMatching(/^[a-z]{3,12}$/),
    });

    it('returned incident isSection24Notifiable matches classifySection24 output', () => {
      fc.assert(
        fc.property(incidentInputArb, (input) => {
          const incident = reportIncident(input);
          const expectedClassification = classifySection24({
            injuryClassification: input.injuryClassification,
          });

          expect(incident.isSection24Notifiable).toBe(expectedClassification);
        }),
        { numRuns: 200 }
      );
    });

    it('reported incident state is always "reported"', () => {
      fc.assert(
        fc.property(incidentInputArb, (input) => {
          const incident = reportIncident(input);
          expect(incident.state).toBe('reported');
        }),
        { numRuns: 200 }
      );
    });

    it('reported incident preserves injuryClassification from input', () => {
      fc.assert(
        fc.property(incidentInputArb, (input) => {
          const incident = reportIncident(input);
          expect(incident.injuryClassification).toBe(input.injuryClassification);
        }),
        { numRuns: 200 }
      );
    });
  });
});
