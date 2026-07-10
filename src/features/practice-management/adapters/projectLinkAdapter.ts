/**
 * Practice Management — Project Link Adapter
 *
 * Optional integration between Practice Management projects and
 * construction project workspaces. Provides read access to construction
 * project status and links practice projects to construction projects
 * for seamless timesheet and billing data flow.
 *
 * This adapter is entirely optional — the Practice Management module
 * operates standalone (Requirement 14.1). When the firm has both a practice
 * management subscription and active construction projects, this adapter
 * enables the link (Requirement 14.8).
 *
 * Uses dependency injection for persistence — no direct Firestore imports.
 * Graceful degradation: if construction project data is unavailable,
 * returns null/empty results without breaking practice management operations.
 *
 * Requirements: 14.8
 */

// ─── Service Result ───────────────────────────────────────────────────────────

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

// ─── External Project Types ───────────────────────────────────────────────────

/**
 * Minimal construction project status read by this adapter.
 * Sourced from the platform's Project Passport / construction workspace.
 */
export interface ConstructionProjectStatus {
  projectId: string;
  projectName: string;
  status: string;
  currentPhase: string;
  lastActivityDate: string | null;
  teamMembers: { userId: string; role: string; displayName: string }[];
}

/**
 * Link record associating a practice project to a construction project.
 */
export interface ProjectLink {
  id: string;
  firmId: string;
  practiceProjectId: string;
  constructionProjectId: string;
  linkedBy: string;
  linkedAt: string;
  unlinkedAt?: string;
}

// ─── Dependency Injection ─────────────────────────────────────────────────────

/**
 * Reads a construction project's status from the platform spine.
 * Returns null if the project doesn't exist or is inaccessible.
 */
export type ReadConstructionProject = (
  constructionProjectId: string,
) => Promise<ConstructionProjectStatus | null>;

/**
 * Persists or updates a project link record.
 * Returns the stored link ID.
 */
export type PersistProjectLink = (link: ProjectLink) => Promise<string>;

/**
 * Reads an existing project link for a practice project.
 * Returns null if no link exists.
 */
export type ReadProjectLink = (
  practiceProjectId: string,
) => Promise<ProjectLink | null>;

/** Logger dependency for graceful degradation warnings */
export interface Logger {
  warn: (message: string, context?: Record<string, unknown>) => void;
}

const defaultLogger: Logger = {
  warn: (message: string, context?: Record<string, unknown>) => {
    console.warn(`[practice-management:projectLink] ${message}`, context ?? '');
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `pm_link_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function generateTimestamp(): string {
  return new Date().toISOString();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Reads the status of a linked construction project.
 *
 * Returns null if:
 * - No link exists for the practice project
 * - The construction project is inaccessible
 * - The read operation fails (graceful degradation)
 */
export async function getLinkedConstructionProjectStatus(
  practiceProjectId: string,
  deps: {
    readLink: ReadProjectLink;
    readProject: ReadConstructionProject;
    logger?: Logger;
  },
): Promise<ServiceResult<ConstructionProjectStatus | null>> {
  const logger = deps.logger || defaultLogger;

  try {
    // 1. Check if a link exists
    const link = await deps.readLink(practiceProjectId);
    if (!link || link.unlinkedAt) {
      return { success: true, data: null };
    }

    // 2. Read the construction project status
    const projectStatus = await deps.readProject(link.constructionProjectId);
    return { success: true, data: projectStatus };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.warn(`Failed to read linked construction project: ${message}`, {
      practiceProjectId,
    });
    return {
      success: true,
      data: null, // Graceful degradation: return null, not a failure
    };
  }
}

/**
 * Creates a link between a practice project and a construction project.
 *
 * Requirement: 14.8 — when a firm has both a practice management subscription
 * and active construction projects, allow linking practice projects to
 * construction project records for seamless timesheet and billing data flow.
 */
export async function linkToConstructionProject(
  input: {
    firmId: string;
    practiceProjectId: string;
    constructionProjectId: string;
    linkedBy: string;
  },
  deps: {
    readProject: ReadConstructionProject;
    readLink: ReadProjectLink;
    persistLink: PersistProjectLink;
    logger?: Logger;
  },
): Promise<ServiceResult<ProjectLink>> {
  const logger = deps.logger || defaultLogger;

  try {
    // 1. Verify construction project exists and is accessible
    const projectStatus = await deps.readProject(input.constructionProjectId);
    if (!projectStatus) {
      return {
        success: false,
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Construction project not found or not accessible',
          details: { constructionProjectId: input.constructionProjectId },
        },
      };
    }

    // 2. Check for existing active link
    const existingLink = await deps.readLink(input.practiceProjectId);
    if (existingLink && !existingLink.unlinkedAt) {
      return {
        success: false,
        error: {
          code: 'ALREADY_LINKED',
          message: 'Practice project is already linked to a construction project',
          details: {
            existingConstructionProjectId: existingLink.constructionProjectId,
          },
        },
      };
    }

    // 3. Create and persist the link
    const link: ProjectLink = {
      id: generateId(),
      firmId: input.firmId,
      practiceProjectId: input.practiceProjectId,
      constructionProjectId: input.constructionProjectId,
      linkedBy: input.linkedBy,
      linkedAt: generateTimestamp(),
    };

    await deps.persistLink(link);
    return { success: true, data: link };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.warn(`Failed to link to construction project: ${message}`, {
      practiceProjectId: input.practiceProjectId,
      constructionProjectId: input.constructionProjectId,
    });
    return {
      success: false,
      error: {
        code: 'LINK_ERROR',
        message: 'Failed to create project link',
        details: { originalError: message },
      },
    };
  }
}

/**
 * Removes the link between a practice project and a construction project.
 * Marks the link as unlinked (soft-delete) rather than hard-deleting.
 */
export async function unlinkFromConstructionProject(
  practiceProjectId: string,
  deps: {
    readLink: ReadProjectLink;
    persistLink: PersistProjectLink;
    logger?: Logger;
  },
): Promise<ServiceResult<ProjectLink | null>> {
  const logger = deps.logger || defaultLogger;

  try {
    const link = await deps.readLink(practiceProjectId);
    if (!link || link.unlinkedAt) {
      return { success: true, data: null }; // No active link to remove
    }

    const updatedLink: ProjectLink = {
      ...link,
      unlinkedAt: generateTimestamp(),
    };

    await deps.persistLink(updatedLink);
    return { success: true, data: updatedLink };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.warn(`Failed to unlink from construction project: ${message}`, {
      practiceProjectId,
    });
    return {
      success: false,
      error: {
        code: 'UNLINK_ERROR',
        message: 'Failed to remove project link',
        details: { originalError: message },
      },
    };
  }
}
