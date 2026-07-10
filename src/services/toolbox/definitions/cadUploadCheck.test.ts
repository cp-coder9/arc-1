import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { SEED_GUIDELINE_TABLES } from '@/services/toolbox/tables'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  cadUploadCheckV1,
  cadUploadInputSchema,
} from './cadUploadCheck'

function run(input: unknown) {
  return runCalculator(cadUploadCheckV1, input, [], { tables: SEED_GUIDELINE_TABLES })
}

describe('cadUploadCheck schema validation', () => {
  it('accepts valid input', () => {
    const result = cadUploadInputSchema.safeParse({
      fileFormat: 'dwg',
      fileSizeMB: 15,
      layerNamingFollowed: true,
      georeferenced: false,
      drawingNumber: 'A-101',
      revision: 'A',
      isSitePlan: false,
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty file format', () => {
    const result = cadUploadInputSchema.safeParse({
      fileFormat: '',
      fileSizeMB: 15,
      layerNamingFollowed: true,
      georeferenced: false,
      drawingNumber: 'A-101',
      revision: 'A',
      isSitePlan: false,
    })
    expect(result.success).toBe(false)
  })
})

describe('cad_upload_check_v1 — registration', () => {
  it('is registered with correct toolId and table refs', () => {
    expect(getCalculatorDefinition('cad_upload_check_v1')).toBe(cadUploadCheckV1)
    expect(cadUploadCheckV1.toolId).toBe('cad_upload_check')
    expect(cadUploadCheckV1.method).toBe('clauseSet')
    expect(cadUploadCheckV1.status).toBe('full')
    expect(cadUploadCheckV1.tableRefs).toContain('cad_upload_standards')
  })
})

describe('cad_upload_check_v1 — clause checks', () => {
  it('passes all clauses for a valid DWG file', () => {
    const result = run({
      fileFormat: 'dwg',
      fileSizeMB: 20,
      layerNamingFollowed: true,
      georeferenced: false,
      drawingNumber: 'A-101',
      revision: 'A',
      isSitePlan: false,
    })
    expect(result.complianceScore).toBe(100)
    expect(result.clauseResults.find((c) => c.clauseRef === 'CAD 1.1')?.outcome).toBe('pass')
    expect(result.clauseResults.find((c) => c.clauseRef === 'CAD 1.2')?.outcome).toBe('pass')
    expect(result.clauseResults.find((c) => c.clauseRef === 'CAD 1.3')?.outcome).toBe('pass')
    expect(result.clauseResults.find((c) => c.clauseRef === 'CAD 1.5')?.outcome).toBe('pass')
    expect(result.disclaimers.length).toBeGreaterThan(0)
  })

  it('fails when file size exceeds limit', () => {
    const result = run({
      fileFormat: 'pdf',
      fileSizeMB: 30, // max is 25MB for PDF
      layerNamingFollowed: false,
      georeferenced: false,
      drawingNumber: 'A-01',
      revision: 'B',
      isSitePlan: false,
    })
    expect(result.clauseResults.find((c) => c.clauseRef === 'CAD 1.2')?.outcome).toBe('fail')
  })

  it('fails layer naming for DWG when not followed', () => {
    const result = run({
      fileFormat: 'dwg',
      fileSizeMB: 10,
      layerNamingFollowed: false, // required for DWG
      georeferenced: false,
      drawingNumber: 'A-01',
      revision: 'A',
      isSitePlan: false,
    })
    expect(result.clauseResults.find((c) => c.clauseRef === 'CAD 1.3')?.outcome).toBe('fail')
  })

  it('layer naming is advisory for PDF (not required)', () => {
    const result = run({
      fileFormat: 'pdf',
      fileSizeMB: 5,
      layerNamingFollowed: false,
      georeferenced: false,
      drawingNumber: 'A-01',
      revision: '01',
      isSitePlan: false,
    })
    expect(result.clauseResults.find((c) => c.clauseRef === 'CAD 1.3')?.outcome).toBe('advisory')
  })

  it('fails georeference for site plan when missing', () => {
    const result = run({
      fileFormat: 'dwg',
      fileSizeMB: 10,
      layerNamingFollowed: true,
      georeferenced: false, // required for site plans
      drawingNumber: 'S-01',
      revision: 'A',
      isSitePlan: true,
    })
    expect(result.clauseResults.find((c) => c.clauseRef === 'CAD 1.4')?.outcome).toBe('fail')
  })

  it('georeference is advisory for non-site plans', () => {
    const result = run({
      fileFormat: 'dwg',
      fileSizeMB: 10,
      layerNamingFollowed: true,
      georeferenced: false,
      drawingNumber: 'A-01',
      revision: 'A',
      isSitePlan: false,
    })
    expect(result.clauseResults.find((c) => c.clauseRef === 'CAD 1.4')?.outcome).toBe('advisory')
  })

  it('fails invalid revision format', () => {
    const result = run({
      fileFormat: 'dwg',
      fileSizeMB: 10,
      layerNamingFollowed: true,
      georeferenced: false,
      drawingNumber: 'A-01',
      revision: 'invalid revision!!',
      isSitePlan: false,
    })
    expect(result.clauseResults.find((c) => c.clauseRef === 'CAD 1.5')?.outcome).toBe('fail')
  })

  it('throws for unknown file format', () => {
    expect(() =>
      run({
        fileFormat: 'xyz',
        fileSizeMB: 10,
        layerNamingFollowed: true,
        georeferenced: false,
        drawingNumber: 'A-01',
        revision: 'A',
        isSitePlan: false,
      }),
    ).toThrow()
  })
})

describe('cad_upload_check_v1 — source traceability', () => {
  it('includes source version in result', () => {
    const result = run({
      fileFormat: 'dwg',
      fileSizeMB: 10,
      layerNamingFollowed: true,
      georeferenced: false,
      drawingNumber: 'A-01',
      revision: 'A',
      isSitePlan: false,
    })
    expect(result.sourceVersions).toContainEqual(expect.objectContaining({
      guideline: 'cad_upload_standards',
      version: '2024.1',
    }))
  })
})
