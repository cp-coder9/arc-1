/**
 * Escrow Release Request Service
 *
 * Creates and manages release requests sent to third-party financial providers.
 *
 * Architex does NOT hold funds. Release requests are instructions/references
 * sent to registered providers. The workflow enforces:
 * - Required approvals (client + lead professional)
 * - Dispute locks (disputed certificates block release)
 * - Provider configuration check (no live provider → provider_configuration_required)
 */
import type {
  FinancePartyRole,
  FinancialProvider,
  PaymentCertificate,
  ReleaseRequest,
} from './types';

/** Default required approvers for any release request */
const DEFAULT_REQUIRED_APPROVERS: FinancePartyRole[] = [
  'client',
  'lead_professional',
];

/**
 * Create a release request for a certified payment.
 *
 * Status determination logic:
 * 1. If certificate is disputed_locked → release stays disputed_locked
 * 2. If provider is not live-configured → provider_configuration_required
 * 3. If required approvals are all present → submitted_to_provider
 * 4. Otherwise → approval_required
 */
export function createReleaseRequest(
  certificate: PaymentCertificate,
  provider: FinancialProvider,
  approvals: FinancePartyRole[],
  requiredApprovals: FinancePartyRole[] = DEFAULT_REQUIRED_APPROVERS,
): ReleaseRequest {
  // Determine status
  let status: ReleaseRequest['status'];

  if (certificate.status === 'disputed_locked') {
    status = 'disputed_locked';
  } else if (!provider.liveConfigured) {
    status = 'provider_configuration_required';
  } else if (requiredApprovals.every((r) => approvals.includes(r))) {
    status = 'submitted_to_provider';
  } else {
    status = 'approval_required';
  }

  const providerReference =
    provider.liveConfigured && status === 'submitted_to_provider'
      ? `prov-${certificate.certificateId}-${Date.now()}`
      : undefined;

  return {
    releaseRequestId: `rel-${certificate.certificateId}`,
    certificateId: certificate.certificateId,
    providerId: provider.providerId,
    amount: certificate.approvedForRelease,
    requiredApprovals,
    approvals,
    status,
    providerReference,
    createdAtIso: new Date().toISOString(),
  };
}

/**
 * Add an approval to the release request. If all required approvals are
 * present and the provider is live, transitions to submitted_to_provider.
 */
export function approveReleaseRequest(
  request: ReleaseRequest,
  approverRole: FinancePartyRole,
  provider: FinancialProvider,
): ReleaseRequest {
  if (!request.requiredApprovals.includes(approverRole)) {
    throw new Error(
      `Role '${approverRole}' is not a required approver for this release request. ` +
        `Required: [${request.requiredApprovals.join(', ')}]`,
    );
  }

  if (request.approvals.includes(approverRole)) {
    // Already approved — no-op
    return request;
  }

  const updatedApprovals = [...request.approvals, approverRole];
  const allApproved = request.requiredApprovals.every((r) =>
    updatedApprovals.includes(r),
  );

  let status = request.status;
  if (request.status === 'approval_required' && allApproved) {
    status = provider.liveConfigured
      ? 'submitted_to_provider'
      : 'provider_configuration_required';
  }

  const providerReference =
    provider.liveConfigured && status === 'submitted_to_provider'
      ? `prov-${request.certificateId}-${Date.now()}`
      : request.providerReference;

  return {
    ...request,
    approvals: updatedApprovals,
    status,
    providerReference,
  };
}

/**
 * Check if a release request is blocked from proceeding.
 */
export function getReleaseBlockers(
  request: ReleaseRequest,
  provider: FinancialProvider,
): string[] {
  const blockers: string[] = [];

  if (request.status === 'disputed_locked') {
    blockers.push('Certificate is in disputed_locked state — resolve dispute first.');
  }

  if (request.status === 'provider_configuration_required') {
    blockers.push(
      `Provider '${provider.name}' is not live-configured. Configure credentials and agreements before live release.`,
    );
  }

  const missingApprovals = request.requiredApprovals.filter(
    (r) => !request.approvals.includes(r),
  );
  if (missingApprovals.length > 0) {
    blockers.push(
      `Missing approvals from: [${missingApprovals.join(', ')}]`,
    );
  }

  return blockers;
}
