# Implementation Plan: Remote Desktop Marketplace

## Overview

This plan implements the Remote Desktop Marketplace as a bounded feature module at `src/features/remote-desktop-marketplace/`. The implementation follows an incremental approach: types and constants first, then services (backend logic), then API routes, then frontend components and hooks, and finally integration wiring + testing. Each task builds on previous work so there is no orphaned code.

## Tasks

- [x] 1. Set up feature module structure and core types
  - [x] 1.1 Create feature directory structure and type definitions
    - Create `src/features/remote-desktop-marketplace/` with subdirectories: `components/`, `components/shared/`, `services/`, `hooks/`, `__tests__/properties/`, `__tests__/unit/`, `__tests__/integration/`
    - Create `types.ts` with all TypeScript interfaces: `ResourceListing`, `BookingRecord`, `ReviewRecord`, `OwnerProfile`, `FavouriteEntry`, `WeeklySchedule`, `TimeSlot`, `BlockedDate`, `CatalogueQuery`, `CatalogueResult`, `CreateBookingRequest`, `CreateReviewRequest`, `MarketplaceApiError`, `RetryQueueItem`, and all union types (`MarketplaceBookingStatus`, `CatalogueSortOption`, `PriceRangeBracket`, `MarketplaceErrorCode`, `ReviewTag`)
    - Create `constants.ts` with software categories list, price range brackets, SA cities/regions, review tags, and booking status groupings
    - Create `index.ts` barrel export
    - _Requirements: 1.1, 1.5, 2.1, 2.2_

  - [ ]* 1.2 Write property test for role-based marketplace visibility
    - **Property 1: Role-based marketplace visibility**
    - **Validates: Requirements 1.3, 1.4**

- [x] 2. Implement catalogue and availability services
  - [x] 2.1 Implement catalogueService
    - Create `services/catalogueService.ts` with functions: `queryListings(query: CatalogueQuery)`, `getListingById(listingId: string)`, `searchListings(search: string, filters)`, pagination logic (page/pageSize with max 50), multi-filter AND composition, sort comparators for all 5 sort options
    - Firestore queries against `remoteDesktopMarketplace/listings` collection
    - Catalogue inclusion criteria: status=active, name non-empty, ≥1 softwareCategory, hourlyRate set, ≥1 slot in next 7 days
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 8.1, 12.6_

  - [ ] 2.2 Write property tests for catalogue filtering, search, and sort
    - **Property 2: Catalogue filter correctness**
    - **Property 3: Search result relevance**
    - **Property 4: Catalogue sort ordering**
    - **Property 5: Resource card completeness**
    - **Property 21: Catalogue inclusion criteria**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 8.1**

  - [x] 2.3 Implement availabilityService
    - Create `services/availabilityService.ts` with functions: `getAvailabilitySlots(listingId, referenceDate)` generating 14 days × 16 slots (06:00–22:00 SAST), `computeSlotStatus(weeklySchedule, blockedDates, existingBookings)`, `validateSlotSelection(slots)` enforcing contiguity and max 16 slots
    - Read from `remoteDesktopMarketplace/listings/{id}/availability` and `blockedDates` subcollections
    - _Requirements: 4.1, 4.2, 4.3, 4.6, 4.8_

  - [ ] 2.4 Write property tests for availability
    - **Property 6: Availability calendar slot generation**
    - **Property 7: Schedule minus blocked dates**
    - **Property 8: Slot selection validation**
    - **Property 9: Booking cost calculation**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.5, 4.6**

- [x] 3. Implement booking and review services
  - [x] 3.1 Implement bookingService
    - Create `services/bookingService.ts` with functions: `createBooking(request: CreateBookingRequest, consumerId)`, `confirmBooking(bookingId, ownerId)`, `declineBooking(bookingId, ownerId, reason?)`, `cancelBooking(bookingId, consumerId)`, `getConsumerBookings(consumerId)`, `getIncomingBookings(ownerId)`, `expireStaleBookings()`
    - Compose with existing `resourceBookingService.findResourceBookingConflicts` for conflict detection
    - Implement 24-hour expiry logic (pending → expired)
    - Re-validate conflicts at confirmation time (conflict_expired)
    - Calculate estimated cost: hourlyRate × durationHours
    - Group bookings by status sections (Upcoming, Pending, Active, Completed, Cancelled/Declined/Expired) with appropriate sort within each
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 9.1_

  - [ ] 3.2 Write property tests for booking lifecycle
    - **Property 10: Booking request validation**
    - **Property 11: Booking 24-hour expiry**
    - **Property 12: Conflict detection at confirmation time**
    - **Property 23: Booking grouping and sort**
    - **Property 24: Launch session and countdown visibility**
    - **Property 25: Cancellation policy**
    - **Validates: Requirements 5.2, 5.7, 5.9, 9.1, 9.2, 9.3, 9.4**

  - [x] 3.3 Implement reviewService
    - Create `services/reviewService.ts` with functions: `submitReview(request: CreateReviewRequest, consumerId)`, `getListingReviews(listingId, page, pageSize)`, `getOwnerReviews(ownerId, page, pageSize)`, `submitOwnerReply(reviewId, ownerId, replyText)`, `recalculateAggregateRating(listingId)`
    - Enforce: rating 1–5 integer, comment 10–500 chars when provided, max 3 tags from predefined set
    - Enforce: one review per booking, booking must be completed, no edits/deletes
    - Time window: ≤7 days normal, 8–90 days late review flag, >90 days rejected
    - Owner reply: single reply per review, max 500 chars, immutable
    - Recalculate aggregate rating (arithmetic mean, 1 decimal)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9_

  - [ ] 3.4 Write property tests for review system
    - **Property 13: Aggregate rating calculation**
    - **Property 15: Review display ordering**
    - **Property 17: Review submission validation**
    - **Property 18: Review time window**
    - **Property 19: Review and reply immutability**
    - **Validates: Requirements 3.4, 7.2, 7.3, 7.4, 7.5, 7.7, 7.8, 7.9**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement owner, favourites, and supporting services
  - [x] 5.1 Implement ownerProfileService
    - Create `services/ownerProfileService.ts` with functions: `getOwnerProfile(ownerUid)`, `calculateTrustIndicators(ownerUid)`, `getOwnerListings(ownerUid)`
    - 90-day rolling window for trust metrics calculation
    - New owner threshold: <5 completed sessions → isNewOwner=true, metrics null
    - Acceptance rate = confirmed/total × 100, completion rate = completed/confirmed × 100
    - Privacy enforcement: never expose email, phone, address
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [ ] 5.2 Write property tests for owner profile
    - **Property 14: Trust indicator calculation**
    - **Property 16: Owner profile privacy**
    - **Validates: Requirements 6.2, 6.3, 6.6**

  - [x] 5.3 Implement favouritesService
    - Create `services/favouritesService.ts` with functions: `addFavourite(userId, listingId)`, `removeFavourite(userId, listingId)`, `getFavourites(userId)`, `isFavourited(userId, listingId)`
    - Enforce max 50 favourites per user
    - Sort by addedAt descending
    - Handle removed/paused listings with "No Longer Available" indicator
    - Denormalized snapshot: listingName, softwareCategory, hourlyRate, averageRating, listingStatus
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [ ] 5.4 Write property tests for favourites
    - **Property 27: Favourites sort and limit**
    - **Property 28: Unavailable favourite indicator**
    - **Validates: Requirements 10.2, 10.4, 10.5**

  - [x] 5.5 Implement listingManagementService
    - Create `services/listingManagementService.ts` with functions: `publishListing(ownerId, data)`, `updateListing(ownerId, listingId, data)`, `pauseListing(ownerId, listingId)`, `activateListing(ownerId, listingId)`, `getListingAnalytics(listingId)`
    - Validation: name 1–100 chars, 1–5 softwareCategories from managed list, hourlyRate R50–R5000, minBookingHours 1–8, maxBookingHours 1–24, min ≤ max
    - Pause preserves existing confirmed bookings
    - Analytics: views, bookings, conversion rate, avg rating, monthly revenue
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

  - [ ] 5.6 Write property tests for listing management
    - **Property 20: Listing validation**
    - **Property 22: Pause preserves bookings**
    - **Validates: Requirements 8.2, 8.3, 8.6, 8.8**

  - [x] 5.7 Implement integrationService and analyticsService
    - Create `services/integrationService.ts` with functions: `emitWorkflowEvent(type, payload)`, `writeProjectRecord(bookingId, projectId)`, `logAuditEntry(event)`, `sendNotification(userId, notification)`, `enqueueRetry(item: RetryQueueItem)`, `processRetryQueue()`
    - Retry logic: 3 attempts at 30s intervals, permanent failure → critical audit + admin WorkflowEvent
    - Create `services/analyticsService.ts` with functions: `getMarketplaceUtilisation()`, `getAverageBookingLeadTime()`, `getConsumerSatisfaction()`, `getTopPerformingResources()`, `getListingAnalytics(listingId)`
    - KPI calculations per design property 30
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_

  - [ ] 5.8 Write property tests for audit and analytics
    - **Property 29: Audit trail completeness**
    - **Property 30: Marketplace KPI calculations**
    - **Validates: Requirements 11.3, 11.5**

- [x] 6. Checkpoint - Ensure all service tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement API routes
  - [x] 7.1 Create marketplace API router with catalogue and availability endpoints
    - Create `src/features/remote-desktop-marketplace/remote-desktop-marketplace-api-router.ts`
    - Implement: `GET /listings` (paginated, filtered, sorted), `GET /listings/:listingId`, `GET /listings/:listingId/availability`, `GET /listings/:listingId/reviews`, `GET /search`
    - Zod request validation schemas for query params and path params
    - Error responses using `MarketplaceApiError` schema
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.3, 4.1, 12.1, 12.3_

  - [x] 7.2 Implement booking API endpoints
    - Add to marketplace router: `POST /bookings`, `GET /bookings`, `GET /bookings/incoming`, `PATCH /bookings/:bookingId/confirm`, `PATCH /bookings/:bookingId/decline`, `PATCH /bookings/:bookingId/cancel`, `POST /bookings/:bookingId/review`
    - Auth middleware: verify consumer/owner identity
    - Conflict detection at submission and confirmation
    - Trigger integration service for notifications and WorkflowEvents
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6, 5.8, 5.9, 7.1, 7.2, 9.1_

  - [x] 7.3 Implement favourites, owner, and listing management API endpoints
    - Add to marketplace router: `GET /favourites`, `POST /favourites/:listingId`, `DELETE /favourites/:listingId`, `GET /owner/:ownerUid`, `GET /owner/me/listings`, `POST /owner/me/listings`, `PATCH /owner/me/listings/:listingId`, `PATCH /owner/me/listings/:listingId/pause`, `PATCH /owner/me/listings/:listingId/activate`, `GET /owner/me/listings/:listingId/analytics`
    - Auth middleware for owner endpoints (verify ownership)
    - _Requirements: 6.1, 8.1, 8.2, 8.6, 8.7, 10.1, 10.2, 10.3, 10.5_

  - [x] 7.4 Mount marketplace router in main API router
    - Import and mount the marketplace router at `/api/remote-desktop-marketplace` in `src/lib/api-router.ts`
    - Apply rate limiting and auth middleware
    - _Requirements: 1.1, 12.1_

  - [ ] 7.5 Write unit tests for API route handlers
    - Test request validation (Zod schemas), error responses, auth guards
    - Test conflict detection flow through booking endpoints
    - Test pagination parameter handling
    - _Requirements: 2.1, 5.2, 12.1_

- [x] 8. Implement frontend hooks
  - [x] 8.1 Implement useCatalogue, useAvailability, and useBookings hooks
    - Create `hooks/useCatalogue.ts` — session-level cache with TTL (5-minute refresh), filter/sort state, debounced search (300ms), pagination state
    - Create `hooks/useAvailability.ts` — 14-day slot data, polling for updates, slot selection state, cost calculation
    - Create `hooks/useBookings.ts` — consumer booking list, grouped by status section, sorted within section
    - _Requirements: 2.1, 4.1, 9.1, 12.4, 12.5_

  - [x] 8.2 Implement useFavourites and useOwnerProfile hooks
    - Create `hooks/useFavourites.ts` — favourite list, add/remove, optimistic updates, limit enforcement
    - Create `hooks/useOwnerProfile.ts` — owner profile data, trust indicators, listings
    - _Requirements: 6.1, 10.1, 10.2_

- [x] 9. Implement shared UI components
  - [x] 9.1 Implement FilterBar, SortSelector, and shared display components
    - Create `components/shared/FilterBar.tsx` — multi-select filters for Software_Category, Price_Range, Location_Tag, Rating minimum, Availability; active filter chips with dismiss action; clear all filters
    - Create `components/shared/SortSelector.tsx` — dropdown for 5 sort options with default "availability_asc"
    - Create `components/shared/RatingStars.tsx` — star display (1–5, 1 decimal) and star input (whole stars)
    - Create `components/shared/TrustBadges.tsx` — verified identity badge, metrics display, new owner badge
    - Create `components/shared/SessionReadinessIndicator.tsx` — ready/stale/unreachable based on heartbeat timing
    - Create `components/shared/EmptyState.tsx` — reusable empty state with message and action
    - _Requirements: 2.2, 2.4, 2.5, 2.7, 6.2_

- [ ] 10. Implement core page components
  - [x] 10.1 Implement RemoteDesktopMarketplace shell and CatalogueBrowser
    - Create `components/RemoteDesktopMarketplace.tsx` — SpecForge workspace layout: Header Card ("Remote Desktop Marketplace", role badge, filter summary), Tab Navigation (Browse, My Bookings, Favourites), Active Tab Content
    - Create `components/CatalogueBrowser.tsx` — paginated grid (max 20 cards/page), FilterBar, SortSelector, result count ("Showing X of Y"), skeleton loading, 10s timeout with retry, empty state
    - Create `components/ResourceCard.tsx` — resource name (truncated 60 chars), Software_Category icon, hourly rate ZAR, avg rating (1dp), Location_Tag, session-readiness indicator, heart icon for favourites
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7, 1.8, 1.9, 2.1, 2.5, 2.6, 2.7, 2.8_

  - [x] 10.2 Implement ResourceDetailView and AvailabilityCalendar
    - Create `components/ResourceDetailView.tsx` — full listing detail: name, description, software apps with versions, hardware specs, hourly rate (2dp ZAR), min/max booking hours, Location_Tag, session-readiness, recording policy, aggregate rating, 5 most recent reviews, owner profile link, "Book This Resource" CTA, "Save to Favourites" action, warning banner for unreachable, 404 handling
    - Create `components/AvailabilityCalendar.tsx` — 14-day rolling window, 1-hour slots 06:00–22:00 SAST, 3 visual states (available/unavailable/pending), selected state distinct from others, slot selection (contiguous, max 16), duration + cost display, prev/next navigation + date picker, conflict notification + refresh, no-availability message
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 4.1, 4.2, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_

  - [x] 10.3 Implement BookingRequestForm
    - Create `components/BookingRequestForm.tsx` — collects: selected time slot, intended software (from listing apps), optional project reference, optional message (500 chars max); validates against conflicts, duration min/max, consumer verification; preserves form data on rejection; displays confirmation with resource name, time, cost, "Awaiting Owner Approval" status, estimated response time
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 10.4 Implement MyBookingsView and BookingEntry
    - Create `components/MyBookingsView.tsx` — grouped sections (Upcoming, Pending, Active, Completed, Cancelled/Declined/Expired), filtering by status and date range (12 months), sorting by date
    - Create `components/BookingEntry.tsx` — resource name, owner firm, date/time, duration, cost, status badge, "Launch Session" action (visible within 15min window), "Session Starting Soon" countdown, cancel action (with 2hr late-cancellation warning), "Leave Review" action (completed, within 30 days, not yet reviewed)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [ ] 10.5 Write property test for review eligibility in My Bookings
    - **Property 26: Leave review eligibility**
    - **Validates: Requirements 9.5**

- [x] 11. Implement owner and review components
  - [x] 11.1 Implement OwnerProfileView and ReviewList
    - Create `components/OwnerProfileView.tsx` — firm name, profile image, description, tenure, total sessions, up to 50 active listings, trust indicators (verified badge, avg response time, acceptance rate, completion rate, aggregate rating), "New Owner" badge if <5 sessions, 10 most recent reviews, "View Resources" action (pre-filtered catalogue), privacy enforcement (no email/phone/address), 404 handling without leaking account status
    - Create `components/ReviewList.tsx` — paginated (10/page), chronological newest-first, reviewer display name + verified badge, rating, date, comment (truncated 500 chars expandable), owner reply display
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 7.8_

  - [x] 11.2 Implement ReviewForm and OwnerListingManager
    - Create `components/ReviewForm.tsx` — rating 1–5 star input, optional comment (10–500 chars), optional tags (max 3 from predefined list), duplicate submission rejection, ineligible booking rejection, confirmation message on success
    - Create `components/OwnerListingManager.tsx` — listing CRUD: publish with validation, edit, pause/activate, analytics display (views, bookings, conversion, avg rating, monthly revenue), validation error display for missing/invalid fields, draft retention on rejection
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

  - [x] 11.3 Implement FavouritesView
    - Create `components/FavouritesView.tsx` — list sorted most-recently-added first, showing: resource name, Software_Category, hourly rate, avg rating, session-readiness, remove action, "No Longer Available" indicator for removed listings, disabled booking action for unavailable, empty state with browse guidance, limit-reached inline message
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6, 10.7_

- [x] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Integration wiring and registration
  - [x] 13.1 Wire marketplace into app routing and navigation
    - Register `/remote-desktop/marketplace` route in `App.tsx` with lazy loading via `lazyWithChunkRetry`
    - Add "Marketplace" tab with `store` lucide icon to Remote Desktop module navigation in `architexNavigationConfig.ts`
    - Role-gate: visible only to freelancer, contractor, subcontractor, bep, architect, firm_admin, platform_admin
    - Redirect unauthorised roles to `/remote-desktop` within 1 second
    - Add route for `/remote-desktop/marketplace/:listingId` (detail view) and `/remote-desktop/marketplace/owner/:ownerUid` (owner profile)
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 13.2 Wire platform spine integration
    - Connect integrationService to existing WorkflowEvents system
    - Connect to ProjectRecord/Project Passport for booking confirmations with projectId
    - Connect to notification system for booking status changes
    - Connect to audit trail for all marketplace events
    - Connect analyticsService to Analytics & Reporting Engine (15-min refresh)
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_

  - [ ] 13.3 Write integration tests for platform spine
    - Test WorkflowEvent delivery on booking submission and confirmation
    - Test ProjectRecord creation for confirmed bookings with projectId
    - Test notification delivery within 10s of confirmation
    - Test audit trail entries for all 11 event types
    - Test retry queue: 3 failures → critical audit + admin notification
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.6, 11.7_

- [ ] 14. Performance optimization and final wiring
  - [x] 14.1 Implement client-side caching and performance optimizations
    - Implement session-level catalogue cache in `useCatalogue` hook with 5-minute TTL
    - Implement 300ms search debounce
    - Implement skeleton loading states for catalogue, detail, and calendar views
    - Implement 10-second timeout with retry for initial catalogue load
    - Ensure pagination batches of 20 items
    - Verify 3s initial load and 2s filter response targets
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [ ] 14.2 Write integration tests for booking lifecycle
    - Test full booking lifecycle: submit → confirm → complete → review
    - Test concurrent booking conflict: two consumers, same slot
    - Test calendar real-time update within 60s of booking confirmation
    - Test booking expiry after 24 hours without owner action
    - _Requirements: 5.3, 5.5, 5.7, 5.9, 4.4_

- [x] 15. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate the 30 universal correctness properties defined in the design document using fast-check
- Unit tests validate specific integration points, edge cases, and platform wiring
- The feature module is fully isolated in `src/features/remote-desktop-marketplace/` following bounded module pattern
- Existing `resourceBookingService` is composed (not duplicated) for conflict detection and governance
- All Firestore data lives under `remoteDesktopMarketplace/` collection prefix

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "2.3"] },
    { "id": 2, "tasks": ["2.2", "2.4", "3.1", "3.3"] },
    { "id": 3, "tasks": ["3.2", "3.4", "5.1", "5.3", "5.5", "5.7"] },
    { "id": 4, "tasks": ["5.2", "5.4", "5.6", "5.8"] },
    { "id": 5, "tasks": ["7.1", "7.2", "7.3", "8.1", "8.2"] },
    { "id": 6, "tasks": ["7.4", "7.5", "9.1"] },
    { "id": 7, "tasks": ["10.1", "10.2", "10.3", "10.4", "10.5"] },
    { "id": 8, "tasks": ["11.1", "11.2", "11.3"] },
    { "id": 9, "tasks": ["13.1", "13.2", "14.1"] },
    { "id": 10, "tasks": ["13.3", "14.2"] }
  ]
}
```
