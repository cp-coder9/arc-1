/**
 * NHBRC Engine Service
 *
 * Manages project enrolment readiness checklists, fee calculation
 * using configurable fee bands, and enrolment status tracking.
 *
 * Requirements: 11.1–11.9
 */

import { enrolmentInputSchema } from '../schemas';
import type {
  ChecklistItem,
  ChecklistItemStatus,
  CreateEnrolmentInput,
  EnrolmentChecklist,
  EnrolmentStatus,
  FeeBand,
  NHBRCEngineService,
} from '../types';

// ─── Default Checklist Items ──────────────────────────────────────────────────

const DEFAULT_CHECKLIST_ITEMS: Pick<ChecklistItem, 'label' | 'description'>[] = [
  { label: 'Builder NHBRC Registration', description: 'Verified active builder registration number' },
  { label: 'Approved Building Plans', description: 'Council-approved building plans submitted' },
  { label: 'Proof of Ownership', description: 'Title deed or consent from property owner' },
  { label: 'Project Details', description: 'Number of units, types, and estimated values captured' },
  { label: 'Site Address', description: 'Full physical address of construction site' },
  { label: 'Enrolment Fee Payment', description: 'NHBRC enrolment fee paid or proof of payment' },
];

// ─── Default Fee Bands ────────────────────────────────────────────────────────

const DEFAULT_FEE_BANDS: FeeBand[] = [
  { id: 'band-1', minValue: 0.01, maxValue: 500_000, feePerUnit: 1_298, effectiveFrom: '2024-01-01' },
  { id: 'band-2', minValue: 500_000.01, maxValue: 1_000_000, feePerUnit: 2_596, effectiveFrom: '2024-01-01' },
  { id: 'band-3', minValue: 1_000_000.01, maxValue: 2_500_000, feePerUnit: 5_192, effectiveFrom: '2024-01-01' },
  { id: 'band-4', minValue: 2_500_000.01, maxValue: 5_000_000, feePerUnit: 10_384, effectiveFrom: '2024-01-01' },
  { id: 'band-5', minValue: 5_000_000.01, maxValue: 999_999_999.99, feePerUnit: 20_768, effectiveFrom: '2024-01-01' },
];

// ─── Fee Disclaimer ───────────────────────────────────────────────────────────

const FEE_DISCLAIMER =
  'This fee is an estimate based on configured fee bands and does not constitute a formal NHBRC quotation. ' +
  'The actual fee must be confirmed with the NHBRC directly.';

// ─── Readiness Calculation ────────────────────────────────────────────────────

function calculateReadinessPercentage(items: ChecklistItem[]): number {
  const applicableItems = items.filter((item) => item.isApplicable);
  const totalApplicable = applicableItems.length;
  if (totalApplicable === 0) return 0;
  const completedApplicable = applicableItems.filter((item) => item.status === 'completed').length;
  return Math.floor((completedApplicable / totalApplicable) * 100);
}

// ─── ID Generation ────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Enrolment Status Derivation ──────────────────────────────────────────────

function deriveEnrolmentStatus(readiness: number, currentStatus: EnrolmentStatus): EnrolmentStatus {
  if (currentStatus === 'enrolled') return 'enrolled';
  if (readiness === 100) return 'in_progress'; // Ready for submission but not yet enrolled
  if (readiness > 0) return 'in_progress';
  return 'not_started';
}

// ─── Factory Options ──────────────────────────────────────────────────────────

export interface NHBRCEngineServiceOptions {
  feeBands?: FeeBand[];
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createNHBRCEngineService(
  options: NHBRCEngineServiceOptions = {},
): NHBRCEngineService {
  const feeBands: FeeBand[] = options.feeBands ?? DEFAULT_FEE_BANDS;

  // In-memory storage keyed by projectId
  const enrolments = new Map<string, EnrolmentChecklist>();

  async function createEnrolment(
    projectId: string,
    input: CreateEnrolmentInput,
    actorId: string,
  ): Promise<EnrolmentChecklist> {
    // Validate input with Zod schema
    const validated = enrolmentInputSchema.parse(input);

    const now = new Date().toISOString();
    const items: ChecklistItem[] = DEFAULT_CHECKLIST_ITEMS.map((item) => ({
      id: generateId(),
      label: item.label,
      description: item.description,
      status: 'not_started' as ChecklistItemStatus,
      isApplicable: true,
    }));

    const checklist: EnrolmentChecklist = {
      id: generateId(),
      projectId,
      status: 'not_started',
      readinessPercentage: 0,
      items,
      builderRegistrationNumber: validated.builderRegistrationNumber,
      numberOfUnits: validated.numberOfUnits,
      estimatedValuePerUnit: validated.estimatedValuePerUnit,
      createdAt: now,
      updatedAt: now,
    };

    enrolments.set(projectId, checklist);
    return checklist;
  }

  async function updateChecklistItem(
    projectId: string,
    itemId: string,
    status: ChecklistItemStatus,
    actorId: string,
  ): Promise<EnrolmentChecklist> {
    const checklist = enrolments.get(projectId);
    if (!checklist) {
      throw new Error(`No enrolment found for project ${projectId}`);
    }

    const item = checklist.items.find((i) => i.id === itemId);
    if (!item) {
      throw new Error(`Checklist item ${itemId} not found in project ${projectId}`);
    }

    // Update item status
    item.status = status;

    // Handle not_applicable: mark item as non-applicable
    if (status === 'not_applicable') {
      item.isApplicable = false;
      item.completedAt = undefined;
      item.completedBy = undefined;
    } else {
      item.isApplicable = true;
    }

    // Handle completed: record completedAt and completedBy
    if (status === 'completed') {
      item.completedAt = new Date().toISOString();
      item.completedBy = actorId;
    } else if (status !== 'not_applicable') {
      // Clear completion data when reverting to not_started or in_progress
      item.completedAt = undefined;
      item.completedBy = undefined;
    }

    // Recalculate readiness percentage
    checklist.readinessPercentage = calculateReadinessPercentage(checklist.items);

    // Derive enrolment status
    checklist.status = deriveEnrolmentStatus(checklist.readinessPercentage, checklist.status);

    checklist.updatedAt = new Date().toISOString();

    return checklist;
  }

  async function calculateFee(
    numberOfUnits: number,
    valuePerUnit: number,
  ): Promise<{ fee: number | null; disclaimer: string; error?: string }> {
    if (feeBands.length === 0) {
      return {
        fee: null,
        error: 'No fee band configuration available. Please contact NHBRC directly for fee information.',
        disclaimer: FEE_DISCLAIMER,
      };
    }

    const matchingBand = feeBands.find(
      (band) => valuePerUnit >= band.minValue && valuePerUnit <= band.maxValue,
    );

    if (!matchingBand) {
      return {
        fee: null,
        error: 'The entered construction value does not fall within any configured fee band. Please contact NHBRC directly.',
        disclaimer: FEE_DISCLAIMER,
      };
    }

    const fee = numberOfUnits * matchingBand.feePerUnit;
    return { fee, disclaimer: FEE_DISCLAIMER };
  }

  async function getEnrolmentStatus(projectId: string): Promise<EnrolmentChecklist | null> {
    return enrolments.get(projectId) ?? null;
  }

  async function getFeeBands(): Promise<FeeBand[]> {
    return [...feeBands];
  }

  return {
    createEnrolment,
    updateChecklistItem,
    calculateFee,
    getEnrolmentStatus,
    getFeeBands,
  };
}
