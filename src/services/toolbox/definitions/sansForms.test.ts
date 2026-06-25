import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { SEED_GUIDELINE_TABLES } from '@/services/toolbox/tables'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  sansFormsV1,
  sansFormsInputSchema,
} from './sansForms'

function run(input: unknown) {
  return runCalculator(sansFormsV1, input, [], { tables: SEED_GUIDELINE_TABLES })
}

describe('sansForms schema validation', () => {
  it('accepts valid input', () => {
    const result = sansFormsInputSchema.safeParse({
      formType: 'rational_assessment',
      buildingDetails: { buildingDescription: 'Office block', occupancyClass: 'G1' },
      professionalDetails: { professionalName: 'John Doe', professionalRegistration: 'PrEng 12345', date: '2024-01-01', designBasis: 'SANS 10400-T' },
      annexuresProvided: ['fire_report', 'structural_report'],
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty form type', () => {
    const result = sansFormsInputSchema.safeParse({
      formType: '',
      buildingDetails: {},
      professionalDetails: {},
      annexuresProvided: [],
    })
    expect(result.success).toBe(false)
  })
})

describe('sans_forms_v1 — registration', () => {
  it('is registered with correct toolId and table refs', () => {
    expect(getCalculatorDefinition('sans_forms_v1')).toBe(sansFormsV1)
    expect(sansFormsV1.toolId).toBe('sans_forms')
    expect(sansFormsV1.method).toBe('clauseSet')
    expect(sansFormsV1.status).toBe('full')
    expect(sansFormsV1.tableRefs).toContain('sans_form_requirements')
  })
})

describe('sans_forms_v1 — clause checks', () => {
  it('passes all clauses for a complete rational assessment form', () => {
    const result = run({
      formType: 'rational_assessment',
      buildingDetails: {
        buildingDescription: 'Multi-storey office',
        occupancyClass: 'G1',
        designBasis: 'SANS 10400-T rational fire design',
      },
      professionalDetails: {
        professionalName: 'Jane Smith',
        professionalRegistration: 'PrEng 54321',
        date: '2024-06-01',
      },
      annexuresProvided: ['fire_report', 'structural_report'],
    })
    expect(result.complianceScore).toBe(100)
    expect(result.clauseResults.find((c) => c.clauseRef === 'Forms 1.1')?.outcome).toBe('pass')
    expect(result.clauseResults.find((c) => c.clauseRef === 'Forms 1.2')?.outcome).toBe('pass')
    expect(result.clauseResults.find((c) => c.clauseRef === 'Forms 1.3')?.outcome).toBe('pass')
    expect(result.disclaimers.length).toBeGreaterThan(0)
  })

  it('fails when required fields are missing', () => {
    const result = run({
      formType: 'rational_assessment',
      buildingDetails: {
        buildingDescription: 'Office',
      },
      professionalDetails: {
        professionalName: 'John Doe',
        professionalRegistration: 'PrArch 12345',
      },
      annexuresProvided: ['fire_report', 'structural_report'],
    })
    // Missing: occupancyClass, designBasis, date
    expect(result.clauseResults.find((c) => c.clauseRef === 'Forms 1.1')?.outcome).toBe('fail')
    expect(result.complianceScore).toBeLessThan(100)
  })

  it('fails when professional registration format is invalid', () => {
    const result = run({
      formType: 'certificate_compliance',
      buildingDetails: {
        buildingAddress: '123 Test St',
        erfNumber: 'ERF 456',
        ownerName: 'Client Corp',
        sansReference: 'SANS 10400-XA',
      },
      professionalDetails: {
        professionalName: 'John Doe',
        professionalRegistration: 'invalid-format',
        date: '2024-01-01',
      },
      annexuresProvided: ['approved_plans', 'test_certificates'],
    })
    expect(result.clauseResults.find((c) => c.clauseRef === 'Forms 1.2')?.outcome).toBe('fail')
  })

  it('fails when required annexures are missing', () => {
    const result = run({
      formType: 'rational_assessment',
      buildingDetails: {
        buildingDescription: 'Office',
        occupancyClass: 'G1',
        designBasis: 'SANS 10400-T',
      },
      professionalDetails: {
        professionalName: 'Jane Smith',
        professionalRegistration: 'PrEng 12345',
        date: '2024-01-01',
      },
      annexuresProvided: ['fire_report'], // missing structural_report
    })
    expect(result.clauseResults.find((c) => c.clauseRef === 'Forms 1.3')?.outcome).toBe('fail')
  })

  it('throws for unknown form type', () => {
    expect(() =>
      run({
        formType: 'nonexistent_form',
        buildingDetails: {},
        professionalDetails: {},
        annexuresProvided: [],
      }),
    ).toThrow()
  })
})

describe('sans_forms_v1 — source traceability', () => {
  it('includes source version in result', () => {
    const result = run({
      formType: 'rational_assessment',
      buildingDetails: {
        buildingDescription: 'Test',
        occupancyClass: 'G1',
        designBasis: 'Test',
      },
      professionalDetails: {
        professionalName: 'Test',
        professionalRegistration: 'PrEng 12345',
        date: '2024-01-01',
      },
      annexuresProvided: ['fire_report', 'structural_report'],
    })
    expect(result.sourceVersions).toContainEqual({
      guideline: 'sans_form_requirements',
      version: '2024.1',
    })
  })
})
