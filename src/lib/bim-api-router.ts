/**
 * BIM/IFC Quantity Extraction Bridge — API Routes
 *
 * Express 5 router mounted at /api/bim. Handles IFC file upload and parsing,
 * model queries, quantity extraction, and validation report retrieval.
 * Role-based access control applied per route group via BIM_UPLOAD_ROLES
 * and BIM_EXTRACT_ROLES constants.
 *
 * Integration: All write operations emit audit events via bimAuditAdapter.
 * Successful parse/extract/BoQ operations emit Project Passport events.
 * Document Register tracks BIM model lifecycle (active → superseded).
 *
 * Requirements: 1.1, 1.4, 1.5, 1.6, 10.1, 10.2, 10.7, 11.1–11.6
 */
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from './roleMiddleware';
import {
  BIM_UPLOAD_ROLES,
  BIM_EXTRACT_ROLES,
  BIM_MAPPING_ROLES,
  BIM_EXPORT_ROLES,
} from '@/services/bim/types';
import type { UserRole } from '@/types';
import type { BimErrorResponse } from '@/services/bim/types';
import {
  onBimUploadSuccess,
  onExtractionSuccess,
  onBoqGenerationSuccess,
  onProcurementPackageIssued,
  emitAuditEvent,
} from '@/services/bim/bimIntegrationService';
import {
  syncSpecForge,
  compareSpecForge,
  recordProcurementIssuance,
  getBoq,
  storeBoq,
  checkModelSupersession,
} from '@/services/bim/bimSpecForgeIntegration';

const router = Router();

// ── Auth Middleware ────────────────────────────────────────────────────────────

/**
 * All BIM routes require authentication.
 */
router.use(requireAuth);

/**
 * Role-check middleware factory. Verifies that the authenticated user's role
 * is included in the allowed roles array. Returns 403 if not permitted.
 */
function checkBimRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userRole = req.authContext?.role as UserRole | undefined;

    if (!userRole || !allowedRoles.includes(userRole)) {
      const errorResponse: BimErrorResponse = {
        error: 'FORBIDDEN',
        message: 'Insufficient permissions for the requested BIM operation.',
      };
      res.status(403).json(errorResponse);
      return;
    }
    next();
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum file size: 500MB */
const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024;

/** Allowed file extensions */
const ALLOWED_EXTENSIONS = ['.ifc'];

/** STEP/IFC file header marker */
const STEP_HEADER_MARKER = 'ISO-10303-21';

// ── Upload & Parse Routes ─────────────────────────────────────────────────────

/**
 * POST /api/bim/upload
 *
 * Upload and parse an IFC file. Accepts a JSON body with base64-encoded file
 * content and metadata. Validates extension, size, and STEP header before
 * parsing.
 *
 * Body:
 *   - file: string (base64-encoded file content)
 *   - fileName: string (original file name with .ifc extension)
 *   - projectId: string (target project)
 *
 * Roles: BIM_UPLOAD_ROLES (quantity_surveyor, architect, engineer, contractor, platform_admin)
 *
 * Responses:
 *   200 — Model summary (fileId, fileName, schemaVersion, elementCount, etc.)
 *   400 — Parse error (invalid STEP syntax, unsupported schema)
 *   403 — Insufficient permissions
 *   413 — File too large (exceeds 500MB)
 */
router.post(
  '/upload',
  checkBimRole(BIM_UPLOAD_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { file, fileName, projectId } = req.body;

      // Validate required fields
      if (!file || !fileName || !projectId) {
        const errorResponse: BimErrorResponse = {
          error: 'VALIDATION_ERROR',
          message: 'Missing required fields: file, fileName, and projectId are required.',
        };
        res.status(400).json(errorResponse);
        return;
      }

      // Validate file extension
      const extension = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
      if (!ALLOWED_EXTENSIONS.includes(extension)) {
        const errorResponse: BimErrorResponse = {
          error: 'INVALID_EXTENSION',
          message: `File must have a .ifc extension. Received: "${extension}"`,
        };
        res.status(400).json(errorResponse);
        return;
      }

      // Decode base64 and check size
      let buffer: Buffer;
      try {
        buffer = Buffer.from(file, 'base64');
      } catch {
        const errorResponse: BimErrorResponse = {
          error: 'INVALID_FILE',
          message: 'File content is not valid base64.',
        };
        res.status(400).json(errorResponse);
        return;
      }

      if (buffer.length > MAX_FILE_SIZE_BYTES) {
        const errorResponse: BimErrorResponse = {
          error: 'FILE_TOO_LARGE',
          message: 'File exceeds maximum size of 500MB.',
        };
        res.status(413).json(errorResponse);
        return;
      }

      // Validate STEP header (check first 4KB for ISO-10303-21 marker)
      const headerChunk = buffer.slice(0, 4096).toString('ascii');
      if (!headerChunk.includes(STEP_HEADER_MARKER)) {
        const errorResponse: BimErrorResponse = {
          error: 'PARSE_ERROR',
          message: 'File does not contain a valid STEP/IFC header (ISO-10303-21 marker not found).',
        };
        res.status(400).json(errorResponse);
        return;
      }

      // Stub: In production, this calls ifcParserService.parseIfcFile()
      // and stores the result in Firestore + Vercel Blob.
      // For now, return a success response with placeholder data.
      const fileId = `bim_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const schemaVersion = 'IFC4';
      const actorUid = req.authContext?.uid || 'unknown';

      // ── Integration: Document Register + Audit (Req 1.6, 11.4, 11.6) ────
      // On successful parse: register document, supersede previous models, emit audit
      const blobUrl = `https://blob.vercel-storage.com/bim/${fileId}/${fileName}`;
      const { documentRecord, superseded } = onBimUploadSuccess({
        fileId,
        projectId,
        fileName,
        schemaVersion,
        blobUrl,
        actorUid,
      });

      res.status(200).json({
        fileId,
        fileName,
        projectId,
        schemaVersion,
        elementCount: 0,
        quantityCoverage: 0,
        validationSummary: {
          errors: 0,
          warnings: 0,
          info: 0,
        },
        parsedAt: new Date().toISOString(),
        documentRegisterId: documentRecord.documentId,
        supersededModels: superseded.map((s) => s.documentId),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error during upload';
      const errorResponse: BimErrorResponse = {
        error: 'PARSE_ERROR',
        message,
      };
      res.status(400).json(errorResponse);
    }
  },
);

// ── Model Query Routes ────────────────────────────────────────────────────────

/**
 * GET /api/bim/models/:projectId
 *
 * List parsed models for a project.
 * Roles: BIM_UPLOAD_ROLES (includes read access for uploaders + clients via broader check)
 */
router.get(
  '/models/:projectId',
  checkBimRole(BIM_UPLOAD_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId } = req.params;

      // Stub: In production, queries Firestore for models belonging to projectId
      res.status(200).json({
        projectId,
        models: [],
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message });
    }
  },
);

/**
 * GET /api/bim/models/:projectId/:fileId
 *
 * Get details of a specific parsed model.
 * Roles: BIM_UPLOAD_ROLES
 */
router.get(
  '/models/:projectId/:fileId',
  checkBimRole(BIM_UPLOAD_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId, fileId } = req.params;

      // Stub: In production, fetches model from Firestore
      const errorResponse: BimErrorResponse = {
        error: 'NOT_FOUND',
        message: `Model with fileId "${fileId}" not found in project "${projectId}".`,
      };
      res.status(404).json(errorResponse);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message });
    }
  },
);

// ── Extraction Routes ─────────────────────────────────────────────────────────

/**
 * POST /api/bim/extract/:fileId
 *
 * Trigger quantity extraction for a parsed model.
 * Roles: BIM_EXTRACT_ROLES (quantity_surveyor, architect, engineer, platform_admin)
 */
router.post(
  '/extract/:fileId',
  checkBimRole(BIM_EXTRACT_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { fileId } = req.params;
      const { projectId } = req.body;

      // Stub: In production, triggers quantityExtractorService.extractQuantities()
      const extractionId = `ext_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const actorUid = req.authContext?.uid || 'unknown';
      const now = new Date().toISOString();

      // ── Integration: Project Passport + Audit (Req 11.1, 11.3, 11.4) ────
      // On extraction: emit BimExtractionEvent to passport, evaluate quality risk, emit audit
      // In production, the real ExtractionResult from quantityExtractorService is passed here.
      // For now, construct a minimal result for integration wiring.
      const stubExtractionResult = {
        extractionId,
        projectId: projectId || '',
        fileId,
        fileName: `model-${fileId}.ifc`,
        schemaVersion: 'IFC4' as const,
        extractedAt: now,
        extractedBy: actorUid,
        elements: [],
        quantities: [],
        validationReport: {
          modelId: fileId,
          findings: [],
          statistics: {
            totalElements: 0,
            elementsByType: {},
            elementsWithQuantities: 0,
            elementsWithoutQuantities: 0,
            unclassifiedElements: 0,
            elementsByTradeSection: {},
            quantityCoveragePercent: 0,
          },
          boqBlocked: false,
          generatedAt: now,
        },
        status: 'draft' as const,
      };

      const { passportEvent, riskIndicator } = onExtractionSuccess({
        result: stubExtractionResult,
        actorUid,
      });

      res.status(200).json({
        extractionId,
        fileId,
        projectId: projectId || null,
        status: 'draft',
        extractedAt: now,
        elementCount: 0,
        quantityCoverage: passportEvent.quantityCoveragePercent,
        riskIndicator: riskIndicator ? riskIndicator.severity : null,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message });
    }
  },
);

/**
 * GET /api/bim/extractions/:projectId
 *
 * List extractions for a project.
 * Roles: BIM_EXTRACT_ROLES
 */
router.get(
  '/extractions/:projectId',
  checkBimRole(BIM_EXTRACT_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId } = req.params;

      // Stub: In production, queries Firestore for extractions
      res.status(200).json({
        projectId,
        extractions: [],
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message });
    }
  },
);

/**
 * GET /api/bim/extractions/:projectId/:extractionId
 *
 * Get details of a specific extraction.
 * Roles: BIM_EXTRACT_ROLES
 */
router.get(
  '/extractions/:projectId/:extractionId',
  checkBimRole(BIM_EXTRACT_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId, extractionId } = req.params;

      // Stub: In production, fetches extraction from Firestore
      const errorResponse: BimErrorResponse = {
        error: 'NOT_FOUND',
        message: `Extraction "${extractionId}" not found in project "${projectId}".`,
      };
      res.status(404).json(errorResponse);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message });
    }
  },
);

// ── Validation Routes ─────────────────────────────────────────────────────────

/**
 * GET /api/bim/validation/:extractionId
 *
 * Get validation report for an extraction.
 * Roles: BIM_EXTRACT_ROLES
 */
router.get(
  '/validation/:extractionId',
  checkBimRole(BIM_EXTRACT_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { extractionId } = req.params;

      // Stub: In production, fetches validation report from Firestore
      const errorResponse: BimErrorResponse = {
        error: 'NOT_FOUND',
        message: `Validation report for extraction "${extractionId}" not found.`,
      };
      res.status(404).json(errorResponse);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message });
    }
  },
);

// ── BoQ Generation & Export Routes ────────────────────────────────────────────

/**
 * POST /api/bim/boq/generate
 *
 * Generate a BoQ from an extraction. Blocks if validation errors exist.
 * Body: { projectId, extractionId, options? }
 * Roles: BIM_EXTRACT_ROLES (quantity_surveyor, architect, engineer, platform_admin)
 *
 * Requirements: 5.7, 6.5, 6.6, 6.7
 */
router.post(
  '/boq/generate',
  checkBimRole(BIM_EXTRACT_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId, extractionId, options } = req.body;

      if (!projectId || !extractionId) {
        const errorResponse: BimErrorResponse = {
          error: 'VALIDATION_ERROR',
          message: 'Missing required fields: projectId and extractionId are required.',
        };
        res.status(400).json(errorResponse);
        return;
      }

      // Stub: In production, checks validation report for error-severity findings
      // and blocks BoQ generation if any exist (returns 409 with BOQ_BLOCKED).
      // For now, return a success response with placeholder data.
      const boqId = `boq_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const actorUid = req.authContext?.uid || 'unknown';
      const now = new Date().toISOString();

      // ── Integration: Project Passport + Audit (Req 11.2, 11.4) ────
      // On BoQ generation: emit BimBoqEvent to passport, emit audit
      const stubBoq = {
        boqId,
        projectId,
        extractionId,
        title: `BoQ — ${projectId}`,
        status: 'draft' as const,
        revision: '1',
        generatedAt: now,
        generatedBy: actorUid,
        currency: options?.currency || 'ZAR',
        sections: [],
        flaggedElementsSummary: [],
        totals: { totalLineItems: 0, totalSections: 0, totalElements: 0 },
      };

      // Store BoQ for SpecForge sync/compare operations
      storeBoq(stubBoq);

      const { passportEvent } = onBoqGenerationSuccess({ boq: stubBoq, actorUid });

      res.status(200).json({
        boqId,
        projectId,
        extractionId,
        status: 'draft',
        sectionCount: passportEvent.tradeSectionCount,
        lineItemCount: passportEvent.lineItemCount,
        flaggedElements: 0,
        currency: options?.currency || 'ZAR',
        generatedAt: now,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message });
    }
  },
);

/**
 * GET /api/bim/boq/:projectId
 *
 * List generated BoQs for a project.
 * Roles: BIM_EXTRACT_ROLES
 */
router.get(
  '/boq/:projectId',
  checkBimRole(BIM_EXTRACT_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId } = req.params;

      // Stub: In production, queries Firestore for BoQs belonging to projectId
      res.status(200).json({
        projectId,
        boqs: [],
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message });
    }
  },
);

/**
 * GET /api/bim/boq/:projectId/:boqId
 *
 * Get details of a specific BoQ.
 * Roles: BIM_EXTRACT_ROLES
 */
router.get(
  '/boq/:projectId/:boqId',
  checkBimRole(BIM_EXTRACT_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId, boqId } = req.params;

      // Stub: In production, fetches BoQ from Firestore
      const errorResponse: BimErrorResponse = {
        error: 'NOT_FOUND',
        message: `BoQ "${boqId}" not found in project "${projectId}".`,
      };
      res.status(404).json(errorResponse);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message });
    }
  },
);

/**
 * POST /api/bim/boq/:boqId/export
 *
 * Export a BoQ in a specified format (CSV, Excel, or JSON).
 * Body: { format: 'csv' | 'xlsx' | 'json' }
 * Roles: BIM_EXPORT_ROLES (quantity_surveyor, contractor, platform_admin)
 *
 * Requirements: 6.5, 6.6, 6.7
 */
router.post(
  '/boq/:boqId/export',
  checkBimRole(BIM_EXPORT_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { boqId } = req.params;
      const { format } = req.body;

      if (!format || !['csv', 'xlsx', 'json'].includes(format)) {
        const errorResponse: BimErrorResponse = {
          error: 'VALIDATION_ERROR',
          message: 'Missing or invalid format. Must be one of: csv, xlsx, json.',
        };
        res.status(400).json(errorResponse);
        return;
      }

      // ── Integration: Audit (Req 11.4) ────
      // On export: emit audit event for the export operation
      const actorUid = req.authContext?.uid || 'unknown';
      emitAuditEvent('bim_export', actorUid, boqId, '', { format });

      // Stub: In production, fetches the BoQ and exports via exportService
      const errorResponse: BimErrorResponse = {
        error: 'NOT_FOUND',
        message: `BoQ "${boqId}" not found.`,
      };
      res.status(404).json(errorResponse);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message });
    }
  },
);

// ── Mapping Rules Routes ──────────────────────────────────────────────────────

/**
 * GET /api/bim/rules/:projectId
 *
 * List active mapping rules (default + custom) for a project.
 * Roles: BIM_MAPPING_ROLES (quantity_surveyor, platform_admin)
 *
 * Requirement: 10.3
 */
router.get(
  '/rules/:projectId',
  checkBimRole(BIM_MAPPING_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId } = req.params;

      // Stub: In production, returns default + custom rules for the project
      res.status(200).json({
        projectId,
        rules: [],
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message });
    }
  },
);

/**
 * POST /api/bim/rules
 *
 * Create a custom mapping rule (project or firm scoped).
 * Roles: BIM_MAPPING_ROLES (quantity_surveyor, platform_admin)
 *
 * Requirement: 10.3
 */
router.post(
  '/rules',
  checkBimRole(BIM_MAPPING_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const ruleData = req.body;

      if (!ruleData.ifcEntityType || !ruleData.tradeSection) {
        const errorResponse: BimErrorResponse = {
          error: 'VALIDATION_ERROR',
          message: 'Missing required fields: ifcEntityType and tradeSection are required.',
        };
        res.status(400).json(errorResponse);
        return;
      }

      // Stub: In production, creates rule in Firestore via mappingEngineService
      const ruleId = `rule_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

      // ── Integration: Audit (Req 11.4) ────
      const actorUid = req.authContext?.uid || 'unknown';
      emitAuditEvent('bim_mapping_rule_created', actorUid, ruleId, ruleData.projectId || '', {
        ifcEntityType: ruleData.ifcEntityType,
        tradeSection: ruleData.tradeSection,
      });

      res.status(201).json({
        ruleId,
        ...ruleData,
        scope: ruleData.scope || 'project',
        createdAt: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message });
    }
  },
);

/**
 * PATCH /api/bim/rules/:ruleId
 *
 * Update a custom mapping rule.
 * Roles: BIM_MAPPING_ROLES (quantity_surveyor, platform_admin)
 *
 * Requirement: 10.3
 */
router.patch(
  '/rules/:ruleId',
  checkBimRole(BIM_MAPPING_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { ruleId } = req.params;
      // req.body contains the rule updates

      // ── Integration: Audit (Req 11.4) ────
      const actorUid = req.authContext?.uid || 'unknown';
      emitAuditEvent('bim_mapping_rule_updated', actorUid, ruleId, req.body?.projectId || '');

      // Stub: In production, updates rule in Firestore
      const errorResponse: BimErrorResponse = {
        error: 'NOT_FOUND',
        message: `Mapping rule "${ruleId}" not found.`,
      };
      res.status(404).json(errorResponse);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message });
    }
  },
);

/**
 * DELETE /api/bim/rules/:ruleId
 *
 * Delete a custom mapping rule.
 * Roles: BIM_MAPPING_ROLES (quantity_surveyor, platform_admin)
 *
 * Requirement: 10.3
 */
router.delete(
  '/rules/:ruleId',
  checkBimRole(BIM_MAPPING_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { ruleId } = req.params;

      // ── Integration: Audit (Req 11.4) ────
      const actorUid = req.authContext?.uid || 'unknown';
      emitAuditEvent('bim_mapping_rule_deleted', actorUid, ruleId, '');

      // Stub: In production, deletes rule from Firestore
      const errorResponse: BimErrorResponse = {
        error: 'NOT_FOUND',
        message: `Mapping rule "${ruleId}" not found.`,
      };
      res.status(404).json(errorResponse);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message });
    }
  },
);

// ── Procurement Routes ────────────────────────────────────────────────────────

/**
 * POST /api/bim/procurement/package
 *
 * Create a procurement package from BoQ trade sections.
 * Roles: BIM_EXPORT_ROLES (quantity_surveyor, contractor, platform_admin)
 *
 * Requirements: 9.1, 9.4
 */
router.post(
  '/procurement/package',
  checkBimRole(BIM_EXPORT_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { boqId, projectId, tradeSections, selectedLineItems, coverSheet } = req.body;

      if (!boqId || !projectId) {
        const errorResponse: BimErrorResponse = {
          error: 'VALIDATION_ERROR',
          message: 'Missing required fields: boqId and projectId are required.',
        };
        res.status(400).json(errorResponse);
        return;
      }

      // Stub: In production, creates procurement package via boqGeneratorService
      const packageId = `pkg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

      // ── Integration: Audit (Req 11.4) ────
      const actorUid = req.authContext?.uid || 'unknown';
      emitAuditEvent('bim_procurement_package_created', actorUid, packageId, projectId, {
        boqId,
        tradeSections: tradeSections || [],
      });

      res.status(201).json({
        packageId,
        boqId,
        projectId,
        tradeSections: tradeSections || [],
        status: 'draft',
        createdAt: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message });
    }
  },
);

/**
 * POST /api/bim/procurement/:packageId/issue
 *
 * Issue a procurement package to recipients.
 * Records issuance event in audit trail with packageId, recipient count, timestamp.
 * Checks for model supersession and warns if outdated.
 * Roles: BIM_EXPORT_ROLES (quantity_surveyor, contractor, platform_admin)
 *
 * Requirements: 9.5, 9.6
 */
router.post(
  '/procurement/:packageId/issue',
  checkBimRole(BIM_EXPORT_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { packageId } = req.params;
      const { recipients, projectId, tradeSectionName, boqId } = req.body;
      const actorUid = req.authContext?.uid || 'unknown';
      const recipientCount = Array.isArray(recipients) ? recipients.length : 0;

      // ── Integration: Procurement issuance via bimSpecForgeIntegration ────
      // Records audit event, checks model supersession (Req 9.5, 9.6)
      if (projectId) {
        // Build a minimal ProcurementPackage for supersession check if boqId is present
        let pkg: import('@/services/bim/types').ProcurementPackage | undefined;
        if (boqId) {
          const boq = getBoq(boqId);
          if (boq) {
            pkg = {
              packageId,
              projectId,
              boqId,
              title: tradeSectionName || 'Package',
              tradeSections: [],
              lineItems: [],
              coverSheet: {
                projectName: '', projectNumber: '', packageTitle: '',
                issueDate: '', revisionNumber: '', qsContactName: '', qsContactEmail: '',
              },
              revision: boq.revision,
              modelSuperseded: false,
            };
          }
        }

        const issuanceResult = recordProcurementIssuance(
          packageId,
          projectId,
          recipientCount,
          actorUid,
          pkg,
        );

        // Also emit passport event via the existing integration service
        onProcurementPackageIssued({
          packageId,
          projectId,
          tradeSectionName: tradeSectionName || 'Unknown',
          recipientCount,
          actorUid,
        });

        res.status(200).json({
          packageId,
          status: 'issued',
          recipientCount,
          issuedAt: issuanceResult.issuedAt,
          auditRecorded: issuanceResult.auditRecorded,
          modelSupersessionWarning: issuanceResult.supersessionWarning || null,
        });
      } else {
        // Still emit audit even without full passport event
        emitAuditEvent('bim_procurement_package_issued', actorUid, packageId, '', {
          recipientCount,
        });

        res.status(200).json({
          packageId,
          status: 'issued',
          recipientCount,
          issuedAt: new Date().toISOString(),
          auditRecorded: true,
          modelSupersessionWarning: null,
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message });
    }
  },
);

/**
 * GET /api/bim/procurement/:projectId
 *
 * List procurement packages for a project.
 * Roles: BIM_EXPORT_ROLES (quantity_surveyor, contractor, platform_admin)
 *
 * Requirement: 9.1
 */
router.get(
  '/procurement/:projectId',
  checkBimRole(BIM_EXPORT_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId } = req.params;

      // Stub: In production, queries Firestore for packages belonging to projectId
      res.status(200).json({
        projectId,
        packages: [],
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: 'INTERNAL_ERROR', message });
    }
  },
);

// ── SpecForge Integration Routes ──────────────────────────────────────────────

/**
 * POST /api/bim/specforge/sync/:boqId
 *
 * Create SpecForge specification items from a generated BoQ.
 * Orchestrates: fetch BoQ → create spec items → store links → return results.
 * Roles: BIM_EXTRACT_ROLES (quantity_surveyor, architect, engineer, platform_admin)
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */
router.post(
  '/specforge/sync/:boqId',
  checkBimRole(BIM_EXTRACT_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { boqId } = req.params;
      const { workspaceId } = req.body;
      const actorUid = req.authContext?.uid || 'unknown';

      if (!workspaceId) {
        const errorResponse: BimErrorResponse = {
          error: 'VALIDATION_ERROR',
          message: 'Missing required field: workspaceId is required.',
        };
        res.status(400).json(errorResponse);
        return;
      }

      // Orchestrate the full SpecForge sync flow via bimSpecForgeIntegration
      const result = syncSpecForge(boqId, workspaceId, actorUid);

      res.status(200).json({
        boqId: result.boqId,
        workspaceId: result.workspaceId,
        linksCreated: result.linksCreated,
        sectionsCreated: result.sectionsCreated,
        links: result.links.map((link) => ({
          specForgeItemId: link.specForgeItemId,
          boqLineItemId: link.boqLineItemId,
          quantityAtLink: link.quantityAtLink,
          linkedAt: link.linkedAt,
        })),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('not found')) {
        res.status(404).json({ error: 'NOT_FOUND', message });
      } else {
        res.status(500).json({ error: 'INTERNAL_ERROR', message });
      }
    }
  },
);

/**
 * GET /api/bim/specforge/compare/:boqId
 *
 * Compare current extraction with previous extraction for linked SpecForge items.
 * Returns added, removed, and changed quantities with user-override flags.
 * Roles: BIM_EXTRACT_ROLES (quantity_surveyor, architect, engineer, platform_admin)
 *
 * Requirements: 8.5, 8.6
 */
router.get(
  '/specforge/compare/:boqId',
  checkBimRole(BIM_EXTRACT_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { boqId } = req.params;

      // Orchestrate the comparison flow via bimSpecForgeIntegration
      const result = compareSpecForge(boqId);

      res.status(200).json({
        boqId: result.boqId,
        hasPreviousLinks: result.hasPreviousLinks,
        comparison: result.comparison,
        userOverriddenItems: result.userOverriddenItems.map((link) => ({
          specForgeItemId: link.specForgeItemId,
          boqLineItemId: link.boqLineItemId,
          quantityAtLink: link.quantityAtLink,
          currentModelQuantity: link.currentModelQuantity,
        })),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('not found')) {
        res.status(404).json({ error: 'NOT_FOUND', message });
      } else {
        res.status(500).json({ error: 'INTERNAL_ERROR', message });
      }
    }
  },
);

export default router;
