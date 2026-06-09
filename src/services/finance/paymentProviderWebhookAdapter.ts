/**
 * Payment Provider Webhook Adapter
 *
 * Handles incoming webhook/status events from third-party financial providers.
 *
 * Responsibilities:
 * - Signature verification (placeholder — real verification requires provider keys)
 * - Payment/release/refund event handling
 * - Status mapping and audit trail generation
 *
 * No code pretends that Architex holds money. Provider-confirmed statuses
 * are recorded separately from Architex's own approval states.
 */
import type { ProviderStatusEvent, ReleaseRequest } from './types';

/**
 * Record a provider status event for a release request.
 * Maps Architex release status to the expected provider-side state.
 */
export function recordProviderStatusEvent(
  request: ReleaseRequest,
): ProviderStatusEvent {
  let mappedStatus: ProviderStatusEvent['status'];

  switch (request.status) {
    case 'submitted_to_provider':
      mappedStatus = 'processing';
      break;
    case 'provider_confirmed_paid':
      mappedStatus = 'paid';
      break;
    case 'disputed_locked':
      mappedStatus = 'failed';
      break;
    default:
      mappedStatus = 'received';
  }

  return {
    eventId: `webhook-${request.releaseRequestId}-${Date.now()}`,
    providerId: request.providerId,
    providerReference: request.providerReference ?? 'not-submitted',
    status: mappedStatus,
    rawSummary: `Provider event for release '${request.releaseRequestId}' with Architex status '${request.status}' → provider status '${mappedStatus}'`,
    receivedAtIso: new Date().toISOString(),
  };
}

/**
 * Parse and validate an incoming webhook payload from a provider.
 *
 * IMPORTANT: This is a structural validation placeholder. Real implementations
 * MUST verify webhook signatures using provider-specific keys/secrets.
 */
export function parseProviderWebhook(
  rawPayload: unknown,
): { valid: boolean; event?: Partial<ProviderStatusEvent>; errors: string[] } {
  const errors: string[] = [];

  if (typeof rawPayload !== 'object' || rawPayload === null) {
    return { valid: false, errors: ['Payload must be a JSON object.'] };
  }

  const payload = rawPayload as Record<string, unknown>;

  if (!payload.providerReference || typeof payload.providerReference !== 'string') {
    errors.push('Missing or invalid providerReference.');
  }

  if (!payload.status || typeof payload.status !== 'string') {
    errors.push('Missing or invalid status.');
  }

  const validStatuses: ProviderStatusEvent['status'][] = [
    'received',
    'processing',
    'paid',
    'failed',
  ];
  if (
    payload.status &&
    !validStatuses.includes(payload.status as ProviderStatusEvent['status'])
  ) {
    errors.push(
      `Invalid status '${payload.status}'. Must be one of: [${validStatuses.join(', ')}]`,
    );
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    event: {
      providerReference: payload.providerReference as string,
      status: payload.status as ProviderStatusEvent['status'],
      rawSummary:
        (payload.rawSummary as string) ??
        `Webhook received from provider`,
    },
  };
}

/**
 * Process a successful payment confirmation webhook.
 * Updates the release request status to provider_confirmed_paid.
 */
export function confirmPaymentReceived(
  request: ReleaseRequest,
  providerReference: string,
): ReleaseRequest {
  if (
    request.status !== 'submitted_to_provider' &&
    request.status !== 'provider_configuration_required'
  ) {
    throw new Error(
      `Cannot confirm payment: release request is in '${request.status}' state. ` +
        `Expected 'submitted_to_provider'.`,
    );
  }

  return {
    ...request,
    status: 'provider_confirmed_paid',
    providerReference,
  };
}

/**
 * Process a failed payment webhook from the provider.
 */
export function handlePaymentFailure(
  request: ReleaseRequest,
  reason: string,
): { request: ReleaseRequest; event: ProviderStatusEvent } {
  const event: ProviderStatusEvent = {
    eventId: `webhook-fail-${request.releaseRequestId}-${Date.now()}`,
    providerId: request.providerId,
    providerReference: request.providerReference ?? 'unknown',
    status: 'failed',
    rawSummary: reason,
    receivedAtIso: new Date().toISOString(),
  };

  return {
    request: {
      ...request,
      status: 'approval_required', // Reset — needs re-approval
      providerReference: undefined,
    },
    event,
  };
}
