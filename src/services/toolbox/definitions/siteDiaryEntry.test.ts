import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  siteDiaryEntryV1,
  diaryInputSchema,
  diaryRowSchema,
} from './siteDiaryEntry'

function run(input: unknown, rows: unknown[] = []) {
  return runCalculator(siteDiaryEntryV1, input, rows, { tables: [] })
}

describe('site_diary_entry_v1 — schema validation', () => {
  it('accepts valid input', () => {
    const result = diaryInputSchema.safeParse({
      projectName: 'Highway Extension',
      siteForeman: 'James Sithole',
      weekEnding: '2024-12-20',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty projectName', () => {
    const result = diaryInputSchema.safeParse({
      projectName: '',
      siteForeman: 'James',
      weekEnding: '2024-12-20',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty siteForeman', () => {
    const result = diaryInputSchema.safeParse({
      projectName: 'Test',
      siteForeman: '',
      weekEnding: '2024-12-20',
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid diary row', () => {
    const result = diaryRowSchema.safeParse({
      date: '2024-12-16',
      weather: 'fine',
      workersOnSite: 25,
      hoursWorked: 8,
      activitiesCompleted: 'Foundation excavation completed',
      delaysReported: false,
    })
    expect(result.success).toBe(true)
  })

  it('accepts row with delay description', () => {
    const result = diaryRowSchema.safeParse({
      date: '2024-12-17',
      weather: 'rain',
      workersOnSite: 10,
      hoursWorked: 4,
      activitiesCompleted: 'Concrete pour delayed',
      delaysReported: true,
      delayDescription: 'Rain stopped concrete pour — rescheduled to Thursday',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid weather type', () => {
    const result = diaryRowSchema.safeParse({
      date: '2024-12-16',
      weather: 'sunny',
      workersOnSite: 25,
      hoursWorked: 8,
      activitiesCompleted: 'Work done',
      delaysReported: false,
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty activitiesCompleted', () => {
    const result = diaryRowSchema.safeParse({
      date: '2024-12-16',
      weather: 'fine',
      workersOnSite: 25,
      hoursWorked: 8,
      activitiesCompleted: '',
      delaysReported: false,
    })
    expect(result.success).toBe(false)
  })
})

describe('site_diary_entry_v1 — per-row computation', () => {
  it('computes worker-hours per row', () => {
    const result = run(
      { projectName: 'Site A', siteForeman: 'Foreman A', weekEnding: '2024-12-20' },
      [
        { date: '2024-12-16', weather: 'fine', workersOnSite: 20, hoursWorked: 8, activitiesCompleted: 'Excavation', delaysReported: false },
      ],
    )
    expect(result.lineResults[0].workerHours).toBe(160)
  })

  it('records delay status as numeric flag', () => {
    const result = run(
      { projectName: 'Site B', siteForeman: 'Foreman B', weekEnding: '2024-12-20' },
      [
        { date: '2024-12-17', weather: 'rain', workersOnSite: 10, hoursWorked: 4, activitiesCompleted: 'Partial work', delaysReported: true, delayDescription: 'Rain delay' },
      ],
    )
    expect(result.lineResults[0].delaysReported).toBe(1)
  })
})

describe('site_diary_entry_v1 — aggregate totals', () => {
  it('computes totalWorkdays, totalWorkerHours, totalDelays, averageWorkersPerDay', () => {
    const result = run(
      { projectName: 'Site C', siteForeman: 'Foreman C', weekEnding: '2024-12-20' },
      [
        { date: '2024-12-16', weather: 'fine', workersOnSite: 20, hoursWorked: 8, activitiesCompleted: 'Foundation', delaysReported: false },
        { date: '2024-12-17', weather: 'overcast', workersOnSite: 22, hoursWorked: 8, activitiesCompleted: 'Brickwork', delaysReported: false },
        { date: '2024-12-18', weather: 'rain', workersOnSite: 10, hoursWorked: 4, activitiesCompleted: 'Partial', delaysReported: true, delayDescription: 'Rain' },
        { date: '2024-12-19', weather: 'fine', workersOnSite: 25, hoursWorked: 9, activitiesCompleted: 'Steelwork', delaysReported: false },
        { date: '2024-12-20', weather: 'fine', workersOnSite: 23, hoursWorked: 8, activitiesCompleted: 'Plastering', delaysReported: false },
      ],
    )
    expect(result.aggregates.totalWorkdays).toBe(5)
    // totalWorkerHours = 160 + 176 + 40 + 225 + 184 = 785
    expect(result.aggregates.totalWorkerHours).toBe(785)
    expect(result.aggregates.totalDelays).toBe(1)
    // avg = (20+22+10+25+23)/5 = 100/5 = 20
    expect(result.aggregates.averageWorkersPerDay).toBe(20)
  })
})

describe('site_diary_entry_v1 — invalid row isolation', () => {
  it('excludes rows with invalid data and emits warnings', () => {
    const result = run(
      { projectName: 'Site D', siteForeman: 'Foreman D', weekEnding: '2024-12-20' },
      [
        { date: '2024-12-16', weather: 'fine', workersOnSite: 20, hoursWorked: 8, activitiesCompleted: 'Work done', delaysReported: false },
        { date: '2024-12-17', weather: 'fine', workersOnSite: 15, hoursWorked: 8, activitiesCompleted: '', delaysReported: false }, // invalid empty activities
        { date: '2024-12-18', weather: 'overcast', workersOnSite: 18, hoursWorked: 7, activitiesCompleted: 'More work', delaysReported: false },
      ],
    )
    expect(result.lineResults.length).toBe(2)
    expect(result.warnings.some((w) => w.includes('Row 2 excluded'))).toBe(true)
  })
})

describe('site_diary_entry_v1 — clause checks', () => {
  it('passes all-days-logged clause when ≥5 entries', () => {
    const result = run(
      { projectName: 'Site E', siteForeman: 'Foreman E', weekEnding: '2024-12-20' },
      [
        { date: '2024-12-16', weather: 'fine', workersOnSite: 20, hoursWorked: 8, activitiesCompleted: 'Day 1', delaysReported: false },
        { date: '2024-12-17', weather: 'fine', workersOnSite: 20, hoursWorked: 8, activitiesCompleted: 'Day 2', delaysReported: false },
        { date: '2024-12-18', weather: 'fine', workersOnSite: 20, hoursWorked: 8, activitiesCompleted: 'Day 3', delaysReported: false },
        { date: '2024-12-19', weather: 'fine', workersOnSite: 20, hoursWorked: 8, activitiesCompleted: 'Day 4', delaysReported: false },
        { date: '2024-12-20', weather: 'fine', workersOnSite: 20, hoursWorked: 8, activitiesCompleted: 'Day 5', delaysReported: false },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'SDR-001')
    expect(clause?.outcome).toBe('pass')
  })

  it('advisory when < 5 entries', () => {
    const result = run(
      { projectName: 'Site F', siteForeman: 'Foreman F', weekEnding: '2024-12-20' },
      [
        { date: '2024-12-16', weather: 'fine', workersOnSite: 20, hoursWorked: 8, activitiesCompleted: 'Day 1', delaysReported: false },
        { date: '2024-12-17', weather: 'fine', workersOnSite: 20, hoursWorked: 8, activitiesCompleted: 'Day 2', delaysReported: false },
        { date: '2024-12-18', weather: 'fine', workersOnSite: 20, hoursWorked: 8, activitiesCompleted: 'Day 3', delaysReported: false },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'SDR-001')
    expect(clause?.outcome).toBe('advisory')
  })

  it('passes delays-documented clause when all delays have descriptions', () => {
    const result = run(
      { projectName: 'Site G', siteForeman: 'Foreman G', weekEnding: '2024-12-20' },
      [
        { date: '2024-12-16', weather: 'rain', workersOnSite: 10, hoursWorked: 4, activitiesCompleted: 'Partial', delaysReported: true, delayDescription: 'Rain stopped work' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'SDR-002')
    expect(clause?.outcome).toBe('pass')
  })

  it('advisory when delays lack descriptions', () => {
    const result = run(
      { projectName: 'Site H', siteForeman: 'Foreman H', weekEnding: '2024-12-20' },
      [
        { date: '2024-12-16', weather: 'storm', workersOnSite: 0, hoursWorked: 0, activitiesCompleted: 'No work', delaysReported: true },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'SDR-002')
    expect(clause?.outcome).toBe('advisory')
  })
})

describe('site_diary_entry_v1 — registration', () => {
  it('is registered with correct toolId and method', () => {
    expect(getCalculatorDefinition('site_diary_entry_v1')).toBe(siteDiaryEntryV1)
    expect(siteDiaryEntryV1.toolId).toBe('site_diary_entry')
    expect(siteDiaryEntryV1.method).toBe('time')
    expect(siteDiaryEntryV1.status).toBe('full')
  })

  it('has scheduleSchema defined (schedule-based tool)', () => {
    expect(siteDiaryEntryV1.scheduleSchema).toBeDefined()
  })

  it('includes disclaimers', () => {
    expect(siteDiaryEntryV1.disclaimers.length).toBeGreaterThan(0)
  })
})
