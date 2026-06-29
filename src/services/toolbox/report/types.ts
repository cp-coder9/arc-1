// Toolbox report layer — shared contracts
//
// The report layer turns a `CalculationResult` (plus the definition, the inputs used, and
// run metadata such as the timestamp) into audit-ready outputs: a CSV string and a PDF
// byte stream. A `ReportTemplate` is the registered-by-id abstraction referenced by
// `CalculatorDefinition.reportTemplateId`; concrete exporters live in `csvExporter.ts` and
// `pdfExporter.ts`.
//
// Design reference: design.md "Report layer" (`src/services/toolbox/report/**`).
// Requirements: 1.4 (show inputs, source, assumptions, exclusions, disclaimer),
// 1.5 (audit-ready PDF + CSV with inputs, results, clause outcomes, source version,
// timestamp), 3.4 (print source guideline name, version, and status).

import type { CalculationResult, CalculatorDefinition } from '../types'

/**
 * Run-time metadata that is not part of the calculation itself but must appear on the
 * audit-ready output: when it was generated, who/what produced it, and any project linkage.
 */
export interface ReportMetadata {
  /** ISO-8601 timestamp the report was generated (Requirement 1.5 — timestamp). */
  timestamp: string
  /** Optional saved-run id, surfaced for traceability. */
  runId?: string
  /** Optional preparer (professional name / user id). */
  preparedBy?: string
  /** Optional project or job reference when assigned to a project. */
  projectRef?: string
}

/**
 * Everything an exporter needs to render a report: the definition that produced the result
 * (for title, source provenance, disclaimers), the validated inputs used, the engine's
 * result, and run metadata.
 */
export interface ReportContext<
  TInput = Record<string, unknown>,
  TRow = Record<string, unknown>,
> {
  definition: CalculatorDefinition<TInput, TRow>
  /** The top-level inputs the run was computed against. */
  input: TInput
  /** The engine's calculation result. */
  result: CalculationResult
  /** Run metadata (timestamp etc.). */
  metadata: ReportMetadata
}

/**
 * A registered report renderer. Templates are keyed by `id` and referenced from a
 * `CalculatorDefinition.reportTemplateId`. The default template (see
 * `reportTemplateRegistry.ts`) delegates to the generic CSV/PDF exporters; bespoke
 * templates may override either renderer while reusing the shared building blocks.
 */
export interface ReportTemplate {
  id: string
  /** Human-readable template name (defaults to the definition title at render time). */
  title?: string
  /** Render the result to an audit-ready CSV string. */
  toCsv: (ctx: ReportContext) => string
  /** Render the result to audit-ready PDF bytes. */
  toPdf: (ctx: ReportContext) => Promise<Uint8Array>
}
