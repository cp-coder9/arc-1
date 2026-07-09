/**
 * Shared constants for the Health & Safety module.
 */

/**
 * All 8 mandatory Safety File sections per Regulation 7 of the Construction Regulations 2014.
 */
export const MANDATORY_SAFETY_FILE_SECTIONS: {
  sectionId: string;
  title: string;
  regulationRef: string;
}[] = [
  { sectionId: 'hs_plan', title: 'Health & Safety Plan', regulationRef: '7.1' },
  { sectionId: 'risk_assessments', title: 'Risk Assessments', regulationRef: '7.2' },
  { sectionId: 'fall_protection_plan', title: 'Fall Protection Plan', regulationRef: '7.3' },
  { sectionId: 'permits', title: 'Permits', regulationRef: '7.4' },
  { sectionId: 'incident_records', title: 'Incident Records', regulationRef: '7.5' },
  { sectionId: 'induction_records', title: 'Induction Records', regulationRef: '7.6' },
  { sectionId: 'emergency_procedures', title: 'Emergency Procedures', regulationRef: '7.7' },
  { sectionId: 'appointments', title: 'Appointments', regulationRef: '7.8' },
];

/**
 * Risk matrix classification thresholds for the 5×5 likelihood-severity matrix.
 * Rating = likelihood × severity (range 1–25).
 */
export const RISK_MATRIX_THRESHOLDS = {
  low: { min: 1, max: 4 },
  medium: { min: 5, max: 9 },
  high: { min: 10, max: 15 },
  critical: { min: 16, max: 25 },
} as const;

/**
 * Number of business days before an unanswered H&S Plan submission triggers escalation.
 */
export const ESCALATION_BUSINESS_DAYS = 5;

/**
 * Advisory-only disclaimer included on all generated reports and compliance score outputs.
 */
export const ADVISORY_DISCLAIMER =
  'This assessment is advisory only and does not constitute professional certification. The Health & Safety Module provides readiness assessments and gap reports to assist compliance efforts under the Construction Regulations 2014 and OHS Act 85 of 1993.';

/**
 * Counts the number of business days (weekdays) between two dates, excluding weekends.
 * Both start and end dates are excluded from the count (i.e. counts days strictly between them).
 * If endDate is before or equal to startDate, returns 0.
 */
export function calculateBusinessDays(startDate: Date, endDate: Date): number {
  if (endDate <= startDate) {
    return 0;
  }

  let count = 0;
  const current = new Date(startDate);
  current.setDate(current.getDate() + 1); // start from the day after startDate

  while (current < endDate) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}
