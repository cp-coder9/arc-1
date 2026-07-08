# Requirements Document

## Introduction

The Remote Desktop Marketplace is a consumer-facing discovery and booking layer that extends the existing Remote Desktop Secure Platform module in Architex OS. It enables resource consumers (freelancers, small practices, subcontractors) to browse, discover, filter, and book available remote desktop resources published by resource owners (firms with expensive software licenses such as Revit, ArchiCAD, SketchUp).

The Marketplace renders as a sub-route (`/remote-desktop/marketplace`) within the existing Remote Desktop module, following the SpecForge workspace layout pattern. It integrates with the existing resource listing, governance, and session infrastructure — adding a catalogue browsing experience, availability calendars, resource owner profiles, trust indicators, and a rating/review system for completed sessions.

## Glossary

- **Marketplace**: The consumer-facing discovery interface within the Remote Desktop module where Resource_Consumers browse, filter, and book published remote desktop resources.
- **Resource_Owner**: A platform user (BEP, architect, firm) who publishes a workstation or software seat for governed remote access via the Remote Desktop Secure Platform.
- **Resource_Consumer**: A platform user (freelancer, small practice, subcontractor) who browses the Marketplace to discover and book shared workstation resources.
- **Resource_Listing**: A published entry in the Marketplace catalogue describing a bookable remote desktop resource, including software, pricing, availability, and connection capabilities.
- **Catalogue**: The complete collection of active Resource_Listings available for browsing and filtering in the Marketplace.
- **Availability_Calendar**: A per-resource schedule showing bookable time slots, existing reservations, and blocked periods configured by the Resource_Owner.
- **Owner_Profile**: A public-facing profile page for a Resource_Owner displaying their published resources, trust indicators, response metrics, and aggregate ratings.
- **Trust_Indicator**: A set of verified badges and metrics displayed on an Owner_Profile (e.g., verified identity, response rate, session completion rate, platform tenure).
- **Review**: A structured feedback record submitted by a Resource_Consumer after a completed session, containing a numeric rating and optional text comment.
- **Rating**: A numeric score (1–5 stars) assigned by a Resource_Consumer to a completed session, aggregated per Resource_Listing and per Owner_Profile.
- **Booking_Request**: A formal request from a Resource_Consumer to reserve a specific time slot on a Resource_Listing, subject to existing governance approval by the Resource_Owner.
- **Software_Category**: A classification tag (e.g., "Revit", "ArchiCAD", "SketchUp", "AutoCAD") assigned to a Resource_Listing for filtering and discovery purposes.
- **Location_Tag**: A geographic indicator (city or region within South Africa) assigned to a Resource_Listing for proximity-based filtering.
- **Price_Range**: A filterable bracket (e.g., R0–R100/hr, R100–R250/hr, R250+/hr) applied to Resource_Listing hourly rates.

## Requirements

### Requirement 1: Marketplace Navigation and Shell Integration

**User Story:** As a resource consumer, I want to access the Marketplace from within the Remote Desktop module, so that I can discover available resources without leaving the platform context.

#### Acceptance Criteria

1. THE Marketplace SHALL render as a sub-route at `/remote-desktop/marketplace` within the existing Remote Desktop module, inheriting the Module_Shell header, breadcrumb trail (displaying "Remote Desktop > Marketplace"), and sidebar context.
2. THE Marketplace SHALL be accessible as a tab or navigation link within the Remote Desktop module workspace, labelled "Marketplace" with a `store` icon from the lucide-react library.
3. THE Marketplace tab or navigation link SHALL be visible only to users with roles: freelancer, contractor, subcontractor, bep, architect, firm_admin, and platform_admin, and SHALL be hidden from the navigation for all other roles.
4. IF a user without an authorised role navigates to `/remote-desktop/marketplace`, THEN THE Marketplace SHALL redirect the user to the Remote Desktop module root (`/remote-desktop`) within 1 second without displaying an error message.
5. THE Marketplace SHALL follow the SpecForge workspace layout pattern: Header Card (displaying "Remote Desktop Marketplace" title, user role badge, and active filter summary), Tab Navigation (Browse, My Bookings, Favourites), and Active Tab Content.
6. WHEN the Marketplace loads, THE Marketplace SHALL display the Browse tab as the default active view showing the first 20 catalogue resources sorted by availability start date in descending order (newest first).
7. IF the Browse tab contains no catalogue resources, THEN THE Marketplace SHALL display an empty-state message indicating that no resources are currently available, with no error styling applied.
8. WHILE the Marketplace is fetching catalogue data, THE Marketplace SHALL display a skeleton loading placeholder within the Active Tab Content area until data is resolved or a maximum of 10 seconds has elapsed.
9. IF catalogue data fails to load within 10 seconds, THEN THE Marketplace SHALL display a non-blocking error message indicating that resources could not be loaded, and SHALL provide a retry action.

### Requirement 2: Catalogue Browsing and Resource Discovery

**User Story:** As a resource consumer, I want to browse available remote desktop resources by software type, price, and availability, so that I can find the right workstation for my project needs.

#### Acceptance Criteria

1. THE Marketplace SHALL display the Catalogue as a paginated grid of Resource_Listing cards (maximum 20 cards per page), where each card shows: resource name (truncated at 60 characters with ellipsis), primary Software_Category icon, hourly rate (in ZAR), average Rating (1–5 stars with one decimal place), Location_Tag, and a session-readiness indicator (ready: last heartbeat within 60 seconds, stale: last heartbeat between 61 seconds and 5 minutes ago, or unreachable: no heartbeat for more than 5 minutes).
2. THE Marketplace SHALL support filtering the Catalogue by: Software_Category (multi-select from available categories), Price_Range (predefined brackets: R0–R100/hr, R100–R250/hr, R250–R500/hr, R500+/hr), Location_Tag (multi-select from SA cities/regions), average Rating (minimum threshold: 3+, 4+, 4.5+), and availability (available today, available this week, any).
3. THE Marketplace SHALL support a text search field that accepts a minimum of 2 characters before executing a search, matches against resource name, Software_Category labels, Resource_Owner firm name, and resource description using substring matching, and returns results within 2 seconds for catalogues of up to 500 listings.
4. THE Marketplace SHALL support sorting the Catalogue by: price (low to high, high to low), rating (highest first), availability (soonest available first based on next open time slot), and newest listed (by listing creation date), with the default sort order being availability (soonest available first).
5. WHEN no Resource_Listings match the applied filters, THE Marketplace SHALL display an empty state message suggesting the Resource_Consumer adjust their filter criteria, with a "Clear Filters" action.
6. THE Marketplace SHALL display a result count indicating the number of visible listings out of the total Catalogue size (e.g., "Showing 12 of 47 resources").
7. WHILE filters are active, THE Marketplace SHALL display active filter chips above the results grid, each with a dismiss action to remove that individual filter.
8. IF the text search query exceeds the 2-second response threshold or the catalogue data fails to load, THEN THE Marketplace SHALL display an error message indicating the search or load could not be completed and offer a retry action while preserving any previously entered search text and active filters.

### Requirement 3: Resource Detail View

**User Story:** As a resource consumer, I want to view detailed information about a resource before booking, so that I can confirm it meets my software, performance, and budget requirements.

#### Acceptance Criteria

1. WHEN a Resource_Consumer selects a Resource_Listing card from the Catalogue, THE Marketplace SHALL navigate to a detail view at `/remote-desktop/marketplace/{listingId}` displaying the resource information specified in criteria 2 through 5.
2. THE resource detail view SHALL display: resource name, full description (up to 2000 characters), list of available software applications with version numbers, hardware specifications (CPU, RAM, GPU, storage), hourly rate in ZAR formatted to two decimal places, minimum and maximum booking duration in hours, Location_Tag, session-readiness indicator, and Session_Recording policy (enabled or disabled).
3. THE resource detail view SHALL display the Availability_Calendar for the resource showing the next 14 days of bookable time slots in 1-hour increments, blocked periods, and existing reservations (shown as "unavailable" without revealing other consumer identities).
4. THE resource detail view SHALL display the aggregate Rating as an average score on a scale of 1 to 5 (to one decimal place) and total review count, and the 5 most recent Reviews each showing reviewer display name, rating (1 to 5), date, and comment text (up to 500 characters).
5. THE resource detail view SHALL display a link to the Owner_Profile with the Resource_Owner's firm name, profile image, and Trust_Indicators summary (verification badge status, total completed sessions count, and member-since date).
6. THE resource detail view SHALL provide a "Book This Resource" call-to-action button that initiates the Booking_Request flow.
7. THE resource detail view SHALL provide a "Save to Favourites" action that adds the listing to the Resource_Consumer's favourites list accessible from the Marketplace Favourites tab.
8. IF the resource session-readiness indicator shows "unreachable", THEN THE resource detail view SHALL display a warning banner indicating the resource may not be available for immediate sessions and provide a link to the owner's contact or messaging function.
9. IF the Resource_Consumer navigates to a `listingId` that does not exist or has been removed, THEN THE Marketplace SHALL display a message indicating the resource is no longer available and provide a link to return to the Catalogue.
10. IF the resource has zero Reviews, THEN THE resource detail view SHALL display a message indicating no reviews are available yet in place of the reviews section, and SHALL omit the aggregate Rating display.

### Requirement 4: Availability Calendar

**User Story:** As a resource consumer, I want to see when a resource is available before booking, so that I can select a time slot that fits my schedule.

#### Acceptance Criteria

1. THE Availability_Calendar SHALL display a 14-day rolling window starting from the current date, with time slots shown in 1-hour increments from 06:00 to 22:00 SAST.
2. THE Availability_Calendar SHALL visually distinguish between: available slots (bookable), unavailable slots (blocked by owner or already booked), and pending slots (Booking_Request submitted but not yet confirmed), using a distinct visual indicator (such as color or label) for each of the three states.
3. WHEN a Resource_Owner configures availability for a resource listing, THE Availability_Calendar SHALL reflect recurring weekly schedules (e.g., Monday–Friday 08:00–17:00) and one-off blocked dates.
4. WHEN a time slot's status changes (new booking confirmed, booking cancelled, or owner blocks a period), THE Availability_Calendar SHALL update the displayed state within 60 seconds.
5. WHEN a Resource_Consumer selects one or more contiguous available time slots (up to a maximum of 16 consecutive slots) on the Availability_Calendar, THE Marketplace SHALL visually indicate the selected slots as distinct from available, unavailable, and pending states, and display the total duration and estimated cost (hourly rate × hours selected) before the Booking_Request is submitted.
6. IF a Resource_Consumer attempts to select non-contiguous time slots or exceeds 16 consecutive slots, THEN THE Marketplace SHALL prevent the selection and display a message indicating the selection constraint violated.
7. IF a Resource_Consumer selects a time slot that becomes unavailable between page load and selection (concurrent booking), THEN THE Marketplace SHALL display a conflict notification and refresh the Availability_Calendar to show the updated state.
8. IF a resource listing has no availability configured by its Resource_Owner, THEN THE Availability_Calendar SHALL display all slots as unavailable and show a message indicating that no availability has been set for this resource.
9. THE Availability_Calendar SHALL support navigation between days using previous/next controls and a date picker for jumping to a specific date within the 14-day window, defaulting to the current date on initial load.

### Requirement 5: Booking Request Flow

**User Story:** As a resource consumer, I want to submit a booking request for a selected time slot, so that I can reserve the resource pending owner approval.

#### Acceptance Criteria

1. WHEN a Resource_Consumer submits a Booking_Request, THE Marketplace SHALL collect: selected time slot (start and end time as ISO 8601 datetime values), intended software usage (selected from the resource's available applications), optional project reference (linking to an existing Architex project), and optional message to the Resource_Owner (up to 500 characters).
2. IF the selected time slot conflicts with an existing active booking (as determined by the existing `findResourceBookingConflicts` function), OR the booking duration is shorter than the resource's configured minimum or longer than its configured maximum, OR the Resource_Consumer does not have a verified platform account, THEN THE Marketplace SHALL reject the submission, display an error message indicating which validation failed, and preserve the form data so the Resource_Consumer can correct the issue without re-entering all fields.
3. WHEN a Booking_Request passes all validations and is submitted, THE Marketplace SHALL create a booking record using the existing resourceBookingService with status "pending_owner_confirmation" and surface the request to the Resource_Owner's Action Centre as an actionable item requiring confirmation.
4. WHEN a Booking_Request is submitted successfully, THE Marketplace SHALL display a confirmation to the Resource_Consumer showing: resource name, time slot, estimated cost (calculated from the resource's billing policy and the booked duration), and status "Awaiting Owner Approval" with an estimated response time based on the owner's median response time across prior bookings, or a default of "within 24 hours" if the owner has fewer than 3 prior booking responses.
5. WHEN a Resource_Owner confirms a Booking_Request, THE Marketplace SHALL notify the Resource_Consumer via the platform notification system and update the booking status to "confirmed" in the Resource_Consumer's My Bookings view.
6. WHEN a Resource_Owner declines a Booking_Request, THE Marketplace SHALL notify the Resource_Consumer with the owner's optional decline reason and update the booking status to "declined" in the Resource_Consumer's My Bookings view.
7. IF a Resource_Owner does not respond to a Booking_Request within 24 hours, THEN THE Marketplace SHALL mark the request as "expired", notify the Resource_Consumer that the request has expired, and present options to rebook the same time slot (if still available) or select an alternative resource.
8. WHILE a Booking_Request is in "pending_owner_confirmation" status, THE Marketplace SHALL allow the Resource_Consumer to cancel the request, updating the status to "cancelled_by_consumer" and removing the item from the Resource_Owner's Action Centre.
9. IF a time slot conflict arises between submission and owner confirmation (due to another booking being confirmed for the same window), THEN THE Marketplace SHALL re-validate using `findResourceBookingConflicts` at confirmation time, reject the confirmation, mark the request as "conflict_expired", and notify both the Resource_Consumer and Resource_Owner of the conflict.

### Requirement 6: Resource Owner Profile and Trust Indicators

**User Story:** As a resource consumer, I want to view a resource owner's profile and trust indicators, so that I can assess their reliability before committing to a booking.

#### Acceptance Criteria

1. THE Owner_Profile SHALL be accessible at `/remote-desktop/marketplace/owner/{ownerUid}` and display: firm name, profile image (maximum 2MB, JPEG/PNG/WebP), firm description (up to 1000 characters), platform tenure (months since first resource published), total completed sessions, and a list of up to 50 active Resource_Listings.
2. THE Owner_Profile SHALL display the following Trust_Indicators: verified identity badge (platform identity verification completed), average response time to Booking_Requests (in hours, rounded to one decimal place), booking acceptance rate (percentage of requests confirmed vs total requests received, rounded to the nearest integer), session completion rate (percentage of sessions completed without owner-initiated cancellation, rounded to the nearest integer), and aggregate Rating across all their resources (on a scale of 1.0 to 5.0, displayed to one decimal place).
3. THE Trust_Indicators SHALL be calculated from the most recent 90 days of activity to reflect current behaviour. IF a Resource_Owner has fewer than 5 completed sessions in the 90-day window, THEN THE Owner_Profile SHALL display "New Owner" badge in place of calculated metrics (response time, acceptance rate, completion rate, and aggregate rating).
4. THE Owner_Profile SHALL display the 10 most recent Reviews received across all their resources, sorted by date (newest first), each showing the reviewer display name, rating (1.0–5.0), resource name, and comment text (truncated at 500 characters with an option to expand). IF the Resource_Owner has fewer than 10 reviews, THEN THE Owner_Profile SHALL display all available reviews. IF the Resource_Owner has zero reviews, THEN THE Owner_Profile SHALL display a message indicating no reviews are available yet.
5. WHEN a Resource_Consumer views an Owner_Profile, THE Marketplace SHALL display a "View Resources" action linking to the Catalogue pre-filtered to show only that owner's active listings.
6. THE Owner_Profile SHALL respect privacy: the Resource_Owner's email, phone number, and physical address SHALL NOT be displayed. Communication SHALL occur through the platform booking system only.
7. IF the requested ownerUid does not correspond to an active Resource_Owner account, THEN THE Marketplace SHALL display a message indicating the profile is unavailable and SHALL NOT reveal whether the account exists, is deactivated, or is suspended.

### Requirement 7: Rating and Review System

**User Story:** As a resource consumer, I want to rate and review resources after my session, so that future consumers can make informed booking decisions.

#### Acceptance Criteria

1. WHEN a session completes (status transitions to "completed" in resourceBookingService), THE Marketplace SHALL prompt the Resource_Consumer to submit a Review within 7 days, displaying the prompt in the My Bookings view and as a notification in the Action Centre.
2. THE Review submission form SHALL collect: a numeric Rating (1–5 stars in whole-star increments), an optional text comment (10–500 characters when provided), and up to 3 optional tags selected from a predefined list (e.g., "Fast Connection", "Great Software Setup", "Responsive Owner", "Ran Into Issues").
3. IF a Resource_Consumer attempts to submit more than one Review for the same completed booking, THEN THE Marketplace SHALL reject the submission and display an error message indicating a review already exists for that booking. IF a Resource_Consumer attempts to submit a Review for a booking not in "completed" status, THEN THE Marketplace SHALL reject the submission and display an error message indicating the booking is not eligible for review.
4. WHEN a Review is submitted, THE Marketplace SHALL recalculate the Resource_Listing's aggregate Rating (arithmetic mean of all ratings, displayed to one decimal place) and update the listing card in the Catalogue within 60 seconds. WHEN a Review is successfully submitted, THE Marketplace SHALL display a confirmation message to the Resource_Consumer indicating the review has been recorded.
5. THE Resource_Owner SHALL be able to respond to a Review with a single public reply (up to 500 characters) that is displayed alongside the original Review on the resource detail view and Owner_Profile.
6. IF a Review contains fewer than 10 characters of comment text or is submitted without a comment, THEN THE Marketplace SHALL accept the rating-only submission without requiring comment text.
7. WHEN a Review is submitted more than 7 days but within 90 days after session completion, THE Marketplace SHALL accept the submission but mark it as "late review" in the review metadata without preventing display. IF a Review submission is attempted more than 90 days after session completion, THEN THE Marketplace SHALL reject the submission and display an error message indicating the review window has closed.
8. THE Marketplace SHALL display Reviews in chronological order (newest first) on both the resource detail view and Owner_Profile, paginated at 10 reviews per page, with the reviewer's display name (not full name or email) and a verified badge indicating the review is linked to a real completed session.
9. THE Marketplace SHALL NOT allow a Resource_Consumer to edit or delete a submitted Review after submission. THE Marketplace SHALL NOT allow a Resource_Owner to edit or delete Reviews or their own replies after submission.

### Requirement 8: Resource Owner Listing Management

**User Story:** As a resource owner, I want to publish and manage my resources in the Marketplace, so that consumers can discover and book my available workstations.

#### Acceptance Criteria

1. WHEN a Resource_Owner publishes a resource listing through the existing Remote Desktop module, THE Marketplace SHALL automatically include the listing in the Catalogue if the listing status is "active" and contains at minimum: resource name (1–100 characters), at least one Software_Category, hourly rate, and an availability schedule with at least one available time slot in the next 7 days.
2. THE Resource_Owner SHALL be able to assign between 1 and 5 Software_Category tags to each listing from a platform-managed category list (including but not limited to: Revit, ArchiCAD, SketchUp, AutoCAD, Vectorworks, Rhino, Grasshopper, Lumion, Enscape, Photoshop, Illustrator, InDesign).
3. THE Resource_Owner SHALL be able to set: an hourly rate in ZAR (minimum R50, maximum R5000), a minimum booking duration (1–8 hours), a maximum booking duration (1–24 hours) where the minimum booking duration must be less than or equal to the maximum booking duration, and a Location_Tag from a list of South African cities and regions.
4. THE Resource_Owner SHALL be able to configure a recurring weekly availability schedule by selecting available 1-hour time slots per day of the week (00:00–23:00 SAST) and block specific dates or time ranges up to 90 days in advance for maintenance or unavailability.
5. WHEN a Resource_Owner updates pricing or availability, THE Marketplace SHALL reflect the changes in the Catalogue within 60 seconds for new browsing sessions; existing confirmed bookings SHALL NOT be affected by price changes.
6. THE Resource_Owner SHALL be able to temporarily hide a listing from the Marketplace (status "paused") without deleting it or affecting existing confirmed bookings, and restore visibility by setting status back to "active".
7. THE Resource_Owner SHALL be able to view analytics for each listing: total views, total bookings received, booking conversion rate (bookings / views), average rating, and revenue generated in the current calendar month (1st to current date).
8. IF a Resource_Owner attempts to publish a listing that is missing any required field (resource name, at least one Software_Category, hourly rate, or availability schedule) or contains an invalid value (minimum duration exceeding maximum duration, hourly rate outside R50–R5000), THEN THE Marketplace SHALL reject the publication, retain the listing in draft status, and display an error message indicating which fields are missing or invalid.

### Requirement 9: My Bookings View

**User Story:** As a resource consumer, I want to track all my marketplace bookings in one place, so that I can manage upcoming sessions and review past activity.

#### Acceptance Criteria

1. THE My Bookings view SHALL display all Booking_Requests and confirmed bookings for the authenticated Resource_Consumer, grouped into sections: Upcoming (confirmed, start time in the future), Pending (awaiting owner confirmation), Active (session currently in progress), Completed (session finished), and Cancelled/Declined/Expired. Within each section, entries SHALL be sorted by scheduled start time with the nearest upcoming first and the most recent completed first.
2. EACH booking entry in My Bookings SHALL display: resource name, Resource_Owner firm name, scheduled date and time, duration, estimated or actual cost, booking status, and a "Launch Session" action for confirmed bookings whose start time is within the Booking_Window (defined as the period from 15 minutes before until the end of the scheduled session).
3. WHILE a confirmed booking's start time is within 15 minutes, THE My Bookings view SHALL display the entry with a visually distinct "Session Starting Soon" indicator and a countdown showing minutes and seconds remaining until the session start time.
4. THE My Bookings view SHALL display a cancel action for bookings in Pending or Upcoming (confirmed) status. WHEN a Resource_Consumer requests cancellation more than 2 hours before the booking start time, THE Marketplace SHALL cancel the booking without penalty and update its status to Cancelled. IF a Resource_Consumer requests cancellation within 2 hours of the booking start time, THEN THE Marketplace SHALL display a warning indicating that a late cancellation fee may apply per platform policy and require the consumer to confirm before proceeding.
5. THE My Bookings view SHALL display a "Leave Review" action for completed bookings that have not yet been reviewed and whose session completion date is within 30 days, linking to the Review submission form.
6. THE My Bookings view SHALL support filtering by status (Upcoming, Pending, Active, Completed, Cancelled/Declined/Expired) and by date range (up to 12 months), and sorting by date (newest first or oldest first).
7. IF the authenticated Resource_Consumer has no bookings matching the current filter, THEN THE My Bookings view SHALL display an empty-state message indicating no bookings were found and provide a link to the Marketplace resource catalog.

### Requirement 10: Favourites Management

**User Story:** As a resource consumer, I want to save resources I'm interested in, so that I can quickly find and rebook them later.

#### Acceptance Criteria

1. THE Marketplace SHALL allow a Resource_Consumer to add a Resource_Listing to their Favourites by selecting a "Save to Favourites" action (heart icon) on the listing card or detail view, and SHALL display the heart icon in a filled/active state for listings already saved to Favourites.
2. THE Favourites tab SHALL display all saved Resource_Listings for the authenticated Resource_Consumer as a list sorted by most-recently-added first, showing: resource name, Software_Category, hourly rate, average Rating, session-readiness indicator, and a "Remove" action.
3. WHEN a Resource_Consumer selects the "Remove" action on a favourited Resource_Listing, THE Marketplace SHALL remove the listing from Favourites within 2 seconds and update the heart icon to its inactive state on the corresponding listing card or detail view.
4. WHEN a favourited Resource_Listing is removed from the Catalogue (deleted or permanently hidden by the owner), THE Marketplace SHALL display the listing in Favourites with a "No Longer Available" indicator and disable the booking action.
5. THE Marketplace SHALL persist Favourites per user, limited to a maximum of 50 saved listings per Resource_Consumer.
6. IF a Resource_Consumer attempts to add a Resource_Listing when they already have 50 saved Favourites, THEN THE Marketplace SHALL reject the addition and display an inline message indicating the maximum of 50 favourites has been reached.
7. WHEN a Resource_Consumer has no Favourites saved, THE Favourites tab SHALL display an empty state with guidance text suggesting the user browse the Catalogue and save interesting resources.

### Requirement 11: Platform Integration and Audit

**User Story:** As a platform architect, I want marketplace activity to integrate with the existing platform spine, so that booking and review data flows into Project Passport, Action Centre, and the audit trail.

#### Acceptance Criteria

1. WHEN a Booking_Request is submitted through the Marketplace, THE Marketplace SHALL write the request as a WorkflowEvent to the platform Action Centre for the Resource_Owner with action type "booking_request_received" and link to the booking approval view within 5 seconds of submission.
2. WHEN a booking is confirmed and a projectId is present on the booking record, THE Marketplace SHALL write a ProjectRecord to the Project Passport containing: booking reference, resource name, scheduled time, and Software_Category within 5 seconds of confirmation.
3. THE Marketplace SHALL log the following events to the platform audit trail: booking_requested, booking_confirmed, booking_declined, booking_cancelled, booking_expired, review_submitted, review_replied, listing_published, listing_paused, listing_activated, and favourite_added. Each audit entry SHALL include: event type, actor user ID, target entity ID, entity type, timestamp (ISO 8601), and tenant ID.
4. WHEN a Booking_Request is confirmed, THE Marketplace SHALL emit a notification to the Resource_Consumer via the platform notification system (in-app notification and optionally email based on user preferences) within 10 seconds of confirmation.
5. THE Marketplace SHALL expose marketplace data to the Analytics & Reporting Engine, refreshed at most every 15 minutes, for the following KPIs: marketplace utilisation (total booked hours / total available hours across all listings), average booking lead time (time from request to session start), consumer satisfaction (average marketplace-wide rating), and top-performing resources (by revenue and rating).
6. IF the Marketplace fails to write a WorkflowEvent or ProjectRecord (network error, permission denied), THEN THE Marketplace SHALL queue the write for retry up to 3 attempts at 30-second intervals and log the failure to the audit trail.
7. IF all 3 retry attempts for a WorkflowEvent or ProjectRecord write are exhausted, THEN THE Marketplace SHALL mark the queued item as permanently failed, log a critical-severity entry to the audit trail with the failure reason, and surface a WorkflowEvent to the platform_admin role in the Action Centre indicating the integration failure.

### Requirement 12: Search and Discovery Performance

**User Story:** As a resource consumer, I want the marketplace to load and respond quickly even with many listings, so that my browsing experience is smooth and productive.

#### Acceptance Criteria

1. WHEN the Marketplace Browse tab loads, THE Marketplace SHALL render the initial Catalogue view (first 20 listings) within 3 seconds on a connection of 5 Mbps or greater.
2. THE Marketplace SHALL implement pagination or infinite scroll for the Catalogue, loading additional listings in batches of 20 as the user scrolls or navigates pages.
3. WHEN a filter or sort option is changed, THE Marketplace SHALL update the displayed results within 2 seconds without a full page reload.
4. THE Marketplace SHALL cache the Catalogue index client-side for the duration of the browsing session, refreshing from the server when filters change or every 5 minutes (whichever comes first) to balance freshness with performance.
5. WHEN the text search field is used, THE Marketplace SHALL debounce input by 300 milliseconds before executing the search query to prevent excessive server requests.
6. THE Marketplace SHALL support catalogues of up to 500 active Resource_Listings without degradation of response times beyond the thresholds defined in criteria 1 and 3.
