// ─── Remote Desktop Marketplace — Constants ──────────────────────────────────

import type {
  MarketplaceBookingStatus,
  PriceRangeBracket,
  ReviewTag,
} from './types';

// ─── Software Categories ──────────────────────────────────────────────────────

export const SOFTWARE_CATEGORIES = [
  'Revit',
  'ArchiCAD',
  'SketchUp',
  'AutoCAD',
  'Vectorworks',
  'Rhino',
  'Grasshopper',
  'Lumion',
  'Enscape',
  'Photoshop',
  'Illustrator',
  'InDesign',
] as const;

export type SoftwareCategoryName = (typeof SOFTWARE_CATEGORIES)[number];

// ─── Price Range Brackets ─────────────────────────────────────────────────────

export interface PriceRangeDef {
  bracket: PriceRangeBracket;
  label: string;
  minZar: number;
  maxZar: number | null;
}

export const PRICE_RANGE_BRACKETS: PriceRangeDef[] = [
  { bracket: '0-100', label: 'R0 – R100/hr', minZar: 0, maxZar: 100 },
  { bracket: '100-250', label: 'R100 – R250/hr', minZar: 100, maxZar: 250 },
  { bracket: '250-500', label: 'R250 – R500/hr', minZar: 250, maxZar: 500 },
  { bracket: '500+', label: 'R500+/hr', minZar: 500, maxZar: null },
];

// ─── South African Locations ──────────────────────────────────────────────────

export const SA_LOCATIONS = [
  'Johannesburg',
  'Cape Town',
  'Durban',
  'Pretoria',
  'Port Elizabeth',
  'Bloemfontein',
  'East London',
  'Nelspruit',
  'Polokwane',
  'Kimberley',
  'Pietermaritzburg',
  'Rustenburg',
  'George',
  'Stellenbosch',
  'Sandton',
  'Midrand',
  'Centurion',
  'Umhlanga',
  'Ballito',
  'Gauteng',
  'Western Cape',
  'KwaZulu-Natal',
  'Eastern Cape',
  'Free State',
  'Mpumalanga',
  'Limpopo',
  'North West',
  'Northern Cape',
] as const;

// ─── Review Tags ──────────────────────────────────────────────────────────────

export interface ReviewTagDef {
  value: ReviewTag;
  label: string;
}

export const REVIEW_TAGS: ReviewTagDef[] = [
  { value: 'fast_connection', label: 'Fast Connection' },
  { value: 'great_software_setup', label: 'Great Software Setup' },
  { value: 'responsive_owner', label: 'Responsive Owner' },
  { value: 'ran_into_issues', label: 'Ran Into Issues' },
];

// ─── Booking Status Groups (for My Bookings view) ────────────────────────────

export interface BookingStatusGroup {
  label: string;
  statuses: MarketplaceBookingStatus[];
}

export const BOOKING_STATUS_GROUPS: BookingStatusGroup[] = [
  { label: 'Upcoming', statuses: ['confirmed'] },
  { label: 'Pending', statuses: ['pending_owner_confirmation'] },
  { label: 'Active', statuses: ['active'] },
  { label: 'Completed', statuses: ['completed'] },
  {
    label: 'Cancelled',
    statuses: [
      'cancelled_by_consumer',
      'declined',
      'expired',
      'conflict_expired',
    ],
  },
];

// ─── Access Control ───────────────────────────────────────────────────────────

export const MARKETPLACE_ALLOWED_ROLES = [
  'freelancer',
  'contractor',
  'subcontractor',
  'bep',
  'architect',
  'firm_admin',
  'platform_admin',
] as const;

export type MarketplaceAllowedRole = (typeof MARKETPLACE_ALLOWED_ROLES)[number];

// ─── Availability Configuration ───────────────────────────────────────────────

/** Start hour for bookable slots (06:00 SAST) */
export const AVAILABILITY_HOURS = { start: 6, end: 22 } as const;

/** Number of days shown in the availability calendar */
export const AVAILABILITY_DAYS = 14;

/** Maximum consecutive 1-hour slots a consumer can select */
export const MAX_CONSECUTIVE_SLOTS = 16;

// ─── Favourites ───────────────────────────────────────────────────────────────

/** Maximum number of favourited listings per user */
export const MAX_FAVOURITES = 50;

// ─── Pagination ───────────────────────────────────────────────────────────────

export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 50;
