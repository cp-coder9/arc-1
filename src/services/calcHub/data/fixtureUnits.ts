// SANS 10252-1 Table 4 — Fixture unit values for plumbing design
// Used by wet services calculators for pipe sizing and drainage calculations
// Requirements: 17.1, 17.4

export interface FixtureUnit {
  fixture: string
  coldUnits: number
  hotUnits: number
  totalUnits: number
  drainageUnits: number
  minTrapSize: number // mm
}

export const FIXTURE_UNITS: FixtureUnit[] = [
  { fixture: 'WC (cistern)', coldUnits: 2, hotUnits: 0, totalUnits: 2, drainageUnits: 4, minTrapSize: 100 },
  { fixture: 'WC (flushvalve)', coldUnits: 6, hotUnits: 0, totalUnits: 6, drainageUnits: 4, minTrapSize: 100 },
  { fixture: 'Basin', coldUnits: 1, hotUnits: 1, totalUnits: 1, drainageUnits: 1, minTrapSize: 32 },
  { fixture: 'Bath', coldUnits: 2, hotUnits: 2, totalUnits: 2, drainageUnits: 3, minTrapSize: 40 },
  { fixture: 'Shower', coldUnits: 2, hotUnits: 2, totalUnits: 2, drainageUnits: 2, minTrapSize: 40 },
  { fixture: 'Kitchen sink', coldUnits: 2, hotUnits: 2, totalUnits: 2, drainageUnits: 3, minTrapSize: 40 },
  { fixture: 'Dishwasher', coldUnits: 2, hotUnits: 2, totalUnits: 2, drainageUnits: 3, minTrapSize: 40 },
  { fixture: 'Washing machine', coldUnits: 2, hotUnits: 2, totalUnits: 2, drainageUnits: 3, minTrapSize: 40 },
  { fixture: 'Urinal (cistern)', coldUnits: 2, hotUnits: 0, totalUnits: 2, drainageUnits: 2, minTrapSize: 40 },
  { fixture: 'Urinal (flushvalve)', coldUnits: 4, hotUnits: 0, totalUnits: 4, drainageUnits: 2, minTrapSize: 40 },
  { fixture: 'Laundry tub', coldUnits: 2, hotUnits: 2, totalUnits: 2, drainageUnits: 3, minTrapSize: 40 },
  { fixture: 'Bidet', coldUnits: 1, hotUnits: 1, totalUnits: 1, drainageUnits: 1, minTrapSize: 32 },
  { fixture: 'Drinking fountain', coldUnits: 0.5, hotUnits: 0, totalUnits: 0.5, drainageUnits: 1, minTrapSize: 32 },
  { fixture: 'Cleaners sink', coldUnits: 2, hotUnits: 2, totalUnits: 2, drainageUnits: 3, minTrapSize: 40 },
  { fixture: 'Floor drain', coldUnits: 0, hotUnits: 0, totalUnits: 0, drainageUnits: 2, minTrapSize: 50 },
]

/**
 * Returns the fixture unit data for the given fixture name (case-insensitive match),
 * or undefined if not found.
 */
export function getFixtureUnit(fixture: string): FixtureUnit | undefined {
  const needle = fixture.toLowerCase()
  return FIXTURE_UNITS.find((entry) => entry.fixture.toLowerCase() === needle)
}
