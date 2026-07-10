/**
 * SpecForge Integration Service
 *
 * Provides a typed interface for P1 modules to write specification change records
 * into the SpecForge spine. Each record represents a proposed change to a project's
 * specification items — additions, amendments, or removals — originating from domain
 * module workflows.
 *
 * Requirements: 23.5
 *
 * @example Insurance requirements → spec items
 * ```ts
 * // When policy requirements are determined (e.g. JBCC requires PI + CW + CAR),
 * // write a spec change adding insurance requirement specs to SpecForge:
 * const result = await specForge.writeSpecChange({
 *   sourceModule: 'insurance-register',
 *   affectedSpecItemRef: 'SPEC-INS-001',
 *   changeType: 'add',
 *   proposedValue: 'Professional Indemnity Insurance — minimum R10M cover required per JBCC clause 19.1',
 *   justification: 'Contract form JBCC PBA requires PI insurance. Policy checker determined this requirement based on registered contract.',
 *   projectId: 'proj_abc123',
 *   createdAt: new Date().toISOString(),
 * });
 * ```
 *
 * @example Survey results → design parameters
 * ```ts
 * // When as-built comparison reveals deviations beyond tolerance,
 * // write a spec change amending design parameters in SpecForge:
 * const result = await specForge.writeSpecChange({
 *   sourceModule: 'survey-geomatics',
 *   affectedSpecItemRef: 'SPEC-DIM-042',
 *   changeType: 'amend',
 *   proposedValue: 'Foundation setback revised from 3.000m to 3.045m per as-built survey measurement',
 *   justification: 'As-built comparison recorded deviation of +45mm on northern boundary setback. Deviation exceeds ±25mm tolerance. Design parameter requires amendment to reflect constructed reality.',
 *   projectId: 'proj_abc123',
 *   createdAt: new Date().toISOString(),
 * });
 * ```
 */

import type { PlatformIntegrationService } from './platformIntegration';
import type { IntegrationWriteResult } from '../types';

// ─── Specification Change Record ──────────────────────────────────────────────

/**
 * A typed record representing a proposed specification change that a P1 module
 * writes to SpecForge via the platform audit trail.
 */
export interface SpecificationChangeRecord {
  /** Originating P1 module identifier (e.g. 'insurance-register', 'survey-geomatics'). */
  sourceModule: string;
  /** Reference to the affected specification item in SpecForge (e.g. 'SPEC-INS-001'). */
  affectedSpecItemRef: string;
  /** Type of change being proposed. */
  changeType: 'add' | 'amend' | 'remove';
  /** The proposed new value or description for the spec item. */
  proposedValue: string;
  /** Justification explaining why this change is needed (max 1000 chars). */
  justification: string;
  /** Project identifier this change applies to. */
  projectId: string;
  /** ISO timestamp when the change was created. */
  createdAt: string;
}

// ─── Service Interface ────────────────────────────────────────────────────────

export interface SpecForgeIntegrationService {
  /**
   * Writes a specification change record to the platform audit trail.
   * The record is written with action "spec_change_request" and the full record as newValues.
   */
  writeSpecChange(record: SpecificationChangeRecord): Promise<IntegrationWriteResult>;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates a SpecForgeIntegrationService that writes specification change records
 * to the platform audit trail via the shared PlatformIntegrationService.
 *
 * Each write uses action "spec_change_request" with the full SpecificationChangeRecord
 * as `newValues`, enabling downstream SpecForge consumers to process the change.
 *
 * @param platform - The shared PlatformIntegrationService instance (provides writeToAuditTrail)
 */
export function createSpecForgeIntegrationService(
  platform: PlatformIntegrationService,
): SpecForgeIntegrationService {
  return {
    async writeSpecChange(record: SpecificationChangeRecord): Promise<IntegrationWriteResult> {
      // Truncate justification to 1000 chars as per contract
      const truncatedJustification = record.justification.slice(0, 1000);

      return platform.writeToAuditTrail({
        projectId: record.projectId,
        moduleId: record.sourceModule,
        action: 'spec_change_request',
        recordRef: record.affectedSpecItemRef,
        actorId: record.sourceModule,
        timestamp: record.createdAt,
        newValues: {
          sourceModule: record.sourceModule,
          affectedSpecItemRef: record.affectedSpecItemRef,
          changeType: record.changeType,
          proposedValue: record.proposedValue,
          justification: truncatedJustification,
          projectId: record.projectId,
          createdAt: record.createdAt,
        },
      });
    },
  };
}
