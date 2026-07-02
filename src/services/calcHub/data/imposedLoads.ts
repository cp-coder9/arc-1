// Imposed Loads — SANS 10160-2 Table 1 occupancy load values
// Reference: SANS 10160-2 (South Africa)
// Requirements: 12.4, 18.2

export interface ImposedLoad {
  category: string
  description: string
  load: number // kPa
}

export const IMPOSED_LOADS: ImposedLoad[] = [
  { category: 'A', description: 'Residential - domestic', load: 1.5 },
  { category: 'B1', description: 'Office - general', load: 2.5 },
  { category: 'B2', description: 'Office - filing/storage', load: 5.0 },
  { category: 'C1', description: 'Assembly - seated (fixed)', load: 4.0 },
  { category: 'C2', description: 'Assembly - seated (movable)', load: 4.0 },
  { category: 'C3', description: 'Assembly - no obstacles', load: 5.0 },
  { category: 'C4', description: 'Assembly - physical activity', load: 5.0 },
  { category: 'C5', description: 'Assembly - susceptible to overcrowding', load: 6.0 },
  { category: 'D1', description: 'Retail - general', load: 5.0 },
  { category: 'D2', description: 'Retail - department store', load: 5.0 },
  { category: 'E1', description: 'Storage - general', load: 7.5 },
  { category: 'E2', description: 'Industrial - general', load: 5.0 },
  { category: 'F', description: 'Parking - vehicles ≤ 30kN', load: 2.5 },
  { category: 'G', description: 'Parking - vehicles > 30kN', load: 5.0 },
  { category: 'H', description: 'Roof - not accessible except maintenance', load: 0.5 },
]

/**
 * Look up the imposed load for an occupancy category (case-sensitive match).
 * Returns the ImposedLoad object or undefined if not found.
 */
export function getImposedLoad(category: string): ImposedLoad | undefined {
  return IMPOSED_LOADS.find((l) => l.category === category)
}
