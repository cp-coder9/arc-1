import { describe, it, expect } from 'vitest'
import { runCalculator } from '@/services/toolbox/engine'
import { getCalculatorDefinition } from './definitionRegistry'
import {
  platformSettingsV1,
  platformSettingsInputSchema,
  platformSettingsRowSchema,
} from './platformSettings'

function run(input: unknown, rows: unknown[] = []) {
  return runCalculator(platformSettingsV1, input, rows, { tables: [] })
}

describe('platform_settings_v1 — schema validation', () => {
  it('accepts valid input', () => {
    const result = platformSettingsInputSchema.safeParse({
      adminUser: 'admin@test.com',
      configVersion: '1.0.0',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty configVersion', () => {
    const result = platformSettingsInputSchema.safeParse({
      adminUser: 'admin',
      configVersion: '',
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid row', () => {
    const result = platformSettingsRowSchema.safeParse({
      settingKey: 'max_upload_size',
      settingValue: '50MB',
      category: 'storage',
      lastModified: '2024-06-01',
      modifiedBy: 'admin',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty settingKey', () => {
    const result = platformSettingsRowSchema.safeParse({
      settingKey: '',
      settingValue: '50MB',
      category: 'storage',
      lastModified: '2024-06-01',
      modifiedBy: 'admin',
    })
    expect(result.success).toBe(false)
  })
})

describe('platform_settings_v1 — computation', () => {
  it('counts settings and categories', () => {
    const result = run(
      { adminUser: 'admin', configVersion: '1.0.0' },
      [
        { settingKey: 'max_upload', settingValue: '50MB', category: 'storage', lastModified: '2024-06-01', modifiedBy: 'admin' },
        { settingKey: 'session_timeout', settingValue: '30m', category: 'security', lastModified: '2024-06-01', modifiedBy: 'admin' },
        { settingKey: 'min_password_len', settingValue: '8', category: 'security', lastModified: '2024-06-01', modifiedBy: 'admin' },
      ],
    )
    expect(result.aggregates.totalSettings).toBe(3)
    expect(result.aggregates.categories).toBe(2)
  })
})

describe('platform_settings_v1 — clause checks', () => {
  it('passes when all settings have values', () => {
    const result = run(
      { adminUser: 'admin', configVersion: '1.0.0' },
      [
        { settingKey: 'max_upload', settingValue: '50MB', category: 'storage', lastModified: '2024-06-01', modifiedBy: 'admin' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'PS-001')
    expect(clause?.outcome).toBe('pass')
  })

  it('fails when a setting has empty value', () => {
    const result = run(
      { adminUser: 'admin', configVersion: '1.0.0' },
      [
        { settingKey: 'max_upload', settingValue: '', category: 'storage', lastModified: '2024-06-01', modifiedBy: 'admin' },
      ],
    )
    const clause = result.clauseResults.find((c) => c.clauseRef === 'PS-001')
    expect(clause?.outcome).toBe('fail')
  })
})

describe('platform_settings_v1 — registration', () => {
  it('is registered with correct toolId and status', () => {
    expect(getCalculatorDefinition('platform_settings_v1')).toBe(platformSettingsV1)
    expect(platformSettingsV1.toolId).toBe('platform_settings')
    expect(platformSettingsV1.status).toBe('full')
  })

  it('has scheduleSchema defined', () => {
    expect(platformSettingsV1.scheduleSchema).toBeDefined()
  })
})
