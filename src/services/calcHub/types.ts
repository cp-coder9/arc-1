// Engineer's Calculation Hub — Core Types and Interfaces
//
// Shared type definitions for all calculator engines, the workspace UI,
// session state, and platform integration adapters.
//
// Design reference: .kiro/specs/engineers-calculation-hub/design.md
// Requirements: 3.1, 3.4, 3.5, 3.6, 3.7, 3.8, 1.4

import type { ZodType } from 'zod'

// ----------------------------------------------------------------------------
// Engine output types
// ----------------------------------------------------------------------------

/** Pass/fail/warning status for code compliance checks */
export type PassFailStatus = 'pass' | 'fail' | 'warning'

/** A single step in the derivation display */
export interface DerivationStep {
  /** Step label/description */
  label: string
  /** The formula template (e.g., "Mu = wL²/8") */
  formula: string
  /** The formula with values substituted */
  substitution: string
  /** Computed result value */
  result: string
  /** SANS clause reference (e.g., "SANS 10162-1 §13.5") */
  sansRef?: string
  /** Whether this step failed a code check */
  isFailing?: boolean
}

/** Standard output shape from all calculator engines */
export interface CalculatorOutput {
  /** Overall pass/fail/warning status */
  status: PassFailStatus
  /** Utilisation ratio (0-1+) */
  utilisationRatio: number
  /** Key result values (label → { value, unit }) */
  results: Record<string, { value: number | string; unit: string }>
  /** Step-by-step derivation */
  derivation: DerivationStep[]
  /** SANS clause references consulted */
  sansReferences: string[]
  /** Intermediate values for audit/display */
  intermediates: Record<string, number>
}


// ----------------------------------------------------------------------------
// Discipline and navigation types
// ----------------------------------------------------------------------------

/** Discipline groups for sidebar navigation */
export type DisciplineGroup =
  | 'structural-steel'
  | 'structural-concrete'
  | 'structural-timber'
  | 'geotechnical'
  | 'civil-loading'
  | 'civil-stormwater'
  | 'mechanical-duct'
  | 'mechanical-heating'
  | 'fire-escape'
  | 'fire-rating'
  | 'fire-water'
  | 'electrical-cable'
  | 'electrical-maxdemand'
  | 'wet-waterpipe'
  | 'wet-drainage'
  | 'wet-hotwater'
  | 'utilities'

// ----------------------------------------------------------------------------
// Calculator registration types
// ----------------------------------------------------------------------------

/** Calculator metadata for registration and navigation */
export interface CalcHubCalculatorMeta {
  id: string
  title: string
  discipline: DisciplineGroup
  sansRef: string
  description: string
}

/** A fully registered calculator for the hub */
export interface CalcHubCalculator<TInput = Record<string, unknown>> {
  meta: CalcHubCalculatorMeta
  inputSchema: ZodType<TInput>
  defaults: TInput
  compute: (input: TInput) => CalculatorOutput
}

// ----------------------------------------------------------------------------
// Steel section data
// ----------------------------------------------------------------------------

/** Steel section data shape (SA Red Book I/H sections) */
export interface SteelSection {
  /** Section name (e.g. '457x191UB67') */
  name: string
  /** Depth (mm) */
  d: number
  /** Flange width (mm) */
  bf: number
  /** Flange thickness (mm) */
  tf: number
  /** Web thickness (mm) */
  tw: number
  /** Second moment of area, x-axis (cm⁴) */
  Ix: number
  /** Second moment of area, y-axis (cm⁴) */
  Iy: number
  /** Elastic section modulus, x (cm³) */
  Zx: number
  /** Plastic section modulus, x (cm³) */
  Sx: number
  /** Radius of gyration, x (mm) */
  rx: number
  /** Radius of gyration, y (mm) */
  ry: number
  /** Cross-sectional area (cm²) */
  A: number
  /** Mass per metre (kg/m) */
  mass: number
}

// ----------------------------------------------------------------------------
// Session state
// ----------------------------------------------------------------------------

/** Session state for the calculator hub (in-memory) */
export interface CalcHubSessionState {
  activeDiscipline: DisciplineGroup
  activeCalculatorId: string
  /** Cached inputs per calculator for session restore (Requirement 2.8) */
  inputCache: Map<string, Record<string, unknown>>
  /** Latest output per calculator */
  lastOutput: Map<string, CalculatorOutput>
  /** Run history loaded from persistence */
  runHistory: unknown[] // StandaloneToolRun[] — referenced from platform types
}
