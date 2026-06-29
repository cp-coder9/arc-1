import React from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { z } from 'zod'

import StandaloneToolRunner from './StandaloneToolRunner'
import type { StandaloneToolDef } from '@/types/standaloneToolTypes'
import type { CalculatorDefinition } from '@/services/toolbox/types'
import {
  registerCalculatorDefinition,
  resetCalculatorDefinitions,
} from '@/services/toolbox/definitions'

function makeTool(overrides: Partial<StandaloneToolDef> = {}): StandaloneToolDef {
  return {
    id: 'demo_tool',
    label: 'Demo Tool',
    category: 'general',
    description: 'A demo standalone tool',
    roles: ['architect'],
    icon: 'Calculator',
    route: 'demo_tool',
    standaloneOnly: false,
    requiresInput: true,
    canExport: true,
    canAssignToProject: true,
    recentRunsCount: 0,
    tags: ['demo'],
    ...overrides,
  }
}

function makeDefinition(): CalculatorDefinition {
  return {
    id: 'demo_def_v1',
    toolId: 'demo_tool',
    title: 'Demo Calculator Definition',
    method: 'area',
    inputSchema: z.object({
      area: z.number({ invalid_type_error: 'Area is required' }).min(1),
    }),
    tableRefs: [],
    compute: (ctx) => ({
      lineResults: [],
      aggregates: { total: Number(ctx.input.area) * 2 },
      clauseResults: [],
      sourceVersions: [],
      disclaimers: ['Advisory only — professional sign-off required.'],
      warnings: [],
    }),
    reportTemplateId: 'default',
    source: { guideline: 'Demo Guideline', version: '1.0', status: 'indicative' },
    disclaimers: ['Advisory only — professional sign-off required.'],
    status: 'full',
  }
}

const noopProps = {
  onBack: vi.fn(),
  onSave: vi.fn(),
  onAssign: vi.fn(),
  onExport: vi.fn(),
  latestRun: null,
}

describe('StandaloneToolRunner delegation', () => {
  beforeEach(() => {
    resetCalculatorDefinitions()
  })
  afterEach(() => {
    resetCalculatorDefinitions()
    vi.clearAllMocks()
  })

  test('delegates to the definition-driven runner when calculatorDefinitionId is registered', () => {
    registerCalculatorDefinition(makeDefinition())
    const tool = makeTool({ calculatorDefinitionId: 'demo_def_v1' })

    render(<StandaloneToolRunner tool={tool} {...noopProps} />)

    // Definition-driven path: shows the definition title + clause-aware subtitle + Compute.
    expect(screen.getByText('Demo Calculator Definition')).toBeInTheDocument()
    expect(screen.getByText(/clause-aware calculator/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /compute/i })).toBeInTheDocument()

    // Legacy subtitle must NOT be present.
    expect(screen.queryByText(/no project context required/i)).not.toBeInTheDocument()
  })

  test('falls back to the legacy runner when the tool has no calculatorDefinitionId', () => {
    const tool = makeTool()

    render(<StandaloneToolRunner tool={tool} {...noopProps} />)

    // Legacy path: shows the tool label heading + legacy subtitle, not the definition runner.
    expect(screen.getByRole('heading', { name: 'Demo Tool' })).toBeInTheDocument()
    expect(screen.getByText(/no project context required/i)).toBeInTheDocument()
    expect(screen.queryByText(/clause-aware calculator/i)).not.toBeInTheDocument()
  })

  test('falls back to the legacy runner when calculatorDefinitionId is set but not registered', () => {
    const tool = makeTool({ calculatorDefinitionId: 'missing_def_v9' })

    render(<StandaloneToolRunner tool={tool} {...noopProps} />)

    expect(screen.getByText(/no project context required/i)).toBeInTheDocument()
    expect(screen.queryByText(/clause-aware calculator/i)).not.toBeInTheDocument()
  })
})
