// Remote Desktop Marketplace — Public Barrel Export

// Types
export type {
  MarketplaceBookingStatus,
  CatalogueSortOption,
  PriceRangeBracket,
  ReviewTag,
  MarketplaceErrorCode,
  SlotStatus,
  MarketplaceAuditEventType,
  SoftwareApp,
  HardwareSpecs,
  ResourceListing,
  ResourceListingSummary,
  WeeklySchedule,
  TimeSlot,
  BlockedDate,
  CalendarSlot,
  CatalogueQuery,
  CatalogueResult,
  CreateBookingRequest,
  BookingRecord,
  CreateReviewRequest,
  ReviewRecord,
  OwnerProfile,
  FavouriteEntry,
  MarketplaceApiError,
  RetryQueueItem,
  MarketplaceAuditEntry,
} from './types';

// Constants
export {
  SOFTWARE_CATEGORIES,
  PRICE_RANGE_BRACKETS,
  SA_LOCATIONS,
  REVIEW_TAGS,
  BOOKING_STATUS_GROUPS,
  MARKETPLACE_ALLOWED_ROLES,
  AVAILABILITY_HOURS,
  AVAILABILITY_DAYS,
  MAX_CONSECUTIVE_SLOTS,
  MAX_FAVOURITES,
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
} from './constants';

export type {
  SoftwareCategoryName,
  PriceRangeDef,
  ReviewTagDef,
  BookingStatusGroup,
  MarketplaceAllowedRole,
} from './constants';

// Services
export {
  isListingEligibleForCatalogue,
  filterListings,
  sortListings,
  paginateListings,
  searchListings,
  toListingSummary,
  queryListings,
  getListingById,
} from './services/catalogueService';

export {
  createBooking,
  confirmBooking,
  declineBooking,
  cancelBooking,
  getConsumerBookings,
  getIncomingBookings,
  expireStaleBookings,
  calculateEstimatedCost,
  isBookingInLaunchWindow,
  getCountdownSeconds,
} from './services/bookingService';

export type { GroupedBookings } from './services/bookingService';
