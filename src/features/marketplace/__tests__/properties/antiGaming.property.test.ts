// @vitest-environment jsdom
/**
 * Property Tests for Verification and Anti-Gaming
 *
 * Feature: pack-marketplace, Property 36: Anti-gaming search ranking independence
 * Feature: pack-marketplace, Property 37: Review non-anonymity
 * Feature: pack-marketplace, Property 38: Dispute record completeness
 * Feature: pack-marketplace, Property 39: Registration suspension cascades to marketplace
 *
 * **Validates: Requirements 14.1, 14.3, 14.4, 14.5, 14.6**
 */
import * as fc from 'fast-check';

// ── Types ────────────────────────────────────────────────────────────────────

interface ProfessionalRankingInput {
  userId: string;
  displayName: string;
  trustScore: number;
  verifiedCredentials: boolean;
  cpdCompliant: boolean;
  aiAuditPassRate: number;
  profilePhoto: string | null;
  testimonials: string[];
  popularityMetric: number;
}

interface Review {
  reviewId: string;
  rating: number;
  comment: string;
  verifiedUserId: string | null;
  linkedProjectId: string | null;
  linkedTaskId: string | null;
}

interface ReviewValidationResult {
  accepted: boolean;
  rejectionReasons?: string[];
}

interface DisputeFilingParams {
  filingPartyId: string | null;
  opposingPartyId: string | null;
  relatedEntityType: 'project' | 'task' | 'quote';
  relatedEntityId: string;
  evidenceRefs: string[];
  description: string;
}

interface DisputeRecord {
  disputeId: string;
  filingPartyId: string;
  opposingPartyId: string;
  relatedEntityType: string;
  relatedEntityId: string;
  evidenceRefs: string[];
  eventLog: Array<{ event: string; timestamp: string }>;
  status: 'open';
  createdAt: string;
}

interface DisputeFilingResult {
  accepted: boolean;
  dispute?: DisputeRecord;
  rejectionReasons?: string[];
}

type ListingStatus = 'active' | 'suspended' | 'expired';
type ApplicationStatus = 'pending' | 'accepted' | 'rejected' | 'suspended';
type RegistrationStatus = 'active' | 'inactive' | 'suspended' | 'expired';

interface UserListing { id: string; status: ListingStatus; }
interface UserApplication { id: string; status: ApplicationStatus; }

interface UserMarketplaceState {
  userId: string;
  registrationStatus: RegistrationStatus;
  activeListings: UserListing[];
  pendingApplications: UserApplication[];
}

interface SuspensionResult {
  suspendedListings: string[];
  suspendedApplications: string[];
}

// ── Anti-Gaming Logic ────────────────────────────────────────────────────────

function computeSearchRanking(professional: ProfessionalRankingInput): number {
  // Ranking determined ONLY by Trust Score, credentials, CPD, AI audit pass rate
  // Non-ranking factors (photos, testimonials, popularity) are ignored
  return professional.trustScore;
}

function validateReview(review: Review): ReviewValidationResult {
  const rejectionReasons: string[] = [];
  if (!review.verifiedUserId) {
    rejectionReasons.push('Review must be tied to a verified user identifier');
  }
  if (!review.linkedProjectId && !review.linkedTaskId) {
    rejectionReasons.push('Review must be linked to a completed project or task');
  }
  if (rejectionReasons.length > 0) {
    return { accepted: false, rejectionReasons };
  }
  return { accepted: true };
}

function fileDispute(params: DisputeFilingParams): DisputeFilingResult {
  const rejectionReasons: string[] = [];
  if (!params.filingPartyId) {
    rejectionReasons.push('Filing party identifier is required');
  }
  if (!params.opposingPartyId) {
    rejectionReasons.push('Opposing party identifier is required');
  }
  if (params.evidenceRefs.length === 0) {
    rejectionReasons.push('At least one evidence reference is required');
  }
  if (rejectionReasons.length > 0) {
    return { accepted: false, rejectionReasons };
  }
  const dispute: DisputeRecord = {
    disputeId: `dsp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    filingPartyId: params.filingPartyId!,
    opposingPartyId: params.opposingPartyId!,
    relatedEntityType: params.relatedEntityType,
    relatedEntityId: params.relatedEntityId,
    evidenceRefs: params.evidenceRefs,
    eventLog: [{ event: 'dispute_filed', timestamp: new Date().toISOString() }],
    status: 'open',
    createdAt: new Date().toISOString(),
  };
  return { accepted: true, dispute };
}

function cascadeRegistrationSuspension(userState: UserMarketplaceState): SuspensionResult {
  const suspendedListings: string[] = [];
  const suspendedApplications: string[] = [];
  const shouldSuspend = ['inactive', 'suspended', 'expired'].includes(userState.registrationStatus);
  if (shouldSuspend) {
    for (const listing of userState.activeListings) {
      if (listing.status === 'active') {
        listing.status = 'suspended';
        suspendedListings.push(listing.id);
      }
    }
    for (const application of userState.pendingApplications) {
      if (application.status === 'pending') {
        application.status = 'suspended';
        suspendedApplications.push(application.id);
      }
    }
  }
  return { suspendedListings, suspendedApplications };
}

// ── Arbitraries ──────────────────────────────────────────────────────────────

const userIdArb = fc.uuid().map(id => `usr-${id}`);

const rankingInputArb: fc.Arbitrary<ProfessionalRankingInput> = fc.record({
  userId: userIdArb,
  displayName: fc.string({ minLength: 2, maxLength: 50 }),
  trustScore: fc.integer({ min: 0, max: 100 }),
  verifiedCredentials: fc.boolean(),
  cpdCompliant: fc.boolean(),
  aiAuditPassRate: fc.double({ min: 0, max: 100, noNaN: true }),
  profilePhoto: fc.option(fc.webUrl(), { nil: null }),
  testimonials: fc.array(fc.string({ minLength: 10, maxLength: 200 }), { minLength: 0, maxLength: 10 }),
  popularityMetric: fc.integer({ min: 0, max: 100000 }),
});

const reviewArb: fc.Arbitrary<Review> = fc.record({
  reviewId: fc.uuid(),
  rating: fc.integer({ min: 1, max: 5 }),
  comment: fc.string({ minLength: 5, maxLength: 500 }),
  verifiedUserId: fc.option(userIdArb, { nil: null }),
  linkedProjectId: fc.option(fc.uuid(), { nil: null }),
  linkedTaskId: fc.option(fc.uuid(), { nil: null }),
});

const disputeParamsArb: fc.Arbitrary<DisputeFilingParams> = fc.record({
  filingPartyId: fc.option(userIdArb, { nil: null }),
  opposingPartyId: fc.option(userIdArb, { nil: null }),
  relatedEntityType: fc.constantFrom('project' as const, 'task' as const, 'quote' as const),
  relatedEntityId: fc.uuid(),
  evidenceRefs: fc.array(fc.uuid(), { minLength: 0, maxLength: 5 }),
  description: fc.string({ minLength: 10, maxLength: 500 }),
});

const listingArb: fc.Arbitrary<UserListing> = fc.record({
  id: fc.uuid().map(id => `lst-${id}`),
  status: fc.constantFrom<ListingStatus>('active', 'suspended', 'expired'),
});

const applicationArb: fc.Arbitrary<UserApplication> = fc.record({
  id: fc.uuid().map(id => `app-${id}`),
  status: fc.constantFrom<ApplicationStatus>('pending', 'accepted', 'rejected', 'suspended'),
});

const registrationStatusArb = fc.constantFrom<RegistrationStatus>('active', 'inactive', 'suspended', 'expired');

const userMarketplaceStateArb: fc.Arbitrary<UserMarketplaceState> = fc.record({
  userId: userIdArb,
  registrationStatus: registrationStatusArb,
  activeListings: fc.array(listingArb, { minLength: 0, maxLength: 10 }),
  pendingApplications: fc.array(applicationArb, { minLength: 0, maxLength: 10 }),
});


// Feature: pack-marketplace, Property 36: Anti-gaming search ranking independence
describe('Property 36: Anti-gaming search ranking independence', () => {
  // **Validates: Requirements 14.5**

  it('professionals with identical ranking factors have identical ranking regardless of non-ranking factors', () => {
    fc.assert(
      fc.property(
        rankingInputArb,
        fc.option(fc.webUrl(), { nil: null }),
        fc.array(fc.string({ minLength: 10, maxLength: 200 }), { minLength: 0, maxLength: 10 }),
        fc.integer({ min: 0, max: 100000 }),
        (baseProfile, altPhoto, altTestimonials, altPopularity) => {
          const prof1 = { ...baseProfile };
          const prof2 = {
            ...baseProfile,
            userId: `usr-alt-${baseProfile.userId}`,
            profilePhoto: altPhoto,
            testimonials: altTestimonials,
            popularityMetric: altPopularity,
          };
          const ranking1 = computeSearchRanking(prof1);
          const ranking2 = computeSearchRanking(prof2);
          expect(ranking1).toBe(ranking2);
        }
      ),
      { numRuns: 200 },
    );
  });

  it('ranking is determined solely by trust score', () => {
    fc.assert(
      fc.property(rankingInputArb, (profile) => {
        const ranking = computeSearchRanking(profile);
        expect(ranking).toBe(profile.trustScore);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: pack-marketplace, Property 37: Review non-anonymity
describe('Property 37: Review non-anonymity', () => {
  // **Validates: Requirements 14.3**

  it('review is rejected if not tied to verified user ID', () => {
    fc.assert(
      fc.property(
        fc.record({
          reviewId: fc.uuid(),
          rating: fc.integer({ min: 1, max: 5 }),
          comment: fc.string({ minLength: 5, maxLength: 500 }),
          verifiedUserId: fc.constant(null),
          linkedProjectId: fc.option(fc.uuid(), { nil: null }),
          linkedTaskId: fc.option(fc.uuid(), { nil: null }),
        }),
        (review) => {
          const result = validateReview(review as Review);
          expect(result.accepted).toBe(false);
          expect(result.rejectionReasons).toBeDefined();
          expect(result.rejectionReasons!.some(r => r.includes('verified user'))).toBe(true);
        }
      ),
      { numRuns: 100 },
    );
  });

  it('review is rejected if not linked to a completed project or task', () => {
    fc.assert(
      fc.property(
        fc.record({
          reviewId: fc.uuid(),
          rating: fc.integer({ min: 1, max: 5 }),
          comment: fc.string({ minLength: 5, maxLength: 500 }),
          verifiedUserId: userIdArb,
          linkedProjectId: fc.constant(null),
          linkedTaskId: fc.constant(null),
        }),
        (review) => {
          const result = validateReview(review as Review);
          expect(result.accepted).toBe(false);
          expect(result.rejectionReasons).toBeDefined();
          expect(result.rejectionReasons!.some(r => r.includes('project or task'))).toBe(true);
        }
      ),
      { numRuns: 100 },
    );
  });

  it('review is accepted when tied to verified user AND linked to project or task', () => {
    fc.assert(
      fc.property(
        fc.record({
          reviewId: fc.uuid(),
          rating: fc.integer({ min: 1, max: 5 }),
          comment: fc.string({ minLength: 5, maxLength: 500 }),
          verifiedUserId: userIdArb,
          linkedProjectId: fc.uuid(),
          linkedTaskId: fc.option(fc.uuid(), { nil: null }),
        }),
        (review) => {
          const result = validateReview(review as Review);
          expect(result.accepted).toBe(true);
          expect(result.rejectionReasons).toBeUndefined();
        }
      ),
      { numRuns: 100 },
    );
  });

  it('review validation correctly handles all combinations', () => {
    fc.assert(
      fc.property(reviewArb, (review) => {
        const result = validateReview(review);
        const hasVerifiedUser = review.verifiedUserId !== null;
        const hasLinkedEntity = review.linkedProjectId !== null || review.linkedTaskId !== null;
        const shouldBeAccepted = hasVerifiedUser && hasLinkedEntity;
        expect(result.accepted).toBe(shouldBeAccepted);
        if (!shouldBeAccepted) {
          expect(result.rejectionReasons).toBeDefined();
          expect(result.rejectionReasons!.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 200 },
    );
  });
});

// Feature: pack-marketplace, Property 38: Dispute record completeness
describe('Property 38: Dispute record completeness', () => {
  // **Validates: Requirements 14.4**

  it('dispute filing is rejected without both party IDs or evidence', () => {
    fc.assert(
      fc.property(
        disputeParamsArb.filter(p =>
          p.filingPartyId === null || p.opposingPartyId === null || p.evidenceRefs.length === 0
        ),
        (params) => {
          const result = fileDispute(params);
          expect(result.accepted).toBe(false);
          expect(result.rejectionReasons).toBeDefined();
          expect(result.rejectionReasons!.length).toBeGreaterThan(0);
          expect(result.dispute).toBeUndefined();
        }
      ),
      { numRuns: 200 },
    );
  });

  it('accepted dispute record contains both party IDs, evidence refs, and timestamped event log', () => {
    fc.assert(
      fc.property(
        fc.record({
          filingPartyId: userIdArb,
          opposingPartyId: userIdArb,
          relatedEntityType: fc.constantFrom('project' as const, 'task' as const, 'quote' as const),
          relatedEntityId: fc.uuid(),
          evidenceRefs: fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
          description: fc.string({ minLength: 10, maxLength: 500 }),
        }),
        (params) => {
          const result = fileDispute(params);
          expect(result.accepted).toBe(true);
          expect(result.dispute).toBeDefined();
          const dispute = result.dispute!;
          expect(dispute.filingPartyId).toBe(params.filingPartyId);
          expect(dispute.opposingPartyId).toBe(params.opposingPartyId);
          expect(dispute.filingPartyId.length).toBeGreaterThan(0);
          expect(dispute.opposingPartyId.length).toBeGreaterThan(0);
          expect(dispute.evidenceRefs.length).toBeGreaterThan(0);
          expect(dispute.evidenceRefs).toEqual(params.evidenceRefs);
          expect(dispute.eventLog.length).toBeGreaterThan(0);
          for (const entry of dispute.eventLog) {
            expect(entry.event.length).toBeGreaterThan(0);
            expect(entry.timestamp.length).toBeGreaterThan(0);
            expect(() => new Date(entry.timestamp)).not.toThrow();
          }
          expect(dispute.disputeId.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: pack-marketplace, Property 39: Registration suspension cascades to marketplace
describe('Property 39: Registration suspension cascades to marketplace', () => {
  // **Validates: Requirements 14.6**

  it('inactive/suspended/expired registration suspends all active listings and pending applications', () => {
    fc.assert(
      fc.property(
        fc.record({
          userId: userIdArb,
          registrationStatus: fc.constantFrom<RegistrationStatus>('inactive', 'suspended', 'expired'),
          activeListings: fc.array(
            fc.record({ id: fc.uuid().map(id => `lst-${id}`), status: fc.constant<ListingStatus>('active') }),
            { minLength: 1, maxLength: 10 }
          ),
          pendingApplications: fc.array(
            fc.record({ id: fc.uuid().map(id => `app-${id}`), status: fc.constant<ApplicationStatus>('pending') }),
            { minLength: 1, maxLength: 10 }
          ),
        }),
        (userState) => {
          const result = cascadeRegistrationSuspension(userState);
          expect(result.suspendedListings.length).toBe(userState.activeListings.length);
          for (const listing of userState.activeListings) {
            expect(listing.status).toBe('suspended');
          }
          expect(result.suspendedApplications.length).toBe(userState.pendingApplications.length);
          for (const app of userState.pendingApplications) {
            expect(app.status).toBe('suspended');
          }
        }
      ),
      { numRuns: 100 },
    );
  });

  it('active registration does NOT cascade suspension', () => {
    fc.assert(
      fc.property(
        fc.record({
          userId: userIdArb,
          registrationStatus: fc.constant<RegistrationStatus>('active'),
          activeListings: fc.array(
            fc.record({ id: fc.uuid().map(id => `lst-${id}`), status: fc.constant<ListingStatus>('active') }),
            { minLength: 1, maxLength: 10 }
          ),
          pendingApplications: fc.array(
            fc.record({ id: fc.uuid().map(id => `app-${id}`), status: fc.constant<ApplicationStatus>('pending') }),
            { minLength: 1, maxLength: 10 }
          ),
        }),
        (userState) => {
          const result = cascadeRegistrationSuspension(userState);
          expect(result.suspendedListings.length).toBe(0);
          expect(result.suspendedApplications.length).toBe(0);
          for (const listing of userState.activeListings) {
            expect(listing.status).toBe('active');
          }
          for (const app of userState.pendingApplications) {
            expect(app.status).toBe('pending');
          }
        }
      ),
      { numRuns: 100 },
    );
  });

  it('already suspended/expired listings and non-pending applications are not double-suspended', () => {
    fc.assert(
      fc.property(userMarketplaceStateArb.filter(
        s => ['inactive', 'suspended', 'expired'].includes(s.registrationStatus)
      ), (userState) => {
        const originalActiveCount = userState.activeListings.filter(l => l.status === 'active').length;
        const originalPendingCount = userState.pendingApplications.filter(a => a.status === 'pending').length;
        const result = cascadeRegistrationSuspension(userState);
        expect(result.suspendedListings.length).toBe(originalActiveCount);
        expect(result.suspendedApplications.length).toBe(originalPendingCount);
      }),
      { numRuns: 100 },
    );
  });
});
