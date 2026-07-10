// ─── EAP Management Service Tests ───────────────────────────────────────────
// Tests for EAPAppointment CRUD, single active constraint, EAPASA validation,
// verification status, action_required check, and appointment history.
//
// Requirements: 3.1–3.8

import { describe, it, expect } from 'vitest';
import {
  createAppointment,
  replaceAppointment,
  withdrawAppointment,
  validateEAPASARegistration,
  getVerificationStatus,
  checkEAPRequired,
  getAppointmentHistory,
  getActiveAppointment,
} from '../../services/eia/eapManagementService';
import type { EAPAppointment } from '../../services/eia/eiaTypes';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAppointmentData() {
  return {
    projectId: 'proj-001',
    practitionerName: 'Dr. Jane Smith',
    firmName: 'Green Consultants (Pty) Ltd',
    eapasaRegistration: 'EAPASA/12345',
    email: 'jane@greenconsultants.co.za',
    telephone: '+27 11 234 5678',
    dateOfAppointment: '2024-03-15',
    verificationStatus: 'unverified' as const,
  };
}

function makeActiveAppointment(overrides: Partial<EAPAppointment> = {}): EAPAppointment {
  return {
    id: 'eap-existing-001',
    projectId: 'proj-001',
    practitionerName: 'Dr. Jane Smith',
    firmName: 'Green Consultants (Pty) Ltd',
    eapasaRegistration: 'EAPASA/12345',
    email: 'jane@greenconsultants.co.za',
    telephone: '+27 11 234 5678',
    dateOfAppointment: '2024-01-10',
    verificationStatus: 'verified',
    assignmentStatus: 'active',
    ...overrides,
  };
}

// ─── createAppointment ───────────────────────────────────────────────────────

describe('createAppointment', () => {
  it('creates an appointment with generated ID and active status', () => {
    const data = makeAppointmentData();
    const result = createAppointment(data);

    expect(result.id).toBeDefined();
    expect(result.id).toMatch(/^eap_/);
    expect(result.assignmentStatus).toBe('active');
    expect(result.practitionerName).toBe('Dr. Jane Smith');
    expect(result.firmName).toBe('Green Consultants (Pty) Ltd');
    expect(result.eapasaRegistration).toBe('EAPASA/12345');
    expect(result.email).toBe('jane@greenconsultants.co.za');
    expect(result.telephone).toBe('+27 11 234 5678');
    expect(result.dateOfAppointment).toBe('2024-03-15');
    expect(result.verificationStatus).toBe('unverified');
  });

  it('generates unique IDs for different appointments', () => {
    const data = makeAppointmentData();
    const a = createAppointment(data);
    const b = createAppointment(data);
    expect(a.id).not.toBe(b.id);
  });
});

// ─── replaceAppointment ──────────────────────────────────────────────────────

describe('replaceAppointment', () => {
  it('sets existing appointment to replaced with dateEnded and reason', () => {
    const current = makeActiveAppointment();
    const newData = makeAppointmentData();
    const reason = 'EAP firm merged with another practice';

    const result = replaceAppointment(current, newData, reason);

    expect(result.previous.assignmentStatus).toBe('replaced');
    expect(result.previous.dateEnded).toBeDefined();
    expect(result.previous.replacementReason).toBe(reason);
    expect(result.previous.id).toBe('eap-existing-001');
  });

  it('creates a new active appointment', () => {
    const current = makeActiveAppointment();
    const newData = makeAppointmentData();
    const reason = 'Change of consultant';

    const result = replaceAppointment(current, newData, reason);

    expect(result.current.assignmentStatus).toBe('active');
    expect(result.current.id).toMatch(/^eap_/);
    expect(result.current.practitionerName).toBe('Dr. Jane Smith');
  });

  it('new appointment ID differs from previous', () => {
    const current = makeActiveAppointment();
    const newData = makeAppointmentData();

    const result = replaceAppointment(current, newData, 'reason');

    expect(result.current.id).not.toBe(result.previous.id);
  });
});

// ─── withdrawAppointment ─────────────────────────────────────────────────────

describe('withdrawAppointment', () => {
  it('sets assignment status to withdrawn with dateEnded and reason', () => {
    const appointment = makeActiveAppointment();
    const reason = 'EAP registration expired';

    const result = withdrawAppointment(appointment, reason);

    expect(result.assignmentStatus).toBe('withdrawn');
    expect(result.dateEnded).toBeDefined();
    expect(result.replacementReason).toBe(reason);
  });

  it('preserves all other appointment fields', () => {
    const appointment = makeActiveAppointment();
    const result = withdrawAppointment(appointment, 'reason');

    expect(result.id).toBe(appointment.id);
    expect(result.practitionerName).toBe(appointment.practitionerName);
    expect(result.firmName).toBe(appointment.firmName);
    expect(result.eapasaRegistration).toBe(appointment.eapasaRegistration);
    expect(result.email).toBe(appointment.email);
    expect(result.projectId).toBe(appointment.projectId);
  });
});

// ─── validateEAPASARegistration ──────────────────────────────────────────────

describe('validateEAPASARegistration', () => {
  it('returns true for valid EAPASA format (EAPASA/digits)', () => {
    expect(validateEAPASARegistration('EAPASA/12345')).toBe(true);
    expect(validateEAPASARegistration('EAPASA/1')).toBe(true);
    expect(validateEAPASARegistration('EAPASA/99999')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(validateEAPASARegistration('')).toBe(false);
  });

  it('returns false for whitespace-only string', () => {
    expect(validateEAPASARegistration('   ')).toBe(false);
  });

  it('returns false for missing EAPASA/ prefix', () => {
    expect(validateEAPASARegistration('12345')).toBe(false);
    expect(validateEAPASARegistration('EAP/12345')).toBe(false);
  });

  it('returns false for non-digit suffix', () => {
    expect(validateEAPASARegistration('EAPASA/abc')).toBe(false);
    expect(validateEAPASARegistration('EAPASA/')).toBe(false);
    expect(validateEAPASARegistration('EAPASA/123abc')).toBe(false);
  });
});

// ─── getVerificationStatus ───────────────────────────────────────────────────

describe('getVerificationStatus', () => {
  it('returns unverified by default', () => {
    expect(getVerificationStatus('EAPASA/12345')).toBe('unverified');
  });

  it('returns unverified regardless of input (stub)', () => {
    expect(getVerificationStatus('anything')).toBe('unverified');
    expect(getVerificationStatus('')).toBe('unverified');
  });
});

// ─── checkEAPRequired ────────────────────────────────────────────────────────

describe('checkEAPRequired', () => {
  it('returns true when triggered activities exist and no active EAP', () => {
    expect(checkEAPRequired(true, false)).toBe(true);
  });

  it('returns false when triggered activities exist and EAP is active', () => {
    expect(checkEAPRequired(true, true)).toBe(false);
  });

  it('returns false when no triggered activities', () => {
    expect(checkEAPRequired(false, false)).toBe(false);
    expect(checkEAPRequired(false, true)).toBe(false);
  });
});

// ─── getAppointmentHistory ───────────────────────────────────────────────────

describe('getAppointmentHistory', () => {
  it('returns only non-active appointments', () => {
    const appointments: EAPAppointment[] = [
      makeActiveAppointment({ id: '1', assignmentStatus: 'active' }),
      makeActiveAppointment({ id: '2', assignmentStatus: 'replaced', dateEnded: '2024-02-01T00:00:00Z' }),
      makeActiveAppointment({ id: '3', assignmentStatus: 'withdrawn', dateEnded: '2024-01-15T00:00:00Z' }),
    ];

    const history = getAppointmentHistory(appointments);

    expect(history).toHaveLength(2);
    expect(history.every((a) => a.assignmentStatus !== 'active')).toBe(true);
  });

  it('sorts by dateEnded descending', () => {
    const appointments: EAPAppointment[] = [
      makeActiveAppointment({ id: '1', assignmentStatus: 'replaced', dateEnded: '2024-01-01T00:00:00Z' }),
      makeActiveAppointment({ id: '2', assignmentStatus: 'replaced', dateEnded: '2024-03-01T00:00:00Z' }),
      makeActiveAppointment({ id: '3', assignmentStatus: 'withdrawn', dateEnded: '2024-02-01T00:00:00Z' }),
    ];

    const history = getAppointmentHistory(appointments);

    expect(history[0].id).toBe('2');
    expect(history[1].id).toBe('3');
    expect(history[2].id).toBe('1');
  });

  it('returns empty array when all appointments are active', () => {
    const appointments: EAPAppointment[] = [
      makeActiveAppointment({ id: '1', assignmentStatus: 'active' }),
    ];

    expect(getAppointmentHistory(appointments)).toHaveLength(0);
  });

  it('places appointments without dateEnded at the end', () => {
    const appointments: EAPAppointment[] = [
      makeActiveAppointment({ id: '1', assignmentStatus: 'replaced', dateEnded: undefined }),
      makeActiveAppointment({ id: '2', assignmentStatus: 'replaced', dateEnded: '2024-03-01T00:00:00Z' }),
    ];

    const history = getAppointmentHistory(appointments);

    expect(history[0].id).toBe('2');
    expect(history[1].id).toBe('1');
  });
});

// ─── getActiveAppointment ────────────────────────────────────────────────────

describe('getActiveAppointment', () => {
  it('returns the active appointment', () => {
    const appointments: EAPAppointment[] = [
      makeActiveAppointment({ id: '1', assignmentStatus: 'replaced' }),
      makeActiveAppointment({ id: '2', assignmentStatus: 'active' }),
      makeActiveAppointment({ id: '3', assignmentStatus: 'withdrawn' }),
    ];

    const active = getActiveAppointment(appointments);

    expect(active).toBeDefined();
    expect(active!.id).toBe('2');
  });

  it('returns undefined when no active appointment exists', () => {
    const appointments: EAPAppointment[] = [
      makeActiveAppointment({ id: '1', assignmentStatus: 'replaced' }),
      makeActiveAppointment({ id: '2', assignmentStatus: 'withdrawn' }),
    ];

    expect(getActiveAppointment(appointments)).toBeUndefined();
  });

  it('returns undefined for empty array', () => {
    expect(getActiveAppointment([])).toBeUndefined();
  });
});
