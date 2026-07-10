/**
 * Forms API Router — Integrated Form System
 *
 * All endpoints for form template management, form instances, PDF export,
 * digital signatures, collaboration, drafts, audit trail, and auto-fill preview.
 *
 * Requirements: 1.2, 1.6, 2.6, 3.1, 4.1, 5.1, 6.6, 7.4, 8.1, 9.1, 9.2, 9.4, 12.1
 */
import express from 'express';
import type { Request, Response } from 'express';
import { requireAuth, requireAdmin } from '../lib/roleMiddleware';
import { canPerformAction } from '../services/forms/formPermissionService';

// ─── Service Imports ────────────────────────────────────────────────────────

import {
  createTemplate as createTemplateService,
  getTemplate,
  searchTemplates as searchTemplatesService,
  updateTemplate as updateTemplateService,
} from '../services/forms/formTemplateService';
import {
  createFormInstance as createInstanceService,
  getFormInstance,
  updateFormFields,
  deleteFormInstance as deleteInstanceService,
} from '../services/forms/formInstanceService';
import { exportFormToPdf, batchExport } from '../services/forms/pdfExportService';
import { applySignature as applySignatureService } from '../services/forms/signatureService';
import {
  shareForm as shareFormService,
  revokeShare as revokeShareService,
} from '../services/forms/collaborationService';
import { getAuditTrail as getAuditTrailService } from '../services/forms/formAuditService';
import { resolveAutoFill } from '../services/forms/autoFillEngine';
import {
  writeToDocumentRegister,
  updateMunicipalReadiness,
  writeToProjectPassport,
  queueFailedIntegration,
} from '../services/forms/formIntegrationService';

import type { TemplateFilters, FormCategory } from '../services/forms/formTypes';
import { Timestamp } from 'firebase/firestore';

export const formsApiRouter = express.Router();
const router = formsApiRouter;

// All forms routes require authentication
router.use(requireAuth);

// ─────────────────────────────────────────────────────────────────────────────
// Template Management (admin-only for create/update)
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/forms/templates — Create a new form template (requires platform_admin role) */
router.post('/api/forms/templates', async (req: Request, res: Response) => {
  try {
    const role = req.authContext?.role;
    if (!role || !canPerformAction(role, 'manage_templates')) {
      return res.status(403).json({ error: 'Insufficient permissions. Platform admin role required to manage templates.' });
    }

    const { name, category, formType, municipalities, lifecycleStages, schema, fieldMappings, requiredSignatures, version, isLatest, createdBy } = req.body;

    if (!name || !category || !formType) {
      return res.status(400).json({ error: 'name, category, and formType are required.' });
    }

    const template = await createTemplateService({
      name,
      category,
      formType,
      municipalities: municipalities || [],
      lifecycleStages: lifecycleStages || [],
      version: version ?? 1,
      isLatest: isLatest ?? true,
      schema: schema || { sections: [], layout: {} },
      fieldMappings: fieldMappings || [],
      requiredSignatures: requiredSignatures || [],
      createdBy: createdBy || req.authContext!.uid,
    });

    return res.status(201).json(template);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to create template.' });
  }
});

/** GET /api/forms/templates — Search/filter templates with pagination */
router.get('/api/forms/templates', async (req: Request, res: Response) => {
  try {
    const filters: TemplateFilters = {};

    if (req.query.category) filters.category = req.query.category as any;
    if (req.query.municipality) filters.municipality = req.query.municipality as string;
    if (req.query.lifecycleStage) filters.lifecycleStage = req.query.lifecycleStage as any;
    if (req.query.formType) filters.formType = req.query.formType as string;
    if (req.query.search) filters.search = req.query.search as string;
    if (req.query.page) filters.page = parseInt(req.query.page as string, 10);
    if (req.query.pageSize) filters.pageSize = parseInt(req.query.pageSize as string, 10);

    const priorityMunicipality = req.query.priorityMunicipality as string | undefined;

    const result = await searchTemplatesService(filters, priorityMunicipality);
    return res.status(200).json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to search templates.' });
  }
});

/** GET /api/forms/templates/:id — Get a single template by ID */
router.get('/api/forms/templates/:id', async (req: Request, res: Response) => {
  try {
    const template = await getTemplate(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found.' });
    }
    return res.status(200).json(template);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to get template.' });
  }
});

/** PATCH /api/forms/templates/:id — Update a template (requires platform_admin role) */
router.patch('/api/forms/templates/:id', async (req: Request, res: Response) => {
  try {
    const role = req.authContext?.role;
    if (!role || !canPerformAction(role, 'manage_templates')) {
      return res.status(403).json({ error: 'Insufficient permissions. Platform admin role required to manage templates.' });
    }

    const updated = await updateTemplateService(req.params.id, req.body);
    return res.status(200).json(updated);
  } catch (err: any) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message || 'Failed to update template.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Form Instances
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/forms/instances — Create a new form instance from a template */
router.post('/api/forms/instances', async (req: Request, res: Response) => {
  try {
    const { templateId, projectId, clientId, formCategory } = req.body;

    if (!templateId) {
      return res.status(400).json({ error: 'templateId is required.' });
    }

    const uid = req.authContext!.uid;
    const role = req.authContext?.role;
    const userName = req.authContext?.userData?.displayName || req.authContext?.decoded?.name || 'Unknown';

    // Check create permission (formCategory is optional for permission check)
    if (role && !canPerformAction(role, 'create', formCategory as FormCategory | undefined)) {
      return res.status(403).json({ error: 'Insufficient permissions to create form instances.' });
    }

    const instance = await createInstanceService(
      templateId,
      projectId || null,
      uid,
      userName,
      clientId || null
    );
    return res.status(201).json(instance);
  } catch (err: any) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message || 'Failed to create form instance.' });
  }
});

/** GET /api/forms/instances/:id — Get a form instance */
router.get('/api/forms/instances/:id', async (req: Request, res: Response) => {
  try {
    const instance = await getFormInstance(req.params.id);
    if (!instance) {
      return res.status(404).json({ error: 'Form instance not found.' });
    }
    return res.status(200).json(instance);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to get form instance.' });
  }
});

/** PATCH /api/forms/instances/:id/fields — Update field values (authenticated + permission check) */
router.patch('/api/forms/instances/:id/fields', async (req: Request, res: Response) => {
  try {
    const { fields, formCategory } = req.body;

    if (!fields || typeof fields !== 'object') {
      return res.status(400).json({ error: 'fields object is required.' });
    }

    const uid = req.authContext!.uid;
    const role = req.authContext?.role;
    const userName = req.authContext?.userData?.displayName || req.authContext?.decoded?.name || 'Unknown';

    // Check edit permission
    if (role && !canPerformAction(role, 'edit', formCategory as FormCategory | undefined)) {
      return res.status(403).json({ error: 'Insufficient permissions to edit form instances.' });
    }

    const updated = await updateFormFields(req.params.id, fields, uid, userName);
    return res.status(200).json(updated);
  } catch (err: any) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message || 'Failed to update fields.' });
  }
});

/** DELETE /api/forms/instances/:id — Delete a form instance */
router.delete('/api/forms/instances/:id', async (req: Request, res: Response) => {
  try {
    await deleteInstanceService(req.params.id);
    return res.status(204).send();
  } catch (err: any) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message || 'Failed to delete form instance.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Export & Integration
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/forms/instances/:id/export — Generate PDF and trigger integration writes */
router.post('/api/forms/instances/:id/export', async (req: Request, res: Response) => {
  try {
    const instanceId = req.params.id;
    const userId = req.authContext!.uid;
    const { format, instanceIds, combineIntoOne } = req.body;

    // Single or batch export
    let result;
    if (format === 'batch' && Array.isArray(instanceIds)) {
      const results = await batchExport(instanceIds, combineIntoOne ?? false);
      const allSuccess = results.every((r) => r.success);
      if (!allSuccess) {
        const failures = results.filter((r) => !r.success);
        return res.status(422).json({
          error: 'Some exports failed.',
          results,
          failures,
        });
      }
      result = { success: true, results };
    } else {
      result = await exportFormToPdf({ instanceId, format: 'single' });
    }

    if (!result.success) {
      return res.status(422).json({
        error: 'Export failed — incomplete required fields.',
        errors: (result as any).errors,
      });
    }

    // Trigger integration writes (Document Register, Municipal Readiness, Project Passport)
    const instance = await getFormInstance(instanceId);
    if (instance && instance.projectId) {
      const template = await getTemplate(instance.templateId);
      const now = Timestamp.now();

      try {
        await writeToDocumentRegister(
          instanceId,
          template?.formType || 'unknown',
          instance.templateVersion,
          now,
          userId,
          instance.projectId
        );
      } catch {
        await queueFailedIntegration({
          id: `doc_reg_${instanceId}_${Date.now()}`,
          type: 'document_register',
          payload: { instanceId, formType: template?.formType, templateVersion: instance.templateVersion, exportDate: now, exporterId: userId, projectId: instance.projectId },
          retryCount: 0,
          createdAt: now,
          lastAttemptAt: now,
        });
      }

      // Municipal Readiness update for municipal submission forms
      if (template?.category === 'municipal_submission') {
        try {
          await updateMunicipalReadiness(instance.projectId, template.formType, 'ready_for_submission');
        } catch {
          await queueFailedIntegration({
            id: `mun_ready_${instanceId}_${Date.now()}`,
            type: 'municipal_readiness',
            payload: { projectId: instance.projectId, formType: template.formType, status: 'ready_for_submission' },
            retryCount: 0,
            createdAt: now,
            lastAttemptAt: now,
          });
        }
      }

      // Project Passport record
      try {
        await writeToProjectPassport(
          instance.projectId,
          template?.formType || 'unknown',
          template?.name || 'Untitled Form',
          now,
          'exported'
        );
      } catch {
        await queueFailedIntegration({
          id: `passport_${instanceId}_${Date.now()}`,
          type: 'project_passport',
          payload: { projectId: instance.projectId, formType: template?.formType, formTitle: template?.name, exportDate: now, projectStage: 'exported' },
          retryCount: 0,
          createdAt: now,
          lastAttemptAt: now,
        });
      }
    }

    return res.status(200).json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'PDF export failed.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Digital Signature
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/forms/instances/:id/sign — Apply a digital signature */
router.post('/api/forms/instances/:id/sign', async (req: Request, res: Response) => {
  try {
    const instanceId = req.params.id;
    const userId = req.authContext!.uid;
    const userName = req.authContext!.userData?.displayName || 'Unknown';
    const { role, signatureData } = req.body;

    if (!role || !signatureData) {
      return res.status(400).json({ error: 'role and signatureData are required.' });
    }

    const updated = await applySignatureService(instanceId, userId, userName, role, signatureData);
    return res.status(200).json(updated);
  } catch (err: any) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    if (err.message?.includes('not ready') || err.message?.includes('rejected')) {
      return res.status(422).json({ error: err.message });
    }
    if (err.message?.includes('already signed')) {
      return res.status(409).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message || 'Failed to apply signature.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Collaboration — Share / Revoke
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/forms/instances/:id/share — Share a form with a collaborator */
router.post('/api/forms/instances/:id/share', async (req: Request, res: Response) => {
  try {
    const instanceId = req.params.id;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId of the collaborator is required.' });
    }

    await shareFormService(instanceId, userId);
    return res.status(200).json({ message: 'Form shared successfully.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to share form.' });
  }
});

/** DELETE /api/forms/instances/:id/share/:userId — Revoke a collaborator's access */
router.delete('/api/forms/instances/:id/share/:userId', async (req: Request, res: Response) => {
  try {
    const { id: instanceId, userId } = req.params;
    await revokeShareService(instanceId, userId);
    return res.status(200).json({ message: 'Collaborator access revoked.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to revoke access.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Drafts
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/forms/drafts — Get the authenticated user's form drafts (max 50, sorted by updatedAt desc) */
router.get('/api/forms/drafts', async (req: Request, res: Response) => {
  try {
    const userId = req.authContext!.uid;

    // Query form_instances where createdBy == userId and status == 'draft'
    // Sorted by updatedAt desc, limited to 50
    const { adminDb } = await import('../lib/firebase-admin');
    const draftsSnapshot = await adminDb
      .collection('form_instances')
      .where('createdBy', '==', userId)
      .where('status', '==', 'draft')
      .orderBy('updatedAt', 'desc')
      .limit(50)
      .get();

    const drafts = draftsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.status(200).json({ drafts, total: drafts.length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to retrieve drafts.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Audit Trail
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/forms/instances/:id/audit — Get the chronological audit trail for a form instance */
router.get('/api/forms/instances/:id/audit', async (req: Request, res: Response) => {
  try {
    const instanceId = req.params.id;
    const events = await getAuditTrailService(instanceId);
    return res.status(200).json({ events });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to retrieve audit trail.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Auto-Fill Preview
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/forms/auto-fill-preview — Preview auto-fill resolution without creating an instance */
router.post('/api/forms/auto-fill-preview', async (req: Request, res: Response) => {
  try {
    const { templateId, projectId, clientId } = req.body;

    if (!templateId) {
      return res.status(400).json({ error: 'templateId is required.' });
    }

    const userId = req.authContext!.uid;
    const template = await getTemplate(templateId);

    if (!template) {
      return res.status(404).json({ error: 'Template not found.' });
    }

    const resolvedFields = await resolveAutoFill(template, {
      projectId: projectId || null,
      userId,
      clientId: clientId || null,
      fieldMappings: template.fieldMappings,
    });

    return res.status(200).json({ fields: resolvedFields });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to preview auto-fill.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

export default formsApiRouter;
