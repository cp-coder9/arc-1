import type { CPDCertificate, CPDCourse } from './cpdTypes';

export interface BadgeInfo {
  label: string;
  variant: string;
}

export interface PricingLabel {
  label: string;
  price: string | null;
}

export interface PlatformFeeBreakdown {
  platformFeeRand: number;
  contentOwnerNetRand: number;
}

/**
 * Returns the verification badge for a CPD certificate.
 * - "Approved by ECSA" when the professional body is ECSA
 * - "Verification Pending" when no professional body is set
 * - "Verified by {body}" for all other professional bodies
 */
export function getCertificateBadge(certificate: CPDCertificate): BadgeInfo {
  if (!certificate.professionalBody) {
    return { label: 'Verification Pending', variant: 'secondary' };
  }
  if (certificate.professionalBody === 'ECSA') {
    return { label: 'Approved by ECSA', variant: 'default' };
  }
  return { label: `Verified by ${certificate.professionalBody}`, variant: 'default' };
}

/**
 * Returns the accreditation status badge for a CPD course.
 * - "Accredited by {body}" when the course has an accreditation reference
 * - "Prepared for Accreditation" when not yet accredited
 */
export function getAccreditationBadge(course: CPDCourse): BadgeInfo {
  if (course.accreditationReference) {
    const body = course.professionalBodies?.[0] || 'Professional Body';
    return { label: `Accredited by ${body}`, variant: 'default' };
  }
  return { label: 'Prepared for Accreditation', variant: 'secondary' };
}

/**
 * Returns the pricing label for a CPD course.
 * - "Partner Sponsored" with no price when free (0, null, or undefined)
 * - "R{amount} — Dedicated CPD Course" when paid
 */
export function getCoursePricingLabel(course: CPDCourse): PricingLabel {
  if (!course.assessmentPriceRand || course.assessmentPriceRand === 0) {
    return { label: 'Partner Sponsored', price: null };
  }
  return {
    label: `R${course.assessmentPriceRand} — Dedicated CPD Course`,
    price: `R${course.assessmentPriceRand}`,
  };
}

/**
 * Calculates the platform fee split for a paid CPD course.
 * - 20% platform fee
 * - 80% to content owner
 * - Rounded to 2 decimal places
 */
export function calculatePlatformFee(price: number): PlatformFeeBreakdown {
  const platformFeeRand = Math.round(price * 0.20 * 100) / 100;
  const contentOwnerNetRand = Math.round(price * 0.80 * 100) / 100;
  return { platformFeeRand, contentOwnerNetRand };
}
