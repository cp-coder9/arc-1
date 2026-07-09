/**
 * Practice Management Professional Services — API Routes
 *
 * Firm-level practice management endpoints for architectural and engineering firms.
 * Handles timesheets, expenses, billing rates, fee tracking, WIP, profitability,
 * invoicing, resource planning, leave, write-offs, forecasting, dashboard, and pipeline.
 *
 * All service functions are pure (no Firestore dependency). Route handlers accept
 * data payloads in request bodies and delegate to pure service functions.
 * Persistence will be wired via the persistence layer in future tasks.
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4
 * @module practice-management-api-router
 */
import express from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';

import { requireAuth } from './roleMiddleware';
import type { PracticeRole } from '../services/practiceManagement/roleAccessService';
import {
  checkAccess,
  canApprove,
  canManageBillingRates,
  canAccessFirmWideViews,
  canManageInvoices,
} from '../services/practiceManagement/roleAccessService';
import {
  timesheetSubmissionSchema,
  createExpenseClaimSchema,
  createBillingRateSchema,
  projectFeeStructureSchema,
  createPracticeInvoiceSchema,
  leaveRequestSchema,
  createWriteOffSchema,
  createPipelineOpportunitySchema,
} from '../services/practiceManagement/schemas';
import type {
  CreateExpenseClaimInput,
  CreateBillingRateInput,
  CreateWriteOffInput,
  LeaveRequestInput,
  CreatePracticeInvoiceInput,
} from '../services/practiceManagement/types';
import type {
  DefineProjectFeeInput,
} from '../services/practiceManagement/feeTrackerService';
import {
  submitWeeklyTimesheet,
  approveSubmission,
  rejectSubmission,
  getSubmissionsForApproval,
  getMySubmissions,
} from '../services/practiceManagement/timesheetEngineService';
import {
  createExpenseClaim,
  approveClaim,
  rejectClaim,
  getProjectExpenses,
} from '../services/practiceManagement/expenseManagerService';
import {
  createRate,
  getAllRates,
} from '../services/practiceManagement/billingRateTableService';
import {
  defineProjectFee,
  checkFeeHealth,
} from '../services/practiceManagement/feeTrackerService';
import {
  calculateProjectWip,
  getFirmWipReport,
} from '../services/practiceManagement/wipEngineService';
import {
  calculateProjectMargin,
  getFirmProfitability,
} from '../services/practiceManagement/profitabilityCalculatorService';
import {
  createInvoice,
  updateInvoiceStatus,
  getProjectInvoices,
} from '../services/practiceManagement/practiceInvoiceManagerService';
import {
  getCapacityView,
} from '../services/practiceManagement/resourcePlannerService';
import {
  requestLeave,
  approveLeave,
  rejectLeave,
  getLeaveBalance,
} from '../services/practiceManagement/leaveManagerService';
import {
  createWriteOff,
  getProjectWriteOffs,
} from '../services/practiceManagement/writeOffTrackerService';
import {
  generateForecast,
} from '../services/practiceManagement/incomeForecastService';
import {
  getSummaryMetrics,
  getProjectPortfolio,
  getUtilisationMetrics,
} from '../services/practiceManagement/firmDashboardService';
import {
  createOpportunity,
  updateOpportunity,
  winOpportunity,
} from '../services/practiceManagement/crmPipelineService';

const router = express.Router();

// All practice management routes require authentication
router.use(requireAuth);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Map the auth context role to a PracticeRole. */
function getUserRole(req: Request): PracticeRole {
  const role = req.authContext?.role;
  if (role === 'architect' || role === 'bep') return role as PracticeRole;
  if (role === 'firm_admin') return 'firm_admin';
  if (role === 'client') return 'client';
  if (role === 'freelancer') return 'freelancer';
  return 'staff';
}

/** Validate request body against a Zod schema. Returns parsed data or sends 400. */
function validateBody<T>(
  schema: z.ZodSchema<T>,
  req: Request,
  res: Response,
): T | null {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: result.error.flatten().fieldErrors,
    });
    return null;
  }
  return result.data;
}

// ─── Timesheets ──────────────────────────────────────────────────────────────

/** POST /api/practice/timesheets/submit — Submit weekly timesheet for approval. */
router.post('/timesheets/submit', async (req: Request, res: Response) => {
  try {
    const data = validateBody(timesheetSubmissionSchema, req, res);
    if (!data) return;
    const { approverId, existingEntries } = req.body;
    if (!approverId) {
      return res.status(400).json({ error: 'approverId is required.' });
    }
    const result = submitWeeklyTimesheet(
      data.userId,
      data.firmId,
      data.weekStartDate,
      existingEntries ?? [],
      approverId,
    );
    return res.status(201).json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/** PATCH /api/practice/timesheets/submissions/:id/approve */
router.patch('/timesheets/submissions/:id/approve', async (req: Request, res: Response) => {
  try {
    const role = getUserRole(req);
    if (!canApprove(role)) {
      return res.status(403).json({ error: 'Only architect, bep, or firm_admin can approve timesheets.' });
    }
    const { submission, entries } = req.body;
    if (!submission || !entries) {
      return res.status(400).json({ error: 'submission and entries[] required.' });
    }
    const approverId = req.authContext?.uid ?? 'unknown';
    const result = approveSubmission(submission, approverId, entries);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/** PATCH /api/practice/timesheets/submissions/:id/reject */
router.patch('/timesheets/submissions/:id/reject', async (req: Request, res: Response) => {
  try {
    const role = getUserRole(req);
    if (!canApprove(role)) {
      return res.status(403).json({ error: 'Only architect, bep, or firm_admin can reject timesheets.' });
    }
    const { submission, reason, entries } = req.body;
    if (!submission || !reason || !entries) {
      return res.status(400).json({ error: 'submission, reason, and entries[] required.' });
    }
    const rejectorId = req.authContext?.uid ?? 'unknown';
    const result = rejectSubmission(submission, rejectorId, reason, entries);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/** GET /api/practice/timesheets/submissions — List submissions. */
router.get('/timesheets/submissions', async (req: Request, res: Response) => {
  try {
    const role = getUserRole(req);
    const userId = req.authContext?.uid ?? '';
    const firmId = req.query.firmId as string;
    if (!firmId) {
      return res.status(400).json({ error: 'firmId query parameter required.' });
    }
    const { submissions } = req.body;
    if (!submissions) {
      return res.status(400).json({ error: 'submissions[] required in body.' });
    }
    if (canApprove(role)) {
      return res.json(getSubmissionsForApproval(submissions, firmId));
    }
    return res.json(getMySubmissions(submissions, userId, firmId));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Expenses ────────────────────────────────────────────────────────────────

/** POST /api/practice/expenses — Create expense claim. */
router.post('/expenses', async (req: Request, res: Response) => {
  try {
    const data = validateBody(createExpenseClaimSchema, req, res);
    if (!data) return;
    const claim = createExpenseClaim(data as unknown as CreateExpenseClaimInput);
    return res.status(201).json(claim);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/** PATCH /api/practice/expenses/:id/approve */
router.patch('/expenses/:id/approve', async (req: Request, res: Response) => {
  try {
    const role = getUserRole(req);
    if (!canApprove(role)) {
      return res.status(403).json({ error: 'Only architect, bep, or firm_admin can approve expenses.' });
    }
    const { claims } = req.body;
    if (!claims) {
      return res.status(400).json({ error: 'claims[] required in body.' });
    }
    const approverId = req.authContext?.uid ?? 'unknown';
    const result = approveClaim(claims, req.params.id, approverId);
    if (!result) {
      return res.status(404).json({ error: 'Claim not found or not in pending_approval status.' });
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/** PATCH /api/practice/expenses/:id/reject */
router.patch('/expenses/:id/reject', async (req: Request, res: Response) => {
  try {
    const role = getUserRole(req);
    if (!canApprove(role)) {
      return res.status(403).json({ error: 'Only architect, bep, or firm_admin can reject expenses.' });
    }
    const { claims, reason } = req.body;
    if (!claims || !reason) {
      return res.status(400).json({ error: 'claims[] and reason required.' });
    }
    const rejectorId = req.authContext?.uid ?? 'unknown';
    const result = rejectClaim(claims, req.params.id, rejectorId, reason);
    if (!result) {
      return res.status(404).json({ error: 'Claim not found or not in pending_approval status.' });
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/** GET /api/practice/expenses — List expenses for a project. */
router.get('/expenses', async (req: Request, res: Response) => {
  try {
    const firmId = req.query.firmId as string;
    const projectId = req.query.projectId as string;
    if (!firmId || !projectId) {
      return res.status(400).json({ error: 'firmId and projectId query parameters required.' });
    }
    const { claims } = req.body;
    if (!claims) {
      return res.status(400).json({ error: 'claims[] required in body.' });
    }
    return res.json(getProjectExpenses(claims, firmId, projectId));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Billing Rates ───────────────────────────────────────────────────────────

/** GET /api/practice/billing-rates — List billing rates for a firm. */
router.get('/billing-rates', async (req: Request, res: Response) => {
  try {
    const role = getUserRole(req);
    const accessResult = checkAccess({
      userId: req.authContext?.uid ?? '',
      userRole: role,
      firmId: req.query.firmId as string || '',
      resource: 'billing_rates',
    });
    if (!accessResult.allowed) {
      return res.status(403).json({ error: accessResult.reason });
    }
    const firmId = req.query.firmId as string;
    if (!firmId) {
      return res.status(400).json({ error: 'firmId query parameter required.' });
    }
    const { rates } = req.body;
    if (!rates) {
      return res.status(400).json({ error: 'rates[] required in body.' });
    }
    return res.json(getAllRates(rates, firmId));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/** POST /api/practice/billing-rates — Create a new billing rate. */
router.post('/billing-rates', async (req: Request, res: Response) => {
  try {
    const role = getUserRole(req);
    if (!canManageBillingRates(role)) {
      return res.status(403).json({ error: 'Only firm_admin can create billing rates.' });
    }
    const data = validateBody(createBillingRateSchema, req, res);
    if (!data) return;
    const createdBy = req.authContext?.uid ?? 'unknown';
    const rate = createRate(data as unknown as CreateBillingRateInput, createdBy);
    return res.status(201).json(rate);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Fees ────────────────────────────────────────────────────────────────────

/** GET /api/practice/fees/:projectId — Get fee structure health. */
router.get('/fees/:projectId', async (req: Request, res: Response) => {
  try {
    const role = getUserRole(req);
    const accessResult = checkAccess({
      userId: req.authContext?.uid ?? '',
      userRole: role,
      firmId: req.query.firmId as string || '',
      resource: role === 'client' ? 'project_fee_summary_readonly' : 'project_fee_tracking',
      projectId: req.params.projectId,
    });
    if (!accessResult.allowed) {
      return res.status(403).json({ error: accessResult.reason });
    }
    const { feeStructure, stageCosts } = req.body;
    if (!feeStructure) {
      return res.status(400).json({ error: 'feeStructure object required in body.' });
    }
    const health = checkFeeHealth(feeStructure, stageCosts || []);
    return res.json(health);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/** POST /api/practice/fees/:projectId — Define/update fee structure. */
router.post('/fees/:projectId', async (req: Request, res: Response) => {
  try {
    const role = getUserRole(req);
    if (!canApprove(role) && role !== 'firm_admin') {
      return res.status(403).json({ error: 'Only architect, bep, or firm_admin can define fees.' });
    }
    const data = validateBody(projectFeeStructureSchema, req, res);
    if (!data) return;
    const createdBy = req.authContext?.uid ?? 'unknown';
    const feeStructure = defineProjectFee({
      firmId: data.firmId,
      projectId: data.projectId,
      totalAgreedFeeCents: data.totalAgreedFeeCents,
      feeBasis: data.feeBasis,
      constructionCostCents: data.constructionCostCents,
      stageBreakdown: data.stageBreakdown,
      createdBy,
    } as DefineProjectFeeInput);
    return res.status(201).json(feeStructure);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── WIP ─────────────────────────────────────────────────────────────────────

/** GET /api/practice/wip — Firm WIP report. */
router.get('/wip', async (req: Request, res: Response) => {
  try {
    const role = getUserRole(req);
    if (!canAccessFirmWideViews(role)) {
      return res.status(403).json({ error: 'Only firm_admin can access firm-wide WIP report.' });
    }
    const { firmId, feeStructures, costDataByProject } = req.body;
    if (!firmId || !feeStructures || !costDataByProject) {
      return res.status(400).json({ error: 'firmId, feeStructures[], and costDataByProject required.' });
    }
    const costMap = new Map(Object.entries(costDataByProject));
    const report = getFirmWipReport(firmId, feeStructures, costMap as any);
    return res.json(report);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/** GET /api/practice/wip/:projectId — Project WIP position. */
router.get('/wip/:projectId', async (req: Request, res: Response) => {
  try {
    const role = getUserRole(req);
    const accessResult = checkAccess({
      userId: req.authContext?.uid ?? '',
      userRole: role,
      firmId: req.query.firmId as string || '',
      resource: 'project_wip',
      projectId: req.params.projectId,
    });
    if (!accessResult.allowed) {
      return res.status(403).json({ error: accessResult.reason });
    }
    const { feeStructure, costData } = req.body;
    if (!feeStructure || !costData) {
      return res.status(400).json({ error: 'feeStructure and costData required in body.' });
    }
    const wip = calculateProjectWip(feeStructure, costData);
    return res.json(wip);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Profitability ───────────────────────────────────────────────────────────

/** GET /api/practice/profitability — Firm profitability report. */
router.get('/profitability', async (req: Request, res: Response) => {
  try {
    const role = getUserRole(req);
    if (!canAccessFirmWideViews(role)) {
      return res.status(403).json({ error: 'Only firm_admin can access firm-wide profitability.' });
    }
    const { firmId, projectInputs } = req.body;
    if (!firmId || !projectInputs) {
      return res.status(400).json({ error: 'firmId and projectInputs[] required.' });
    }
    const report = getFirmProfitability(firmId, projectInputs);
    return res.json(report);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/** GET /api/practice/profitability/:projectId — Project profitability. */
router.get('/profitability/:projectId', async (req: Request, res: Response) => {
  try {
    const role = getUserRole(req);
    const accessResult = checkAccess({
      userId: req.authContext?.uid ?? '',
      userRole: role,
      firmId: req.query.firmId as string || '',
      resource: 'project_profitability',
      projectId: req.params.projectId,
    });
    if (!accessResult.allowed) {
      return res.status(403).json({ error: accessResult.reason });
    }
    const { input } = req.body;
    if (!input) {
      return res.status(400).json({ error: 'input (ProfitabilityInput) required in body.' });
    }
    const result = calculateProjectMargin(input);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Invoices ────────────────────────────────────────────────────────────────

/** POST /api/practice/invoices — Create practice invoice. */
router.post('/invoices', async (req: Request, res: Response) => {
  try {
    const role = getUserRole(req);
    if (!canManageInvoices(role)) {
      return res.status(403).json({ error: 'Only firm_admin can create invoices.' });
    }
    const data = validateBody(createPracticeInvoiceSchema, req, res);
    if (!data) return;
    const { timesheetEntries } = req.body;
    const invoice = createInvoice(data as unknown as CreatePracticeInvoiceInput, timesheetEntries);
    return res.status(201).json(invoice);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/** PATCH /api/practice/invoices/:id/status — Update invoice status. */
router.patch('/invoices/:id/status', async (req: Request, res: Response) => {
  try {
    const role = getUserRole(req);
    if (!canManageInvoices(role)) {
      return res.status(403).json({ error: 'Only firm_admin can update invoice status.' });
    }
    const { invoice, newStatus } = req.body;
    if (!invoice || !newStatus) {
      return res.status(400).json({ error: 'invoice and newStatus required.' });
    }
    const result = updateInvoiceStatus(invoice, newStatus);
    if (!result) {
      return res.status(400).json({ error: 'Invalid status transition.' });
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/** GET /api/practice/invoices — List invoices for a project. */
router.get('/invoices', async (req: Request, res: Response) => {
  try {
    const role = getUserRole(req);
    const resource = role === 'client' ? 'invoice_history_readonly' : 'invoicing';
    const accessResult = checkAccess({
      userId: req.authContext?.uid ?? '',
      userRole: role,
      firmId: req.query.firmId as string || '',
      resource,
      projectId: req.query.projectId as string,
    });
    if (!accessResult.allowed) {
      return res.status(403).json({ error: accessResult.reason });
    }
    const projectId = req.query.projectId as string;
    if (!projectId) {
      return res.status(400).json({ error: 'projectId query parameter required.' });
    }
    const { invoices } = req.body;
    if (!invoices) {
      return res.status(400).json({ error: 'invoices[] required in body.' });
    }
    return res.json(getProjectInvoices(invoices, projectId));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Resource Capacity ───────────────────────────────────────────────────────

/** GET /api/practice/capacity — Resource capacity view. */
router.get('/capacity', async (req: Request, res: Response) => {
  try {
    const role = getUserRole(req);
    if (!canAccessFirmWideViews(role)) {
      return res.status(403).json({ error: 'Only firm_admin can access resource capacity.' });
    }
    const {
      firmId, teamMembers, allocations,
      leaveRequests, pipelineOpportunities, config,
    } = req.body;
    if (!firmId || !teamMembers) {
      return res.status(400).json({ error: 'firmId and teamMembers[] required.' });
    }
    const view = getCapacityView(
      firmId,
      teamMembers,
      allocations || [],
      leaveRequests || [],
      pipelineOpportunities || [],
      config || { weeks: 4 },
    );
    return res.json(view);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Leave ───────────────────────────────────────────────────────────────────

/** POST /api/practice/leave — Request leave. */
router.post('/leave', async (req: Request, res: Response) => {
  try {
    const data = validateBody(leaveRequestSchema, req, res);
    if (!data) return;
    const { balances, publicHolidays } = req.body;
    const result = requestLeave(data as unknown as LeaveRequestInput, balances || [], publicHolidays);
    if ('error' in result) {
      return res.status(400).json({ error: result.error });
    }
    return res.status(201).json(result.request);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/** PATCH /api/practice/leave/:id/approve — Approve leave request. */
router.patch('/leave/:id/approve', async (req: Request, res: Response) => {
  try {
    const role = getUserRole(req);
    if (!canApprove(role)) {
      return res.status(403).json({ error: 'Only architect, bep, or firm_admin can approve leave.' });
    }
    const { requests } = req.body;
    if (!requests) {
      return res.status(400).json({ error: 'requests[] required in body.' });
    }
    const approverId = req.authContext?.uid ?? 'unknown';
    const result = approveLeave(requests, req.params.id, approverId);
    if (!result) {
      return res.status(404).json({ error: 'Leave request not found or not in pending status.' });
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/** PATCH /api/practice/leave/:id/reject — Reject leave request. */
router.patch('/leave/:id/reject', async (req: Request, res: Response) => {
  try {
    const role = getUserRole(req);
    if (!canApprove(role)) {
      return res.status(403).json({ error: 'Only architect, bep, or firm_admin can reject leave.' });
    }
    const { requests, reason } = req.body;
    if (!requests || !reason) {
      return res.status(400).json({ error: 'requests[] and reason required.' });
    }
    const rejectorId = req.authContext?.uid ?? 'unknown';
    const result = rejectLeave(requests, req.params.id, rejectorId, reason);
    if (!result) {
      return res.status(404).json({ error: 'Leave request not found or not in pending status.' });
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/** GET /api/practice/leave/balance/:userId — Leave balance. */
router.get('/leave/balance/:userId', async (req: Request, res: Response) => {
  try {
    const role = getUserRole(req);
    const requestingUserId = req.authContext?.uid ?? '';
    const targetUserId = req.params.userId;

    // Staff/freelancer can only see their own balance
    if ((role === 'staff' || role === 'freelancer') && requestingUserId !== targetUserId) {
      return res.status(403).json({ error: 'Cannot view other users\' leave balance.' });
    }

    const firmId = req.query.firmId as string;
    const leaveType = req.query.leaveType as string;
    if (!firmId || !leaveType) {
      return res.status(400).json({ error: 'firmId and leaveType query parameters required.' });
    }
    const { balances } = req.body;
    if (!balances) {
      return res.status(400).json({ error: 'balances[] required in body.' });
    }
    const balance = getLeaveBalance(balances, targetUserId, firmId, leaveType as any);
    return res.json(balance);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Write-Offs ──────────────────────────────────────────────────────────────

/** POST /api/practice/write-offs — Create write-off. */
router.post('/write-offs', async (req: Request, res: Response) => {
  try {
    const role = getUserRole(req);
    const accessResult = checkAccess({
      userId: req.authContext?.uid ?? '',
      userRole: role,
      firmId: req.body.firmId || '',
      resource: 'write_offs',
    });
    if (!accessResult.allowed) {
      return res.status(403).json({ error: accessResult.reason });
    }
    const data = validateBody(createWriteOffSchema, req, res);
    if (!data) return;
    const writeOff = createWriteOff(data as unknown as CreateWriteOffInput);
    return res.status(201).json(writeOff);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/** GET /api/practice/write-offs/:projectId — Project write-offs. */
router.get('/write-offs/:projectId', async (req: Request, res: Response) => {
  try {
    const role = getUserRole(req);
    const accessResult = checkAccess({
      userId: req.authContext?.uid ?? '',
      userRole: role,
      firmId: req.query.firmId as string || '',
      resource: 'write_offs',
      projectId: req.params.projectId,
    });
    if (!accessResult.allowed) {
      return res.status(403).json({ error: accessResult.reason });
    }
    const { entries, feeStructures } = req.body;
    if (!entries || !feeStructures) {
      return res.status(400).json({ error: 'entries[] and feeStructures[] required in body.' });
    }
    const summary = getProjectWriteOffs(entries, feeStructures, req.params.projectId);
    return res.json(summary);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Forecast ────────────────────────────────────────────────────────────────

/** GET /api/practice/forecast — Income forecast. */
router.get('/forecast', async (req: Request, res: Response) => {
  try {
    const role = getUserRole(req);
    if (!canAccessFirmWideViews(role)) {
      return res.status(403).json({ error: 'Only firm_admin can access income forecast.' });
    }
    const { firmId, projects, pipelineEntries } = req.body;
    if (!firmId || !projects) {
      return res.status(400).json({ error: 'firmId and projects[] required.' });
    }
    const months = Number(req.query.months) || 12;
    const forecast = generateForecast(firmId, projects, pipelineEntries || [], months);
    return res.json(forecast);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Dashboard ───────────────────────────────────────────────────────────────

/** GET /api/practice/dashboard — Firm dashboard metrics. */
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const role = getUserRole(req);
    if (!canAccessFirmWideViews(role)) {
      return res.status(403).json({ error: 'Only firm_admin can access firm dashboard.' });
    }
    const { input } = req.body;
    if (!input) {
      return res.status(400).json({ error: 'input (FirmDashboardInput) required.' });
    }
    const metrics = getSummaryMetrics(input);
    return res.json(metrics);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/** GET /api/practice/dashboard/portfolio — Project portfolio. */
router.get('/dashboard/portfolio', async (req: Request, res: Response) => {
  try {
    const role = getUserRole(req);
    if (!canAccessFirmWideViews(role)) {
      return res.status(403).json({ error: 'Only firm_admin can access project portfolio.' });
    }
    const { projects } = req.body;
    if (!projects) {
      return res.status(400).json({ error: 'projects[] required.' });
    }
    return res.json(getProjectPortfolio(projects));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/** GET /api/practice/dashboard/utilisation — Utilisation metrics. */
router.get('/dashboard/utilisation', async (req: Request, res: Response) => {
  try {
    const role = getUserRole(req);
    if (!canAccessFirmWideViews(role)) {
      return res.status(403).json({ error: 'Only firm_admin can access utilisation metrics.' });
    }
    const { personTimesheets } = req.body;
    if (!personTimesheets) {
      return res.status(400).json({ error: 'personTimesheets[] required.' });
    }
    return res.json(getUtilisationMetrics(personTimesheets));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Pipeline ────────────────────────────────────────────────────────────────

/** POST /api/practice/pipeline — Create pipeline opportunity. */
router.post('/pipeline', async (req: Request, res: Response) => {
  try {
    const role = getUserRole(req);
    if (!canAccessFirmWideViews(role)) {
      return res.status(403).json({ error: 'Only firm_admin can create pipeline opportunities.' });
    }
    const data = validateBody(createPipelineOpportunitySchema, req, res);
    if (!data) return;
    // The service CreatePipelineOpportunityInput requires projectId
    const { projectId } = req.body;
    const opportunity = createOpportunity({
      ...data,
      projectId: projectId || `pipeline_${Date.now()}`,
    } as any);
    return res.status(201).json(opportunity);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/** PATCH /api/practice/pipeline/:id — Update pipeline opportunity. */
router.patch('/pipeline/:id', async (req: Request, res: Response) => {
  try {
    const role = getUserRole(req);
    if (!canAccessFirmWideViews(role)) {
      return res.status(403).json({ error: 'Only firm_admin can update pipeline opportunities.' });
    }
    const { opportunity, updates } = req.body;
    if (!opportunity || !updates) {
      return res.status(400).json({ error: 'opportunity and updates required.' });
    }
    const result = updateOpportunity(opportunity, updates);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/** POST /api/practice/pipeline/:id/win — Mark opportunity as won. */
router.post('/pipeline/:id/win', async (req: Request, res: Response) => {
  try {
    const role = getUserRole(req);
    if (!canAccessFirmWideViews(role)) {
      return res.status(403).json({ error: 'Only firm_admin can mark opportunities as won.' });
    }
    const { opportunity } = req.body;
    if (!opportunity) {
      return res.status(400).json({ error: 'opportunity object required.' });
    }
    const result = winOpportunity(opportunity);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
