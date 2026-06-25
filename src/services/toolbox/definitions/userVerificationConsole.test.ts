import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  userVerificationConsoleV1,
  userVerificationConsoleInputSchema,
  userVerificationConsoleRowSchema,
} from './userVerificationConsole'

function run(input: unknown, rows: unknown[] = []) {
  return runCalculator(userVerificationConsoleV1, input, rows, { tables: [] })
}

describe('user_verification_console_v1 — schema validation', () => {
  it('accepts valid input', () => {
    const result = userVerificationConsoleInputSchema.safeParse({
      adminUser: 'admin@test.com',
      queueDate: '2024-06-15',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty queueDate', () => {
    const result = userVerificationConsoleInputSchema.safeParse({
      adminUser: 'admin',
      queueDate: '',
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid row', () => {
    const result = userVerificationConsoleRowSchema.safeParse({
      userId: 'usr_001',
      userName: 'John Doe',
      verificationType: 'SACAP',
      status: 'pending',
      submittedDate: '2024-06-01',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid status', () => {
    const result = userVerificationConsoleRowSchema.safeParse({
      userId: 'usr_001',
      userName: 'John',
      verificationType: 'SACAP',
      status: 'unknown',
      submittedDate: '2024-06-01',
    })
    expect(result.success).toBe(false)
  })
})

describe('user_verification_console_v1 — computation', () => {
  it('counts items by status', () => {
    const result = run(
      { adminUser: 'admin', queueDate: '2024-06-15' },
      [
        { userId: 'u1', userName: 'Alice', verificationType: 'SACAP', status: 'pending', submittedDate: '2024-06-10' },
        { userId: 'u2', userName: 'Bob', verificationType: 'ECSA', status: 'verified', submittedDate: '2024-06-01' },
        { userId: 'u3', userName: 'Carol', verificationType: 'SACAP', status: 'rejected', submittedDate: '2024-06-05' },
        { userId: 'u4', userName: 'Dave', verificationType: 'NHBRC', status: 'pending', submittedDate: '2024-06-12' },
      ],
    )
    expect(result.aggregates.totalItems).toBe(4)
    expect(result.aggregates.pendingCount).toBe(2)
    expect(result.aggregates.verifiedCount).toBe(1)
    expect(result.aggregates.rejectedCount).toBe(1)
  })

  it('computes average days in queue for pending items', () => {
    const result = run(
      { adminUser: 'admin', queueDate: '2024-06-15' },
      [
        { userId: 'u1', userName: 'Alice', verificationType: 'SACAP', status: 'pending', submittedDate: '2024-06-10' },
        { userId: 'u2', userName: 'Bob', verificationType: 'ECSA', status: 'pending', submittedDate: '2024-06-12' },
      ],
    )
    // Alice: 5 days, Bob: 3 days → avg ~4 days
    expect(result.aggregates.avgDaysInQueue).toBe(4)
  })
})

describe('user_verification_console_v1 — clause checks', () => {
  it('passes when no items pending > 7 days', () => {
    const result = run(
      { adminUser: 'admin', queueDate: '2024-06-15' },
      [
        { userId: 'u1', userName: 'Alice', verificationType: 'SACAP', status: 'pending', submittedDate: '2024-06-10' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'UVC-001')
    expect(clause?.outcome).toBe('pass')
  })

  it('fails when items pending > 7 days', () => {
    const result = run(
      { adminUser: 'admin', queueDate: '2024-06-15' },
      [
        { userId: 'u1', userName: 'Alice', verificationType: 'SACAP', status: 'pending', submittedDate: '2024-06-01' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'UVC-001')
    expect(clause?.outcome).toBe('fail')
  })

  it('ignores non-pending items for overdue check', () => {
    const result = run(
      { adminUser: 'admin', queueDate: '2024-06-15' },
      [
        { userId: 'u1', userName: 'Alice', verificationType: 'SACAP', status: 'verified', submittedDate: '2024-01-01' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'UVC-001')
    expect(clause?.outcome).toBe('pass')
  })
})

describe('user_verification_console_v1 — registration', () => {
  it('is registered with correct toolId and status', () => {
    expect(getCalculatorDefinition('user_verification_console_v1')).toBe(userVerificationConsoleV1)
    expect(userVerificationConsoleV1.toolId).toBe('user_verification_console')
    expect(userVerificationConsoleV1.status).toBe('full')
  })

  it('has scheduleSchema defined', () => {
    expect(userVerificationConsoleV1.scheduleSchema).toBeDefined()
  })
})
