/**
 * Practice Management — Staff Compliance Tracker Service
 *
 * Pure business logic for monitoring professional registration status
 * and PI insurance expiry per staff member:
 * - evaluateComplianceStatus: derives valid/expiring/lapsed from dates per staff member
 * - calculateFirmCompliance: firm-wide compliance score and dashboard metrics
 * - generateComplianceAlerts: PI and registration expiry alerts at configurable thresholds
 *
 * Integrates with Trust & Verification module by exposing registration and PI status
 * data for use in professional verification checks and BEP matching workflows.
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9
 */

import type { StaffComplianceRecord, RegistrationBody } from '../types';

// ─── Service Result Pattern ───────────────────────────────────────────────────

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

// ─── Types ────────────────────────────────────────────────────────────────────

export type PIStatus = 'valid' | 'expiring_60' | 'expiring_30' | 'lapsed' | 'not_set';
export type RegistrationStatus = 'valid' | 'expiring_90' | 'lapsed' | 'lifetime';

export interface ComplianceStatusResult {
  staffId: string;
  staffDisplayName: string;
  registrationBody: RegistrationBody;
  registrationNumber: string;
  registrationCategory: string;
  piStatus: PIStatus;
  piDaysRemaining: number | null;
  registrationStatus: RegistrationStatus;
  registrationDaysRemaining: number | null;
  isFullyCompliant: boolean;
  piLapsed: boolean;
  registrationLapsed: boolean;
}

export interface FirmComplianceSummary {
  totalStaffTracked: number;
  staffWithValidPI: number;
  staffWithLapsedPI: number;
  staffWithRegistrationExpiring90: number;
  staffWithRegistrationLapsed: number;
  complianceScore: number; // percentage: (valid PI AND current reg) / total × 100
}

export type AlertSeverity = 'warning' | 'urgent' | 'critical';
export type AlertCategory = 'pi_insurance' | 'registration';

export interface ComplianceAlert {
  staffId: string;
  staffDisplayName: string;
  category: AlertCategory;
  severity: AlertSeverity;
  message: string;
  daysRemaining: number | null;
  expiryDate: string | undefined;
}

/**
 * Data exposed to the Trust & Verification module for professional verification
 * checks and BEP matching workflows.
 * Requirement: 13.7
 */
export interface VerificationExposure {
  staffId: string;
  registrationBody: RegistrationBody;
  registrationBodyCustomName?: string;
  registrationNumber: string;
  registrationCategory: string;
  registrationExpiryDate?: string;
  registrationStatus: RegistrationStatus;
  piInsuranceExpiryDate?: string;
  piInsuranceSumInsuredZAR?: number;
  piStatus: PIStatus;
  isFullyCompliant: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PI_WARNING_DAYS = 60;
const PI_URGENT_DAYS = 30;
const REGISTRATION_WARNING_DAYS = 90;

/**
 * Advisory disclaimer per R13.9.
 * Registration and insurance status displayed is based on manually entered data.
 */
export const COMPLIANCE_DISCLAIMER =
  'Registration and insurance status displayed is based on manually entered data. ' +
  'The firm remains responsible for independently verifying registration status with the relevant statutory body.';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calculate the number of whole calendar days between now and a target date.
 * Returns positive if target is in the future, negative if in the past.
 */
function daysBetween(now: Date, target: Date): number {
  const msPerDay = 86_400_000;
  // Strip time component for calendar day comparison
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDate = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((targetDate.getTime() - nowDate.getTime()) / msPerDay);
}

function parseDateSafe(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d;
}

// ─── evaluateComplianceStatus ─────────────────────────────────────────────────

/**
 * Derives compliance status from dates for a single staff member.
 *
 * PI Insurance status:
 * - not_set: no PI expiry date recorded
 * - lapsed: expiry date has passed
 * - expiring_30: expiry within 30 days
 * - expiring_60: expiry within 60 days
 * - valid: expiry more than 60 days away
 *
 * Registration status:
 * - lifetime: no expiry date (lifetime registration)
 * - lapsed: expiry date has passed
 * - expiring_90: expiry within 90 days
 * - valid: expiry more than 90 days away
 */
export function evaluateComplianceStatus(
  record: StaffComplianceRecord,
  now: Date
): ServiceResult<ComplianceStatusResult> {
  if (!record) {
    return {
      success: false,
      error: { code: 'INVALID_INPUT', message: 'Staff compliance record is required.' },
    };
  }

  // ── PI Insurance Status ──
  let piStatus: PIStatus;
  let piDaysRemaining: number | null = null;

  const piExpiry = parseDateSafe(record.piInsuranceExpiryDate);
  if (!record.piInsuranceExpiryDate && !piExpiry) {
    piStatus = 'not_set';
  } else if (!piExpiry) {
    piStatus = 'not_set';
  } else {
    piDaysRemaining = daysBetween(now, piExpiry);
    if (piDaysRemaining < 0) {
      piStatus = 'lapsed';
    } else if (piDaysRemaining <= PI_URGENT_DAYS) {
      piStatus = 'expiring_30';
    } else if (piDaysRemaining <= PI_WARNING_DAYS) {
      piStatus = 'expiring_60';
    } else {
      piStatus = 'valid';
    }
  }

  // ── Registration Status ──
  let registrationStatus: RegistrationStatus;
  let registrationDaysRemaining: number | null = null;

  if (!record.registrationExpiryDate) {
    // No expiry = lifetime registration
    registrationStatus = 'lifetime';
  } else {
    const regExpiry = parseDateSafe(record.registrationExpiryDate);
    if (!regExpiry) {
      registrationStatus = 'lifetime';
    } else {
      registrationDaysRemaining = daysBetween(now, regExpiry);
      if (registrationDaysRemaining < 0) {
        registrationStatus = 'lapsed';
      } else if (registrationDaysRemaining <= REGISTRATION_WARNING_DAYS) {
        registrationStatus = 'expiring_90';
      } else {
        registrationStatus = 'valid';
      }
    }
  }

  // ── Fully compliant = valid PI (or valid/expiring but not lapsed/not_set) AND current registration ──
  const piIsValid = piStatus === 'valid' || piStatus === 'expiring_60' || piStatus === 'expiring_30';
  const regIsCurrent = registrationStatus === 'valid' || registrationStatus === 'lifetime' || registrationStatus === 'expiring_90';
  const isFullyCompliant = piIsValid && regIsCurrent;

  return {
    success: true,
    data: {
      staffId: record.staffId,
      staffDisplayName: record.staffDisplayName,
      registrationBody: record.registrationBody,
      registrationNumber: record.registrationNumber,
      registrationCategory: record.registrationCategory,
      piStatus,
      piDaysRemaining,
      registrationStatus,
      registrationDaysRemaining,
      isFullyCompliant,
      piLapsed: piStatus === 'lapsed',
      registrationLapsed: registrationStatus === 'lapsed',
    },
  };
}

// ─── calculateFirmCompliance ──────────────────────────────────────────────────

/**
 * Calculate firm-wide compliance dashboard metrics.
 *
 * Compliance score = (staff with valid PI AND current registration) / total tracked × 100
 * A staff member has "valid PI" if piStatus is not 'lapsed' and not 'not_set'.
 * A staff member has "current registration" if registrationStatus is not 'lapsed'.
 */
export function calculateFirmCompliance(
  records: StaffComplianceRecord[],
  now: Date
): ServiceResult<FirmComplianceSummary> {
  if (!Array.isArray(records)) {
    return {
      success: false,
      error: { code: 'INVALID_INPUT', message: 'Records must be an array.' },
    };
  }

  if (records.length === 0) {
    return {
      success: true,
      data: {
        totalStaffTracked: 0,
        staffWithValidPI: 0,
        staffWithLapsedPI: 0,
        staffWithRegistrationExpiring90: 0,
        staffWithRegistrationLapsed: 0,
        complianceScore: 100, // No staff = 100% by convention
      },
    };
  }

  let validPI = 0;
  let lapsedPI = 0;
  let regExpiring90 = 0;
  let regLapsed = 0;
  let fullyCompliant = 0;

  for (const record of records) {
    const result = evaluateComplianceStatus(record, now);
    if (!result.success) continue;

    const status = result.data;

    // Valid PI: not lapsed and not not_set
    if (status.piStatus !== 'lapsed' && status.piStatus !== 'not_set') {
      validPI++;
    }
    if (status.piLapsed) {
      lapsedPI++;
    }
    if (status.registrationStatus === 'expiring_90') {
      regExpiring90++;
    }
    if (status.registrationLapsed) {
      regLapsed++;
    }
    if (status.isFullyCompliant) {
      fullyCompliant++;
    }
  }

  const total = records.length;
  const complianceScore = Math.round((fullyCompliant / total) * 100);

  return {
    success: true,
    data: {
      totalStaffTracked: total,
      staffWithValidPI: validPI,
      staffWithLapsedPI: lapsedPI,
      staffWithRegistrationExpiring90: regExpiring90,
      staffWithRegistrationLapsed: regLapsed,
      complianceScore,
    },
  };
}

// ─── generateComplianceAlerts ─────────────────────────────────────────────────

/**
 * Generate compliance alerts for all staff members.
 *
 * Alert rules:
 * - PI 60-day warning (severity: warning)
 * - PI 30-day urgent warning (severity: urgent)
 * - PI expired → critical alert (severity: critical)
 * - Registration 90-day warning (severity: warning) — only for finite-expiry registrations
 * - Registration expired → critical alert (severity: critical)
 */
export function generateComplianceAlerts(
  records: StaffComplianceRecord[],
  now: Date
): ServiceResult<ComplianceAlert[]> {
  if (!Array.isArray(records)) {
    return {
      success: false,
      error: { code: 'INVALID_INPUT', message: 'Records must be an array.' },
    };
  }

  const alerts: ComplianceAlert[] = [];

  for (const record of records) {
    const result = evaluateComplianceStatus(record, now);
    if (!result.success) continue;

    const status = result.data;

    // ── PI Alerts ──
    if (status.piStatus === 'lapsed') {
      alerts.push({
        staffId: record.staffId,
        staffDisplayName: record.staffDisplayName,
        category: 'pi_insurance',
        severity: 'critical',
        message: `PI insurance has expired for ${record.staffDisplayName}. Staff member may not have valid professional indemnity cover.`,
        daysRemaining: status.piDaysRemaining,
        expiryDate: record.piInsuranceExpiryDate,
      });
    } else if (status.piStatus === 'expiring_30') {
      alerts.push({
        staffId: record.staffId,
        staffDisplayName: record.staffDisplayName,
        category: 'pi_insurance',
        severity: 'urgent',
        message: `PI insurance for ${record.staffDisplayName} expires in ${status.piDaysRemaining} days. Urgent renewal required.`,
        daysRemaining: status.piDaysRemaining,
        expiryDate: record.piInsuranceExpiryDate,
      });
    } else if (status.piStatus === 'expiring_60') {
      alerts.push({
        staffId: record.staffId,
        staffDisplayName: record.staffDisplayName,
        category: 'pi_insurance',
        severity: 'warning',
        message: `PI insurance for ${record.staffDisplayName} expires in ${status.piDaysRemaining} days. Renewal recommended.`,
        daysRemaining: status.piDaysRemaining,
        expiryDate: record.piInsuranceExpiryDate,
      });
    }

    // ── Registration Alerts (only for finite-expiry registrations) ──
    if (status.registrationStatus === 'lapsed') {
      alerts.push({
        staffId: record.staffId,
        staffDisplayName: record.staffDisplayName,
        category: 'registration',
        severity: 'critical',
        message: `Professional registration for ${record.staffDisplayName} (${record.registrationBody}) has expired.`,
        daysRemaining: status.registrationDaysRemaining,
        expiryDate: record.registrationExpiryDate,
      });
    } else if (status.registrationStatus === 'expiring_90') {
      alerts.push({
        staffId: record.staffId,
        staffDisplayName: record.staffDisplayName,
        category: 'registration',
        severity: 'warning',
        message: `Professional registration for ${record.staffDisplayName} (${record.registrationBody}) expires in ${status.registrationDaysRemaining} days.`,
        daysRemaining: status.registrationDaysRemaining,
        expiryDate: record.registrationExpiryDate,
      });
    }
  }

  return { success: true, data: alerts };
}

// ─── Trust & Verification Integration (R13.7) ────────────────────────────────

/**
 * Expose registration and PI status data for use in professional verification checks
 * and BEP matching workflows (Trust & Verification module integration).
 */
export function getVerificationExposure(
  records: StaffComplianceRecord[],
  now: Date
): ServiceResult<VerificationExposure[]> {
  if (!Array.isArray(records)) {
    return {
      success: false,
      error: { code: 'INVALID_INPUT', message: 'Records must be an array.' },
    };
  }

  const exposures: VerificationExposure[] = [];

  for (const record of records) {
    const result = evaluateComplianceStatus(record, now);
    if (!result.success) continue;

    const status = result.data;

    exposures.push({
      staffId: record.staffId,
      registrationBody: record.registrationBody,
      registrationBodyCustomName: record.registrationBodyCustomName,
      registrationNumber: record.registrationNumber,
      registrationCategory: record.registrationCategory,
      registrationExpiryDate: record.registrationExpiryDate,
      registrationStatus: status.registrationStatus,
      piInsuranceExpiryDate: record.piInsuranceExpiryDate,
      piInsuranceSumInsuredZAR: record.piInsuranceSumInsuredZAR,
      piStatus: status.piStatus,
      isFullyCompliant: status.isFullyCompliant,
    });
  }

  return { success: true, data: exposures };
}
