// @vitest-environment node
/**
 * Staff Compliance Tracker Service — Unit Tests
 *
 * Tests for:
 * - evaluateComplianceStatus: PI status derivation, registration status derivation, edge cases
 * - calculateFirmCompliance: firm-wide metrics, compliance score calculation
 * - generateComplianceAlerts: PI 60/30/expired alerts, registration 90-day warning
 * - getVerificationExposure: Trust & Verification integration data
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateComplianceStatus,
  calculateFirmCompliance,
  generateComplianceAlerts,
  getVerificationExposure,
  COMPLIANCE_DISCLAIMER,
} from '../services/staffCompliance';
import type { StaffComplianceRecord } from '../types';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<StaffComplianceRecord> = {}): StaffComplianceRecord {
  return {
    id: 'comp-1',
    firmId: 'firm-1',
    staffId: 'staff-1',
    staffDisplayName: 'Jane Doe',
    registrationBody: 'SACAP',
    registrationNumber: 'A12345',
    registrationCategory: 'Professional Architect',
    registrationExpiryDate: undefined,
    piInsurancePolicyNumber: 'PI-001',
    piInsuranceExpiryDate: '2026-12-31',
    piInsuranceSumInsuredZAR: 5_000_000,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function daysFromNow(now: Date, days: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

const NOW = new Date('2026-06-15T10:00:00.000Z');

// ─── evaluateComplianceStatus ─────────────────────────────────────────────────

describe('evaluateComplianceStatus', () => {
  it('returns error for null/undefined record', () => {
    const result = evaluateComplianceStatus(null as unknown as StaffComplianceRecord, NOW);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_INPUT');
    }
  });

  describe('PI Insurance Status', () => {
    it('returns "valid" when PI expiry is more than 60 days away', () => {
      const record = makeRecord({ piInsuranceExpiryDate: daysFromNow(NOW, 90) });
      const result = evaluateComplianceStatus(record, NOW);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.piStatus).toBe('valid');
        expect(result.data.piDaysRemaining).toBe(90);
        expect(result.data.piLapsed).toBe(false);
      }
    });

    it('returns "expiring_60" when PI expiry is within 31–60 days', () => {
      const record = makeRecord({ piInsuranceExpiryDate: daysFromNow(NOW, 45) });
      const result = evaluateComplianceStatus(record, NOW);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.piStatus).toBe('expiring_60');
        expect(result.data.piDaysRemaining).toBe(45);
      }
    });

    it('returns "expiring_30" when PI expiry is within 0–30 days', () => {
      const record = makeRecord({ piInsuranceExpiryDate: daysFromNow(NOW, 20) });
      const result = evaluateComplianceStatus(record, NOW);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.piStatus).toBe('expiring_30');
        expect(result.data.piDaysRemaining).toBe(20);
      }
    });

    it('returns "expiring_30" when PI expiry is exactly today (0 days)', () => {
      const record = makeRecord({ piInsuranceExpiryDate: daysFromNow(NOW, 0) });
      const result = evaluateComplianceStatus(record, NOW);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.piStatus).toBe('expiring_30');
        expect(result.data.piDaysRemaining).toBe(0);
      }
    });

    it('returns "lapsed" when PI expiry date has passed', () => {
      const record = makeRecord({ piInsuranceExpiryDate: daysFromNow(NOW, -5) });
      const result = evaluateComplianceStatus(record, NOW);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.piStatus).toBe('lapsed');
        expect(result.data.piDaysRemaining).toBe(-5);
        expect(result.data.piLapsed).toBe(true);
      }
    });

    it('returns "not_set" when PI expiry date is not provided', () => {
      const record = makeRecord({ piInsuranceExpiryDate: undefined });
      const result = evaluateComplianceStatus(record, NOW);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.piStatus).toBe('not_set');
        expect(result.data.piDaysRemaining).toBeNull();
      }
    });

    it('returns "expiring_60" at the exact 60-day boundary', () => {
      const record = makeRecord({ piInsuranceExpiryDate: daysFromNow(NOW, 60) });
      const result = evaluateComplianceStatus(record, NOW);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.piStatus).toBe('expiring_60');
      }
    });

    it('returns "valid" at 61 days', () => {
      const record = makeRecord({ piInsuranceExpiryDate: daysFromNow(NOW, 61) });
      const result = evaluateComplianceStatus(record, NOW);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.piStatus).toBe('valid');
      }
    });

    it('returns "expiring_30" at the exact 30-day boundary', () => {
      const record = makeRecord({ piInsuranceExpiryDate: daysFromNow(NOW, 30) });
      const result = evaluateComplianceStatus(record, NOW);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.piStatus).toBe('expiring_30');
      }
    });
  });

  describe('Registration Status', () => {
    it('returns "lifetime" when registration has no expiry date', () => {
      const record = makeRecord({ registrationExpiryDate: undefined });
      const result = evaluateComplianceStatus(record, NOW);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.registrationStatus).toBe('lifetime');
        expect(result.data.registrationDaysRemaining).toBeNull();
        expect(result.data.registrationLapsed).toBe(false);
      }
    });

    it('returns "valid" when registration expiry is more than 90 days away', () => {
      const record = makeRecord({ registrationExpiryDate: daysFromNow(NOW, 120) });
      const result = evaluateComplianceStatus(record, NOW);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.registrationStatus).toBe('valid');
        expect(result.data.registrationDaysRemaining).toBe(120);
      }
    });

    it('returns "expiring_90" when registration expiry is within 1–90 days', () => {
      const record = makeRecord({ registrationExpiryDate: daysFromNow(NOW, 60) });
      const result = evaluateComplianceStatus(record, NOW);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.registrationStatus).toBe('expiring_90');
        expect(result.data.registrationDaysRemaining).toBe(60);
      }
    });

    it('returns "lapsed" when registration expiry has passed', () => {
      const record = makeRecord({ registrationExpiryDate: daysFromNow(NOW, -10) });
      const result = evaluateComplianceStatus(record, NOW);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.registrationStatus).toBe('lapsed');
        expect(result.data.registrationDaysRemaining).toBe(-10);
        expect(result.data.registrationLapsed).toBe(true);
      }
    });

    it('returns "expiring_90" at the exact 90-day boundary', () => {
      const record = makeRecord({ registrationExpiryDate: daysFromNow(NOW, 90) });
      const result = evaluateComplianceStatus(record, NOW);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.registrationStatus).toBe('expiring_90');
      }
    });

    it('returns "valid" at 91 days', () => {
      const record = makeRecord({ registrationExpiryDate: daysFromNow(NOW, 91) });
      const result = evaluateComplianceStatus(record, NOW);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.registrationStatus).toBe('valid');
      }
    });
  });

  describe('Fully Compliant', () => {
    it('is fully compliant when PI is valid and registration is lifetime', () => {
      const record = makeRecord({
        piInsuranceExpiryDate: daysFromNow(NOW, 200),
        registrationExpiryDate: undefined,
      });
      const result = evaluateComplianceStatus(record, NOW);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isFullyCompliant).toBe(true);
      }
    });

    it('is fully compliant when PI is expiring_30 and registration is valid (still covered)', () => {
      const record = makeRecord({
        piInsuranceExpiryDate: daysFromNow(NOW, 15),
        registrationExpiryDate: daysFromNow(NOW, 200),
      });
      const result = evaluateComplianceStatus(record, NOW);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isFullyCompliant).toBe(true);
      }
    });

    it('is NOT fully compliant when PI is lapsed', () => {
      const record = makeRecord({
        piInsuranceExpiryDate: daysFromNow(NOW, -1),
        registrationExpiryDate: daysFromNow(NOW, 200),
      });
      const result = evaluateComplianceStatus(record, NOW);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isFullyCompliant).toBe(false);
      }
    });

    it('is NOT fully compliant when PI is not_set', () => {
      const record = makeRecord({
        piInsuranceExpiryDate: undefined,
        registrationExpiryDate: daysFromNow(NOW, 200),
      });
      const result = evaluateComplianceStatus(record, NOW);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isFullyCompliant).toBe(false);
      }
    });

    it('is NOT fully compliant when registration is lapsed', () => {
      const record = makeRecord({
        piInsuranceExpiryDate: daysFromNow(NOW, 200),
        registrationExpiryDate: daysFromNow(NOW, -1),
      });
      const result = evaluateComplianceStatus(record, NOW);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isFullyCompliant).toBe(false);
      }
    });
  });
});

// ─── calculateFirmCompliance ──────────────────────────────────────────────────

describe('calculateFirmCompliance', () => {
  it('returns error for non-array input', () => {
    const result = calculateFirmCompliance(null as unknown as StaffComplianceRecord[], NOW);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_INPUT');
    }
  });

  it('returns 100% compliance score for empty array', () => {
    const result = calculateFirmCompliance([], NOW);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalStaffTracked).toBe(0);
      expect(result.data.complianceScore).toBe(100);
    }
  });

  it('calculates correct metrics for mixed compliance states', () => {
    const records: StaffComplianceRecord[] = [
      // Fully compliant: valid PI (200 days) + lifetime registration
      makeRecord({ staffId: 'a', piInsuranceExpiryDate: daysFromNow(NOW, 200), registrationExpiryDate: undefined }),
      // Lapsed PI, valid registration
      makeRecord({ staffId: 'b', piInsuranceExpiryDate: daysFromNow(NOW, -5), registrationExpiryDate: daysFromNow(NOW, 200) }),
      // Valid PI, registration expiring within 90 days (still fully compliant)
      makeRecord({ staffId: 'c', piInsuranceExpiryDate: daysFromNow(NOW, 200), registrationExpiryDate: daysFromNow(NOW, 45) }),
      // PI not set, registration lapsed
      makeRecord({ staffId: 'd', piInsuranceExpiryDate: undefined, registrationExpiryDate: daysFromNow(NOW, -30) }),
    ];

    const result = calculateFirmCompliance(records, NOW);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalStaffTracked).toBe(4);
      // a: valid PI, c: valid PI, b: lapsed (not valid), d: not_set (not valid)
      expect(result.data.staffWithValidPI).toBe(2);
      expect(result.data.staffWithLapsedPI).toBe(1); // b
      expect(result.data.staffWithRegistrationExpiring90).toBe(1); // c
      expect(result.data.staffWithRegistrationLapsed).toBe(1); // d
      // Fully compliant: a (valid PI + lifetime reg) and c (valid PI + expiring_90 reg still counts as current)
      expect(result.data.complianceScore).toBe(50); // 2 out of 4 = 50%
    }
  });

  it('returns 100% when all staff are fully compliant', () => {
    const records: StaffComplianceRecord[] = [
      makeRecord({ staffId: 'a', piInsuranceExpiryDate: daysFromNow(NOW, 200), registrationExpiryDate: undefined }),
      makeRecord({ staffId: 'b', piInsuranceExpiryDate: daysFromNow(NOW, 100), registrationExpiryDate: daysFromNow(NOW, 200) }),
    ];

    const result = calculateFirmCompliance(records, NOW);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.complianceScore).toBe(100);
    }
  });

  it('returns 0% when no staff are compliant', () => {
    const records: StaffComplianceRecord[] = [
      makeRecord({ staffId: 'a', piInsuranceExpiryDate: daysFromNow(NOW, -1), registrationExpiryDate: daysFromNow(NOW, -1) }),
      makeRecord({ staffId: 'b', piInsuranceExpiryDate: undefined, registrationExpiryDate: daysFromNow(NOW, -1) }),
    ];

    const result = calculateFirmCompliance(records, NOW);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.complianceScore).toBe(0);
    }
  });
});

// ─── generateComplianceAlerts ─────────────────────────────────────────────────

describe('generateComplianceAlerts', () => {
  it('returns error for non-array input', () => {
    const result = generateComplianceAlerts(null as unknown as StaffComplianceRecord[], NOW);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_INPUT');
    }
  });

  it('returns empty alerts for empty array', () => {
    const result = generateComplianceAlerts([], NOW);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual([]);
    }
  });

  it('generates a critical alert when PI has expired (R13.4)', () => {
    const records = [makeRecord({ piInsuranceExpiryDate: daysFromNow(NOW, -5) })];
    const result = generateComplianceAlerts(records, NOW);
    expect(result.success).toBe(true);
    if (result.success) {
      const piAlerts = result.data.filter(a => a.category === 'pi_insurance');
      expect(piAlerts).toHaveLength(1);
      expect(piAlerts[0].severity).toBe('critical');
      expect(piAlerts[0].message).toContain('expired');
      expect(piAlerts[0].message).toContain('may not have valid professional indemnity cover');
    }
  });

  it('generates an urgent alert when PI expires within 30 days (R13.3)', () => {
    const records = [makeRecord({ piInsuranceExpiryDate: daysFromNow(NOW, 20) })];
    const result = generateComplianceAlerts(records, NOW);
    expect(result.success).toBe(true);
    if (result.success) {
      const piAlerts = result.data.filter(a => a.category === 'pi_insurance');
      expect(piAlerts).toHaveLength(1);
      expect(piAlerts[0].severity).toBe('urgent');
      expect(piAlerts[0].daysRemaining).toBe(20);
    }
  });

  it('generates a warning alert when PI expires within 60 days (R13.2)', () => {
    const records = [makeRecord({ piInsuranceExpiryDate: daysFromNow(NOW, 45) })];
    const result = generateComplianceAlerts(records, NOW);
    expect(result.success).toBe(true);
    if (result.success) {
      const piAlerts = result.data.filter(a => a.category === 'pi_insurance');
      expect(piAlerts).toHaveLength(1);
      expect(piAlerts[0].severity).toBe('warning');
      expect(piAlerts[0].daysRemaining).toBe(45);
    }
  });

  it('generates no PI alert when PI is more than 60 days out', () => {
    const records = [makeRecord({ piInsuranceExpiryDate: daysFromNow(NOW, 100) })];
    const result = generateComplianceAlerts(records, NOW);
    expect(result.success).toBe(true);
    if (result.success) {
      const piAlerts = result.data.filter(a => a.category === 'pi_insurance');
      expect(piAlerts).toHaveLength(0);
    }
  });

  it('generates a registration warning when expiry is within 90 days (R13.5)', () => {
    const records = [makeRecord({
      registrationExpiryDate: daysFromNow(NOW, 60),
      piInsuranceExpiryDate: daysFromNow(NOW, 200),
    })];
    const result = generateComplianceAlerts(records, NOW);
    expect(result.success).toBe(true);
    if (result.success) {
      const regAlerts = result.data.filter(a => a.category === 'registration');
      expect(regAlerts).toHaveLength(1);
      expect(regAlerts[0].severity).toBe('warning');
      expect(regAlerts[0].daysRemaining).toBe(60);
    }
  });

  it('generates a critical registration alert when registration has lapsed', () => {
    const records = [makeRecord({
      registrationExpiryDate: daysFromNow(NOW, -10),
      piInsuranceExpiryDate: daysFromNow(NOW, 200),
    })];
    const result = generateComplianceAlerts(records, NOW);
    expect(result.success).toBe(true);
    if (result.success) {
      const regAlerts = result.data.filter(a => a.category === 'registration');
      expect(regAlerts).toHaveLength(1);
      expect(regAlerts[0].severity).toBe('critical');
    }
  });

  it('does NOT generate registration alerts for lifetime registrations', () => {
    const records = [makeRecord({
      registrationExpiryDate: undefined,
      piInsuranceExpiryDate: daysFromNow(NOW, 200),
    })];
    const result = generateComplianceAlerts(records, NOW);
    expect(result.success).toBe(true);
    if (result.success) {
      const regAlerts = result.data.filter(a => a.category === 'registration');
      expect(regAlerts).toHaveLength(0);
    }
  });

  it('generates multiple alerts for a single staff member with both issues', () => {
    const records = [makeRecord({
      piInsuranceExpiryDate: daysFromNow(NOW, -1),
      registrationExpiryDate: daysFromNow(NOW, -1),
    })];
    const result = generateComplianceAlerts(records, NOW);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
      expect(result.data.some(a => a.category === 'pi_insurance' && a.severity === 'critical')).toBe(true);
      expect(result.data.some(a => a.category === 'registration' && a.severity === 'critical')).toBe(true);
    }
  });

  it('generates alerts for multiple staff members', () => {
    const records = [
      makeRecord({ staffId: 'a', piInsuranceExpiryDate: daysFromNow(NOW, -1) }),
      makeRecord({ staffId: 'b', piInsuranceExpiryDate: daysFromNow(NOW, 25) }),
    ];
    const result = generateComplianceAlerts(records, NOW);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
      expect(result.data[0].staffId).toBe('a');
      expect(result.data[0].severity).toBe('critical');
      expect(result.data[1].staffId).toBe('b');
      expect(result.data[1].severity).toBe('urgent');
    }
  });
});

// ─── getVerificationExposure ──────────────────────────────────────────────────

describe('getVerificationExposure', () => {
  it('returns error for non-array input', () => {
    const result = getVerificationExposure(null as unknown as StaffComplianceRecord[], NOW);
    expect(result.success).toBe(false);
  });

  it('exposes correct verification data for Trust & Verification module (R13.7)', () => {
    const records = [makeRecord({
      registrationBody: 'ECSA',
      registrationBodyCustomName: undefined,
      registrationNumber: 'ENG-5678',
      registrationCategory: 'Professional Engineer',
      registrationExpiryDate: daysFromNow(NOW, 200),
      piInsuranceExpiryDate: daysFromNow(NOW, 100),
      piInsuranceSumInsuredZAR: 3_000_000,
    })];

    const result = getVerificationExposure(records, NOW);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      const exposure = result.data[0];
      expect(exposure.registrationBody).toBe('ECSA');
      expect(exposure.registrationNumber).toBe('ENG-5678');
      expect(exposure.registrationCategory).toBe('Professional Engineer');
      expect(exposure.registrationStatus).toBe('valid');
      expect(exposure.piStatus).toBe('valid');
      expect(exposure.piInsuranceSumInsuredZAR).toBe(3_000_000);
      expect(exposure.isFullyCompliant).toBe(true);
    }
  });

  it('returns empty array for empty records', () => {
    const result = getVerificationExposure([], NOW);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual([]);
    }
  });
});

// ─── Advisory Disclaimer (R13.9) ─────────────────────────────────────────────

describe('COMPLIANCE_DISCLAIMER', () => {
  it('contains advisory language about manually entered data', () => {
    expect(COMPLIANCE_DISCLAIMER).toContain('manually entered data');
    expect(COMPLIANCE_DISCLAIMER).toContain('independently verifying');
    expect(COMPLIANCE_DISCLAIMER).toContain('statutory body');
  });
});
