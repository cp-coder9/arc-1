import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { SEED_GUIDELINE_TABLES } from '@/services/toolbox/tables'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  hsComplianceV1,
  hsComplianceInputSchema,
  hsCheckRowSchema,
} from './hsCompliance'

function run(input: unknown, rows: unknown[] = []) {
  return runCalculator(hsComplianceV1, input, rows, { tables: SEED_GUIDELINE_TABLES })
}

describe('hs_compliance_v1 — schema validation', () => {
  it('accepts valid input', () => {
    const result = hsComplianceInputSchema.safeParse({
      projectName: 'Residential Block A',
      inspectionDate: '2024-12-15',
      inspectorName: 'Safety Officer K. Naidoo',
      siteId: 'SITE-001',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty projectName', () => {
    const result = hsComplianceInputSchema.safeParse({
      projectName: '',
      inspectionDate: '2024-12-15',
      inspectorName: 'Officer',
      siteId: 'SITE-001',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty inspectorName', () => {
    const result = hsComplianceInputSchema.safeParse({
      projectName: 'Test',
      inspectionDate: '2024-12-15',
      inspectorName: '',
      siteId: 'SITE-001',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty siteId', () => {
    const result = hsComplianceInputSchema.safeParse({
      projectName: 'Test',
      inspectionDate: '2024-12-15',
      inspectorName: 'Officer',
      siteId: '',
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid check row', () => {
    const result = hsCheckRowSchema.safeParse({
      clause: 'OHS-001',
      description: 'PPE provided and worn',
      compliant: true,
      evidence: 'Photo evidence attached',
      responsiblePerson: 'J. Smith',
    })
    expect(result.success).toBe(true)
  })

  it('accepts row without evidence (optional)', () => {
    const result = hsCheckRowSchema.safeParse({
      clause: 'OHS-002',
      description: 'Scaffolding inspected',
      compliant: false,
      responsiblePerson: 'M. Jones',
    })
    expect(result.success).toBe(true)
  })

  it('rejects row with empty clause', () => {
    const result = hsCheckRowSchema.safeParse({
      clause: '',
      description: 'Test',
      compliant: true,
      responsiblePerson: 'Person',
    })
    expect(result.success).toBe(false)
  })

  it('rejects row with empty responsiblePerson', () => {
    const result = hsCheckRowSchema.safeParse({
      clause: 'OHS-001',
      description: 'PPE',
      compliant: true,
      responsiblePerson: '',
    })
    expect(result.success).toBe(false)
  })
})

describe('hs_compliance_v1 — per-row computation', () => {
  it('produces PASS/FAIL status per row', () => {
    const result = run(
      { projectName: 'Site A', inspectionDate: '2024-12-15', inspectorName: 'Officer A', siteId: 'S-001' },
      [
        { clause: 'OHS-001', description: 'PPE', compliant: true, responsiblePerson: 'Smith' },
        { clause: 'OHS-002', description: 'Scaffolding', compliant: false, responsiblePerson: 'Jones' },
      ],
    )
    expect(result.lineResults[0].status).toBe('PASS')
    expect(result.lineResults[1].status).toBe('FAIL')
  })

  it('includes compliant as numeric flag', () => {
    const result = run(
      { projectName: 'Site B', inspectionDate: '2024-12-15', inspectorName: 'Officer B', siteId: 'S-002' },
      [
        { clause: 'OHS-001', description: 'PPE', compliant: true, responsiblePerson: 'Smith' },
        { clause: 'OHS-003', description: 'Excavations', compliant: false, responsiblePerson: 'Brown' },
      ],
    )
    expect(result.lineResults[0].compliant).toBe(1)
    expect(result.lineResults[1].compliant).toBe(0)
  })
})

describe('hs_compliance_v1 — aggregate totals', () => {
  it('computes totalChecks, passCount, failCount, complianceScore', () => {
    const result = run(
      { projectName: 'Site C', inspectionDate: '2024-12-15', inspectorName: 'Officer C', siteId: 'S-003' },
      [
        { clause: 'OHS-001', description: 'PPE', compliant: true, responsiblePerson: 'A' },
        { clause: 'OHS-002', description: 'Scaffolding', compliant: true, responsiblePerson: 'B' },
        { clause: 'OHS-003', description: 'Excavations', compliant: true, responsiblePerson: 'C' },
        { clause: 'OHS-004', description: 'Fire extinguishers', compliant: false, responsiblePerson: 'D' },
        { clause: 'OHS-005', description: 'First aid', compliant: true, responsiblePerson: 'E' },
      ],
    )
    expect(result.aggregates.totalChecks).toBe(5)
    expect(result.aggregates.passCount).toBe(4)
    expect(result.aggregates.failCount).toBe(1)
    expect(result.aggregates.complianceScore).toBe(80)
  })

  it('handles all pass (100% compliance)', () => {
    const result = run(
      { projectName: 'Site D', inspectionDate: '2024-12-15', inspectorName: 'Officer D', siteId: 'S-004' },
      [
        { clause: 'OHS-001', description: 'PPE', compliant: true, responsiblePerson: 'A' },
        { clause: 'OHS-002', description: 'Scaffolding', compliant: true, responsiblePerson: 'B' },
      ],
    )
    expect(result.aggregates.complianceScore).toBe(100)
  })

  it('handles all fail (0% compliance)', () => {
    const result = run(
      { projectName: 'Site E', inspectionDate: '2024-12-15', inspectorName: 'Officer E', siteId: 'S-005' },
      [
        { clause: 'OHS-001', description: 'PPE', compliant: false, responsiblePerson: 'A' },
        { clause: 'OHS-002', description: 'Scaffolding', compliant: false, responsiblePerson: 'B' },
      ],
    )
    expect(result.aggregates.complianceScore).toBe(0)
  })
})

describe('hs_compliance_v1 — invalid row isolation', () => {
  it('excludes rows with invalid data and emits warnings', () => {
    const result = run(
      { projectName: 'Site F', inspectionDate: '2024-12-15', inspectorName: 'Officer F', siteId: 'S-006' },
      [
        { clause: 'OHS-001', description: 'PPE', compliant: true, responsiblePerson: 'A' },
        { clause: '', description: 'Invalid', compliant: true, responsiblePerson: 'B' }, // invalid empty clause
        { clause: 'OHS-003', description: 'Excavations', compliant: false, responsiblePerson: 'C' },
      ],
    )
    expect(result.lineResults.length).toBe(2)
    expect(result.warnings.some((w) => w.includes('Row 2 excluded'))).toBe(true)
  })
})

describe('hs_compliance_v1 — clause checks', () => {
  it('passes compliance threshold clause when ≥80%', () => {
    const result = run(
      { projectName: 'Site G', inspectionDate: '2024-12-15', inspectorName: 'Officer G', siteId: 'S-007' },
      [
        { clause: 'OHS-001', description: 'PPE', compliant: true, responsiblePerson: 'A' },
        { clause: 'OHS-002', description: 'Scaffolding', compliant: true, responsiblePerson: 'B' },
        { clause: 'OHS-003', description: 'Excavations', compliant: true, responsiblePerson: 'C' },
        { clause: 'OHS-004', description: 'Fire', compliant: true, responsiblePerson: 'D' },
        { clause: 'OHS-005', description: 'First aid', compliant: false, responsiblePerson: 'E' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'OHS-GEN-001')
    expect(clause?.outcome).toBe('pass')
  })

  it('fails compliance threshold clause when <80%', () => {
    const result = run(
      { projectName: 'Site H', inspectionDate: '2024-12-15', inspectorName: 'Officer H', siteId: 'S-008' },
      [
        { clause: 'OHS-001', description: 'PPE', compliant: true, responsiblePerson: 'A' },
        { clause: 'OHS-002', description: 'Scaffolding', compliant: false, responsiblePerson: 'B' },
        { clause: 'OHS-003', description: 'Excavations', compliant: false, responsiblePerson: 'C' },
        { clause: 'OHS-004', description: 'Fire', compliant: false, responsiblePerson: 'D' },
        { clause: 'OHS-005', description: 'First aid', compliant: false, responsiblePerson: 'E' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'OHS-GEN-001')
    expect(clause?.outcome).toBe('fail')
  })

  it('passes responsible-person clause when all non-compliant items have one', () => {
    const result = run(
      { projectName: 'Site I', inspectionDate: '2024-12-15', inspectorName: 'Officer I', siteId: 'S-009' },
      [
        { clause: 'OHS-001', description: 'PPE', compliant: false, responsiblePerson: 'Smith' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'OHS-GEN-002')
    expect(clause?.outcome).toBe('pass')
  })
})

describe('hs_compliance_v1 — registration', () => {
  it('is registered with correct toolId and method', () => {
    expect(getCalculatorDefinition('hs_compliance_v1')).toBe(hsComplianceV1)
    expect(hsComplianceV1.toolId).toBe('hs_compliance')
    expect(hsComplianceV1.method).toBe('clauseSet')
    expect(hsComplianceV1.status).toBe('full')
  })

  it('has scheduleSchema defined (clauseSet-based tool with rows)', () => {
    expect(hsComplianceV1.scheduleSchema).toBeDefined()
  })

  it('includes disclaimers', () => {
    expect(hsComplianceV1.disclaimers.length).toBeGreaterThan(0)
  })
})
