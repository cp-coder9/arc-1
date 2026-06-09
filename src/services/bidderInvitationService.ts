/**
 * Bidder Invitation Service
 *
 * Manages the complete invitation lifecycle:
 *   - Create invitations for matched/shortlisted bidders
 *   - Track invitation status (invited → accepted/declined)
 *   - Expiry management and follow-up triggers
 *   - Fairness: equal access to information for all invited bidders
 *
 * All invitations are advisory. Human confirmation is required before issue.
 */

export type InvitationStatus =
  | 'draft'
  | 'invited'
  | 'delivered'
  | 'viewed'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'revoked';

export interface BidderInvitationInput {
  rfqId: string;
  rfqTitle: string;
  bidderId: string;
  bidderName: string;
  bidderEmail: string;
  bidderCategory: string;
  invitedBy: string;
  message?: string;
  expiryDays?: number;
}

export interface BidderInvitationRecord {
  invitationId: string;
  rfqId: string;
  rfqTitle: string;
  bidderId: string;
  bidderName: string;
  bidderEmail: string;
  bidderCategory: string;
  status: InvitationStatus;
  invitedBy: string;
  invitedAt: string;
  expiresAt: string;
  message: string;
  respondedAt?: string;
  declineReason?: string;
  fairnessNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvitationBatchResult {
  rfqId: string;
  totalInvited: number;
  invitations: BidderInvitationRecord[];
  summary: string;
}

const FAIRNESS_NOTE =
  'All invited bidders must receive equal access to the RFQ package and any subsequent addenda. Clarifications that affect scope, price, programme, or risk must be distributed to all bidders.';

function generateInvitationId(rfqId: string, bidderId: string): string {
  return `inv_${rfqId}_${bidderId}`;
}

function calculateExpiry(createdAt: string, expiryDays: number): string {
  const date = new Date(createdAt);
  date.setDate(date.getDate() + expiryDays);
  return date.toISOString();
}

function isExpired(expiresAt: string): boolean {
  return Date.parse(expiresAt) <= Date.now();
}

/**
 * Creates a single bidder invitation record.
 */
export function createBidderInvitation(
  input: BidderInvitationInput,
): BidderInvitationRecord {
  if (!input.rfqId.trim()) throw new Error('RFQ ID is required');
  if (!input.bidderId.trim()) throw new Error('Bidder ID is required');
  if (!input.bidderEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.bidderEmail))
    throw new Error('Valid bidder email is required');
  if (!input.bidderName.trim()) throw new Error('Bidder name is required');

  const now = new Date().toISOString();
  const expiryDays = input.expiryDays ?? 14;

  return {
    invitationId: generateInvitationId(input.rfqId, input.bidderId),
    rfqId: input.rfqId,
    rfqTitle: input.rfqTitle.trim(),
    bidderId: input.bidderId,
    bidderName: input.bidderName.trim(),
    bidderEmail: input.bidderEmail.trim(),
    bidderCategory: input.bidderCategory.trim(),
    status: 'draft',
    invitedBy: input.invitedBy,
    invitedAt: now,
    expiresAt: calculateExpiry(now, expiryDays),
    message: input.message?.trim() ?? `You are invited to submit a quote for: ${input.rfqTitle}`,
    fairnessNote: FAIRNESS_NOTE,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Creates invitations for multiple bidders in a batch.
 */
export function createBatchInvitations(
  inputs: BidderInvitationInput[],
): InvitationBatchResult {
  if (inputs.length === 0) throw new Error('At least one bidder input is required');

  const rfqId = inputs[0].rfqId;
  const allSameRfq = inputs.every((i) => i.rfqId === rfqId);
  if (!allSameRfq) throw new Error('All invitations in a batch must be for the same RFQ');

  const invitations = inputs.map((input) => createBidderInvitation(input));

  return {
    rfqId,
    totalInvited: invitations.length,
    invitations,
    summary: `${invitations.length} bidder(s) invited to RFQ: ${inputs[0].rfqTitle}`,
  };
}

/**
 * Marks an invitation as issued/sent to the bidder.
 */
export function issueInvitation(
  invitation: BidderInvitationRecord,
): BidderInvitationRecord {
  if (invitation.status === 'expired') throw new Error('Cannot issue an expired invitation');
  if (invitation.status === 'revoked') throw new Error('Cannot issue a revoked invitation');

  return {
    ...invitation,
    status: 'invited',
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Marks an invitation as delivered to the bidder.
 */
export function markInvitationDelivered(
  invitation: BidderInvitationRecord,
): BidderInvitationRecord {
  if (invitation.status !== 'invited' && invitation.status !== 'draft')
    throw new Error(`Cannot mark a ${invitation.status} invitation as delivered`);

  return {
    ...invitation,
    status: 'delivered',
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Records a bidder's acceptance of the invitation.
 */
export function acceptInvitation(
  invitation: BidderInvitationRecord,
): BidderInvitationRecord {
  if (isExpired(invitation.expiresAt)) throw new Error('Invitation has expired');
  if (invitation.status === 'revoked') throw new Error('Invitation has been revoked');
  if (invitation.status === 'accepted') throw new Error('Invitation already accepted');

  return {
    ...invitation,
    status: 'accepted',
    respondedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Records a bidder's declination of the invitation.
 */
export function declineInvitation(
  invitation: BidderInvitationRecord,
  reason?: string,
): BidderInvitationRecord {
  if (invitation.status === 'revoked') throw new Error('Invitation has been revoked');

  return {
    ...invitation,
    status: 'declined',
    declineReason: reason?.trim(),
    respondedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Revokes a previously issued invitation.
 */
export function revokeInvitation(
  invitation: BidderInvitationRecord,
): BidderInvitationRecord {
  if (invitation.status === 'accepted')
    throw new Error('Cannot revoke an already accepted invitation');

  return {
    ...invitation,
    status: 'revoked',
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Checks and updates expired invitations.
 */
export function checkAndExpireInvitations(
  invitations: BidderInvitationRecord[],
): BidderInvitationRecord[] {
  return invitations.map((inv) => {
    if (
      ['invited', 'delivered', 'viewed'].includes(inv.status) &&
      isExpired(inv.expiresAt)
    ) {
      return { ...inv, status: 'expired' as InvitationStatus, updatedAt: new Date().toISOString() };
    }
    return inv;
  });
}

/**
 * Returns a summary of invitation statuses for a given RFQ.
 */
export function getInvitationStatusSummary(
  invitations: BidderInvitationRecord[],
): {
  total: number;
  invited: number;
  delivered: number;
  viewed: number;
  accepted: number;
  declined: number;
  expired: number;
  revoked: number;
  minBiddersMet: boolean;
  minBiddersRequired: number;
} {
  const counts = {
    total: invitations.length,
    invited: 0,
    delivered: 0,
    viewed: 0,
    accepted: 0,
    declined: 0,
    expired: 0,
    revoked: 0,
  };

  for (const inv of invitations) {
    if (inv.status in counts) {
      counts[inv.status as keyof typeof counts]++;
    }
  }

  return {
    ...counts,
    minBiddersMet: counts.accepted + (invitations.length - counts.declined - counts.revoked - counts.expired) >= 3,
    minBiddersRequired: 3,
  };
}
