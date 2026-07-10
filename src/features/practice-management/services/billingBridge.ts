/**
 * Practice Management — Billing Bridge Service
 *
 * Pure business logic for invoice generation:
 * - compileDraftInvoice: aggregate approved unbilled entries + disbursements, calc subtotal/VAT/total
 * - approveInvoice: mark entries as invoiced, reduce WIP, create audit record
 * - Support three billing models: hourly, fixed_fee, percentage_of_construction
 * - Line items grouped by activity_category or staff_member
 *
 * Requirements: 10.6, 10.7, 10.8
 */

import type {
  TimesheetEntry,
  Disbursement,
  Invoice,
  InvoiceLineItem,
  BillingModel,
  ActivityCategory,
  ChargeOutRates,
} from '../types';

// ─── Service Result Pattern ───────────────────────────────────────────────────

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

// ─── Invoice Config ───────────────────────────────────────────────────────────

export interface InvoiceConfig {
  projectId: string;
  groupBy: 'activity_category' | 'staff_member';
  billingModel: BillingModel;
  /** For fixed_fee model: the milestone percentage to bill (0–100) */
  milestonePercentage?: number;
  /** For fixed_fee model: the total agreed fee for the project */
  totalFeeZAR?: number;
  /** For percentage_of_construction model: the construction cost basis */
  constructionCostZAR?: number;
  /** For percentage_of_construction model: the fee percentage to apply */
  feePercentage?: number;
  /** Charge-out rates for staff members (used for hourly model) */
  rates?: ChargeOutRates[];
}

// ─── Draft Invoice ────────────────────────────────────────────────────────────

export interface DraftInvoice {
  projectId: string;
  lineItems: InvoiceLineItem[];
  subtotalZAR: number;
  vatZAR: number;
  totalZAR: number;
  billingModel: BillingModel;
  entryIds: string[];
  disbursementIds: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VAT_RATE = 0.15;

// ─── Compile Draft Invoice ────────────────────────────────────────────────────

/**
 * Compile a draft invoice from approved timesheet entries and unbilled disbursements.
 *
 * Rules:
 * - Only include entries with status 'approved' (not draft, submitted, or invoiced)
 * - Only include disbursements with invoiced=false
 * - Line items grouped by activity_category or staff_member (from config.groupBy)
 * - subtotalZAR = sum of all line item amounts
 * - vatZAR = subtotalZAR × 0.15
 * - totalZAR = subtotalZAR + vatZAR
 *
 * Billing models:
 * - hourly: bill actual hours × charge-out rate per staff member
 * - fixed_fee: bill milestone percentage × total fee
 * - percentage_of_construction: bill fee percentage × construction cost
 *
 * Requirements: 10.6, 10.7
 */
export function compileDraftInvoice(
  entries: TimesheetEntry[],
  disbursements: Disbursement[],
  config: InvoiceConfig
): ServiceResult<DraftInvoice> {
  // Filter to approved-only entries for the project
  const approvedEntries = entries.filter(
    e => e.status === 'approved' && e.projectId === config.projectId && e.billable
  );

  // Filter to unbilled disbursements for the project
  const unbilledDisbursements = disbursements.filter(
    d => !d.invoiced && d.projectId === config.projectId
  );

  // Validate we have something to invoice
  if (approvedEntries.length === 0 && unbilledDisbursements.length === 0) {
    return {
      success: false,
      error: {
        code: 'NO_BILLABLE_ITEMS',
        message: 'No approved unbilled entries or unbilled disbursements found for this project.',
      },
    };
  }

  const lineItems: InvoiceLineItem[] = [];

  // Generate line items based on billing model
  switch (config.billingModel) {
    case 'hourly':
      lineItems.push(...generateHourlyLineItems(approvedEntries, config));
      break;

    case 'fixed_fee':
      lineItems.push(...generateFixedFeeLineItems(config));
      break;

    case 'percentage_of_construction':
      lineItems.push(...generatePercentageLineItems(config));
      break;

    default:
      return {
        success: false,
        error: {
          code: 'INVALID_BILLING_MODEL',
          message: `Unsupported billing model: ${config.billingModel}`,
        },
      };
  }

  // Add disbursement line items
  for (const disb of unbilledDisbursements) {
    lineItems.push({
      description: disb.description,
      amount: disb.amountZAR,
      category: 'disbursement',
    });
  }

  // Calculate totals
  const subtotalZAR = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const vatZAR = round2(subtotalZAR * VAT_RATE);
  const totalZAR = round2(subtotalZAR + vatZAR);

  const draft: DraftInvoice = {
    projectId: config.projectId,
    lineItems,
    subtotalZAR: round2(subtotalZAR),
    vatZAR,
    totalZAR,
    billingModel: config.billingModel,
    entryIds: approvedEntries.map(e => e.id),
    disbursementIds: unbilledDisbursements.map(d => d.id),
  };

  return { success: true, data: draft };
}

// ─── Approve Invoice ──────────────────────────────────────────────────────────

/**
 * Approve a draft invoice.
 *
 * On approval:
 * - Mark all included entries as 'invoiced'
 * - Return wipReduction = subtotalZAR (the invoiced amount reduces WIP)
 * - Create audit record data
 *
 * Requirements: 10.8
 */
export function approveInvoice(
  draft: DraftInvoice,
  approver: { uid: string; displayName: string },
  now: Date
): ServiceResult<{ invoice: Invoice; entriesMarked: string[]; wipReduction: number }> {
  if (!draft || !draft.lineItems || draft.lineItems.length === 0) {
    return {
      success: false,
      error: {
        code: 'INVALID_DRAFT',
        message: 'Draft invoice must have at least one line item.',
      },
    };
  }

  if (!approver || !approver.uid) {
    return {
      success: false,
      error: {
        code: 'INVALID_APPROVER',
        message: 'Approver identity is required.',
      },
    };
  }

  const nowISO = now.toISOString();
  const invoiceId = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const invoiceNumber = generateInvoiceNumber(now);

  const invoice: Invoice = {
    id: invoiceId,
    firmId: '', // populated by the persistence layer
    projectId: draft.projectId,
    invoiceNumber,
    lineItems: draft.lineItems,
    subtotalZAR: draft.subtotalZAR,
    vatZAR: draft.vatZAR,
    totalZAR: draft.totalZAR,
    status: 'approved',
    billingModel: draft.billingModel,
    approvedBy: approver.uid,
    approvedAt: nowISO,
    createdAt: nowISO,
    updatedAt: nowISO,
  };

  return {
    success: true,
    data: {
      invoice,
      entriesMarked: draft.entryIds,
      wipReduction: draft.subtotalZAR,
    },
  };
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

/**
 * Generate line items for hourly billing model, grouped by config.groupBy.
 */
function generateHourlyLineItems(
  entries: TimesheetEntry[],
  config: InvoiceConfig
): InvoiceLineItem[] {
  const rates = config.rates || [];

  if (config.groupBy === 'activity_category') {
    return groupByActivityCategory(entries, rates);
  } else {
    return groupByStaffMember(entries, rates);
  }
}

/**
 * Group entries by activity category, summing hours per category.
 */
function groupByActivityCategory(
  entries: TimesheetEntry[],
  rates: ChargeOutRates[]
): InvoiceLineItem[] {
  const groups = new Map<ActivityCategory, { hours: number; amount: number }>();

  for (const entry of entries) {
    const rate = findRate(entry.staffId, rates);
    const existing = groups.get(entry.activityCategory) || { hours: 0, amount: 0 };
    existing.hours += entry.hours;
    existing.amount += entry.hours * rate;
    groups.set(entry.activityCategory, existing);
  }

  const lineItems: InvoiceLineItem[] = [];
  for (const [category, data] of groups) {
    const avgRate = data.hours > 0 ? data.amount / data.hours : 0;
    lineItems.push({
      description: formatCategoryLabel(category),
      hours: round2(data.hours),
      rate: round2(avgRate),
      amount: round2(data.amount),
      category,
    });
  }

  return lineItems;
}

/**
 * Group entries by staff member, summing hours per staff member.
 */
function groupByStaffMember(
  entries: TimesheetEntry[],
  rates: ChargeOutRates[]
): InvoiceLineItem[] {
  const groups = new Map<string, { hours: number; amount: number; rate: number }>();

  for (const entry of entries) {
    const rate = findRate(entry.staffId, rates);
    const existing = groups.get(entry.staffId) || { hours: 0, amount: 0, rate };
    existing.hours += entry.hours;
    existing.amount += entry.hours * rate;
    groups.set(entry.staffId, existing);
  }

  const lineItems: InvoiceLineItem[] = [];
  for (const [staffId, data] of groups) {
    lineItems.push({
      description: `Staff: ${staffId}`,
      hours: round2(data.hours),
      rate: round2(data.rate),
      amount: round2(data.amount),
      category: 'other',
    });
  }

  return lineItems;
}

/**
 * Generate line items for fixed_fee billing model.
 * Bills a milestone percentage of the total agreed fee.
 */
function generateFixedFeeLineItems(config: InvoiceConfig): InvoiceLineItem[] {
  const totalFee = config.totalFeeZAR || 0;
  const milestonePercentage = config.milestonePercentage || 0;
  const amount = round2((milestonePercentage / 100) * totalFee);

  return [
    {
      description: `Fixed fee milestone (${milestonePercentage}% of R${totalFee.toLocaleString()})`,
      amount,
      category: 'milestone',
    },
  ];
}

/**
 * Generate line items for percentage_of_construction billing model.
 * Bills fee as a percentage of construction cost (SACAP/ECSA fee scale).
 */
function generatePercentageLineItems(config: InvoiceConfig): InvoiceLineItem[] {
  const constructionCost = config.constructionCostZAR || 0;
  const feePercentage = config.feePercentage || 0;
  const amount = round2((feePercentage / 100) * constructionCost);

  return [
    {
      description: `Professional fee (${feePercentage}% of construction cost R${constructionCost.toLocaleString()})`,
      amount,
      category: 'milestone',
    },
  ];
}

/**
 * Find the charge-out rate for a staff member. Defaults to 0 if not found.
 */
function findRate(staffId: string, rates: ChargeOutRates[]): number {
  const match = rates.find(r => r.staffId === staffId);
  return match ? match.clientRate : 0;
}

/**
 * Format an activity category enum value as a human-readable label.
 */
function formatCategoryLabel(category: ActivityCategory): string {
  return category
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Generate an invoice number based on the date.
 */
function generateInvoiceNumber(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const seq = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `INV-${year}${month}${day}-${seq}`;
}

/**
 * Round to 2 decimal places (standard financial rounding).
 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
