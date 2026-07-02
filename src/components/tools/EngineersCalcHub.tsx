// Engineer's Calculation Hub — Main Workspace Component
//
// Multi-discipline engineering calculator workspace with sidebar navigation,
// dynamic input forms, results/derivation display, run history, and export.
//
// Design reference: .kiro/specs/engineers-calculation-hub/design.md
// Requirements: 1.1–1.7, 2.1–2.8, 4.1–4.8, 5.1–5.7, 6.1–6.6, 7.1–7.6, 19.3

import { useState, useMemo, useRef, useCallback } from 'react'
import { z } from 'zod'
import {
  Building2,
  Ruler,
  Wind,
  Droplets,
  Flame,
  Zap,
  Wrench,
  ArrowRightLeft,
  ShieldAlert,
  FileText,
  FolderKanban,
  Send,
  History,
  type LucideIcon,
} from 'lucide-react'
import type { UserProfile } from '@/types'
import type { DisciplineGroup, CalcHubCalculatorMeta, CalculatorOutput } from '@/services/calcHub'
import { getAllCalculators, getCalculatorsByDiscipline, getCalculator } from '@/services/calcHub'
import {
  persistCalcRun,
  assignRunToProject,
  pushRunToSpecForge,
  auditCalcEvent,
} from '@/services/calcHub/calcHubIntegration'
import type { StandaloneToolRun } from '@/services/calcHub/calcHubIntegration'
import { generateCalcSheetHtml } from '@/services/calcHub/calcHubPdfExport'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Roles permitted to access the Engineer's Calculation Hub */
const ALLOWED_ROLES = [
  'engineer',
  'architect',
  'bep',
  'energy_professional',
  'fire_engineer',
  'quantity_surveyor',
  'site_manager',
] as const

/** Discipline groups in sidebar order with display metadata */
interface DisciplineSection {
  label: string
  icon: LucideIcon
  disciplines: { group: DisciplineGroup; title: string }[]
}

const DISCIPLINE_SECTIONS: DisciplineSection[] = [
  {
    label: 'Structural',
    icon: Building2,
    disciplines: [
      { group: 'structural-steel', title: 'Steel Design' },
      { group: 'structural-concrete', title: 'Concrete Design' },
      { group: 'structural-timber', title: 'Timber Design' },
      { group: 'geotechnical', title: 'Geotechnical' },
    ],
  },
  {
    label: 'Civil',
    icon: Wind,
    disciplines: [
      { group: 'civil-loading', title: 'Loading & Wind' },
      { group: 'civil-stormwater', title: 'Stormwater & Drainage' },
    ],
  },
  {
    label: 'Mechanical HVAC',
    icon: Ruler,
    disciplines: [
      { group: 'mechanical-duct', title: 'Duct & Pipe Sizing' },
      { group: 'mechanical-heating', title: 'Heating & Cooling Loads' },
    ],
  },
  {
    label: 'Fire Engineering',
    icon: Flame,
    disciplines: [
      { group: 'fire-escape', title: 'Escape & Travel Distance' },
      { group: 'fire-rating', title: 'Fire Resistance Rating' },
      { group: 'fire-water', title: 'Fire Water / Hydrants' },
    ],
  },
  {
    label: 'Electrical',
    icon: Zap,
    disciplines: [
      { group: 'electrical-cable', title: 'Cable Sizing & Voltage Drop' },
      { group: 'electrical-maxdemand', title: 'Max Demand & DB Sizing' },
    ],
  },
  {
    label: 'Wet Services',
    icon: Droplets,
    disciplines: [
      { group: 'wet-waterpipe', title: 'Water Pipe Sizing' },
      { group: 'wet-drainage', title: 'Drainage & Fixture Units' },
      { group: 'wet-hotwater', title: 'Hot Water System Sizing' },
    ],
  },
  {
    label: 'Utilities',
    icon: ArrowRightLeft,
    disciplines: [
      { group: 'utilities', title: 'Unit Converter & Ref' },
    ],
  },
]

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EngineersCalcHubProps {
  user: UserProfile
}

// ---------------------------------------------------------------------------
// Schema inspection helpers
// ---------------------------------------------------------------------------

interface FieldMeta {
  key: string
  label: string
  type: 'number' | 'text' | 'enum'
  enumValues?: string[]
  min?: number
  max?: number
  defaultValue?: unknown
  description?: string
}

/** Extract field metadata from a Zod object schema for dynamic form rendering */
function extractFieldMeta(schema: z.ZodType, defaults: Record<string, unknown>): FieldMeta[] {
  const fields: FieldMeta[] = []

  // Unwrap effects/transforms to get the ZodObject
  let inner: z.ZodType = schema
  while ((inner as z.ZodType & { _def: { innerType?: z.ZodType } })._def?.innerType) {
    inner = (inner as z.ZodType & { _def: { innerType: z.ZodType } })._def.innerType
  }

  const def = inner._def as { shape?: () => Record<string, z.ZodType>; typeName?: string }
  if (def.typeName !== 'ZodObject' || !def.shape) return fields

  const shape = def.shape()
  for (const [key, fieldSchema] of Object.entries(shape)) {
    const meta = extractSingleField(key, fieldSchema, defaults[key])
    if (meta) fields.push(meta)
  }
  return fields
}

function extractSingleField(key: string, schema: z.ZodType, defaultVal: unknown): FieldMeta | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = schema._def as any
  const typeName: string = def?.typeName ?? ''

  // Handle ZodDefault wrapper
  if (typeName === 'ZodDefault') {
    const inner = def.innerType
    const dv = def.defaultValue?.() ?? defaultVal
    return extractSingleField(key, inner, dv)
  }

  // Handle ZodEnum
  if (typeName === 'ZodEnum') {
    return {
      key,
      label: formatLabel(key),
      type: 'enum',
      enumValues: def.values as string[],
      defaultValue: defaultVal ?? def.values?.[0],
      description: def.description,
    }
  }

  // Handle ZodNumber
  if (typeName === 'ZodNumber') {
    const checks = (def.checks ?? []) as Array<{ kind: string; value?: number }>
    const min = checks.find((c) => c.kind === 'min')?.value
    const max = checks.find((c) => c.kind === 'max')?.value
    return {
      key,
      label: formatLabel(key),
      type: 'number',
      min,
      max,
      defaultValue: defaultVal ?? 0,
      description: def.description,
    }
  }

  // Handle ZodString
  if (typeName === 'ZodString') {
    return {
      key,
      label: formatLabel(key),
      type: 'text',
      defaultValue: defaultVal ?? '',
      description: def.description,
    }
  }

  // Skip complex types (arrays, objects) for now
  return null
}

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim()
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EngineersCalcHub({ user }: EngineersCalcHubProps) {
  const [activeCalculatorId, setActiveCalculatorId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [inputs, setInputs] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [output, setOutput] = useState<CalculatorOutput | null>(null)
  const [runHistory, setRunHistory] = useState<StandaloneToolRun[]>([])
  const [activeTab, setActiveTab] = useState<'calculator' | 'history'>('calculator')

  // Session input cache per calculator
  const inputCacheRef = useRef<Map<string, Record<string, unknown>>>(new Map())

  // Role-based access check (Requirement 1.7 / 19.3)
  const isAllowed = (ALLOWED_ROLES as readonly string[]).includes(user.role)

  // Derive all calculators
  const allCalculators = useMemo(() => getAllCalculators(), [])

  const activeCalc = useMemo(() => {
    if (!activeCalculatorId) return undefined
    return getCalculator(activeCalculatorId)
  }, [activeCalculatorId])

  const activeCalculator: CalcHubCalculatorMeta | undefined = activeCalc?.meta

  // Extract field metadata for dynamic form
  const fieldMeta = useMemo(() => {
    if (!activeCalc) return []
    return extractFieldMeta(activeCalc.inputSchema, activeCalc.defaults as Record<string, unknown>)
  }, [activeCalc])

  // Get calculators for the same discipline (for sub-tabs)
  const disciplineCalcs = useMemo(() => {
    if (!activeCalculator) return []
    return getCalculatorsByDiscipline(activeCalculator.discipline)
  }, [activeCalculator])

  // Validate inputs against schema
  const validate = useCallback(
    (currentInputs: Record<string, unknown>) => {
      if (!activeCalc) return false
      const result = activeCalc.inputSchema.safeParse(currentInputs)
      if (result.success) {
        setErrors({})
        return true
      }
      const newErrors: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const path = issue.path.join('.')
        newErrors[path] = issue.message
      }
      setErrors(newErrors)
      return false
    },
    [activeCalc]
  )

  const isValid = useMemo(() => {
    if (!activeCalc) return false
    const result = activeCalc.inputSchema.safeParse(inputs)
    return result.success
  }, [activeCalc, inputs])

  // Handle calculator selection — restore cached inputs or load defaults
  const selectCalculator = useCallback(
    (id: string) => {
      // Cache current inputs before switching
      if (activeCalculatorId && Object.keys(inputs).length > 0) {
        inputCacheRef.current.set(activeCalculatorId, { ...inputs })
      }
      setActiveCalculatorId(id)
      setOutput(null)
      setErrors({})

      const calc = getCalculator(id)
      if (calc) {
        const cached = inputCacheRef.current.get(id)
        const initialInputs = cached ?? (calc.defaults as Record<string, unknown>)
        setInputs({ ...initialInputs })
      } else {
        setInputs({})
      }
    },
    [activeCalculatorId, inputs]
  )

  // Handle input change with real-time validation
  const handleInputChange = useCallback(
    (key: string, value: unknown) => {
      const newInputs = { ...inputs, [key]: value }
      setInputs(newInputs)
      validate(newInputs)
    },
    [inputs, validate]
  )

  // Run calculation
  const handleCalculate = useCallback(() => {
    if (!activeCalc || !activeCalculatorId) return
    const parseResult = activeCalc.inputSchema.safeParse(inputs)
    if (!parseResult.success) return

    const result = activeCalc.compute(parseResult.data)
    setOutput(result)

    // Persist run
    const run = persistCalcRun({
      calculatorId: activeCalculatorId,
      userId: user.uid ?? user.email ?? user.role,
      role: user.role,
      input: inputs,
      output: result,
    })

    auditCalcEvent({
      action: 'calculator_run_created',
      userId: user.uid ?? user.email ?? user.role,
      runId: run.runId,
      calculatorDefinitionId: activeCalculatorId,
    })

    setRunHistory((prev) => [run, ...prev])
  }, [activeCalc, activeCalculatorId, inputs, user.role])

  // Restore a run from history
  const handleRestoreRun = useCallback(
    (run: StandaloneToolRun) => {
      setActiveCalculatorId(run.toolId)
      setInputs({ ...run.input })
      setOutput(run.output as unknown as CalculatorOutput)
      setActiveTab('calculator')
    },
    []
  )

  // Export PDF
  const handleExportPdf = useCallback(() => {
    if (!activeCalculator || !output) return
    try {
      const html = generateCalcSheetHtml({
        calculatorTitle: activeCalculator.title,
        sansRef: activeCalculator.sansRef,
        engineerName: user.displayName ?? user.email ?? user.role,
        engineerRole: user.role,
        date: new Date().toLocaleDateString(),
        runId: runHistory[0]?.runId ?? 'N/A',
        inputs: fieldMeta.map((f) => ({
          label: f.label,
          value: inputs[f.key] as string | number,
          unit: '',
        })),
        outputs: Object.entries(output.results).map(([label, r]) => {
          const rv = r as { value: number | string; unit: string }
          return { label, value: rv.value, unit: rv.unit }
        }),
        derivation: output.derivation,
        status: output.status,
        utilisationRatio: output.utilisationRatio,
      })
      const w = window.open('', '_blank')
      if (w) {
        w.document.write(html)
        w.document.close()
      }

      if (runHistory[0]) {
        auditCalcEvent({
          action: 'calculator_run_exported',
          userId: user.uid ?? user.email ?? user.role,
          runId: runHistory[0].runId,
          calculatorDefinitionId: activeCalculatorId ?? '',
          exportFormat: 'pdf',
        })
      }
    } catch {
      window.alert('Export failed. Please try again.')
    }
  }, [activeCalculator, output, runHistory, fieldMeta, inputs, user.role, activeCalculatorId])

  // Assign to project
  const handleAssignToProject = useCallback(() => {
    if (!runHistory[0] || !output) return
    const projectName = window.prompt('Enter project name:')
    if (!projectName) return
    const jobRef = window.prompt('Enter job reference:') ?? ''
    try {
      assignRunToProject({ run: runHistory[0], projectName, jobRef })
      auditCalcEvent({
        action: 'calculator_run_assigned',
        userId: user.uid ?? user.email ?? user.role,
        runId: runHistory[0].runId,
        calculatorDefinitionId: activeCalculatorId ?? '',
        projectId: projectName,
      })
      window.alert(`Assigned to project "${projectName}"`)
    } catch {
      window.alert('Assignment failed. Please try again.')
    }
  }, [runHistory, output, user.role, activeCalculatorId])

  // Push to SpecForge
  const handlePushToSpecForge = useCallback(() => {
    if (!runHistory[0] || !output) return
    try {
      pushRunToSpecForge({ run: runHistory[0], output })
      window.alert('Pushed to SpecForge successfully.')
    } catch {
      window.alert('Push to SpecForge failed. Please try again.')
    }
  }, [runHistory, output])

  // Access Denied view
  if (!isAllowed) {
    return (
      <div className="flex items-center justify-center min-h-[400px] p-6">
        <Card className="max-w-md w-full bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <ShieldAlert className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle className="text-lg">Access Denied</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            <p>
              The Engineer&apos;s Calculation Hub is available to engineers, architects,
              BEPs, energy professionals, fire engineers, quantity surveyors, and site managers.
            </p>
            <p className="mt-2 text-xs">
              Your current role ({user.role}) does not have access to this tool.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0" data-testid="engineers-calc-hub">
      {/* Mobile sidebar toggle */}
      <Button
        variant="ghost"
        size="sm"
        className="fixed bottom-4 left-4 z-50 md:hidden rounded-full h-10 w-10 p-0 bg-surface-800 border border-surface-700"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        <Wrench className="h-4 w-4" />
      </Button>

      {/* Sidebar — 240px discipline navigation */}
      <aside
        className={`
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          fixed inset-y-0 left-0 z-40 w-[240px] bg-surface-900 border-r border-surface-700/50
          transition-transform duration-200 ease-in-out
          md:relative md:translate-x-0 md:inset-auto md:z-auto
          flex flex-col
        `}
      >
        {/* Sidebar header */}
        <div className="px-4 py-3 border-b border-surface-700/50">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Calculators
          </h2>
        </div>

        {/* Scrollable discipline groups */}
        <ScrollArea className="flex-1 px-2 py-2">
          <nav aria-label="Calculator navigation">
            {DISCIPLINE_SECTIONS.map((section) => {
              const SectionIcon = section.icon
              return (
                <div key={section.label} className="mb-4">
                  <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
                    <SectionIcon className="h-4 w-4 text-primary/70" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {section.label}
                    </span>
                  </div>
                  {section.disciplines.map((disc) => {
                    const calcs = getCalculatorsByDiscipline(disc.group)
                    if (calcs.length > 0) {
                      return calcs.map((calc) => (
                        <button
                          key={calc.meta.id}
                          onClick={() => {
                            selectCalculator(calc.meta.id)
                            if (window.innerWidth < 768) setSidebarOpen(false)
                          }}
                          className={`
                            w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors
                            ${activeCalculatorId === calc.meta.id
                              ? 'bg-primary/10 text-primary font-medium'
                              : 'text-foreground/80 hover:bg-surface-800 hover:text-foreground'}
                          `}
                          aria-current={activeCalculatorId === calc.meta.id ? 'page' : undefined}
                        >
                          {calc.meta.title}
                        </button>
                      ))
                    }
                    return (
                      <button
                        key={disc.group}
                        onClick={() => {
                          selectCalculator(disc.group)
                          if (window.innerWidth < 768) setSidebarOpen(false)
                        }}
                        className={`
                          w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors
                          ${activeCalculatorId === disc.group
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-foreground/80 hover:bg-surface-800 hover:text-foreground'}
                        `}
                        aria-current={activeCalculatorId === disc.group ? 'page' : undefined}
                      >
                        {disc.title}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </nav>
        </ScrollArea>
      </aside>

      {/* Backdrop overlay for mobile sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main content area */}
      <main className="flex-1 min-w-0 overflow-auto p-4 md:p-6">
        {activeCalculator ? (
          <div className="space-y-4">
            {/* Calculator header */}
            <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
              <CardHeader className="flex flex-row items-center justify-between gap-4 py-3 px-4">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-lg font-bold truncate">
                    {activeCalculator.title}
                  </CardTitle>
                  {activeCalculator.sansRef && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {activeCalculator.sansRef}
                    </p>
                  )}
                </div>
                <Badge
                  variant="outline"
                  className="shrink-0 text-[10px] uppercase tracking-wider border-amber-500/50 text-amber-400"
                >
                  Advisory Only
                </Badge>
              </CardHeader>
            </Card>

            {/* Sub-tabs when discipline has multiple calculators */}
            {disciplineCalcs.length > 1 && (
              <Tabs value={activeCalculatorId ?? ''} onValueChange={(v) => selectCalculator(v)}>
                <TabsList>
                  {disciplineCalcs.map((c) => (
                    <TabsTrigger key={c.meta.id} value={c.meta.id}>
                      {c.meta.title}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}

            {/* Main tabs: Calculator / History */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'calculator' | 'history')}>
              <TabsList>
                <TabsTrigger value="calculator">Calculator</TabsTrigger>
                <TabsTrigger value="history">
                  <History className="h-3.5 w-3.5 mr-1" />
                  History ({runHistory.filter((r) => r.toolId === activeCalculatorId).length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="calculator">
                {/* Two-column layout: input left, results right */}
                <div className="grid grid-cols-1 min-[900px]:grid-cols-2 gap-4 mt-4">
                  {/* Input form */}
                  <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
                    <CardHeader className="py-3 px-4">
                      <CardTitle className="text-sm font-semibold">Input Parameters</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-3">
                      {fieldMeta.map((field) => (
                        <div key={field.key} className="space-y-1">
                          <label
                            htmlFor={`input-${field.key}`}
                            className="text-xs font-medium text-muted-foreground"
                          >
                            {field.label}
                          </label>
                          {field.type === 'enum' ? (
                            <select
                              id={`input-${field.key}`}
                              value={String(inputs[field.key] ?? field.defaultValue ?? '')}
                              onChange={(e) => handleInputChange(field.key, e.target.value)}
                              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring dark:bg-input/30"
                            >
                              {field.enumValues?.map((v) => (
                                <option key={v} value={v}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <Input
                              id={`input-${field.key}`}
                              type={field.type === 'number' ? 'number' : 'text'}
                              value={String(inputs[field.key] ?? field.defaultValue ?? '')}
                              min={field.min}
                              max={field.max}
                              step={field.type === 'number' ? 'any' : undefined}
                              onChange={(e) => {
                                const val =
                                  field.type === 'number'
                                    ? e.target.value === '' ? '' : Number(e.target.value)
                                    : e.target.value
                                handleInputChange(field.key, val)
                              }}
                              aria-invalid={!!errors[field.key]}
                            />
                          )}
                          {errors[field.key] && (
                            <p className="text-xs text-destructive">{errors[field.key]}</p>
                          )}
                        </div>
                      ))}

                      {fieldMeta.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          No input fields available for this calculator.
                        </p>
                      )}

                      <Button
                        onClick={handleCalculate}
                        disabled={!isValid || fieldMeta.length === 0}
                        className="w-full mt-4"
                      >
                        Calculate
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Results panel */}
                  <div className="space-y-4">
                    {output ? (
                      <>
                        {/* Status badge and utilisation */}
                        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
                          <CardContent className="p-4 flex items-center gap-4">
                            <Badge
                              className={`text-xs font-bold uppercase px-3 py-1 ${
                                output.status === 'pass'
                                  ? 'bg-green-600 text-white'
                                  : output.status === 'warning'
                                    ? 'bg-amber-500 text-white'
                                    : 'bg-red-600 text-white'
                              }`}
                            >
                              {output.status.toUpperCase()}
                            </Badge>
                            <span className="text-sm">
                              Utilisation:{' '}
                              <span
                                className={`font-bold ${
                                  output.utilisationRatio > 1
                                    ? 'text-red-400'
                                    : output.utilisationRatio >= 0.9
                                      ? 'text-amber-400'
                                      : 'text-green-400'
                                }`}
                              >
                                {(output.utilisationRatio * 100).toFixed(1)}%
                              </span>
                            </span>
                          </CardContent>
                        </Card>

                        {/* Results values */}
                        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
                          <CardHeader className="py-3 px-4">
                            <CardTitle className="text-sm font-semibold">Results</CardTitle>
                          </CardHeader>
                          <CardContent className="px-4 pb-4">
                            <div className="space-y-2">
                              {Object.entries(output.results).map(([label, r]) => {
                                const rv = r as { value: number | string; unit: string }
                                return (
                                  <div key={label} className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">{label}</span>
                                    <span className="font-mono font-medium">
                                      {typeof rv.value === 'number' ? rv.value.toFixed(2) : rv.value}{' '}
                                      <span className="text-xs text-muted-foreground">{rv.unit}</span>
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          </CardContent>
                        </Card>

                        {/* Derivation steps */}
                        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
                          <CardHeader className="py-3 px-4">
                            <CardTitle className="text-sm font-semibold">Derivation</CardTitle>
                          </CardHeader>
                          <CardContent className="px-4 pb-4">
                            <div className="space-y-3 font-mono text-xs">
                              {output.derivation.map((step, i) => (
                                <div
                                  key={i}
                                  className={`p-2 rounded ${
                                    step.isFailing
                                      ? 'bg-red-950/30 border border-red-800/50'
                                      : 'bg-surface-900/50'
                                  }`}
                                >
                                  <div className="flex items-start gap-2">
                                    {step.isFailing && (
                                      <span className="text-red-400 font-bold">✗</span>
                                    )}
                                    <div className="flex-1">
                                      <div className="font-semibold text-foreground">
                                        {step.label}
                                        {step.sansRef && (
                                          <span
                                            className="ml-2 text-[10px] px-1.5 py-0.5 rounded"
                                            style={{ backgroundColor: '#aeefe3', color: '#0f172a' }}
                                          >
                                            {step.sansRef}
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-muted-foreground mt-0.5">
                                        {step.formula}
                                      </div>
                                      <div className="text-foreground/80">
                                        {step.substitution}
                                      </div>
                                      <div className="font-bold text-foreground mt-0.5">
                                        = {step.result}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>

                        {/* Action buttons */}
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={handleExportPdf}>
                            <FileText className="h-3.5 w-3.5 mr-1.5" />
                            Export PDF
                          </Button>
                          <Button variant="outline" size="sm" onClick={handleAssignToProject} className="opacity-60">
                            <FolderKanban className="h-3.5 w-3.5 mr-1.5" />
                            Assign to Project (Preview)
                          </Button>
                          <Button variant="outline" size="sm" onClick={handlePushToSpecForge} className="opacity-60">
                            <Send className="h-3.5 w-3.5 mr-1.5" />
                            Push to SpecForge (Preview)
                          </Button>
                        </div>
                      </>
                    ) : (
                      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50 min-h-[200px]">
                        <CardContent className="p-6 flex items-center justify-center text-muted-foreground text-sm h-full">
                          <p>
                            Enter input values and click Calculate to see results.
                          </p>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="history">
                <HistoryPanel
                  runHistory={runHistory.filter((r) => r.toolId === activeCalculatorId)}
                  onRestore={handleRestoreRun}
                  allCalculators={allCalculators}
                />
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          // Empty state — no calculator selected
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center space-y-3">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-surface-800 border border-surface-700/50">
                <Wrench className="h-7 w-7 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-foreground">Select a Calculator</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                  Choose a calculator from the sidebar to begin. All calculations are advisory only
                  and require professional sign-off.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// History Panel Sub-Component
// ---------------------------------------------------------------------------

interface HistoryPanelProps {
  runHistory: StandaloneToolRun[]
  onRestore: (run: StandaloneToolRun) => void
  allCalculators: Array<{ meta: CalcHubCalculatorMeta }>
}

function HistoryPanel({ runHistory, onRestore, allCalculators }: HistoryPanelProps) {
  if (runHistory.length === 0) {
    return (
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50 mt-4">
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          No calculation runs yet. Run a calculation to see history here.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-2 mt-4">
      {runHistory.map((run) => {
        const calc = allCalculators.find((c) => c.meta.id === run.toolId)
        const runOutput = run.output as unknown as CalculatorOutput | undefined
        const status = runOutput?.status ?? 'pass'
        return (
          <Card
            key={run.runId}
            className="bg-surface-800/70 backdrop-blur border-surface-700/50 cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => onRestore(run)}
          >
            <CardContent className="p-3 flex items-center gap-3">
              <Badge
                className={`text-[10px] px-2 py-0.5 ${
                  status === 'pass'
                    ? 'bg-green-600 text-white'
                    : status === 'warning'
                      ? 'bg-amber-500 text-white'
                      : 'bg-red-600 text-white'
                }`}
              >
                {status.toUpperCase()}
              </Badge>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {calc?.meta.title ?? run.toolId}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(run.createdAt).toLocaleString()}
                </div>
              </div>
              {runOutput && (
                <span className="text-xs font-mono text-muted-foreground">
                  {(runOutput.utilisationRatio * 100).toFixed(0)}%
                </span>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
