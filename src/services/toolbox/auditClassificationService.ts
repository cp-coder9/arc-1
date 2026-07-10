// Audit Classification Service — type definitions and service implementation
//
// Provides automated classification of every tool in the Tool_Registry by
// implementation depth. Each tool receives exactly one ClassificationGrade based
// on its wiring to the Definition_Registry and the completeness of its
// Calculator_Definition.
//
// Design reference: .kiro/specs/toolbox-depth-audit-spine/design.md
//   ("1. Classification Audit Service")
// Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10

import { STANDALONE_TOOL_REGISTRY } from '@/services/tools/standaloneToolRegistry'
import { getCalculatorDefinition } from '@/services/toolbox/definitions/definitionRegistry'
import type { CalculatorDefinition } from '@/services/toolbox/types'
import type { StandaloneToolDef } from '@/types/standaloneToolTypes'

// ----------------------------------------------------------------------------
// Classification grade
// ----------------------------------------------------------------------------

/**
 * The implementation depth grade assigned to each tool in the registry.
 *
 * - `production` — Full domain logic with compute, inputSchema, tableRefs, and reportTemplateId.
 * - `partial` — Has a definition but is missing one or more capabilities (clauseSet, tableRefs, reportTemplateId).
 * - `placeholder` — Preview definition with empty/default compute output.
 * - `metadata-only` — Registry entry has a calculatorDefinitionId that doesn't resolve to any definition.
 * - `route-shell` — Definition has only a route string, no compute or inputSchema.
 * - `missing` — No calculatorDefinitionId in the registry entry, or resolution failed.
 */
export type ClassificationGrade =
  | 'production'
  | 'partial'
  | 'placeholder'
  | 'metadata-only'
  | 'route-shell'
  | 'missing';

// ----------------------------------------------------------------------------
// Classification entry
// ----------------------------------------------------------------------------

/**
 * A single tool's classification result. Each entry maps a registry tool to its
 * assessed grade, the reasons for that classification, and any capabilities that
 * are missing (populated when grade is `partial`).
 *
 * Requirement 1.9: The report is a structured JSON array where each element
 * contains toolId, label, grade, reasons, and missingCapabilities.
 */
export interface ClassificationEntry {
  /** Tool identifier matching the Tool_Registry entry id. */
  toolId: string;
  /** The tool's display name from the registry. */
  label: string;
  /** The assessed implementation depth grade. */
  grade: ClassificationGrade;
  /** At least one reason explaining the classification logic applied. */
  reasons: string[];
  /** Capabilities missing from the definition; empty when grade is `production`. */
  missingCapabilities: string[];
}

// ----------------------------------------------------------------------------
// Classification report
// ----------------------------------------------------------------------------

/**
 * The complete classification report — one entry per tool in the registry.
 * Report length equals the Tool_Registry length (Requirement 1.1).
 */
export type ClassificationReport = ClassificationEntry[];

// ----------------------------------------------------------------------------
// AuditClassificationService
// ----------------------------------------------------------------------------

/**
 * Service that scans the Tool_Registry and Definition_Registry to produce a
 * structured classification report. Implements the decision tree per design.md.
 *
 * Requirements: 1.1–1.10
 */
export class AuditClassificationService {
  /**
   * Classify every tool in STANDALONE_TOOL_REGISTRY and return a report with
   * exactly one entry per tool. Report length === registry length (Req 1.1).
   */
  classifyAll(): ClassificationReport {
    return STANDALONE_TOOL_REGISTRY.map((tool) => this.classifyTool(tool.id));
  }

  /**
   * Classify a single tool by its toolId. Applies the decision tree:
   *
   * 1. No calculatorDefinitionId → missing
   * 2. calculatorDefinitionId doesn't resolve → metadata-only
   * 3. Definition has only route, no compute/inputSchema → route-shell
   * 4. Definition status 'preview' and compute produces empty results → placeholder
   * 5. Definition status 'full'|'preview' but missing clauseSet/tableRefs/reportTemplateId → partial
   * 6. Definition status 'full' with compute, inputSchema, tableRefs (non-empty), reportTemplateId → production
   *
   * Errors are handled gracefully: if resolving a definition throws, the tool
   * receives grade 'missing' with a reason indicating resolution failure (Req 1.10).
   */
  classifyTool(toolId: string): ClassificationEntry {
    const tool = STANDALONE_TOOL_REGISTRY.find((t) => t.id === toolId);

    if (!tool) {
      return {
        toolId,
        label: 'Unknown',
        grade: 'missing',
        reasons: [`Tool with id '${toolId}' not found in Tool_Registry`],
        missingCapabilities: [],
      };
    }

    // Step 1: No calculatorDefinitionId → missing (Req 1.8)
    if (!tool.calculatorDefinitionId) {
      return {
        toolId: tool.id,
        label: tool.label,
        grade: 'missing',
        reasons: ['No calculatorDefinitionId field in Tool_Registry entry'],
        missingCapabilities: [],
      };
    }

    // Step 2: Attempt to resolve definition — handle errors gracefully (Req 1.10)
    let definition: CalculatorDefinition | undefined;
    try {
      definition = getCalculatorDefinition(tool.calculatorDefinitionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        toolId: tool.id,
        label: tool.label,
        grade: 'missing',
        reasons: [`Definition resolution failed: ${message}`],
        missingCapabilities: [],
      };
    }

    // Step 2 (continued): ID doesn't resolve → metadata-only (Req 1.6)
    if (!definition) {
      return {
        toolId: tool.id,
        label: tool.label,
        grade: 'metadata-only',
        reasons: [
          `calculatorDefinitionId '${tool.calculatorDefinitionId}' does not resolve to any registered Calculator_Definition`,
        ],
        missingCapabilities: [],
      };
    }

    // Step 3: Definition has only route, no compute or inputSchema → route-shell (Req 1.7)
    if (!definition.compute && !definition.inputSchema) {
      return {
        toolId: tool.id,
        label: tool.label,
        grade: 'route-shell',
        reasons: ['Definition has no compute function and no inputSchema — route-shell only'],
        missingCapabilities: [],
      };
    }

    // Step 4: Preview status + compute produces empty results → placeholder (Req 1.5)
    if (definition.status === 'preview' && this.producesEmptyResults(definition)) {
      return {
        toolId: tool.id,
        label: tool.label,
        grade: 'placeholder',
        reasons: [
          "Definition has status 'preview' and compute produces empty/default results",
        ],
        missingCapabilities: [],
      };
    }

    // Step 5: Full/preview but missing clauseSet/tableRefs/reportTemplateId → partial (Req 1.4)
    const missing = this.findMissingCapabilities(definition);
    if (missing.length > 0) {
      return {
        toolId: tool.id,
        label: tool.label,
        grade: 'partial',
        reasons: [
          `Definition has status '${definition.status}' but is missing capabilities: ${missing.join(', ')}`,
        ],
        missingCapabilities: missing,
      };
    }

    // Step 6: Full with all capabilities → production (Req 1.3)
    if (definition.status === 'full') {
      return {
        toolId: tool.id,
        label: tool.label,
        grade: 'production',
        reasons: [
          "Definition has status 'full' with compute, inputSchema, non-empty tableRefs, and reportTemplateId",
        ],
        missingCapabilities: [],
      };
    }

    // Preview with all capabilities is still partial (not production) — preview
    // tools with complete capabilities but not marked 'full' are classified as partial
    // because they haven't been promoted to full status yet.
    return {
      toolId: tool.id,
      label: tool.label,
      grade: 'partial',
      reasons: [
        `Definition has status '${definition.status}' — not yet promoted to 'full' production status`,
      ],
      missingCapabilities: [],
    };
  }

  /**
   * Determine whether a definition's compute function produces empty/default results.
   * Checks if compute exists and if it would return empty lineResults, empty clauseResults,
   * and all-zero aggregates.
   */
  private producesEmptyResults(definition: CalculatorDefinition): boolean {
    if (!definition.compute) {
      return true;
    }

    try {
      // Attempt to run compute with minimal empty context to detect placeholder output
      const result = definition.compute({
        input: {} as any,
        rows: [],
        tables: {},
        jurisdiction: 'ZA',
      });

      // Check if the result is empty/default
      const hasLineResults = result.lineResults && result.lineResults.length > 0;
      const hasClauseResults = result.clauseResults && result.clauseResults.length > 0;
      const hasNonZeroAggregates =
        result.aggregates &&
        Object.values(result.aggregates).some((v) => v !== 0 && v !== '0' && v !== '');

      return !hasLineResults && !hasClauseResults && !hasNonZeroAggregates;
    } catch {
      // If compute throws with empty input, it likely has real logic that requires
      // valid inputs — this is NOT a placeholder. Placeholders produce empty results
      // without throwing.
      return false;
    }
  }

  /**
   * Identify which capabilities are missing from a definition.
   * A definition must have clauseSet (with at least one entry), tableRefs (non-empty),
   * and a non-empty reportTemplateId to be considered complete. (Req 1.4)
   */
  private findMissingCapabilities(definition: CalculatorDefinition): string[] {
    const missing: string[] = [];

    if (!definition.clauseSet || definition.clauseSet.length === 0) {
      missing.push('clauseSet');
    }

    if (!definition.tableRefs || definition.tableRefs.length === 0) {
      missing.push('tableRefs');
    }

    if (!definition.reportTemplateId) {
      missing.push('reportTemplateId');
    }

    return missing;
  }
}
