// Platform Settings calculator definition
//
// `platform_settings_v1` (toolId `platform_settings`) — a schedule-based admin view for
// platform configuration management. Each row represents a setting with key, value,
// category, last modified date, and modifier identity.
//
// Computes: total settings, settings by category.
// Clause checks: all settings have values.
//
// Requirements: 3.2, 3.3.

import { z } from 'zod'
import type {
  CalculationResult,
  CalculatorDefinition,
  ClauseCheckDef,
  ClauseResult,
  ComputeContext,
} from '@/services/toolbox/types'
import { evaluateClauseSet } from '@/services/toolbox/engine'
import { registerCalculatorDefinition } from './definitionRegistry'

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export interface PlatformSettingsRow {
  settingKey: string
  settingValue: string
  category: string
  lastModified: string
  modifiedBy: string
}

export interface PlatformSettingsInput {
  adminUser: string
  configVersion: string
}

// ----------------------------------------------------------------------------
// Schemas
// ----------------------------------------------------------------------------

export const platformSettingsRowSchema = z.object({
  settingKey: z.string().min(1),
  settingValue: z.string(),
  category: z.string().min(1),
  lastModified: z.string().min(1),
  modifiedBy: z.string().min(1),
})

export const platformSettingsInputSchema = z.object({
  adminUser: z.string().min(1),
  configVersion: z.string().min(1),
})

// ----------------------------------------------------------------------------
// Clause set
// ----------------------------------------------------------------------------

export const platformSettingsClauseSet: ClauseCheckDef<PlatformSettingsInput, PlatformSettingsRow>[] = [
  {
    clauseRef: 'PS-001',
    label: 'All settings have values',
    evaluate: (ctx) => {
      const emptySettings = ctx.rows.filter((r) => r.settingValue === undefined || r.settingValue.trim() === '')
      return {
        outcome: emptySettings.length === 0 ? 'pass' : 'fail',
        threshold: '0 settings without values',
        actual: `${emptySettings.length} setting(s) without values`,
        note:
          emptySettings.length > 0
            ? `Settings missing values: ${emptySettings.map((r) => r.settingKey).join(', ')}`
            : undefined,
      }
    },
  },
]

// ----------------------------------------------------------------------------
// Compute
// ----------------------------------------------------------------------------

const DISCLAIMERS = [
  'Platform configuration — changes to settings may affect all platform users.',
]

function compute(ctx: ComputeContext<PlatformSettingsInput, PlatformSettingsRow>): CalculationResult {
  const { input, rows } = ctx
  const warnings: string[] = []

  const lineResults = rows.map((row) => ({
    settingKey: row.settingKey,
    settingValue: row.settingValue,
    category: row.category,
    lastModified: row.lastModified,
    modifiedBy: row.modifiedBy,
  }))

  // Group by category
  const categoryCounts: Record<string, number> = {}
  for (const row of rows) {
    categoryCounts[row.category] = (categoryCounts[row.category] || 0) + 1
  }

  // Clause evaluation
  const { clauseResults, complianceScore } = evaluateClauseSet(platformSettingsClauseSet, ctx)

  return {
    lineResults,
    aggregates: {
      adminUser: input.adminUser,
      configVersion: input.configVersion,
      totalSettings: rows.length,
      categories: Object.keys(categoryCounts).length,
      categorySummary: JSON.stringify(categoryCounts),
    },
    clauseResults: clauseResults as ClauseResult[],
    complianceScore,
    sourceVersions: [],
    disclaimers: DISCLAIMERS,
    warnings,
  }
}

// ----------------------------------------------------------------------------
// Definition
// ----------------------------------------------------------------------------

export const platformSettingsV1: CalculatorDefinition<PlatformSettingsInput, PlatformSettingsRow> =
  registerCalculatorDefinition<PlatformSettingsInput, PlatformSettingsRow>({
    id: 'platform_settings_v1',
    toolId: 'platform_settings',
    title: 'Platform Configuration Console',
    method: 'hybrid',
    inputSchema: platformSettingsInputSchema,
    scheduleSchema: platformSettingsRowSchema,
    tableRefs: [],
    clauseSet: platformSettingsClauseSet,
    compute,
    reportTemplateId: 'default',
    source: {
      guideline: 'Platform Configuration Policy',
      version: '2024',
      status: 'indicative',
    },
    disclaimers: DISCLAIMERS,
    status: 'full',
  })
