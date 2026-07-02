// SANS 10400-T travel distance limits by building classification
// Used by fire engineering calculators for travel distance compliance checks
// Requirements: 15.1

export interface FireTravelDistance {
  classification: string // Building occupancy classification
  description: string
  maxDistance: number // metres (travel distance to exit)
  sprinklered: boolean
}

export const FIRE_TRAVEL_DISTANCES: FireTravelDistance[] = [
  { classification: 'A1', description: 'Entertainment (theatre, cinema)', maxDistance: 15, sprinklered: false },
  { classification: 'A1', description: 'Entertainment (theatre, cinema) - sprinklered', maxDistance: 30, sprinklered: true },
  { classification: 'A2', description: 'Theatrical (stage)', maxDistance: 15, sprinklered: false },
  { classification: 'A3', description: 'Places of instruction', maxDistance: 25, sprinklered: false },
  { classification: 'A4', description: 'Worship', maxDistance: 25, sprinklered: false },
  { classification: 'B1', description: 'High-risk commercial', maxDistance: 25, sprinklered: false },
  { classification: 'B2', description: 'Moderate-risk commercial', maxDistance: 35, sprinklered: false },
  { classification: 'B3', description: 'Low-risk commercial', maxDistance: 45, sprinklered: false },
  { classification: 'C1', description: 'Exhibition hall', maxDistance: 25, sprinklered: false },
  { classification: 'C2', description: 'Museum', maxDistance: 30, sprinklered: false },
  { classification: 'D1', description: 'High-risk industrial', maxDistance: 25, sprinklered: false },
  { classification: 'D2', description: 'Moderate-risk industrial', maxDistance: 35, sprinklered: false },
  { classification: 'D3', description: 'Low-risk industrial', maxDistance: 45, sprinklered: false },
  { classification: 'D4', description: 'Plant room', maxDistance: 25, sprinklered: false },
  { classification: 'E1', description: 'Place of detention', maxDistance: 15, sprinklered: false },
  { classification: 'E2', description: 'Hospital / institutional', maxDistance: 20, sprinklered: false },
  { classification: 'E3', description: 'Other institutional', maxDistance: 25, sprinklered: false },
  { classification: 'F1', description: 'Large shop (>250m²)', maxDistance: 30, sprinklered: false },
  { classification: 'F2', description: 'Small shop (≤250m²)', maxDistance: 35, sprinklered: false },
  { classification: 'G1', description: 'Office', maxDistance: 45, sprinklered: false },
  { classification: 'H1', description: 'Hotel', maxDistance: 20, sprinklered: false },
  { classification: 'H2', description: 'Dormitory', maxDistance: 20, sprinklered: false },
  { classification: 'H3', description: 'Domestic residence', maxDistance: 25, sprinklered: false },
  { classification: 'H4', description: 'Dwelling house', maxDistance: 30, sprinklered: false },
  { classification: 'J1', description: 'Storage (high-risk)', maxDistance: 25, sprinklered: false },
  { classification: 'J2', description: 'Storage (moderate)', maxDistance: 35, sprinklered: false },
  { classification: 'J3', description: 'Storage (low-risk)', maxDistance: 45, sprinklered: false },
]

/**
 * Returns the travel distance entry for the given building classification
 * and sprinklered status, or undefined if not found.
 */
export function getTravelDistance(
  classification: string,
  sprinklered: boolean
): FireTravelDistance | undefined {
  return FIRE_TRAVEL_DISTANCES.find(
    (entry) => entry.classification === classification && entry.sprinklered === sprinklered
  )
}
