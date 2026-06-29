import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { SEED_GUIDELINE_TABLES } from '@/services/toolbox/tables'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  workforceTimesheetV1,
  timesheetInputSchema,
  timesheetRowSchema,
} from './workforceTimesheet'

function run(input: unknown, rows: unknown[] = []) {
  return runCalculator(workforceTimesheetV1, input, rows, { tables: SEED_GUIDELINE_TABLES })
}

describe('workforce_timesheet_v1 — schema validation', () => {
  it('accepts valid input', () => {
    const result = timesheetInputSchema.safeParse({
      projectName: 'Site Alpha',
      weekEnding: '2024-12-20',
      payePercent: 25,
      uifPercent: 1,
      sdlPercent: 1,
    })
    expect(result.success).toBe(true)
  })

  it('applies default deduction rates', () => {
    const result = timesheetInputSchema.safeParse({
      projectName: 'Site Alpha',
      weekEnding: '2024-12-20',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.payePercent).toBe(25)
      expect(result.data.uifPercent).toBe(1)
      expect(result.data.sdlPercent).toBe(1)
    }
  })

  it('rejects empty projectName', () => {
    const result = timesheetInputSchema.safeParse({
      projectName: '',
      weekEnding: '2024-12-20',
    })
    expect(result.success).toBe(false)
  })

  it('rejects payePercent over 100', () => {
    const result = timesheetInputSchema.safeParse({
      projectName: 'Test',
      weekEnding: '2024-12-20',
      payePercent: 110,
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid schedule row', () => {
    const result = timesheetRowSchema.safeParse({
      workerName: 'John Moyo',
      grade: 'artisan',
      normalHours: 40,
      overtimeHours: 5,
      hourlyRate: 120,
    })
    expect(result.success).toBe(true)
  })

  it('rejects row with empty workerName', () => {
    const result = timesheetRowSchema.safeParse({
      workerName: '',
      grade: 'labourer',
      normalHours: 40,
      overtimeHours: 0,
      hourlyRate: 80,
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid grade', () => {
    const result = timesheetRowSchema.safeParse({
      workerName: 'Test Worker',
      grade: 'manager',
      normalHours: 40,
      overtimeHours: 0,
      hourlyRate: 80,
    })
    expect(result.success).toBe(false)
  })
})

describe('workforce_timesheet_v1 — per-row computation', () => {
  it('computes normalCost, overtimeCost (1.5×), totalCost per row', () => {
    const result = run(
      { projectName: 'Site A', weekEnding: '2024-12-20', payePercent: 25, uifPercent: 1, sdlPercent: 1 },
      [
        { workerName: 'Worker A', grade: 'artisan', normalHours: 40, overtimeHours: 8, hourlyRate: 100 },
      ],
    )
    // normalCost = 40 × 100 = 4000
    // overtimeCost = 8 × 100 × 1.5 = 1200
    // totalCost = 5200
    expect(result.lineResults[0].normalCost).toBe(4000)
    expect(result.lineResults[0].overtimeCost).toBe(1200)
    expect(result.lineResults[0].totalCost).toBe(5200)
  })

  it('handles zero overtime', () => {
    const result = run(
      { projectName: 'Site B', weekEnding: '2024-12-20', payePercent: 25, uifPercent: 1, sdlPercent: 1 },
      [
        { workerName: 'Worker B', grade: 'labourer', normalHours: 45, overtimeHours: 0, hourlyRate: 80 },
      ],
    )
    expect(result.lineResults[0].normalCost).toBe(3600)
    expect(result.lineResults[0].overtimeCost).toBe(0)
    expect(result.lineResults[0].totalCost).toBe(3600)
  })
})

describe('workforce_timesheet_v1 — aggregate totals', () => {
  it('computes totalHours, totalCost, statutory deductions, netPayable', () => {
    const result = run(
      { projectName: 'Site C', weekEnding: '2024-12-20', payePercent: 25, uifPercent: 1, sdlPercent: 1 },
      [
        { workerName: 'Worker A', grade: 'artisan', normalHours: 40, overtimeHours: 0, hourlyRate: 100 },
        { workerName: 'Worker B', grade: 'labourer', normalHours: 40, overtimeHours: 0, hourlyRate: 80 },
      ],
    )
    // totalHours = 40 + 40 = 80
    // totalCost = 4000 + 3200 = 7200
    // payeAmount = 7200 × 0.25 = 1800
    // uifAmount = 7200 × 0.01 = 72
    // sdlAmount = 7200 × 0.01 = 72
    // netPayable = 7200 - 1800 - 72 - 72 = 5256
    expect(result.aggregates.totalHours).toBe(80)
    expect(result.aggregates.totalCost).toBe(7200)
    expect(result.aggregates.payeAmount).toBe(1800)
    expect(result.aggregates.uifAmount).toBe(72)
    expect(result.aggregates.sdlAmount).toBe(72)
    expect(result.aggregates.netPayable).toBe(5256)
  })
})

describe('workforce_timesheet_v1 — invalid row isolation', () => {
  it('excludes rows with invalid data and emits warnings', () => {
    const result = run(
      { projectName: 'Site D', weekEnding: '2024-12-20', payePercent: 25, uifPercent: 1, sdlPercent: 1 },
      [
        { workerName: 'Valid Worker', grade: 'foreman', normalHours: 40, overtimeHours: 2, hourlyRate: 150 },
        { workerName: '', grade: 'labourer', normalHours: 40, overtimeHours: 0, hourlyRate: 80 }, // invalid
        { workerName: 'Another Valid', grade: 'supervisor', normalHours: 35, overtimeHours: 0, hourlyRate: 200 },
      ],
    )
    expect(result.lineResults.length).toBe(2)
    expect(result.warnings.some((w) => w.includes('Row 2 excluded'))).toBe(true)
  })
})

describe('workforce_timesheet_v1 — clause checks', () => {
  it('passes overtime clause when all workers ≤10hrs OT', () => {
    const result = run(
      { projectName: 'Site E', weekEnding: '2024-12-20', payePercent: 25, uifPercent: 1, sdlPercent: 1 },
      [
        { workerName: 'Worker', grade: 'artisan', normalHours: 40, overtimeHours: 8, hourlyRate: 100 },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'WFT-001')
    expect(clause?.outcome).toBe('pass')
  })

  it('advisory when worker exceeds 10hrs overtime', () => {
    const result = run(
      { projectName: 'Site F', weekEnding: '2024-12-20', payePercent: 25, uifPercent: 1, sdlPercent: 1 },
      [
        { workerName: 'Overtime Worker', grade: 'artisan', normalHours: 40, overtimeHours: 15, hourlyRate: 100 },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'WFT-001')
    expect(clause?.outcome).toBe('advisory')
  })

  it('passes statutory deductions clause when deductions configured', () => {
    const result = run(
      { projectName: 'Site G', weekEnding: '2024-12-20', payePercent: 25, uifPercent: 1, sdlPercent: 1 },
      [
        { workerName: 'Worker', grade: 'labourer', normalHours: 40, overtimeHours: 0, hourlyRate: 80 },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'WFT-002')
    expect(clause?.outcome).toBe('pass')
  })

  it('fails statutory deductions clause when all zero', () => {
    const result = run(
      { projectName: 'Site H', weekEnding: '2024-12-20', payePercent: 0, uifPercent: 0, sdlPercent: 0 },
      [
        { workerName: 'Worker', grade: 'labourer', normalHours: 40, overtimeHours: 0, hourlyRate: 80 },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'WFT-002')
    expect(clause?.outcome).toBe('fail')
  })
})

describe('workforce_timesheet_v1 — registration', () => {
  it('is registered with correct toolId and method', () => {
    expect(getCalculatorDefinition('workforce_timesheet_v1')).toBe(workforceTimesheetV1)
    expect(workforceTimesheetV1.toolId).toBe('workforce_timesheet')
    expect(workforceTimesheetV1.method).toBe('time')
    expect(workforceTimesheetV1.status).toBe('full')
  })

  it('has scheduleSchema defined (schedule-based tool)', () => {
    expect(workforceTimesheetV1.scheduleSchema).toBeDefined()
  })

  it('includes disclaimers', () => {
    expect(workforceTimesheetV1.disclaimers.length).toBeGreaterThan(0)
  })
})
