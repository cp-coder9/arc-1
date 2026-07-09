// ─── EAP Management Service ─────────────────────────────────────────────────
// CRUD for EAPAppointment records, single active EAP constraint,
// EAPASA registration format validation, verification status tracking,
// action_required event generation, and appointment history management.
//
// Requirements: 3.1–3.8

import type {
  EAPAppointment,
  EAPVerificationStatus,
  EAPAssignmentStatus,
} from './eiaTypes';

// ─── ID Generation ───────────────────────────────────────────────────────────

let idCounter = 0;

function generateId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now()}_${idCounter}`;
}

// ─── EAP Appointment CRUD ────────────────────────────────────────────────────

/**
 * Creates a new EAP appointment with a generated ID and active assignment status.
 * All other fields are provided by the caller.
 *
 * Requirement 3.1: Record appointed EAP details.
 * Requirement 3.4: Write appointment record.
 */
export function createAppointment(
  data: Omit<EAPAppointment, 'id' | 'assignmentStatus'>
): EAPAppointment {
  return {
    ...data,
    id: generateId('eap'),
    assignmentStatus: 'active',
  };
}

/**
 * Replaces an active EAP appointment with a new one.
 * Sets the existing appointment status to 'replaced' with dateEnded and reason,
 * then creates a new active appointment.
 *
 * Requirement 3.5: One active EAP at a time, historical retained.
 * Requirement 3.6: Appointing new EAP sets existing to replaced.
 */
export function replaceAppointment(
  current: EAPAppointment,
  newData: Omit<EAPAppointment, 'id' | 'assignmentStatus'>,
  reason: string
): { previous: EAPAppointment; current: EAPAppointment } {
  const replacedAppointment: EAPAppointment = {
    ...current,
    assignmentStatus: 'replaced',
    dateEnded: new Date().toISOString(),
    replacementReason: reason,
  };

  const newAppointment = createAppointment(newData);

  return {
    previous: replacedAppointment,
    current: newAppointment,
  };
}

/**
 * Withdraws an active EAP appointment.
 * Sets assignment status to 'withdrawn' with dateEnded and reason.
 *
 * Requirement 3.3: Assignment status includes 'withdrawn'.
 */
export function withdrawAppointment(
  appointment: EAPAppointment,
  reason: string
): EAPAppointment {
  return {
    ...appointment,
    assignmentStatus: 'withdrawn',
    dateEnded: new Date().toISOString(),
    replacementReason: reason,
  };
}

// ─── EAPASA Registration Validation ─────────────────────────────────────────

/**
 * Validates the format of an EAPASA registration number.
 * Expected format: starts with "EAPASA/" followed by one or more digits.
 * At minimum, the registration number must be a non-empty string.
 *
 * Requirement 3.2: Verify registration number follows EAPASA format.
 */
export function validateEAPASARegistration(registrationNumber: string): boolean {
  if (!registrationNumber || registrationNumber.trim().length === 0) {
    return false;
  }
  // EAPASA registration format: "EAPASA/" followed by digits
  const eapasaPattern = /^EAPASA\/\d+$/;
  return eapasaPattern.test(registrationNumber);
}

// ─── Verification Status ─────────────────────────────────────────────────────

/**
 * Returns the verification status for a given registration number.
 * In a real implementation this would be an async external call to EAPASA.
 * Returns 'unverified' by default — actual verification would be async/external.
 *
 * Requirement 3.2: Record verification status as verified, unverified, or expired.
 */
export function getVerificationStatus(
  registrationNumber: string
): EAPVerificationStatus {
  // Default to 'unverified' — real verification would call EAPASA API
  return 'unverified';
}

// ─── EAP Required Check ─────────────────────────────────────────────────────

/**
 * Checks whether an EAP appointment is required.
 * Returns true when screening found triggered activities but no EAP is appointed.
 *
 * Requirement 3.7: Surface action_required event when screening identifies
 * EIA process but no EAP appointed.
 */
export function checkEAPRequired(
  hasTriggeredActivities: boolean,
  hasActiveEAP: boolean
): boolean {
  return hasTriggeredActivities && !hasActiveEAP;
}

// ─── Appointment History ─────────────────────────────────────────────────────

/**
 * Returns non-active (replaced or withdrawn) appointments sorted by dateEnded desc.
 * Appointments without dateEnded are placed at the end.
 *
 * Requirement 3.5: Historical appointments retained in appointment history log.
 */
export function getAppointmentHistory(
  appointments: EAPAppointment[]
): EAPAppointment[] {
  return appointments
    .filter((a) => a.assignmentStatus !== 'active')
    .sort((a, b) => {
      // Sort by dateEnded descending; those without dateEnded go last
      if (!a.dateEnded && !b.dateEnded) return 0;
      if (!a.dateEnded) return 1;
      if (!b.dateEnded) return -1;
      return new Date(b.dateEnded).getTime() - new Date(a.dateEnded).getTime();
    });
}

/**
 * Returns the single active appointment from a list, or undefined if none.
 *
 * Requirement 3.5: One active EAP appointment at a time.
 */
export function getActiveAppointment(
  appointments: EAPAppointment[]
): EAPAppointment | undefined {
  return appointments.find((a) => a.assignmentStatus === 'active');
}
