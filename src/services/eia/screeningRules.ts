// ─── NEMA Listed Activity Screening Rules ───────────────────────────────────
// Deterministic rule definitions for GN R.983, GN R.984, GN R.985.
// Each rule evaluates a ScreeningInput against a threshold condition.
// This is a data/rules file — evaluator functions are simple threshold comparisons.

import type { ListingNotice, ScreeningInput } from './eiaTypes';

/**
 * A screening rule that evaluates project attributes against a listed activity threshold.
 */
export interface ScreeningRule {
  /** Which listing notice the rule belongs to */
  listingNotice: ListingNotice;
  /** Activity number reference (e.g. "Activity 27") */
  activityNumber: string;
  /** Description of the listed activity (max 500 chars) */
  description: string;
  /** Which ScreeningInput field this rule primarily checks */
  attribute: keyof ScreeningInput;
  /** Function that returns true if the activity is triggered */
  evaluator: (input: ScreeningInput) => boolean;
  /** Human-readable threshold description */
  thresholdDescription: string;
}

// ─── GN R.983 — Listing Notice 1 (Basic Assessment) ─────────────────────────
// Construction activities, land clearance, watercourse activities

export const listingNotice1Rules: ScreeningRule[] = [
  {
    listingNotice: 'GN_R983',
    activityNumber: 'Activity 27',
    description:
      'The clearance of an area of 1 hectare or more, but less than 20 hectares of indigenous vegetation.',
    attribute: 'developmentFootprint',
    evaluator: (input) =>
      input.developmentFootprint >= 10_000 && input.developmentFootprint < 200_000,
    thresholdDescription: 'development footprint ≥ 10,000 m² and < 200,000 m²',
  },
  {
    listingNotice: 'GN_R983',
    activityNumber: 'Activity 19',
    description:
      'The infilling or depositing of any material of more than 10 cubic metres into, or the dredging, excavation, removal or moving of soil, sand, shells, shell grit, pebbles or rock of more than 10 cubic metres from a watercourse.',
    attribute: 'proximityWatercourse',
    evaluator: (input) => input.proximityWatercourse <= 32,
    thresholdDescription: 'proximity to watercourse ≤ 32 m',
  },
  {
    listingNotice: 'GN_R983',
    activityNumber: 'Activity 12',
    description:
      'The construction of a bridge exceeding 100 square metres in size, or infrastructure or structures with a physical footprint of 100 square metres or more within a watercourse or within 32 metres of a watercourse.',
    attribute: 'proximityWatercourse',
    evaluator: (input) =>
      input.proximityWatercourse <= 32 && input.developmentFootprint >= 100,
    thresholdDescription:
      'development footprint ≥ 100 m² within 32 m of watercourse',
  },
  {
    listingNotice: 'GN_R983',
    activityNumber: 'Activity 28',
    description:
      'Residential, mixed use, retail, commercial, industrial or institutional developments where the total land to be used is 1 hectare or more but less than 20 hectares.',
    attribute: 'totalSiteArea',
    evaluator: (input) =>
      input.totalSiteArea >= 10_000 && input.totalSiteArea < 200_000,
    thresholdDescription: 'total site area ≥ 10,000 m² and < 200,000 m²',
  },
  {
    listingNotice: 'GN_R983',
    activityNumber: 'Activity 48',
    description:
      'The expansion of facilities for the storage or handling of a dangerous good, where the capacity will be expanded by more than 80 cubic metres.',
    attribute: 'developmentFootprint',
    evaluator: (input) =>
      input.activityType === 'dangerous_goods_storage' &&
      input.developmentFootprint >= 80,
    thresholdDescription:
      'dangerous goods storage expansion with footprint ≥ 80 m²',
  },
  {
    listingNotice: 'GN_R983',
    activityNumber: 'Activity 9',
    description:
      'The construction of facilities or infrastructure for the generation of electricity from a renewable resource where the electricity output is 10 megawatts or more but less than 20 megawatts.',
    attribute: 'developmentFootprint',
    evaluator: (input) =>
      input.activityType === 'renewable_energy' &&
      input.developmentFootprint >= 500,
    thresholdDescription:
      'renewable energy facility with development footprint ≥ 500 m²',
  },
  {
    listingNotice: 'GN_R983',
    activityNumber: 'Activity 30',
    description:
      'Any process or activity identified in terms of section 53(1) of the National Environmental Management: Integrated Coastal Management Act involving the removal or disturbance of coastal public property exceeding 50 cubic metres.',
    attribute: 'proximityCoastal',
    evaluator: (input) =>
      input.proximityCoastal <= 100 && input.developmentFootprint >= 50,
    thresholdDescription:
      'development footprint ≥ 50 m² within 100 m of coastal area',
  },
];

// ─── GN R.984 — Listing Notice 2 (Full Scoping & EIA) ───────────────────────
// Large-scale development, industrial activities, waste management

export const listingNotice2Rules: ScreeningRule[] = [
  {
    listingNotice: 'GN_R984',
    activityNumber: 'Activity 15',
    description:
      'The clearance of an area of 20 hectares or more of indigenous vegetation.',
    attribute: 'developmentFootprint',
    evaluator: (input) => input.developmentFootprint >= 200_000,
    thresholdDescription: 'development footprint ≥ 200,000 m² (20 ha)',
  },
  {
    listingNotice: 'GN_R984',
    activityNumber: 'Activity 16',
    description:
      'The development of a dam where the highest wall of the dam is 5 metres or higher, or where the high-water mark of the dam covers an area of 10 hectares or more.',
    attribute: 'totalSiteArea',
    evaluator: (input) =>
      input.activityType === 'dam_construction' &&
      input.totalSiteArea >= 100_000,
    thresholdDescription:
      'dam construction with total site area ≥ 100,000 m² (10 ha)',
  },
  {
    listingNotice: 'GN_R984',
    activityNumber: 'Activity 6',
    description:
      'The construction of facilities or infrastructure for any process or activity which requires a permit or licence in terms of national or provincial legislation governing the generation or release of emissions, pollution or effluents.',
    attribute: 'developmentFootprint',
    evaluator: (input) =>
      input.activityType === 'industrial' && input.developmentFootprint >= 1_000,
    thresholdDescription:
      'industrial facility with development footprint ≥ 1,000 m²',
  },
  {
    listingNotice: 'GN_R984',
    activityNumber: 'Activity 5',
    description:
      'The construction of facilities or infrastructure for the generation of electricity from a non-renewable resource where the electricity output is 20 megawatts or more.',
    attribute: 'developmentFootprint',
    evaluator: (input) =>
      input.activityType === 'power_generation' &&
      input.developmentFootprint >= 5_000,
    thresholdDescription:
      'power generation facility with development footprint ≥ 5,000 m²',
  },
  {
    listingNotice: 'GN_R984',
    activityNumber: 'Activity 14',
    description:
      'The development of facilities or infrastructure for the storage, or for the storage and handling of a dangerous good, where such storage occurs in containers with a combined capacity of more than 500 cubic metres.',
    attribute: 'developmentFootprint',
    evaluator: (input) =>
      input.activityType === 'dangerous_goods_storage' &&
      input.developmentFootprint >= 500,
    thresholdDescription:
      'dangerous goods storage with development footprint ≥ 500 m²',
  },
  {
    listingNotice: 'GN_R984',
    activityNumber: 'Activity 4',
    description:
      'The development and related operation of facilities or infrastructure for the recycling, re-use, handling, temporary storage or treatment of general waste with a throughput capacity of 500 tonnes or more per day.',
    attribute: 'developmentFootprint',
    evaluator: (input) =>
      input.activityType === 'waste_management' &&
      input.developmentFootprint >= 2_000,
    thresholdDescription:
      'waste management facility with development footprint ≥ 2,000 m²',
  },
  {
    listingNotice: 'GN_R984',
    activityNumber: 'Activity 17',
    description:
      'Any activity including the operation of that activity which requires a mining right or exploration right as contemplated in section 22 of the Mineral and Petroleum Resources Development Act.',
    attribute: 'totalSiteArea',
    evaluator: (input) =>
      input.activityType === 'mining' && input.totalSiteArea >= 1_000,
    thresholdDescription: 'mining activity with total site area ≥ 1,000 m²',
  },
  {
    listingNotice: 'GN_R984',
    activityNumber: 'Activity 19',
    description:
      'The construction of a road that is wider than 8 metres or that has a reserve wider than 13.5 metres, excluding upgrading of existing roads within existing reserves.',
    attribute: 'developmentFootprint',
    evaluator: (input) =>
      input.activityType === 'road_construction' &&
      input.developmentFootprint >= 3_000,
    thresholdDescription:
      'road construction with development footprint ≥ 3,000 m²',
  },
];

// ─── GN R.985 — Listing Notice 3 (Basic Assessment in Sensitive Areas) ──────
// Activities in sensitive geographic areas: coastal, protected areas, watercourses

export const listingNotice3Rules: ScreeningRule[] = [
  {
    listingNotice: 'GN_R985',
    activityNumber: 'Activity 12',
    description:
      'The clearance of an area of 300 square metres or more of indigenous vegetation within a listed geographic area.',
    attribute: 'developmentFootprint',
    evaluator: (input) =>
      input.withinListedGeographicArea && input.developmentFootprint >= 300,
    thresholdDescription:
      'development footprint ≥ 300 m² in a listed geographic area',
  },
  {
    listingNotice: 'GN_R985',
    activityNumber: 'Activity 14',
    description:
      'The development of structures or infrastructure with a development footprint of 10 square metres or more within a watercourse, or within 32 metres of a watercourse in a listed geographic area.',
    attribute: 'proximityWatercourse',
    evaluator: (input) =>
      input.withinListedGeographicArea &&
      input.proximityWatercourse <= 32 &&
      input.developmentFootprint >= 10,
    thresholdDescription:
      'footprint ≥ 10 m² within 32 m of watercourse in listed area',
  },
  {
    listingNotice: 'GN_R985',
    activityNumber: 'Activity 18',
    description:
      'The widening of a road by more than 4 metres or the lengthening of a road by more than 1 kilometre within a listed geographic area.',
    attribute: 'developmentFootprint',
    evaluator: (input) =>
      input.withinListedGeographicArea &&
      input.activityType === 'road_construction' &&
      input.developmentFootprint >= 500,
    thresholdDescription:
      'road construction footprint ≥ 500 m² in listed geographic area',
  },
  {
    listingNotice: 'GN_R985',
    activityNumber: 'Activity 23',
    description:
      'The development of a building exceeding 10 square metres in size within the coastal public property or within 100 metres of the high-water mark of the sea, in a listed geographic area.',
    attribute: 'proximityCoastal',
    evaluator: (input) =>
      input.withinListedGeographicArea &&
      input.proximityCoastal <= 100 &&
      input.developmentFootprint >= 10,
    thresholdDescription:
      'footprint ≥ 10 m² within 100 m of coast in listed area',
  },
  {
    listingNotice: 'GN_R985',
    activityNumber: 'Activity 4',
    description:
      'The development of a road wider than 4 metres with a reserve less than 13.5 metres within a protected area, a site identified in terms of NEMBA, or a National Park.',
    attribute: 'proximityProtectedArea',
    evaluator: (input) =>
      input.proximityProtectedArea === 0 &&
      input.activityType === 'road_construction' &&
      input.developmentFootprint >= 100,
    thresholdDescription:
      'road footprint ≥ 100 m² inside a protected area (proximity 0 m)',
  },
  {
    listingNotice: 'GN_R985',
    activityNumber: 'Activity 10',
    description:
      'The development of facilities or infrastructure for the storage or handling of a dangerous good, within a listed geographic area or within 200 metres of a watercourse.',
    attribute: 'proximityWatercourse',
    evaluator: (input) =>
      input.activityType === 'dangerous_goods_storage' &&
      (input.withinListedGeographicArea || input.proximityWatercourse <= 200),
    thresholdDescription:
      'dangerous goods storage within listed area or within 200 m of watercourse',
  },
  {
    listingNotice: 'GN_R985',
    activityNumber: 'Activity 2',
    description:
      'The construction of reservoirs for bulk water supply with a capacity of more than 250 cubic metres within a watercourse or within 32 metres of a watercourse in a listed geographic area.',
    attribute: 'proximityWatercourse',
    evaluator: (input) =>
      input.withinListedGeographicArea &&
      input.proximityWatercourse <= 32 &&
      input.activityType === 'water_supply' &&
      input.developmentFootprint >= 250,
    thresholdDescription:
      'water supply reservoir ≥ 250 m² within 32 m of watercourse in listed area',
  },
];

// ─── All Rules Combined ──────────────────────────────────────────────────────

/** All screening rules across all three listing notices. */
export const allScreeningRules: ScreeningRule[] = [
  ...listingNotice1Rules,
  ...listingNotice2Rules,
  ...listingNotice3Rules,
];
