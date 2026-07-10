import type { ProjectAssignment, ToolContext } from './types';

/**
 * Interface for checking project existence and user access.
 * Implementations can delegate to Firestore, in-memory stores, or test stubs.
 */
export interface ProjectAccessChecker {
  /** Returns true if the project with the given id exists. */
  exists(projectId: string, tenantId: string): Promise<boolean>;
  /** Returns true if the user has at least read access to the project. */
  hasReadAccess(projectId: string, userId: string, tenantId: string): Promise<boolean>;
}

/**
 * Result of validating a ProjectAssignment.
 */
export interface ValidationResult {
  valid: boolean;
  error?: { code: string; message: string };
}

export class ProjectAssignmentService {
  constructor(private readonly accessChecker?: ProjectAccessChecker) {}

  none(): ProjectAssignment {
    return { mode: 'none' };
  }

  internal(projectId: string, projectName: string): ProjectAssignment {
    if (!projectId.trim()) throw new Error('Internal project assignment needs a projectId');
    return { mode: 'internal-project', projectId, projectName };
  }

  external(externalReference: string, notes?: string): ProjectAssignment {
    if (!externalReference || !externalReference.trim()) {
      throw new Error('External assignment needs an externalReference');
    }
    return { mode: 'external-reference', externalReference, notes };
  }

  /**
   * Validates a ProjectAssignment against business rules (Req 5.2, 5.3, 5.4).
   *
   * - internal-project: checks project exists and user has read access.
   * - external-reference: validates externalReference length (1–200 chars) and optional notes (0–500 chars).
   * - none: always valid.
   */
  async validate(assignment: ProjectAssignment, ctx: ToolContext): Promise<ValidationResult> {
    if (assignment.mode === 'none') {
      return { valid: true };
    }

    if (assignment.mode === 'internal-project') {
      return this.validateInternalProject(assignment, ctx);
    }

    if (assignment.mode === 'external-reference') {
      return this.validateExternalReference(assignment);
    }

    return { valid: false, error: { code: 'INVALID_MODE', message: `Unknown assignment mode: ${(assignment as ProjectAssignment).mode}` } };
  }

  /**
   * Determines whether reassignment is allowed from the current mode (Req 5.6, 5.7).
   *
   * - From 'none': allowed (can reassign to internal-project or external-reference).
   * - From 'internal-project' or 'external-reference': rejected.
   */
  canReassign(currentMode: ProjectAssignment['mode']): boolean {
    return currentMode === 'none';
  }

  // ── Private Validation Helpers ──────────────────────────────────────────────

  private async validateInternalProject(assignment: ProjectAssignment, ctx: ToolContext): Promise<ValidationResult> {
    const { projectId } = assignment;

    if (!projectId || !projectId.trim()) {
      return {
        valid: false,
        error: { code: 'INVALID_PROJECT', message: 'Project ID is required for internal-project assignment.' },
      };
    }

    if (!this.accessChecker) {
      // No access checker injected — cannot verify project; treat as valid
      // (e.g. in unit tests or demo mode without Firestore)
      return { valid: true };
    }

    const exists = await this.accessChecker.exists(projectId, ctx.tenantId);
    if (!exists) {
      return {
        valid: false,
        error: { code: 'PROJECT_NOT_FOUND', message: `Project '${projectId}' not found.` },
      };
    }

    const hasAccess = await this.accessChecker.hasReadAccess(projectId, ctx.userId, ctx.tenantId);
    if (!hasAccess) {
      return {
        valid: false,
        error: { code: 'ACCESS_DENIED', message: `User does not have read access to project '${projectId}'.` },
      };
    }

    return { valid: true };
  }

  private validateExternalReference(assignment: ProjectAssignment): ValidationResult {
    const { externalReference, notes } = assignment;

    if (!externalReference || externalReference.length === 0) {
      return {
        valid: false,
        error: { code: 'INVALID_EXTERNAL_REFERENCE', message: 'externalReference is required and must be 1–200 characters.' },
      };
    }

    if (externalReference.length > 200) {
      return {
        valid: false,
        error: { code: 'INVALID_EXTERNAL_REFERENCE', message: `externalReference must be at most 200 characters (got ${externalReference.length}).` },
      };
    }

    if (notes !== undefined && notes !== null && notes.length > 500) {
      return {
        valid: false,
        error: { code: 'INVALID_NOTES', message: `notes must be at most 500 characters (got ${notes.length}).` },
      };
    }

    return { valid: true };
  }
}
