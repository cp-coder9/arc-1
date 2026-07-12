/**
 * FM Bridge — Project Passport Adapter
 *
 * Reads construction project data from the platform spine's Project Passport
 * for use during the handover transition. Uses dependency injection for all
 * external data access. Implements graceful degradation — if the spine is
 * unavailable, logs a warning and returns null/empty results without breaking
 * the calling operation.
 *
 * Requirements: 1.2, 2.6
 */

import type { WarrantyCategory } from '../types';

// ─── Service Result Type ──────────────────────────────────────────────────────

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

// ─── Spine Data Interfaces ────────────────────────────────────────────────────

/** Construction project record from the platform spine (Project Passport) */
export interface ConstructionProjectRecord {
  projectId: string;
  projectStatus: string;
  closeoutStatus: string;
  buildingName: string;
  physicalAddress: string;
  gpsCoordinates?: { lat: number; lng: number };
  constructionCompletionDate: string;
  mainContractorName: string;
  principalAgentName: string;
  projectReferenceNumber: string;
  buildingType?: string;
  grossFloorArea?: number;
  numberOfStoreys?: number;
}

/** Warranty certificate from the Closeout handover pack */
export interface CloseoutWarrantyRecord {
  description: string;
  category: WarrantyCategory;
  supplierName: string;
  warrantyPeriodMonths: number;
  conditions?: string;
}

/** Document record from the Documents module */
export interface ProjectDocumentRecord {
  documentId: string;
  title: string;
  type: string;
  status: 'draft' | 'issued' | 'final' | 'as-built' | 'superseded';
  revision: string;
  fileReference: string;
}

/** DLP contract data from closeout */
export interface DLPContractData {
  dlpDurationDays: number;
  mainContractorRef: string;
  principalAgentRef: string;
}

// ─── Dependency Injection Interfaces ──────────────────────────────────────────

/** Injected callback to read a construction project record from the spine */
export type ReadProjectRecord = (projectId: string) => Promise<ConstructionProjectRecord | null>;

/** Injected callback to read closeout warranty items from the spine */
export type ReadCloseoutWarranties = (projectId: string) => Promise<CloseoutWarrantyRecord[]>;

/** Injected callback to read as-built/final documents from the spine */
export type ReadProjectDocuments = (projectId: string) => Promise<ProjectDocumentRecord[]>;

/** Injected callback to read DLP contract data from the spine */
export type ReadDLPContractData = (projectId: string) => Promise<DLPContractData | null>;

/** Bundled dependencies for the project passport adapter */
export interface ProjectPassportAdapterDeps {
  readProjectRecord: ReadProjectRecord;
  readCloseoutWarranties: ReadCloseoutWarranties;
  readProjectDocuments: ReadProjectDocuments;
  readDLPContractData: ReadDLPContractData;
}

// ─── Combined Handover Data Output ────────────────────────────────────────────

/** Aggregated project data required for handover transition */
export interface ProjectHandoverSnapshot {
  project: ConstructionProjectRecord;
  warranties: CloseoutWarrantyRecord[];
  documents: ProjectDocumentRecord[];
  dlpData: DLPContractData | null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Reads the construction project record from the platform spine.
 * Returns null if the spine is unavailable or the project is not found.
 *
 * Graceful degradation: logs warning on failure, never throws.
 */
export async function readProjectForHandover(
  projectId: string,
  deps: ProjectPassportAdapterDeps,
): Promise<ServiceResult<ProjectHandoverSnapshot>> {
  if (!projectId) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Project ID is required',
      },
    };
  }

  // 1. Read core project record
  let project: ConstructionProjectRecord | null = null;
  try {
    project = await deps.readProjectRecord(projectId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.warn(
      `[projectPassportAdapter] Failed to read project record for "${projectId}": ${message}`,
    );
    return {
      success: false,
      error: {
        code: 'SPINE_UNAVAILABLE',
        message: 'Project Passport spine unavailable — cannot read project data',
        details: { originalError: message },
      },
    };
  }

  if (!project) {
    return {
      success: false,
      error: {
        code: 'PROJECT_NOT_FOUND',
        message: `Construction project "${projectId}" not found in Project Passport`,
      },
    };
  }

  // 2. Read closeout warranty items — graceful degradation
  let warranties: CloseoutWarrantyRecord[] = [];
  try {
    warranties = await deps.readCloseoutWarranties(projectId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.warn(
      `[projectPassportAdapter] Failed to read closeout warranties for "${projectId}": ${message}. Proceeding with empty warranty list.`,
    );
    // Continue with empty warranties — non-blocking
  }

  // 3. Read as-built/final documents — graceful degradation
  let documents: ProjectDocumentRecord[] = [];
  try {
    documents = await deps.readProjectDocuments(projectId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.warn(
      `[projectPassportAdapter] Failed to read project documents for "${projectId}": ${message}. Proceeding with empty document list.`,
    );
    // Continue with empty documents — non-blocking
  }

  // 4. Read DLP contract data — graceful degradation
  let dlpData: DLPContractData | null = null;
  try {
    dlpData = await deps.readDLPContractData(projectId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.warn(
      `[projectPassportAdapter] Failed to read DLP contract data for "${projectId}": ${message}. DLP will use default duration.`,
    );
    // Continue with null — service layer will use default 90-day DLP
  }

  return {
    success: true,
    data: {
      project,
      warranties,
      documents,
      dlpData,
    },
  };
}

/**
 * Reads only the core project record (lightweight call for status checks).
 * Returns null if the spine is unavailable.
 *
 * Graceful degradation: logs warning on failure, never throws.
 */
export async function readProjectStatus(
  projectId: string,
  readProject: ReadProjectRecord,
): Promise<ServiceResult<{ status: string; closeoutStatus: string } | null>> {
  if (!projectId) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'Project ID is required',
      },
    };
  }

  try {
    const project = await readProject(projectId);
    if (!project) {
      return { success: true, data: null };
    }
    return {
      success: true,
      data: {
        status: project.projectStatus,
        closeoutStatus: project.closeoutStatus,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.warn(
      `[projectPassportAdapter] Failed to read project status for "${projectId}": ${message}`,
    );
    return {
      success: false,
      error: {
        code: 'SPINE_UNAVAILABLE',
        message: 'Project Passport spine unavailable — cannot read project status',
        details: { originalError: message },
      },
    };
  }
}
