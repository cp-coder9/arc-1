// DefinitionToolRunner — definition-driven tool form (Task 5.1)
//
// Renders an accessible, typed input form derived from a CalculatorDefinition's
// `inputSchema` (Zod), validates inputs against that schema, and invokes the toolbox
// engine (`runCalculator`) live to produce a `CalculationResult`.
//
// Scope (Task 5.1): form rendering from `inputSchema` + engine invocation. The schedule
// editor (ScheduleGrid — Task 5.2) and the clause/report panels + StandaloneToolRunner
// refactor (Task 5.3) plug in via the `scheduleRows`, `renderResult`, and `footer` props
// without changing this component's contract.
//
// Requirements: 1.1 (dedicated, typed Zod-validated form specific to the tool's domain),
// 10.2 (forms keyboard-navigable, labelled, screen-reader friendly).

import React, { useMemo, useState } from 'react'
import type { ZodType } from 'zod'
import { Calculator, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  CalculatorError,
  type CalculationResult,
  type CalculatorDefinition,
  type GuidelineTable,
} from '@/services/toolbox/types'
import { runCalculator } from '@/services/toolbox/engine'
import type { PinnedVersions } from '@/services/toolbox/engine'
import { guidelineTableStore } from '@/services/toolbox/tables'

// ----------------------------------------------------------------------------
// Zod schema introspection — derive form fields from `inputSchema`
// ----------------------------------------------------------------------------

export type FormFieldKind = 'number' | 'text' | 'checkbox' | 'select'

export interface FormFieldOption {
  value: string
  label: string
}

export interface DerivedFormField {
  key: string
  label: string
  kind: FormFieldKind
  required: boolean
  description?: string
  options?: FormFieldOption[]
  defaultValue?: unknown
}

/** Turn a camelCase / snake_case key (or enum value) into a human-readable label. */
function humanizeKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
  if (!spaced) return key
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

interface UnwrappedSchema {
  schema: { _def?: Record<string, unknown> } | undefined
  optional: boolean
  defaultValue?: unknown
  description?: string
}

/**
 * Peel Zod wrapper types (optional/nullable/default/effects/branded/readonly/catch) off a
 * schema to reach the underlying primitive, tracking whether the field is user-optional,
 * its default value, and any `.describe()` text.
 */
function unwrap(schema: unknown): UnwrappedSchema {
  let current = schema as { _def?: any } | undefined
  let optional = false
  let defaultValue: unknown
  let description: string | undefined = current?._def?.description

  while (current && current._def) {
    const typeName: string | undefined = current._def.typeName
    if (!description && current._def.description) description = current._def.description

    if (typeName === 'ZodOptional' || typeName === 'ZodNullable') {
      optional = true
      current = current._def.innerType
    } else if (typeName === 'ZodDefault') {
      optional = true
      try {
        defaultValue = current._def.defaultValue()
      } catch {
        /* default thunk failed — leave undefined */
      }
      current = current._def.innerType
    } else if (typeName === 'ZodEffects') {
      current = current._def.schema
    } else if (typeName === 'ZodBranded' || typeName === 'ZodReadonly') {
      current = current._def.type ?? current._def.innerType
    } else if (typeName === 'ZodCatch') {
      current = current._def.innerType
    } else {
      break
    }
  }

  return { schema: current, optional, defaultValue, description }
}

function deriveField(key: string, schema: unknown): DerivedFormField {
  const { schema: inner, optional, defaultValue, description } = unwrap(schema)
  const def = inner?._def as any
  const typeName: string | undefined = def?.typeName
  const base = {
    key,
    label: description || humanizeKey(key),
    required: !optional,
    description,
    defaultValue,
  }

  switch (typeName) {
    case 'ZodNumber':
      return { ...base, kind: 'number' }
    case 'ZodBoolean':
      return { ...base, kind: 'checkbox' }
    case 'ZodEnum': {
      const values: string[] = def.values ?? []
      return {
        ...base,
        kind: 'select',
        options: values.map((v) => ({ value: v, label: humanizeKey(v) })),
      }
    }
    case 'ZodNativeEnum': {
      const enumObj = def.values ?? {}
      const values = Object.values(enumObj).filter((v) => typeof v === 'string') as string[]
      return {
        ...base,
        kind: 'select',
        options: values.map((v) => ({ value: String(v), label: humanizeKey(String(v)) })),
      }
    }
    case 'ZodString':
    default:
      return { ...base, kind: 'text' }
  }
}

/**
 * Introspect a Zod object schema into an ordered list of form fields. Returns an empty
 * list when the schema is not (ultimately) a `ZodObject`.
 */
export function deriveFormFields(schema: ZodType<unknown>): DerivedFormField[] {
  const { schema: obj } = unwrap(schema)
  const def = obj?._def as any
  if (!def || def.typeName !== 'ZodObject') return []
  const shape = typeof def.shape === 'function' ? def.shape() : def.shape
  if (!shape) return []
  return Object.keys(shape).map((key) => deriveField(key, shape[key]))
}

// ----------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------

export interface DefinitionToolRunnerProps {
  /** The versioned calculator definition driving the form + computation. */
  definition: CalculatorDefinition
  /** Optional initial input values (e.g. restored from a saved run). */
  initialInput?: Record<string, unknown>
  /** Schedule rows supplied by ScheduleGrid (Task 5.2); passed straight to the engine. */
  scheduleRows?: unknown[]
  /** Override the guideline tables fed to the engine (defaults to the shared store). */
  tables?: GuidelineTable[]
  /** Pin guideline versions to deterministically replay a saved run. */
  pinnedVersions?: PinnedVersions
  /** Notified whenever a successful computation produces a result (or is reset to null). */
  onResult?: (result: CalculationResult | null) => void
  /** Notified with the validated input + result after a successful run. */
  onRun?: (input: Record<string, unknown>, result: CalculationResult) => void
  /** Custom result renderer (Task 5.3 plugs in ClauseResultPanel / ToolReportPreview). */
  renderResult?: (result: CalculationResult) => React.ReactNode
  /** Extra controls rendered alongside the Compute button (Save / Export / Assign). */
  footer?: React.ReactNode
  /** Slot rendered between the form fields and the action row (e.g. the ScheduleGrid). */
  children?: React.ReactNode
}

type FieldErrors = Record<string, string>

function buildInitialValues(
  fields: DerivedFormField[],
  initialInput?: Record<string, unknown>,
): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const field of fields) {
    if (initialInput && initialInput[field.key] !== undefined) {
      values[field.key] = initialInput[field.key]
    } else if (field.defaultValue !== undefined) {
      values[field.key] = field.defaultValue
    } else if (field.kind === 'checkbox') {
      values[field.key] = false
    }
  }
  return values
}

export default function DefinitionToolRunner(props: DefinitionToolRunnerProps) {
  const {
    definition,
    initialInput,
    scheduleRows = [],
    tables,
    pinnedVersions,
    onResult,
    onRun,
    renderResult,
    footer,
    children,
  } = props

  const fields = useMemo<DerivedFormField[]>(
    () => deriveFormFields(definition.inputSchema as ZodType<unknown>),
    [definition.inputSchema],
  )

  const [values, setValues] = useState<Record<string, unknown>>(() =>
    buildInitialValues(fields, initialInput),
  )
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [result, setResult] = useState<CalculationResult | null>(null)

  const setValue = (key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()

    const parsed = definition.inputSchema.safeParse(values)
    if (!parsed.success) {
      const nextErrors: FieldErrors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]
        if (typeof key === 'string' && !nextErrors[key]) {
          nextErrors[key] = issue.message
        }
      }
      setErrors(nextErrors)
      setFormError('Please correct the highlighted fields.')
      setResult(null)
      onResult?.(null)
      return
    }

    setErrors({})
    setFormError(null)

    try {
      const computed = runCalculator(definition, parsed.data, scheduleRows, {
        tables: tables ?? guidelineTableStore.getAllTables(),
        pinnedVersions,
      })
      setResult(computed)
      onResult?.(computed)
      onRun?.(parsed.data, computed)
    } catch (err) {
      const message =
        err instanceof CalculatorError ? err.message : `Calculation failed: ${(err as Error).message}`
      setFormError(message)
      setResult(null)
      onResult?.(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-4 w-4" aria-hidden="true" />
          {definition.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={handleSubmit} aria-label={`${definition.title} inputs`}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {fields.map((field: DerivedFormField) => (
              <React.Fragment key={field.key}>
                <FormFieldControl
                  field={field}
                  value={values[field.key]}
                  error={errors[field.key]}
                  onChange={(v: unknown) => setValue(field.key, v)}
                />
              </React.Fragment>
            ))}
          </div>

          {children}

          {formError && (
            <p role="alert" className="mt-4 flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              {formError}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="submit">
              <Calculator className="mr-2 h-4 w-4" aria-hidden="true" />
              Compute
            </Button>
            {footer}
          </div>
        </form>

        {result && (
          <div className="mt-6" role="region" aria-label="Calculation result">
            {renderResult ? renderResult(result) : <DefaultResultView result={result} />}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ----------------------------------------------------------------------------
// Field control — one accessible, labelled input per derived field
// ----------------------------------------------------------------------------

interface FormFieldControlProps {
  field: DerivedFormField
  value: unknown
  error?: string
  onChange: (value: unknown) => void
}

function FormFieldControl({ field, value, error, onChange }: FormFieldControlProps) {
  const inputId = `field-${field.key}`
  const errorId = `${inputId}-error`
  const describedBy = error ? errorId : undefined

  if (field.kind === 'checkbox') {
    return (
      <div className="flex items-start gap-3">
        <input
          id={inputId}
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-input"
          checked={Boolean(value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div className="space-y-1">
          <Label htmlFor={inputId} className="cursor-pointer">
            {field.label}
            {field.required && <RequiredMark />}
          </Label>
          {error && <FieldError id={errorId} message={error} />}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <Label htmlFor={inputId}>
        {field.label}
        {field.required && <RequiredMark />}
      </Label>

      {field.kind === 'select' ? (
        <select
          id={inputId}
          className={cn(
            'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
            error && 'border-destructive',
          )}
          value={value === undefined || value === null ? '' : String(value)}
          aria-required={field.required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
        >
          <option value="">Select…</option>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <Input
          id={inputId}
          type={field.kind === 'number' ? 'number' : 'text'}
          inputMode={field.kind === 'number' ? 'decimal' : undefined}
          value={value === undefined || value === null ? '' : String(value)}
          aria-required={field.required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => {
            if (field.kind === 'number') {
              const raw = e.target.value
              onChange(raw === '' ? undefined : Number(raw))
            } else {
              onChange(e.target.value)
            }
          }}
        />
      )}

      {error && <FieldError id={errorId} message={error} />}
    </div>
  )
}

function RequiredMark() {
  return (
    <span className="ml-0.5 text-destructive" aria-hidden="true">
      *
    </span>
  )
}

function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p id={id} role="alert" className="text-xs text-destructive">
      {message}
    </p>
  )
}

// ----------------------------------------------------------------------------
// Default result view (replaced by ClauseResultPanel / ToolReportPreview in Task 5.3)
// ----------------------------------------------------------------------------

function DefaultResultView({ result }: { result: CalculationResult }) {
  const aggregateEntries = Object.entries(result.aggregates ?? {})
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <h3 className="text-sm font-medium">Result</h3>

      {aggregateEntries.length > 0 && (
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {aggregateEntries.map(([key, val]) => (
            <div key={key} className="flex justify-between gap-2 text-sm">
              <dt className="text-muted-foreground">{humanizeKey(key)}</dt>
              <dd className="font-medium">{String(val)}</dd>
            </div>
          ))}
        </dl>
      )}

      {typeof result.complianceScore === 'number' && (
        <p className="text-sm">
          <span className="text-muted-foreground">Compliance score: </span>
          <span className="font-medium">{result.complianceScore}</span>
        </p>
      )}

      {result.clauseResults.length > 0 && (
        <ul className="space-y-1 text-sm">
          {result.clauseResults.map((clause, i) => (
            <li key={`${clause.clauseRef}-${i}`} className="flex items-center justify-between gap-2">
              <span>
                {clause.clauseRef} — {clause.label}
              </span>
              <span className="font-medium uppercase">{clause.outcome}</span>
            </li>
          ))}
        </ul>
      )}

      {result.warnings.length > 0 && (
        <ul className="space-y-1 text-xs text-amber-600">
          {result.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      {result.disclaimers.length > 0 && (
        <div className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
          {result.disclaimers.map((d, i) => (
            <p key={i}>{d}</p>
          ))}
        </div>
      )}
    </div>
  )
}
