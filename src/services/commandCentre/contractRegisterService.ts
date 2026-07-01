/**
 * Project Command Centre — Contract Register Service
 *
 * Manages contracts, JBCC/NEC form types, expiry tracking, and linkages
 * to procurement orders and payment certificates.
 * Persisted at `projects/{projectId}/contracts/`.
 *
 * @module commandCentre/contractRegisterService
 */

import {
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  query,
  orderBy,
  where,
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firebase';
import { getDemoDoc, getDemoCol } from '@/demo-seed/demoFirestore';
import { createContractSchema } from '@/services/commandCentre/schemas';
import { recordAudit } from '@/services/commandCentre/commandCentreService';
import type { ContractItem, ContractForm, ContractStatus, CommandCentreAction } from '@/services/commandCentre/types';

// ── ID Generation ────────────────────────────────────────────────────────────

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

// ── Constants ────────────────────────────────────────────────────────────────

const PROJECTS_COL = 'projects';
const CONTRACTS_COL = 'contracts';

/** Number of days before expiry to trigger a warning notification */
const EXPIRY_WARNING_DAYS = 30;

// ── Supported Contract Forms ─────────────────────────────────────────────────

/**
 * JBCC (Joint Building Contracts Committee) contract forms used in South Africa.
 */
export const JBCC_FORMS: ContractForm[] = ['jbcc_pba', 'jbcc_ns', 'jbcc_mwa'];

/**
 * NEC (New Engineering Contract) forms used in South Africa.
 */
export const NEC_FORMS: ContractForm[] = ['nec_ecc', 'nec_psc', 'nec_tsc'];

/**
 * All supported contract forms including custom.
 */
export const ALL_CONTRACT_FORMS: ContractForm[] = [...JBCC_FORMS, ...NEC_FORMS, 'custom'];

/**
 * Human-readable labels for contract forms.
 */
export const CONTRACT_FORM_LABELS: Record<ContractForm, string> = {
  jbcc_pba: 'JBCC PBA (Principal Building Agreement)',
  jbcc_ns: 'JBCC N/S (Nominated/Selected Subcontract)',
  jbcc_mwa: 'JBCC MWA (Minor Works Agreement)',
  nec_ecc: 'NEC ECC (Engineering and Construction Contract)',
  nec_psc: 'NEC PSC (Professional Service Contract)',
  nec_tsc: 'NEC TSC (Term Service Contract)',
  custom: 'Custom Contract',
};

// ── Firestore Path Helpers ───────────────────────────────────────────────────

function contractsCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return getDemoCol(PROJECTS_COL, projectId, CONTRACTS_COL);
}

function contractDocument(projectId: string, contractId: string) {
  if (!projectId) throw new Error('projectId is required');
  if (!contractId) throw new Error('contractId is required');
  return getDemoDoc(PROJECTS_COL, projectId, CONTRACTS_COL, contractId);
}

// ── Reference Number Generation ──────────────────────────────────────────────

/**
 * Generates a contract reference number in the format: CON-{sequential}.
 */
function generateContractReference(existingCount: number): string {
  return `CON-${String(existingCount + 1).padStart(4, '0')}`;
}

// ── Pure Computation Functions (exported for testing) ────────────────────────

/**
 * Determines whether a contract is expiring within a given number of days.
 *
 * @param expiryDate - ISO date string (YYYY-MM-DD) for the contract expiry
 * @param currentDate - The current date to compare against (defaults to today)
 * @param warningDays - Number of days before expiry to flag (defaults to 30)
 * @returns true if the contract expires within the warning window and has not already expired
 */
export function isExpiringWithinDays(
  expiryDate: string,
  currentDate: Date = new Date(),
  warningDays: number = EXPIRY_WARNING_DAYS,
): boolean {
  const expiry = new Date(expiryDate + 'T00:00:00.000Z');
  const current = new Date(currentDate.toISOString().split('T')[0] + 'T00:00:00.000Z');
  const diffMs = expiry.getTime() - current.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= warningDays;
}

/**
 * Determines whether a contract form belongs to the JBCC family.
 */
export function isJBCCForm(form: ContractForm): boolean {
  return JBCC_FORMS.includes(form);
}

/**
 * Determines whether a contract form belongs to the NEC family.
 */
export function isNECForm(form: ContractForm): boolean {
  return NEC_FORMS.includes(form);
}

// ── Contract CRUD Operations ─────────────────────────────────────────────────

/**
 * Creates a new contract for a project.
 * Validates input against createContractSchema.
 * Generates a sequential reference number automatically.
 *
 * @returns The created contract item
 */
export async function createContract(
  projectId: string,
  data: {
    contractorSupplier: string;
    scope: string;
    value: number;
    form: ContractForm;
    startDate: string;
    expiryDate: string;
    createdBy: string;
    status?: ContractStatus;
    linkedProcurementOrderIds?: string[];
    linkedCertificateIds?: string[];
  },
): Promise<ContractItem> {
  // Validate input
  createContractSchema.parse({
    contractorSupplier: data.contractorSupplier,
    scope: data.scope,
    value: data.value,
    form: data.form,
    startDate: data.startDate,
    expiryDate: data.expiryDate,
  });

  // Determine next reference number
  const existingContracts = await getContracts(projectId);
  const reference = generateContractReference(existingContracts.length);

  const now = new Date().toISOString();
  const status: ContractStatus = data.status ?? 'active';

  const contractData: Omit<ContractItem, 'id'> = {
    projectId,
    reference,
    contractorSupplier: data.contractorSupplier,
    scope: data.scope,
    value: data.value,
    form: data.form,
    startDate: data.startDate,
    expiryDate: data.expiryDate,
    status,
    linkedProcurementOrderIds: data.linkedProcurementOrderIds ?? [],
    linkedCertificateIds: data.linkedCertificateIds ?? [],
    createdBy: data.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const docRef = await addDoc(contractsCollection(projectId), contractData);
    const contract: ContractItem = { id: docRef.id, ...contractData };

    // Fire-and-forget audit
    recordAudit({
      projectId,
      actorId: data.createdBy,
      actorName: data.createdBy,
      actionType: 'create',
      entityType: 'contract',
      entityId: docRef.id,
      after: contractData as unknown as Record<string, unknown>,
      timestamp: now,
    });

    return contract;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${projectId}/${CONTRACTS_COL}`);
  }
}

/**
 * Updates an existing contract.
 * Supports partial updates to any mutable contract field.
 */
export async function updateContract(
  projectId: string,
  contractId: string,
  data: Partial<Pick<ContractItem, 'contractorSupplier' | 'scope' | 'value' | 'form' | 'startDate' | 'expiryDate' | 'status' | 'linkedProcurementOrderIds' | 'linkedCertificateIds'>>,
): Promise<ContractItem> {
  const contractRef = contractDocument(projectId, contractId);

  try {
    const snap = await getDoc(contractRef);
    if (!snap.exists()) {
      throw new Error(`Contract '${contractId}' not found`);
    }

    const existing = { id: snap.id, ...snap.data() } as ContractItem;
    const now = new Date().toISOString();

    const updates: Partial<ContractItem> = {
      ...data,
      updatedAt: now,
    };

    // Remove id from updates if present
    delete (updates as Record<string, unknown>)['id'];

    await updateDoc(contractRef, updates as Record<string, unknown>);

    const updated: ContractItem = { ...existing, ...updates, id: contractId };

    // Fire-and-forget audit
    recordAudit({
      projectId,
      actorId: existing.createdBy,
      actorName: existing.createdBy,
      actionType: 'update',
      entityType: 'contract',
      entityId: contractId,
      before: existing as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
      timestamp: now,
    });

    return updated;
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${CONTRACTS_COL}/${contractId}`);
  }
}

/**
 * Retrieves all contracts for a project, ordered by reference.
 */
export async function getContracts(projectId: string): Promise<ContractItem[]> {
  try {
    const q = query(contractsCollection(projectId), orderBy('reference', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ContractItem));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${PROJECTS_COL}/${projectId}/${CONTRACTS_COL}`);
  }
}

/**
 * Links a contract to one or more procurement orders.
 */
export async function linkContractToProcurementOrders(
  projectId: string,
  contractId: string,
  procurementOrderIds: string[],
): Promise<ContractItem> {
  const contractRef = contractDocument(projectId, contractId);

  try {
    const snap = await getDoc(contractRef);
    if (!snap.exists()) {
      throw new Error(`Contract '${contractId}' not found`);
    }

    const existing = { id: snap.id, ...snap.data() } as ContractItem;
    const now = new Date().toISOString();

    // Merge with existing linked orders (deduplicate)
    const existingOrderIds = existing.linkedProcurementOrderIds ?? [];
    const mergedOrderIds = [...new Set([...existingOrderIds, ...procurementOrderIds])];

    await updateDoc(contractRef, {
      linkedProcurementOrderIds: mergedOrderIds,
      updatedAt: now,
    });

    // Fire-and-forget audit
    recordAudit({
      projectId,
      actorId: existing.createdBy,
      actorName: existing.createdBy,
      actionType: 'update',
      entityType: 'contract',
      entityId: contractId,
      before: { linkedProcurementOrderIds: existingOrderIds },
      after: { linkedProcurementOrderIds: mergedOrderIds },
      timestamp: now,
    });

    return { ...existing, linkedProcurementOrderIds: mergedOrderIds, updatedAt: now };
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${CONTRACTS_COL}/${contractId}`);
  }
}

/**
 * Links a contract to one or more payment certificates.
 */
export async function linkContractToCertificates(
  projectId: string,
  contractId: string,
  certificateIds: string[],
): Promise<ContractItem> {
  const contractRef = contractDocument(projectId, contractId);

  try {
    const snap = await getDoc(contractRef);
    if (!snap.exists()) {
      throw new Error(`Contract '${contractId}' not found`);
    }

    const existing = { id: snap.id, ...snap.data() } as ContractItem;
    const now = new Date().toISOString();

    // Merge with existing linked certificates (deduplicate)
    const existingCertIds = existing.linkedCertificateIds ?? [];
    const mergedCertIds = [...new Set([...existingCertIds, ...certificateIds])];

    await updateDoc(contractRef, {
      linkedCertificateIds: mergedCertIds,
      updatedAt: now,
    });

    // Fire-and-forget audit
    recordAudit({
      projectId,
      actorId: existing.createdBy,
      actorName: existing.createdBy,
      actionType: 'update',
      entityType: 'contract',
      entityId: contractId,
      before: { linkedCertificateIds: existingCertIds },
      after: { linkedCertificateIds: mergedCertIds },
      timestamp: now,
    });

    return { ...existing, linkedCertificateIds: mergedCertIds, updatedAt: now };
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${CONTRACTS_COL}/${contractId}`);
  }
}

// ── Expiry Tracking ──────────────────────────────────────────────────────────

/**
 * Checks for contracts expiring within 30 days of the given date.
 * Only considers contracts with 'active' status.
 *
 * Returns matching contracts along with Action Centre event data for notifications.
 *
 * @param projectId - The project to check
 * @param currentDate - The reference date (defaults to today)
 * @returns Expiring contracts and their corresponding Action Centre notification events
 */
export async function checkExpiringContracts(
  projectId: string,
  currentDate: Date = new Date(),
): Promise<{ contracts: ContractItem[]; actionEvents: CommandCentreAction[] }> {
  const allContracts = await getContracts(projectId);

  // Filter to active contracts expiring within 30 days
  const expiringContracts = allContracts.filter(
    (contract) =>
      contract.status === 'active' &&
      isExpiringWithinDays(contract.expiryDate, currentDate, EXPIRY_WARNING_DAYS),
  );

  // Generate Action Centre events for each expiring contract
  const actionEvents: CommandCentreAction[] = expiringContracts.map((contract) =>
    buildExpiryActionEvent(projectId, contract, currentDate),
  );

  return { contracts: expiringContracts, actionEvents };
}

// ── Action Centre Event Builder ──────────────────────────────────────────────

/**
 * Builds an Action Centre event for contract expiry warning.
 */
function buildExpiryActionEvent(
  projectId: string,
  contract: ContractItem,
  currentDate: Date,
): CommandCentreAction {
  const expiry = new Date(contract.expiryDate + 'T00:00:00.000Z');
  const current = new Date(currentDate.toISOString().split('T')[0] + 'T00:00:00.000Z');
  const daysUntilExpiry = Math.ceil(
    (expiry.getTime() - current.getTime()) / (1000 * 60 * 60 * 24),
  );

  return {
    id: generateId(),
    projectId,
    type: 'financial',
    title: `Contract ${contract.reference} expiring in ${daysUntilExpiry} days`,
    description: `Contract with ${contract.contractorSupplier} (${CONTRACT_FORM_LABELS[contract.form]}) for "${contract.scope}" expires on ${contract.expiryDate}. Review and renew or close.`,
    assigneeId: contract.createdBy,
    dueDate: contract.expiryDate,
    priority: daysUntilExpiry <= 7 ? 'critical' : 'high',
    sourceSubsystem: 'contracts',
    sourceEntityId: contract.id,
    status: 'pending',
    createdAt: currentDate.toISOString(),
  };
}

// ── Service Export ───────────────────────────────────────────────────────────

export const contractRegisterService = {
  createContract,
  updateContract,
  getContracts,
  linkContractToProcurementOrders,
  linkContractToCertificates,
  checkExpiringContracts,
  isExpiringWithinDays,
  isJBCCForm,
  isNECForm,
  JBCC_FORMS,
  NEC_FORMS,
  ALL_CONTRACT_FORMS,
  CONTRACT_FORM_LABELS,
};

export default contractRegisterService;
