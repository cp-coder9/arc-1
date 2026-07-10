/**
 * Policy Checker Service
 *
 * Determines required insurance types per contract form (JBCC, NEC, GCC, FIDIC)
 * and verifies compliance of registered policies against project requirements.
 *
 * Requirements: 2.1–2.11
 */

import type {
  ContractDataSheet,
  ContractForm,
  InsuranceComplianceResult,
  InsuranceComplianceSummary,
  InsurancePolicy,
  InsurancePolicyType,
  PolicyCheckerService,
} from '../types';

// ─── Configuration ────────────────────────────────────────────────────────────

/** Days within expiry at which a policy is considered "expiring_soon". */
const EXPIRING_SOON_THRESHOLD_DAYS = 60;

/** Required policy types per contract form (Req 2.1). */
const CONTRACT_FORM_REQUIREMENTS: Record<ContractForm, InsurancePolicyType[]> = {
  JBCC_PBA: ['CAR', 'public_liability'],
  NEC_ECC: ['CAR', 'public_liability', 'PI'],
  GCC_2025: ['CAR', 'public_liability'],
  FIDIC: ['CAR', 'public_liability', 'PI'],
};

// ─── Factory Options ──────────────────────────────────────────────────────────

export interface PolicyCheckerOptions {
  /** Injected dependency for fetching policies for a project. */
  getPolicies: (projectId: string) => Promise<InsurancePolicy[]>;
  /** Injected dependency for fetching the contract data sheet for a project. */
  getContractDataSheet: (projectId: string) => Promise<ContractDataSheet | null>;
  /** Optional clock for testability. */
  now?: () => Date;
}

// ─── Date Helpers ─────────────────────────────────────────────────────────────

function toISODateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(from: Date, to: Date): number {
  const msPerDay = 86_400_000;
  const fromMidnight = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const toMidnight = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((toMidnight.getTime() - fromMidnight.getTime()) / msPerDay);
}

// ─── Implementation ───────────────────────────────────────────────────────────

class PolicyCheckerServiceImpl implements PolicyCheckerService {
  private readonly getPolicies: PolicyCheckerOptions['getPolicies'];
  private readonly getContractDataSheet: PolicyCheckerOptions['getContractDataSheet'];
  private readonly now: () => Date;

  constructor(options: PolicyCheckerOptions) {
    this.getPolicies = options.getPolicies;
    this.getContractDataSheet = options.getContractDataSheet;
    this.now = options.now ?? (() => new Date());
  }

  /**
   * Returns the required insurance policy types based on the contract form.
   *
   * Base requirements come from the contract form mapping (Req 2.1).
   * Additional types are added if the contractDataSheet specifies:
   *   - sasriaRequired: true → adds 'SASRIA' (Req 2.5)
   *   - ldiRequired: true → adds 'LDI' (Req 2.6)
   */
  getRequiredTypes(
    _projectId: string,
    contractForm: ContractForm,
    contractDataSheet?: ContractDataSheet,
  ): InsurancePolicyType[] {
    const baseTypes = [...CONTRACT_FORM_REQUIREMENTS[contractForm]];

    if (contractDataSheet?.sasriaRequired) {
      if (!baseTypes.includes('SASRIA')) {
        baseTypes.push('SASRIA');
      }
    }

    if (contractDataSheet?.ldiRequired) {
      if (!baseTypes.includes('LDI')) {
        baseTypes.push('LDI');
      }
    }

    return baseTypes;
  }

  /**
   * Executes a compliance check for a project (Req 2.2, 2.7, 2.8).
   *
   * For each required policy type:
   * - 'compliant': active policy exists with sum insured >= minimum
   * - 'expiring_soon': active policy exists but within 60 days of expiry
   * - 'non_compliant': no active policy or sum insured below minimum
   *
   * Overall status:
   * - 'compliant': all types are compliant
   * - 'partially_compliant': some types compliant, some not
   * - 'non_compliant': none compliant
   */
  async checkCompliance(projectId: string): Promise<InsuranceComplianceSummary> {
    const currentDate = this.now();
    const contractDataSheet = await this.getContractDataSheet(projectId);

    // If no contract data sheet, we cannot determine requirements (Req 2.9)
    if (!contractDataSheet) {
      return {
        overallStatus: 'non_compliant',
        activePolicies: 0,
        expiredPolicies: 0,
        nonCompliantTypes: 0,
        lastCheckDate: toISODateString(currentDate),
        results: [],
      };
    }

    const policies = await this.getPolicies(projectId);
    const requiredTypes = this.getRequiredTypes(projectId, contractDataSheet.contractForm, contractDataSheet);

    const activePolicies = policies.filter((p) => p.status === 'active');
    const expiredPolicies = policies.filter((p) => p.status === 'expired');

    const results: InsuranceComplianceResult[] = requiredTypes.map((policyType) => {
      return this.evaluateTypeCompliance(policyType, activePolicies, contractDataSheet, currentDate);
    });

    const compliantCount = results.filter((r) => r.status === 'compliant').length;
    const nonCompliantCount = results.filter((r) => r.status === 'non_compliant').length;
    const nonCompliantTypes = results.filter((r) => r.status !== 'compliant').length;

    let overallStatus: InsuranceComplianceSummary['overallStatus'];
    if (compliantCount === results.length) {
      overallStatus = 'compliant';
    } else if (nonCompliantCount === results.length) {
      overallStatus = 'non_compliant';
    } else {
      overallStatus = 'partially_compliant';
    }

    return {
      overallStatus,
      activePolicies: activePolicies.length,
      expiredPolicies: expiredPolicies.length,
      nonCompliantTypes,
      lastCheckDate: toISODateString(currentDate),
      results,
    };
  }

  /**
   * Returns the minimum sum insured from the contract data sheet for a given
   * policy type, or null if not configured (Req 2.4).
   */
  getMinimumSumInsured(
    contractDataSheet: ContractDataSheet,
    policyType: InsurancePolicyType,
  ): number | null {
    if (!contractDataSheet.minimumSumInsured) {
      return null;
    }
    return contractDataSheet.minimumSumInsured[policyType] ?? null;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────────

  private evaluateTypeCompliance(
    policyType: InsurancePolicyType,
    activePolicies: InsurancePolicy[],
    contractDataSheet: ContractDataSheet,
    currentDate: Date,
  ): InsuranceComplianceResult {
    // Find matching active policies for this type
    const matchingPolicies = activePolicies.filter((p) => p.policyType === policyType);

    if (matchingPolicies.length === 0) {
      const minimumRequired = this.getMinimumSumInsured(contractDataSheet, policyType) ?? undefined;
      return {
        policyType,
        status: 'non_compliant',
        minimumRequired,
      };
    }

    // Use the policy with the highest sum insured for compliance assessment
    const bestPolicy = matchingPolicies.reduce((best, current) =>
      current.sumInsured > best.sumInsured ? current : best,
    );

    const minimumRequired = this.getMinimumSumInsured(contractDataSheet, policyType);

    // Check if sum insured meets minimum (Req 2.4)
    if (minimumRequired !== null && bestPolicy.sumInsured < minimumRequired) {
      return {
        policyType,
        status: 'non_compliant',
        policy: bestPolicy,
        minimumRequired,
        shortfall: minimumRequired - bestPolicy.sumInsured,
      };
    }

    // Check if expiring soon (within 60 calendar days) (Req 2.2)
    const expiryDate = parseDate(bestPolicy.expiryDate);
    const daysUntilExpiry = daysBetween(currentDate, expiryDate);

    if (daysUntilExpiry <= EXPIRING_SOON_THRESHOLD_DAYS && daysUntilExpiry > 0) {
      return {
        policyType,
        status: 'expiring_soon',
        policy: bestPolicy,
        minimumRequired: minimumRequired ?? undefined,
      };
    }

    // If days until expiry <= 0, technically expired even if status says active
    if (daysUntilExpiry <= 0) {
      return {
        policyType,
        status: 'non_compliant',
        policy: bestPolicy,
        minimumRequired: minimumRequired ?? undefined,
      };
    }

    // Compliant: active, adequate sum, and not expiring soon
    return {
      policyType,
      status: 'compliant',
      policy: bestPolicy,
      minimumRequired: minimumRequired ?? undefined,
    };
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a new PolicyCheckerService instance.
 *
 * @param options.getPolicies - Injected dependency for fetching policies
 * @param options.getContractDataSheet - Injected dependency for fetching contract data sheet
 * @param options.now - Optional clock for testability (defaults to system clock)
 */
export function createPolicyCheckerService(options: PolicyCheckerOptions): PolicyCheckerService {
  return new PolicyCheckerServiceImpl(options);
}
