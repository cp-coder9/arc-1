// ─── Remote Desktop Marketplace — Type Definitions ───────────────────────────

// ─── Union / Literal Types ────────────────────────────────────────────────────

export type MarketplaceBookingStatus =
  | 'pending_owner_confirmation'
  | 'confirmed'
  | 'declined'
  | 'cancelled_by_consumer'
  | 'expired'
  | 'conflict_expired'
  | 'active'
  | 'completed';

export type CatalogueSortOption =
  | 'availability_asc'
  | 'price_asc'
  | 'price_desc'
  | 'rating_desc'
  | 'newest_desc';

export type PriceRangeBracket = '0-100' | '100-250' | '250-500' | '500+';

export type ReviewTag =
  | 'fast_connection'
  | 'great_software_setup'
  | 'responsive_owner'
  | 'ran_into_issues';

export type MarketplaceErrorCode =
  | 'LISTING_NOT_FOUND'
  | 'LISTING_INACTIVE'
  | 'BOOKING_CONFLICT'
  | 'BOOKING_DURATION_INVALID'
  | 'BOOKING_CONSUMER_UNVERIFIED'
  | 'BOOKING_EXPIRED'
  | 'BOOKING_ALREADY_CONFIRMED'
  | 'REVIEW_DUPLICATE'
  | 'REVIEW_INELIGIBLE'
  | 'REVIEW_WINDOW_CLOSED'
  | 'FAVOURITE_LIMIT_REACHED'
  | 'LISTING_VALIDATION_FAILED'
  | 'OWNER_NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'INTERNAL_ERROR'
  | 'SPINE_WRITE_FAILED';

export type SlotStatus = 'available' | 'unavailable' | 'pending' | 'selected';

export type MarketplaceAuditEventType =
  | 'booking_requested'
  | 'booking_confirmed'
  | 'booking_declined'
  | 'booking_cancelled'
  | 'booking_expired'
  | 'review_submitted'
  | 'review_replied'
  | 'listing_published'
  | 'listing_paused'
  | 'listing_activated'
  | 'favourite_added';


// ─── Supporting Interfaces ────────────────────────────────────────────────────

export interface SoftwareApp {
  name: string;
  version: string;
}

export interface HardwareSpecs {
  cpu: string;
  ramGb: number;
  gpu: string;
  storageGb: number;
}

// ─── Resource Listing ─────────────────────────────────────────────────────────

export interface ResourceListing {
  id: string;
  ownerId: string;
  ownerFirmName: string;
  resourceId: string;
  name: string;
  description: string;
  softwareCategories: string[];
  softwareApplications: SoftwareApp[];
  hardwareSpecs: HardwareSpecs;
  locationTag: string;
  hourlyRateZar: number;
  minBookingHours: number;
  maxBookingHours: number;
  billingPolicy: 'per_hour' | 'per_session';
  sessionRecordingEnabled: boolean;
  lastHeartbeatAt: string | null;
  status: 'draft' | 'active' | 'paused' | 'removed';
  averageRating: number | null;
  totalReviews: number;
  totalCompletedSessions: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

/** Summary type for catalogue cards */
export interface ResourceListingSummary {
  id: string;
  name: string;
  primaryCategory: string;
  hourlyRateZar: number;
  averageRating: number | null;
  totalReviews: number;
  locationTag: string;
  lastHeartbeatAt: string | null;
  ownerId: string;
  ownerFirmName: string;
  status: 'active';
}

// ─── Availability ─────────────────────────────────────────────────────────────

export interface WeeklySchedule {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  slots: TimeSlot[];
}

export interface TimeSlot {
  startHour: number;
  endHour: number;
}

export interface BlockedDate {
  id: string;
  date: string;
  startHour?: number;
  endHour?: number;
  reason?: string;
}

export interface CalendarSlot {
  date: string;
  startHour: number;
  endHour: number;
  status: SlotStatus;
}

// ─── Catalogue ────────────────────────────────────────────────────────────────

export interface CatalogueQuery {
  page: number;
  pageSize: number;
  categories?: string[];
  priceRange?: PriceRangeBracket;
  locations?: string[];
  minRating?: number;
  availability?: 'today' | 'this_week' | 'any';
  search?: string;
  sort?: CatalogueSortOption;
}

export interface CatalogueResult {
  listings: ResourceListingSummary[];
  total: number;
  page: number;
  pageSize: number;
  appliedFilters: CatalogueQuery;
}

// ─── Booking ──────────────────────────────────────────────────────────────────

export interface CreateBookingRequest {
  listingId: string;
  startsAt: string;
  endsAt: string;
  intendedSoftware: string;
  projectReference?: string;
  messageToOwner?: string;
}

export interface BookingRecord {
  id: string;
  listingId: string;
  resourceId: string;
  consumerId: string;
  ownerId: string;
  startsAt: string;
  endsAt: string;
  durationHours: number;
  intendedSoftware: string;
  projectReference?: string;
  messageToOwner?: string;
  status: MarketplaceBookingStatus;
  estimatedCostZar: number;
  ownerDeclineReason?: string;
  createdAt: string;
  confirmedAt?: string;
  cancelledAt?: string;
  completedAt?: string;
  expiresAt: string;
}

// ─── Review ───────────────────────────────────────────────────────────────────

export interface CreateReviewRequest {
  bookingId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment?: string;
  tags?: ReviewTag[];
}

export interface ReviewRecord {
  id: string;
  bookingId: string;
  listingId: string;
  ownerId: string;
  consumerId: string;
  consumerDisplayName: string;
  rating: number;
  comment?: string;
  tags: ReviewTag[];
  ownerReply?: string;
  ownerRepliedAt?: string;
  isLateReview: boolean;
  isVerified: boolean;
  createdAt: string;
}

// ─── Owner Profile ────────────────────────────────────────────────────────────

export interface OwnerProfile {
  ownerUid: string;
  firmName: string;
  profileImageUrl: string | null;
  description: string;
  memberSince: string;
  isIdentityVerified: boolean;
  avgResponseTimeHours: number | null;
  bookingAcceptanceRate: number | null;
  sessionCompletionRate: number | null;
  aggregateRating: number | null;
  totalCompletedSessions: number;
  isNewOwner: boolean;
  updatedAt: string;
}

// ─── Favourites ───────────────────────────────────────────────────────────────

export interface FavouriteEntry {
  listingId: string;
  addedAt: string;
  listingName: string;
  softwareCategory: string;
  hourlyRateZar: number;
  averageRating: number | null;
  listingStatus: 'active' | 'paused' | 'removed';
}

// ─── Error ────────────────────────────────────────────────────────────────────

export interface MarketplaceApiError {
  code: MarketplaceErrorCode;
  message: string;
  field?: string;
  details?: Record<string, unknown>;
}

// ─── Retry Queue ──────────────────────────────────────────────────────────────

export interface RetryQueueItem {
  id: string;
  type: 'workflow_event' | 'project_record' | 'audit_entry';
  payload: Record<string, unknown>;
  attempts: number;
  nextRetryAt: string;
  status: 'pending' | 'completed' | 'permanently_failed';
  lastError?: string;
  createdAt: string;
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export interface MarketplaceAuditEntry {
  eventType: MarketplaceAuditEventType;
  actorUserId: string;
  targetEntityId: string;
  entityType: string;
  timestamp: string;
  tenantId: string;
}
