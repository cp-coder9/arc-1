/**
 * Payment Certificate Service
 *
 * Certifies payment claims through the QS/lead professional review process.
 *
 * Key formula:
 *   Gross Certified → Less Retention → Less Previous Payments → Net Payable
 *
 * Certificates are revised/superseded, never silently edited.
 * Claimed, certified, approved-release, and provider-paid amounts are always
 * kept separate.
 */
import type {
  CommercialBaseline,
  FinancePartyRole,
  MoneyAmount,
  PaymentCertificate,
  PaymentClaim,
} from './types';

/**
 * Certify a payment claim, producing a payment certificate.
 *
 * - Retention is calculated as a percentage of the certified amount.
 * - Any difference between claimed and certified becomes the disputed amount.
 * - The approved-for-release amount is certified minus retention.
 */
export function certifyPaymentClaim(
  claim: PaymentClaim,
  baseline: CommercialBaseline,
  certifiedAmount: MoneyAmount,
  reviewerRoles: FinancePartyRole[] = ['quantity_surveyor', 'lead_professional'],
): PaymentCertificate {
  const retentionHeld: MoneyAmount = {
    currency: 'ZAR',
    amount: Math.round((certifiedAmount.amount * baseline.retentionPercent) / 100),
  };

  const disputedAmount: MoneyAmount = {
    currency: 'ZAR',
    amount: Math.max(0, claim.claimedAmount.amount - certifiedAmount.amount),
  };

  const approvedForRelease: MoneyAmount = {
    currency: 'ZAR',
    amount: certifiedAmount.amount - retentionHeld.amount,
  };

  const status = claim.disputed ? 'disputed_locked' : 'approval_required';

  const now = new Date().toISOString();

  return {
    certificateId: `cert-${claim.claimId}-${Date.now()}`,
    claimId: claim.claimId,
    claimedAmount: claim.claimedAmount,
    certifiedAmount,
    retentionHeld,
    disputedAmount,
    approvedForRelease,
    reviewerRoles,
    status,
    issuedAtIso: now,
  };
}

/**
 * Revise a previously-issued certificate. The old certificate is superseded
 * (not silently edited). The new certificate references the old one.
 */
export function reviseCertificate(
  previousCertificate: PaymentCertificate,
  claim: PaymentClaim,
  baseline: CommercialBaseline,
  newCertifiedAmount: MoneyAmount,
  reviewerRoles?: FinancePartyRole[],
): PaymentCertificate {
  const revised = certifyPaymentClaim(
    claim,
    baseline,
    newCertifiedAmount,
    reviewerRoles ?? previousCertificate.reviewerRoles,
  );

  return {
    ...revised,
    certificateId: `cert-rev-${previousCertificate.certificateId}-${Date.now()}`,
    revisedFromCertificateId: previousCertificate.certificateId,
  };
}

/**
 * Calculate net payable: certified amount less retention less previous payments.
 */
export function calculateNetPayable(
  certificate: PaymentCertificate,
  previousPaymentsTotal: number,
): MoneyAmount {
  const net =
    certificate.certifiedAmount.amount -
    certificate.retentionHeld.amount -
    previousPaymentsTotal;

  return {
    currency: 'ZAR',
    amount: Math.max(0, net),
  };
}

/**
 * Mark a certificate as approved for provider release.
 */
export function approveCertificateForRelease(
  certificate: PaymentCertificate,
  approverRole: FinancePartyRole,
): PaymentCertificate {
  if (certificate.status === 'disputed_locked') {
    throw new Error(
      'Cannot approve for release: certificate is in disputed_locked state',
    );
  }

  const isAlreadyApprover = certificate.reviewerRoles.includes(approverRole);
  return {
    ...certificate,
    reviewerRoles: isAlreadyApprover
      ? certificate.reviewerRoles
      : [...certificate.reviewerRoles, approverRole],
    status: 'approved_for_provider_request',
  };
}

/**
 * Get certificate history — certificates that superseded or were superseded
 * by this one (for audit / paper trail).
 */
export function getCertificateChain(
  certificates: PaymentCertificate[],
  startCertificateId: string,
): PaymentCertificate[] {
  const chain: PaymentCertificate[] = [];
  let currentId: string | undefined = startCertificateId;

  while (currentId) {
    const cert = certificates.find((c) => c.certificateId === currentId);
    if (!cert) break;
    chain.push(cert);
    currentId = cert.revisedFromCertificateId;
  }

  return chain;
}
